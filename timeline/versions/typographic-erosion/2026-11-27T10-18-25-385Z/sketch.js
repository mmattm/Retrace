// Engine: Paper.js
// Letter fragments spread in independent random directions; optional waves bend their splines.
const CONFIG = { text: 'RETRACE', textSize: 100, spread: 0, wiggle: 0 };
const BACKGROUND = 'black';
const OUTLINE = 'white';
const MIN_POINT_DISTANCE = 3;
const measureCanvas = document.createElement('canvas');
const measureContext = measureCanvas.getContext('2d');

let background;
const lines = [];
const glyphTemplates = new Map();
const noiseGradients = new Map();
let activeLine = null;
let outlineFont;
let nextLineId = 0;
let activePointerId = null;
let hoverLetter;
let hoverPoint = null;
const reportedRoll = new Set();
let lastWidth = 0;
let lastHeight = 0;
let renderedText = null;
let renderedSize = null;
let glyphs = [];
let patternWidth = 0;
let physicsTime = 0;

async function setup() {
  await document.fonts.load('400 100px "Unica77LL"');
  const { parse } = await import('opentype.js');
  const response = await fetch('/assets/fonts/Unica77LL-Regular.otf');
  if (!response.ok) throw new Error('Could not load the Unica font.');
  outlineFont = parse(await response.arrayBuffer());
  background = new paper.Path.Rectangle({
    rectangle: paper.view.bounds,
    fillColor: BACKGROUND,
  });

  const { createUI } = await import('./ui.js');
  const pane = createUI(CONFIG);
  const canvas = paper.view.element;
  hoverLetter = createHoverLetter(canvas);
  pane.on('change', () => {
    updateHover();
    window.sketchRuntime?.redraw();
  });
  canvas.setAttribute('aria-label', 'Drag to add another text curve');
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerenter', hoverPen);
  canvas.addEventListener('pointerleave', hideHover);
  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', continueDrawing);
  canvas.addEventListener('pointerup', finishDrawing);
  canvas.addEventListener('pointercancel', cancelDrawing);
  canvas.addEventListener('lostpointercapture', cancelDrawing);
  window.addEventListener('blur', hideHover);

  lastWidth = paper.view.viewSize.width;
  lastHeight = paper.view.viewSize.height;
}

function draw(delta = 0) {
  const physicsDelta = Math.min(Math.max(delta, 0), 1 / 30);
  physicsTime += physicsDelta;
  background.bounds = paper.view.bounds;

  const { width, height } = paper.view.viewSize;
  if (width !== lastWidth || height !== lastHeight) {
    rebuildForSize(width, height);
    updateHover();
  }
  if (renderedText !== String(CONFIG.text) || renderedSize !== CONFIG.textSize) rebuildPattern();
  for (const line of lines) {
    if (line !== activeLine) line.time += delta;
    if (line.changed && line.points.length > 1) {
      line.profile = buildStrokeProfile(line.points);
      line.changed = false;
    }
    const length = line.path.length;
    if (glyphs.length && line.profile.length > 1 && length > 0) placeLetters(line, length, physicsDelta);
  }
}

function rebuildForSize(width, height) {
  lastWidth = width;
  lastHeight = height;
  // Each line retains its own normalized samples and Pencil data after a resize.
  for (const line of lines) {
    line.path.segments = line.points.map(canvasPoint);
    if (line !== activeLine) smoothCurve(line);
    line.changed = true;
  }
}

function canvasPoint(point) {
  return new paper.Point(point.x * lastWidth, point.y * lastHeight);
}

function smoothCurve(line) {
  if (line.points.length < 3) return;
  line.path.simplify(1.5);
  line.path.smooth({ type: 'continuous' });
}

function removeLine(line) {
  line.path.remove();
  removeLetters(line);
  lines.splice(lines.indexOf(line), 1);
}

function createHoverLetter(canvas) {
  // The guide lives above the canvas so image and SVG exports contain only the drawing.
  const namespace = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(namespace, 'svg');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.5;';
  const letter = document.createElementNS(namespace, 'text');
  const attributes = {
    'text-anchor': 'middle', 'font-family': 'Unica77LL', 'font-weight': '400',
    fill: 'none', stroke: OUTLINE, 'stroke-width': '1.2', 'stroke-linejoin': 'round', visibility: 'hidden',
  };
  for (const [key, value] of Object.entries(attributes)) letter.setAttribute(key, value);
  overlay.append(letter);
  canvas.after(overlay);
  return letter;
}

