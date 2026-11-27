// Engine: Paper.js
// Draw a smooth path with a pointer, then let outlined characters travel along its Bézier curves.
const CONFIG = { text: 'DEGRADE' };
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
let freeSpace = 0;
let animationTime = 0;

async function setup() {
  await document.fonts.load('400 100px "Unica77LL"');
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
  if (guidePath && renderedText !== String(CONFIG.text)) rebuildTypography();
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
  if (!guidePath || !renderedText.length) return;

  const characters = Array.from(renderedText.normalize('NFC'));
  measureContext.font = '400 100px Unica77LL';
  const widths = characters.map(character => measureContext.measureText(character).width);
  const spacing = 5;
  const measuredWidth = widths.reduce((sum, width) => sum + width, 0) + spacing * (characters.length - 1);
  const { width, height } = paper.view.viewSize;
  const scale = Math.min((guidePath.length * 0.82) / Math.max(1, measuredWidth), (Math.min(width, height) * 0.18) / 100);
  const textWidth = measuredWidth * scale;
  freeSpace = Math.max(0, guidePath.length - textWidth);

  let distance = 0;
  for (let index = 0; index < characters.length; index++) {
    const characterWidth = widths[index] * scale;
    letters.push({
      item: new paper.PointText({
        point: [0, 0],
        content: characters[index],
        fillColor: null,
        strokeColor: OUTLINE,
        strokeWidth: 1.2,
        fontFamily: 'Unica77LL',
        fontSize: 100 * scale,
        fontWeight: 'normal',
        justification: 'center',
        strokeJoin: 'round',
      }),
      distance: distance + characterWidth / 2,
    });
    distance += characterWidth + spacing * scale;
  }
}

function animateTypography() {
  const start = freeSpace / 2 + Math.sin(animationTime * 0.8) * freeSpace * 0.25;
  for (const letter of letters) {
    const distance = start + letter.distance;
    const point = guidePath.getPointAt(distance);
    const tangent = guidePath.getTangentAt(distance);
    if (!point || !tangent) continue;

    letter.item.point = point;
    letter.item.rotation = tangent.angle;
  }
}

function removeLetters() {
  for (const letter of letters) letter.item.remove();
  letters = [];
}
