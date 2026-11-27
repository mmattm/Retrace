import { Pane } from 'tweakpane';

export const FONTS = [
  {
    "label": "Unica77LL",
    "file": "Unica77LL-Regular.otf"
  },
  {
    "label": "AxiDraw · Relief Single Line",
    "file": "Axidraw/ReliefSingleLineOTF-SVG-Regular.otf",
    "singleLine": true
  },
  {
    "label": "ECAL · Edouard Berard",
    "file": "ECAL_Typefaces/Berard-CassetteStandard.otf"
  },
  {
    "label": "ECAL · Entro Press R22 Regular",
    "file": "ECAL_Typefaces/Rasskazov-EntroPressR22-Regular.otf"
  },
  {
    "label": "ECAL · Fugu Regular",
    "file": "ECAL_Typefaces/LeeKyungJin-Fugu-Regular.otf"
  },
  {
    "label": "ECAL · LesRoisDuneNuit Bold",
    "file": "ECAL_Typefaces/Benatar-LesRoisDuneNuit-Bold.otf"
  },
  {
    "label": "ECAL · Ludibrio",
    "file": "ECAL_Typefaces/Malossi-Ludibrio.ttf"
  },
  {
    "label": "ECAL · MAAD Piet A",
    "file": "ECAL_Typefaces/Atzori-Piet_1.otf"
  },
  {
    "label": "ECAL · maas Bold",
    "file": "ECAL_Typefaces/maas-Bold.otf"
  },
  {
    "label": "ECAL · MLM Dotmatrix",
    "file": "ECAL_Typefaces/Seseke-MLM-Dotmatrix.otf"
  },
  {
    "label": "ECAL · PereLaChaise Regular",
    "file": "ECAL_Typefaces/Benediktsdóttir-PereLaChaise-Regular.otf"
  },
  {
    "label": "ECAL · Resial Bold Condensed",
    "file": "ECAL_Typefaces/Bernklau-Resial-BoldCondensed.otf"
  },
  {
    "label": "ECAL · Sinalco",
    "file": "ECAL_Typefaces/Baatevik-Sinalco.otf"
  },
  {
    "label": "ECAL · Speira Bold",
    "file": "ECAL_Typefaces/Baranowski-Speira-Bold.otf"
  },
  {
    "label": "ECAL · Supertifo Square",
    "file": "ECAL_Typefaces/Tronchin-Supertifo-Square.otf"
  },
  {
    "label": "ECAL · Tikgo Heavy",
    "file": "ECAL_Typefaces/Brun-Tikgo-Heavy.otf"
  },
  {
    "label": "ECAL · Varia Beta LOD 4",
    "file": "ECAL_Typefaces/VariaBeta-LOD4.otf"
  },
  {
    "label": "ECAL · WaterPolo DISPLAY Regular",
    "file": "ECAL_Typefaces/Tang-WaterPoloDISPLAY-Regular.otf"
  }
];

export function createUI(config) {
  const container = document.createElement('div');
  container.id = 'sketch-controls';
  document.body.append(container);

  const hint = document.createElement('p');
  hint.className = 'sketch-helper';
  hint.textContent = 'Drag to add text curves; Font also updates existing lines, and AxiDraw uses single strokes. Pencil pressure and roll control size and tilt; Spread scatters fragments and Wiggle adds ripples.';
  container.append(hint);

  const pane = new Pane({ container });
  pane.addBinding(config, 'font', { label: 'Font', options: Object.fromEntries(FONTS.map(font => [font.label, font.file])) });
  pane.addBinding(config, 'text', { label: 'Text' });
  pane.addBinding(config, 'textSize', { label: 'Text size', min: 12, max: 600, step: 1 });
  pane.addBinding(config, 'spread', { label: 'Spread', min: 0, max: 100, step: 1 });
  pane.addBinding(config, 'wiggle', { label: 'Wiggle', min: 0, max: 100, step: 1 });
  return pane;
}
