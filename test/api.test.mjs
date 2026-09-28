import test from 'node:test';
import assert from 'node:assert/strict';
import { EnhanceError, normalizeBase, parseGenerationJSON, readPayload, validateText,
  requestBody, customRequest, testCustom } from '../src/api.js';
import { captureDraft, draftConflict, protectedContentIssue } from '../src/draft.js';
import { buildPrompts, SHARED_PROMPT } from '../src/prompts.js';

const settings = { source: 'custom', mode: 'concise', protocol: 'chat', baseURL: 'http://remote.invalid/custom/v2', model: 'model', omitStore: false };
const draft = '  请只审查，不实现。🙂\r\n```js\n  const x = " 保留 ";\n```\n路径 C:\\repo\\a.js，命令 `npm test`。\n ';
const chat = (content, finish_reason = 'stop', extra = {}) => ({ choices: [{ index: 0, finish_reason, message: { content, ...extra } }] });
const responses = (text, status = 'completed') => ({ status, output: [{ type: 'message', status, content: [{ type: 'output_text', text }] }] });
const delta = (content, finish_reason = null) => ({ choices: [{ index: 0, delta: { content }, finish_reason }] });
const event = (data, type = '') => `${type ? `event: ${type}\r\n` : ''}data: ${JSON.stringify(data)}\r\n\r\n`;
const tool = { type: 'function_call', call_id: 'call_1', name: 'tool', arguments: '{}' };
function byteResponse(text, type = 'text/event-stream') {
  return new Response(new ReadableStream({ start(controller) {
    for (const byte of new TextEncoder().encode(text)) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }), { headers: { 'content-type': type } });
}

test('normalizeBase allows remote HTTP/HTTPS, preserves custom paths and removes terminal endpoints', () => {
  for (const scheme of ['http', 'https']) {
    assert.equal(normalizeBase(` ${scheme}://remote.invalid/ `), `${scheme}://remote.invalid/v1`);
    for (const endpoint of ['', '/chat/completions/', '/responses', '/models///']) {
      assert.equal(normalizeBase(`${scheme}://remote.invalid/custom/v2${endpoint}`), `${scheme}://remote.invalid/custom/v2`);
    }
  }
  assert.equal(normalizeBase('https://remote.invalid/chat/completions'), 'https://remote.invalid/v1');
});
test('normalizeBase rejects non-HTTP schemes, credentials, query and fragment', () => {
  for (const url of ['ftp://remote.invalid', 'file:///tmp/a', 'not a URL', 'https://u:p@remote.invalid',
    'http://u@remote.invalid', 'https://remote.invalid/v1?key=secret', 'https://remote.invalid/v1#part']) {
    assert.throws(() => normalizeBase(url), { code: 'CONFIG_URL' });
  }
});

test('all three modes preserve the entire source draft as JSON data', () => {
  const source = draft + '不得省略约束。'.repeat(180);
  for (const mode of ['concise', 'detailed', 'creative']) {
    const prompts = buildPrompts(source, mode);
    assert.ok(prompts.system.startsWith(SHARED_PROMPT));
    assert.ok(prompts.system.includes(`Mode: ${mode.toUpperCase()}.`));
    assert.deepEqual(JSON.parse(prompts.user.split('\n\n').at(-1)), { instruction: source });
  }
  assert.throws(() => buildPrompts(draft, 'unknown'), /Unknown enhancement mode/);
});
test('JSON Chat preserves text and rejects truncated, tool-call and empty completions', () => {
  assert.equal(parseGenerationJSON(chat(draft), 'chat'), draft);
  assert.equal(parseGenerationJSON(chat([{ type: 'text', text: ' A' }, { type: 'text', text: 'B ' }]), 'chat'), ' AB ');
  assert.throws(() => parseGenerationJSON(chat('partial', 'length'), 'chat'), { code: 'INCOMPLETE' });
  assert.throws(() => parseGenerationJSON(chat('text', 'stop', { tool_calls: [tool] }), 'chat'), { code: 'INCOMPLETE' });
  assert.throws(() => parseGenerationJSON(chat(' \n\t'), 'chat'), { code: 'EMPTY' });
});
test('JSON Responses accepts completed text and rejects incomplete or empty output', () => {
  assert.equal(parseGenerationJSON(responses(draft), 'responses'), draft);
  assert.equal(parseGenerationJSON({ status: 'completed', output_text: draft }, 'responses'), draft);
  assert.throws(() => parseGenerationJSON(responses('partial', 'incomplete'), 'responses'), { code: 'INCOMPLETE' });
  assert.throws(() => parseGenerationJSON({ status: 'completed', output: [] }, 'responses'), { code: 'EMPTY' });
});
test('JSON Responses rejects tool-only and mixed text/tool-call output', () => {
  assert.throws(() => parseGenerationJSON({ status: 'completed', output: [tool] }, 'responses'), EnhanceError);
  const mixed = responses('Do not accept this partial instruction');
  mixed.output.push(tool);
  assert.throws(() => parseGenerationJSON(mixed, 'responses'), EnhanceError);
  const unfinished = responses('partial');
  unfinished.output_text = 'apparently complete'; unfinished.output[0].status = 'incomplete';
  assert.throws(() => parseGenerationJSON(unfinished, 'responses'), { code: 'INCOMPLETE' });
});

test('SSE handles bytewise UTF-8, split CRLF, comments, multiple data lines and stop', async () => {
  const text = '  中文🙂\n尾部 \t';
  const multiline = `data: {"choices":[{"index":0,\r\ndata: "delta":{"content":${JSON.stringify(text)}},"finish_reason":null}]}\r\n\r\n`;
  const wire = ': keepalive\r\n\r\n' + event({ choices: [], usage: {} }) + multiline + event(delta('', 'stop')) + 'data: [DONE]\r\n\r\n';
  assert.equal(await readPayload(byteResponse(wire), 'chat'), text);
  assert.equal(await readPayload(byteResponse(wire, 'application/octet-stream'), 'chat'), text);
  assert.equal(await readPayload(byteResponse(JSON.stringify(chat(text)), 'application/json'), 'chat'), text);
});
test('SSE rejects interruptions, truncation, tools, empty completion and malformed data', async () => {
  for (const [wire, code] of [[event(delta('partial')), 'INCOMPLETE'], [event(delta('partial')) + 'data: [DONE]\n\n', 'INCOMPLETE'],
    [event(delta('partial', 'length')), 'INCOMPLETE'], [event({ choices: [{ delta: { tool_calls: [tool] } }] }), 'INCOMPLETE'],
    [event(delta(' \n', 'stop')), 'EMPTY'], ['data: not-json\n\n', 'BAD_RESPONSE']]) {
    await assert.rejects(readPayload(byteResponse(wire), 'chat'), { code });
  }
});
test('Responses SSE aggregates indexed events, replaces done text and prefers final output', async () => {
  const wire = event({ type: 'response.output_text.delta', output_index: 1, delta: '尾\n ' })
    + event({ output_index: 0, content_index: 1, delta: '🙂' }, 'response.output_text.delta')
    + event({ output_index: 0, content_index: 1, delta: '好' }, 'response.output_text.delta')
    + event({ output_index: 0, delta: 'placeholder' }, 'response.output_text.delta')
    + event({ output_index: 0, text: '  中文' }, 'response.output_text.done')
    + event({ response: { status: 'completed' } }, 'response.completed');
  assert.equal(await readPayload(byteResponse(wire), 'responses'), '  中文🙂好尾\n ');
  const final = event({ delta: 'partial' }, 'response.output_text.delta') + event({ response: responses(draft) }, 'response.completed');
  assert.equal(await readPayload(byteResponse(final), 'responses'), draft);
});
test('Responses SSE requires successful completion and nonempty text', async () => {
  for (const [wire, code] of [[event({ delta: 'partial' }, 'response.output_text.delta'), 'INCOMPLETE'],
    [event({}, 'response.incomplete'), 'INCOMPLETE'], [event({}, 'response.failed'), 'INCOMPLETE'],
    [event({ delta: 'partial' }, 'response.output_text.delta') + event({ response: { status: 'in_progress' } }, 'response.completed'), 'INCOMPLETE'],
    [event({ response: responses(' \n') }, 'response.completed'), 'EMPTY']]) {
    await assert.rejects(readPayload(byteResponse(wire), 'responses'), { code });
  }
});
test('Responses SSE rejects completed output containing a tool call', async () => {
  const mixed = responses('not a tool-free instruction');
  mixed.output.push(tool);
  await assert.rejects(readPayload(byteResponse(event({ response: mixed }, 'response.completed')), 'responses'), EnhanceError);
});
test('validateText rejects whitespace-only output without trimming valid output', () => {
  assert.equal(validateText(draft), draft);
  assert.throws(() => validateText(' \t\r\n'), { code: 'EMPTY' });
});

test('requestBody uses protocol-specific fields and GLM-5.2 store exceptions', () => {
  const prompts = buildPrompts(draft, 'concise'), config = { ...settings, protocol: 'responses' };
  assert.deepEqual(requestBody(settings, prompts), { model: 'model', stream: true,
    messages: [{ role: 'system', content: prompts.system }, { role: 'user', content: prompts.user }] });
  assert.deepEqual(requestBody(config, prompts), { model: 'model', instructions: prompts.system, input: prompts.user, stream: true, store: false });
  for (const model of ['glm-5.2', 'zai/GLM-5.2-turbo', 'glm-5.2:cloud']) assert.ok(!Object.hasOwn(requestBody({ ...config, model }, prompts), 'store'));
  assert.ok(!Object.hasOwn(requestBody({ ...config, omitStore: true }, prompts), 'store'));
  assert.equal(requestBody({ ...config, model: 'glm-5.20' }, prompts).store, false);
});
test('customRequest sends only draft prompts, exact headers, signal and redirect:error', async () => {
  const prompts = { ...buildPrompts(draft, 'concise'), history: 'HISTORY_SECRET', attachments: 'ATTACHMENT_SECRET' };
  const signal = new AbortController().signal;
  for (const protocol of ['chat', 'responses']) {
    const config = { ...settings, protocol, session: 'SESSION_SECRET' };
    let calls = 0;
    const result = await customRequest(config, 'secret-key', prompts, signal, async (url, init) => {
      calls++;
      assert.equal(url, `${settings.baseURL}/${protocol === 'chat' ? 'chat/completions' : 'responses'}`);
      assert.equal(init.method, 'POST'); assert.equal(init.signal, signal); assert.equal(init.redirect, 'error');
      assert.deepEqual(init.headers, { 'content-type': 'application/json', accept: 'text/event-stream, application/json', authorization: 'Bearer secret-key' });
      const body = JSON.parse(init.body), user = protocol === 'chat' ? body.messages[1].content : body.input;
      assert.deepEqual(body, requestBody(config, prompts));
      assert.deepEqual(JSON.parse(user.split('\n\n').at(-1)), { instruction: draft });
      assert.doesNotMatch(init.body, /HISTORY_SECRET|ATTACHMENT_SECRET|SESSION_SECRET/);
      return new Response(JSON.stringify(protocol === 'chat' ? chat(draft) : responses(draft)));
    });
    assert.equal(result, draft); assert.equal(calls, 1);
  }
});
test('testCustom probes models without draft/body and forwards optional auth, signal and redirect', async () => {
  const signal = new AbortController().signal;
  for (const key of ['', 'secret-key']) {
    const response = new Response('[]');
    const result = await testCustom(settings, key, signal, async (url, init) => {
      assert.equal(url, `${settings.baseURL}/models`); assert.equal(init.method ?? 'GET', 'GET');
      assert.equal(init.signal, signal); assert.equal(init.redirect, 'error'); assert.ok(!Object.hasOwn(init, 'body'));
      assert.deepEqual(init.headers, key ? { authorization: `Bearer ${key}` } : {});
      return response;
    });
    assert.match(result, /HTTP 200/); assert.equal(response.bodyUsed, true);
  }
});
test('custom requests redact HTTP failures, cancel bodies and never retry', async () => {
  for (const probe of [false, true]) {
    let calls = 0, cancelled = 0, bodyReads = 0;
    const doFetch = async () => { calls++; return { ok: false, status: 401, statusText: 'PROVIDER_SECRET secret-key',
      body: { async cancel() { cancelled++; } }, async text() { bodyReads++; return 'PROVIDER_SECRET secret-key'; } }; };
    const pending = probe ? testCustom(settings, 'secret-key', undefined, doFetch)
      : customRequest(settings, 'secret-key', buildPrompts(draft, 'concise'), undefined, doFetch);
    await assert.rejects(pending, error => {
      assert.equal(error.code, 'HTTP_401'); assert.match(error.message, /HTTP 401/);
      assert.doesNotMatch(String(error), /secret-key|PROVIDER_SECRET|remote\.invalid/); return true;
    });
    assert.equal(calls, 1); assert.equal(cancelled, 1); assert.equal(bodyReads, 0);
  }
});

test('draft snapshots detect revision/text, phase, session, attachments, chips and composition conflicts', () => {
  const now = { draft, draftRev: 3, phase: 'plain', attachmentIds: ['a', 'b'], occurrences: [] }, before = captureDraft(now);
  assert.deepEqual(before, { draft, draftRev: 3, attachmentIds: ['a', 'b'] });
  assert.notEqual(before.attachmentIds, now.attachmentIds); assert.equal(draftConflict(before, now), '');
  for (const [change, options, reason] of [[{ draftRev: 4 }, {}, /草稿/], [{ draft: 'edited' }, {}, /草稿/],
    [{ phase: 'sending' }, {}, /命令或发送/], [{}, { active: false }, /会话/],
    [{ attachmentIds: ['b', 'a'] }, {}, /附件/], [{ attachmentIds: ['a'] }, {}, /附件/],
    [{ occurrences: [{ id: 'chip' }] }, {}, /引用/], [{}, { composing: true }, /输入法/]]) {
    assert.match(draftConflict(before, { ...now, ...change }, options), reason);
  }
});
test('protectedContentIssue preserves backtick/tilde fences and inline code while allowing prose edits', () => {
  const source = draft + '\n~~~py\nprint("保留")\n~~~';
  assert.equal(protectedContentIssue(source, '前言\n' + source + '\n补充'), '');
  assert.equal(protectedContentIssue(source, source.replace('请只审查', '仅审查')), '');
  for (const literal of ['const x', 'npm test', 'print("保留")']) assert.match(protectedContentIssue(source, source.replace(literal, 'changed')), /代码/);
  assert.match(protectedContentIssue(source, source + '\uE100'), /引用占位符/);
  for (const literal of ['  ```js\nlet x = 1;\n  ```', '``a`b`c``', '   ~~~py\r\nx = 1\r\n   ~~~~']) {
    assert.match(protectedContentIssue(literal, literal.replace(/1|b/, 'changed')), /代码/);
    assert.equal(protectedContentIssue(literal, '前言\n' + literal + '\n补充'), '');
  }
});