function hoverPen(event) {
  if (activePointerId !== null || event.pointerType !== 'pen' || event.buttons !== 0) return;
  hoverPoint = pointerPosition(event, event.currentTarget.getBoundingClientRect());
  updateHover();
}

function updateHover() {
  const [firstLetter] = String(CONFIG.text).trimStart().normalize('NFC');
  hoverLetter.setAttribute('visibility', hoverPoint && firstLetter ? 'visible' : 'hidden');
  if (!hoverPoint || !firstLetter) return;
  const { x, y } = canvasPoint(hoverPoint);
  hoverLetter.textContent = firstLetter;
  hoverLetter.setAttribute('font-size', String(CONFIG.textSize));
  hoverLetter.setAttribute('transform', `translate(${x} ${y}) rotate(${hoverPoint.rotation})`);
}

function hideHover() {
  hoverPoint = null;
  hoverLetter.setAttribute('visibility', 'hidden');
}

function startDrawing(event) {
  if (activePointerId !== null || event.isPrimary === false || event.button !== 0) return;
  const point = pointerPosition(event, event.currentTarget.getBoundingClientRect());
  if (!point) return;

  event.preventDefault();
  activePointerId = event.pointerId;
  hideHover();
  event.currentTarget.setPointerCapture(event.pointerId);
  const path = new paper.Path({
    segments: [canvasPoint(point)],
    strokeColor: OUTLINE,
    strokeWidth: 1,
    strokeCap: 'round',
    strokeJoin: 'round',
    opacity: 0.5,
  });
  activeLine = { id: nextLineId++, path, points: [point], profile: [], letters: [], changed: true, time: 0 };
  lines.push(activeLine);
}

function continueDrawing(event) {
  if (activePointerId === null) {
    hoverPen(event);
    return;
  }
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  const bounds = event.currentTarget.getBoundingClientRect();
  const samples = event.getCoalescedEvents?.();
  for (const sample of samples?.length ? samples : [event]) {
    const point = pointerPosition(sample, bounds);
    if (!point) continue;
    const previous = activeLine.points.at(-1);
    if (sampleDistance(previous, point) < MIN_POINT_DISTANCE) {
      if (point.pressure !== previous.pressure || point.rotation !== previous.rotation) {
        previous.pressure = point.pressure;
        previous.rotation = point.rotation;
        activeLine.changed = true;
      }
      continue;
    }
    activeLine.points.push(point);
    activeLine.path.add(canvasPoint(point));
    activeLine.changed = true;
  }
}

function finishDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  continueDrawing(event);
  activePointerId = null;
  if (activeLine.points.length > 1) {
    smoothCurve(activeLine);
    activeLine.path.visible = false;
  } else removeLine(activeLine);
  activeLine = null;
}

function cancelDrawing(event) {
  if (event.type === 'pointercancel') hideHover();
  if (event.pointerId !== activePointerId) return;
  activePointerId = null;
  if (activeLine.points.length < 2) removeLine(activeLine);
  else { smoothCurve(activeLine); activeLine.path.visible = false; }
  activeLine = null;
}

function pointerPosition(event, bounds) {
  if (!bounds.width || !bounds.height) return null;
  let pressure = 1;
  let rotation = 0;
  if (event.pointerType === 'pen') {
    if (event.type === 'pointerup') {
      // Keep the last contact values when the Pencil lifts.
      const previous = activeLine?.points.at(-1);
      pressure = previous?.pressure ?? 1;
      rotation = previous?.rotation ?? 0;
    } else {
      if (Number.isFinite(event.pressure)) pressure = Math.max(0, Math.min(1, event.pressure));
      rotation = pencilRotation(event);
    }
  }
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    pressure,
    rotation,
  };
}

function pencilRotation(event) {
  // Roll may be available while drawing even when the browser cannot report it on hover.
  const hovering = event.buttons === 0;
  if (Number.isFinite(event.twist) && (reportedRoll.has(hovering) || event.twist !== 0)) {
    reportedRoll.add(hovering);
    return event.twist;
  }
  return Number.isFinite(event.tiltX) ? event.tiltX : 0;
}

function sampleDistance(a, b) {
  return Math.hypot((b.x - a.x) * lastWidth, (b.y - a.y) * lastHeight);
}

