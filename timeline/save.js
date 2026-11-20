import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

// This script runs in Node, outside the browser.
function writeJSON(file, data) {
  const temporary = new URL(`${file.href}.tmp`);
  writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n');
  renameSync(temporary, file);
}

function withoutEngineHeader(code) {
  return code.replace(/^\/\/ Engine: (?:p5\.js|Paper\.js|Three\.js)(?:\r?\n|$)/, '');
}

try {
  const { values } = parseArgs({
    options: {
      'project': { type: 'string' },
      'title': { type: 'string' },
      'sketch-file': { type: 'string' },
      'prompt': { type: 'string' },
      'prompt-file': { type: 'string' },
      'summary': { type: 'string' },
      'agent': { type: 'boolean', default: false },
      'engine': { type: 'string', default: 'p5' },
    },
  });
  if (!values.project || !values['sketch-file'] || (values.prompt !== undefined) === (values['prompt-file'] !== undefined)) {
    throw new Error('Provide --project, --sketch-file and either --prompt or --prompt-file.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.project)) {
    throw new Error('Use a project ID with lowercase letters, digits and hyphens (e.g. motion-to-form).');
  }
  if (!['p5', 'paper', 'three'].includes(values.engine)) throw new Error('Use --engine p5, --engine paper or --engine three.');

  const index = new URL('./projects.json', import.meta.url);
  const projects = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : [];
  let project = projects.find(project => project.id === values.project);
  const isNew = !project;
  if (isNew) {
    if (!values.title?.trim()) throw new Error('For a new project, provide its title with --title.');
    project = { id: values.project, title: values.title.trim(), versions: [] };
  } else if (values.title !== undefined && values.title.trim() !== project.title) {
    throw new Error('This project already exists. To rename it, edit its title in timeline/projects.json.');
  }

  const prompt = values['prompt-file'] !== undefined
    ? readFileSync(values['prompt-file'], 'utf8')
    : values.prompt;
  if (!prompt.trim()) throw new Error('The prompt cannot be empty.');
  if (values.summary !== undefined && !values.summary.trim()) throw new Error('The summary cannot be empty.');
  const summary = values.summary?.trim() ?? prompt.trim();

  const source = withoutEngineHeader(readFileSync(values['sketch-file'], 'utf8'));
  const engineName = { p5: 'p5.js', paper: 'Paper.js', three: 'Three.js' }[values.engine];
  const code = `// Engine: ${engineName}\n${source}`;
  // The optional interface stays in the same folder as the sketch.
  const uiFile = join(dirname(values['sketch-file']), 'ui.js');
  const uiCode = existsSync(uiFile) ? readFileSync(uiFile) : null;
  const agentFile = join(dirname(values['sketch-file']), 'agent.json');
  if (existsSync(agentFile) && !values.agent) {
    throw new Error('agent.json requires --agent and an explicit request for agent support.');
  }
  if (values.agent) {
    if (!existsSync(agentFile)) throw new Error('--agent requires an agent.json beside the sketch.');
    JSON.parse(readFileSync(agentFile, 'utf8'));
  }
  const root = new URL('../', import.meta.url);
  const history = project.versions;
  if (history.length) {
    const previous = new URL(history.at(-1).sketch, root);
    const previousUI = new URL('ui.js', previous);
    const sameUI = uiCode === null
      ? !existsSync(previousUI)
      : existsSync(previousUI) && uiCode.equals(readFileSync(previousUI));
    if (source === withoutEngineHeader(readFileSync(previous, 'utf8')) && sameUI && (history.at(-1).engine ?? 'p5') === values.engine) {
      throw new Error('The sketch and its interface are identical to the latest version of this project: no version saved.');
    }
  }

  const createdAt = new Date().toISOString();
  const id = createdAt.replaceAll(':', '-').replace('.', '-');
  const sketch = `timeline/versions/${project.id}/${id}/sketch.js`;
  const destination = new URL('./', new URL(sketch, root));
  mkdirSync(new URL(`./versions/${project.id}/`, import.meta.url), { recursive: true });
  mkdirSync(destination);
  writeFileSync(new URL('sketch.js', destination), code);
  if (uiCode !== null) copyFileSync(uiFile, new URL('ui.js', destination));
  if (values.agent) copyFileSync(agentFile, new URL('agent.json', destination));
  writeFileSync(new URL('prompt.txt', destination), prompt);
  history.push({ id, createdAt, prompt, summary, sketch, engine: values.engine });

  // Replace each index atomically so Vite never reads an incomplete file.
  mkdirSync(new URL('./', index), { recursive: true });
  if (isNew) projects.push(project);
  writeJSON(index, projects);
  console.log(`${project.title} (${project.id}) — version ${history.length} saved: ${sketch}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
