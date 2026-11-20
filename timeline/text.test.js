import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOllamaConnection, createTextPrompt, requestOllama } from './text.js';

const settings = { url: 'http://192.0.2.10:11434', model: 'qwen3.5:9b' };

test('connection checks require a responding server and the configured model, without generating text', async t => {
  let sent;
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options };
    return { ok: true, json: async () => ({ models: [{ name: 'qwen3.5:9b' }] }) };
  });
  assert.equal(await checkOllamaConnection(settings, controller.signal), true);
  assert.equal(sent.url.href, 'http://192.0.2.10:11434/api/tags');
  assert.equal(sent.options.signal, controller.signal);
  assert.equal(sent.options.cache, 'no-store');
  assert.equal(sent.options.body, undefined);
  for (const data of [{ models: [] }, { models: [{ name: 'another-model' }] }, {}]) {
    fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => data }));
    assert.equal(await checkOllamaConnection(settings), false);
  }
  fetch.mock.mockImplementation(async () => ({ ok: false }));
  assert.equal(await checkOllamaConnection(settings), false);
  assert.equal(await checkOllamaConnection({ ...settings, url: '' }), false);
});

test('an unconfigured address and empty prompts never send a request', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; });
  await assert.rejects(requestOllama('Make it slower', { ...settings, url: '' }), /not configured/);
  await assert.rejects(requestOllama('   ', settings), /Type a prompt/);
  assert.equal(calls, 0);
});

test('Enter can send a short, non-streaming Ollama chat request with cancellation', async (t) => {
  let sent;
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options };
    return { ok: true, json: async () => ({ message: { content: '  Reduce the speed.  ' } }) };
  });
  assert.equal(await requestOllama('  Make it slower  ', settings, controller.signal), 'Reduce the speed.');
  assert.equal(sent.url.href, 'http://192.0.2.10:11434/api/chat');
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers['Content-Type'], 'application/json');
  assert.equal(sent.options.signal, controller.signal);
  assert.deepEqual(JSON.parse(sent.options.body), {
    model: 'qwen3.5:9b', messages: [{ role: 'user', content: 'Make it slower' }],
    stream: false, think: false, options: { num_ctx: 4096, num_predict: 256 },
  });
});

test('server failures and empty replies are reported rather than treated as success', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({
    ok: false, status: 404, json: async () => ({ error: 'Model not found' }),
  }));
  await assert.rejects(requestOllama('Change the drawing', settings), /Model not found/);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ message: { content: '' } }) }));
  await assert.rejects(requestOllama('Change the drawing', settings), /empty response/);
});

test('closing the overlay can abort the network request', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const request = requestOllama('Change the drawing', settings, controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});

test('an agent request sends version instructions, current values and a bounded JSON schema', async (t) => {
  let body;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: '{"count":12}' } }) };
  });
  const agent = {
    description: 'Nested squares.', systemPrompt: 'Change count only.',
    parameters: { count: { type: 'integer', minimum: 1, maximum: 50 } },
  };
  assert.equal(await requestOllama('Use 12 squares', settings, undefined, { agent, state: { count: 20 } }), '{"count":12}');
  assert.match(body.messages[0].content, /Nested squares\./);
  assert.match(body.messages[0].content, /Change count only\./);
  assert.equal(body.messages[1].content, 'Current parameters: {"count":20}\nRequest: Use 12 squares');
  assert.equal(body.format.additionalProperties, false);
  assert.deepEqual(body.format.properties, agent.parameters);
  assert.deepEqual(body.format.required, ['count']);
});

test('larger agents have enough context and output tokens to return every parameter', async t => {
  let body;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: '{}' } }) };
  });
  const agent = { systemPrompt: 'Preserve the state.', parameters: {} };
  const state = {};
  for (let i = 0; i < 26; i++) {
    agent.parameters[`setting${i}`] = { type: 'number', minimum: 0, maximum: 1 };
    state[`setting${i}`] = 0.5;
  }
  await requestOllama('Change the layout', settings, undefined, { agent, state });
  assert.equal(body.format.required.length, 26);
  assert(body.options.num_predict >= 26 * 24);
  assert(body.options.num_ctx >= 8192);
});

