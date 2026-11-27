import { appendCredits, creditLines } from './plot-credits.js';

// Vite also forwards requests from iPads to the computer running the USB bridge.
const bridgeURL = import.meta.env?.DEV ? window.location.origin : 'http://127.0.0.1:8765';

export function supportsAxiDraw(runtime) {
  return runtime?.engine === 'paper' && typeof runtime.exportSVG === 'function';
}

export function axidrawStatusMessage(status) {
  if (!status) return 'Bridge unavailable. Start the Python script and reload the page.';
  if (status.connectionError) return `AxiDraw connection check failed: ${status.connectionError}`;
  if (!status.connected) return 'AxiDraw disconnected. Connect the USB cable, restart the bridge and reload the page.';
  return status.state === 'idle' ? 'AxiDraw connected. Ready to plot.' : `AxiDraw connected. ${status.message}`;
}

export async function axidrawRequest(path, body) {
  const response = await fetch(new URL(`/api/axidraw/${path}`, bridgeURL), {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `AxiDraw request failed (${response.status}).`);
  return data;
}

// Keep the original paths: a wide stroke is still one pen trajectory.
export function preparePlotPaths(root) {
  let count = 0;
  function visit(node, inherited = { stroke: 'none', 'stroke-width': '1', 'stroke-opacity': '1' }) {
    const tag = node.localName;
    if (['clipPath', 'mask'].includes(tag)) return;
    if (['image', 'text', 'foreignObject', 'script', 'style'].includes(tag)) { node.remove(); return; }
    const styles = new Map((node.getAttribute('style') || '').split(';').filter(Boolean).map(rule => {
      const colon = rule.indexOf(':');
      return [rule.slice(0, colon).trim(), rule.slice(colon + 1).trim()];
    }));
    const value = name => styles.get(name) ?? node.getAttribute(name) ?? inherited[name];
    const stroke = value('stroke');
    const width = value('stroke-width');
    const opacity = value('stroke-opacity');
    if (value('display') === 'none' || value('visibility') === 'hidden' || Number(value('opacity') ?? 1) === 0) {
      node.remove();
      return;
    }
    // Paper previews use plain ink, regardless of the sketch's compositing.
    for (const name of ['opacity', 'filter', 'mix-blend-mode', 'background', 'background-color']) {
      styles.delete(name);
      node.removeAttribute(name);
    }
    node.setAttribute('opacity', '1');
    if (['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'].includes(tag)) {
      if (['none', 'transparent'].includes(stroke) || parseFloat(width) === 0 || Number(opacity) === 0) {
        node.remove();
        return;
      }
      const pen = { fill: 'none', stroke: '#000', 'stroke-width': '1', 'stroke-opacity': '1',
        'stroke-dasharray': 'none', 'vector-effect': 'non-scaling-stroke' };
      for (const [name, setting] of Object.entries(pen)) {
        styles.delete(name);
        node.setAttribute(name, setting);
      }
      count++;
    }
    node.setAttribute('style', [...styles].map(([name, setting]) => `${name}:${setting}`).join(';'));
    for (const child of [...node.children]) visit(child, { stroke, 'stroke-width': width, 'stroke-opacity': opacity });
  }
  visit(root);
  return count;
}

export function createPlotSVG(capture, size, crop, unit = 'mm', { scale = 1, center = crop, credits = [], paperSize = size } = {}) {
  if (!supportsAxiDraw(capture.runtime)) throw new Error('AxiDraw requires a Paper.js vector sketch.');
  const svg = capture.runtime.exportSVG({ ...size, crop, snapshot: capture.plotVectors ?? capture.svg });
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (document.querySelector('parsererror')) throw new Error('Could not prepare vector paths.');
  if (document.querySelector('text')) throw new Error('Start the Python bridge to convert text into vector paths.');
  if (!preparePlotPaths(document.documentElement) && !credits.length) throw new Error('No stroked vector paths to plot.');
  if (scale !== 1) {
    const root = document.documentElement;
    const [x, y, width, height] = root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    const cx = x + (center.x + center.width / 2 - crop.x) * width / crop.width;
    const cy = y + (center.y + center.height / 2 - crop.y) * height / crop.height;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('transform', `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
    for (const child of [...root.children]) group.appendChild(child);
    root.appendChild(group);
  }
  if (credits.length) {
    // The preview shows the full drawing. Anchor credits inside its movable paper frame.
    const [x, y, w, h] = document.documentElement.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    const page = { x: x + (center.x - crop.x) * w / crop.width, y: y + (center.y - crop.y) * h / crop.height,
      width: center.width * w / crop.width, height: center.height * h / crop.height };
    appendCredits(document, credits, page, paperSize.width, paperSize.height);
  }
  document.documentElement.setAttribute('width', `${size.width}${unit}`);
  document.documentElement.setAttribute('height', `${size.height}${unit}`);
  return new XMLSerializer().serializeToString(document);
}

export async function preparePlotText(capture) {
  if (!capture.svg?.querySelector?.('text')) return;
  if (!capture.plotPreparation) {
    capture.plotPreparation = axidrawRequest('prepare', { svg: new XMLSerializer().serializeToString(capture.svg) }).then(data => {
      const document = new DOMParser().parseFromString(data.svg, 'image/svg+xml');
      if (document.querySelector('parsererror') || document.querySelector('text')) throw new Error('Could not convert text to vector paths.');
      capture.plotVectors = document.documentElement;
    }).catch(error => { capture.plotPreparation = null; throw error; });
  }
  await capture.plotPreparation;
}

export function drawPlotPreview(canvas, image) {
  const context = canvas.getContext('2d');
  context.save();
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.restore();
}

export async function loadPlotPreview(capture, size, options) {
  await preparePlotText(capture);
  const crop = { x: 0, y: 0, width: capture.image.width, height: capture.image.height };
  const credits = await creditLines(options?.creditValues ?? []);
  const svg = createPlotSVG(capture, size, crop, 'px', { ...options, credits });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not preview vector paths.')); };
    image.src = url;
  });
}
