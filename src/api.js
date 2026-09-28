export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_DRAFT_CHARS = 100000;
export const REQUEST_TIMEOUT_MS = 90000;

export class EnhanceError extends Error {
  constructor(code, message) { super(message); this.name = 'EnhanceError'; this.code = code; }
}
const fail = (code, message) => { throw new EnhanceError(code, message); };

export function normalizeBase(value) {
  let url;
  try { url = new URL(value.trim()); }
  catch { fail('CONFIG_URL', 'Base URL 无效，请填写完整的 http:// 或 https:// 地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail('CONFIG_URL', 'Base URL 只支持 HTTP/HTTPS，不能包含账号密码、查询参数或片段。');
  }
  // Remote HTTP is intentionally allowed; the UI warns without blocking it.
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|responses|models)$/i, '');
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/v1';
  return url.href.replace(/\/+$/, '');
}

export function validateSettings(raw) {
  if (!raw || !['harness', 'custom'].includes(raw.source) || !['concise', 'detailed', 'creative'].includes(raw.mode)
    || !['chat', 'responses'].includes(raw.protocol) || typeof raw.baseURL !== 'string' || typeof raw.model !== 'string'
    || typeof raw.omitStore !== 'boolean' || raw.model.length > 256 || raw.baseURL.length > 2048) {
    fail('CONFIG', '增强设置无效，请重新保存。');
  }
  const baseURL = raw.baseURL.trim() ? normalizeBase(raw.baseURL) : '';
  const model = raw.model.trim();
  if (raw.source === 'custom' && (!baseURL || !model)) fail('CONFIG', '自定义模式需要 Base URL 和模型名称。');
  return { source: raw.source, mode: raw.mode, protocol: raw.protocol, baseURL, model, omitStore: raw.omitStore };
}

export function validateText(text) {
  if (typeof text !== 'string' || !text.trim()) fail('EMPTY', '模型没有返回可用正文，原草稿已保留。');
  if (text.length > MAX_DRAFT_CHARS * 2) fail('TOO_LARGE', '增强结果过长，未覆盖草稿。');
  return text; // Never trim or silently truncate code/whitespace.
}

function assertComplete(data) {
  if (data?.error || ['failed', 'incomplete', 'error', 'cancelled'].includes(data?.status)) {
    fail('INCOMPLETE', 'API 返回错误或不完整结果，原草稿已保留。');
  }
}
function chatText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(p => p.type === 'text').map(p => p.text ?? '').join('');
  return '';
}
function responseText(data) {
  const output = data.output ?? [];
  for (const item of output) {
    assertComplete(item);
    if (!['message', 'reasoning'].includes(item.type)) fail('INCOMPLETE', 'Responses 返回了工具调用或非正文输出，原草稿已保留。');
    if (item.type === 'message' && ((item.status && item.status !== 'completed') || item.content?.some(p => p.type === 'refusal'))) {
      fail('INCOMPLETE', 'Responses 正文未完成或被拒绝，原草稿已保留。');
    }
  }
  if (typeof data.output_text === 'string') return data.output_text;
  return output.filter(item => item.type === 'message').map(item =>
    (item.content ?? []).filter(p => p.type === 'output_text').map(p => p.text ?? '').join('')).join('');
}
export function parseGenerationJSON(data, protocol) {
  assertComplete(data);
  if (protocol === 'chat') {
    const choice = data?.choices?.find(c => c.index === 0) ?? data?.choices?.[0];
    if (choice?.finish_reason !== 'stop' || choice.message?.tool_calls?.length) fail('INCOMPLETE', 'Chat 响应未正常结束（可能达到长度限制），原草稿已保留。');
    return validateText(chatText(choice.message?.content));
  }
  if (data?.status !== 'completed') fail('INCOMPLETE', 'Responses 响应未完成，原草稿已保留。');
  return validateText(responseText(data));
}

