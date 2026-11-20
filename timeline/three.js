import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// A flat drawing surface: one scene unit is one logical canvas pixel, Y downward.
export async function createThreeRuntime(stage, sketchURL) {
  window.THREE = { ...THREE, Line2, LineGeometry, LineMaterial };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.setAttribute('aria-label', 'Drawing sketch');
  stage.prepend(renderer.domElement);
  let width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  // Flip the scene rather than the projection, keeping mesh face culling correct.
  scene.position.y = height;
  scene.scale.y = -1;
  const camera = new THREE.OrthographicCamera(0, width, height, 0, 0.1, 1000);
  camera.position.z = 10;
  let running = false, animation = null, previous = null, frames = 0, fps = 60;

  function render(delta = 0) {
    window.draw?.(delta);
    renderer.render(scene, camera);
    frames++;
  }
  function tick(time) {
    if (!running) return;
    const delta = previous === null ? 0 : Math.min(0.067, (time - previous) / 1000);
    previous = time;
    if (delta > 0) fps += (1 / delta - fps) * 0.1;
    render(delta);
    animation = requestAnimationFrame(tick);
  }
  const runtime = {
    engine: 'three', scene, camera, renderer,
    get ready() { return frames > 0; },
    get frame() { return frames; },
    get width() { return width; },
    get height() { return height; },
    isPlaying: () => running,
    getFPS: () => running ? fps : 0,
    play() {
      if (running) return;
      running = true;
      previous = null;
      animation = requestAnimationFrame(tick);
    },
    pause() {
      running = false;
      cancelAnimationFrame(animation);
      animation = null;
    },
    resize(w, h) {
      width = w; height = h;
      camera.right = width; camera.top = height;
      scene.position.y = height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    },
    redraw: () => render(),
  };
  window.sketchRuntime = runtime;
  // Expose THREE and the drawing surface before evaluating the version's source.
  if (sketchURL) await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = sketchURL;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the Three.js sketch.'));
    document.head.append(script);
  });
  await window.setup?.();
  render();
  runtime.play();
  window.addEventListener('pagehide', () => {
    runtime.pause();
    scene.traverse(object => {
      object.geometry?.dispose();
      for (const material of [object.material].flat()) material?.dispose();
    });
    renderer.dispose();
  }, { once: true });
  return runtime;
}
