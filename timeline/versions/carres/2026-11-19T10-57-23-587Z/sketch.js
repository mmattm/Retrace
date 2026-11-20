// Engine: p5.js
/**
 * Alternating nested squares animated with Perlin noise.
 * Reference: Transformation 74.311 (1974), Vera Molnár.
 * Image: references/vera-molnar-transformation-74-311-1974.png
 *
 * Drawing from largest to smallest creates alternating white and black bands.
 * Nearby noise samples make neighboring squares drift together.
 * The agent can adjust every creative setting in CONFIG.
 * The visible interface keeps its single count slider, using the same object.
 */
const CONFIG = {
  count: 20,         // Number of squares: an integer from 1 to 50.
  minSize: 28,       // Smallest square: 1–2000 logical pixels, no larger than maxSize.
  maxSize: 420,      // Largest square: 1–2000 logical pixels, no smaller than minSize.
  amplitude: 32,     // Maximum drift: 0–500 logical pixels; 0 removes displacement.
  noiseStep: 0.12,   // Neighboring noise samples: 0–2; smaller values link their motion.
  rotation: 0.12,    // Maximum tilt: 0–PI radians; 0.12 is about 7 degrees.
  deformation: 0.08, // Side-length variation: 0–0.9; 0.08 means ±8%.
  speed: 0.006,     // Noise time step: 0–0.1 at 60 fps; 0 freezes movement.
};

let time = 0;

async function setup() {
  // The shared preview adjusts the canvas to the footer and responsive sidebar.
  createCanvas(windowWidth, windowHeight);
  rectMode(CENTER);
  noStroke();
  frameRate(60);
  const { createUI } = await import('./ui.js');
  const pane = createUI(CONFIG);

  // The shared agent validates numbers against this version's agent.json.
  // Return a copy so reading the state cannot change the drawing's configuration.
  window.sketchAgent = {
    getState: () => ({ ...CONFIG }),
    applyParameters(values) {
      const next = { ...CONFIG, ...values };
      // Check the relationship before committing anything, including count.
      if (next.minSize > next.maxSize) {
        throw new Error('Minimum size must not exceed maximum size.');
      }
      Object.assign(CONFIG, next);
      pane.refresh(); // Keep the count slider in sync with the agent.
      if (!isLooping()) redraw(); // Update a paused image without resuming playback.
    },
  };
  describe('Nested black and white squares move organically. A slider changes their number; a text agent also controls their sizes, drift, rotation, deformation and speed.');
}

function draw() {
  // An opaque background clears the previous image instead of leaving trails.
  background(0);
  // deltaTime is in milliseconds; this keeps the noise motion frame-rate independent.
  time += CONFIG.speed * deltaTime / (1000 / 60);

  push();
  translate(width / 2, height / 2);

  for (let i = CONFIG.count - 1; i >= 0; i--) {
    // A 0–1 ratio spreads square sizes between minSize and maxSize.
    // Math.max also handles the single-square case without division by zero.
    const ratio = i / Math.max(1, CONFIG.count - 1);
    const size = CONFIG.minSize + ratio * (CONFIG.maxSize - CONFIG.minSize);
    const sample = i * CONFIG.noiseStep;

    // Noise varies smoothly from 0 to 1; multiplying by 2 and subtracting 1
    // centers it around zero. Larger squares receive more displacement.
    const amplitude = CONFIG.amplitude * ratio;
    const x = (noise(sample, time) * 2 - 1) * amplitude;
    const y = (noise(sample + 100, time) * 2 - 1) * amplitude;

    // Different sample offsets separate horizontal, vertical and rotational motion.
    // Slower time factors make the side lengths breathe gradually.
    const tilt = (noise(sample + 200, time * 0.7) * 2 - 1) * CONFIG.rotation;
    const w = size * (1 + CONFIG.deformation * (noise(sample + 300, time * 0.6) * 2 - 1));
    const h = size * (1 + CONFIG.deformation * (noise(sample + 400, time * 0.6) * 2 - 1));

    // Isolate each square's translation and rotation from its neighbors.
    push();
    translate(x, y);
    rotate(tilt);
    const layer = CONFIG.count - 1 - i;
    fill(layer % 2 === 0 ? 255 : 0);
    rect(0, 0, w, h);
    pop();
  }
  pop();
}
