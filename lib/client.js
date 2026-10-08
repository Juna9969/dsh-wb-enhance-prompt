// Built by scripts/build.mjs. Native Harness lazy-CJS module; no runtime dependencies bundled.
window.__ModuleLoader__.load({
  id: "dsh-wb-enhance-prompt",
  factory: (require) => {
    const module = { exports: {} };
const React = require('react');
const { Modal, Button, Toast } = require('@deepseek-ai/dsh-client-ui-primitives');
const DEFAULTS = Object.freeze({
  source: 'harness', mode: 'concise', baseURL: '', model: '', protocol: 'chat', omitStore: false,
});

const MODES = Object.freeze({
  concise: { label: '精炼增强', hint: '澄清目标、去重；约 800 字软目标，不牺牲原始信息。' },
  detailed: { label: '深度增强', hint: '在原范围内补足输入、边界、交付物与验收，不擅自扩需求。' },
  creative: { label: '创意增强', hint: '发展开放式想法；少量可选方向与必做要求明确分开。' },
});

function captureDraft(input) {
  return { draft: input.draft, draftRev: input.draftRev, attachmentIds: [...input.attachmentIds] };
}

function draftConflict(before, now, { active = true, composing = false } = {}) {
  if (!active) return '输入框或会话已切换';
  if (composing) return '正在使用输入法';
  if (now.phase !== 'plain') return '输入框正在处理命令或发送';
  if (now.occurrences.length) return '草稿含原生引用标签，不能按纯文本覆盖';
  if (now.draftRev !== before.draftRev || now.draft !== before.draft) return '草稿已被编辑';
  if (now.attachmentIds.length !== before.attachmentIds.length || now.attachmentIds.some((id, i) => id !== before.attachmentIds[i])) return '附件已变化';
  return '';
}

function protectedContentIssue(before, after) {
  // These are evidence in a prompt, not code for the enhancer to execute or repair.
  const literals = [], fence = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  let outside = '', cursor = 0, opening;
  while ((opening = fence.exec(before))) {
    const close = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}[ \\t\\r]*(?=\\n|$)`, 'gm');
    close.lastIndex = fence.lastIndex;
    const closing = close.exec(before);
    if (!closing) break;
    const end = closing.index + closing[0].length;
    literals.push(before.slice(opening.index, end));
    outside += before.slice(cursor, opening.index) + '\n';
    cursor = fence.lastIndex = end;
  }
  outside += before.slice(cursor);
  literals.push(...(outside.match(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g) ?? []));
  if (literals.some(part => !after.includes(part))) return '模型改动了原文代码块或内联代码';
  // Harness deliberately strips these private reference markers on every paste.
  if (/[\uE100-\uE11D\uFFFC]/u.test(after)) return '结果含输入框不支持的引用占位符';
  return '';
}

const css = ".wbep-control{display:inline-flex;align-items:center;flex:none;gap:0;height:28px;white-space:nowrap;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-sm,6px)}\n.wbep-trigger,.wbep-mini{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:none;height:28px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:inherit;font:inherit;font-size:13px;line-height:20px;cursor:pointer;padding:0 6px}\n.wbep-trigger:hover:not(:disabled),.wbep-mini:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}\n.wbep-trigger:focus-visible,.wbep-mini:focus-visible,.wbep-tabs button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}\n.wbep-mini{padding:0 4px;min-width:20px;font-size:15px}\n.wbep-control button:disabled{opacity:.45;cursor:default}\n.wbep-working{color:var(--dsw-alias-state-business-primary)}\n.wbep-label{display:var(--dsh-composer-model-text-display,block)}\n.wbep-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}\n.wbep-dialog{width:min(660px,calc(100vw - 32px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 40px);font-size:13px;line-height:1.6}\n.wbep-tabs{display:flex;gap:6px;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:10px;margin-bottom:16px}\n.wbep-tabs button{padding:5px 12px;border:0;border-radius:6px;cursor:pointer;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit}\n.wbep-tabs .wbep-selected{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}\n.wbep-settings,.wbep-result{display:flex;flex-direction:column;gap:14px}\n.wbep-field{display:flex;flex-direction:column;gap:6px;text-align:left;min-width:0}\n.wbep-field>span{font-weight:550;color:var(--dsw-alias-label-primary)}\n.wbep-field input,.wbep-field select,.wbep-field textarea,.wbep-result details textarea{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;outline:none}\n.wbep-field select option{background:var(--dsw-alias-surface-l1,#242424);color:var(--dsw-alias-label-primary,#eee)}\n.wbep-field input:focus,.wbep-field select:focus,.wbep-field textarea:focus,.wbep-result textarea:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary)}\n.wbep-field textarea,.wbep-result textarea{font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.7;resize:vertical;min-height:100px;white-space:pre-wrap;tab-size:4}\n.wbep-field small,.wbep-settings>small,.wbep-result>small{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}\n.wbep-check{display:flex;gap:8px;align-items:flex-start;color:var(--dsw-alias-label-secondary);cursor:pointer}\n.wbep-check input{margin-top:4px;accent-color:var(--dsw-alias-state-business-primary)}\n.wbep-privacy{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}\n.wbep-warning{margin:0;border-left:3px solid #bd8731;padding:8px 10px;background:color-mix(in srgb,#bd8731 10%,transparent);color:var(--dsw-alias-label-primary);font-size:12px}\n.wbep-actions{display:flex;gap:8px;flex-wrap:wrap}\n.wbep-notice{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}\n.wbep-diagnostics{font-size:11px;line-height:1.65;padding:12px;border-radius:7px;background:var(--dsw-alias-interactive-bg-hover);max-height:340px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}\n.wbep-result details summary{cursor:pointer;margin-bottom:8px;color:var(--dsw-alias-label-secondary)}\n@media(max-width:600px){.wbep-dialog{max-height:calc(100dvh - 20px)}.wbep-label{display:none}.wbep-trigger{padding:0 5px}.wbep-tabs button{padding:5px 10px}}\n";
const { createElement: h, useState, useEffect, useRef } = React;

function Wand() {
  return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
    h('path', { d: 'm4 20 11-11 4 4L8 24M14 4v4M12 6h4M20 2v4M18 4h4M20 16v4M18 18h4', transform: 'translate(0 -3)' }));
}
const option = (value, label) => h('option', { key: value, value }, label);
const field = (label, control, hint) => h('label', { className: 'wbep-field' }, h('span', null, label), control,
  hint && h('small', null, hint));
const actionButton = (label, onClick, extra = {}) => h(Button, { type: 'button', onClick, ...extra }, label);

function EnhanceControl({ sessionId, shell, useInput, inputActions, uiSession, bridge, memory }) {
  const input = useInput(s => s);
  const [state, render] = useState(() => ({ ...memory }));
  const [config, setConfig] = useState({ settings: { ...DEFAULTS }, hasApiKey: false, diagnostics: [] });
  const [form, setForm] = useState({ ...DEFAULTS });
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [tab, setTab] = useState('settings');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);
  const alive = useRef(false), flight = useRef(null), panel = useRef(false), toastSeq = useRef(0);
  const update = values => {
    Object.assign(memory, values);
    if (alive.current) {
      render({ ...memory });
      if (values.notice && values.busy !== true) setToast({ text: values.notice, seq: ++toastSeq.current });
    }
  };
  const active = root => uiSession.current.value.key === sessionId && shell.editor.getRootElement() === root && root?.isConnected;
  const conflict = (before, root) => draftConflict(before, shell.snapshot,
    { active: active(root), composing: shell.editor.isComposing() });

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    bridge('settings', {}, controller.signal).then(value => {
      if (!alive.current) return;
      setConfig(value); setForm(value.settings); setReady(true);
    }).catch(error => { if (!controller.signal.aborted) update({ notice: error.message }); });
    const off = uiSession.current.subscribe(() => {
      if (flight.current && uiSession.current.value.key !== sessionId) {
        flight.current.reason = '会话已切换，增强已停止；原草稿未变。';
        flight.current.controller.abort();
      }
    });
    return () => {
      alive.current = false; controller.abort(); off();
      if (flight.current) {
        flight.current.reason = '输入框已切换，增强已停止；原草稿未变。';
        flight.current.controller.abort();
      }
    };
  }, [shell]);

  function showPanel(nextTab = 'settings') {
    setTab(nextTab); setForm(config.settings); setApiKey(''); setClearKey(false);
    panel.current = true; setOpen(true);
  }
  function closePanel() { panel.current = false; setOpen(false); setApiKey(''); }
  function editForm(key, value) { setForm(previous => ({ ...previous, [key]: value })); }
  async function save(test = false) {
    setSaving(true);
    try {
      const value = await bridge('save', { settings: form, keyAction: clearKey ? 'clear' : apiKey.trim() ? 'set' : 'keep',
        ...(apiKey.trim() && !clearKey ? { apiKey } : {}) });
      setConfig(value); setForm(value.settings); setApiKey(''); setClearKey(false); setReady(true);
      update({ notice: '设置已保存。密钥只保存在 Host 凭据存储中。' });
      if (test) {
        const result = await bridge('test', { sessionId });
        setConfig(previous => ({ ...previous, diagnostics: result.diagnostics }));
        update({ notice: result.message });
      }
    } catch (error) { update({ notice: error.message }); }
    finally { if (alive.current) setSaving(false); }
  }

  async function enhance() {
    if (flight.current) {
      flight.current.reason = '已停止增强，原草稿未变。';
      flight.current.controller.abort(); return;
    }
    if (!ready || saving) { update({ notice: '增强设置尚未就绪，请打开设置保存或刷新页面。' }); return; }
    const before = captureDraft(shell.snapshot), root = shell.editor.getRootElement();
    const blocked = conflict(before, root);
    if (blocked || !before.draft.trim()) { update({ notice: blocked || '先输入需要增强的提示词。' }); return; }
    if (before.draft.length > 100000) { update({ notice: '草稿超过 100000 字符，请缩短后重试。' }); return; }
    const job = { controller: new AbortController(), reason: '' };
    flight.current = job;
    update({ busy: true, notice: '正在增强… 发送当前草稿和有界近期对话摘要，不发送附件或项目文件。' });
    try {
      const value = await bridge('enhance', { sessionId, draft: before.draft }, job.controller.signal);
      const result = { text: value.text, before: before.draft, mode: value.mode, model: value.model, issue: '', applied: false };
      // Keep a complete response in memory even when the original editor can no longer accept it.
      const issue = job.controller.signal.aborted ? job.reason || '操作已停止'
        : conflict(before, root) || protectedContentIssue(before.draft, result.text);
      result.issue = issue;
      if (!issue && inputActions.insertText(result.text, { start: 0, end: before.draft.length, draftRev: before.draftRev })) {
        const after = captureDraft(shell.snapshot);
        result.applied = true;
        update({ result, undo: { original: before.draft, after }, notice: '增强已填入草稿，未发送。可撤销；请确认内容后再发送。' });
      } else {
        result.issue ||= '输入框没有接受替换';
        update({ result, notice: `${result.issue}。结果已保留，请打开「上次结果」查看或复制。` });
      }
      if (alive.current) setConfig(previous => ({ ...previous, diagnostics: value.diagnostics }));
    } catch (error) {
      update({ notice: job.controller.signal.aborted ? job.reason || '增强已停止，原草稿未变。' : error.message });
    } finally {
      if (flight.current === job) flight.current = null;
      update({ busy: false });
    }
  }

  function undo() {
    const saved = memory.undo;
    if (!saved) return;
    const root = shell.editor.getRootElement(), blocked = conflict(saved.after, root);
    if (blocked) { update({ notice: `${blocked}，不能安全撤销。原文仍在「上次结果」中。` }); return; }
    if (inputActions.insertText(saved.original, { start: 0, end: saved.after.draft.length, draftRev: saved.after.draftRev })) {
      update({ undo: null, notice: '已恢复增强前的草稿，未发送。' });
      if (!panel.current) shell.focus();
    } else update({ notice: '输入框未接受撤销；原文仍保留在「上次结果」中。' });
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); update({ notice: '已复制。' }); }
    catch { update({ notice: '浏览器禁止自动复制，请在文本框内全选后复制。' }); }
  }

  const canUndo = state.undo && !draftConflict(state.undo.after, input);
  const currentMode = MODES[config.settings.mode];
  const settingsContent = h('div', { className: 'wbep-settings' },
    field('增强模式', h('select', { value: form.mode, onChange: e => editForm('mode', e.target.value), disabled: saving || state.busy },
      Object.entries(MODES).map(([key, mode]) => option(key, mode.label))), MODES[form.mode].hint),
    field('模型来源', h('select', { value: form.source, onChange: e => editForm('source', e.target.value), disabled: saving || state.busy },
      option('harness', '跟随当前对话模型（推荐）'), option('custom', '独立配置 OpenAI 兼容接口')),
      form.source === 'harness' ? '复用 Harness 当前会话的提供商、模型及 Host 密钥；不会创建消息或运行 Agent。' : '请求由 Host 发出，无浏览器跨域限制；只使用下面单独保存的密钥。'),
    form.source === 'custom' && h(React.Fragment, null,
      field('Base URL', h('input', { value: form.baseURL, placeholder: 'http://127.0.0.1:8000/v1', autoComplete: 'off', spellCheck: false,
        onChange: e => editForm('baseURL', e.target.value), disabled: saving || state.busy }), '支持 HTTP 和 HTTPS。保留自定义路径；仅裸域名默认加 /v1。完整 /chat/completions、/responses 或 /models 后缀会自动去重。'),
      /^\s*http:\/\//i.test(form.baseURL) && h('p', { className: 'wbep-warning', role: 'note' }, 'HTTP 已允许：草稿和 API Key 会以明文传输，请仅在可信网络使用。'),
      field('模型名称', h('input', { value: form.model, placeholder: '例如 deepseek-chat、glm-5.2', spellCheck: false,
        onChange: e => editForm('model', e.target.value), disabled: saving || state.busy })),
      field('API 协议', h('select', { value: form.protocol, onChange: e => editForm('protocol', e.target.value), disabled: saving || state.busy },
        option('chat', 'Chat Completions'), option('responses', 'Responses'))),
      field('API Key（本地免密接口可留空）', h('input', { type: 'password', value: apiKey, autoComplete: 'new-password',
        placeholder: config.hasApiKey ? '已保存；留空保持，不回显原密钥' : '可选；不会读取或展示 Harness 的其他密钥',
        onChange: e => { setApiKey(e.target.value); setClearKey(false); }, disabled: saving || state.busy }),
        '更换 Base URL 后，旧密钥不会跟随到新地址；请重新输入需要使用的密钥。'),
      config.hasApiKey && h('label', { className: 'wbep-check' }, h('input', { type: 'checkbox', checked: clearKey,
        onChange: e => setClearKey(e.target.checked), disabled: saving || state.busy }), '清除保存的自定义密钥'),
      form.protocol === 'responses' && h('label', { className: 'wbep-check' }, h('input', { type: 'checkbox', checked: form.omitStore,
        onChange: e => editForm('omitStore', e.target.checked), disabled: saving || state.busy }), '省略 store 字段（兼容别名/特殊网关；GLM-5.2 自动省略）')),
    h('p', { className: 'wbep-privacy' }, '发送当前草稿，并由 Host 附带最近若干轮用户/助手正文（有条数和字符上限，过长会截断）。不发送附件内容、项目文件、工具结果或推理过程。最多等待 90 秒；无自动重试；结果不会自动发送。密钥存于本机 Host 凭据存储，不在浏览器持久化。'),
    h('div', { className: 'wbep-actions' }, actionButton(saving ? '处理中…' : '保存设置', () => save(), { variant: 'primary', disabled: saving || state.busy }),
      actionButton('保存并检查连接', () => save(true), { variant: 'outline', disabled: saving || state.busy })),
    h('small', null, '跟随模式只检查模型配置；独立模式检查 /models，不代表生成接口一定可用。'));

  const resultContent = state.result ? h('div', { className: 'wbep-result' },
    h('p', { className: state.result.issue ? 'wbep-warning' : 'wbep-privacy' }, state.result.issue || '完整结果已填入草稿。',
      ` · ${MODES[state.result.mode].label} · ${state.result.model}`),
    field('增强结果（纯文本，不执行 HTML）', h('textarea', { readOnly: true, value: state.result.text, rows: 12, spellCheck: false })),
    h('div', { className: 'wbep-actions' }, actionButton('复制增强结果', () => copy(state.result.text), { variant: 'primary' }),
      actionButton('撤销本次增强', undo, { variant: 'outline', disabled: !canUndo || state.busy })),
    h('details', null, h('summary', null, '查看增强前原文'), h('textarea', { readOnly: true, value: state.result.before, rows: 7, spellCheck: false }),
      actionButton('复制原文', () => copy(state.result.before))),
    h('small', null, '结果仅留在本页内存，刷新页面即清除；不会强行覆盖已经修改的草稿。'))
    : h('p', { className: 'wbep-privacy' }, '尚无完整增强结果。点击输入栏「增强」开始；本插件不会自动发起生成。');
  const diagnosticsContent = h('div', null,
    h('p', { className: 'wbep-privacy' }, '最近 8 次检查/增强的时间、耗时、状态和字符数；不记录草稿、结果、密钥、地址或上游错误正文。'),
    h('pre', { className: 'wbep-diagnostics' }, JSON.stringify(config.diagnostics, null, 2)),
    actionButton('刷新诊断', async () => {
      try { setConfig(await bridge('settings')); } catch (error) { update({ notice: error.message }); }
    }));

  return h(React.Fragment, null,
    h('div', { className: 'wbep-control', 'data-wb-enhance': '2.0.0' },
      canUndo && h('button', { type: 'button', className: 'wbep-mini', title: '撤销增强', 'aria-label': '撤销增强', disabled: state.busy,
        onMouseDown: e => e.preventDefault(), onClick: undo }, '↶'),
      h('button', { type: 'button', className: `wbep-trigger${state.busy ? ' wbep-working' : ''}`,
        title: state.busy ? '停止本次增强' : `${currentMode.label} · 点击增强当前草稿；右键打开设置`,
        'aria-label': state.busy ? '停止提示词增强' : '增强提示词', 'aria-busy': state.busy, disabled: !state.busy && (!ready || saving),
        onMouseDown: e => e.preventDefault(), onClick: enhance,
        onContextMenu: e => { e.preventDefault(); showPanel(); } },
        state.busy ? h('span', { 'aria-hidden': true }, '■') : h(Wand), h('span', { className: 'wbep-label' }, state.busy ? '停止' : '增强')),
      h('button', { type: 'button', className: 'wbep-mini', title: state.notice || '提示词增强设置',
        'aria-label': '提示词增强设置', 'aria-haspopup': 'dialog', 'aria-expanded': open,
        onClick: () => showPanel(state.result?.issue ? 'result' : 'settings') }, state.result?.issue ? '•' : '⌄'),
      h('span', { className: 'wbep-sr', role: 'status', 'aria-live': 'polite' }, state.notice)),
    !open && toast && h(Toast, { key: toast.seq, text: toast.text, holdMs: 5500,
      actions: state.result?.issue ? [{ label: '查看结果', onClick: () => showPanel('result') }] : undefined,
      onDone: () => setToast(current => current?.seq === toast.seq ? null : current) }),
    h(Modal, { open, onClose: closePanel, title: 'WB 提示词增强', closeLabel: '关闭增强设置', className: 'wbep-dialog',
      description: '原生 Harness 插件 · 只改草稿，不替你发送',
      footer: state.notice ? h('div', { className: 'wbep-notice', role: 'status' }, state.notice) : undefined },
      h('div', { className: 'wbep-tabs', role: 'tablist', 'aria-label': '增强面板' },
        [['settings', '设置'], ['result', '上次结果'], ['diagnostics', '诊断']].map(([id, label]) => h('button', {
          key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, onClick: () => setTab(id), className: tab === id ? 'wbep-selected' : '',
        }, label))), h('div', { role: 'tabpanel' }, tab === 'settings' ? settingsContent : tab === 'result' ? resultContent : diagnosticsContent)));
}

function apply(ctx) {
  const sessions = new Map();
  const life = new AbortController();
  async function bridge(action, payload = {}, signal) {
    const combined = AbortSignal.any([life.signal, AbortSignal.timeout(95000), ...(signal ? [signal] : [])]);
    let response;
    try {
      response = await fetch('/api/wb-enhance-prompt', { method: 'POST', credentials: 'same-origin', signal: combined,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    } catch {
      throw new Error(combined.aborted ? combined.reason?.name === 'TimeoutError' ? '增强请求超时，原草稿已保留。' : '增强已停止，原草稿已保留。'
        : '无法连接增强插件，请检查网络并刷新当前 Harness 页面。');
    }
    if (!response.ok) throw new Error(`增强插件返回 HTTP ${response.status}，请刷新当前页面或检查插件是否启用。`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.wbEnhance = '2.0.0'; style.textContent = css; document.head.append(style);
    return () => { style.remove(); life.abort(); sessions.clear(); };
  }, 'wb-enhance: styles and request lifetime');
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'wb-enhance-prompt', priority: 1000, order: 1000,
    inject: sessionId => {
      const binding = ctx.sessions.binding(sessionId);
      const shell = ctx.conversation.input.for(binding.ctx);
      if (!sessions.has(sessionId)) sessions.set(sessionId, { result: null, undo: null, notice: '', busy: false });
      return { sessionId, shell, uiSession: ctx.uiSession, bridge, memory: sessions.get(sessionId) };
    },
  }, EnhanceControl));
}
module.exports = { apply, inject: ['slots', 'conversation', 'sessions', 'uiSession'] };

    return module.exports;
  }
});