function buildStrokeProfile(points) {
  let length = 0;
  const profile = points.map((point, index) => {
    if (index) length += sampleDistance(points[index - 1], point);
    return { offset: length, pressure: point.pressure, rotation: point.rotation };
  });
  // Distance fractions keep the Pencil samples attached after smoothing.
  if (length) for (const sample of profile) sample.offset /= length;
  return profile;
}

function rebuildPattern() {
  for (const line of lines) removeLetters(line);
  renderedText = String(CONFIG.text);
  renderedSize = CONFIG.textSize;
  glyphs = [];
  patternWidth = 0;
  if (!renderedText.trim()) return;

  measureContext.font = `400 ${renderedSize}px Unica77LL`;
  measureContext.textAlign = 'center';
  const tracking = renderedSize * 0.04;
  glyphs = Array.from(renderedText.normalize('NFC'), content => {
    const { width, actualBoundingBoxLeft: left, actualBoundingBoxRight: right } = measureContext.measureText(content);
    const inkWidth = left + right;
    // Measure the outline's horizontal footprint. Spaces retain their usual advance.
    const anchor = inkWidth > 0 ? left : width / 2;
    const advance = (inkWidth > 0 ? inkWidth : width) + tracking;
    patternWidth += advance;
    return { content, anchor, advance, template: glyphTemplate(content) };
  });
}

function pressureScale(pressure) {
  return 0.08 + 0.92 * pressure;
}

function outlineWidth(sizeScale) {
  return Math.max(0.25, 1.2 * sizeScale);
}

function placeLetters(line, length, delta) {
  // Move the pattern in from the start of the curve, where the entering letters share the first pressure.
  const firstScale = pressureScale(line.profile[0].pressure);
  const repeatWidth = patternWidth * firstScale + glyphs.length * outlineWidth(firstScale);
  let position = -((line.time * 24 * firstScale) % repeatWidth);
  let pressureIndex = 1;
  // Keep each letter's simulation attached to its slot when another letter leaves the line.
  line.letters.forEach(letter => { letter.group.visible = false; });
  for (let index = 0; position < length; index++) {
    const glyph = glyphs[index % glyphs.length];
    const fraction = Math.max(0, position / length);
    while (pressureIndex < line.profile.length - 1 && line.profile[pressureIndex].offset < fraction) pressureIndex++;
    const a = line.profile[pressureIndex - 1], b = line.profile[pressureIndex];
    const mix = (fraction - a.offset) / (b.offset - a.offset || 1);
    const sizeScale = pressureScale(a.pressure + (b.pressure - a.pressure) * mix);

    const strokeWidth = outlineWidth(sizeScale);
    const distance = position + glyph.anchor * sizeScale + strokeWidth / 2;
    // Account for the stroke so the visible gap stays proportional to the letter size.
    position += glyph.advance * sizeScale + strokeWidth;
    if (distance < 0 || distance > length) continue;
    const location = line.path.getLocationAt(distance);
    if (!location) continue;

    let letter = line.letters[index];
    if (!letter || letter.content !== glyph.content) {
      letter?.group.remove();
      letter = createLetter(glyph, line.id * 1009 + index * 37);
      line.letters[index] = letter;
    }
    letter.group.visible = true;

    // Rotate first, then anchor the glyph baseline back onto the curve.
    // Interpolate along the shortest turn when roll wraps from 359° to 0°.
    const turn = ((b.rotation - a.rotation + 540) % 360) - 180;
    const angle = (location.tangent.angle + a.rotation + turn * mix) * Math.PI / 180;
    const scale = renderedSize * sizeScale / 100;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    letter.group.matrix.set(cosine * scale, sine * scale, -sine * scale, cosine * scale, location.point.x, location.point.y);
    updateFragments(letter, strokeWidth, delta);
  }
}

function removeLetters(line) {
  line.letters.forEach(letter => letter.group.remove());
  line.letters = [];
}

