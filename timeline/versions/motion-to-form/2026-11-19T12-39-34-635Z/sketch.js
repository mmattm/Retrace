// Engine: p5.js
// Motion to form: a drawn gesture becomes a repeating animation.
// Inspired by Yellowtail (1998), by Golan Levin:
// https://www.flong.com/archive/projects/yellowtail/index.html
// Each stroke moves end-over-end, following its own recorded rhythm.
// Slow gestures make thicker marks; fast gestures make thinner marks.
// The Agent adds drawn paths from a prompt; it does not adjust a CONFIG object.

const MIN_THICKNESS = 2;
const MAX_THICKNESS = 14; // Increase this for a wider brush.
const MAX_AGENT_STROKES = 128; // Capacity reported to the Agent, not a drawing parameter.
const strokes = [];
let lastDrawing = null;
let drawing = null;
let pointer = null;
let activePointer = null;

function setup() {
  // The shared preview manages responsive dimensions and 2× pixel density.
  const canvas = createCanvas(windowWidth, windowHeight).elt;
  stroke(255);
  frameRate(60); // Record and replay one position per animation frame.
  describe('Draw with a mouse or finger, or ask the Agent to draw shapes from random positions. Strokes loop and move; slower manual gestures make thicker lines.');
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';

  // Read-only scene context lets the model plan new strokes instead of settings.
  window.sketchAgent = {
    getState: () => ({
      canvasWidth: width, canvasHeight: height, strokeCount: strokes.length,
      remainingStrokes: Math.max(0, MAX_AGENT_STROKES - strokes.length),
      lastDrawing: structuredClone(lastDrawing),
    }),
    applyDrawing(command) {
      if (command.operation === 'clear' && command.strokes.length) {
        throw new Error('A clear command must not include drawing paths.');
      }
      const added = command.strokes.reduce((sum, path) => sum + path.copies, 0);
      const total = (command.operation === 'add' ? strokes.length : 0) + added;
      if (total > MAX_AGENT_STROKES) {
        throw new Error(`Drawing limit: ${MAX_AGENT_STROKES} strokes. Clear the drawing or request fewer copies.`);
      }
      // Prepare everything before changing the scene, so invalid paths erase nothing.
      const prepared = command.strokes.flatMap(makeAgentStrokes);
      if (command.operation !== 'add') {
        strokes.length = 0;
        drawing = null;
        activePointer = null;
      }
      strokes.push(...prepared);
      if (prepared.length) lastDrawing = structuredClone(command.strokes);
      else if (command.operation !== 'add') lastDrawing = null;
      if (!isLooping()) redraw();
      return { message: command.operation === 'clear' ? 'Drawing cleared.'
        : `${command.operation === 'replace' ? 'Replaced the drawing with' : 'Added'} ${prepared.length} strokes.` };
    },
  };

  // Pointer events handle mouse, pen and touch with the same small set of rules.
  canvas.addEventListener('pointerdown', (event) => {
    if (activePointer !== null || event.button !== 0) return;
    activePointer = event.pointerId;
    pointer = canvasPoint(event, canvas);
    drawing = [{ ...pointer, thickness: MAX_THICKNESS }];
    // Continue receiving release events even when the pointer leaves the canvas.
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) pointer = canvasPoint(event, canvas);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointer) return;
    addDrawingPoint(canvasPoint(event, canvas));
    const first = drawing[0];
    const last = drawing.at(-1);
    // Ignore clicks without a visible gesture.
    if (drawing.some((point) => Math.hypot(point.x - first.x, point.y - first.y) > 1)) {
      strokes.push({
        points: drawing,
        // This displacement connects the end of one cycle to the next.
        dx: last.x - first.x,
        dy: last.y - first.y,
      });
    }
    resetDrawing(event);
  });
  // A canceled touch or lost capture must not leave a stroke stuck in progress.
  // Match the pointer ID so another finger cannot interrupt the active gesture.
  function resetDrawing(event) {
    if (event.pointerId !== activePointer) return;
    drawing = null;
    pointer = null;
    activePointer = null;
  }
  canvas.addEventListener('pointercancel', resetDrawing);
  canvas.addEventListener('lostpointercapture', resetDrawing);
}

