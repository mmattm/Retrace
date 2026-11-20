import { copyCanvas, drawCropped, getCrop } from './tools.js';
import { getSketchRuntime } from './runtime.js';
import { createPaperRuntime } from './paper.js';
import { installTouchGuards } from './touch.js';
import { enhanceTextFields } from './fields.js';

installTouchGuards(document);

// Register before p5 starts: render at 2× density before setup draws anything.
window.p5?.registerAddon((p5, prototype) => {
  const createCanvas = prototype.createCanvas;
  prototype.createCanvas = function (...args) {
    const canvas = createCanvas.apply(this, args);
    this.pixelDensity(2);
    return canvas;
  };
});

// Shared layout: resize the selected engine to fit its workspace and controls.
const stage = document.getElementById('sketch-stage');
if (document.body.dataset.engine === 'paper') await createPaperRuntime(stage);
if (document.body.dataset.engine === 'three') {
  const { createThreeRuntime } = await import('./three.js');
  await createThreeRuntime(stage, document.body.dataset.sketch);
}
const recordingRegion = document.createElement('div');
recordingRegion.className = 'recording-region';
recordingRegion.hidden = true;
recordingRegion.setAttribute('aria-hidden', 'true');
stage.append(recordingRegion);
let recordingCrop = null;
let scheduled = false;
let drag = null;
let reportedControlsState = '';
let announcedSketch = false;
let pausedImage = null;
let pausedFrame = -1;

window.addEventListener('poster-mode', ({ detail: { mode } }) => {
  if (!['off', 'portrait', 'landscape'].includes(mode)) return;
  document.body.dataset.posterMode = mode;
  scheduleLayout();
});

window.addEventListener('recording-region', ({ detail }) => {
  recordingCrop = detail;
  recordingRegion.hidden = !detail;
  scheduleLayout();
});

function setControlsOpen(open) {
  document.body.classList.toggle('controls-hidden', !open);
  if (!open) {
    drag = null;
    document.body.classList.remove('is-resizing-sidebar');
  }
  scheduleLayout();
}

window.addEventListener('toggle-controls', () => {
  setControlsOpen(document.body.classList.contains('controls-hidden'));
});
window.addEventListener('interface-visibility', ({ detail: { hidden } }) => {
  document.body.classList.toggle('interface-hidden', hidden);
  if (hidden) {
    drag = null;
    document.body.classList.remove('is-resizing-sidebar');
  }
  scheduleLayout();
});
window.addEventListener('agent-overlay', ({ detail: { open } }) => {
  document.body.classList.toggle('agent-overlay-active', open);
  scheduleLayout();
});

// One shared separator handles both the right sidebar and its mobile layout.
const resizer = document.createElement('div');
resizer.className = 'sidebar-resizer';
resizer.tabIndex = 0;
resizer.title = 'Drag to resize parameters';
resizer.setAttribute('role', 'separator');
resizer.setAttribute('aria-label', 'Resize parameters');
resizer.setAttribute('aria-controls', 'sketch-controls');
document.body.append(resizer);

const isVerticalLayout = () => window.matchMedia('(max-width: 700px)').matches;

function setSidebarSize(size, vertical) {
  const minimum = vertical ? 48 : 180;
  const maximum = Math.max(minimum, (vertical ? window.innerHeight : window.innerWidth) * 0.6);
  const value = Math.round(Math.max(minimum, Math.min(maximum, size)));
  document.body.style.setProperty(vertical ? '--sidebar-height' : '--sidebar-width', `${value}px`);
}

resizer.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || drag) return;
  const controls = document.getElementById('sketch-controls');
  if (!controls) return;
  const vertical = isVerticalLayout();
  const bounds = controls.getBoundingClientRect();
  drag = {
    id: event.pointerId, vertical,
    start: vertical ? event.clientY : event.clientX,
    size: vertical ? bounds.height : bounds.width,
  };
  event.preventDefault();
  resizer.setPointerCapture(event.pointerId);
  document.body.style.setProperty('--resize-cursor', vertical ? 'row-resize' : 'col-resize');
  document.body.classList.add('is-resizing-sidebar');
});

