// Render the GoFish intro video.
//
//   node scripts/intro-video/render.mjs                  # full video -> out/gofish-intro.mp4
//   node scripts/intro-video/render.mjs --stills 2,9.5   # just these times -> out/preview/
//   node scripts/intro-video/render.mjs --determinism 12,30
//                                                        # render each time twice, compare
//   node scripts/intro-video/render.mjs --serve          # serve the page to look at by hand
//
// Steps: build gofish-graphics if dist/ is missing, capture any missing montage
// tiles (capture-tiles.mjs), build the page with Vite and serve it, then step a headless
// Chromium through every frame with window.__seek(i / FPS) and pipe the PNG
// screenshots straight into ffmpeg.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  HERE,
  OUT,
  REPO,
  TILES_DIR,
  loadPlaywright,
  startServer,
} from "./server.mjs";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const FFMPEG = process.env.FFMPEG ?? "/opt/homebrew/bin/ffmpeg";
const MP4 = join(OUT, "gofish-intro.mp4");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: REPO, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

function prepare() {
  if (!existsSync(join(REPO, "packages/gofish-graphics/dist/index.js"))) {
    console.log("Building gofish-graphics (dist/ is missing)...");
    run("pnpm", ["--filter", "gofish-graphics", "build"]);
  }
  run("node", [join(HERE, "capture-tiles.mjs"), "--missing"]);
}

async function openPage(url) {
  const { chromium } = await loadPlaywright();
  // Generous timeouts: a busy machine can take minutes to start Chromium.
  const browser = await chromium.launch({ timeout: 300_000 });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[page]", m.text());
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready || window.__error, null, {
    timeout: 120_000,
  });
  const error = await page.evaluate(() => window.__error);
  if (error) throw new Error(`page setup failed:\n${error}`);
  if (!(await page.evaluate(() => window.__fontsOk))) {
    throw new Error(
      "web fonts did not load (Fraunces / Spline Sans / Spline Sans Mono come from Google Fonts; is the network up?)"
    );
  }
  const duration = await page.evaluate(() => window.__duration);
  return { browser, page, duration };
}

async function frameAt(page, t) {
  await page.evaluate((time) => window.__seek(time), t);
  return page.screenshot({ type: "png" });
}

async function renderVideo(page, duration) {
  const frames = Math.round(duration * FPS);
  mkdirSync(OUT, { recursive: true });
  const ff = spawn(
    FFMPEG,
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(FPS),
      "-c:v",
      "png",
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-movflags",
      "+faststart",
      MP4,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))
    );
  });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const png = await frameAt(page, i / FPS);
    if (!ff.stdin.write(png)) {
      await new Promise((r) => ff.stdin.once("drain", r));
    }
    if (i % 60 === 0 || i === frames - 1) {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(`\r  frame ${i + 1}/${frames}  (${secs}s)`);
    }
  }
  process.stdout.write("\n");
  ff.stdin.end();
  await done;
  console.log(`Wrote ${MP4}`);
}

async function renderStills(page, times) {
  const dir = join(OUT, "preview");
  mkdirSync(dir, { recursive: true });
  for (const t of times) {
    const file = join(dir, `t-${t.toFixed(2)}.png`);
    writeFileSync(file, await frameAt(page, t));
    console.log(file);
  }
}

async function checkDeterminism(page, times, duration) {
  let ok = true;
  for (const t of times) {
    const a = await frameAt(page, t);
    await frameAt(page, (t + duration / 2) % duration); // seek somewhere else
    await frameAt(page, 0);
    const b = await frameAt(page, t);
    const same = a.equals(b);
    ok &&= same;
    console.log(
      `t=${t}: ${same ? "identical" : "DIFFERENT"} (${a.length} bytes)`
    );
  }
  if (!ok) process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : (args[i + 1] ?? "");
  };
  const times = (s) => s.split(",").map(Number);

  if (!existsSync(TILES_DIR) || args.length === 0) prepare();
  const server = await startServer();
  if (args.includes("--serve")) {
    console.log(
      `Serving the video page at ${server.url} (add ?t=12.5 to jump)`
    );
    return;
  }
  const { browser, page, duration } = await openPage(server.url);
  try {
    if (opt("--stills") !== undefined) {
      await renderStills(page, times(opt("--stills")));
    } else if (opt("--determinism") !== undefined) {
      await checkDeterminism(page, times(opt("--determinism")), duration);
    } else {
      await renderVideo(page, duration);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
