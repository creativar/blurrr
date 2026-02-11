# blurrr

A fast, private image redaction tool that runs entirely in your browser. No uploads, no servers — your images never leave your device.

## Features

- **Blur, Redact, or Erase** — Gaussian blur, solid black redaction, or white erase
- **Multiple shapes** — Rectangle, rounded rectangle, or ellipse
- **Adjustable blur** — Control strength and optional chunky/pixelated mode
- **Region editing** — Move, resize, rotate, and delete individual regions
- **Image transforms** — Rotate, flip, and crop
- **Undo/Redo** — Full history with keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
- **Drag & drop** — Drop an image onto the page or click to browse

## Getting started

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build

```sh
npm run build
```

Output goes to `dist/`.

## Tech

React 19, Vite, Canvas API. Zero backend.

## License

ISC
