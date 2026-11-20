import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBrowserTab, supportsTabCapture } from './video.js';

function browser(t, { surface = 'browser', playError = null, permissionError = null } = {}) {
  let stopped = 0;
  let options;
  const track = { getSettings: () => ({ displaySurface: surface }), stop() { stopped++; } };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const video = { videoWidth: 1600, videoHeight: 900, async play() { if (playError) throw playError; }, pause() {} };
  const globals = {
    navigator: { mediaDevices: { async getDisplayMedia(value) {
      options = value;
      if (permissionError) throw permissionError;
      return stream;
    } } },
    document: { createElement(tag) { assert.equal(tag, 'video'); return video; } },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  return { video, track, stream, get stopped() { return stopped; }, get options() { return options; } };
}

test('UI recording requests a tab without audio and releases sharing when stopped', async t => {
  const env = browser(t);
  assert(supportsTabCapture());
  const capture = await captureBrowserTab();
  assert.equal(env.options.audio, false);
  assert.equal(env.options.video.displaySurface, 'browser');
  assert.equal(env.options.video.frameRate, 60);
  assert.equal(env.options.preferCurrentTab, true);
  assert.equal(capture.track, env.track);
  assert.equal(env.video.srcObject, env.stream);
  capture.stop();
  capture.stop();
  assert.equal(env.stopped, 1);
  assert.equal(env.video.srcObject, null);
});

test('window capture output preserves its actual proportions at the selected longest side', async t => {
  const env = browser(t);
  const capture = await captureBrowserTab();
  for (const [width, height, longestSide, expected] of [
    [1600, 900, 2048, { width: 2048, height: 1152 }],
    [900, 1600, 2048, { width: 1152, height: 2048 }],
    [1200, 1200, 1920, { width: 1920, height: 1920 }],
    [3440, 1440, 2048, { width: 2048, height: 858 }],
  ]) {
    env.video.videoWidth = width;
    env.video.videoHeight = height;
    const size = capture.getSize(longestSide);
    assert.deepEqual(size, expected);
    assert.equal(Math.max(size.width, size.height), longestSide);
    assert.equal(size.width % 2, 0);
    assert.equal(size.height % 2, 0);
    assert(Math.abs(size.width / size.height - width / height) < 0.005);
  }
  env.video.videoWidth = 0;
  assert.throws(() => capture.getSize(2048), /unavailable/);
  capture.stop();
});

test('the complete interface remains visible if the captured window changes proportions', async t => {
  const env = browser(t);
  const capture = await captureBrowserTab();
  for (const [width, height, expected] of [
    [1920, 1080, [0, 0, 1920, 1080]],
    [1080, 1920, [0, 656.25, 1080, 607.5]],
  ]) {
    let pixels;
    let background;
    const context = { save() {}, restore() {}, setTransform() {}, fillRect(...args) { background = args; },
      drawImage(...args) { pixels = args; } };
    capture.draw({ width, height, getContext: () => context });
    assert.deepEqual(background, [0, 0, width, height]);
    assert.equal(context.fillStyle, '#000');
    assert.deepEqual(pixels, [env.video, ...expected]);
  }
  capture.stop();
});

test('choosing an entire screen stops that stream and asks for a browser tab', async t => {
  const env = browser(t, { surface: 'monitor' });
  await assert.rejects(captureBrowserTab(), /Select this browser tab/);
  assert.equal(env.stopped, 1);
  assert.equal(env.video.srcObject, null);
});

test('a failed video player releases the granted stream', async t => {
  const error = new Error('Cannot play shared video');
  const env = browser(t, { playError: error });
  await assert.rejects(captureBrowserTab(), error);
  assert.equal(env.stopped, 1);
});

test('cancelling the browser chooser preserves the permission error and creates no recording', async t => {
  const error = new DOMException('Cancelled', 'NotAllowedError');
  const env = browser(t, { permissionError: error });
  await assert.rejects(captureBrowserTab(), error);
  assert.equal(env.stopped, 0);
  assert.equal(env.video.srcObject, undefined);
});
