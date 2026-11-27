import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js/dist/svg2pdf.es.min.js';

export async function plotPDF(source, size) {
  const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  const pointsPerMM = 72 / 25.4;
  const width = size.width * pointsPerMM;
  const height = size.height * pointsPerMM;
  const pdf = new jsPDF({
    unit: 'pt', format: [width, height], orientation: width > height ? 'landscape' : 'portrait',
    compress: true, putOnlyUsedFonts: true,
  });
  // Use the same viewBox and map it onto a PDF page of the exact paper size.
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  const box = root.viewBox.baseVal;
  const pageScale = Math.min(width / box.width, height / box.height);
  // SVG uses one non-scaling pixel of ink. PDF line widths are local to each
  // transform, including the small, flipped transform of each Relief glyph.
  function setPenWidth(element, scale) {
    const matrix = element.transform?.baseVal.consolidate()?.matrix;
    if (matrix) scale *= Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
    if (scale && element.getAttribute('vector-effect') === 'non-scaling-stroke') {
      element.setAttribute('stroke-width', String(0.75 / scale));
      element.removeAttribute('vector-effect');
    }
    for (const child of element.children) setPenWidth(child, scale);
  }
  setPenWidth(root, pageScale);
  await svg2pdf(root, pdf, { width, height, loadImages: false });
  return pdf.output('blob');
}
