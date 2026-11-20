// Engine: Paper.js
// Draw a smooth path, then repeat outlined text along it as a continuously moving pattern.
// Text size is measured in logical pixels, independently of the 2× canvas density.
const CONFIG = { text: 'DEGRADE', textSize: 48 };
const BACKGROUND = 'black';
const OUTLINE = 'white';
const MIN_POINT_DISTANCE = 3;
const measureCanvas = document.createElement('canvas');
const measureContext = measureCanvas.getContext('2d');

let background;
let guidePath;
let previewPath;
let letters = [];
let curvePoints = [];
let activePoints = [];
let activePointerId = null;
let lastWidth = 0;
let lastHeight = 0;
let renderedText = null;
let renderedSize = null;
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
  canvas.setAttribute('aria-label', 'Draw a curve; the text follows its path');
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
  if (delta > 0) animationTime += delta;
  background.bounds = paper.view.bounds;

  const { width, height } = paper.view.viewSize;
  if (width !== lastWidth || height !== lastHeight) rebuildForSize(width, height);
  if (guidePath && (renderedText !== String(CONFIG.text) || renderedSize !== CONFIG.textSize)) rebuildTypography();
  if (guidePath) animateTypography();
}

function rebuildForSize(width, height) {
  lastWidth = width;
  lastHeight = height;

  // Normalized samples let the shared runtime resize the canvas without losing the drawn curve.
  if (activePointerId !== null) {
    previewPath?.remove();
    previewPath = createCurve(activePoints, true);
  } else if (curvePoints.length > 1) {
    guidePath?.remove();
    guidePath = createCurve(curvePoints, false);
    rebuildTypography();
  }
}

function createCurve(points, visible) {
  const path = new paper.Path({
    strokeColor: OUTLINE,
    strokeWidth: 1.4,
    strokeCap: 'round',
    strokeJoin: 'round',
    visible,
  });

  for (const point of points) {
    path.add(new paper.Point(point.x * lastWidth, point.y * lastHeight));
  }
  if (points.length > 2) {
    path.simplify(1.5);
    path.smooth({ type: 'continuous' });
  }
  return path;
}

function startDrawing(event) {
  if (activePointerId !== null || event.isPrimary === false || event.button !== 0) return;
  const point = pointerPosition(event);
  if (!point) return;

  event.preventDefault();
  activePointerId = event.pointerId;
  event.currentTarget.setPointerCapture(event.pointerId);

  guidePath?.remove();
  previewPath?.remove();
  removeLetters();
  guidePath = null;
  previewPath = null;
  curvePoints = [];
  activePoints = [];
  renderedText = null;
  activePoints.push(point);
  previewPath = createCurve(activePoints, true);
}

function continueDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  const point = pointerPosition(event);
  if (!point) return;

  const previous = activePoints.at(-1);
  const distance = Math.hypot((point.x - previous.x) * lastWidth, (point.y - previous.y) * lastHeight);
  if (distance < MIN_POINT_DISTANCE) return;

  activePoints.push(point);
  previewPath.add(new paper.Point(point.x * lastWidth, point.y * lastHeight));
}

function finishDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  continueDrawing(event);

  if (activePoints.length > 1) {
    curvePoints = activePoints.map(point => ({ ...point }));
    previewPath.simplify(1.5);
    previewPath.smooth({ type: 'continuous' });
    previewPath.visible = false;
    guidePath = previewPath;
    previewPath = null;
    rebuildTypography();
  } else {
    previewPath?.remove();
    previewPath = null;
  }

  activePoints = [];
  activePointerId = null;
}

function cancelDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  previewPath?.remove();
  previewPath = null;
  activePoints = [];
  activePointerId = null;
}

function pointerPosition(event) {
  const bounds = paper.view.element.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;

  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function rebuildTypography() {
  removeLetters();
  renderedText = String(CONFIG.text);
  renderedSize = CONFIG.textSize;
  patternWidth = 0;
  if (!guidePath || !renderedText.trim()) return;

  const characters = Array.from(renderedText.normalize('NFC'));
  measureContext.font = `700 ${renderedSize}px Arial`;
  const widths = characters.map(character => measureContext.measureText(character).width);
  const spacing = renderedSize * 0.05;
  // One pattern includes the complete text plus a small gap before the next copy.
  patternWidth = widths.reduce((sum, width) => sum + width, 0)
    + spacing * (characters.length - 1) + renderedSize * 0.6;
  // One extra copy enters the line as the first copy leaves it.
  const repetitions = Math.ceil(guidePath.length / patternWidth) + 1;

  for (let copy = 0; copy < repetitions; copy++) {
    let distance = copy * patternWidth;
    for (let index = 0; index < characters.length; index++) {
      letters.push({
        item: new paper.PointText({
          point: [0, 0],
          content: characters[index],
          fillColor: null,
          strokeColor: OUTLINE,
          strokeWidth: 1.2,
          fontFamily: 'Arial',
          fontSize: renderedSize,
          fontWeight: 'bold',
          justification: 'center',
          strokeJoin: 'round',
        }),
        distance: distance + widths[index] / 2,
      });
      distance += widths[index] + spacing;
    }
  }
}

function animateTypography() {
  if (!patternWidth) return;
  // Wrap by one text pattern: identical copies make the continuous loop seamless.
  const offset = (animationTime * 24) % patternWidth;
  for (const letter of letters) {
    const distance = letter.distance - offset;
    letter.item.visible = distance >= 0 && distance <= guidePath.length;
    if (!letter.item.visible) continue;
    const point = guidePath.getPointAt(distance);
    const tangent = guidePath.getTangentAt(distance);
    if (!point || !tangent) { letter.item.visible = false; continue; }

    // Rotate first, then anchor the glyph baseline back onto the curve.
    letter.item.rotation = tangent.angle;
    letter.item.point = point;
  }
}

function removeLetters() {
  for (const letter of letters) letter.item.remove();
  letters = [];
}
