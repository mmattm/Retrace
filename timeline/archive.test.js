import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createArchive, validateArchive, maxArchiveBytes } from './archive.js';
import { importArchive, localProjectImport } from './project-import.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'retrace-import-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'timeline/versions'), { recursive: true });
  writeFileSync(join(root, 'timeline/projects.json'), '[]\n');
  return { root, projects: () => JSON.parse(readFileSync(join(root, 'timeline/projects.json'), 'utf8')) };
}

function archive() {
  return { format: 'retrace', schemaVersion: 1, kind: 'project', project: {
    id: 'elastic-type', title: 'Elastic type', versions: [{
      id: 'v1', createdAt: '2026-11-26T14:35:46.507Z', prompt: 'Déformer les lettres.\n',
      summary: 'Bend elastic letter fragments.', engine: 'paper', files: {
        'sketch.js': '// Engine: Paper.js\nfunction setup() {}\n',
        'ui.js': "import { Pane } from 'tweakpane';\nexport function createUI() {}\n",
        'agent.json': '{"description":"Existing agent","parameters":{}}\n',
        'prompt.txt': 'Déformer les lettres.\n',
      },
    }] } };
}

test('project JSON round trips sources, controls, engine, prompts and existing agent without altering originals', async t => {
  const { root, projects } = fixture(t);
  const data = archive();
  assert.equal(importArchive(root, data).imported, 1);
  const project = projects()[0];
  assert.equal(project.versions[0].sketch, 'timeline/versions/elastic-type/v1/sketch.js');
  const sources = Object.fromEntries(Object.entries(data.project.versions[0].files).map(([name, source]) =>
    [`./versions/elastic-type/v1/${name}`, async () => source]));
  const exported = await createArchive(project, undefined, sources);
  assert.deepEqual(exported, data);
  assert.deepEqual(await createArchive(project, project.versions[0], sources), { ...data, kind: 'iteration' });
  const index = readFileSync(join(root, 'timeline/projects.json'), 'utf8');
  assert.equal(importArchive(root, exported).imported, 0);
  assert.equal(readFileSync(join(root, 'timeline/projects.json'), 'utf8'), index);
  for (const [name, source] of Object.entries(data.project.versions[0].files)) {
    assert.equal(readFileSync(join(root, 'timeline/versions/elastic-type/v1', name), 'utf8'), source);
  }
});

test('missing versions merge in order and an iteration can be restored into the selected project', t => {
  const { root, projects } = fixture(t);
  const data = archive();
  importArchive(root, data);
  const next = structuredClone(data.project.versions[0]);
  next.id = 'v2'; next.createdAt = '2026-11-27T12:00:00Z';
  data.project.versions.unshift(next);
  assert.equal(importArchive(root, data).imported, 1);
  assert.deepEqual(projects()[0].versions.map(v => v.id), ['v1', 'v2']);
  const single = { ...data, kind: 'iteration', project: { ...data.project, id: 'other-project', versions: [{ ...next, id: 'v3' }] } };
  const result = importArchive(root, single, 'elastic-type');
  assert.equal(result.projectId, 'elastic-type');
  assert.equal(projects().length, 1);
  assert.equal(projects()[0].versions.at(-1).id, 'v3');
  assert(existsSync(join(root, 'timeline/versions/elastic-type/v3/ui.js')));
  assert.throws(() => importArchive(root, data, 'elastic-type'), /iteration JSON/);
});

test('a conflicting source creates a separate project and preserves the existing history', t => {
  const { root, projects } = fixture(t);
  const data = archive();
  importArchive(root, data);
  const before = structuredClone(projects()[0]);
  data.project.versions[0].files['sketch.js'] += '// Changed source\n';
  const result = importArchive(root, data);
  assert.equal(result.projectId, 'elastic-type-import-1');
  assert.deepEqual(projects()[0], before);
  assert.equal(readFileSync(join(root, 'timeline/versions/elastic-type/v1/sketch.js'), 'utf8'), archive().project.versions[0].files['sketch.js']);
  assert.equal(projects()[1].versions[0].sketch, 'timeline/versions/elastic-type-import-1/v1/sketch.js');
});

test('invalid archives and traversal paths cannot write files or update the index', t => {
  const { root, projects } = fixture(t);
  const mutations = [
    data => { data.schemaVersion = 2; },
    data => { data.project.id = '../escape'; },
    data => { data.project.id = 123; },
    data => { data.project.versions[0].id = '../escape'; },
    data => { data.project.versions[0].files['../escape.js'] = 'bad'; },
    data => { data.project.versions[0].files['sketch.js'] = ''; },
    data => { data.project.versions[0].files['prompt.txt'] = 'Different'; },
    data => { data.project.versions[0].files['agent.json'] = '{'; },
    data => { data.project.versions[0].engine = 'unknown'; },
    data => { data.project.versions[0].createdAt = 'invalid'; },
    data => { data.project.versions.push(data.project.versions[0]); },
    data => { data.kind = 'iteration'; data.project.versions = []; },
  ];
  for (const mutate of mutations) {
    const data = archive(); mutate(data);
    assert.throws(() => importArchive(root, data), /Invalid Retrace/);
  }
  assert.deepEqual(projects(), []);
  assert.throws(() => validateArchive(null), /Invalid Retrace/);
});

test('imports do not follow a symlinked versions directory', t => {
  const { root, projects } = fixture(t);
  mkdirSync(join(root, 'outside'));
  rmSync(join(root, 'timeline/versions'), { recursive: true });
  symlinkSync(join(root, 'outside'), join(root, 'timeline/versions'));
  assert.throws(() => importArchive(root, archive()), /Invalid archive directory/);
  assert.deepEqual(projects(), []);
});

test('the import endpoint enforces local origin and body limits, then restores valid JSON', async t => {
  const { root, projects } = fixture(t);
  let handler;
  localProjectImport().configureServer({ config: { root, logger: { error() {} } },
    middlewares: { use(fn) { handler = fn; } } });
  async function request({ origin = 'http://localhost:5173', address = '127.0.0.1', body = JSON.stringify({ archive: archive() }) } = {}) {
    const req = Readable.from([Buffer.from(body)]);
    Object.assign(req, { url: '/api/projects/import', method: 'POST', socket: { remoteAddress: address },
      headers: { host: 'localhost:5173', origin } });
    const res = { writeHead(status) { this.status = status; return this; }, end(body) { this.body = body; } };
    await handler(req, res, () => assert.fail('Unexpected next middleware'));
    return res;
  }
  assert.equal((await request({ origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await request({ address: '192.168.1.5' })).status, 403);
  assert.equal((await request({ body: '{' })).status, 400);
  assert.equal((await request({ body: ' '.repeat(maxArchiveBytes + 1) })).status, 413);
  assert.deepEqual(projects(), []);
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).imported, 1);
  assert.equal(projects().length, 1);
});