function glyphTemplate(content) {
  if (glyphTemplates.has(content)) return glyphTemplates.get(content);
  const glyph = outlineFont.charToGlyph(content);
  const advance = glyph.advanceWidth / outlineFont.unitsPerEm * 100;
  const outline = new paper.CompoundPath({
    pathData: glyph.getPath(-advance / 2, 0, 100).toPathData(4),
    insert: false, fillColor: null, strokeColor: OUTLINE, strokeScaling: false,
  });
  const pieces = [];
  for (const [contourIndex, contour] of outline.children.entries()) {
    // Font contours are closed shapes: include the edge from the last point back to the first.
    contour.closed = true;
    let start = 0;
    let index = 0;
    while (start < contour.length) {
      // Lengths are measured at 100 px type size and stay stable for each glyph.
      const seed = glyph.index * 131 + contourIndex * 53 + index++ * 17;
      let length = Math.min(28 + randomValue(seed) * 44, contour.length - start);
      if (contour.length - start - length < 20) length = contour.length - start;
      const count = Math.max(8, Math.ceil(length / 4) + 1);
      // Clamp the final sample to avoid rounding past the contour and dropping a whole fragment.
      const points = Array.from({ length: count }, (_, sample) => contour.getPointAt(Math.min(contour.length, start + length * sample / (count - 1))));
      if (points.every(Boolean)) pieces.push(points);
      start += length;
    }
  }
  const template = { outline, pieces };
  glyphTemplates.set(content, template);
  return template;
}

function createLetter(glyph, seed) {
  const outline = glyph.template.outline.clone({ insert: false });
  const group = new paper.Group({ children: [outline], applyMatrix: false });
  return { content: glyph.content, group, outline, template: glyph.template, fragments: [], seed };
}

// A fixed seed keeps fragments stable while the letters move along each line.
function randomValue(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// Perlin noise blends the gradients of four neighboring grid corners.
function perlinNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const dx = x - ix, dy = y - iy;
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const u = fade(dx), v = fade(dy);
  const gradient = (gx, gy, px, py) => {
    const key = `${gx},${gy}`;
    let vector = noiseGradients.get(key);
    if (!vector) {
      const angle = randomValue(gx * 127 + gy * 311) * Math.PI * 2;
      vector = { x: Math.cos(angle), y: Math.sin(angle) };
      noiseGradients.set(key, vector);
    }
    return vector.x * px + vector.y * py;
  };
  const a = gradient(ix, iy, dx, dy);
  const b = gradient(ix + 1, iy, dx - 1, dy);
  const c = gradient(ix, iy + 1, dx, dy - 1);
  const d = gradient(ix + 1, iy + 1, dx - 1, dy - 1);
  return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) * Math.SQRT2;
}

