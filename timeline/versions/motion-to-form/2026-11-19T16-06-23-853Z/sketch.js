// Engine: Paper.js
// Motion to form in Paper.js: the Agent creates retained vector paths.
// Inspired by Yellowtail (1998), by Golan Levin:
// https://www.flong.com/archive/projects/yellowtail/index.html
// Each shape draws and bends in its own independently timed loop.
// The shared runtime owns the canvas, playback, resizing and 2× pixel density.

const MAX_THICKNESS = 14;
const MAX_AGENT_STROKES = 128;
// Base timing varies per instance; bending stays within 10 logical pixels.
const LINE_MOTION = { period: 4, amplitude: 10 };
// Instances choose independent draw durations and start delays once, when created.
const DRAW_SEQUENCE = { period: 6, startSpread: 1.2 };
const strokes = [];
let lastDrawing = null;
let background;
let animationTime = 0;

function setup() {
  background = new paper.Path.Rectangle({ rectangle: paper.view.bounds, fillColor: 'black' });
  window.sketchAgent = {
    getState: () => ({
      canvasWidth: paper.view.viewSize.width, canvasHeight: paper.view.viewSize.height,
      strokeCount: strokes.length, remainingStrokes: MAX_AGENT_STROKES - strokes.length,
      lastDrawing: structuredClone(lastDrawing),
    }),
    applyDrawing(command) {
      if (command.operation === 'clear' && command.strokes.length) {
        throw new Error('A clear command must not include drawing paths.');
      }
      const added = command.strokes.reduce((sum, plan) => sum + plan.copies, 0);
      if ((command.operation === 'add' ? strokes.length : 0) + added > MAX_AGENT_STROKES) {
        throw new Error(`Drawing limit: ${MAX_AGENT_STROKES} strokes. Clear the drawing or request fewer copies.`);
      }
      // Prepare geometry before removing anything, so invalid commands preserve the scene.
      const prepared = command.strokes.flatMap(makeAgentStrokes);
      if (command.operation !== 'add') {
        for (const gesture of strokes) for (const path of gesture.paths.values()) path.remove();
        strokes.length = 0;
      }
      strokes.push(...prepared);
      if (prepared.length) lastDrawing = structuredClone(command.strokes);
      else if (command.operation !== 'add') lastDrawing = null;
      window.sketchRuntime.redraw();
      return { message: command.operation === 'clear' ? 'Drawing cleared.'
        : `${command.operation === 'replace' ? 'Replaced the drawing with' : 'Added'} ${prepared.length} strokes.` };
    },
  };
}

function draw(delta = 0) {
  // Advance only with playback: paused redraws and exports keep the exact same pose.
  if (delta > 0) animationTime += delta;
  background.bounds = paper.view.bounds;
  for (const gesture of strokes) {
    if (delta > 0) advanceStroke(gesture, delta);
    drawGesture(gesture);
  }
}

function advanceStroke(gesture, delta) {
  const { width, height } = paper.view.viewSize;
  const step = Math.min(4, delta * 60); // Seconds become the original 60 fps movement units.
  if (gesture.motion === 'follow') {
    gesture.carry += gesture.speed * step;
    const steps = Math.floor(gesture.carry);
    gesture.carry -= steps;
    for (let i = 0; i < steps; i++) {
      const first = gesture.points.shift();
      gesture.points.push({ ...first, x: first.x + gesture.dx, y: first.y + gesture.dy });
    }
  } else {
    for (const point of gesture.points) {
      point.x += gesture.vx * step;
      point.y += gesture.vy * step;
    }
  }
  const offsetX = Math.floor(gesture.points[0].x / width) * width;
  const offsetY = Math.floor(gesture.points[0].y / height) * height;
  for (const point of gesture.points) { point.x -= offsetX; point.y -= offsetY; }
}

function drawingProgress(gesture) {
  const elapsed = animationTime - gesture.startedAt;
  if (elapsed <= 0) return 0;
  const phase = (elapsed % gesture.drawPeriod) / gesture.drawPeriod;
  // Draw for 50% of the loop, hold for 20%, erase for 25%, then rest briefly.
  const progress = phase < 0.5 ? phase / 0.5
    : phase < 0.7 ? 1 : phase < 0.95 ? (0.95 - phase) / 0.25 : 0;
  return progress * progress * (3 - 2 * progress); // Smooth acceleration and stopping.
}

