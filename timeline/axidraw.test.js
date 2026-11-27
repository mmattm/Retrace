import test from 'node:test';
import assert from 'node:assert/strict';
import { axidrawRequest, axidrawStatusMessage, createPlotSVG, drawPlotPreview, preparePlotPaths, preparePlotText, supportsAxiDraw } from './axidraw.js';
import { getCrop } from './tools.js';

// Minimal SVG elements for testing path preparation without a browser.
class SVGElement {
  constructor(localName, attributes = {}, children = []) {
    Object.assign(this, { localName, attributes: { ...attributes }, children });
    for (const child of children) child.parent = this;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  appendChild(child) { child.parent?.children.splice(child.parent.children.indexOf(child), 1); this.children.push(child); child.parent = this; }
}

test('plotting preserves the frozen vector crop and declares physical millimeters', t => {
  const names = ['DOMParser', 'XMLSerializer'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  t.after(() => names.forEach(name => {
    if (previous[name] === undefined) delete globalThis[name]; else globalThis[name] = previous[name];
  }));
  const attributes = { viewBox: '375 0 225 400', width: 90, height: 160 };
  const root = new SVGElement('svg', {}, [new SVGElement('path', { d: 'M375 0L600 400', stroke: 'white' })]);
  root.setAttribute = (name, value) => { attributes[name] = value; };
  const xml = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  globalThis.DOMParser = class { parseFromString(source, type) {
    assert.equal(source, xml);
    assert.equal(type, 'image/svg+xml');
    return { documentElement: root, querySelector: () => null };
  } };
  globalThis.XMLSerializer = class { serializeToString(document) {
    assert.equal(document.documentElement, root);
    return JSON.stringify(attributes);
  } };
  const size = { width: 90, height: 160 };
  const crop = getCrop({ width: 1200, height: 800 }, size, { x: 1, y: 0 });
  const snapshot = {};
  const capture = { svg: snapshot, runtime: { engine: 'paper', exportSVG(options) {
    assert.deepEqual(options, { ...size, crop, snapshot });
    return xml;
  } } };
  assert.deepEqual(JSON.parse(createPlotSVG(capture, size, crop)), {
    viewBox: '375 0 225 400', width: '90mm', height: '160mm', opacity: '1', style: '',
  });
});

test('paper plotting keeps a thick stroke as one unchanged centerline and skips filled backgrounds', () => {
  const path = new SVGElement('path', { d: 'M10 20 C30 40 50 60 70 80', stroke: 'white', 'stroke-width': '24', fill: 'red' });
  const background = new SVGElement('rect', { width: '800', height: '600', fill: 'black' });
  const root = new SVGElement('svg', {}, [background, path]);
  assert.equal(preparePlotPaths(root), 1);
  assert.deepEqual(root.children, [path]);
  assert.equal(path.getAttribute('d'), 'M10 20 C30 40 50 60 70 80');
  assert.equal(path.getAttribute('fill'), 'none');
  assert.equal(path.getAttribute('stroke'), '#000');
  assert.equal(path.getAttribute('stroke-width'), '1');
  assert.equal(path.getAttribute('vector-effect'), 'non-scaling-stroke');
});

test('rescale uses the same crop center in preview and print without changing paper size', t => {
  const previous = { DOMParser: globalThis.DOMParser, XMLSerializer: globalThis.XMLSerializer };
  t.after(() => Object.entries(previous).forEach(([name, value]) => value === undefined ? delete globalThis[name] : globalThis[name] = value));
  let root;
  globalThis.DOMParser = class { parseFromString(viewBox) {
    root = new SVGElement('svg', { viewBox }, [new SVGElement('path', { stroke: 'white', d: 'M100 200L500 800' })]);
    return { documentElement: root, querySelector: () => null, createElementNS: (_namespace, tag) => new SVGElement(tag) };
  } };
  globalThis.XMLSerializer = class { serializeToString() { return JSON.stringify({ ...root.attributes, transform: root.children[0].getAttribute('transform') }); } };
  const capture = { runtime: { engine: 'paper', exportSVG({ crop }) { return [crop.x, crop.y, crop.width, crop.height].map(n => n / 2).join(' '); } } };
  const crop = { x: 200, y: 400, width: 800, height: 1200 };
  const print = JSON.parse(createPlotSVG(capture, { width: 210, height: 297 }, crop, 'mm', { scale: 0.5 }));
  const preview = JSON.parse(createPlotSVG(capture, { width: 400, height: 500 }, { x: 0, y: 0, width: 1600, height: 2000 }, 'px', { scale: 0.5, center: crop }));
  assert.equal(print.width, '210mm');
  assert.equal(print.height, '297mm');
  assert.equal(print.transform, 'translate(300 500) scale(0.5) translate(-300 -500)');
  assert.equal(preview.transform, print.transform);
  assert.equal(root.children[0].children.length, 1);
});

test('paper plotting handles inherited and inline strokes while excluding invisible paths', () => {
  const line = new SVGElement('line', { x1: '1', y1: '2', x2: '3', y2: '4' });
  const styled = new SVGElement('path', { d: 'M0 0L10 10', style: 'stroke:white;stroke-width:40;fill:white' });
  const invisible = new SVGElement('path', { d: 'M0 0L10 10', 'stroke-opacity': '0' });
  const group = new SVGElement('g', { stroke: 'white', 'stroke-width': '10' }, [line, styled, invisible]);
  const root = new SVGElement('svg', {}, [group]);
  assert.equal(preparePlotPaths(root), 2);
  assert.deepEqual(group.children, [line, styled]);
  assert.equal(line.getAttribute('stroke'), '#000');
  assert.equal(styled.getAttribute('stroke-width'), '1');
  assert.equal(styled.getAttribute('style'), '');
});

test('paper preview removes dark backgrounds and blend modes that could hide black strokes', () => {
  const path = new SVGElement('path', { stroke: 'white', d: 'M0 0L10 10', style: 'mix-blend-mode:screen;filter:blur(2px)' });
  const root = new SVGElement('svg', { style: 'background:black;background-color:black;mix-blend-mode:difference;opacity:0.5' }, [path]);
  assert.equal(preparePlotPaths(root), 1);
  assert.equal(root.getAttribute('style'), '');
  assert.equal(path.getAttribute('style'), '');
  assert.equal(path.getAttribute('stroke'), '#000');
  assert.equal(path.getAttribute('fill'), 'none');
});

test('paper preview paints opaque white before drawing the black vector image', () => {
  const calls = [];
  const image = {};
  const context = {
    save() {}, restore() {},
    fillRect(...rect) {
      calls.push('paper');
      assert.equal(this.fillStyle, '#fff');
      assert.equal(this.globalAlpha, 1);
      assert.equal(this.globalCompositeOperation, 'source-over');
      assert.deepEqual(rect, [0, 0, 480, 280]);
    },
    drawImage(...args) { calls.push('ink'); assert.deepEqual(args, [image, 0, 0, 480, 280]); },
  };
  drawPlotPreview({ width: 480, height: 280, getContext: () => context }, image);
  assert.deepEqual(calls, ['paper', 'ink']);
});

test('AxiDraw is restricted to Paper.js vector exports', () => {
  assert.equal(supportsAxiDraw({ engine: 'paper', exportSVG() {} }), true);
  for (const runtime of [null, {}, { engine: 'paper' }, { engine: 'p5', exportSVG() {} }, { engine: 'three', exportSVG() {} }]) {
    assert.equal(supportsAxiDraw(runtime), false);
    assert.throws(() => createPlotSVG({ runtime }, {}, {}), /Paper.js vector sketch/);
  }
});

test('bridge submits a plot once and surfaces busy errors without retries', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url.href, 'http://127.0.0.1:8765/api/axidraw/plot');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { svg: '<svg/>' });
    return { ok: false, status: 409, json: async () => ({ error: 'AxiDraw is already plotting.' }) };
  });
  await assert.rejects(axidrawRequest('plot', { svg: '<svg/>' }), /already plotting/);
  assert.equal(calls, 1);
});

