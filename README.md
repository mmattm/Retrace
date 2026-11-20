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
