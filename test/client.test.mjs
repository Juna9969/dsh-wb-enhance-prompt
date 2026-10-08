import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';

test('built native client registers before model and supplies the required input selector', async () => {
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  let declaration, control, registration;
  const effects = [], memory = { result: null, undo: null, notice: '', busy: false };
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }), Fragment: Symbol('Fragment'),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {}, useRef: value => ({ current: value }),
  };
  new Script(code).runInContext(createContext({
    window: { __ModuleLoader__: { load: value => { declaration = value; } } }, AbortController, AbortSignal,
  }));
  assert.equal(declaration.id, 'dsh-wb-enhance-prompt');
  const client = declaration.factory(id => {
    if (id === 'react') return React;
    assert.equal(id, '@deepseek-ai/dsh-client-ui-primitives');
    return { Modal: 'Modal', Button: 'Button', Toast: 'Toast' };
  });
  client.apply({
    effect: effect => effects.push(effect),
    slots: { inject: (name, register) => { assert.equal(name, 'conversation.input.right'); register(); },
      register: (options, component) => { registration = options; control = component; } },
  });
  assert.equal(registration.name, 'conversation.input.right');
  assert.equal(registration.priority, 1000); assert.equal(registration.order, 1000);
  let selected = false;
  const input = { draft: '', draftRev: 0, attachmentIds: [], occurrences: [], phase: 'plain' };
  const tree = control({ sessionId: 'test', shell: {}, inputActions: {}, uiSession: {}, bridge: () => {}, memory,
    useInput: selector => { assert.equal(typeof selector, 'function'); selected = true; return selector(input); } });
  assert.ok(selected);
  assert.equal(tree.children[0].props.className, 'wbep-control');
  assert.equal(tree.children[0].props['data-wb-enhance'], '2.1.0');
});
