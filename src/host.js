import { BlockAssembler } from '@deepseek-ai/dsh-llm';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { DEFAULTS } from './draft.js';
import { collectRecentHistory } from './history.js';
import { buildPrompts } from './prompts.js';
import { EnhanceError, MAX_DRAFT_CHARS, MAX_PAYLOAD_BYTES, REQUEST_TIMEOUT_MS,
  customRequest, testCustom, validateSettings, validateText } from './api.js';

export const name = 'wb-enhance-prompt';
export const inject = ['connection', 'credentials', 'llm', 'sessionQuery', 'sessionController', 'agentDefaultModel'];
const SETTINGS_KEY = credentialKey('wb-enhance-prompt', 'settings');

async function storedSettings(ctx) {
  const record = await ctx.credentials.readRecord(SETTINGS_KEY);
  if (!record) return { settings: { ...DEFAULTS }, apiKey: '' };
  if (record.kind !== 'grant' || typeof record.payload?.apiKey !== 'string') throw new EnhanceError('CONFIG', '保存的增强配置无效，请重新设置。');
  return { settings: validateSettings(record.payload.settings), apiKey: record.payload.apiKey };
}

export async function currentRoute(ctx, sessionId, signal) {
  return (await observeEnhanceSession(ctx, sessionId, signal)).route;
}

export async function observeEnhanceSession(ctx, sessionId, signal) {
  const fallback = { route: ctx.agentDefaultModel.currentSelection(), history: [] };
  if (!sessionId) return fallback;
  const observation = await ctx.sessionQuery.observeSession(sessionId, { signal });
  try {
    return {
      route: observation.projections?.values.modelSelection?.next ?? fallback.route,
      history: collectRecentHistory(observation.events),
    };
  } finally { observation[Symbol.dispose](); }
}

export async function nativeRequest(ctx, route, prompts, signal) {
  const call = await ctx.llm.prepareCall({ provider: route.provider, model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) }, signal);
  const assembled = new BlockAssembler();
  let finish, size = 0;
  for await (const chunk of call.stream({ ...call.config, system: prompts.system, signal,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompts.user }] }],
  })) {
    signal.throwIfAborted();
    size += (chunk.text?.length ?? 0) + (chunk.block?.text?.length ?? 0);
    if (size > MAX_PAYLOAD_BYTES) throw new EnhanceError('TOO_LARGE', '模型响应过长，未覆盖原草稿。');
    if (chunk.type === 'finish') finish = chunk.reason;
    assembled.push(chunk);
  }
  signal.throwIfAborted();
  if (finish?.kind !== 'stop') {
    const explanations = { AUTH: '模型认证失败，请检查 Harness 模型密钥。', MISSING_CREDENTIAL: '当前 Harness 模型尚未配置凭据。',
      RATE_LIMIT: '模型接口限流，请稍后手动重试。', CONTEXT_WINDOW_EXCEEDED: '草稿超过模型上下文限制。',
      NO_ADAPTER: '当前模型提供商未启用，请检查 Harness 模型设置。' };
    throw new EnhanceError('MODEL_FAILED', explanations[finish?.failure?.code] ?? '模型未正常完成（中断、错误或长度限制），原草稿已保留。');
  }
  const blocks = assembled.blocks();
  if (blocks.some(b => b.type === 'tool-call')) throw new EnhanceError('INCOMPLETE', '模型返回了工具调用，而不是增强正文。');
  return validateText(blocks.filter(b => b.type === 'text').map(b => b.text).join(''));
}

function validateRequest(payload) {
  if (!payload || typeof payload !== 'object' || !['settings', 'save', 'test', 'enhance'].includes(payload.action)) {
    throw new EnhanceError('BAD_REQUEST', '无效的增强请求。');
  }
  if (payload.sessionId !== undefined && (typeof payload.sessionId !== 'string' || payload.sessionId.length > 160)) {
    throw new EnhanceError('BAD_REQUEST', '会话标识无效。');
  }
  if (payload.action === 'enhance' && (typeof payload.draft !== 'string' || !payload.draft.trim() || payload.draft.length > MAX_DRAFT_CHARS)) {
    throw new EnhanceError('DRAFT', `请输入待增强的草稿（最多 ${MAX_DRAFT_CHARS} 字符）。`);
  }
  return payload;
}

