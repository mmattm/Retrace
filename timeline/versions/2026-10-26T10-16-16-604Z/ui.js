import { Pane } from 'tweakpane';

// Le sketch transmet ses paramètres : le panneau modifie le même objet.
export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  // Le thème reprend la typographie et les couleurs de la timeline.
  const style = document.createElement('style');
  style.textContent = `
    #sketch-controls {
      position: fixed;
      top: 24px;
      right: 24px;
      width: 240px;
      max-width: calc(100vw - 48px);
      --tp-base-background-color: #000;
      --tp-base-border-radius: 0;
      --tp-base-font-family: "MonoLisa", monospace;
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
      font-size: 12px;
      font-weight: 400;
    }
    #sketch-controls, #sketch-controls * { box-shadow: none; transition: none; }
    #sketch-controls .tp-sldv_t::before { background: #fff; height: 1px; }
  `;
  document.head.append(style);

  const pane = new Pane({ container });
  // Le slider modifie directement CONFIG.count, relu à chaque image par draw().
  // step: 1 impose des entiers : on ne peut pas dessiner une fraction de carré.
  pane.addBinding(config, 'count', { label: 'Carrés', min: 1, max: 50, step: 1 });
}

