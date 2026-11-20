---
name: p5js-reference
description: Verify p5.js 2.x APIs against official documentation and version-matched source when writing, editing, debugging, or reviewing sketches. Includes migration guidance, pedagogical code comments, and Tweakpane with a minimal black-and-white theme for explicitly requested sketch interfaces.
---

# p5.js Reference (2.x)

Support creative coding through accurate API use. Follow the requested visual direction and existing project structure. This skill does not require a palette, manifesto, viewer, controls, or export UI.

## Minimal form, creative movement

Make as few stylistic decisions as possible beyond what the prompt and references specify. Use the student's written reference notes to determine which visual properties to carry into the sketch. If the student explicitly asks to use a reference without further notes, retain only the minimum properties needed for the requested concept; do not treat every visible detail as a styling instruction.

For unspecified choices, use this skill's defaults and the simplest implementation. Do not invent a visual identity or add decorative choices in palette, stroke weight, corner rounding, opacity, texture, typography, layout, or effects. Introduce a visual choice only when specified or necessary to express the requested movement, and keep necessary choices modest. Prioritize faithful exploration of the stated concept over embellishment. The current prompt takes precedence over reference notes and defaults.

When the prompt leaves shape unspecified, make as few shape and composition decisions as possible. Reuse the existing shape when editing a sketch; for a new sketch, choose the simplest primitive needed to demonstrate the requested concept. Avoid inventing additional shape families, satellites, motifs, arrangements, or a visual theme. Let the requested movement guide only the geometry it needs. If a particular shape is essential to the task and cannot be inferred, ask a concise question rather than imposing an interpretation. Do not ask about routine choices that can remain simple.

Keep sketches minimal, with the focus on movement and creative visual interest. Start with a small number of clear visual ideas and simple geometry. Build interest through rhythm, timing, phase shifts, repetition, contrast, spatial relationships, and how forms evolve over time.

Minimal does not mean visually inert: make the motion intentional and engaging while keeping the mechanism understandable for learning. Prefer exploring a simple movement relationship over adding unrelated elements or effects. Match complexity to the prompt; do not impose a fixed formula or aesthetic.

Avoid unsolicited interface controls, decorative text, textures, gradients, glow, or other embellishments. Add such elements only when requested or necessary to the concept. Preserve the default black-and-white treatment and 640 × 640 responsive canvas unless the prompt overrides them. Keep pedagogical explanations in source comments so the page stays focused on the sketch.

## Interactions only when explicitly requested

Do not add interactions unless the prompt explicitly requests them. This includes keyboard shortcuts, pause/resume controls, mouse or pointer responses, click/drag behavior, touch input, sliders, buttons, and export actions. By default, the sketch runs autonomously; experimentation happens by editing parameters in the source code.

When an interaction is requested, implement only the requested behavior. Existing interactions do not authorize adding more; when reworking a sketch under these defaults, omit interactions not explicitly requested for the result.

## Mouse, touch and pen for requested interactions

Make every requested canvas click, press, drag and release work with mouse, touch and pen. Prefer one Pointer Events path on the canvas returned by `createCanvas(...).elt`; avoid duplicate mouse/touch handlers that trigger the same action twice. For ordinary interface buttons, use native `click` behavior.

For drawing or dragging, track the active `pointerId`, capture it on press, and clean up on release, `pointercancel` and `lostpointercapture`. Ignore unrelated pointers when the interaction supports one gesture at a time. Convert client coordinates through the canvas bounding rectangle into logical `width`/`height` units, independently of pixel density. Apply `touch-action: none` only to a canvas that needs direct touch gestures; keep controls and other scrollable areas usable.

