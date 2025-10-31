# Dither Forge

A tiny, zero-dependency web app for making dithering images (like classic 1‑bit and newspaper halftones) directly in your browser. No uploads, no build step. Just open `index.html`.

https://user-images

## Features

- Algorithms: **Threshold**, **Ordered Bayer (4×4 / 8×8)**, **Floyd–Steinberg**, **Atkinson**, **Halftone (dots)**, or **None (posterize)**.
- Grayscale levels (2–16) or **custom color palettes** (`#000,#777,#bbb,#fff`).
- Basic adjustments: **brightness**, **contrast**, **gamma**, **invert**.
- Pixel-perfect preview scaling and one‑click **Download PNG**.
- All processing happens locally with `<canvas>`.

## Quick Start

1. Clone or download the repo.
2. Open `index.html` in any modern browser.
3. Load an image, pick your algorithm, and click **Apply**. Download when happy.

## Palettes

- Leave “Custom palette” empty to use grayscale with N levels.
- To use a palette, enter comma‑separated hex colors, for example:

```
#000,#6f6f6f,#bfbfbf,#ffffff
```

Colors are chosen per pixel via nearest‑color distance in RGB space.

## Deploy

Because this is static, you can host it on **GitHub Pages**: enable Pages with
the root folder. Or drop the files on any static host.

## Dev Notes

- The dithering logic lives in `script.js` — search for `render()` and the specific algorithm blocks.
- To add a new palette or algorithm, extend `buildGrayPalette()` and `render()` respectively.
- The app avoids external libraries for clarity and portability.

## License

MIT — see `LICENSE`.
