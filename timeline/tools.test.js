import test from 'node:test';
import assert from 'node:assert/strict';
import { copyCanvas, drawCropped, getCrop } from './tools.js';

test('export crops centrally without stretching portrait or landscape images', () => {
  for (const [width, height, crop] of [
    [600, 400, [0, 0, 1200, 800]],
    [900, 1600, [375, 0, 450, 800]],
    [1600, 900, [0, 62.5, 1200, 675]],
  ]) {
    let args;
    let saved = 0;
    const context = {
      save() { saved++; }, restore() { saved--; },
      setTransform(...matrix) { assert.deepEqual(matrix, [1, 0, 0, 1, 0, 0]); },
      clearRect() {}, drawImage(...values) { args = values; },
    };
    const source = { width: 1200, height: 800 };
    drawCropped(source, { width, height, getContext: () => context });
    assert.equal(args[0], source);
    assert.deepEqual(args.slice(1, 5), crop);
    assert.deepEqual(args.slice(5), [0, 0, width, height]);
    assert.equal(width / args[3], height / args[4]);
    assert.equal(saved, 0);
  }
});

test('a repositioned crop stays inside the source for every export format', () => {
  for (const source of [{ width: 1200, height: 800 }, { width: 600, height: 1400 }]) {
    for (const [width, height] of [[1080, 1920], [1920, 1080], [1600, 1200], [1200, 1600], [1600, 2000], [2000, 1600], [2000, 2828], [2828, 2000], [373, 911]]) {
      for (const position of [{ x: -1, y: -1 }, { x: 0.5, y: 0.5 }, { x: 2, y: 2 }]) {
        const crop = getCrop(source, { width, height }, position);
        assert(crop.x >= -1e-9 && crop.y >= -1e-9);
        assert(crop.x + crop.width <= source.width + 1e-9);
        assert(crop.y + crop.height <= source.height + 1e-9);
        assert(Math.abs(crop.width / crop.height - width / height) < 1e-9);
        assert(Math.abs(crop.width - source.width) < 1e-9 || Math.abs(crop.height - source.height) < 1e-9);
      }
    }
  }
});

test('PNG uses the same off-center rectangle as the preview frame', () => {
  const source = { width: 1200, height: 800 };
  const position = { x: 1, y: 0 };
  const target = { width: 900, height: 1600 };
  const crop = getCrop(source, target, position);
  assert.deepEqual(crop, { x: 750, y: 0, width: 450, height: 800 });
  let pixels;
  target.getContext = () => ({ save() {}, restore() {}, setTransform() {}, clearRect() {},
    drawImage(...args) { pixels = args; } });
  drawCropped(source, target, position);
  assert.deepEqual(pixels, [source, crop.x, crop.y, crop.width, crop.height, 0, 0, 900, 1600]);
});

test('a snapshot preserves the canvas pixel resolution and excludes surrounding HTML', () => {
  let pixels;
  const copy = { getContext: () => ({ drawImage: (...args) => { pixels = args; } }) };
  const source = { width: 2560, height: 1440, ownerDocument: { createElement: name => {
    assert.equal(name, 'canvas');
    return copy;
  } } };
  assert.equal(copyCanvas(source), copy);
  assert.equal(copy.width, 2560);
  assert.equal(copy.height, 1440);
  assert.deepEqual(pixels, [source, 0, 0]);
});
