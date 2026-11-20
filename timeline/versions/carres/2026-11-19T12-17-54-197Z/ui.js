import { Pane } from 'tweakpane';

// The slider and the agent both update the same configuration object.
export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  const style = document.createElement('style');
  style.textContent = `
    #sketch-controls {
      --tp-base-background-color: #000;
      --tp-base-border-radius: 0;
      --tp-base-font-family: "Unica77LL", Arial, sans-serif;
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
  // step: 1 keeps the count integral, matching the agent's parameter schema.
  pane.addBinding(config, 'count', { label: 'Squares / instance', min: 1, max: 50, step: 1 });
  return pane;
}
