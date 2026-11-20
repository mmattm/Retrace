import test from 'node:test';
import assert from 'node:assert/strict';
import { installTouchGuards } from './touch.js';

test('Safari zoom gestures are blocked without intercepting drawing, scrolling or text editing', () => {
  const target = new EventTarget();
  installTouchGuards(target);
  for (const name of ['gesturestart', 'gesturechange']) {
    const event = new Event(name, { cancelable: true });
    target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'touchmove', 'input']) {
    const event = new Event(name, { cancelable: true });
    target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
});

test('accidental interface selection is blocked while editable fields keep native selection', () => {
  const target = new EventTarget();
  installTouchGuards(target);
  const selection = new Event('selectstart', { cancelable: true });
  target.dispatchEvent(selection);
  assert.equal(selection.defaultPrevented, true);
  target.closest = () => ({});
  const editable = new Event('selectstart', { cancelable: true });
  target.dispatchEvent(editable);
  assert.equal(editable.defaultPrevented, false);
});