export function apply(ctx) {
  const life = new AbortController();
  const diagnostics = [];
  ctx.effect(() => () => life.abort(), 'wb-enhance: cancel active requests on unload');
  const remember = entry => { diagnostics.unshift(entry); diagnostics.splice(8); };
  const publicSettings = async () => {
    const { settings, apiKey } = await storedSettings(ctx);
    return { settings, hasApiKey: Boolean(apiKey), diagnostics: [...diagnostics], version: '2.1.0' };
  };

  // An exact /api route inherits Harness authentication, Host/Origin admission and request middleware.
  ctx.connection.fetch.register({
    path: '/api/wb-enhance-prompt', methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      const signal = AbortSignal.any([request.signal, life.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
      const started = Date.now();
      let payload, settings;
      try {
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          throw new EnhanceError('BAD_REQUEST', '增强接口仅接受 JSON。');
        }
        let raw;
        try { raw = await request.json(); }
        catch { throw new EnhanceError('BAD_REQUEST', '请求不是有效 JSON。'); }
        payload = validateRequest(raw);
        signal.throwIfAborted();
        if (payload.action === 'settings') return Response.json({ ok: true, value: await publicSettings() });
        if (payload.action === 'save') {
          const next = validateSettings(payload.settings);
          if (!['keep', 'set', 'clear'].includes(payload.keyAction) || (payload.keyAction === 'set'
            && (typeof payload.apiKey !== 'string' || !payload.apiKey.trim() || payload.apiKey.length > 16384 || /[\r\n]/.test(payload.apiKey)))) {
            throw new EnhanceError('CONFIG_KEY', 'API Key 无效，请重新填写或选择清除。');
          }
          await ctx.credentials.modifyRecord(SETTINGS_KEY, previous => {
            const old = previous?.kind === 'grant' ? previous.payload : undefined;
            // A saved secret never silently follows a changed destination.
            const keep = payload.keyAction === 'keep' && old?.settings?.baseURL === next.baseURL;
            const apiKey = payload.keyAction === 'set' ? payload.apiKey.trim() : keep ? old.apiKey : '';
            return { kind: 'grant', payload: { settings: next, apiKey } };
          });
          return Response.json({ ok: true, value: await publicSettings() });
        }
        const saved = await storedSettings(ctx);
        settings = saved.settings;
        const observed = payload.sessionId ? await observeEnhanceSession(ctx, payload.sessionId, signal)
          : { route: ctx.agentDefaultModel.currentSelection(), history: [] };
        const route = settings.source === 'harness' ? observed.route : undefined;
        if (payload.action === 'test') {
          let message;
          if (settings.source === 'custom') message = await testCustom(settings, saved.apiKey, signal);
          else {
            await ctx.llm.resolveModelInfo(route.provider, route.model, signal);
            message = `已识别当前模型 ${route.provider} / ${route.model}；仅检查模型配置，未发送生成请求。`;
          }
          remember({ time: new Date().toISOString(), action: 'test', source: settings.source, status: 'ok', elapsedMs: Date.now() - started });
          return Response.json({ ok: true, value: { message, diagnostics: [...diagnostics] } });
        }
        const history = payload.sessionId ? observed.history : [];
        const prompts = buildPrompts(payload.draft, settings.mode, history);
        const text = settings.source === 'custom'
          ? await customRequest(settings, saved.apiKey, prompts, signal)
          : await nativeRequest(ctx, route, prompts, signal);
        signal.throwIfAborted();
        remember({ time: new Date().toISOString(), action: 'enhance', source: settings.source, mode: settings.mode,
          status: 'ok', elapsedMs: Date.now() - started, inputChars: payload.draft.length, outputChars: text.length,
          historyTurns: history.length });
        return Response.json({ ok: true, value: { text, mode: settings.mode,
          model: route ? `${route.provider} / ${route.model}` : settings.model, diagnostics: [...diagnostics] } });
      } catch (error) {
        const timeout = signal.aborted && signal.reason?.name === 'TimeoutError';
        const code = signal.aborted ? timeout ? 'TIMEOUT' : 'ABORTED' : error instanceof EnhanceError ? error.code : 'INTERNAL';
        const message = signal.aborted ? timeout ? '增强超过 90 秒，已停止，原草稿已保留。' : '增强已停止，原草稿已保留。'
          : error instanceof EnhanceError ? error.message : '增强请求失败，请检查模型/网络配置。原草稿已保留，未自动重试。';
        if (payload?.action === 'enhance' || payload?.action === 'test') remember({ time: new Date().toISOString(),
          action: payload.action, source: settings?.source, status: code, elapsedMs: Date.now() - started });
        // No upstream body, draft, result, key or exception text enters diagnostics.
        return Response.json({ ok: false, error: { code, message }, diagnostics: [...diagnostics] });
      }
    },
  });
}