function addDrawingPoint(point) {
  const previous = drawing.at(-1);
  // Distance between frames measures drawing speed in canvas units per frame.
  // Dividing by a larger number makes faster movement produce a thinner line.
  const speed = Math.hypot(point.x - previous.x, point.y - previous.y);
  const target = Math.max(MIN_THICKNESS, MAX_THICKNESS / (1 + speed * 0.15));
  // Move 30% toward the target to soften abrupt changes in thickness.
  const thickness = previous.thickness + (target - previous.thickness) * 0.3;
  drawing.push({ ...point, thickness });
}

function canvasPoint(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  // Convert screen pixels to canvas coordinates, including on smaller screens.
  // Clamp to the canvas edges when a captured pointer moves outside.
  return {
    x: Math.max(0, Math.min(width, (event.clientX - bounds.left) * width / bounds.width)),
    y: Math.max(0, Math.min(height, (event.clientY - bounds.top) * height / bounds.height)),
  };
}

function draw() {
  // Clear each frame so the lines move without leaving fading trails.
  background(0);
  for (const gesture of strokes) {
    if (isLooping()) advanceStroke(gesture);
    drawGesture(gesture);
  }
  if (drawing) {
    // Repeated positions preserve pauses as well as fast movements.
    addDrawingPoint(pointer);
    drawStroke(drawing);
  }
}

function advanceStroke(gesture) {
  if (gesture.motion && gesture.motion !== 'follow') {
    // Generated shapes can drift rigidly; their outline stays complete.
    const step = Math.min(4, deltaTime / (1000 / 60));
    for (const point of gesture.points) {
      point.x += gesture.vx * step;
      point.y += gesture.vy * step;
    }
  } else {
    // Manual strokes keep the original Yellowtail end-over-end movement.
    let steps = 1;
    if (gesture.motion === 'follow') {
      gesture.carry += gesture.speed * Math.min(4, deltaTime / (1000 / 60));
      steps = Math.floor(gesture.carry);
      gesture.carry -= steps;
    }
    for (let i = 0; i < steps; i++) {
      const first = gesture.points.shift();
      gesture.points.push({ ...first, x: first.x + gesture.dx, y: first.y + gesture.dy });
    }
  }

  // Wrap the whole gesture together so it never stretches across screen edges.
  const offsetX = Math.floor(gesture.points[0].x / width) * width;
  const offsetY = Math.floor(gesture.points[0].y / height) * height;
  for (const point of gesture.points) { point.x -= offsetX; point.y -= offsetY; }
}

function drawGesture(gesture) {
  const xs = gesture.points.map(point => point.x);
  const ys = gesture.points.map(point => point.y);
  const margin = MAX_THICKNESS / 2;
  const left = Math.min(...xs) - margin, right = Math.max(...xs) + margin;
  const top = Math.min(...ys) - margin, bottom = Math.max(...ys) + margin;
  for (let x = -width; x <= width; x += width) {
    for (let y = -height; y <= height; y += height) {
      // Skip invisible tiles: many generated strokes need only one visible copy.
      if (right + x < 0 || left + x > width || bottom + y < 0 || top + y > height) continue;
      drawStroke(gesture.points, x, y, gesture.closed);
    }
  }
}

function drawStroke(points, offsetX = 0, offsetY = 0, closed = false) {
  const segments = closed ? points.length : points.length - 1;
  for (let i = 0; i < segments; i++) {
    const previous = points[i];
    const point = points[(i + 1) % points.length];
    strokeWeight((previous.thickness + point.thickness) / 2);
    line(previous.x + offsetX, previous.y + offsetY, point.x + offsetX, point.y + offsetY);
  }
}

function makeAgentStrokes(plan) {
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
    return { points: path, closed: plan.closed, motion: plan.motion, speed: plan.speed, carry: 0, vx, vy,
      dx: plan.closed ? 0 : path.at(-1).x - path[0].x,
      dy: plan.closed ? 0 : path.at(-1).y - path[0].y };
  });
}