resizer.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  // Moving the left/top boundary inward makes the panel larger.
  const position = drag.vertical ? event.clientY : event.clientX;
  setSidebarSize(drag.size + drag.start - position, drag.vertical);
});

for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  resizer.addEventListener(name, (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    document.body.classList.remove('is-resizing-sidebar');
  });
}

resizer.addEventListener('keydown', (event) => {
  const vertical = isVerticalLayout();
  const increase = vertical ? 'ArrowUp' : 'ArrowLeft';
  const decrease = vertical ? 'ArrowDown' : 'ArrowRight';
  if (event.key !== increase && event.key !== decrease) return;
  const controls = document.getElementById('sketch-controls');
  if (!controls) return;
  event.preventDefault();
  const bounds = controls.getBoundingClientRect();
  setSidebarSize((vertical ? bounds.height : bounds.width) + (event.key === increase ? 10 : -10), vertical);
});

function scheduleLayout() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const controls = document.getElementById('sketch-controls');
    enhanceTextFields(controls);
    const available = Boolean(controls?.children.length);
    // Keep the sidebar preference separate from temporarily hiding all UI with H.
    const expanded = !document.body.classList.contains('controls-hidden');
    const open = available && expanded
      && !document.body.classList.contains('interface-hidden');
    const interactive = open && !document.body.classList.contains('agent-overlay-active');
    document.body.classList.toggle('has-controls', available);
    resizer.inert = !interactive;
    if (controls) {
      controls.inert = !interactive;
      controls.setAttribute('aria-hidden', String(!open));
    }
    if (available) {
      controls.setAttribute('role', 'complementary');
      controls.setAttribute('aria-label', 'Parameters');
      const vertical = isVerticalLayout();
      const bounds = controls.getBoundingClientRect();
      resizer.setAttribute('aria-orientation', vertical ? 'horizontal' : 'vertical');
      resizer.setAttribute('aria-valuemin', vertical ? '48' : '180');
      resizer.setAttribute('aria-valuemax', String(Math.round(Math.max(vertical ? 48 : 180,
        (vertical ? window.innerHeight : window.innerWidth) * 0.6))));
      resizer.setAttribute('aria-valuenow', String(Math.round(vertical ? bounds.height : bounds.width)));
    }
    const state = `${available}:${open}:${expanded}`;
    if (state !== reportedControlsState) {
      reportedControlsState = state;
      window.frameElement?.dispatchEvent(new CustomEvent('controls-state', { detail: { available, open, expanded } }));
    }
    const canvas = stage.querySelector('canvas');
    const runtime = getSketchRuntime(window);
    if (!canvas || !runtime) return;
    const width = Math.max(1, Math.floor(stage.clientWidth));
    const height = Math.max(1, Math.floor(stage.clientHeight));
    // Skip unchanged sizes and let the normal draw loop render the next frame.
    if (runtime.width !== width || runtime.height !== height) {
      const paused = runtime.engine === 'p5' && !runtime.isPlaying();
      // Reuse the same paused image across layout changes to avoid repeated cropping.
      if (paused && (!pausedImage || pausedFrame !== runtime.frame)) {
        pausedImage = copyCanvas(canvas);
        pausedFrame = runtime.frame;
      }
      if (!paused) pausedImage = null;
      runtime.resize(width, height);
      if (paused) drawCropped(pausedImage, canvas);
    }
    if (recordingCrop) {
      const crop = getCrop(canvas, recordingCrop.size, recordingCrop.position);
      Object.assign(recordingRegion.style, {
        left: `${crop.x / canvas.width * 100}%`, top: `${crop.y / canvas.height * 100}%`,
        width: `${crop.width / canvas.width * 100}%`, height: `${crop.height / canvas.height * 100}%`,
      });
    }
    if (!announcedSketch) {
      if (runtime.ready) {
        announcedSketch = true;
        window.frameElement?.dispatchEvent(new Event('sketch-ready'));
      } else scheduleLayout();
    }
  });
}

new ResizeObserver(scheduleLayout).observe(stage);
// Sketches may create their canvas and controls asynchronously in setup().
new MutationObserver(scheduleLayout).observe(document.body, { childList: true, subtree: true });
scheduleLayout();
