// Capture the montage tiles (scene 4) with the repo's own story capture tool.
//
// Each tile is a gallery-tagged Storybook story rendered by `pnpm capture-one`,
// which writes `tests/tmp/iterate/<story path>.png`. This script runs it for
// every story in montage.json (a few at a time, each on its own port) and
// copies the PNGs to out/tiles/<id>.png, where the video page picks them up.
//
//   node scripts/intro-video/capture-tiles.mjs            # tiles listed in montage.json
//   node scripts/intro-video/capture-tiles.mjs --missing  # only tiles not yet captured
//   node scripts/intro-video/capture-tiles.mjs "Pie/Rose" # ad hoc: any story filters
//                                                         # (copied to out/candidates/)

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const CONCURRENCY = 3;
const BASE_PORT = 3150;

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function captureOne(filter, port) {
  return new Promise((resolve, reject) => {
    const proc = spawn("pnpm", ["capture-one", filter], {
      cwd: REPO,
      env: { ...process.env, CAPTURE_ONE_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (out += d));
    proc.on("close", (code) => {
      const pngs = out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.endsWith(".png"));
      if (code !== 0 || pngs.length === 0) {
        reject(new Error(`capture-one "${filter}" failed:\n${out}`));
      } else {
        resolve(pngs);
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const onlyMissing = args.includes("--missing");
  const adHoc = args.filter((a) => !a.startsWith("--"));

  let jobs;
  let outDir;
  if (adHoc.length) {
    outDir = join(HERE, "out/candidates");
    jobs = adHoc.map((filter) => ({ filter, id: slug(filter) }));
  } else {
    outDir = join(HERE, "out/tiles");
    const montage = JSON.parse(
      readFileSync(join(HERE, "montage.json"), "utf8")
    );
    jobs = montage.map(({ story, id }) => ({ filter: story, id }));
  }
  mkdirSync(outDir, { recursive: true });
  if (onlyMissing) {
    jobs = jobs.filter(({ id }) => !existsSync(join(outDir, `${id}.png`)));
  }
  if (!jobs.length) {
    console.log("All montage tiles already captured.");
    return;
  }

  console.log(`Capturing ${jobs.length} stories with pnpm capture-one...`);
  let next = 0;
  const failures = [];
  const worker = async (w) => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const pngs = await captureOne(job.filter, BASE_PORT + w);
        // A filter is a substring, so "Topology/Topology" also matches
        // "Topology/TopologyOverdraw". The exact story has the shortest path.
        const png = pngs.sort((a, b) => a.length - b.length)[0];
        copyFileSync(png, join(outDir, `${job.id}.png`));
        console.log(`  ok   ${job.id}  <-  ${png}`);
      } catch (err) {
        failures.push(job.filter);
        console.error(`  FAIL ${job.filter}\n${err.message}`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, (_, w) =>
      worker(w)
    )
  );
  if (failures.length) {
    throw new Error(`Failed to capture: ${failures.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