Verify mouse, touch and pen input, release outside the canvas, interruption, extra fingers and scaled coordinates. Preserve sketches that intentionally have no manual interaction. See [MDN's Pointer Events drawing guide](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events) when implementing this input path.

## Requested interfaces: Tweakpane

When the user explicitly requests a sketch interface or parameter controls, use [Tweakpane](https://tweakpane.github.io/docs/) for the relevant controls instead of building equivalent widgets from scratch, unless the user specifies another library. Bind only the requested settings to the sketch's parameters and follow the existing project structure. Check the official documentation for the version being integrated.

Apply a minimal style preset matching the rest of the interface: opaque black background (`#000`), pure white text and controls (`#fff`), the project's font (monospace if unspecified), and thin 1 px borders where needed. No shadows, gradients, glow, transparency, decorative effects, or extra animation. Use Tweakpane's theme options and scoped CSS overrides as needed.

Use the same comfortable sizing for requested controls on desktop, tablet and mobile: at least 44 px control height, 16 px control text, 24 px slider handles and 8 px spacing. Place parameter labels above full-width controls using smaller 12 px text, 16 px line height and a 4 px gap. Keep sizes consistent for mouse, trackpad and touch input; adapt the layout to available space rather than making controls smaller for one device. Use Tweakpane 4's `--tp-container-unit-size`, `--tp-container-unit-spacing` and `--tp-container-vertical-padding` variables, keeping the whole slider track draggable. Keep controls scrollable and avoid browser zoom on text-field focus. Reuse shared sizing when the project provides it; do not duplicate these overrides in each sketch or shrink them with sketch-specific CSS. This does not authorize adding an interface or more controls.

Keep a sketch's requested interface in `ui.js` beside its `sketch.js`, inside the same version folder. Export `createUI(config)` from `ui.js`; keep the Tweakpane import, controls, and scoped styles there. In a global p5 sketch, load it inside async `setup()` with `const { createUI } = await import('./ui.js')`, then call `createUI(CONFIG)` to bind the sketch's parameter object. Do not put version-specific controls in the shared HTML or timeline. When creating a later version, copy and archive both files together so each version retains its own interface. Do not create an empty `ui.js` for sketches without controls.

Without an explicit interface request, do not load Tweakpane or add parametric settings, a settings panel, or controls. A request to adjust an existing interface, such as the timeline layout, authorizes that adjustment only; it does not authorize adding unrelated settings or a new panel.

## Teach through the code, every time

This is a pedagogical tool. Every sketch you create or modify must explain the relevant concepts directly in code comments, in the user's language and at a level suited to their experience. A chat explanation supplements these comments; it does not replace them.

- Start with a short comment stating what the sketch explores and how its main ideas produce the visible result.
- Explain each meaningful concept beside the code that uses it: for example, setup versus the draw loop, coordinates, iteration, transformations, trigonometry, phase, randomness, or asynchronous loading. Cover the concepts actually present, not an unrelated syllabus.
- Connect the reasoning to what the learner sees. Explain why a formula or technique is used, what its inputs and outputs represent, and how it changes position, shape, color, or motion.
- For non-obvious expressions, explain the steps, units and useful ranges. For example, `sin()` produces values from -1 to 1; multiplying by an amplitude sets the displacement, and adding a phase shifts the oscillation.
- Explain the role of the main adjustable parameters and what changing them does, so the learner can experiment in the code.
- Use descriptive names and a readable progression. Comment meaningful blocks rather than paraphrasing every obvious line. Keep explanations accurate and concise enough to preserve the flow of the code.
- When editing existing code, update comments alongside the behavior and explain newly introduced concepts. Do not add an interface or visual decoration merely to teach; keep teaching in the source unless the user requests another format.

## Default colors

Use a palette only when it is explicitly selected in the prompt or in the student's reference Markdown (for example, `Palette choisie : bleu`). A list of suggested palettes or colors visible in reference images does not select one. An explicit palette choice in the current prompt takes precedence over the Markdown selection.

If no palette or colors are explicitly selected, apply or reset to black and white: black background, white shape fills and strokes. Do not retain a previous colored palette by default. Preserve explicitly requested rendering choices such as outline-only shapes.

When the prompt does not specify colors, use **a black background with white shape fills and white strokes**. Do not invent a palette, add accent colors, or cycle through hues. In the default RGB mode, use `background(0)`, `fill(255)`, and `stroke(255)` where those operations are needed.

Follow any explicitly requested colors and rendering choices, including outline-only shapes. If only some colors are specified, keep unspecified parts black or white rather than introducing additional colors. Do not add visual effects or color treatments merely to embellish the sketch.

## Default canvas size and responsive display

Unless the prompt specifies another size or explicitly requests an adaptive fullscreen sketch, create a **640 × 640** canvas with `createCanvas(640, 640)`.

For the default square sketch, make its display responsive through the page's CSS: preserve the square aspect ratio and scale the canvas down to fit the available viewport without changing its internal 640 × 640 drawing coordinates. For example:

```css
canvas {
  display: block;
  width: min(640px, 100%, 100svh) !important;
  height: auto !important;
}
```

Ensure the containing HTML layout fits the viewport without adding unwanted margins or overflow. Explain in code comments that CSS display size and the canvas's internal drawing dimensions are different.

Only when the prompt explicitly requests adaptive fullscreen, size the canvas to the available window and update it on resize, using `windowWidth`, `windowHeight`, and `resizeCanvas(...)` as appropriate. Adapt drawing coordinates to the changing dimensions. Verify the relevant API signatures for the project's version. Do not turn an ordinary responsive square sketch into a fullscreen canvas.

## Establish the actual version

Check the installed package/lockfile, versioned script URL, or bundled library header. Do not infer the version from `preload()`, callbacks, the editor default, or an unversioned CDN URL. Legacy code can run with compatibility add-ons.

Target p5.js 2.x, including 2.0.0. For a project still using 1.x, use its matching reference for ordinary edits and explain the mismatch when relevant. Updating this skill does not authorize upgrading a project's library. When migration is requested, select an explicit 2.x version and check its add-on compatibility.

## Verify APIs before using them

For unfamiliar calls, changed APIs, optional arguments, return types, or constants, check the exact syntax and example:

- Current reference: https://p5js.org/reference/p5/<name>/
- Alternate official 2.x reference: https://beta.p5js.org/reference/p5/<name>/
- Classes: use their reference page, e.g. https://p5js.org/reference/p5.Vector/
- Legacy reference: https://v1.p5js.org/reference/
- Migration guide: https://github.com/processing/p5.js-compatibility

Documentation evolves. For a pinned release such as **2.0.0**, confirm newly added or ambiguous behavior against the matching tag at https://github.com/processing/p5.js/tree/v2.0.0/src (or the project's exact version). Do not assume current documentation describes every earlier 2.x release. If browsing fails, inspect matching local source; state uncertainty when neither is available. Never guess the version of a repository branch.

Use [reference/common-functions.md](reference/common-functions.md) as a lookup map and migration checklist when the relevant feature occurs; it is not an exhaustive signature reference.

## Lifecycle and asset loading

A sketch without external assets can keep ordinary synchronous `setup()` and `draw()`. For asset loading, prefer `async function setup()` with awaited loaders; `draw()` starts after setup completes. For example, inside async setup:

```js
// Wait for the image to finish loading before trying to draw it.
const img = await loadImage('assets/image.png');
image(img, 0, 0);
```

Verify each loader's resolved type. `loadImage()` returns a Promise; supported callbacks are not proof that code uses 1.x. Handle loading failures in proportion to the sketch. Avoid starting network loads on every animation frame.

Do not introduce `preload()` in native 2.x code. An existing preload compatibility add-on is a separate execution mode; inspect it before changing an older sketch. See https://p5js.org/reference/p5/async_await/.

## Keep examples minimal

```js
// A static circle introduces canvas coordinates without adding interaction.
function setup() {
  // setup runs once: create a 640 × 640 drawing area.
  createCanvas(640, 640);
  describe('A white circle at the center of a black canvas.');
}

function draw() {
  // draw repeats: clear the previous frame so the circle leaves no trail.
  background(0);
  fill(255);
  stroke(255);
  // x increases to the right, y downward; 50 is the diameter in canvas units.
  circle(width / 2, height / 2, 50);
}
```

In instance mode, use `p.setup`, `p.draw`, and namespaced calls such as `p.circle(...)`. Keep `push()` / `pop()` balanced. Angles default to radians; circle size is diameter. Treat system values such as `width`, `frameCount`, and `deltaTime` as variables rather than functions.

For code changes, check that the sketch loads and the affected animation, input, or asset-loading path works with the project's actual version. A documentation-only skill edit does not require changing the user's artwork.
