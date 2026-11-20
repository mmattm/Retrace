import { Pane } from 'tweakpane';

export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  const hint = document.createElement('p');
  hint.className = 'sketch-helper';
  hint.textContent = 'Draw a curve to repeat the text; Pencil pressure varies its size along the line. Text size sets the maximum, and each new stroke replaces the curve.';
  container.append(hint);

  const pane = new Pane({ container });
  pane.addBinding(config, 'text', { label: 'Text' });
  pane.addBinding(config, 'textSize', { label: 'Text size', min: 12, max: 160, step: 1 });
  return pane;
}
