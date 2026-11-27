import { Pane } from 'tweakpane';

export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  const hint = document.createElement('p');
  hint.className = 'sketch-helper';
  hint.textContent = 'Drag to add text curves; Pencil pressure and roll control size and tilt. Spread gradually scatters fragments in random directions; Wiggle adds ripples to their splines.';
  container.append(hint);

  const pane = new Pane({ container });
  pane.addBinding(config, 'text', { label: 'Text' });
  pane.addBinding(config, 'textSize', { label: 'Text size', min: 12, max: 600, step: 1 });
  pane.addBinding(config, 'spread', { label: 'Spread', min: 0, max: 100, step: 1 });
  pane.addBinding(config, 'wiggle', { label: 'Wiggle', min: 0, max: 100, step: 1 });
  return pane;
}
