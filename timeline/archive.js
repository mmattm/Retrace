// A JSON archive carries source files, rather than Vite's transformed browser modules.
export const archiveFiles = ['sketch.js', 'ui.js', 'agent.json', 'prompt.txt'];
export const maxArchiveBytes = 20 * 1024 * 1024;

export function validateArchive(value) {
  const fail = () => { throw new Error('Invalid Retrace JSON archive.'); };
  if (value?.format !== 'retrace' || value.schemaVersion !== 1 || !['project', 'iteration'].includes(value.kind)) fail();
  const project = value.project;
  if (typeof project?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id) || typeof project.title !== 'string' || !project.title.trim()) fail();
  if (!Array.isArray(project.versions) || (value.kind === 'iteration' && project.versions.length !== 1)) fail();
  const ids = new Set();
  const versions = project.versions.map(version => {
    if (typeof version?.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(version.id) || ids.has(version.id)) fail();
    ids.add(version.id);
    if (typeof version.createdAt !== 'string' || !Number.isFinite(Date.parse(version.createdAt))) fail();
    if (typeof version.prompt !== 'string' || typeof version.summary !== 'string') fail();
    if (!['p5', 'paper', 'three'].includes(version.engine)) fail();
    const files = version.files;
    if (!files || typeof files !== 'object' || Array.isArray(files) || typeof files['sketch.js'] !== 'string' || !files['sketch.js'].trim()) fail();
    for (const [name, source] of Object.entries(files)) {
      if (!archiveFiles.includes(name) || typeof source !== 'string') fail();
    }
    if (files['prompt.txt'] !== version.prompt) fail();
    if (files['agent.json'] !== undefined) {
      try { JSON.parse(files['agent.json']); } catch { fail(); }
    }
    return { id: version.id, createdAt: version.createdAt, prompt: version.prompt,
      summary: version.summary, engine: version.engine, files: { ...files } };
  });
  return { format: 'retrace', schemaVersion: 1, kind: value.kind,
    project: { id: project.id, title: project.title, versions } };
}

export async function createArchive(project, version, sources) {
  const versions = await Promise.all((version ? [version] : project.versions).map(async entry => {
    const directory = entry.sketch.replace(/^timeline\//, './').replace(/sketch\.js$/, '');
    const files = { 'prompt.txt': entry.prompt };
    for (const name of archiveFiles.filter(name => name !== 'prompt.txt')) {
      const load = sources[directory + name];
      if (load) files[name] = await load();
    }
    return { id: entry.id, createdAt: entry.createdAt, prompt: entry.prompt,
      summary: entry.summary ?? entry.prompt.trim(), engine: entry.engine ?? 'p5', files };
  }));
  return validateArchive({ format: 'retrace', schemaVersion: 1,
    kind: version ? 'iteration' : 'project', project: { id: project.id, title: project.title, versions } });
}
