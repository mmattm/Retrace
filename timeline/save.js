import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

// Ce script s'exécute dans Node, pas dans le navigateur.
try {
  const { values } = parseArgs({
    options: {
      'sketch-file': { type: 'string' },
      'prompt': { type: 'string' },
      'prompt-file': { type: 'string' },
    },
  });
  if (!values['sketch-file'] || (values.prompt !== undefined) === (values['prompt-file'] !== undefined)) {
    throw new Error('Indiquer --sketch-file et soit --prompt, soit --prompt-file.');
  }

  const prompt = values['prompt-file'] !== undefined
    ? readFileSync(values['prompt-file'], 'utf8')
    : values.prompt;
  if (!prompt.trim()) throw new Error('Le prompt ne peut pas être vide.');

  const code = readFileSync(values['sketch-file']);
  // L'interface est facultative et reste dans le même dossier que le sketch.
  const uiFile = join(dirname(values['sketch-file']), 'ui.js');
  const uiCode = existsSync(uiFile) ? readFileSync(uiFile) : null;
  const index = new URL('./history.json', import.meta.url);
  const history = JSON.parse(readFileSync(index, 'utf8'));
  const project = new URL('../', import.meta.url);
  if (history.length) {
    const previous = new URL(history.at(-1).sketch, project);
    const previousUI = new URL('ui.js', previous);
    const sameUI = uiCode === null
      ? !existsSync(previousUI)
      : existsSync(previousUI) && uiCode.equals(readFileSync(previousUI));
    if (code.equals(readFileSync(previous)) && sameUI) {
      throw new Error('Le sketch et son interface sont identiques à la dernière version : aucune sauvegarde créée.');
    }
  }

  const createdAt = new Date().toISOString();
  const id = createdAt.replaceAll(':', '-').replace('.', '-');
  const destination = new URL(`./versions/${id}/`, import.meta.url);
  mkdirSync(new URL('./versions/', import.meta.url), { recursive: true });
  mkdirSync(destination);
  copyFileSync(values['sketch-file'], new URL('sketch.js', destination));
  if (uiCode !== null) copyFileSync(uiFile, new URL('ui.js', destination));
  writeFileSync(new URL('prompt.txt', destination), prompt);
  history.push({ id, createdAt, prompt, sketch: `timeline/versions/${id}/sketch.js` });

  // Remplacer l'index en une fois évite que Vite lise un fichier incomplet.
  const temporary = new URL('./history.tmp.json', import.meta.url);
  writeFileSync(temporary, JSON.stringify(history, null, 2) + '\n');
  renameSync(temporary, index);
  console.log(`Version ${history.length} enregistrée : ${history.at(-1).sketch}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
