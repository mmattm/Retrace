// Engine: p5.js
// Motion to form: a drawn gesture becomes a repeating animation.
// Inspired by Yellowtail (1998), by Golan Levin:
// https://www.flong.com/archive/projects/yellowtail/index.html
// Each stroke moves end-over-end, following its own recorded rhythm.
// Slow gestures make thicker marks; fast gestures make thinner marks.

const MIN_THICKNESS = 2;
const MAX_THICKNESS = 14; // Increase this for a wider brush.
const strokes = [];
let drawing = null;
let pointer = null;
let activePointer = null;

function setup() {
  // CSS scales the display; drawing coordinates stay at 640 × 640.
  const canvas = createCanvas(640, 640).elt;
  stroke(255);
  frameRate(60); // Record and replay one position per animation frame.
  describe('Draw with a mouse or finger. Slow gestures make thick lines, fast gestures make thin lines. Release to animate.');
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';

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
    advanceStroke(gesture);
    // Neighboring copies make a line continue across opposite canvas edges.
    for (let x = -width; x <= width; x += width) {
      for (let y = -height; y <= height; y += height) {
        drawStroke(gesture.points, x, y);
      }
    }
  }
  if (drawing) {
    // Repeated positions preserve pauses as well as fast movements.
    addDrawingPoint(pointer);
    drawStroke(drawing);
  }
}

function advanceStroke(gesture) {
  // Move the first point to the end, offset by one complete gesture.
  // After every point has moved once, the original shape repeats farther along.
  const first = gesture.points.shift();
  // Keep each point's thickness attached to it throughout the animation.
  gesture.points.push({ ...first, x: first.x + gesture.dx, y: first.y + gesture.dy });

  // Bring the whole stroke back by multiples of the canvas size.
  // Keeping all points together avoids long lines across the screen.
  const offsetX = Math.floor(gesture.points[0].x / width) * width;
  const offsetY = Math.floor(gesture.points[0].y / height) * height;
  for (const point of gesture.points) {
    point.x -= offsetX;
    point.y -= offsetY;
  }
}

function drawStroke(points, offsetX = 0, offsetY = 0) {
  // Short segments let the width vary along the same stroke.
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    strokeWeight((previous.thickness + point.thickness) / 2);
    line(previous.x + offsetX, previous.y + offsetY, point.x + offsetX, point.y + offsetY);
  }
}