export function createEventParser(protocol) {
  let pending = '', event = '', dataLines = [], text = '', complete = false;
  const parts = new Map();
  function dispatch() {
    const data = dataLines.join('\n');
    const kind = event;
    dataLines = []; event = '';
    if (!data.trim()) return;
    if (data.trim() === '[DONE]') {
      if (!complete) fail('INCOMPLETE', '流已结束但缺少正常完成标记，原草稿已保留。');
      return;
    }
    let item;
    try { item = JSON.parse(data); }
    catch { fail('BAD_RESPONSE', 'API 返回无法解析的流数据，原草稿已保留。'); }
    assertComplete(item);
    if (protocol === 'chat') {
      const choice = item.choices?.find(c => c.index === 0) ?? item.choices?.[0];
      if (!choice) return; // usage-only event
      if (choice.delta?.tool_calls?.length) fail('INCOMPLETE', '增强接口返回了工具调用，而不是提示词正文。');
      text += chatText(choice.delta?.content);
      if (choice.finish_reason != null) {
        if (choice.finish_reason !== 'stop') fail('INCOMPLETE', '生成被截断或拒绝，原草稿已保留。');
        complete = true;
      }
    } else {
      const type = item.type ?? kind;
      if (['error', 'response.failed', 'response.incomplete', 'response.cancelled'].includes(type)) fail('INCOMPLETE', 'Responses 流生成失败或不完整，原草稿已保留。');
      const key = `${item.output_index ?? 0}:${item.content_index ?? 0}`;
      if (type === 'response.output_text.delta') parts.set(key, (parts.get(key) ?? '') + (item.delta ?? ''));
      if (type === 'response.output_text.done') parts.set(key, item.text ?? parts.get(key) ?? '');
      if ((type === 'response.output_item.added' || type === 'response.output_item.done')
        && item.item && !['message', 'reasoning'].includes(item.item.type)) {
        fail('INCOMPLETE', 'Responses 返回了工具调用，而不是提示词正文。');
      }
      if (type === 'response.completed') {
        if (item.response?.status !== 'completed') fail('INCOMPLETE', 'Responses 完成事件缺少有效完成状态，原草稿已保留。');
        assertComplete(item.response);
        const final = responseText(item.response);
        text = final || [...parts].sort((a, b) => {
          const [ai, ac] = a[0].split(':').map(Number), [bi, bc] = b[0].split(':').map(Number);
          return ai - bi || ac - bc;
        }).map(p => p[1]).join('');
        complete = true;
      }
    }
  }
  function line(value) {
    if (!value) { dispatch(); return; }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    const val = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = val;
    if (field === 'data') dataLines.push(val);
  }
  return {
    get complete() { return complete; },
    push(chunk, final = false) {
      pending += chunk;
      while (!complete) {
        const index = pending.search(/[\r\n]/);
        if (index < 0 || (!final && pending[index] === '\r' && index === pending.length - 1)) break;
        const width = pending[index] === '\r' && pending[index + 1] === '\n' ? 2 : 1;
        const value = pending.slice(0, index); pending = pending.slice(index + width); line(value);
      }
      if (final && !complete) { if (pending) line(pending); pending = ''; dispatch(); }
    },
    result() {
      if (!complete) fail('INCOMPLETE', '流意外中断，未用部分结果覆盖草稿。');
      return validateText(text);
    },
  };
}

export async function readPayload(response, protocol) {
  if (!response.body) fail('EMPTY', 'API 响应没有正文。');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, prefix = '', parser;
  const declaredStream = (response.headers.get('content-type') ?? '').includes('text/event-stream');
  try {
    while (true) {
      const { value, done } = await reader.read();
      size += value?.byteLength ?? 0;
      if (size > MAX_PAYLOAD_BYTES) fail('TOO_LARGE', 'API 响应超过 2 MiB，原草稿已保留。');
      const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (parser) parser.push(chunk, done);
      else {
        prefix += chunk;
        if (declaredStream || /^\s*(?:data:|event:|:)/.test(prefix)) {
          parser = createEventParser(protocol); parser.push(prefix, done); prefix = '';
        }
      }
      if (parser?.complete) return parser.result();
      if (done) break;
    }
    if (parser) return parser.result();
    let json;
    try { json = JSON.parse(prefix); }
    catch { fail('BAD_RESPONSE', 'API 未返回有效的 JSON 或 SSE；请检查 Base URL 和协议。'); }
    return parseGenerationJSON(json, protocol);
  } finally {
    // Cancels a still-open SSE socket after its terminal event, or on parse failure.
    await reader.cancel();
    reader.releaseLock();
  }
}

export function requestBody(settings, prompts) {
  if (settings.protocol === 'chat') return {
    model: settings.model, stream: true,
    messages: [{ role: 'system', content: prompts.system }, { role: 'user', content: prompts.user }],
  };
  const omitStore = settings.omitStore || /^(?:[^/]+\/)?glm-5\.2(?:$|[-:])/i.test(settings.model);
  return { model: settings.model, instructions: prompts.system, input: prompts.user, stream: true, ...omitStore ? {} : { store: false } };
}

export async function customRequest(settings, apiKey, prompts, signal, doFetch = fetch) {
  const endpoint = settings.protocol === 'chat' ? 'chat/completions' : 'responses';
  const response = await doFetch(`${settings.baseURL}/${endpoint}`, {
    method: 'POST', signal, redirect: 'error',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json', ...apiKey ? { authorization: `Bearer ${apiKey}` } : {} },
    body: JSON.stringify(requestBody(settings, prompts)),
  });
  if (!response.ok) {
    await response.body?.cancel();
    fail(`HTTP_${response.status}`, `增强 API 返回 HTTP ${response.status}。请检查地址、密钥、模型及额度；未自动重试。`);
  }
  return readPayload(response, settings.protocol);
}

export async function testCustom(settings, apiKey, signal, doFetch = fetch) {
  const response = await doFetch(`${settings.baseURL}/models`, {
    signal, redirect: 'error', headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
  });
  await response.body?.cancel();
  if (!response.ok) fail(`HTTP_${response.status}`, `/models 返回 HTTP ${response.status}。部分服务不提供模型列表，但生成接口可能仍可用。`);
  return '已连通 /models（HTTP 200）；这不代表生成、指定模型或协议一定可用。';
}
