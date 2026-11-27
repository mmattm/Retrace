import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { archiveFiles, maxArchiveBytes, validateArchive } from './archive.js';

function checkDirectory(path) {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Invalid archive directory.');
}

function sameVersion(root, project, version, incoming) {
  if (version.createdAt !== incoming.createdAt || version.prompt !== incoming.prompt
    || (version.summary ?? version.prompt.trim()) !== incoming.summary || (version.engine ?? 'p5') !== incoming.engine) return false;
  const directory = join(root, 'timeline/versions', project.id, version.id);
  checkDirectory(directory);
  return archiveFiles.every(name => {
    const path = join(directory, name);
    const info = lstatSync(path, { throwIfNoEntry: false });
    return incoming.files[name] === undefined ? !info
      : info?.isFile() && !info.isSymbolicLink() && readFileSync(path, 'utf8') === incoming.files[name];
  });
}

export function importArchive(root, data, targetProjectId) {
  const archive = validateArchive(data);
  if (targetProjectId && archive.kind !== 'iteration') throw new Error('Choose an iteration JSON file to import into this project.');
  const timeline = join(root, 'timeline');
  checkDirectory(timeline);
  const index = join(timeline, 'projects.json');
  const projects = JSON.parse(readFileSync(index, 'utf8'));
  const versionsDirectory = join(timeline, 'versions');
  checkDirectory(versionsDirectory);
  let id = targetProjectId ?? archive.project.id;
  let project = projects.find(project => project.id === id);
  if (targetProjectId && !project) throw new Error('The destination project no longer exists.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Invalid project ID.');
  checkDirectory(join(versionsDirectory, id));
  // Reimports merge missing versions. Conflicting content is kept in a separate project.
  const conflict = project ? archive.project.versions.some(incoming => {
    const existing = project.versions.find(version => version.id === incoming.id);
    return existing ? !sameVersion(root, project, existing, incoming)
      : existsSync(join(versionsDirectory, id, incoming.id));
  }) || (!targetProjectId && project.title !== archive.project.title)
    : existsSync(join(versionsDirectory, id));
  if (conflict) {
    let suffix = 1;
    do { id = `${archive.project.id}-import-${suffix++}`; }
    while (projects.some(project => project.id === id) || existsSync(join(versionsDirectory, id)));
    project = null;
  }
  const isNew = !project;
  if (isNew) {
    project = { id, title: archive.project.title, versions: [] };
    projects.push(project);
  }
  const incoming = archive.project.versions.filter(version => !project.versions.some(existing => existing.id === version.id));
  if (!isNew && !incoming.length) return { projectId: id, versionId: archive.project.versions.at(-1)?.id, imported: 0 };

  // Stage all files before publishing the index; a failed import leaves history intact.
  const staging = mkdtempSync(join(timeline, '.import-'));
  const destination = join(versionsDirectory, id);
  const moved = [];
  let createdProjectDirectory = false;
  try {
    for (const version of incoming) {
      const directory = join(staging, version.id);
      mkdirSync(directory);
      for (const [name, source] of Object.entries(version.files)) writeFileSync(join(directory, name), source);
      const { files, ...metadata } = version;
      project.versions.push({ ...metadata, sketch: `timeline/versions/${id}/${version.id}/sketch.js` });
    }
    // Creation dates determine chronology when restoring only part of a history.
    project.versions.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    writeFileSync(join(staging, 'projects.json'), JSON.stringify(projects, null, 2) + '\n');
    if (!existsSync(destination)) {
      mkdirSync(destination, { recursive: true });
      createdProjectDirectory = true;
    }
    for (const version of incoming) {
      const path = join(destination, version.id);
      renameSync(join(staging, version.id), path);
      moved.push(path);
    }
    renameSync(join(staging, 'projects.json'), index);
  } catch (error) {
    moved.forEach(path => rmSync(path, { recursive: true, force: true }));
    if (createdProjectDirectory) rmSync(destination, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { projectId: id, versionId: incoming.at(-1)?.id, imported: incoming.length };
}

export function localProjectImport() {
  return {
    name: 'retrace-local-project-import',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url !== '/api/projects/import' || request.method !== 'POST') return next();
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
        const { host, origin } = request.headers;
        const protocol = request.socket.encrypted ? 'https' : 'http';
        if (!local || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) || origin !== `${protocol}://${host}`) {
          response.writeHead(403).end();
          return;
        }
        try {
          let size = 0;
          const chunks = [];
          for await (const chunk of request) {
            size += chunk.length;
            if (size > maxArchiveBytes) {
              response.writeHead(413).end('JSON archive is too large (maximum 20 MB).');
              return;
            }
            chunks.push(chunk);
          }
          const { archive, targetProjectId } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const result = importArchive(server.config.root, archive, targetProjectId);
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
        } catch (error) {
          server.config.logger.error(`Could not import archive: ${error.message}`);
          response.writeHead(400).end('Could not import this archive. Check its format and destination.');
        }
      });
    },
  };
}