test('bridge status checks never send a plot', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/api/axidraw/status');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return { ok: true, json: async () => ({ state: 'completed', message: 'Plot completed.' }) };
  });
  assert.equal((await axidrawRequest('status')).state, 'completed');
});

test('Type on Line text is converted once and cached for preview and plotting', async t => {
  const previous = { DOMParser: globalThis.DOMParser, XMLSerializer: globalThis.XMLSerializer };
  t.after(() => Object.entries(previous).forEach(([name, value]) => value === undefined ? delete globalThis[name] : globalThis[name] = value));
  const vectors = {};
  globalThis.XMLSerializer = class { serializeToString() { return '<svg><text>R</text></svg>'; } };
  globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, documentElement: vectors }; } };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url.pathname, '/api/axidraw/prepare');
    assert.equal(options.method, 'POST');
    assert.match(JSON.parse(options.body).svg, /<text>R/);
    return { ok: true, json: async () => ({ svg: '<svg><path d="M0 0L1 1"/></svg>' }) };
  });
  const capture = { svg: { querySelector: () => ({}) } };
  await Promise.all([preparePlotText(capture), preparePlotText(capture)]);
  await preparePlotText(capture);
  assert.equal(calls, 1);
  assert.equal(capture.plotVectors, vectors);
});

test('connection status distinguishes the bridge from the USB machine', () => {
  assert.match(axidrawStatusMessage(null), /Bridge unavailable/);
  assert.match(axidrawStatusMessage({ state: 'idle', connected: false }), /AxiDraw disconnected/);
  assert.equal(axidrawStatusMessage({ state: 'idle', connected: true }), 'AxiDraw connected. Ready to plot.');
  assert.match(axidrawStatusMessage({ state: 'printing', connected: true, message: 'Plotting…' }), /AxiDraw connected. Plotting/);
  assert.match(axidrawStatusMessage({ connected: false, connectionError: 'USB error' }), /connection check failed: USB error/);
});
