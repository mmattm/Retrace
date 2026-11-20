// Engine: Three.js
// Draw on a hidden sphere; only the strokes reveal its surface.
const CONFIG = { minWidth: 1.5, maxWidth: 10, rotationSpeed: 0.18, radiusRatio: 0.34 };
const sphere = new THREE.Group();
const raycaster = new THREE.Raycaster();
const unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
const inverse = new THREE.Matrix4();
const localRay = new THREE.Ray();
const pointer = new THREE.Vector2();
let canvas, pointerId = null, activeStroke = null, previousPoint = null, previousInput = null;

async function setup() {
  const { scene, camera, renderer } = window.sketchRuntime;
  canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';
  canvas.setAttribute('aria-label', 'Drag to draw on the invisible rotating sphere');

  // Keep the orthographic view, with room for the sphere in front of the camera.
  camera.position.z = 2000;
  camera.far = 4000;
  camera.updateProjectionMatrix();
  scene.add(sphere);

  // This mesh writes depth only: it hides rear strokes without drawing a surface.
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 48),
    new THREE.MeshBasicMaterial({ colorWrite: false })
  );
  surface.renderOrder = -1;
  sphere.add(surface);
  draw(0);

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || pointerId !== null) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    addPoint(event);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) addPoint(sample);
    event.preventDefault();
  });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    addPoint(event);
    endStroke();
  });
  canvas.addEventListener('pointercancel', event => {
    if (event.pointerId === pointerId) endStroke();
  });
  canvas.addEventListener('lostpointercapture', endStroke);
  window.addEventListener('blur', endStroke);

  // The shared sidebar binds directly to the same brush settings used by addPoint().
  const { createUI } = await import('./ui.js');
  createUI(CONFIG);
}

function endStroke() {
  const captured = pointerId;
  pointerId = null;
  activeStroke = null;
  previousPoint = null;
  previousInput = null;
  if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
}

function addPoint(event) {
  const { scene, camera } = window.sketchRuntime;
  const bounds = canvas.getBoundingClientRect();
  pointer.set(
    (event.clientX - bounds.left) / bounds.width * 2 - 1,
    1 - (event.clientY - bounds.top) / bounds.height * 2
  );
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(pointer, camera);
  // Transform the ray into the rotating sphere's local coordinates.
  inverse.copy(sphere.matrixWorld).invert();
  localRay.copy(raycaster.ray).applyMatrix4(inverse);
  const point = localRay.intersectSphere(unitSphere, new THREE.Vector3());
  if (!point) {
    // Re-entering the sphere starts a separate path instead of bridging empty space.
    activeStroke = null;
    previousPoint = null;
    previousInput = null;
    return;
  }
  if (previousPoint && point.distanceTo(previousPoint) * sphere.scale.x < 1.5) return;

  const { width, height } = window.sketchRuntime;
  const input = {
    x: (pointer.x + 1) * width / 2, y: (1 - pointer.y) * height / 2,
    time: event.timeStamp, width: CONFIG.maxWidth,
  };
  if (previousInput) {
    // Gesture speed is measured in logical pixels per millisecond.
    const distance = Math.hypot(input.x - previousInput.x, input.y - previousInput.y);
    const speed = distance / Math.max(1, input.time - previousInput.time);
    const targetWidth = THREE.MathUtils.lerp(CONFIG.maxWidth, CONFIG.minWidth, Math.min(speed / 1.5, 1));
    input.width = THREE.MathUtils.lerp(previousInput.width, targetWidth, 1 - Math.exp(-distance / 10));
  }

  if (!activeStroke) {
    // Screen-space strokes need both faces in the shared Y-down scene.
    const material = new THREE.LineMaterial({
      color: 0xffffff, linewidth: 1, side: THREE.DoubleSide,
    });
    // Extend the existing screen-space line shader with a width at each endpoint.
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float instanceWidthStart;\nattribute float instanceWidthEnd;\n' +
        shader.vertexShader.replace('offset *= linewidth;',
          'offset *= (position.y < 0.5 ? instanceWidthStart : instanceWidthEnd);');
    };
    const line = new THREE.Line2(new THREE.LineGeometry(), material);
    sphere.add(line);
    activeStroke = { line, positions: [], widths: [] };
  }
  const { positions, widths } = activeStroke;
  // Short, normalized segments follow the sphere rather than cutting through it.
  const steps = previousPoint ? Math.max(1, Math.ceil(point.distanceTo(previousPoint) * sphere.scale.x / 2)) : 1;
  for (let step = 1; step <= steps; step++) {
    const sample = previousPoint ? previousPoint.clone().lerp(point, step / steps) : point.clone();
    sample.normalize().multiplyScalar(1.004);
    positions.push(sample.x, sample.y, sample.z);
    widths.push(THREE.MathUtils.lerp(previousInput?.width ?? input.width, input.width, step / steps));
  }
  // A tiny segment gives taps a round cap without a zero-length shader direction.
  let displayPositions = positions;
  let displayWidths = widths;
  if (positions.length === 3) {
    const tangent = new THREE.Vector3(1, 0, 0).transformDirection(inverse);
    tangent.addScaledVector(point, -tangent.dot(point));
    const tip = point.clone().addScaledVector(tangent, 0.001).normalize().multiplyScalar(1.004);
    displayPositions = [...positions, tip.x, tip.y, tip.z];
    displayWidths = [widths[0], widths[0]];
  }
  const geometry = new THREE.LineGeometry();
  geometry.setPositions(displayPositions);
  geometry.setAttribute('instanceWidthStart', new THREE.InstancedBufferAttribute(new Float32Array(displayWidths.slice(0, -1)), 1));
  geometry.setAttribute('instanceWidthEnd', new THREE.InstancedBufferAttribute(new Float32Array(displayWidths.slice(1)), 1));
  activeStroke.line.geometry.dispose();
  activeStroke.line.geometry = geometry;
  previousPoint = point;
  previousInput = input;
  window.sketchRuntime.redraw();
}

function draw(deltaSeconds) {
  const { width, height } = window.sketchRuntime;
  sphere.position.set(width / 2, height / 2, 0);
  sphere.scale.setScalar(Math.min(width, height) * CONFIG.radiusRatio);
  if (pointerId === null) sphere.rotation.y += deltaSeconds * CONFIG.rotationSpeed;
}
