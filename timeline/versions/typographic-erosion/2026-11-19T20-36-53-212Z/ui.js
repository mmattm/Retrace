import { Pane } from 'tweakpane';

export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  const hint = document.createElement('p');
  hint.textContent = 'Drag on the canvas to draw a curve; the text follows it. A new stroke replaces the previous curve.';
  hint.style.margin = '0 0 8px';
  hint.style.fontSize = '12px';
  hint.style.lineHeight = '16px';
  hint.style.color = 'white';
  container.append(hint);

  const pane = new Pane({ container });
  pane.addBinding(config, 'text', { label: 'Text' });
  return pane;
}