function drawGesture(gesture) {
  const { width, height } = paper.view.viewSize;
  const baseXs = gesture.points.map(point => point.x), baseYs = gesture.points.map(point => point.y);
  const span = Math.max(Math.max(...baseXs) - Math.min(...baseXs), Math.max(...baseYs) - Math.min(...baseYs));
  const amplitude = Math.min(LINE_MOTION.amplitude, span * 0.06);
  const elapsed = Math.max(0, animationTime - gesture.startedAt);
  const phase = elapsed * Math.PI * 2 / gesture.wavePeriod + gesture.phase;
  const count = gesture.points.length;
  const progress = drawingProgress(gesture);
  // Move samples perpendicular to their local tangent: the line bends instead of moving as a rigid shape.
  // Recompute from the base points every frame, so the deformation never accumulates.
  const points = gesture.points.map((point, i) => {
    const previous = gesture.points[gesture.closed ? (i + count - 1) % count : Math.max(0, i - 1)];
    const next = gesture.points[gesture.closed ? (i + 1) % count : Math.min(count - 1, i + 1)];
    const dx = next.x - previous.x, dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const progress = i / (gesture.closed ? count : count - 1);
    // Two waves circulate around closed outlines. Open paths taper to zero at both ends.
    const envelope = gesture.closed ? 1 : Math.sin(progress * Math.PI);
    const wave = Math.sin(progress * Math.PI * 4 - phase) * amplitude * envelope;
    return { ...point, x: point.x - dy / length * wave, y: point.y + dx / length * wave };
  });
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const margin = MAX_THICKNESS / 2;
  const left = Math.min(...xs) - margin, right = Math.max(...xs) + margin;
  const top = Math.min(...ys) - margin, bottom = Math.max(...ys) + margin;
  for (let column = -1; column <= 1; column++) for (let row = -1; row <= 1; row++) {
    const x = column * width, y = row * height;
    const key = `${column}:${row}`;
    let path = gesture.paths.get(key);
    const visible = !(right + x < 0 || left + x > width || bottom + y < 0 || top + y > height);
    if (!visible) { if (path) path.visible = false; continue; }
    if (!path) {
      // Paper keeps each path in its document. Create edge copies only when needed.
      path = new paper.Path({
        segments: points.map(point => [point.x + x, point.y + y]),
        closed: gesture.closed, strokeColor: 'white', strokeWidth: gesture.points[0].thickness,
        strokeCap: 'round', strokeJoin: 'round',
      });
      gesture.paths.set(key, path);
    } else {
      points.forEach((point, i) => path.segments[i].point.set(point.x + x, point.y + y));
    }
    // One growing dash reveals a continuous prefix; the gap is longer than the whole path.
    // Paper keeps both the animated geometry and the reveal as native vector data.
    const length = path.length;
    path.dashArray = progress >= 1 ? [] : [Math.max(0.001, length * progress), length + 1];
    path.dashOffset = 0;
    path.visible = progress > 0;
  }
}

function makeAgentStrokes(plan) {
  const { width, height } = paper.view.viewSize;
  const columns = Math.ceil(Math.sqrt(plan.copies));
  const rows = Math.ceil(plan.copies / columns);
  const extent = plan.placement === 'grid'
    ? Math.min(plan.size * Math.min(width, height), width / columns * 0.75, height / rows * 0.75)
    : plan.size * Math.min(width, height);
  const vertices = plan.points.map(point => ({ x: (point.x - 0.5) * extent, y: (point.y - 0.5) * extent }));
  if (plan.closed) vertices.push({ ...vertices[0] });
  const lengths = vertices.slice(1).map((point, i) => Math.hypot(point.x - vertices[i].x, point.y - vertices[i].y));
  const length = lengths.reduce((sum, value) => sum + value, 0);
  if (length < 1) throw new Error('A drawing path needs at least two distinct points.');

  // Evenly spaced samples turn a small model-generated path into a smooth replay.
  const samples = Math.max(2, Math.min(128, Math.ceil(length / 4) + 1));
  const points = [];
  let segment = 0, distance = 0;
  for (let i = 0; i < samples; i++) {
    const target = i / (plan.closed ? samples : samples - 1) * length;
    while (segment < lengths.length - 1 && distance + lengths[segment] < target) {
      distance += lengths[segment++];
    }
    const a = vertices[segment], b = vertices[segment + 1];
    const ratio = lengths[segment] ? (target - distance) / lengths[segment] : 0;
    points.push({ x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, thickness: plan.thickness });
  }
  const left = Math.min(...points.map(point => point.x));
  const right = Math.max(...points.map(point => point.x));
  const top = Math.min(...points.map(point => point.y));
  const bottom = Math.max(...points.map(point => point.y));
  const margin = plan.thickness;
  const randomOrigin = (minimum, maximum, size) => {
    const low = margin - minimum, high = size - margin - maximum;
    return high >= low ? low + Math.random() * (high - low) : size / 2;
  };
  return Array.from({ length: plan.copies }, (_, copy) => {
    let x = width / 2, y = height / 2;
    if (plan.placement === 'random') {
      x = randomOrigin(left, right, width); y = randomOrigin(top, bottom, height);
    } else if (plan.placement === 'grid') {
      x = (copy % columns + 0.5) * width / columns;
      y = (Math.floor(copy / columns) + 0.5) * height / rows;
    }
    const path = points.map(point => ({ ...point, x: point.x + x, y: point.y + y }));
    let vx = 0, vy = 0;
    if (plan.motion === 'random') {
      const angle = Math.random() * Math.PI * 2;
      vx = Math.cos(angle) * plan.speed; vy = Math.sin(angle) * plan.speed;
    } else if (plan.motion === 'left') vx = -plan.speed;
    else if (plan.motion === 'right') vx = plan.speed;
    else if (plan.motion === 'up') vy = -plan.speed;
    else if (plan.motion === 'down') vy = plan.speed;
    // Choose timing once for this shape, so copies never inherit a common rhythm.
    // Wrapped edge paths remain views of this same instance and share its timing.
    return { paths: new Map(), startedAt: animationTime + Math.random() * DRAW_SEQUENCE.startSpread,
      drawPeriod: DRAW_SEQUENCE.period * (0.75 + Math.random() * 0.6),
      wavePeriod: LINE_MOTION.period * (0.75 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2, points: path, closed: plan.closed, motion: plan.motion, speed: plan.speed, carry: 0, vx, vy,
      dx: plan.closed ? 0 : path.at(-1).x - path[0].x,
      dy: plan.closed ? 0 : path.at(-1).y - path[0].y };
  });
}
