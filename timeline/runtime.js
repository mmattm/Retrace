// Paper and Three provide this bridge; archived p5 sketches keep their globals.
export function getSketchRuntime(win) {
  if (win?.sketchRuntime) return win.sketchRuntime;
  if (typeof win?.isLooping !== 'function') return null;
  return {
    engine: 'p5',
    get ready() { return win.frameCount > 0; },
    get frame() { return win.frameCount; },
    get width() { return win.width; },
    get height() { return win.height; },
    isPlaying: () => win.isLooping(),
    play: () => win.loop(),
    pause: () => win.noLoop(),
    getFPS: () => win.frameRate(),
    resize: (width, height) => win.resizeCanvas(width, height, true),
  };
}
