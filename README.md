# blurrr

A fast, private image redaction tool that runs entirely in your browser. No uploads, no servers — your images never leave your device.

Don't want to host it yourself? **Use it here: [blurrr.it](https://blurrr.it/)**

## Why blurrr?

- **Private by design** — Your images are processed locally in your browser. Nothing is uploaded anywhere.
- **No sign-up, no ads** — Just open the page and start redacting.
- **Works offline** — Once loaded, no internet connection required.

## Features

- **Blur, Redact, or Erase** — Gaussian blur, solid black redaction, or white erase
- **Multiple shapes** — Rectangle, rounded rectangle, or ellipse
- **Adjustable blur** — Control strength and optional chunky/pixelated mode
- **Region editing** — Move, resize, rotate, and delete individual regions
- **Image transforms** — Rotate, flip, and crop (all undoable)
- **Undo/Redo** — Full history with keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
- **Drag & drop** — Drop an image onto the page or click to browse
- **Clipboard paste** — Paste screenshots directly with Ctrl+V / Cmd+V
- **Face detection** — Auto-detect and blur faces (Chrome/Edge with experimental flag)
- **Email detection** — OCR-powered auto-detection of email addresses via Tesseract.js
- **Before/after toggle** — Hold Alt or press the button to preview the original image
- **EXIF stripping** — Saved images have all metadata (location, camera, timestamps) removed
- **Cross-browser blur** — Fallback blur for Safari/iOS browsers without `ctx.filter` support

## Use cases

- Redact personal info from screenshots before sharing
- Blur faces or license plates in photos
- Clean up screenshots for bug reports or documentation
- Censor sensitive data in images for social media

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

React 19, Vite, Canvas API, Tesseract.js (lazy-loaded). Zero backend.

## Analytics

blurrr uses [Plausible](https://plausible.io/), a privacy-friendly analytics tool, to track total page visits. No cookies, no personal data collected.

## License

ISC
