import projects from './projects.json';
import p5Url from '../node_modules/p5/lib/p5.min.js?url';
import paperUrl from '../node_modules/paper/dist/paper-core.min.js?url';
import sketchStyle from '../style.css?inline';
import frameUrl from './frame.js?url';
import { createSketchTools } from './tools.js';
import { installTouchGuards } from './touch.js';
import { createArchive, maxArchiveBytes, validateArchive } from './archive.js';

installTouchGuards(document);

const agents = import.meta.glob('./versions/**/agent.json', { eager: true, import: 'default' });
const archiveSources = import.meta.glob('./versions/**/*.{js,json,txt}', { query: '?raw', import: 'default' });
// Map each sketch to its URL without running its code in the interface.
const sketches = import.meta.glob('./versions/**/sketch.js', {
  eager: true,
  query: '?url',
  import: 'default',
});

const ui = document.getElementById('sketch-timeline');
const panel = ui.querySelector('.timeline-panel');
const toggle = ui.querySelector('.timeline-toggle');
const latest = ui.querySelector('.timeline-latest');
const slider = ui.querySelector('.timeline-rail input');
const dots = ui.querySelector('.timeline-dots');
const date = ui.querySelector('.timeline-date');
const count = ui.querySelector('.timeline-count');
const selection = ui.querySelector('.timeline-selection');
const selectionTitle = selection.querySelector('.timeline-selection-title');
const selectionCount = selection.querySelector('.timeline-selection-count');
const engineLabel = ui.querySelector('.timeline-engine');
const prompt = ui.querySelector('.timeline-prompt');
const promptText = prompt.querySelector('.timeline-prompt-text');
const versionDelete = ui.querySelector('.timeline-delete');
const preview = ui.querySelector('iframe');
const backdrop = ui.querySelector('.timeline-backdrop');
const projectsPanel = ui.querySelector('.projects-panel');
const projectsToggle = ui.querySelector('.projects-toggle');
const projectsTitle = ui.querySelector('.projects-title');
const resetButton = ui.querySelector('.timeline-reset');
const projectsGrid = ui.querySelector('.projects-grid');
const footer = ui.querySelector('.timeline-footer');
const controlsToggle = ui.querySelector('.controls-toggle');
const posterToggle = ui.querySelector('.poster-toggle');
const posterLabel = posterToggle.querySelector('.poster-label');
const shortcutButtons = new Map([
  ['e', ui.querySelector('.export-toggle')],
  ['p', posterToggle],
  ['r', resetButton],
]);
const logo = ui.querySelector('.retrace-logo');
const logoLabel = logo.textContent.trim();
const networkURLs = [...document.querySelectorAll('meta[name="retrace-network-url"]')].map(meta => meta.content);
const mobileURL = networkURLs.find(url => new URL(url).origin === location.origin) ?? networkURLs[0];
let mobileCopyTimer;
logo.addEventListener('click', async () => {
  try {
    if (!mobileURL) {
      logo.textContent = 'No network address';
    } else {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(mobileURL);
      else {
        // The Clipboard API is unavailable on plain HTTP network addresses.
        const field = document.createElement('textarea');
        field.value = mobileURL;
        field.readOnly = true;
        field.style.cssText = 'position: fixed; top: 0; left: 0; opacity: 0; font-size: 16px;';
        document.body.append(field);
        try {
          field.select();
          field.setSelectionRange(0, mobileURL.length);
          if (!document.execCommand('copy')) throw new Error('Copy failed');
        } finally {
          field.remove();
          logo.focus({ preventScroll: true });
        }
      }
      logo.textContent = 'Copied';
    }
  } catch {
    logo.textContent = 'Copy failed';
  }
  clearTimeout(mobileCopyTimer);
  mobileCopyTimer = setTimeout(() => { logo.textContent = logoLabel; }, 1500);
});

let project;
let versions = [];
let selected = -1;
let controlsOpen = new URLSearchParams(location.search).get('controls') === 'true';
let controlsAvailable = false;
let posterMode = new URLSearchParams(location.search).get('poster');
if (!['portrait', 'landscape'].includes(posterMode)) posterMode = 'off';
let copyFeedbackTimer;
let selectionAnimation;
const sketchTools = createSketchTools(preview, () => project?.id ?? 'sketch');
const canDeleteHistory = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const importFile = ui.querySelector('.history-import-file');
const iterationExport = ui.querySelector('.iteration-export');
const iterationImport = ui.querySelector('.iteration-import');
const projectImport = ui.querySelector('.projects-import');
let importTarget;

