# GoFish intro video

A 45 second introduction to GoFish, rendered from a web page into a 1920x1080,
30 fps H.264 MP4 with no audio.

## Regenerate

From the repository root, after `pnpm install`:

```bash
node scripts/intro-video/render.mjs
```

The video is written to `scripts/intro-video/out/gofish-intro.mp4`. A full
render takes about seven minutes. The page loads its fonts from Google Fonts,
so the machine needs a network connection.

The command does these steps:

1. Builds `packages/gofish-graphics` if `dist/` is missing.
2. Captures any missing montage tiles with `pnpm capture-one` (see
   `capture-tiles.mjs` and `montage.json`). Delete `out/tiles/` to capture them
   again.
3. Builds `page/` with Vite into `out/site/`, serves it, and opens it in
   headless Chromium.
4. Calls `window.__seek(t)` for every frame, takes a screenshot, and pipes the
   PNGs into ffmpeg (`/opt/homebrew/bin/ffmpeg`, or set `FFMPEG`).

## Other commands

```bash
node scripts/intro-video/render.mjs --stills 8,17.1,30    # PNGs in out/preview/
node scripts/intro-video/render.mjs --determinism 12,30   # render twice, compare
node scripts/intro-video/render.mjs --serve               # serve the page to open yourself (add ?t=12.5)
node scripts/intro-video/capture-tiles.mjs "Pie/Rose"     # try other stories as tiles
```

## How it works

Every visual property on the page is a function of the time `t`. There are no
timers, no animation frames, and no CSS animations, so any frame can be drawn
in any order and always looks the same.

The charts in scenes 2 and 3 are real GoFish renders. The code strings in
`page/main.js` are both shown in the code panel and run to draw the charts, so
the code on screen is exactly the code that made the chart. The scene 3 edits
are computed by diffing those strings.
