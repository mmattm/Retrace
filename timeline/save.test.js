import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'time-machine-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'timeline/versions/carres/original'), { recursive: true });
  mkdirSync(join(root, 'draft'));
  copyFileSync(new URL('./save.js', import.meta.url), join(root, 'timeline/save.mjs'));
  const code = 'function setup() { createCanvas(640, 640); }\n';
  writeFileSync(join(root, 'timeline/versions/carres/original/sketch.js'), code);
  writeFileSync(join(root, 'draft/sketch.js'), code);
  writeFileSync(join(root, 'timeline/projects.json'), JSON.stringify([{
    id: 'carres', title: 'Squares', versions: [
      { id: 'original', createdAt: '2026-10-23T08:00:00Z', prompt: 'Original', sketch: 'timeline/versions/carres/original/sketch.js' },
    ],
  }]));
  const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const getProject = (id) => json('timeline/projects.json').find(project => project.id === id);
  const run = (...args) => spawnSync(process.execPath, [
    join(root, 'timeline/save.mjs'), '--sketch-file', join(root, 'draft/sketch.js'), ...args,
  ], { cwd: root, encoding: 'utf8' });
  return { root, json, getProject, run };
}

test('a new project keeps the full UTF-8 prompt and a separate concise summary', (t) => {
  const { root, json, getProject, run } = fixture(t);
  const original = getProject('carres');
  const prompt = 'Create a drawing from a gesture.\nPreserve the drawing’s subtle shades.\n';
  const ui = 'export function createUI() {}\n';
  writeFileSync(join(root, 'draft/prompt.txt'), prompt);
  writeFileSync(join(root, 'draft/ui.js'), ui);
  const result = run('--project', 'motion-to-form', '--title', 'Motion to form', '--prompt-file', join(root, 'draft/prompt.txt'), '--summary', '  Loop drawn gestures.  ');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(getProject('carres'), original);
  const project = getProject('motion-to-form');
  assert.equal(project.id, 'motion-to-form');
  assert.equal(project.title, 'Motion to form');
  assert.equal(existsSync(join(root, 'timeline/projects')), false);
  const history = project.versions;
  assert.equal(history.length, 1);
  assert.equal(history[0].prompt, prompt);
  assert.equal(history[0].summary, 'Loop drawn gestures.');
  assert.match(history[0].sketch, /^timeline\/versions\/motion-to-form\//);
  assert.equal(readFileSync(join(root, history[0].sketch.replace('sketch.js', 'prompt.txt')), 'utf8'), prompt);
  assert.equal(readFileSync(join(root, history[0].sketch.replace('sketch.js', 'ui.js')), 'utf8'), ui);
});

test('subsequent saves stay within the selected project and reject duplicates', (t) => {
  const { root, json, getProject, run } = fixture(t);
  assert.equal(run('--project', 'motion', '--title', 'Motion', '--prompt', 'First gesture').status, 0);
  const first = getProject('motion').versions[0];
  assert.equal(first.summary, 'First gesture');
  writeFileSync(join(root, 'draft/sketch.js'), 'function setup() { createCanvas(320, 320); }\n');
  const next = run('--project', 'motion', '--prompt', 'Reduce the size');
  assert.equal(next.status, 0, next.stderr);
  assert.equal(getProject('motion').versions.length, 2);
  assert.deepEqual(getProject('motion').versions[0], first);
  assert.equal(getProject('carres').versions.length, 1);
  assert.equal(json('timeline/projects.json').length, 2);
  const duplicate = run('--project', 'motion', '--prompt', 'Same code');
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /identical/);
  assert.equal(getProject('motion').versions.length, 2);
});