async function downloadArchive(button, item, version) {
  button.disabled = true;
  try {
    const archive = await createArchive(item, version, archiveSources);
    const blob = new Blob([JSON.stringify(archive, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.id}${version ? `-${version.id}` : ''}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.alert('Could not export this archive.');
  } finally {
    button.disabled = false;
  }
}

for (const button of [projectImport, iterationImport]) {
  button.disabled = !canDeleteHistory;
  if (!canDeleteHistory) button.title = 'Open Retrace on localhost to import JSON files.';
  button.addEventListener('click', () => {
    importTarget = button === iterationImport ? project?.id : undefined;
    importFile.value = '';
    importFile.click();
  });
}
iterationExport.addEventListener('click', () => {
  if (versions[selected]) downloadArchive(iterationExport, project, versions[selected]);
});
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  projectImport.disabled = iterationImport.disabled = true;
  try {
    if (file.size > maxArchiveBytes - 1024) throw new Error('JSON archive is too large (maximum 20 MB).');
    const archive = validateArchive(JSON.parse(await file.text()));
    if (importTarget && archive.kind !== 'iteration') throw new Error('Choose an iteration JSON file to import into this project.');
    const response = await fetch('/api/projects/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive, targetProjectId: importTarget }),
    });
    if (!response.ok) throw new Error(await response.text() || 'Import failed.');
    const result = await response.json();
    const url = new URL(location.href);
    url.searchParams.set('project', result.projectId);
    if (result.versionId) url.searchParams.set('version', result.versionId);
    else url.searchParams.delete('version');
    location.assign(url.href);
  } catch (error) {
    window.alert(error.message);
  } finally {
    projectImport.disabled = iterationImport.disabled = !canDeleteHistory;
    importFile.value = '';
  }
});

async function deleteFromHistory(button, url, label) {
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
  button.disabled = true;
  try {
    const response = await fetch(url, { method: 'DELETE' });
    if (response.status !== 204) throw new Error('Deletion failed');
    window.location.reload();
  } catch {
    window.alert('Could not delete the selected item.');
    button.disabled = false;
  }
}

// Show the projects with the newest saved iteration first, without changing history.
const sortedProjects = [...projects].sort((a, b) =>
  (Date.parse(b.versions.at(-1)?.createdAt) || 0) - (Date.parse(a.versions.at(-1)?.createdAt) || 0));
