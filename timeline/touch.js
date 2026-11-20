// Safari exposes these gestures separately from Pointer Events and CSS touch-action.
export function installTouchGuards(target) {
  for (const name of ['gesturestart', 'gesturechange']) {
    target.addEventListener(name, event => event.preventDefault(), { passive: false });
  }
  target.addEventListener('selectstart', event => {
    const element = event.target?.closest ? event.target : event.target?.parentElement;
    if (element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
    event.preventDefault();
  });
}
