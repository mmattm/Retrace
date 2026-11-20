export const RECORDING_FPS = 60;

export function supportsVideoRecording() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export function supportsTabCapture() {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

// Native tab capture includes HTML controls, dialogs and the sketch iframe.
export async function captureBrowserTab() {
  if (!supportsTabCapture()) throw new Error('UI recording requires browser tab sharing.');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: RECORDING_FPS }, audio: false,
    preferCurrentTab: true, selfBrowserSurface: 'include', monitorTypeSurfaces: 'exclude', surfaceSwitching: 'exclude',
  });
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stream.getTracks().forEach(track => track.stop());
    video.pause();
    video.srcObject = null;
  };
  try {
    const track = stream.getVideoTracks()[0];
    const surface = track?.getSettings().displaySurface;
    if (!track || (surface && surface !== 'browser')) throw new Error('Select this browser tab to record its interface.');
    video.srcObject = stream;
    await video.play();
    return {
      track, stop,
      getSize(longestSide) {
        if (!video.videoWidth || !video.videoHeight) throw new Error('The shared tab is unavailable.');
        const scale = longestSide / Math.max(video.videoWidth, video.videoHeight);
        // Even dimensions keep video encoders happy while preserving the tab's proportions.
        return {
          width: Math.max(2, Math.round(video.videoWidth * scale / 2) * 2),
          height: Math.max(2, Math.round(video.videoHeight * scale / 2) * 2),
        };
      },
      draw(target) {
        if (!video.videoWidth || !video.videoHeight) throw new Error('The shared tab is unavailable.');
        // Fit the whole tab, keeping the sidebar and prompts inside the output.
        const scale = Math.min(target.width / video.videoWidth, target.height / video.videoHeight);
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        const context = target.getContext('2d');
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = '#000';
        context.fillRect(0, 0, target.width, target.height);
        context.drawImage(video, (target.width - width) / 2, (target.height - height) / 2, width, height);
        context.restore();
      },
    };
  } catch (error) {
    stop();
    throw error;
  }
}

// Record a separate canvas so the live sketch keeps its size and interactions.
export function recordCanvas({ width, height, drawFrame, onStop }) {
  if (!supportsVideoRecording()) throw new Error('Video recording is not supported in this browser.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawFrame(canvas);
  const stream = canvas.captureStream(RECORDING_FPS);
  let recorder;
  let frame;
  let error = null;
  let finished = false;
  const chunks = [];
  const cleanup = () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach(track => track.stop());
  };

  try {
    const mimeType = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    const options = { videoBitsPerSecond: Math.min(80000000, Math.max(8000000, width * height * 8)) };
    if (mimeType) options.mimeType = mimeType;
    recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => {
      error = event.error || new Error('Video encoding failed. Try a smaller output size.');
      if (recorder.state !== 'inactive') recorder.stop();
    };
    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      cleanup();
      const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || mimeType || 'video/webm' });
      onStop(blob, error || (blob.size ? null : new Error('No video frames were recorded.')));
    };
    recorder.start(1000);
    const frameInterval = 1000 / RECORDING_FPS;
    let nextFrame = -Infinity;
    const render = now => {
      if (recorder.state !== 'recording') return;
      try {
        // Allow a little clock jitter so a 60 Hz display doesn't skip every other frame.
        if (now + 1 >= nextFrame) {
          drawFrame(canvas);
          nextFrame = now - nextFrame >= frameInterval ? now + frameInterval : nextFrame + frameInterval;
        }
        frame = requestAnimationFrame(render);
      } catch (failure) {
        error = failure;
        recorder.stop();
      }
    };
    frame = requestAnimationFrame(render);
  } catch (failure) {
    cleanup();
    throw failure;
  }

  return {
    stop() {
      cancelAnimationFrame(frame);
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