sortedProjects.forEach((item) => {
  const card = document.createElement('article');
  card.className = 'project-card';
  card.dataset.project = item.id;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'project-open';
  button.textContent = item.title;
  const reference = document.createElement('button');
  reference.type = 'button';
  reference.className = 'project-id';
  reference.textContent = `ID: ${item.id}`;
  reference.title = 'Copy project reference';
  reference.setAttribute('aria-label', `Copy reference to project ${item.id}`);
  reference.setAttribute('aria-live', 'polite');
  let feedbackTimer;
  reference.addEventListener('click', async (event) => {
    event.stopPropagation(); // Copying the ID keeps the project menu open.
    clearTimeout(feedbackTimer);
    try {
      await navigator.clipboard.writeText(`Project: ${item.id}`);
      reference.textContent = 'Copied';
    } catch {
      reference.textContent = 'Copy failed';
    }
    feedbackTimer = setTimeout(() => { reference.textContent = `ID: ${item.id}`; }, 1500);
  });
  const total = document.createElement('span');
  total.className = 'project-iterations';
  const length = item.versions.length;
  total.textContent = `${length} iteration${length === 1 ? '' : 's'}`;
  card.append(button, reference, total);
  const actions = document.createElement('div');
  actions.className = 'project-actions';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'history-action';
  exportButton.textContent = 'Export';
  exportButton.setAttribute('aria-label', `Export ${item.title}`);
  exportButton.addEventListener('click', event => {
    event.stopPropagation();
    downloadArchive(exportButton, item);
  });
  actions.append(exportButton);
  if (canDeleteHistory) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'project-delete history-delete';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${item.title}`);
    remove.addEventListener('click', event => {
      event.stopPropagation();
      deleteFromHistory(remove, `/api/projects/${encodeURIComponent(item.id)}`, `“${item.title}” and its ${total.textContent}`);
    });
    actions.append(remove);
  }
  card.append(actions);
  card.addEventListener('click', () => {
    showProject(item);
    setProjectsOpen(false);
  });
  projectsGrid.append(card);
});

function showProject(nextProject, versionId = null) {
  clearTimeout(copyFeedbackTimer);
  const previousProject = project;
  const previousVersion = versions[selected];
  project = nextProject;
  versions = project.versions;
  selected = -1;
  projectsTitle.textContent = project.title;
  document.title = `${project.title} — Retrace`;
  preview.title = `Sketch — ${project.title}`;
  [...projectsGrid.children].forEach((card) => {
    const active = card.dataset.project === project.id;
    card.classList.toggle('selected', active);
    const button = card.querySelector('.project-open');
    if (active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  const last = Math.max(0, versions.length - 1);
  slider.max = last;
  slider.value = last;
  slider.disabled = versions.length < 2;
  slider.hidden = versions.length === 0;
  dots.replaceChildren();
  versions.forEach((version, i) => {
    const dot = document.createElement('span');
    dot.style.left = `${last ? (i / last) * 100 : 0}%`;
    dots.append(dot);
  });
  prompt.disabled = versions.length === 0;
  resetButton.disabled = versions.length === 0;
  iterationExport.disabled = versions.length === 0;
  versionDelete.hidden = !canDeleteHistory || versions.length === 0;
  if (versions.length) {
    const requested = versions.findIndex(version => version.id === versionId);
    showVersion(requested < 0 ? last : requested);
  } else {
    controlsAvailable = false;
    posterToggle.disabled = true;
    latest.hidden = true;
    updateURL();
    sketchTools.reset();
    controlsToggle.hidden = true;
    preview.hidden = true;
    preview.removeAttribute('srcdoc');
    count.textContent = '0/0';
    engineLabel.textContent = '';
    engineLabel.hidden = true;
    count.setAttribute('aria-label', 'Version 0 of 0');
    date.textContent = '';
    date.removeAttribute('datetime');
    promptText.textContent = 'The first sketch update will appear here.';
  }
  if (previousProject && (project !== previousProject || versions[selected] !== previousVersion)) {
    showSelection();
  }
}

function showSelection() {
  selectionTitle.textContent = project.title;
  selectionCount.textContent = count.textContent;
  selectionAnimation?.cancel();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  selectionAnimation = selection.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: 500, duration: reducedMotion ? 0 : 280, easing: 'ease-out', fill: 'backwards',
  });
}

function updateURL(version = null) {
  const url = new URL(location.href);
  if (project) url.searchParams.set('project', project.id);
  else url.searchParams.delete('project');
  if (version) url.searchParams.set('version', version.id);
  else url.searchParams.delete('version');
  if (controlsOpen) url.searchParams.set('controls', 'true');
  else url.searchParams.delete('controls');
  if (posterMode === 'off') url.searchParams.delete('poster');
  else url.searchParams.set('poster', posterMode);
  window.history.replaceState(null, '', url);
}

function showVersion(index, { restart = false } = {}) {
  clearTimeout(copyFeedbackTimer);
  const version = versions[index];
  posterToggle.disabled = false;
  latest.hidden = index === versions.length - 1;
  updateURL(version);
  slider.value = index;
  const formattedDate = new Date(version.createdAt).toLocaleString('en-GB', {
    dateStyle: 'medium', timeStyle: 'medium',
  });
  date.dateTime = version.createdAt;
  date.textContent = formattedDate;
  count.textContent = `${index + 1}/${versions.length}`;
  engineLabel.textContent = { paper: 'Paper.js', three: 'Three.js' }[version.engine] ?? 'p5.js';
  engineLabel.hidden = false;
  count.setAttribute('aria-label', `Version ${index + 1} of ${versions.length}`);
  const summary = version.summary ?? version.prompt;
  promptText.textContent = summary;
  prompt.title = `${summary}\n\nClick to copy the summary and version reference.`;
  slider.setAttribute('aria-valuetext', `Version ${index + 1}, ${formattedDate}`);
  [...dots.children].forEach((dot, i) => dot.classList.toggle('selected', i === index));

  // Recreating the page isolates variables and restarts the selected sketch.
  if (restart || index !== selected) {
    controlsAvailable = false;
    const agentPath = version.sketch.replace('timeline/', './').replace(/sketch\.js$/, 'agent.json');
    sketchTools.reset({ agent: agents[agentPath] ?? null });
    controlsToggle.hidden = true;
    controlsToggle.setAttribute('aria-expanded', 'false');
    preview.hidden = false;
    const url = (path) => new URL(path, document.baseURI).href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const engine = ['paper', 'three'].includes(version.engine) ? version.engine : 'p5';
    const sketchURL = url(sketches[version.sketch.replace('timeline/', './')]);
    const scripts = engine === 'three' ? '' : `<script src="${url(engine === 'paper' ? paperUrl : p5Url)}"></script>
        <script src="${sketchURL}"></script>`;
    preview.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
        <style>${sketchStyle}</style>
        ${scripts}
        </head><body data-engine="${engine}" data-sketch="${sketchURL}" data-poster-mode="${posterMode}" class="${controlsOpen ? '' : 'controls-hidden'}"><div id="sketch-workspace"><main id="sketch-stage"></main></div>
        <script type="module" src="${url(frameUrl)}"></script></body></html>`;
    if (!restart && selected >= 0) showSelection();
  }
  selected = index;
}

