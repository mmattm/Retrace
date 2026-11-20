import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

test('Three drawing runtime loads its sketch, maps pixels in 2D, supports thick paths and preserves playback/export state', async () => {
  const callbacks = new Map(), events = {}, deltas = [];
  let id = 0, initialized = false, geometryDisposed = false, materialDisposed = false;
  // Use real Three geometry and cameras; replace only the GPU renderer for Node.
  class Renderer {
    domElement = { setAttribute() {} };
    constructor(options) { this.options = options; }
    setPixelRatio(ratio) { this.ratio = ratio; }
    setClearColor() {}
    setSize(width, height) { this.width = width; this.height = height; this.domElement.width = width * this.ratio; this.domElement.height = height * this.ratio; }
    getViewport(target) { return target.set(0, 0, this.width, this.height); }
    render(scene, camera) { assert(initialized); scene.updateMatrixWorld(); camera.updateMatrixWorld(); }
    dispose() { this.disposed = true; }
  }
  const context = vm.createContext({
    THREE: { ...THREE, WebGLRenderer: Renderer }, Line2, LineGeometry, LineMaterial,
    requestAnimationFrame: fn => { callbacks.set(++id, fn); return id; },
    cancelAnimationFrame: key => callbacks.delete(key),
    addEventListener: (name, fn) => { events[name] = fn; },
    document: { createElement: () => ({}) },
  });
  context.window = context;
  context.document.head = { append(script) {
    assert.equal(script.src, '/drawing.js');
    assert.equal(context.sketchRuntime.engine, 'three');
    assert.equal(context.THREE.Line2, Line2);
    context.setup = async () => {
      await Promise.resolve();
      const geometry = new context.THREE.LineGeometry();
      geometry.setPositions([10, 10, 0, 100, 10, 0, 100, 100, 0]);
      const material = new context.THREE.LineMaterial({ color: 0xffffff, linewidth: 4 });
      geometry.addEventListener('dispose', () => { geometryDisposed = true; });
      material.addEventListener('dispose', () => { materialDisposed = true; });
      context.sketchRuntime.scene.add(new context.THREE.Line2(geometry, material));
      initialized = true;
    };
    context.draw = delta => deltas.push(delta);
    script.onload();
  } };
  const source = readFileSync(new URL('./three.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  const runtime = await context.createThreeRuntime({ clientWidth: 800, clientHeight: 600, prepend() {} }, '/drawing.js');
  assert.equal(runtime.ready, true); assert.equal(runtime.isPlaying(), true);
  assert.equal(runtime.renderer.domElement.width, 1600);
  assert.equal(runtime.renderer.domElement.height, 1200);
  assert.equal(runtime.renderer.options.preserveDrawingBuffer, true);
  assert.equal(runtime.camera.isOrthographicCamera, true);
  const point = (x, y) => runtime.scene.localToWorld(new THREE.Vector3(x, y, 0)).project(runtime.camera);
  assert(Math.abs(point(0, 0).x + 1) < 1e-9); assert(Math.abs(point(0, 0).y - 1) < 1e-9);
  assert(Math.abs(point(800, 600).x - 1) < 1e-9); assert(Math.abs(point(800, 600).y + 1) < 1e-9);
  const line = runtime.scene.children[0];
  line.onBeforeRender(runtime.renderer);
  assert.equal(line.material.linewidth, 4);
  assert.deepEqual(line.material.resolution.toArray(), [800, 600]);
  const tick = time => { const [key, fn] = callbacks.entries().next().value; callbacks.delete(key); fn(time); };
  tick(1000); tick(1016); assert.equal(deltas.at(-1), 0.016);
  runtime.pause(); assert.equal(callbacks.size, 0); assert.equal(runtime.getFPS(), 0);
  runtime.resize(400, 300);
  assert.equal(runtime.isPlaying(), false); assert.equal(deltas.at(-1), 0);
  assert.equal(runtime.renderer.domElement.width, 800);
  assert(Math.abs(point(400, 300).x - 1) < 1e-9); assert(Math.abs(point(400, 300).y + 1) < 1e-9);
  line.onBeforeRender(runtime.renderer); assert.deepEqual(line.material.resolution.toArray(), [400, 300]);
  runtime.play(); tick(60000); assert.equal(deltas.at(-1), 0);
  assert.equal(runtime.exportSVG, undefined);
  events.pagehide();
  assert.equal(callbacks.size, 0); assert(geometryDisposed); assert(materialDisposed); assert(runtime.renderer.disposed);
});