test('a controls-only change creates a version in the original project', (t) => {
  const { root, json, getProject, run } = fixture(t);
  assert.equal(run('--project', 'carres', '--prompt', 'Identical copy').status, 1);
  writeFileSync(join(root, 'draft/ui.js'), 'export function createUI() {}');
  assert.equal(run('--project', 'carres', '--prompt', 'Add controls').status, 0);
  const history = getProject('carres').versions;
  assert.equal(history.length, 2);
  assert.equal(history[0].id, 'original');
  assert.match(history[1].sketch, /^timeline\/versions\/carres\//);
  assert.equal(json('timeline/projects.json').length, 1);
});

test('incomplete or invalid arguments do not save any versions', (t) => {
  const { root, json, getProject, run } = fixture(t);
  const cases = [
    ['--prompt', 'Missing project'],
    ['--project', '../elsewhere', '--prompt', 'Invalid ID'],
    ['--project', 'new-project', '--prompt', 'Missing title'],
    ['--project', 'new-project', '--title', 'New project', '--prompt', '   '],
    ['--project', 'new-project', '--title', 'New project', '--prompt', 'Valid prompt', '--summary', '   '],
    ['--project', 'carres', '--title', 'Another title', '--prompt', 'Rename'],
    ['--project', 'carres', '--prompt', 'Two prompts', '--prompt-file', 'absent.txt'],
    ['--project', 'carres', '--agent', '--prompt', 'Missing agent file'],
    ['--project', 'carres', '--engine', 'unknown', '--prompt', 'Unsupported engine'],
  ];
  for (const args of cases) assert.equal(run(...args).status, 1, args.join(' '));
  assert.equal(json('timeline/projects.json').length, 1);
  assert.equal(getProject('carres').versions.length, 1);
  assert.deepEqual(readdirSync(join(root, 'timeline/versions')), ['carres']);
});

test('engine metadata defaults to p5, supports Paper and Three, and participates in duplicate detection', t => {
  const { root, getProject, run } = fixture(t);
  const code = 'function setup() { /* create the scene */ }';
  writeFileSync(join(root, 'draft/sketch.js'), code);
  assert.equal(run('--project', 'carres', '--prompt', 'Default p5 engine').status, 0);
  assert.equal(getProject('carres').versions.at(-1).engine, 'p5');
  const first = getProject('carres').versions.at(-1);
  assert.equal(readFileSync(join(root, first.sketch), 'utf8'), `// Engine: p5.js\n${code}`);
  writeFileSync(join(root, 'draft/sketch.js'), `// Engine: Paper.js\n${code}`);
  assert.equal(run('--project', 'carres', '--prompt', 'Header-only change').status, 1);
  assert.equal(run('--project', 'carres', '--engine', 'paper', '--prompt', 'Switch engine').status, 0);
  assert.equal(getProject('carres').versions.at(-1).engine, 'paper');
  const vector = getProject('carres').versions.at(-1);
  assert.equal(readFileSync(join(root, vector.sketch), 'utf8'), `// Engine: Paper.js\n${code}`);
  writeFileSync(join(root, 'draft/sketch.js'), `// Engine: p5.js\n${code}`);
  assert.equal(run('--project', 'carres', '--engine', 'paper', '--prompt', 'Duplicate').status, 1);
  assert.equal(getProject('carres').versions.length, 3);
  assert.equal(run('--project', 'carres', '--engine', 'three', '--prompt', 'Use Three for drawing').status, 0);
  const drawing = getProject('carres').versions.at(-1);
  assert.equal(drawing.engine, 'three');
  assert.equal(readFileSync(join(root, drawing.sketch), 'utf8'), `// Engine: Three.js\n${code}`);
  writeFileSync(join(root, 'draft/sketch.js'), `// Engine: Three.js\n${code}`);
  assert.equal(run('--project', 'carres', '--engine', 'three', '--prompt', 'Header-only duplicate').status, 1);
  assert.equal(getProject('carres').versions.length, 4);
});

test('agent metadata is archived only with explicit opt-in and is not inherited by ordinary versions', (t) => {
  const { root, json, getProject, run } = fixture(t);
  const agent = JSON.stringify({ systemPrompt: 'Change count.', parameters: { count: { type: 'integer', minimum: 1, maximum: 50 } } });
  writeFileSync(join(root, 'draft/sketch.js'), 'function setup() { createCanvas(800, 600); }');
  writeFileSync(join(root, 'draft/agent.json'), agent);
  assert.equal(run('--project', 'carres', '--prompt', 'Agent without opt-in').status, 1);
  assert.equal(getProject('carres').versions.length, 1);
  const saved = run('--project', 'carres', '--agent', '--prompt', 'Enable count agent');
  assert.equal(saved.status, 0, saved.stderr);
  const version = getProject('carres').versions.at(-1);
  assert.equal(readFileSync(join(root, version.sketch.replace('sketch.js', 'agent.json')), 'utf8'), agent);
  assert.equal(run('--project', 'carres', '--agent', '--prompt', 'Identical code').status, 1);
  rmSync(join(root, 'draft/agent.json'));
  writeFileSync(join(root, 'draft/sketch.js'), 'function setup() { createCanvas(900, 600); }');
  assert.equal(run('--project', 'carres', '--prompt', 'Ordinary version').status, 0);
  const ordinary = getProject('carres').versions.at(-1);
  assert.equal(existsSync(join(root, ordinary.sketch.replace('sketch.js', 'agent.json'))), false);
});

test('invalid agent JSON is rejected before any version is created', (t) => {
  const { root, json, getProject, run } = fixture(t);
  writeFileSync(join(root, 'draft/agent.json'), '{');
  assert.equal(run('--project', 'carres', '--agent', '--prompt', 'Invalid metadata').status, 1);
  assert.equal(getProject('carres').versions.length, 1);
  assert.deepEqual(readdirSync(join(root, 'timeline/versions')), ['carres']);
});