// Fit the preview above the panel while keeping the sketch viewport at full size.
function updateLayout() {
  const hidden = ui.classList.contains('is-interface-hidden');
  const footerOpen = !hidden && (ui.classList.contains('is-open') || ui.classList.contains('is-projects-open'));
  preview.inert = footerOpen;
  preview.contentDocument?.body?.classList.toggle('footer-open', footerOpen);
  backdrop.hidden = !footerOpen;
  document.documentElement.style.setProperty('--footer-height', `${footer.offsetHeight}px`);
  const panelHeight = !footerOpen ? 0 : ui.classList.contains('is-open') ? panel.offsetHeight : projectsPanel.offsetHeight;
  const previewHeight = preview.clientHeight;
  const scale = previewHeight ? Math.max(0, 1 - panelHeight / previewHeight) : 1;
  preview.style.setProperty('--preview-scale', String(scale));
}

function syncInterface() {
  preview.contentWindow?.dispatchEvent(new CustomEvent('interface-visibility', {
    detail: { hidden: ui.classList.contains('is-interface-hidden') },
  }));
  syncPosterMode();
}

const posterModes = {
  off: { label: 'Fullscreen Mode', next: 'portrait' },
  portrait: { label: 'Poster Mode ↑', name: 'Portrait Poster Mode', next: 'landscape' },
  landscape: { label: 'Poster Mode →', name: 'Landscape Poster Mode', next: 'off' },
};

function syncPosterMode() {
  const mode = posterModes[posterMode];
  const next = posterModes[mode.next];
  ui.classList.toggle('is-poster-mode', posterMode !== 'off');
  posterLabel.textContent = mode.label;
  posterToggle.setAttribute('aria-label', mode.name ?? mode.label);
  posterToggle.setAttribute('aria-pressed', String(posterMode !== 'off'));
  posterToggle.title = `Switch to ${next.name ?? next.label} (p)`;
  preview.contentWindow?.dispatchEvent(new CustomEvent('poster-mode', { detail: { mode: posterMode } }));
}

posterToggle.addEventListener('click', () => {
  posterMode = posterModes[posterMode].next;
  updateURL(versions[selected]);
  syncPosterMode();
});

function setInterfaceHidden(hidden) {
  ui.classList.toggle('is-interface-hidden', hidden);
  syncInterface();
  updateLayout();
  sketchTools.refresh();
  if (hidden) preview.focus();
}

const layoutObserver = new ResizeObserver(updateLayout);
[panel, projectsPanel, footer, preview].forEach((element) => layoutObserver.observe(element));

function setOpen(open) {
  if (open) setProjectsOpen(false);
  ui.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  panel.setAttribute('aria-hidden', String(!open));
  panel.inert = !open;
  updateLayout();
  if (open && versions.length) slider.focus({ preventScroll: true });
  if (!open && panel.contains(document.activeElement)) toggle.focus();
}

function moveProjectFocus(step, target) {
  const buttons = [...projectsGrid.querySelectorAll('.project-open')];
  if (!buttons.length) return;
  const current = buttons.indexOf(target?.closest?.('.project-card')?.querySelector('.project-open'));
  const next = current < 0 ? (step > 0 ? 0 : buttons.length - 1)
    : (current + step + buttons.length) % buttons.length;
  buttons[next].focus({ preventScroll: true });
  buttons[next].scrollIntoView({ block: 'nearest' });
}

