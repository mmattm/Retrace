// Engine: Paper.js
// Set outlined text on the growing stroke, then let it travel along the finished curve.
const CONFIG = { text: 'DEGRADE', textSize: 100 };
const BACKGROUND = 'black';
const OUTLINE = 'white';
const MIN_POINT_DISTANCE = 3;
const measureCanvas = document.createElement('canvas');
const measureContext = measureCanvas.getContext('2d');

let background;
let guidePath;
let curvePoints = [];
let pressureProfile = [];
let curveChanged = false;
let activePointerId = null;
let lastWidth = 0;
let lastHeight = 0;
let renderedText = null;
let renderedSize = null;
let glyphs = [];
let letters = [];
let patternWidth = 0;
let animationTime = 0;

async function setup() {
  background = new paper.Path.Rectangle({
    rectangle: paper.view.bounds,
    fillColor: BACKGROUND,
  });

  const { createUI } = await import('./ui.js');
  const pane = createUI(CONFIG);
  pane.on('change', () => window.sketchRuntime?.redraw());

  const canvas = paper.view.element;
  canvas.setAttribute('aria-label', 'Draw a curve to place text along it');
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', continueDrawing);
  canvas.addEventListener('pointerup', finishDrawing);
  canvas.addEventListener('pointercancel', cancelDrawing);
  canvas.addEventListener('lostpointercapture', cancelDrawing);

  lastWidth = paper.view.viewSize.width;
  lastHeight = paper.view.viewSize.height;
}

function draw(delta = 0) {
  if (activePointerId === null && delta > 0) animationTime += delta;
  background.bounds = paper.view.bounds;

  const { width, height } = paper.view.viewSize;
  if (width !== lastWidth || height !== lastHeight) rebuildForSize(width, height);
  if (!guidePath || curvePoints.length < 2) return;

  if (curveChanged) {
    pressureProfile = buildPressureProfile();
    curveChanged = false;
  }
  if (renderedText !== String(CONFIG.text) || renderedSize !== CONFIG.textSize) rebuildPattern();
  const length = guidePath.length;
  if (!glyphs.length || !length) return;
  placeLetters(length);
}

function rebuildForSize(width, height) {
  lastWidth = width;
  lastHeight = height;
  if (!guidePath) return;

  // Normalized samples keep the drawing and its pressure data after a resize.
  guidePath.segments = curvePoints.map(canvasPoint);
  if (activePointerId === null) smoothCurve();
  curveChanged = true;
}

function canvasPoint(point) {
  return new paper.Point(point.x * lastWidth, point.y * lastHeight);
}

function smoothCurve() {
  if (curvePoints.length < 3) return;
  guidePath.simplify(1.5);
  guidePath.smooth({ type: 'continuous' });
}

function clearCurve() {
  guidePath?.remove();
  guidePath = null;
  curvePoints = [];
  pressureProfile = [];
  curveChanged = false;
  removeLetters();
}

function startDrawing(event) {
  if (activePointerId !== null || event.isPrimary === false || event.button !== 0) return;
  const point = pointerPosition(event, event.currentTarget.getBoundingClientRect());
  if (!point) return;

  event.preventDefault();
  activePointerId = event.pointerId;
  event.currentTarget.setPointerCapture(event.pointerId);
  clearCurve();
  animationTime = 0;
  curvePoints.push(point);
  guidePath = new paper.Path({
    segments: [canvasPoint(point)],
    strokeColor: OUTLINE,
    strokeWidth: 1,
    strokeCap: 'round',
    strokeJoin: 'round',
    opacity: 0.5,
  });
}

function continueDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  const bounds = event.currentTarget.getBoundingClientRect();
  const samples = event.getCoalescedEvents?.();
  for (const sample of samples?.length ? samples : [event]) {
    const point = pointerPosition(sample, bounds);
    if (!point) continue;
    const previous = curvePoints.at(-1);
    if (sampleDistance(previous, point) < MIN_POINT_DISTANCE) {
      if (point.pressure !== previous.pressure) {
        previous.pressure = point.pressure;
        curveChanged = true;
      }
      continue;
    }
    curvePoints.push(point);
    guidePath.add(canvasPoint(point));
    curveChanged = true;
  }
}

function finishDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  continueDrawing(event);
  activePointerId = null;
  if (curvePoints.length > 1) {
    smoothCurve();
    guidePath.visible = false;
  } else clearCurve();
}

function cancelDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  activePointerId = null;
  clearCurve();
}

function pointerPosition(event, bounds) {
  if (!bounds.width || !bounds.height) return null;
  let pressure = 1;
  if (event.pointerType === 'pen') {
    // Lift reports zero pressure. Keep the last contact pressure at the endpoint.
    if (event.type === 'pointerup') pressure = curvePoints.at(-1)?.pressure ?? 1;
    else if (Number.isFinite(event.pressure)) pressure = Math.max(0, Math.min(1, event.pressure));
  }
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    pressure,
  };
}

function sampleDistance(a, b) {
  return Math.hypot((b.x - a.x) * lastWidth, (b.y - a.y) * lastHeight);
}

function buildPressureProfile() {
  let length = 0;
  const profile = curvePoints.map((point, index) => {
    if (index) length += sampleDistance(curvePoints[index - 1], point);
    return { offset: length, pressure: point.pressure };
  });
  // Distance fractions keep the pressure attached to the curve after smoothing.
  if (length) for (const sample of profile) sample.offset /= length;
  return profile;
}

function rebuildPattern() {
  removeLetters();
  renderedText = String(CONFIG.text);
  renderedSize = CONFIG.textSize;
  glyphs = [];
  patternWidth = 0;
  if (!renderedText.trim()) return;

  measureContext.font = `700 ${renderedSize}px Arial`;
  measureContext.textAlign = 'center';
  const tracking = renderedSize * 0.04;
  glyphs = Array.from(renderedText.normalize('NFC'), content => {
    const { width, actualBoundingBoxLeft: left, actualBoundingBoxRight: right } = measureContext.measureText(content);
    const inkWidth = left + right;
    // Measure the outline's horizontal footprint. Spaces retain their usual advance.
    const anchor = inkWidth > 0 ? left : width / 2;
    const advance = (inkWidth > 0 ? inkWidth : width) + tracking;
    patternWidth += advance;
    return { content, anchor, advance };
  });
}

function pressureScale(pressure) {
  return 0.08 + 0.92 * pressure;
}

function outlineWidth(sizeScale) {
  return Math.max(0.25, 1.2 * sizeScale);
}

function placeLetters(length) {
  // Move the pattern in from the start of the curve, where the entering letters share the first pressure.
  const firstScale = pressureScale(pressureProfile[0].pressure);
  const repeatWidth = patternWidth * firstScale + glyphs.length * outlineWidth(firstScale);
  let position = -((animationTime * 24 * firstScale) % repeatWidth);
  let pressureIndex = 1;
  let visibleCount = 0;
  for (let index = 0; position < length; index++) {
    const glyph = glyphs[index % glyphs.length];
    const fraction = Math.max(0, position / length);
    while (pressureIndex < pressureProfile.length - 1 && pressureProfile[pressureIndex].offset < fraction) pressureIndex++;
    const a = pressureProfile[pressureIndex - 1], b = pressureProfile[pressureIndex];
    const mix = (fraction - a.offset) / (b.offset - a.offset || 1);
    const sizeScale = pressureScale(a.pressure + (b.pressure - a.pressure) * mix);

    const strokeWidth = outlineWidth(sizeScale);
    const distance = position + glyph.anchor * sizeScale + strokeWidth / 2;
    // Account for the stroke so the visible gap stays proportional to the letter size.
    position += glyph.advance * sizeScale + strokeWidth;
    if (distance < 0 || distance > length) continue;
    const location = guidePath.getLocationAt(distance);
    if (!location) continue;

    const item = letters[visibleCount] ?? new paper.PointText({
      fillColor: null,
      strokeColor: OUTLINE,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      justification: 'center',
      strokeJoin: 'round',
    });
    letters[visibleCount++] = item;
    if (item.content !== glyph.content) item.content = glyph.content;
    item.visible = true;
    item.fontSize = renderedSize * sizeScale;
    item.strokeWidth = strokeWidth;

    // Rotate first, then anchor the glyph baseline back onto the curve.
    item.rotation = location.tangent.angle;
    item.point = location.point;
  }
  for (let index = visibleCount; index < letters.length; index++) letters[index].visible = false;
}

function removeLetters() {
  for (const letter of letters) letter.remove();
  letters = [];
}
