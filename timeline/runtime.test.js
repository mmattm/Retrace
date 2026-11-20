import test from 'node:test';
import assert from 'node:assert/strict';
import { getSketchRuntime } from './runtime.js';

test('archived p5 globals support shared playback and resizing without changing their source', () => {
  let running = true;
  const win = {
    frameCount: 1, width: 800, height: 600, isLooping: () => running,
    loop() { running = true; }, noLoop() { running = false; }, frameRate: () => 59.7,
    resizeCanvas(width, height, skipDraw) { this.width = width; this.height = height; assert.equal(skipDraw, true); },
  };
  const runtime = getSketchRuntime(win);
  assert.equal(runtime.ready, true);
  runtime.pause(); assert.equal(runtime.isPlaying(), false);
  runtime.play(); assert.equal(runtime.isPlaying(), true);
  runtime.resize(1024, 768);
  assert.equal(runtime.width, 1024); assert.equal(runtime.height, 768);
  assert.equal(runtime.getFPS(), 59.7);
  win.frameCount = 0; assert.equal(runtime.ready, false);
  assert.equal(getSketchRuntime({}), null);
});

test('Paper provides its own bridge without needing any p5 global', () => {
  const paper = { engine: 'paper', ready: true, isPlaying: () => true };
  assert.equal(getSketchRuntime({ sketchRuntime: paper }), paper);
});
