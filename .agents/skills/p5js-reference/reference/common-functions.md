# p5.js 2.x — lookup map and migration notes

Use this file for the feature being edited. Confirm overloads and availability in the exact installed release, especially when targeting 2.0.0 rather than a later 2.x release.

## Lookup map

Open `https://p5js.org/reference/p5/<function>/`; the official `beta.p5js.org` reference is an alternate 2.x source. Match source tags when live docs contain newer features.

| Area | Functions or values to look up |
| --- | --- |
| Canvas and timing | createCanvas, createGraphics, resizeCanvas, pixelDensity, frameRate, deltaTime, frameCount |
| Loop | setup, draw, loop, noLoop, isLooping, redraw |
| Shapes | rect, square, circle, ellipse, arc, line, point, rectMode, ellipseMode |
| Custom paths | beginShape, vertex, bezierOrder, bezierVertex, splineVertex, endShape, beginContour, endContour |
| Color | colorMode, color, fill, stroke, noFill, noStroke, strokeWeight, lerpColor |
| Transforms | push, pop, translate, rotate, scale, angleMode |
| Math and variation | sin, cos, map, constrain, lerp, random, randomSeed, noise, noiseSeed |
| Typography | loadFont, textFont, textSize, textWidth, fontWidth, textAlign |
| Images | loadImage, image, imageMode, createImage, loadPixels, updatePixels, saveCanvas |
| Input | keyPressed, keyReleased, keyIsDown, key, code, mouseButton, mousePressed, mouseDragged |
| Vectors | createVector, p5.Vector |
| DOM, only if requested | createButton, createSlider, createInput, p5.Element |
| Accessibility | describe |

## Migration checks

These are checks to apply when the corresponding feature is present, not reasons to redesign a sketch.

- **Loading:** replace native 1.x `preload()` flow with awaited loaders in async setup. Check resolved values, not just names: https://p5js.org/reference/p5/loadImage/.
- **Keyboard:** numeric keycodes are unsupported by 2.x `keyIsDown`. Use strings such as `'ArrowLeft'` or `'KeyA'`, or supported constants. Reference: https://p5js.org/reference/p5/keyIsDown/.
- **Mouse:** use the boolean properties of `mouseButton`, such as `.right`, instead of comparing it to `RIGHT`.
- **Paths:** cubic and quadratic segments use separate `bezierVertex` calls per control/end point, with `bezierOrder(2)` for quadratic segments. `splineVertex` replaces `curveVertex`; endpoint/closure behavior changes. Verify the desired curve rather than mechanically renaming calls.
- **Vectors:** specify dimensions: `createVector(0, 0)` or `createVector(0, 0, 0)` instead of assuming a zero-argument 3D vector.
- **Text:** recheck measurement semantics (`textWidth` versus `fontWidth`) and font APIs when migrating text layout.
- **Utilities:** some array/dictionary helpers were removed. Use native JavaScript where appropriate; verify the migration guide for the function being replaced.
- **Audio/add-ons:** the old p5.sound bundled with 1.x is incompatible with 2.x. Verify add-on versions rather than reusing old files automatically.

Source for migration checks: https://github.com/processing/p5.js-compatibility. Compatibility add-ons are optional; add them only when the task calls for preserving legacy behavior.

## Export and pixels

Check the selected-buffer overload of `saveCanvas` before exporting graphics or framebuffer objects; do not assume every buffer type is accepted directly. Reference: https://p5js.org/reference/p5/saveCanvas/.

For direct pixel edits, inspect the target's actual pixel density, dimensions, and backing-array layout. Do not copy a density-1 indexing formula into a high-density canvas.
