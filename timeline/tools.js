import { getSketchRuntime } from './runtime.js';
import { creditLines, findFontCredit } from './plot-credits.js';
import { createTextPrompt } from './text.js';
import { axidrawRequest, axidrawStatusMessage, createPlotSVG, drawPlotPreview, loadPlotPreview, preparePlotText, supportsAxiDraw } from './axidraw.js';
import { RECORDING_FPS, captureBrowserTab, recordCanvas, supportsTabCapture, supportsVideoRecording } from './video.js';

// Copy pixels only: sidebar controls, CSS borders and toolbar labels are excluded.
export function copyCanvas(source) {
  const copy = source.ownerDocument.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d').drawImage(source, 0, 0);
  return copy;
}

// Position is the fraction of available travel: 0 = left/top, 1 = right/bottom.
export function getCrop(source, target, position = { x: 0.5, y: 0.5 }) {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = target.width / scale;
  const height = target.height / scale;
  return {
    x: (source.width - width) * Math.max(0, Math.min(1, position.x)),
    y: (source.height - height) * Math.max(0, Math.min(1, position.y)),
    width, height,
  };
}

// Preview and PNG export use the same crop, without stretching the drawing.
export function drawCropped(source, target, position) {
  const crop = getCrop(source, target, position);
  const context = target.getContext('2d');
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, target.width, target.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, target.width, target.height);
  context.restore();
}

