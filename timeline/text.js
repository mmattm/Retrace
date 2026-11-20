import { agentSchema, validateAgentResponse } from './agent.js';

// During development, send requests through Vite on the page's own origin.
export const OLLAMA = {
  url: import.meta.env?.DEV ? window.location.origin : 'http://127.0.0.1:11434',
  model: 'qwen3.5:9b',
};

// Check the server and model without spending tokens on a generated reply.
export async function checkOllamaConnection(settings = OLLAMA, signal) {
  if (!settings.url.trim()) return false;
  const response = await fetch(new URL('/api/tags', settings.url), { signal, cache: 'no-store' });
  if (!response.ok) return false;
  const data = await response.json();
  return Array.isArray(data.models) && data.models.some(model => model.name === settings.model || model.model === settings.model);
}

export async function requestOllama(prompt, settings = OLLAMA, signal, context = null) {
  if (!prompt.trim()) throw new Error('Type a prompt first.');
  if (!settings.url.trim()) throw new Error('The Ollama server address is not configured yet.');
  const endpoint = new URL('/api/chat', settings.url);
  const body = {
    model: settings.model,
    messages: [{ role: 'user', content: prompt.trim() }],
    stream: false,
    think: false,
    options: { num_ctx: 4096, num_predict: 256 },
  };
  if (context) {
    const drawing = context.agent.mode === 'drawing';
    const state = drawing ? context.state : validateAgentResponse(context.agent, context.state);
    body.format = agentSchema(context.agent);
    // Leave room for path vertices or larger parameter sets without truncating JSON.
    const parameterCount = Object.keys(context.agent.parameters ?? {}).length;
    body.options.num_predict = drawing ? 3072 : Math.max(256, parameterCount * 32);
    body.options.num_ctx = drawing || parameterCount > 16 ? 8192 : 4096;
    body.messages = [
      { role: 'system', content: `${context.agent.description || ''}\n\n${context.agent.systemPrompt}\nReturn only the JSON object defined by the response schema.` },
      { role: 'user', content: `${drawing ? 'Drawing context' : 'Current parameters'}: ${JSON.stringify(state)}\nRequest: ${prompt.trim()}` },
    ];
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Ollama request failed (${response.status}).`);
  }
  const data = await response.json();
  if (typeof data.message?.content !== 'string' || !data.message.content.trim()) {
    throw new Error('Ollama returned an empty response.');
  }
  return data.message.content.trim();
}

export function createTextPrompt(preview) {
  const button = document.querySelector('.agent-toggle');
  const dialog = document.getElementById('text-dialog');
  const form = document.getElementById('text-form');
  const editor = document.querySelector('.text-editor');
  const input = document.getElementById('text-prompt');
  const example = document.getElementById('text-example');
  const submitButton = document.getElementById('text-submit');
  const nextExampleButton = document.getElementById('text-next-example');
  const commandText = document.getElementById('text-last-command');
  const helper = document.getElementById('text-helper');
  const connection = document.getElementById('agent-connection');
  const connectionLabel = document.getElementById('agent-connection-label');
  const toolbar = document.querySelector('.sketch-toolbar');
  const help = () => `${agent?.mode === 'drawing' ? 'Enter to draw' : 'Enter to send'} · Shift+Enter for a new line · Esc to close`;
  let request = null;
  let agent = null;
  let examples = [];
  let exampleIndex = 0;
  let shiftTap = false;
  let allowLineBreak = false;
  let lastCommand = '';
  let connectionCheck = null;
  let textReveal = null;

  function cancelTextReveal() {
    textReveal?.cancel();
    textReveal = null;
  }

  function revealText() {
    cancelTextReveal();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Let the canvas show through briefly, then bring the large prompt back.
    textReveal = editor.animate([{ opacity: 0 }, { opacity: 1 }], {
      delay: 1200, duration: 700, easing: 'ease-in-out', fill: 'backwards',
    });
  }

  function positionConnection() {
    const bounds = toolbar.getBoundingClientRect();
    const narrow = window.innerWidth < 850;
    connection.style.left = `${narrow ? bounds.left : bounds.right + 20}px`;
    connection.style.top = `${narrow ? bounds.bottom + 8 : bounds.top}px`;
  }
  new ResizeObserver(positionConnection).observe(toolbar);
  window.addEventListener('resize', positionConnection);

  function setConnection(connected) {
    const state = connected ? 'connected' : 'disconnected';
    const label = connected ? 'Running' : 'Disconnected';
    connection.setAttribute('data-state', state);
    if (connectionLabel.textContent !== label) connectionLabel.textContent = label;
    connection.title = `${OLLAMA.model} · ${OLLAMA.url}`;
  }

  function cancelConnectionCheck() {
    connectionCheck?.abort();
    connectionCheck = null;
  }

  async function refreshConnection() {
    if (!agent || request || connectionCheck || document.hidden) return;
    const controller = new AbortController();
    connectionCheck = controller;
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const connected = await checkOllamaConnection(OLLAMA, controller.signal);
      if (connectionCheck === controller) setConnection(connected);
    } catch {
      if (connectionCheck === controller) setConnection(false);
    } finally {
      clearTimeout(timeout);
      if (connectionCheck === controller) connectionCheck = null;
    }
  }
  window.setInterval(refreshConnection, 15000);
  document.addEventListener('visibilitychange', refreshConnection);

  function showStatus(message = help()) {
    commandText.textContent = lastCommand ? `“${lastCommand}”\n` : '';
    commandText.hidden = !lastCommand;
    helper.textContent = message;
  }

  function showExample(index) {
    exampleIndex = index;
    input.placeholder = examples.length ? `“${examples[index]}”` : 'Describe a change…';
    example.textContent = input.placeholder;
    fitText();
  }

  function cycleExample() {
    if (!dialog.open || request || examples.length < 2) return;
    cancelTextReveal();
    showExample((exampleIndex + 1) % examples.length);
    showStatus();
  }

  function fitText() {
    // Size only the typed text. The separate suggestion stays centered without
    // making the empty field taller and pushing its caret onto the first line.
    const placeholder = input.placeholder;
    input.placeholder = '';
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, window.innerHeight * 0.65)}px`;
    input.placeholder = placeholder;
    example.hidden = Boolean(input.value.trim());
    nextExampleButton.hidden = example.hidden || examples.length < 2;
    updateSubmit();
  }

  function updateSubmit() {
    submitButton.disabled = Boolean(request) || !(input.value.trim() || examples[exampleIndex]);
  }

  function syncRequestState() {
    input.readOnly = Boolean(request);
    form.setAttribute('aria-busy', String(input.readOnly));
    updateSubmit();
  }

  function cancelRequest() {
    cancelTextReveal();
    request?.abort();
    request = null;
    syncRequestState();
    button.setAttribute('aria-expanded', 'false');
    shiftTap = false;
    allowLineBreak = false;
    syncOverlay();
  }

  function syncOverlay() {
    preview.contentWindow?.dispatchEvent(new CustomEvent('agent-overlay', { detail: { open: dialog.open } }));
  }

  function openPrompt() {
    if (button.hidden || button.disabled || dialog.open) return;
    showStatus();
    dialog.showModal();
    syncOverlay();
    button.setAttribute('aria-expanded', 'true');
    showExample(Math.floor(Math.random() * examples.length));
    input.focus();
    revealText();
  }
  button.addEventListener('click', openPrompt);
  document.getElementById('text-close').addEventListener('click', () => dialog.close());
  nextExampleButton.addEventListener('click', () => {
    cycleExample();
    input.focus();
  });

  function handleTextShortcut(event) {
    if (event.key?.toLowerCase() !== 't' || event.repeat || event.isComposing || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
    if (button.hidden || button.disabled || event.target?.isContentEditable || event.target?.closest?.('input, textarea, select, [role="textbox"]')) return;
    event.preventDefault();
    openPrompt();
  }
  document.addEventListener('keydown', handleTextShortcut);
  // The same shortcut works after clicking inside the sketch iframe.
  preview.addEventListener('load', () => {
    preview.contentDocument?.addEventListener('keydown', handleTextShortcut);
    syncOverlay();
  });
  dialog.addEventListener('close', () => { if (!dialog.open) cancelRequest(); });
  input.addEventListener('input', () => { if (!request) { cancelTextReveal(); showStatus(); fitText(); } });
  input.addEventListener('pointerdown', cancelTextReveal);
  window.addEventListener('resize', () => { if (dialog.open) fitText(); });
  input.addEventListener('keydown', event => {
    allowLineBreak = event.key === 'Enter' && (event.shiftKey || event.isComposing);
    if (request || event.key !== 'Enter' || allowLineBreak) return;
    event.preventDefault();
    if (!event.repeat) form.requestSubmit();
  });
  // A software keyboard can request a line break without delivering an Enter keydown.
  input.addEventListener('beforeinput', event => {
    if (event.inputType !== 'insertLineBreak' && event.inputType !== 'insertParagraph') return;
    if (request || allowLineBreak || event.isComposing || !event.cancelable) return;
    event.preventDefault();
    form.requestSubmit();
  });
  input.addEventListener('keyup', () => { allowLineBreak = false; });
  input.addEventListener('blur', () => { allowLineBreak = false; });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Shift') shiftTap = false;
    else if (!event.repeat) shiftTap = !request && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing;
  });
  dialog.addEventListener('keyup', event => {
    if (event.key !== 'Shift') return;
    // Only a Shift tap cycles examples; capitals and Shift+Enter keep normal typing.
    if (shiftTap) cycleExample();
    shiftTap = false;
  });
  window.addEventListener('blur', () => { shiftTap = false; });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const prompt = input.value.trim() || examples[exampleIndex];
    if (button.hidden || button.disabled || request || !prompt) return;
    const bridge = preview.contentWindow?.sketchAgent;
    const method = agent?.mode === 'drawing' ? 'applyDrawing' : 'applyParameters';
    if (!agent || typeof bridge?.getState !== 'function' || typeof bridge[method] !== 'function') {
      showStatus('The sketch agent is not ready.');
      return;
    }
    const context = { agent, state: bridge.getState() };
    const controller = new AbortController();
    cancelTextReveal();
    cancelConnectionCheck();
    request = controller;
    // Keep the displayed text and its layout unchanged while sending.
    // The API receives the trimmed command, without replacing the quoted example.
    syncRequestState();
    showStatus('Sending…');
    let received = false;
    try {
      const reply = await requestOllama(prompt, OLLAMA, controller.signal, context);
      if (request !== controller || !dialog.open) return;
      received = true;
      setConnection(true);
      let values;
      try { values = JSON.parse(reply); }
      catch { throw new Error('The agent returned invalid JSON. Try again.'); }
      const response = validateAgentResponse(context.agent, values);
      const result = bridge[method](response);
      console.info('[Agent] Applied response', { prompt, response, result });
      lastCommand = prompt;
      input.value = '';
      showExample(Math.floor(Math.random() * examples.length));
      showStatus();
      revealText();
    } catch (error) {
      if (request === controller && error.name !== 'AbortError' && dialog.open) {
        if (!received) setConnection(false);
        showStatus(error instanceof TypeError ? 'Could not reach Ollama. Check the server address and connection.' : error.message);
      }
    } finally {
      if (request === controller) {
        request = null;
        syncRequestState();
      }
    }
  });

  return {
    reset(nextAgent = null) {
      if (dialog.open) dialog.close();
      cancelRequest();
      agent = nextAgent;
      submitButton.textContent = agent?.mode === 'drawing' ? 'Draw' : 'Send';
      cancelConnectionCheck();
      connection.hidden = !agent;
      if (agent) {
        positionConnection();
        refreshConnection();
      }
      lastCommand = '';
      examples = (agent?.examples ?? []).filter(example => typeof example === 'string' && example.trim());
      input.value = '';
      showExample(0);
      showStatus();
    },
  };
}
