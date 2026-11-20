import { Pane } from 'tweakpane';

export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  const style = document.createElement('style');
  style.textContent = `
    #sketch-controls {
      --tp-base-background-color: #000;
      --tp-base-border-radius: 0;
      --tp-blade-border-radius: 0;
      --tp-input-background-color: #000;
      --tp-input-background-color-hover: #000;
      --tp-input-background-color-focus: #000;
      --tp-input-background-color-active: #000;
      --tp-input-foreground-color: #fff;
      --tp-label-foreground-color: #fff;
    }
    #sketch-controls .tp-rotv {
      border: 1px solid #fff;
      font-weight: 400;
    }
    #sketch-controls, #sketch-controls * { box-shadow: none; transition: none; }
    #sketch-controls .tp-sldv_t::before { background: #fff; height: 1px; }
  `;
  document.head.append(style);

  const pane = new Pane({ container });
  // Width is in logical pixels. New marks use this limit; existing ink keeps its shape.
  pane.addBinding(config, 'maxWidth', {
    label: 'Max stroke width', min: config.minWidth, max: 200, step: 0.5,
  });
  return pane;
}
