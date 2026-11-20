import { lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function deleteEntry(root, id, versionId) {
  const timeline = join(root, 'timeline');
  const index = join(timeline, 'projects.json');
  const projects = JSON.parse(readFileSync(index, 'utf8'));
  const projectIndex = projects.findIndex(project => project.id === id);
  if (projectIndex < 0) return false;

  if (versionId) {
    const history = projects[projectIndex].versions;
    const versionIndex = history.findIndex(version => version.id === versionId);
    if (versionIndex < 0) return false;
    history.splice(versionIndex, 1);
  } else {
    projects.splice(projectIndex, 1);
  }

  const versions = join(timeline, 'versions');
  const projectArchive = join(versions, id);
  const archive = versionId ? join(projectArchive, versionId) : projectArchive;
  const archiveInfo = lstatSync(archive, { throwIfNoEntry: false });
  const parents = versionId ? [versions, projectArchive] : [versions];
  if (archiveInfo && (!archiveInfo.isDirectory() || !parents.every(path => lstatSync(path).isDirectory()))) {
    throw new Error('Invalid archive directory');
  }

  // Keep the archive recoverable until the new index is in place.
  const staging = mkdtempSync(join(timeline, '.delete-'));
  const stagedIndex = join(staging, 'projects.json');
  const stagedArchive = join(staging, 'archive');
  let moved = false;
  try {
    writeFileSync(stagedIndex, JSON.stringify(projects, null, 2) + '\n');
    if (archiveInfo) {
      renameSync(archive, stagedArchive);
      moved = true;
    }
    renameSync(stagedIndex, index);
  } catch (error) {
    if (moved) renameSync(stagedArchive, archive);
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  rmSync(staging, { recursive: true, force: true, maxRetries: 2 });
  return true;
}

export function localProjectDeletion() {
  return {
    name: 'retrace-local-project-deletion',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = /^\/api\/projects\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/versions\/([A-Za-z0-9_-]+))?$/.exec(request.url);
        if (!match || request.method !== 'DELETE') return next();

        // This server also serves the LAN. Only its local browser can delete files.
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
        const { host, origin } = request.headers;
        const protocol = request.socket.encrypted ? 'https' : 'http';
        if (!local || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) || origin !== `${protocol}://${host}`) {
          response.writeHead(403).end();
          return;
        }

        try {
          response.writeHead(deleteEntry(server.config.root, match[1], match[2]) ? 204 : 404).end();
        } catch (error) {
          server.config.logger.error(`Could not delete ${match[0]}: ${error.message}`);
          response.writeHead(500).end();
        }
      });
    },
  };
}