export function createSketchTools(preview, projectName) {
  const interfaceRoot = document.getElementById('sketch-timeline');
  const pause = document.querySelector('.playback-toggle');
  const pauseLabel = pause.querySelector('.playback-label');
  const fpsLabel = pause.querySelector('.playback-fps');
  const exportButton = document.querySelector('.export-toggle');
  const exportLabel = exportButton.querySelector('.export-label');
  const textButton = document.querySelector('.agent-toggle');
  const textPrompt = createTextPrompt(preview);
  const dialog = document.getElementById('export-dialog');
  const form = document.getElementById('export-form');
  const ratio = form.elements.namedItem('ratio');
  const width = form.elements.namedItem('width');
  const height = form.elements.namedItem('height');
  const outputScale = form.elements.namedItem('scale');
  const imageFormat = form.elements.namedItem('image-format');
  const videoResolution = form.elements.namedItem('video-resolution');
  const plotPaper = form.elements.namedItem('plot-paper');
  const plotOrientation = form.elements.namedItem('plot-orientation');
  const plotWidth = form.elements.namedItem('plot-width');
  const plotHeight = form.elements.namedItem('plot-height');
  const plotRescale = form.elements.namedItem('plot-rescale');
  const plotRescaleValue = form.elements.namedItem('plot-rescale-value');
  const creditsToggle = form.elements.namedItem('plot-credits');
  const creditFields = ['font', 'author', 'event'].map(key => form.elements.namedItem('credit-' + key));
  const plotPanel = dialog.querySelector('.export-axidraw');
  const plotStatus = dialog.querySelector('.export-axidraw-status');
  const pdfButton = dialog.querySelector('.export-plot-pdf');
  const formatLabel = dialog.querySelector('.export-format-label');
  const outputSize = dialog.querySelector('.export-size');
  const thumbnail = dialog.querySelector('.export-preview');
  const previewArea = dialog.querySelector('.export-preview-area');
  const cropFrame = dialog.querySelector('.export-crop');
  const status = dialog.querySelector('.export-status');
  const download = form.querySelector('[type="submit"]');
  const tabs = [...dialog.querySelectorAll('[data-export-mode]')];
  const settings = dialog.querySelector('#export-settings');
  const videoNote = dialog.querySelector('.export-video-note');
  const showUI = dialog.querySelector('.export-show-ui');
  const toolbar = exportButton.closest('.sketch-toolbar');
  const presets = {
    '9:16': [1080, 1920], '16:9': [1920, 1080],
    '4:3': [1600, 1200], '3:4': [1200, 1600],
    '4:5': [1600, 2000], '5:4': [2000, 1600],
    'poster-portrait': [2000, Math.round(2000 * Math.SQRT2)],
    'poster-landscape': [Math.round(2000 * Math.SQRT2), 2000],
  };
  const videoSizes = { '720p': [1280, 720], '1080p': [1920, 1080], '2k': [2048, 1080], qhd: [2560, 1440], '4k': [3840, 2160] };
  const plotPaperSizes = { a4: [210, 297], a3: [297, 420], sra3: [320, 450] };
  const ratioLabels = [...ratio.options].map(option => option.textContent);
  let capture = null;
  let cropDrag = null;
  let agentAvailable = false;
  let agentMethod = 'applyParameters';
  let exportMode = 'image';
  let imageRatio = 'custom';
  let recording = null;
  let recordUI = false;
  let choosingWindow = false;
  let resolutionEdited = false;
  let plotState = null;
  let plotPending = false;

  function updateCreditFields() {
    const plot = exportMode === 'axidraw';
    creditsToggle.disabled = !plot;
    creditsToggle.closest('label').hidden = !plot;
    for (const field of creditFields) {
      field.disabled = !plot || !creditsToggle.checked;
      field.closest('label').hidden = field.disabled;
    }
  }

  function getCreditValues() {
    if (!creditsToggle.checked) return [];
    const [name, designer, event] = creditFields.map(field => field.value.trim());
    return [name, designer ? `Font by ${designer}` : '', event];
  }

  function initCredits(current) {
    const font = current.runtime.getPlotFont?.() ?? {};
    font.name ||= current.svg?.querySelector?.('text[font-family]')?.getAttribute('font-family') || '';
    const defaults = [...findFontCredit('', font), 'ECAL Open Day 2026'];
    creditFields.forEach((field, index) => { field.value = defaults[index]; });
    const edited = new Set();
    current.editedCredits = edited;
    // Match the face frozen with this capture and preserve edits made during the fetch.
    current.creditDefaults = (async () => {
      if (!font.file) return;
      try {
        const response = await fetch('/assets/credits.txt');
        if (!response.ok) return;
        const matched = findFontCredit(await response.text(), font);
        if (capture !== current) return;
        matched.forEach((value, index) => { if (!edited.has(creditFields[index])) creditFields[index].value = value; });
        if (exportMode === 'axidraw' && creditsToggle.checked) updateThumbnail();
      } catch { /* The font's embedded credits are already available in the fields. */ }
    })();
  }
  creditsToggle.addEventListener('change', () => { updateCreditFields(); updateThumbnail(); });
  for (const field of creditFields) field.addEventListener('input', () => {
    capture?.editedCredits?.add(field);
    updateThumbnail();
  });

  function updatePlotStatus() {
    if (exportMode !== 'axidraw') return;
    const vectors = supportsAxiDraw(capture?.runtime);
    plotStatus.textContent = !vectors ? 'AxiDraw requires a vector SVG. Use a Paper.js sketch.'
      : plotPending ? 'Sending to AxiDraw…'
      : axidrawStatusMessage(plotState);
    download.disabled = !vectors || !plotState?.connected || plotPending || plotState.state === 'printing';
  }

  async function checkPlotStatus() {
    try { plotState = await axidrawRequest('status'); }
    catch { plotState = null; }
    updatePlotStatus();
    if (plotState?.state === 'printing') setTimeout(checkPlotStatus, 1500);
  }

  function sketch() {
    const win = preview.contentWindow;
    const canvas = preview.contentDocument?.querySelector('#sketch-stage canvas');
    const runtime = getSketchRuntime(win);
    if (!canvas || !runtime?.ready) return null;
    return { win, runtime, canvas, stage: preview.contentDocument.getElementById('sketch-stage') };
  }

  function updateFPS(current = sketch()) {
    fpsLabel.hidden = !current;
    const fps = current?.runtime.isPlaying() ? current.runtime.getFPS() : 0;
    fpsLabel.textContent = `(${Number.isFinite(fps) ? Math.max(0, Math.round(fps)) : 0}fps)`;
  }
  setInterval(updateFPS, 500);

  function refresh() {
    const current = sketch();
    pause.disabled = !current || recording?.phase === 'countdown';
    exportButton.disabled = recording ? recording.phase === 'stopping' : !current;
    textButton.disabled = recording?.phase === 'countdown' || interfaceRoot.classList.contains('is-interface-hidden') || !current || !agentAvailable
      || typeof current.win.sketchAgent?.getState !== 'function'
      || typeof current.win.sketchAgent?.[agentMethod] !== 'function';
    const paused = current ? !current.runtime.isPlaying() : false;
    pause.setAttribute('aria-pressed', String(paused));
    pause.title = paused ? 'Play sketch (Space)' : 'Pause sketch (Space)';
    pauseLabel.textContent = paused ? 'Play' : 'Pause';
    updateFPS(current);
    if (current) current.stage.inert = paused;
    toolbar.classList.toggle('is-recording', Boolean(recording));
    exportLabel.textContent = !recording ? 'Export' : recording.phase === 'countdown' ? `Record in ${recording.remaining}`
      : recording.phase === 'stopping' ? 'Saving…' : 'Stop record';
    const exportTitle = recording?.phase === 'countdown' ? 'Cancel recording countdown'
      : recording ? exportLabel.textContent : 'Export canvas';
    exportButton.title = `${exportTitle} (e)`;
    if (recording) exportButton.removeAttribute('aria-haspopup');
    else exportButton.setAttribute('aria-haspopup', 'dialog');
    preview.contentWindow?.dispatchEvent(new CustomEvent('recording-region', {
      detail: recording && !recording.screen && !recording.detached && recording.phase !== 'stopping'
        ? { size: recording.size, position: recording.position } : null,
    }));
  }

  function togglePlayback() {
    const current = sketch();
    if (!current) return;
    if (current.runtime.isPlaying()) current.runtime.pause();
    else current.runtime.play();
    refresh();
  }
  pause.addEventListener('click', togglePlayback);

  function handleSpace(event) {
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (document.querySelector('dialog[open]') || pause.disabled || event.target?.isContentEditable) return;
    // Keep native keyboard behavior in fields, buttons and other interactive controls.
    if (event.target?.closest?.('input, textarea, select, button, a, [role="button"], [role="slider"]')) return;
    event.preventDefault();
    if (!event.repeat) togglePlayback();
  }
  document.addEventListener('keydown', handleSpace);

  function exportSize() {
    if (exportMode === 'axidraw') return { width: plotWidth.valueAsNumber, height: plotHeight.valueAsNumber };
    if (exportMode === 'video') {
      const [w, h] = videoSizes[videoResolution.value];
      return ratio.value === '9:16' ? { width: h, height: w } : { width: w, height: h };
    }
    return { width: width.valueAsNumber * Number(outputScale.value), height: height.valueAsNumber * Number(outputScale.value) };
  }

  function updateThumbnail() {
    const size = exportSize();
    outputScale.setCustomValidity(exportMode === 'image' && (size.width > 8192 || size.height > 8192) ? 'Output must not exceed 8192 px per side. Reduce the size or scale.' : '');
    outputSize.textContent = size.width > 0 && size.height > 0 ? `${exportMode === 'video' ? 'Canvas output' : 'Output'}: ${size.width} × ${size.height} ${exportMode === 'axidraw' ? 'mm' : 'px'}` : '';
    outputSize.hidden = exportMode === 'video' && recordUI;
    if (!capture || !form.checkValidity()) return;
    const { image, position } = capture;
    const crop = getCrop(image, size, position);
    const scale = Math.min(1, 480 / image.width, 280 / image.height);
    thumbnail.width = Math.max(1, Math.round(image.width * scale));
    thumbnail.height = Math.max(1, Math.round(image.height * scale));
    const context = thumbnail.getContext('2d');
    if (exportMode === 'axidraw') {
      const scale = plotRescale.valueAsNumber / 100;
      const creditValues = getCreditValues();
      const key = JSON.stringify([scale, crop, size, creditValues]);
      if (capture.plotPreviewLoading !== key) capture.plotPreviewLoading = null;
      drawPlotPreview(thumbnail, capture.plotPreview);
      if (capture.plotPreviewKey !== key && capture.plotPreviewLoading !== key) {
        const current = capture;
        const previewSize = { width: thumbnail.width, height: thumbnail.height };
        current.plotPreviewLoading = key;
        Promise.resolve().then(() => loadPlotPreview(current, previewSize, { scale, center: crop, creditValues, paperSize: size })).then(image => {
          if (current.plotPreviewLoading !== key) return;
          current.plotPreview = image;
          current.plotPreviewKey = key;
          current.plotPreviewLoading = null;
          current.plotPreviewError = '';
          if (capture === current && exportMode === 'axidraw') updateThumbnail();
        }).catch(error => {
          if (current.plotPreviewLoading !== key) return;
          current.plotPreviewLoading = null;
          current.plotPreviewError = error instanceof TypeError ? 'Start the Python bridge to convert text into vector paths.' : error.message;
          if (capture === current && exportMode === 'axidraw') status.textContent = current.plotPreviewError;
        });
      }
    } else context.drawImage(image, 0, 0, thumbnail.width, thumbnail.height);
    Object.assign(cropFrame.style, {
      left: `${crop.x / image.width * 100}%`, top: `${crop.y / image.height * 100}%`,
      width: `${crop.width / image.width * 100}%`, height: `${crop.height / image.height * 100}%`,
    });
    status.textContent = exportMode === 'axidraw' ? capture.plotPreviewError || '' : '';
  }

  function setExportMode(mode) {
    const canPlot = supportsAxiDraw(capture?.runtime);
    if (mode === 'axidraw' && !canPlot) mode = 'image';
    const video = mode === 'video';
    const plot = mode === 'axidraw';
    if (video && exportMode !== 'video') imageRatio = ratio.value;
    if (!video && exportMode === 'video') ratio.value = imageRatio;
    exportMode = mode;
    updateCreditFields();
    [...ratio.options].forEach((option, index) => {
      option.hidden = option.disabled = video && !['16:9', '9:16'].includes(option.value);
      option.textContent = video ? option.value === '9:16' ? 'Portrait' : 'Landscape' : ratioLabels[index];
    });
    if (video && !['16:9', '9:16'].includes(ratio.value)) ratio.value = '16:9';
    formatLabel.textContent = video ? 'Canvas orientation' : 'Aspect ratio';
    settings.classList.toggle('is-video', video);
    settings.classList.toggle('is-axidraw', plot);
    dialog.querySelector('#export-note').textContent = `The ${plot ? 'black' : 'white'} frame marks the export area. Drag it or use arrow keys to reposition.`;
    plotPanel.hidden = !plot;
    pdfButton.hidden = !plot;
    dialog.querySelector('.export-actions [data-close]').textContent = plot ? 'Close' : 'Cancel';
    ratio.disabled = plot;
    ratio.closest('label').hidden = plot;
    for (const input of [width, height, outputScale]) {
      input.disabled = video || plot;
      input.closest('label').hidden = video || plot;
    }
    for (const input of [plotPaper, plotOrientation, plotWidth, plotHeight, plotRescale]) {
      input.disabled = !plot;
      input.closest('label').hidden = !plot;
    }
    videoResolution.disabled = !video;
    imageFormat.disabled = video || plot || !capture?.runtime.exportSVG;
    imageFormat.closest('label').hidden = imageFormat.disabled;
    videoResolution.closest('label').hidden = !video;
    tabs.forEach(tab => {
      tab.hidden = tab.disabled = tab.dataset.exportMode === 'axidraw' && !canPlot;
      const selected = tab.dataset.exportMode === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) settings.setAttribute('aria-labelledby', tab.id);
    });
    videoNote.hidden = mode !== 'video';
    showUI.hidden = !video;
    showUI.disabled = choosingWindow || !supportsTabCapture() || !supportsVideoRecording();
    showUI.title = supportsTabCapture() ? 'Record the browser tab, including controls and Agent prompts' : 'UI recording requires browser tab sharing.';
    settings.classList.toggle('records-ui', video && recordUI);
    videoNote.textContent = recordUI
      ? `Records the full tab at up to ${RECORDING_FPS} fps, including controls and Agent prompts. The selected resolution sets the longest side.`
      : `Record the canvas at up to ${RECORDING_FPS} fps, without audio. Record window keeps the window’s proportions. Click Stop record to save.`;
    download.textContent = plot ? 'Print on AxiDraw' : mode === 'video' ? 'Record canvas' : `Download ${imageFormat.value.toUpperCase()}`;
    download.disabled = video && (!supportsVideoRecording() || choosingWindow);
    updateThumbnail();
    if (plot) updatePlotStatus();
    if (video && !supportsVideoRecording()) status.textContent = 'Video recording is not supported in this browser.';
  }
  imageFormat.addEventListener('change', () => setExportMode(exportMode));
  showUI.addEventListener('click', async () => {
    if (!capture || exportMode !== 'video' || choosingWindow || !supportsTabCapture() || !supportsVideoRecording()) return;
    recordUI = true;
    if (!resolutionEdited) videoResolution.value = '2k';
    choosingWindow = true;
    setExportMode('video');
    showUI.textContent = 'Choose tab…';
    const current = capture;
    let message = '';
    let screen;
    try {
      // Keep the browser sharing request inside this button's user activation.
      screen = await captureBrowserTab();
      if (capture !== current || !dialog.open || exportMode !== 'video') { screen.stop(); return; }
      startCountdown(screen);
    } catch (error) {
      screen?.stop();
      message = error.name === 'NotAllowedError' ? 'Tab sharing cancelled.' : error.message;
    } finally {
      choosingWindow = false;
      showUI.textContent = 'Record window';
      if (capture === current && dialog.open) {
        recordUI = false;
        setExportMode(exportMode);
        status.textContent = message;
      }
    }
  });
  tabs.forEach(tab => {
    tab.addEventListener('click', () => setExportMode(tab.dataset.exportMode));
    tab.addEventListener('keydown', event => {
      const available = tabs.filter(tab => !tab.hidden && !tab.disabled);
      const index = available.indexOf(tab);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % available.length;
      else if (event.key === 'ArrowLeft') next = (index + available.length - 1) % available.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = available.length - 1;
      else return;
      event.preventDefault();
      setExportMode(available[next].dataset.exportMode);
      available[next].focus();
    });
  });

  dialog.querySelector('.export-center').addEventListener('click', () => {
    if (!capture) return;
    capture.position = { x: 0.5, y: 0.5 };
    cropDrag = null;
    cropFrame.classList.remove('is-dragging');
    updateThumbnail();
  });

  function moveCrop(dx, dy) {
    if (!capture || !form.checkValidity()) return;
    const { image, position } = capture;
    const crop = getCrop(image, exportSize(), position);
    const bounds = previewArea.getBoundingClientRect();
    // Convert movement in the responsive preview back to source pixels.
    for (const [axis, delta, size] of [['x', dx, 'width'], ['y', dy, 'height']]) {
      const travel = image[size] - crop[size];
      if (travel > 0 && bounds[size] > 0) {
        position[axis] = Math.max(0, Math.min(1, position[axis] + delta * image[size] / bounds[size] / travel));
      }
    }
    updateThumbnail();
  }

  cropFrame.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !capture || cropDrag || !form.checkValidity()) return;
    event.preventDefault();
    cropFrame.focus();
    cropDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    cropFrame.setPointerCapture(event.pointerId);
    cropFrame.classList.add('is-dragging');
  });
  cropFrame.addEventListener('pointermove', event => {
    if (!cropDrag || event.pointerId !== cropDrag.id) return;
    moveCrop(event.clientX - cropDrag.x, event.clientY - cropDrag.y);
    cropDrag.x = event.clientX;
    cropDrag.y = event.clientY;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    cropFrame.addEventListener(name, event => {
      if (event.pointerId !== cropDrag?.id) return;
      cropDrag = null;
      cropFrame.classList.remove('is-dragging');
    });
  }
  cropFrame.addEventListener('keydown', event => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = directions[event.key];
    if (!delta || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    moveCrop(delta[0] * step, delta[1] * step);
  });

  ratio.addEventListener('change', () => {
    if (exportMode === 'image' && presets[ratio.value]) [width.value, height.value] = presets[ratio.value];
    updateThumbnail();
  });
  outputScale.addEventListener('change', updateThumbnail);
  function updatePlotPaper() {
    const preset = plotPaperSizes[plotPaper.value];
    const landscape = plotOrientation.value === 'landscape';
    if (preset) {
      [plotWidth.value, plotHeight.value] = landscape ? [preset[1], preset[0]] : preset;
    } else if (Number.isFinite(plotWidth.valueAsNumber) && Number.isFinite(plotHeight.valueAsNumber)
      && (plotWidth.valueAsNumber > plotHeight.valueAsNumber) !== landscape) {
      [plotWidth.value, plotHeight.value] = [plotHeight.value, plotWidth.value];
    }
    updateThumbnail();
  }
  plotPaper.addEventListener('change', updatePlotPaper);
  plotOrientation.addEventListener('change', updatePlotPaper);
  plotRescale.addEventListener('input', () => {
    plotRescaleValue.value = `${plotRescale.value}%`;
    updateThumbnail();
  });
  for (const input of [plotWidth, plotHeight]) {
    input.addEventListener('input', () => {
      plotPaper.value = 'custom';
      if (plotWidth.valueAsNumber > 0 && plotHeight.valueAsNumber > 0) {
        plotOrientation.value = plotWidth.valueAsNumber > plotHeight.valueAsNumber ? 'landscape' : 'portrait';
      }
      updateThumbnail();
    });
  }
  videoResolution.addEventListener('change', () => {
    resolutionEdited = true;
    updateThumbnail();
  });
  for (const input of [width, height]) {
    input.addEventListener('input', () => {
      const preset = presets[ratio.value];
      if (preset && input.valueAsNumber > 0) {
        if (input === width) height.value = Math.max(1, Math.round(width.valueAsNumber * preset[1] / preset[0]));
        else width.value = Math.max(1, Math.round(height.valueAsNumber * preset[0] / preset[1]));
      }
      updateThumbnail();
    });
  }

  // Closing export restores the previous playback state, including an existing pause.
  function restorePlayback() {
    if (!capture) return;
    const previous = capture;
    capture = null;
    cropDrag = null;
    cropFrame.classList.remove('is-dragging');
    if (previous.wasRunning) previous.runtime.play();
    refresh();
  }
  dialog.addEventListener('close', restorePlayback);
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function finishRecording(session, blob = null, error = null) {
    if (recording !== session) return;
    clearTimeout(session.timer);
    recording = null;
    session.screen?.stop();
    if (!session.detached) {
      if (session.wasRunning) session.runtime.play();
      else session.runtime.pause();
    }
    refresh();
    if (blob?.size && !error) {
      try {
        const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
        saveBlob(blob, `${session.name}-${session.size.width}x${session.size.height}.${extension}`);
      } catch (failure) { error = failure; }
    }
    if (error && !session.detached) {
      // Reopen the settings so a failed encoder never loses the chosen crop.
      capture = { ...session, image: copyCanvas(session.canvas) };
      session.runtime.pause();
      setExportMode('video');
      status.textContent = 'Could not record video. Try a smaller output size or another browser.';
      dialog.showModal();
      refresh();
    }
  }

  function stopRecording() {
    if (!recording || recording.phase === 'stopping') return;
    if (recording.phase === 'countdown') finishRecording(recording);
    else {
      recording.phase = 'stopping';
      refresh();
      recording.recorder.stop();
    }
  }

  function startCountdown(screen = null) {
    const size = screen ? screen.getSize(videoSizes[videoResolution.value][0]) : exportSize();
    const session = { ...capture, screen, position: { ...capture.position }, size, phase: 'countdown', remaining: 3 };
    recording = session;
    capture = null; // Closing the dialog keeps the sketch frozen until the countdown ends.
    cropDrag = null;
    cropFrame.classList.remove('is-dragging');
    dialog.close();
    refresh();
    exportButton.focus();
    screen?.track.addEventListener('ended', () => {
      if (recording === session) stopRecording();
    }, { once: true });
    const tick = () => {
      if (recording !== session) return;
      session.remaining--;
      if (session.remaining > 0) {
        refresh();
        session.timer = setTimeout(tick, 1000);
        return;
      }
      try {
        session.recorder = recordCanvas({
          ...session.size,
          drawFrame: canvas => session.screen ? session.screen.draw(canvas) : drawCropped(session.canvas, canvas, session.position),
          onStop: (blob, error) => finishRecording(session, blob, error),
        });
        session.phase = 'recording';
        session.runtime.play();
        refresh();
      } catch (error) { finishRecording(session, null, error); }
    };
    session.timer = setTimeout(tick, 1000);
  }

  exportButton.addEventListener('click', () => {
    if (recording) { stopRecording(); return; }
    const current = sketch();
    if (!current) return;
    const wasRunning = current.runtime.isPlaying();
    current.runtime.pause();
    try {
      capture = { ...current, wasRunning, image: copyCanvas(current.canvas), svg: current.runtime.snapshotSVG?.(), name: projectName(), position: { x: 0.5, y: 0.5 } };
      if (supportsAxiDraw(current.runtime)) initCredits(capture);
      const scale = Math.min(1, 8192 / capture.image.width, 8192 / capture.image.height);
      width.value = Math.max(1, Math.round(capture.image.width * scale));
      height.value = Math.max(1, Math.round(capture.image.height * scale));
      ratio.value = 'custom';
      imageRatio = 'custom';
      outputScale.value = '1';
      imageFormat.value = 'png';
      recordUI = false;
      resolutionEdited = false;
      setExportMode(exportMode);
      dialog.showModal();
    } catch {
      if (capture) restorePlayback();
      else if (wasRunning) current.runtime.play();
    }
    refresh();
  });

  async function preparePlot(current, size) {
    const crop = getCrop(current.image, size, current.position);
    const scale = plotRescale.valueAsNumber / 100;
    await current.creditDefaults;
    const credits = await creditLines(getCreditValues());
    await preparePlotText(current);
    return createPlotSVG(current, size, crop, 'mm', { scale, credits });
  }

  pdfButton.addEventListener('click', async () => {
    if (exportMode !== 'axidraw' || !capture || !form.reportValidity() || pdfButton.disabled) return;
    const current = capture;
    const size = exportSize();
    pdfButton.disabled = true;
    pdfButton.textContent = 'Preparing PDF…';
    try {
      const [svg, { plotPDF }] = await Promise.all([preparePlot(current, size), import('./plot-pdf.js')]);
      const blob = await plotPDF(svg, size);
      if (capture === current) saveBlob(blob, `${current.name}-axidraw-${size.width}x${size.height}mm.pdf`);
    } catch (error) {
      if (capture === current) status.textContent = error.message || 'Could not export the PDF.';
    } finally {
      pdfButton.disabled = false;
      pdfButton.textContent = 'Export PDF';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!capture || !form.reportValidity()) return;
    if (exportMode === 'video') {
      if (!supportsVideoRecording() || choosingWindow) return;
      recordUI = false;
      startCountdown();
      return;
    }
    const current = capture;
    if (exportMode === 'axidraw') {
      if (plotPending || !supportsAxiDraw(current.runtime) || !plotState?.connected || plotState.state === 'printing') return;
      status.textContent = '';
      plotPending = true;
      updatePlotStatus();
      try {
        const svg = await preparePlot(current, exportSize());
        plotState = await axidrawRequest('plot', { svg });
        if (plotState.state === 'printing') setTimeout(checkPlotStatus, 1500);
      } catch (error) {
        if (capture === current) status.textContent = error instanceof TypeError || error.name === 'TimeoutError'
          ? 'Could not reach the bridge. Check the AxiDraw before retrying.' : error.message;
      } finally {
        plotPending = false;
        updatePlotStatus();
      }
      return;
    }
    download.disabled = true;
    status.textContent = `Preparing ${imageFormat.value.toUpperCase()}…`;
    try {
      const size = exportSize();
      if (imageFormat.value === 'svg') {
        const svg = current.runtime.exportSVG({ ...size, crop: getCrop(current.image, size, current.position), snapshot: current.svg });
        saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `${current.name}-${size.width}x${size.height}.svg`);
        dialog.close();
        return;
      }
      const image = document.createElement('canvas');
      image.width = size.width;
      image.height = size.height;
      drawCropped(current.image, image, current.position);
      const blob = await new Promise((resolve, reject) => {
        image.toBlob(result => result ? resolve(result) : reject(new Error('PNG export failed')), 'image/png');
      });
      if (capture !== current) return;
      saveBlob(blob, `${current.name}-${image.width}x${image.height}.png`);
      dialog.close();
    } catch {
      if (capture === current) status.textContent = 'Could not export the canvas. Try a smaller size.';
    } finally {
      if (capture === current || !capture) download.disabled = false;
    }
  });

  void checkPlotStatus();
  preview.addEventListener('sketch-ready', refresh);
  preview.addEventListener('load', () => {
    refresh();
    // Keyboard events inside an iframe do not reach the parent document.
    preview.contentDocument?.addEventListener('keydown', handleSpace);
  });
  return {
    refresh,
    reset({ agent = null } = {}) {
      if (recording) {
        recording.detached = true;
        stopRecording();
      }
      agentAvailable = Boolean(agent);
      agentMethod = agent?.mode === 'drawing' ? 'applyDrawing' : 'applyParameters';
      textButton.hidden = !agentAvailable;
      textPrompt.reset(agent);
      if (dialog.open) dialog.close();
      restorePlayback();
      pause.disabled = exportButton.disabled = textButton.disabled = true;
      pause.setAttribute('aria-pressed', 'false');
      pause.title = 'Pause sketch (Space)';
      pauseLabel.textContent = 'Pause';
      fpsLabel.hidden = true;
    },
  };
}
