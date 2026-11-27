// The file column is the stable link between the sketch's font and its printed credit.
function fileKey(file) {
  return file.split('/').at(-1).normalize('NFC').replace(/\.(otf|ttf)$/i, '').toLowerCase();
}

export function findFontCredit(catalog, font) {
  for (const row of catalog.split(/\r?\n/)) {
    const [name, file, ...author] = row.split(',').map(value => value.trim());
    if (file && fileKey(file) === fileKey(font.file || '')) return [name, author.join(', ')];
  }
  return [font.name || '', font.author || ''];
}

let relief;
async function loadLettering() {
  const response = await fetch('/assets/fonts/Axidraw/ReliefSingleLineOTF-SVG-Regular.otf');
  if (!response.ok) throw new Error('Could not load the credit lettering.');
  const { parse } = await import('opentype.js/dist/opentype.mjs');
  return parse(await response.arrayBuffer());
}

// Keep the lettering as actual pen strokes in both the preview and the plot.
const glyphPaths = new Map();
export async function creditLines(values) {
  const lines = values.map(value => value.trim().normalize('NFC')).filter(Boolean);
  if (!lines.length) return [];
  relief ??= loadLettering().catch(error => { relief = null; throw error; });
  const font = await relief;
  return lines.map(text => {
    let width = 0;
    const glyphs = Array.from(text, char => {
      const glyph = font.charToGlyph(char);
      if (!glyphPaths.has(glyph.index)) {
        const bytes = font.tables.svg.get(glyph.index) ?? font.tables.svg.get(0);
        const xml = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
        glyphPaths.set(glyph.index, [...xml.querySelectorAll('path')].map(path => path.getAttribute('d')).join(' '));
      }
      const x = width;
      width += glyph.advanceWidth / font.unitsPerEm;
      return { d: glyphPaths.get(glyph.index), x };
    });
    return { glyphs, width, units: font.unitsPerEm };
  });
}

export function appendCredits(doc, lines, page, paperWidth, paperHeight) {
  if (!lines.length) return;
  const ns = 'http://www.w3.org/2000/svg';
  const mm = page.width / paperWidth;
  const margin = Math.min(6, paperWidth * 0.06, paperHeight * 0.06);
  const em = mm * Math.min(3.3, (paperWidth - 2 * margin) / Math.max(...lines.map(line => line.width)),
    (paperHeight - 2 * margin) / (lines.length * 1.3));
  const right = page.x + page.width - margin * mm;
  const bottom = page.y + page.height - margin * mm;
  const group = doc.createElementNS(ns, 'g');
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke', '#000');
  for (const [i, line] of lines.entries()) {
    const baseline = bottom - (0.3 + (lines.length - 1 - i) * 1.3) * em;
    for (const glyph of line.glyphs) {
      if (!glyph.d) continue;
      const path = doc.createElementNS(ns, 'path');
      const x = right - (line.width - glyph.x) * em;
      path.setAttribute('transform', `translate(${x} ${baseline}) scale(${em / line.units} ${-em / line.units})`);
      path.setAttribute('d', glyph.d);
      path.setAttribute('stroke-width', '1');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(path);
    }
  }
  doc.documentElement.appendChild(group);
}