function setProjectsOpen(open) {
  if (open) setOpen(false);
  ui.classList.toggle('is-projects-open', open);
  projectsToggle.setAttribute('aria-expanded', String(open));
  projectsPanel.setAttribute('aria-hidden', String(!open));
  projectsPanel.inert = !open;
  updateLayout();
  if (open) {
    projectsPanel.scrollTop = 0;
    projectsGrid.querySelector('.project-open')?.focus({ preventScroll: true });
  } else if (projectsPanel.contains(document.activeElement)) projectsToggle.focus();
}

// Copy concise context for a new request, including the exact reference version.
prompt.addEventListener('click', async () => {
  const version = versions[selected];
  if (!version) return;
  let feedback;
  try {
    await navigator.clipboard.writeText(`Project: ${project.id}\nVersion: ${version.id}\nSketch: ${version.sketch}\n\nVersion summary:\n${(version.summary ?? version.prompt).trim()}`);
    feedback = 'Copied';
  } catch {
    feedback = 'Copy failed';
  }
  if (versions[selected] !== version) return;
  clearTimeout(copyFeedbackTimer);
  promptText.textContent = feedback;
  copyFeedbackTimer = setTimeout(() => { promptText.textContent = version.summary ?? version.prompt; }, 1500);
});

slider.addEventListener('input', () => showVersion(Number(slider.value)));
versionDelete.addEventListener('click', () => {
  const version = versions[selected];
  if (!canDeleteHistory || !version) return;
  const url = `/api/projects/${encodeURIComponent(project.id)}/versions/${encodeURIComponent(version.id)}`;
  deleteFromHistory(versionDelete, url, `iteration ${selected + 1} of “${project.title}”`);
});
latest.addEventListener('click', () => {
  showVersion(versions.length - 1);
  toggle.focus();
});
toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
projectsToggle.addEventListener('click', () => setProjectsOpen(projectsToggle.getAttribute('aria-expanded') !== 'true'));
resetButton.addEventListener('click', () => {
  if (selected < 0) return;
  setOpen(false);
  setProjectsOpen(false);
  showVersion(selected, { restart: true });
});
// The backdrop consumes the outside click before the sketch can receive it.
document.addEventListener('click', (event) => {
  if (backdrop.hidden || document.querySelector('dialog[open]')) return;
  if (panel.contains(event.target) || projectsPanel.contains(event.target) || footer.contains(event.target)) return;
  setOpen(false);
  setProjectsOpen(false);
}, { capture: true });
// The sidebar lives in the iframe; its shared layout reports availability and state.
preview.addEventListener('controls-state', ({ detail: { available, open, expanded } }) => {
  controlsAvailable = available;
  if (controlsOpen !== expanded) {
    controlsOpen = expanded;
    updateURL(versions[selected]);
  }
  const wasOpen = controlsToggle.getAttribute('aria-expanded') === 'true';
  controlsToggle.hidden = !available;
  controlsToggle.setAttribute('aria-expanded', String(open));
  controlsToggle.setAttribute('aria-keyshortcuts', open ? 'C Escape' : 'C');
  controlsToggle.querySelector('.controls-label').textContent = open ? 'Hide controls' : 'Controls';
  controlsToggle.title = open ? 'Hide controls (c or Esc)' : 'Show controls (c)';
  if (!ui.classList.contains('is-interface-hidden')) {
    if (available && wasOpen && !open) controlsToggle.focus();
  }
});
function toggleControls() {
  if (controlsAvailable) preview.contentWindow.dispatchEvent(new Event('toggle-controls'));
}
controlsToggle.addEventListener('click', toggleControls);
function handleKeydown(event) {
  const key = event.key?.toLowerCase();
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  if (document.querySelector('dialog[open]')) return;
  if (key === 'h' && !event.repeat && !event.isComposing && !event.defaultPrevented
      && !event.altKey && !event.ctrlKey && !event.metaKey && !document.querySelector('dialog[open]')
      && !event.target?.isContentEditable && !event.target?.closest?.('input, textarea, select, [role="textbox"]')) {
    event.preventDefault();
    setInterfaceHidden(!ui.classList.contains('is-interface-hidden'));
    return;
  }
  if (ui.classList.contains('is-interface-hidden')) return;
  const action = shortcutButtons.get(key);
  if (action && !action.disabled && !event.repeat && !event.isComposing && !event.defaultPrevented
      && !event.altKey && !event.ctrlKey && !event.metaKey && !event.target?.isContentEditable
      && (event.target === slider || !event.target?.closest?.('input, textarea, select, [role="textbox"]'))) {
    event.preventDefault();
    action.click();
    return;
  }
  if (key === 'v' && versions.length && !event.repeat && !event.isComposing && !event.defaultPrevented
      && !event.altKey && !event.ctrlKey && !event.metaKey && !event.target?.isContentEditable
      && (event.target === slider || !event.target?.closest?.('input, textarea, select, [role="textbox"]'))) {
    event.preventDefault();
    setOpen(!ui.classList.contains('is-open'));
    return;
  }
  if (event.key?.toLowerCase() === 'c' && controlsAvailable && !event.repeat && !event.isComposing && !event.defaultPrevented
      && !event.altKey && !event.ctrlKey && !event.metaKey && !document.querySelector('dialog[open]')
      && !event.target?.isContentEditable && !event.target?.closest?.('input, textarea, select, [role="textbox"]')) {
    event.preventDefault();
    toggleControls();
    return;
  }
  if (event.key === 'Tab' && projects.length && !event.repeat && !event.isComposing && !event.defaultPrevented
      && !event.altKey && !event.ctrlKey && !event.metaKey && !document.querySelector('dialog[open]')
      && !event.target?.isContentEditable && !event.target?.closest?.('input, textarea, select, [role="textbox"]')) {
    if (ui.classList.contains('is-open') && !versionDelete.hidden && panel.contains(event.target)) return;
    if (ui.classList.contains('is-projects-open') && projectsPanel.contains(event.target)) {
      event.preventDefault();
      moveProjectFocus(event.shiftKey ? -1 : 1, event.target);
    } else if (!event.shiftKey) {
      event.preventDefault();
      setProjectsOpen(!ui.classList.contains('is-projects-open'));
    }
    return;
  }
  if (ui.classList.contains('is-projects-open') && (direction || ['ArrowUp', 'ArrowDown'].includes(event.key))
      && !event.isComposing && !event.defaultPrevented && !event.shiftKey
      && !event.altKey && !event.ctrlKey && !event.metaKey && !document.querySelector('dialog[open]')
      && !event.target?.isContentEditable && !event.target?.closest?.('input, textarea, select, [role="textbox"]')) {
    if (direction) {
      const card = event.target?.closest?.('.project-card');
      const button = card?.querySelector(direction > 0 ? '.project-delete' : '.project-open');
      if (button && !button.disabled) {
        event.preventDefault();
        button.focus({ preventScroll: true });
      }
      return;
    }
    event.preventDefault();
    moveProjectFocus(event.key === 'ArrowDown' ? 1 : -1, event.target);
    return;
  }
  if (event.key === 'Escape') {
    setOpen(false);
    setProjectsOpen(false);
    if (controlsOpen) toggleControls();
    return;
  }
  const versionShortcut = event.shiftKey && direction !== 0;
  if ((!ui.classList.contains('is-open') && !versionShortcut) || !versions.length) return;
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  // Let fields and sketch controls handle their own arrow keys.
  if (event.target?.isContentEditable) return;
  if (event.target?.closest?.('input, textarea, select, [role="textbox"]') && event.target !== slider) return;
  if (event.key === 'Enter' && !event.shiftKey) {
    // Other buttons keep their own Enter action, such as copying the summary.
    const button = event.target?.closest?.('button');
    if (button && button !== toggle) return;
    event.preventDefault();
    setOpen(false);
    preview.focus();
    return;
  }
  if (!direction) return;
  event.preventDefault(); // Also prevent the slider from moving a second time through its native behavior.
  const index = Math.max(0, Math.min(versions.length - 1, selected + direction));
  if (index !== selected) {
    // Keep receiving shortcuts when switching versions replaces the iframe document.
    if (versionShortcut && document.activeElement === preview) toggle.focus({ preventScroll: true });
    showVersion(index);
  }
}

document.addEventListener('keydown', handleKeydown);
// Key events inside the iframe do not bubble up to the timeline document.
preview.addEventListener('load', () => {
  preview.contentDocument.addEventListener('keydown', handleKeydown);
  syncInterface();
  updateLayout();
});
const requested = new URLSearchParams(location.search);
const initialProject = projects.find(({ id }) => id === requested.get('project')) ?? projects[0];
if (initialProject) showProject(initialProject, requested.get('version'));
else {
  projectsTitle.textContent = 'No projects';
  toggle.disabled = true;
  updateURL();
}
syncPosterMode();