const drawingAgent = {
  mode: 'drawing', description: 'Create animated strokes.', systemPrompt: 'Draw paths, never code.',
  examples: ['Clear the drawing.', 'Erase all strokes.'],
  responseSchema: {
    type: 'object', required: ['operation'], additionalProperties: false,
    properties: { operation: { type: 'string', enum: ['clear'] } },
  },
};

test('drawing requests send their command schema and read-only scene context', async t => {
  let body;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: '{"operation":"clear"}' } }) };
  });
  const state = { canvasWidth: 1000, canvasHeight: 800, strokeCount: 12, remainingStrokes: 116, lastDrawing: null };
  await requestOllama('Clear the drawing', settings, undefined, { agent: drawingAgent, state });
  assert.deepEqual(body.format, drawingAgent.responseSchema);
  assert.equal(body.messages[1].content, `Drawing context: ${JSON.stringify(state)}\nRequest: Clear the drawing`);
  assert.equal(body.options.num_ctx, 8192);
  assert.equal(body.options.num_predict, 3072);
});

test('the overlay cycles examples, logs results and routes commands to the respective bridges', async t => {
  class Element {
    events = {}; style = {}; attributes = {}; value = ''; scrollHeight = 100; open = false;
    animations = [];
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() {}
    closest() { return nodes.toolbar; }
    getBoundingClientRect() { return { left: 24, right: 240, top: 16, bottom: 34 }; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
    animate(keyframes, options) {
      const animation = { keyframes, options, cancelled: false, cancel() { this.cancelled = true; } };
      this.animations.push(animation);
      return animation;
    }
  }
  const nodes = Object.fromEntries(['button', 'close', 'submit', 'dialog', 'form', 'editor', 'input', 'example', 'nextExample', 'status', 'command', 'helper', 'connection', 'connectionLabel', 'toolbar'].map(id => [id, new Element()]));
  nodes.connection = nodes.button;
  Object.defineProperty(nodes.status, 'textContent', { get: () => (nodes.command.textContent ?? '') + (nodes.helper.textContent ?? '') });
  let submits = 0;
  nodes.form.requestSubmit = () => { submits++; };
  const originalDocument = globalThis.document, originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  const polls = [];
  let reducedMotion = false;
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.document = {
    querySelector: selector => selector === '.sketch-toolbar' ? nodes.toolbar : selector === '.text-editor' ? nodes.editor : nodes.button,
    getElementById: id => ({ 'text-close': nodes.close, 'text-submit': nodes.submit, 'text-dialog': nodes.dialog, 'text-form': nodes.form, 'text-prompt': nodes.input, 'text-example': nodes.example, 'text-next-example': nodes.nextExample, 'text-last-command': nodes.command, 'text-helper': nodes.helper, 'agent-connection': nodes.connection, 'agent-connection-label': nodes.connectionLabel }[id]),
    addEventListener() {},
  };
  globalThis.window = { innerWidth: 1000, innerHeight: 800, addEventListener() {}, setInterval: fn => polls.push(fn), matchMedia: () => ({ matches: reducedMotion }) };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalResizeObserver === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = originalResizeObserver;
  });
  let response, applied, body;
  const logs = t.mock.method(console, 'info', () => {});
  t.mock.method(Math, 'random', () => 0.75);
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.pathname === '/api/tags') return { ok: true, json: async () => ({ models: [{ name: 'qwen3.5:9b' }] }) };
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: response } }) };
  });
  const bridge = {
    getState: () => ({ strokeCount: 2 }),
    applyDrawing: command => { applied = command; return { message: 'Drawing cleared.' }; },
    applyParameters: () => assert.fail('A drawing command must not call applyParameters'),
  };
  const overlayStates = [], previewEvents = {};
  const prompt = createTextPrompt({
    contentWindow: { sketchAgent: bridge, dispatchEvent: event => overlayStates.push(event.detail.open) },
    addEventListener: (name, fn) => { previewEvents[name] = fn; },
  });
  prompt.reset(drawingAgent);
  assert.equal(nodes.connection.hidden, false);
  assert.equal(nodes.connection.style.left, '260px');
  assert.equal(nodes.input.placeholder, '“Clear the drawing.”');
  nodes.button.events.click();
  const openingReveal = nodes.editor.animations.at(-1);
  assert.deepEqual(openingReveal.keyframes, [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal(openingReveal.options.delay, 1200);
  assert.equal(openingReveal.options.duration, 700);
  assert.equal(openingReveal.options.easing, 'ease-in-out');
  assert.equal(openingReveal.options.fill, 'backwards');
  assert.equal(overlayStates.at(-1), true);
  previewEvents.load();
  assert.equal(overlayStates.at(-1), true);
  assert.equal(nodes.input.placeholder, '“Erase all strokes.”');
  assert.equal(nodes.example.textContent, nodes.input.placeholder);
  assert.equal(nodes.example.hidden, false);
  assert.match(nodes.status.textContent, /Enter to draw/);
  assert.equal(nodes.submit.textContent, 'Draw');
  assert.equal(nodes.submit.disabled, false);
  assert.equal(nodes.nextExample.hidden, false);
  const keydown = (event, target = nodes.input) => {
    const key = { preventDefault() {}, ...event };
    target.events.keydown?.(key);
    nodes.dialog.events.keydown(key);
  };
  const beforeInput = (inputType, options = {}) => {
    let prevented = false;
    nodes.input.events.beforeinput({ inputType, cancelable: true, preventDefault() { prevented = true; }, ...options });
    return prevented;
  };
  const keyup = () => nodes.dialog.events.keyup({ key: 'Shift' });
  keydown({ key: 'Shift' }, nodes.close); keyup();
  assert.equal(openingReveal.cancelled, true);
  assert.equal(nodes.input.placeholder, '“Clear the drawing.”');
  // A touch or mouse click cycles the visible suggestion, even with whitespace in the field.
  nodes.input.value = ' \n'; nodes.input.events.input();
  nodes.nextExample.events.click();
  assert.equal(nodes.example.textContent, '“Erase all strokes.”');
  assert.equal(nodes.example.hidden, false);
  assert.equal(nodes.input.value, ' \n');
  keydown({ key: 'Shift' }); keyup();
  // Shift+Enter and capital letters leave the chosen example alone.
  keydown({ key: 'Shift' }); keydown({ key: 'Enter', shiftKey: true });
  assert.equal(beforeInput('insertLineBreak'), false);
  nodes.input.events.keyup({ key: 'Enter' }); keyup();
  assert.equal(beforeInput('insertLineBreak', { isComposing: true }), false);
  assert.equal(submits, 0);
  assert.equal(nodes.input.placeholder, '“Clear the drawing.”');
  keydown({ key: 'Shift' }); keydown({ key: 'A', shiftKey: true }); keyup();
  assert.equal(nodes.input.placeholder, '“Clear the drawing.”');
  // Holding Shift does not skip examples, and cycling preserves custom text.
  nodes.input.value = 'My own prompt';
  nodes.input.events.input();
  assert.equal(nodes.example.hidden, true);
  assert.equal(nodes.nextExample.hidden, true);
  keydown({ key: 'Shift' }); keydown({ key: 'Shift', repeat: true }); keyup();
  assert.equal(nodes.input.placeholder, '“Erase all strokes.”');
  assert.equal(nodes.input.value, 'My own prompt');
  keydown({ key: 'Enter', repeat: true }); assert.equal(submits, 0);
  keydown({ key: 'Enter' }); assert.equal(submits, 1);
  nodes.input.value = ''; response = '{"operation":"clear"}';
  nodes.input.events.input();
  const beforeSend = { height: nodes.input.style.height, example: nodes.example.textContent };
  let sending;
  const requestSubmit = nodes.form.requestSubmit;
  nodes.form.requestSubmit = () => {
    requestSubmit();
    sending = nodes.form.events.submit({ preventDefault() {} });
  };
  assert.equal(beforeInput('insertLineBreak'), true);
  nodes.form.requestSubmit = requestSubmit;
  assert(sending);
  assert.equal(nodes.input.readOnly, true);
  assert.equal(nodes.input.value, '');
  assert.equal(nodes.input.style.height, beforeSend.height);
  assert.equal(nodes.example.textContent, beforeSend.example);
  assert.equal(nodes.example.hidden, false);
  assert.equal(nodes.form.attributes['aria-busy'], 'true');
  assert.equal(nodes.submit.disabled, true);
  assert.equal(nodes.status.textContent, 'Sending…');
  const calls = fetch.mock.callCount();
  await nodes.form.events.submit({ preventDefault() {} });
  assert.equal(fetch.mock.callCount(), calls);
  keydown({ key: 'Enter' }); assert.equal(submits, 2);
  assert.equal(beforeInput('insertParagraph'), false);
  keydown({ key: 'Shift' }); keyup();
  assert.equal(nodes.input.placeholder, '“Erase all strokes.”');
  await sending;
  const resultReveal = nodes.editor.animations.at(-1);
  assert.notEqual(resultReveal, openingReveal);
  assert.equal(resultReveal.cancelled, false);
  assert.equal(overlayStates.at(-1), true);
  assert.equal(nodes.input.readOnly, false);
  assert.equal(nodes.submit.disabled, false);
  assert.equal(nodes.form.attributes['aria-busy'], 'false');
  assert.equal(nodes.input.value, '');
  assert.equal(nodes.example.hidden, false);
  assert.deepEqual(applied, { operation: 'clear' });
  assert.equal(nodes.connectionLabel.textContent, 'Running');
  assert.equal(nodes.connection.attributes['data-state'], 'connected');
  assert.match(body.messages[1].content, /Request: Erase all strokes\./);
  assert.match(nodes.status.textContent, /Enter to draw/);
  assert.match(nodes.status.textContent, /^“Erase all strokes\.”\n/);
  assert.doesNotMatch(nodes.status.textContent, /Drawing cleared/);
  assert.deepEqual(logs.mock.calls[0].arguments, ['[Agent] Applied response', {
    prompt: 'Erase all strokes.', response: { operation: 'clear' }, result: { message: 'Drawing cleared.' },
  }]);
  response = '{"operation":"clear","code":"clear()"}'; applied = null;
  const revealsBeforeError = nodes.editor.animations.length;
  await nodes.form.events.submit({ preventDefault() {} });
  assert.equal(resultReveal.cancelled, true);
  assert.equal(nodes.editor.animations.length, revealsBeforeError);
  assert.equal(applied, null);
  assert.match(nodes.status.textContent, /Unexpected properties/);
  assert.equal(nodes.connectionLabel.textContent, 'Running');
  assert.equal(nodes.input.value, '');
  assert.equal(nodes.input.readOnly, false);
  assert.equal(nodes.form.attributes['aria-busy'], 'false');
  nodes.input.value = 'My next command'; nodes.input.events.input();
  assert.match(nodes.status.textContent, /^“Erase all strokes\.”\n/);

  const numeric = { systemPrompt: 'Change count.', examples: ['Use 12 squares.'], parameters: { count: { type: 'integer', minimum: 1, maximum: 50 } } };
  bridge.getState = () => ({ count: 20 });
  bridge.applyDrawing = () => assert.fail('A parameter update must not call applyDrawing');
  bridge.applyParameters = values => { applied = values; };
  prompt.reset(numeric);
  assert.equal(nodes.submit.textContent, 'Send');
  assert.equal(nodes.input.placeholder, '“Use 12 squares.”');
  assert.doesNotMatch(nodes.status.textContent, /Erase all strokes/);
  nodes.button.events.click(); nodes.input.value = '  Use 12 squares\n'; response = '{"count":12}';
  const numericOpening = nodes.editor.animations.at(-1);
  nodes.input.events.input();
  assert.equal(numericOpening.cancelled, true);
  const numericSending = nodes.form.events.submit({ preventDefault() {} });
  assert.equal(nodes.input.value, '  Use 12 squares\n');
  assert.equal(nodes.example.hidden, true);
  await numericSending;
  assert.match(body.messages[1].content, /Request: Use 12 squares$/);
  assert.deepEqual(applied, { count: 12 });
  assert.match(nodes.status.textContent, /Enter to send/);
  assert.match(nodes.status.textContent, /^“Use 12 squares”\n/);
  assert.doesNotMatch(nodes.status.textContent, /count =|"count"|Applied/);
  assert.deepEqual(logs.mock.calls.at(-1).arguments[1].response, { count: 12 });
  const numericReveal = nodes.editor.animations.at(-1);
  nodes.input.events.pointerdown();
  assert.equal(numericReveal.cancelled, true);
  fetch.mock.mockImplementation(async () => { throw new TypeError('Offline'); });
  await polls[0]();
  assert.equal(nodes.connectionLabel.textContent, 'Disconnected');
  assert.equal(nodes.connection.attributes['data-state'], 'disconnected');
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ models: [{ name: 'qwen3.5:9b' }] }) }));
  await polls[0]();
  assert.equal(nodes.connectionLabel.textContent, 'Running');
  // Closing and changing versions unlocks immediately; a late response applies nothing.
  let finish;
  fetch.mock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  nodes.input.value = 'Use 20 squares';
  const cancelled = nodes.form.events.submit({ preventDefault() {} });
  assert.equal(nodes.input.readOnly, true);
  nodes.close.events.click();
  assert.equal(nodes.dialog.open, false);
  assert.equal(overlayStates.at(-1), false);
  assert.equal(nodes.input.readOnly, false);
  assert.equal(nodes.form.attributes['aria-busy'], 'false');
  const logCount = logs.mock.callCount();
  const revealsBeforeCancel = nodes.editor.animations.length;
  prompt.reset();
  assert.equal(nodes.connection.hidden, true);
  finish({ ok: true, json: async () => ({ message: { content: '{"count":20}' } }) });
  await cancelled;
  assert.equal(logs.mock.callCount(), logCount);
  assert.equal(nodes.editor.animations.length, revealsBeforeCancel);
  assert.equal(nodes.input.value, '');
  assert.equal(nodes.input.placeholder, 'Describe a change…');
  assert.doesNotMatch(nodes.status.textContent, /Use 12 squares|Use 20 squares/);
  // Closing cancels a pending reveal; reduced-motion users see text immediately.
  prompt.reset(numeric);
  nodes.button.events.click();
  const closingReveal = nodes.editor.animations.at(-1);
  nodes.close.events.click();
  assert.equal(closingReveal.cancelled, true);
  reducedMotion = true;
  const beforeReduced = nodes.editor.animations.length;
  nodes.button.events.click();
  assert.equal(nodes.editor.animations.length, beforeReduced);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ message: { content: '{"count":12}' } }) }));
  nodes.input.value = 'Use 12 squares';
  await nodes.form.events.submit({ preventDefault() {} });
  assert.equal(nodes.editor.animations.length, beforeReduced);
  assert.deepEqual(applied, { count: 12 });
  prompt.reset();
});
