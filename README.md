# Sticker Gliph

Turn images, videos and your webcam into ASCII art, dithered pixels and print-style halftones, then finish them with a stack of glow, glitch and retro screen effects.

Everything runs locally in the browser. No account, no upload, no AI.

## Features

- **Glyphs (ASCII)**: 48 character sets in 11 categories (classic ASCII, blocks, Braille, runes, blackletter, katakana, card suits...), glyphs ranked by their real ink density, shape-aware mapping, custom characters, animated character offset.
- **Dither**: 38 algorithms: error diffusion (Floyd-Steinberg, Atkinson, Stucki, Riemersma...), ordered (Bayer, blue noise, cluster dot) and graphic patterns (waves, modulation lines, crosshatch...).
- **Halftone**: mono, CMYK and RGB screens with round, line, square and diamond dots.
- **Palettes**: 40 built in, automatic extraction from your image, import and export `.hex` / `.gpl`.
- **Effects stack**: 20 reorderable effects, including threshold glow, JPEG glitch, pixel sort, CRT, VHS, chromatic aberration and grain.
- **Animation**: timeline with keyframes on any numeric setting, video playback and live webcam.
- **Export**: PNG, JPEG, WebP, SVG, TXT, coloured HTML, MP4, GIF, PNG sequence, and batch processing of many images.
- **Presets**: 18 included, save your own and share them as JSON.

## Quick start

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173, drop an image or video on the window, pick a mode and a preset.

To build a static version you can host anywhere:

```bash
npm run build
```

The site is generated in `dist/`.

Or run it with Docker (served by Nginx on port 80):

```bash
docker build -t sticker-gliph .
docker run -p 8080:80 sticker-gliph
```

## How to use

1. **Load a source**: drag and drop a file, paste an image, or click Demo or Webcam.
2. **Pick a mode**: Glyphs, Dither, Halftone or Raw (keys `1` to `4`).
3. **Shape the tone**: the Tone & Colour panel (contrast first) has the biggest impact on the result.
4. **Stack effects**: add them from the Effects Stack and drag cards to reorder. They run top to bottom.
5. **Animate** (optional): click the diamond next to a slider to set a keyframe at the playhead.
6. **Export** from the Export panel.

| Shortcut | Action |
| --- | --- |
| `Space` | Play / pause |
| `1` `2` `3` `4` | Glyphs / Dither / Halftone / Raw |
| `C` | Before / after comparison |
| `F` | Fit to window |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| Double-click a label | Reset to default |

## Browser support

Works best in Chrome and Edge. MP4 export relies on WebCodecs; the other formats work in any recent browser.

## Built with

TypeScript and Vite, no UI framework. Rendering runs in a Web Worker. Export uses [mp4-muxer](https://github.com/Vanilagy/mp4-muxer), [gifenc](https://github.com/mattdesl/gifenc) and [fflate](https://github.com/101arrowz/fflate).

## License

[MIT](LICENSE)
