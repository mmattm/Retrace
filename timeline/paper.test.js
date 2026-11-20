import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaperRuntime } from './paper.js';

test('Paper runtime waits for setup, preserves 2× density, pauses time and exports the selected vector crop', async t => {
  const names = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'XMLSerializer'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  t.after(() => names.forEach(name => {
    if (previous[name] === undefined) delete globalThis[name]; else globalThis[name] = previous[name];
  }));
  const callbacks = new Map(), deltas = [];
  let id = 0, setupDone = false, crop;
  const canvas = { setAttribute() {} };
  const view = {
    _pixelRatio: 1, update() {},
    _setElementSize(width, height) { canvas.width = width * this._pixelRatio; canvas.height = height * this._pixelRatio; },
    set viewSize(size) { this.size = size; this._setElementSize(size.width, size.height); },
    get viewSize() { return this.size; },
  };
  const svg = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
    cloneNode() { return { ...this, attributes: { ...this.attributes } }; } };
  globalThis.window = {
    paper: {
      setup() {}, view,
      Size: class { constructor(width, height) { this.width = width; this.height = height; } },
      Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
      project: { exportSVG({ bounds }) { crop = bounds; return svg; } },
    },
    async setup() { await Promise.resolve(); setupDone = true; },
    draw(delta) { assert(setupDone); deltas.push(delta); },
    addEventListener() {},
  };
  globalThis.document = { createElement: () => canvas };
  globalThis.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = key => callbacks.delete(key);
  globalThis.XMLSerializer = class { serializeToString(node) { return JSON.stringify(node.attributes); } };
  const stage = { clientWidth: 800, clientHeight: 600, prepend(node) { assert.equal(node, canvas); } };
  const runtime = await createPaperRuntime(stage);
  assert.equal(runtime.ready, true); assert.equal(runtime.isPlaying(), true);
  assert.equal(canvas.width, 1600); assert.equal(canvas.height, 1200);
  const tick = time => {
    const [key, callback] = callbacks.entries().next().value;
    callbacks.delete(key); callback(time);
  };
  tick(1000); tick(1016);
  assert.equal(deltas.at(-1), 0.016);
  runtime.pause(); assert.equal(callbacks.size, 0); assert.equal(runtime.getFPS(), 0);
  runtime.resize(600, 400);
  assert.equal(canvas.width, 1200); assert.equal(canvas.height, 800);
  assert.equal(runtime.isPlaying(), false); assert.equal(deltas.at(-1), 0);
  const snapshot = runtime.snapshotSVG().cloneNode(true);
  svg.attributes['data-changed'] = 'after capture';
  const exported = JSON.parse(runtime.exportSVG({ width: 1920, height: 1080,
    crop: { x: 300, y: 0, width: 600, height: 800 }, snapshot }));
  assert.equal(crop, 'view');
  assert.deepEqual(exported, { width: 1920, height: 1080, viewBox: '150 0 300 400' });
  runtime.play(); tick(60000); assert.equal(deltas.at(-1), 0);
  tick(60016); assert.equal(deltas.at(-1), 0.016);
  runtime.pause();
});