function flowOffset(spread, seed) {
  // Raising 0–1 to 1.8 keeps small slider values gentle, then opens the drawing gradually.
  // Each fragment keeps its own random direction and radius instead of sharing a current.
  const radius = Math.pow(spread, 1.8) * Math.min(lastWidth, lastHeight) * 0.4
    * Math.sqrt(randomValue(seed + 19.1));
  const angle = randomValue(seed + 7.3) * Math.PI * 2
    + perlinNoise(seed * 0.17, physicsTime * 0.12) * 1.2;
  return new paper.Point(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

function updateFragments(letter, strokeWidth, delta) {
  const spread = CONFIG.spread / 100;
  const wiggle = CONFIG.wiggle / 100;
  const animated = spread > 0 || wiggle > 0;
  letter.outline.visible = !animated;
  letter.outline.strokeWidth = strokeWidth;
  if (animated && !letter.fragments.length) {
    letter.fragments = letter.template.pieces.map((samples, index) => {
      // A few control masses are enough to form a soft spline along each long fragment.
      const count = Math.min(7, samples.length);
      const points = Array.from({ length: count }, (_, sample) => samples[Math.round(sample * (samples.length - 1) / (count - 1))]);
      const path = new paper.Path({
        segments: points, fillColor: null, strokeColor: OUTLINE, strokeWidth,
        strokeCap: 'round', strokeJoin: 'round', strokeScaling: false, applyMatrix: false,
      });
      letter.group.addChild(path);
      return {
        path, points, center: points[Math.floor(points.length / 2)], seed: letter.seed + index * 13,
        nodes: points.map(point => ({ x: point.x, y: point.y, vx: 0, vy: 0, ax: 0, ay: 0 })),
        motion: { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 }, active: false,
      };
    });
  }
  for (const fragment of letter.fragments) {
    const { path, points, center, nodes, motion } = fragment;
    path.visible = animated;
    if (!animated) { fragment.active = false; continue; }
    path.strokeWidth = strokeWidth;
    if (!fragment.active) {
      nodes.forEach((node, index) => {
        Object.assign(node, { x: points[index].x, y: points[index].y, vx: 0, vy: 0 });
      });
      Object.assign(motion, { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 });
      fragment.active = true;
    }
    const origin = letter.group.matrix.transform(center);
    if (delta > 0) stepFragment(fragment, spread, wiggle, delta);
    for (const [index, node] of nodes.entries()) path.segments[index].point.set(node.x, node.y);
    path.smooth({ type: 'continuous' });
    const destination = letter.group.matrix.inverseTransform(origin.add(new paper.Point(motion.x, motion.y)));
    const offset = destination.subtract(center);
    const cosine = Math.cos(motion.angle), sine = Math.sin(motion.angle);
    path.matrix.set(cosine, sine, -sine, cosine,
      center.x + offset.x - cosine * center.x + sine * center.y,
      center.y + offset.y - sine * center.x - cosine * center.y);
  }
}

function stepFragment(fragment, spread, wiggle, delta) {
  const { nodes, points, seed, motion } = fragment;
  const target = flowOffset(spread, seed);
  // Rotation also grows progressively, with a different slow variation for every fragment.
  const targetAngle = Math.pow(spread, 1.8) * (
    (randomValue(seed + 53.2) * 2 - 1) * Math.PI
    + perlinNoise(seed * 0.23 + 17.1, physicsTime * 0.1) * 0.4);
  // Each control point has mass. Springs retain the outline and transmit bends to neighbors.
  const targets = points.map((point, index) => {
    const fraction = index / (points.length - 1);
    const envelope = 0.3 + 0.7 * Math.sin(fraction * Math.PI);
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x, dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    // A traveling sine wave moves across the spline, perpendicular to its outline.
    // Wiggle sets its amplitude in 100 px glyph units, independently of Spread.
    const phase = fraction * Math.PI * 2.4 - physicsTime * 3.8 + seed * 0.37;
    const current = perlinNoise(fraction * 2 + seed * 0.13, physicsTime * 0.65);
    const bend = (Math.sin(phase) * 38 + current * 12) * wiggle * envelope;
    return {
      x: point.x - dy / length * bend,
      y: point.y + dx / length * bend,
    };
  });
  // Remove the average displacement so Wiggle bends a fragment around its home position.
  const meanX = targets.reduce((sum, target, index) => sum + target.x - points[index].x, 0) / points.length;
  const meanY = targets.reduce((sum, target, index) => sum + target.y - points[index].y, 0) / points.length;
  targets.forEach(target => { target.x -= meanX; target.y -= meanY; });
  // Short integration steps keep the springs stable after a slow frame.
  const steps = Math.ceil(delta * 120);
  const dt = delta / steps;
  const damping = Math.exp(-4.5 * dt);
  for (let step = 0; step < steps; step++) {
    for (const [index, node] of nodes.entries()) {
      node.ax = (targets[index].x - node.x) * 32;
      node.ay = (targets[index].y - node.y) * 32;
      for (const neighbor of [index - 1, index + 1]) {
        if (neighbor < 0 || neighbor >= nodes.length) continue;
        node.ax += ((nodes[neighbor].x - points[neighbor].x) - (node.x - points[index].x)) * 24;
        node.ay += ((nodes[neighbor].y - points[neighbor].y) - (node.y - points[index].y)) * 24;
      }
    }
    for (const node of nodes) {
      node.vx = (node.vx + node.ax * dt) * damping;
      node.vy = (node.vy + node.ay * dt) * damping;
      node.x += node.vx * dt;
      node.y += node.vy * dt;
    }
    // Neighboring masses keep approximately the same spacing, like a flexible strand.
    for (let index = 1; index < nodes.length; index++) {
      const a = nodes[index - 1], b = nodes[index];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const rest = points[index].getDistance(points[index - 1]);
      if (length < 0.0001) continue;
      const correction = (length - rest) / length * 0.3;
      a.x += dx * correction; a.y += dy * correction;
      b.x -= dx * correction; b.y -= dy * correction;
    }
    motion.vx = (motion.vx + (target.x - motion.x) * 12 * dt) * damping;
    motion.vy = (motion.vy + (target.y - motion.y) * 12 * dt) * damping;
    motion.spin = (motion.spin + (targetAngle - motion.angle) * 10 * dt) * damping;
    motion.x += motion.vx * dt;
    motion.y += motion.vy * dt;
    motion.angle += motion.spin * dt;
  }
}
