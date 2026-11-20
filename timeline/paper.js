// Paper.js 0.17.0 draws retained vector paths into the same shared canvas layout.
export async function createPaperRuntime(stage) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Vector sketch');
  stage.prepend(canvas);
  const scope = window.paper;
  scope.setup(canvas);
  const view = scope.view;
  view.autoUpdate = false;
  // Paper exposes pixelRatio as read-only. Its pinned CanvasView implementation
  // uses this backing value when resizing, preserving logical coordinates at 2×.
  view._pixelRatio = 2;
  view.viewSize = new scope.Size(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
  view._setElementSize(view.viewSize.width, view.viewSize.height);
  let running = false, animation = null, previous = null, frames = 0, fps = 60;

  function render(delta = 0) {
    window.draw?.(delta);
    view.update();
    frames++;
  }
  function tick(time) {
    if (!running) return;
    const delta = previous === null ? 0 : Math.min(0.067, (time - previous) / 1000);
    previous = time;
    if (delta > 0) fps += (1 / delta - fps) * 0.1;
    render(delta);
    animation = requestAnimationFrame(tick);
  }
  const runtime = {
    engine: 'paper',
    get ready() { return frames > 0; },
    get frame() { return frames; },
    get width() { return view.viewSize.width; },
    get height() { return view.viewSize.height; },
    isPlaying: () => running,
    getFPS: () => running ? fps : 0,
    play() {
      if (running) return;
      running = true;
      previous = null;
      animation = requestAnimationFrame(tick);
    },
    pause() {
      running = false;
      cancelAnimationFrame(animation);
      animation = null;
    },
    resize(width, height) {
      view.viewSize = new scope.Size(width, height);
      render(); // Vector paths redraw sharply, including while paused.
    },
    redraw: () => render(),
    snapshotSVG: () => scope.project.exportSVG({ bounds: 'view' }),
    exportSVG({ width, height, crop, snapshot }) {
      // Freeze vectors with the preview, so resizing the window cannot change the export.
      const svg = (snapshot ?? runtime.snapshotSVG()).cloneNode(true);
      svg.setAttribute('viewBox', [crop.x, crop.y, crop.width, crop.height].map(value => value / 2).join(' '));
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      return new XMLSerializer().serializeToString(svg);
    },
  };
  window.sketchRuntime = runtime;
  await window.setup?.();
  render();
  runtime.play();
  window.addEventListener('pagehide', () => runtime.pause(), { once: true });
  return runtime;
}
