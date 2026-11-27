![Retrace preview](public/assets/img/preview.png)

# Retrace

A creative coding workspace for students. Make interactive drawings with an AI coding assistant and revisit each iteration’s code and prompt.

## Quick start

Install [Node.js](https://nodejs.org/) 22.12 or newer and run these commands in the project folder.

```sh
npm install
npm run dev
```

Open the **Local** URL printed in the terminal.

On iPad, connect to the same Wi-Fi as the computer. Copy the **Network** URL from the terminal or click **Retrace** to copy it. Open it in Safari.

## Create and iterate

Open the project folder in your AI coding assistant. Describe the drawing, its motion and how you interact with it. If you have visual references, share a link or name files in `references/` and say what to borrow.

**New project**

> Create a p5.js project called “Traces”. When I drag with a mouse or finger, draw white lines on black that slowly fade. Proceed without a visual reference.

**New iteration**

In **Versions**, click the version summary to copy its reference. Paste it into your coding assistant with your change.

> Make the lines thicker and fade twice as slowly.

**Export and import JSON**

In **Projects**, use a project's **Export JSON** button to download its full history, or **Import JSON** to restore a project or a single iteration. In **Versions**, **Export JSON** downloads the selected iteration and **Import JSON** adds an iteration to the current project. Archives include source code, controls, prompts, engine metadata and any existing Agent configuration; they do not capture the live drawing or shared fonts and libraries. Import is available on localhost with the development server running. Existing versions are preserved: identical versions are skipped, missing versions are merged, and conflicting content is imported into a separate project.

**Sidebar controls**

Use **Add Controls** in your prompt and name the settings you want in the right sidebar.

> Add Controls for stroke width and fade speed.

## Engines

Choose an engine in your prompt or ask your assistant to help you pick one.

- **p5.js** for 2D drawing and animation.
- **Paper.js** for vector paths and SVG export.
- **Three.js** for shaders and 3D.

## Optional sketch Agent

The **Agent** lets you change the running sketch with text. Ask for Agent mode in each new version that should include it, and list the parameters it should control.

> Add Agent mode to control the existing stroke width and fade speed settings.

A general request uses the sketch’s existing tunable settings. To let the Agent control a new parameter, explicitly ask to make it configurable.

Install and run [Ollama](https://ollama.com/download), then download the model.

```sh
ollama pull qwen3.5:9b
```

If you use Ollama without the app, start it with `ollama serve` in a separate terminal.

## Print on AxiDraw

Open a **Paper.js** sketch, then **Export → AxiDraw**. Set the drawing width and height in millimeters, position the crop and click **Print on AxiDraw**. The paper preview shows thin black paths on white, using the same frozen vector paths sent to the plotter. Each source stroke stays a single centerline: its visual thickness is never expanded into two outlines. Filled-only shapes (including backgrounds) and raster images are skipped. Plain text is converted to vector paths by the Python bridge using the project’s bundled Unica77LL Regular font or locally installed Arial, Times New Roman or Courier New fonts. All **Type on Line** iterations use Unica77LL Regular, matching the interface. Keep the bridge running for text previews, even without an AxiDraw attached. Styled or multiline text must be converted to paths first. Existing closed paths and overlapping geometry retain their original trajectories; this does not reconstruct centerlines from outlined shapes. The AxiDraw tab is only available for Paper.js vector sketches and stays hidden for p5.js and Three.js projects.

On the computer connected to the AxiDraw by USB, install the [official AxiDraw Python API](https://axidraw.com/doc/py_api/#installation) in a virtual environment. Its documented supported Python versions are 3.8–3.12; this example uses Python 3.12.

```sh
python3.12 -m venv .venv-axidraw
source .venv-axidraw/bin/activate
python -m pip install -r timeline/requirements-axidraw.txt
python timeline/axidraw_server.py
```

Keep that terminal open and run `npm run dev` in another terminal. Vite forwards print requests to the bridge, including when opening its Network URL from an iPad. The bridge listens only on `127.0.0.1:8765`. For a hosted Retrace site, run the bridge on the browser’s computer with `--origin https://your-retrace-site.example`; the browser may ask for local network access.

For later sessions, activate the environment again with `source .venv-axidraw/bin/activate`, then run `python timeline/axidraw_server.py`.

Place the paper in landscape and position the carriage at the top-left origin before starting. The orientation selector controls the composition and its preview. The bridge enables AxiDraw auto-rotation: portrait compositions rotate 90° for landscape plotting, preserving their scale and proportions. Landscape compositions keep their orientation. Secure the paper and set the dimensions within your machine’s drawing area. Dimensions describe the drawing area starting at that origin, without an added margin. Use the machine’s physical pause button to stop a plot; closing the modal does not stop it. A paused plot cannot be resumed from Retrace; reposition at the origin before starting again.

The bridge starts with model `1` (V2/V3/A4), speed `25`, pen-up height `60` and pen-down height `40`. Adjust them when launching if needed:

```sh
python timeline/axidraw_server.py --model 2 --speed 25 --pen-up 60 --pen-down 40
```

`--model` uses the API model numbers (for example, `2` for V3/A3). Connect the AxiDraw before starting the bridge. The bridge detects USB controllers once at startup, and Retrace reads that result when the page loads. If you connect the machine later, restart the bridge and reload the page. Printing stays disabled if startup detection found no controller. During a print, Retrace follows the job until completion, pause or error using the cached USB status. A busy bridge rejects additional plots.
