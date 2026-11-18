import versions from './history.json';
import p5Url from '../node_modules/p5/lib/p5.min.js?url';
import sketchStyle from '../style.css?inline';

// Associer chaque sketch à son URL, sans exécuter son code dans l'interface.
const sketches = import.meta.glob('./versions/*/sketch.js', {
  eager: true,
  query: '?url',
  import: 'default',
});

const ui = document.getElementById('sketch-timeline');
const panel = ui.querySelector('.timeline-panel');
const toggle = ui.querySelector('.timeline-toggle');
const slider = ui.querySelector('input');
const dots = ui.querySelector('.timeline-dots');
const date = ui.querySelector('.timeline-date');
const count = ui.querySelector('.timeline-count');
const prompt = ui.querySelector('.timeline-prompt');
const promptText = prompt.querySelector('.timeline-prompt-text');
const preview = ui.querySelector('iframe');
const last = Math.max(0, versions.length - 1);
let selected = -1;
let copyFeedbackTimer;

slider.max = last;
slider.value = last;
slider.disabled = last === 0;
slider.hidden = versions.length === 0;
versions.forEach((version, i) => {
  const dot = document.createElement('span');
  dot.style.left = `${last ? (i / last) * 100 : 0}%`;
  dots.append(dot);
});

function showVersion(index) {
  clearTimeout(copyFeedbackTimer);
  const version = versions[index];
  slider.value = index;
  const formattedDate = new Date(version.createdAt).toLocaleString('fr-CH', {
    dateStyle: 'medium', timeStyle: 'medium',
  });
  date.dateTime = version.createdAt;
  date.textContent = formattedDate;
  count.textContent = `${index + 1}/${versions.length}`;
  count.setAttribute('aria-label', `Version ${index + 1} sur ${versions.length}`);
  promptText.textContent = version.prompt;
  prompt.title = `${version.prompt}\n\nCliquer pour copier une consigne pour partir de cette version.`;
  slider.setAttribute('aria-valuetext', `Version ${index + 1}, ${formattedDate}`);
  [...dots.children].forEach((dot, i) => dot.classList.toggle('selected', i === index));

  // Recréer la page isole les variables et redémarre le sketch sélectionné.
  if (index !== selected) {
    preview.hidden = false;
    const url = (path) => new URL(path, document.baseURI).href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    preview.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${sketchStyle}</style>
        <script src="${url(p5Url)}"></script>
        <script src="${url(sketches[version.sketch.replace('timeline/', './')])}"></script>
        </head><body></body></html>`;
  }
  selected = index;
}

// Réserver la hauteur réelle du footer, même après un redimensionnement.
function updateLayout() {
  const height = ui.classList.contains('is-open') ? panel.offsetHeight : 0;
  document.documentElement.style.setProperty('--timeline-height', `${height}px`);
}

new ResizeObserver(updateLayout).observe(panel);

function setOpen(open) {
  ui.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  panel.setAttribute('aria-hidden', String(!open));
  panel.inert = !open;
  updateLayout();
  if (!open && panel.contains(document.activeElement)) toggle.focus();
}

// Copier la référence exacte de la version affichée, même depuis une ancienne étape.
prompt.addEventListener('click', async () => {
  const version = versions[selected];
  if (!version) return;
  let feedback;
  try {
    await navigator.clipboard.writeText(`Pars de la version du ${version.createdAt} pour créer une variante.`);
    feedback = 'Copié';
  } catch {
    feedback = 'Copie impossible';
  }
  if (versions[selected] !== version) return;
  clearTimeout(copyFeedbackTimer);
  promptText.textContent = feedback;
  copyFeedbackTimer = setTimeout(() => { promptText.textContent = version.prompt; }, 1500);
});

slider.addEventListener('input', () => showVersion(Number(slider.value)));
toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
function handleKeydown(event) {
  if (event.key === 'Escape') setOpen(false);
  if (!ui.classList.contains('is-open') || !versions.length) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  // Laisser les champs et les contrôles du sketch utiliser leurs propres flèches.
  if (event.target.isContentEditable) return;
  if (event.target.closest('input, textarea, select') && event.target !== slider) return;
  event.preventDefault(); // Évite aussi le déplacement natif supplémentaire du slider.
  const index = Math.max(0, Math.min(last, selected + (event.key === 'ArrowRight' ? 1 : -1)));
  if (index !== selected) showVersion(index);
}

document.addEventListener('keydown', handleKeydown);
// Les touches dans l'iframe ne remontent pas au document de la timeline.
preview.addEventListener('load', () => {
  preview.contentDocument.addEventListener('keydown', handleKeydown);
});
if (versions.length) {
  showVersion(last);
} else {
  count.setAttribute('aria-label', 'Version 0 sur 0');
  prompt.disabled = true;
  promptText.textContent = 'La première modification du sketch apparaîtra ici.';
}
