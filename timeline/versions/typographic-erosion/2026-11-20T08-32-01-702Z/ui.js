import { Pane } from 'tweakpane';

export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  const hint = document.createElement('p');
  hint.className = 'sketch-helper';
  hint.textContent = 'Text follows the guide line as you draw and travels along the curve when you lift. Pencil pressure varies the letter size up to Text size.';
  container.append(hint);

  const pane = new Pane({ container });
  pane.addBinding(config, 'text', { label: 'Text' });
  pane.addBinding(config, 'textSize', { label: 'Text size', min: 12, max: 160, step: 1 });
  return pane;
}
