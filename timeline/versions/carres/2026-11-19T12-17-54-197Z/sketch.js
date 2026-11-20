// Engine: p5.js
/**
 * Repeated compositions of nested squares, inspired by Vera Molnár.
 * Reference: Transformation 74.311 (1974).
 * Image: references/vera-molnar-transformation-74-311-1974.png
 *
 * One small motif becomes a family of compositions through repetition,
 * palette and shared rules. The Agent controls CONFIG; the slider changes
 * the number of squares inside each instance, not the number of copies.
 */
const CONFIG = {
  count: 20,          // Squares per instance: 1–50.
  minSize: 28,        // Smallest side: 1–2000 logical pixels, <= maxSize.
  maxSize: 420,       // Largest side: 1–2000 logical pixels.
  amplitude: 32,      // Noise-driven drift: 0–500 logical pixels.
  noiseStep: 0.12,    // Neighboring noise samples: 0–2; low values coordinate motion.
  rotation: 0.12,     // Noise-driven tilt: 0–PI radians; 0 keeps layers upright.
  deformation: 0.08,  // Relative side-length variation: 0–0.9; 0.08 means ±8%.
  speed: 0.006,       // Noise time step at 60 fps: 0–0.1.
  instances: 4,       // Copies of the entire motif: 1–16.
  layout: 'grid',     // grid, row, column or ring.
  columns: 2,         // Columns in a grid: 1–8.
  spacing: 1,         // Distance between instance centers: 0–2; 0 overlaps them.
  scale: 1,           // Multiplier on the layout's fitted motif size: 0.1–3.
  offsetX: 0,         // Composition offset: -1 is left edge, +1 is right edge.
  offsetY: 0,         // Composition offset: -1 is top edge, +1 is bottom edge.
  globalRotation: 0,  // Base orientation of the whole composition: -PI–PI radians.
  spin: 0,            // Rotation speed of the whole composition: -2–2 radians/sec.
  phaseStep: 0.8,     // Noise-time offset between instances: 0–2*PI; 0 synchronizes.
  filled: true,       // false draws outlines instead of solid nested bands.
  fillMode: 'alternating', // alternating colors or a gradient through the layers.
  strokeWidth: 2,     // Outline thickness before instance scaling: 0.5–16 pixels.
  roundness: 0,       // Corner radius as a fraction of the shortest side: 0–0.5.
  opacity: 1,         // Shape opacity: 0–1; the background remains opaque.
  colorA: '#ffffff',  // First band or gradient endpoint, as #RRGGBB.
  colorB: '#000000',  // Second band or gradient endpoint, as #RRGGBB.
  backgroundColor: '#000000', // Canvas background, as #RRGGBB.
};

let time = 0;
let spinAngle = 0;

async function setup() {
  // The shared preview supplies responsive layout and 2× pixel density.
  createCanvas(windowWidth, windowHeight);
  rectMode(CENTER);
  frameRate(60);
  const { createUI } = await import('./ui.js');
  const pane = createUI(CONFIG);

  window.sketchAgent = {
    getState: () => ({ ...CONFIG }),
    applyParameters(values) {
      // The shared validator checks each value; the sketch checks relationships.
      const next = { ...CONFIG, ...values };
      if (next.minSize > next.maxSize) throw new Error('Minimum size must not exceed maximum size.');
      Object.assign(CONFIG, next);
      pane.refresh();
      if (!isLooping()) redraw();
    },
  };
  describe('Repeated nested squares with configurable colors, layout, outlines, transparency and organic motion. A text Agent controls the composition; a slider changes the squares per instance.');
}

function instanceLayout(index) {
  // A single motif keeps its original size and centered position.
  if (CONFIG.instances === 1) return { x: 0, y: 0, fit: 1 };
  let x, y, cell;
  if (CONFIG.layout === 'ring') {
    const angle = index / CONFIG.instances * Math.PI * 2;
    const radius = Math.min(width, height) * 0.32 * CONFIG.spacing;
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
    cell = Math.min(width, height) * Math.min(0.5, 1.5 / CONFIG.instances);
  } else {
    const columns = CONFIG.layout === 'row' ? CONFIG.instances
      : CONFIG.layout === 'column' ? 1 : Math.min(CONFIG.columns, CONFIG.instances);
    const rows = Math.ceil(CONFIG.instances / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    x = (index % columns - (columns - 1) / 2) * cellWidth * CONFIG.spacing;
    y = (Math.floor(index / columns) - (rows - 1) / 2) * cellHeight * CONFIG.spacing;
    cell = Math.min(cellWidth, cellHeight);
  }
  // Account for tilt, deformation and drift when fitting repeated motifs.
  const extent = CONFIG.maxSize * (1 + CONFIG.deformation) * Math.SQRT2 + 2 * CONFIG.amplitude + CONFIG.strokeWidth;
  return { x, y, fit: Math.min(1, cell * 0.8 / extent) };
}

function draw() {
  background(CONFIG.backgroundColor);
  // Integrate velocities so changing speed does not reset the animation phase.
  // A paused redraw changes the appearance without advancing either clock.
  const seconds = isLooping() ? deltaTime / 1000 : 0;
  time += CONFIG.speed * seconds * 60;
  spinAngle += CONFIG.spin * seconds;

  const a = color(CONFIG.colorA);
  const b = color(CONFIG.colorB);
  // p5 2.3.3 accepts an explicit alpha range; use normalized 0–1 opacity.
  a.setAlpha(CONFIG.opacity, 1);
  b.setAlpha(CONFIG.opacity, 1);
  const palette = Array.from({ length: CONFIG.count }, (_, layer) =>
    CONFIG.fillMode === 'gradient' ? lerpColor(a, b, layer / Math.max(1, CONFIG.count - 1))
      : layer % 2 === 0 ? a : b);

  push();
  translate(width / 2 + CONFIG.offsetX * width / 2, height / 2 + CONFIG.offsetY * height / 2);
  rotate(CONFIG.globalRotation + spinAngle);
  for (let instance = 0; instance < CONFIG.instances; instance++) {
    const layout = instanceLayout(instance);
    push();
    translate(layout.x, layout.y);
    scale(CONFIG.scale * layout.fit);
    drawInstance(instance * CONFIG.phaseStep, palette);
    pop();
  }
  pop();
}

function drawInstance(phase, palette) {
  // Draw largest to smallest so solid layers reveal nested color bands.
  for (let i = CONFIG.count - 1; i >= 0; i--) {
    const ratio = i / Math.max(1, CONFIG.count - 1);
    const size = CONFIG.minSize + ratio * (CONFIG.maxSize - CONFIG.minSize);
    const sample = i * CONFIG.noiseStep;
    const t = time + phase;
    const amplitude = CONFIG.amplitude * ratio;
    const x = (noise(sample, t) * 2 - 1) * amplitude;
    const y = (noise(sample + 100, t) * 2 - 1) * amplitude;
    const tilt = (noise(sample + 200, t * 0.7) * 2 - 1) * CONFIG.rotation;
    const w = size * (1 + CONFIG.deformation * (noise(sample + 300, t * 0.6) * 2 - 1));
    const h = size * (1 + CONFIG.deformation * (noise(sample + 400, t * 0.6) * 2 - 1));
    const ink = palette[CONFIG.count - 1 - i];
    if (CONFIG.filled) { noStroke(); fill(ink); }
    else { noFill(); stroke(ink); strokeWeight(CONFIG.strokeWidth); }
    push();
    translate(x, y);
    rotate(tilt);
    rect(0, 0, w, h, Math.min(w, h) * CONFIG.roundness);
    pop();
  }
}
