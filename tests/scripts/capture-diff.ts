/**
 * capture-diff.ts
 *
 * Local visual-regression signal for agent loops (issue #496): answer the
 * question "did my change move anything I didn't intend?" WITHOUT stored
 * baselines or CI.
 *
 * It captures the normalized DOM and the warnings (layout warnings and console
 * errors, see story-warnings.ts) of every (optionally filtered) story twice —
 * once from the current worktree (HEAD) and once from a throwaway git worktree
 * checked out at <base-ref> — then diffs the two per story. A story whose
 * warnings changed has changed, even when its DOM is identical. Both captures use
 * this tree's capture tooling (driver, harness, normalization; see
 * `withBaseRefHarness`), so only the library and stories differ between them.
 * Because the diff is
 * over normalized geometry/DOM (not rasterized pixels), it is platform-stable:
 * it does not suffer the text-metric drift that makes `update-baselines`
 * unusable on Mac, so it gives a real pass/fail layout signal locally.
 *
 * Usage:
 *   tsx scripts/capture-diff.ts <base-ref> [filter]
 *
 *   tsx scripts/capture-diff.ts main            # whole suite vs main
 *   tsx scripts/capture-diff.ts HEAD~1          # vs the previous commit
 *   tsx scripts/capture-diff.ts main bar        # only stories matching "bar"
 *   tsx scripts/capture-diff.ts main "streamgraph"
 *
 * Output:
 *   tests/tmp/capture-diff/head/<path>.html   normalized DOM at HEAD
 *   tests/tmp/capture-diff/head/<path>.warnings.txt   its warnings
 *   tests/tmp/capture-diff/base/...           the same at <base-ref>
 *   tests/tmp/capture-diff/report.html        DOM diff, warnings diff and the
 *                                             highlighted spec (changed stories)
 *   tests/tmp/capture-diff/live/{head,base}/  each side's harness as static
 *                                             files, which the report's Run
 *                                             live button frames a story in
 *                                             (live-view.ts); serve the
 *                                             directory with
 *                                             `pnpm capture-diff:serve`
 *
 * Exit code 0 = nothing moved, 1 = at least one story changed/added/removed
 * (a warnings-only change counts)
 * (so it doubles as a pass/fail gate in an inner loop).
 */

import { writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  captureStories,
  HARNESS_DIR,
  withBaseRefHarness,
} from "./capture-core.js";
import {
  diffSnapshotDirs,
  formatEntryDomDiff,
  formatWarningsPanel,
  escapeHtml,
  type StoryChange,
} from "./diff-utils.js";
import { git } from "./snapshot-branch.js";
import {
  loadSpecsByPath,
  createCodeHighlighter,
  specHtml,
  SPEC_CSS,
  type StorySpec,
} from "./story-specs.js";
import {
  buildLiveHarness,
  liveSrc,
  LIVE_CSS,
  LIVE_DIR,
  LIVE_SCRIPT,
} from "./live-view.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const OUT_DIR = join(TESTS_DIR, "tmp/capture-diff");
const HEAD_DIR = join(OUT_DIR, "head");
const BASE_DIR = join(OUT_DIR, "base");
const REPORT_PATH = join(OUT_DIR, "report.html");

const HEAD_PORT = 3001; // reuse capture-js-dom's port (it isn't running concurrently)
const BASE_PORT = 3003; // distinct so the base worktree's server can coexist

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function generateReport(
  baseRef: string,
  filter: string | undefined,
  changes: StoryChange[],
  /** path → highlighted spec fragment (HEAD's code; none for removed) */
  specs: Map<string, string>,
  /** path → the story live on each side (`liveSrc`), where it can run */
  live: Map<string, { head: string; base?: string }>
): string {
  const kindColor: Record<StoryChange["kind"], string> = {
    changed: "#e74c3c",
    new: "#3498db",
    removed: "#95a5a6",
  };
  const kindLabel: Record<StoryChange["kind"], string> = {
    changed: "CHANGED",
    new: `ADDED (not in ${baseRef})`,
    removed: `REMOVED (only in ${baseRef})`,
  };

  const entryHtml = changes
    .map((c) => {
      const domChanged = c.change === "dom" || c.change === "both";
      const panel = formatWarningsPanel(c.warnings);
      const sides = live.get(c.path);
      const liveHtml = sides
        ? `
      <div class="live-row">
        <button class="live-toggle" type="button" aria-pressed="false"
          data-base="${escapeHtml(sides.base ?? "")}" data-head="${escapeHtml(sides.head)}"
          data-base-note="${escapeHtml(`${baseRef} (base), live`)}">Run live</button>
        <span class="live-hint">Runs the story on each side it exists on, so you can hover, click and drag.</span>
        <div class="live-pair" hidden>
          <div><h4>${escapeHtml(baseRef)} (base)</h4><div class="live-slot" data-side="base"></div></div>
          <div><h4>HEAD</h4><div class="live-slot" data-side="head"></div></div>
        </div>
      </div>`
        : "";
      return `
    <div style="border:1px solid #ddd;margin:16px 0;border-radius:6px;overflow:hidden;">
      <div style="padding:12px 16px;background:${kindColor[c.kind]}22;border-bottom:1px solid #ddd;">
        <span style="font-weight:bold;color:${kindColor[c.kind]};">${escapeHtml(kindLabel[c.kind])}${
          c.change === "warnings" ? " (warnings only)" : ""
        }</span>
        <span style="margin-left:12px;font-family:monospace;">${escapeHtml(c.path)}</span>
      </div>${liveHtml}
      <details ${domChanged ? "open" : ""} style="padding:0;">
        <summary style="cursor:pointer;font-weight:bold;font-size:13px;padding:8px 16px;">DOM diff (− ${escapeHtml(baseRef)}, + HEAD)</summary>
        <div style="max-height:600px;overflow:auto;border-top:1px solid #e0e0e0;">
          ${formatEntryDomDiff(c.before?.dom ?? null, c.after?.dom ?? null)}
        </div>
      </details>
      ${panel && `<div style="padding:8px 16px 0;border-top:1px solid #e0e0e0;">${panel}</div>`}${
        specs.has(c.path)
          ? `
      <details style="padding:0;border-top:1px solid #e0e0e0;">
        <summary style="cursor:pointer;font-weight:bold;font-size:13px;padding:8px 16px;">Spec (HEAD)</summary>
        <div style="max-height:600px;overflow:auto;border-top:1px solid #e0e0e0;">
          ${specs.get(c.path)}
        </div>
      </details>`
          : ""
      }
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>capture-diff: HEAD vs ${escapeHtml(baseRef)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 24px; color: #333; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
    ${SPEC_CSS}
    ${LIVE_CSS}
    .live-row { padding: 8px 16px; border-bottom: 1px solid #e0e0e0; }
    .live-toggle { padding: 4px 12px; border-radius: 6px; border: 1px solid #ccc; background: #f5f5f5; font-size: 13px; cursor: pointer; }
    .live-toggle[aria-pressed="true"] { background: #222; color: #fff; border-color: #222; }
    .live-hint { font-size: 12px; color: #888; margin-left: 8px; }
    .live-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-top: 8px; }
    .live-pair h4 { font-size: 12px; color: #666; margin: 0 0 6px; }
    .live-pair .live-slot:empty::after { content: "Not on this side."; color: #aaa; font-size: 13px; }
  </style>
</head>
<body>
  <h1>capture-diff: HEAD vs ${escapeHtml(baseRef)}</h1>
  <p>${changes.length} story(ies) moved${filter ? ` (filter: <code>${escapeHtml(filter)}</code>)` : ""}. Diff is over normalized geometry/DOM and each story's warnings (layout warnings and console errors), so it is platform-stable.</p>
  ${entryHtml}
<script>${LIVE_SCRIPT}</script>
<script>
  // Run live: frame the story on each side it exists on. gofishLive keeps a
  // few slots live at once; when it closes one of a card's slots to make
  // room, the whole card closes.
  function closeCard(btn) {
    const row = btn.closest('.live-row');
    row.querySelectorAll('.live-slot').forEach((slot) => gofishLive.unmount(slot));
    row.querySelector('.live-pair').hidden = true;
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = 'Run live';
  }
  document.querySelectorAll('.live-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-pressed') === 'true') return closeCard(btn);
      const row = btn.closest('.live-row');
      row.querySelector('.live-pair').hidden = false;
      btn.setAttribute('aria-pressed', 'true');
      btn.textContent = 'Stop live';
      const notes = { base: btn.dataset.baseNote, head: 'HEAD, live' };
      row.querySelectorAll('.live-slot').forEach((slot) => {
        const src = btn.dataset[slot.dataset.side];
        if (src) gofishLive.mount(slot, src, notes[slot.dataset.side], () => closeCard(btn));
      });
    });
  });
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const baseRef = process.argv[2];
  const filter = process.argv[3];

  if (!baseRef) {
    console.error(
      "Usage: tsx scripts/capture-diff.ts <base-ref> [filter]\n" +
        "  e.g. tsx scripts/capture-diff.ts main\n" +
        "       tsx scripts/capture-diff.ts HEAD~1 bar"
    );
    process.exit(2);
  }

  // Resolve the ref now so we fail fast on a typo (and pin to a sha so the
  // worktree is stable even if the branch moves mid-run).
  const baseSha = git(`git rev-parse "${baseRef}"`, { ignoreError: true });
  if (!baseSha) {
    console.error(
      `Cannot resolve base ref "${baseRef}". Is it a valid commit/branch?`
    );
    process.exit(2);
  }
  const baseShort = baseSha.slice(0, 9);

  // Fresh output dir each run.
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Capture HEAD from the current worktree.
  console.log(`=== Capturing HEAD (current worktree) ===\n`);
  const headResult = await captureStories({
    harnessDir: HARNESS_DIR,
    port: HEAD_PORT,
    outDir: HEAD_DIR,
    filter,
  });
  // HEAD's harness as static files, for the report's live views.
  await buildLiveHarness(HARNESS_DIR, join(OUT_DIR, LIVE_DIR, "head"));

  // 2. Capture <base-ref>'s stories, with this tree's harness, from a
  //    throwaway worktree.
  console.log(
    `\n=== Checking out ${baseRef} (${baseShort}) into a temp worktree ===`
  );
  // The files the base ref has: a story runs live on the base side only
  // when its file is there.
  let baseFiles = new Set<string>();
  const baseResult = await withBaseRefHarness(baseSha, async (harnessDir) => {
    console.log(`\n=== Capturing ${baseRef} (${baseShort}) ===\n`);
    const result = await captureStories({
      harnessDir,
      port: BASE_PORT,
      outDir: BASE_DIR,
      filter,
    });
    // The base ref's harness as static files, while its worktree exists.
    await buildLiveHarness(harnessDir, join(OUT_DIR, LIVE_DIR, "base"));
    baseFiles = new Set(
      git("git ls-files", { cwd: join(harnessDir, "../..") }).split("\n")
    );
    return result;
  });

  // 3. Diff per story: the same snapshot diff as the CI compare
  //    (`diffSnapshotDirs`), with the base capture as the baseline. Both
  //    sides come from this tree's capture, so both have warnings files.
  const changes = diffSnapshotDirs(BASE_DIR, HEAD_DIR);

  // 4. Report.
  console.log(`\n=== Result: HEAD vs ${baseRef} (${baseShort}) ===\n`);

  const changed = changes.filter((c) => c.kind === "changed");
  const added = changes.filter((c) => c.kind === "new");
  const removed = changes.filter((c) => c.kind === "removed");
  const changeNote = {
    dom: "",
    warnings: " (warnings only)",
    both: " (DOM and warnings)",
  };

  if (changes.length === 0) {
    console.log(
      `  No layout changes. ${headResult.captured.length} story(ies) identical.`
    );
  } else {
    if (changed.length) {
      console.log(`  ${changed.length} changed:`);
      for (const c of changed) {
        console.log(`    ~ ${c.path}${c.change ? changeNote[c.change] : ""}`);
        for (const l of c.warnings.lines) {
          if (l.kind === "added") console.log(`        + ${l.text}`);
          else if (l.kind === "removed") console.log(`        - ${l.text}`);
        }
      }
    }
    if (added.length) {
      console.log(`  ${added.length} added (not in ${baseRef}):`);
      for (const c of added) console.log(`    + ${c.path}`);
    }
    if (removed.length) {
      console.log(`  ${removed.length} removed (only in ${baseRef}):`);
      for (const c of removed) console.log(`    - ${c.path}`);
    }
  }

  // Render failures are worth surfacing — a crash in either ref is a real signal.
  const renderFailures = [
    ...headResult.failed.map((f) => ({ ...f, ref: "HEAD" })),
    ...baseResult.failed.map((f) => ({ ...f, ref: baseRef })),
  ];
  if (renderFailures.length) {
    console.log(`\n  ${renderFailures.length} render failure(s):`);
    for (const f of renderFailures)
      console.log(`    ! [${f.ref}] ${f.path}: ${f.error}`);
  }

  // Each moved story's spec at HEAD (a removed story has none), and where
  // it runs live. A live view finds a story by HEAD's file and export, so a
  // removed story, which HEAD has no spec of, does not run live.
  const specs = new Map<string, string>();
  const live = new Map<string, { head: string; base?: string }>();
  if (changes.length) {
    const specsByPath = await loadSpecsByPath();
    const highlight = await createCodeHighlighter();
    for (const c of changes) {
      const spec: StorySpec | undefined =
        c.kind === "removed" ? undefined : specsByPath.get(c.path);
      if (!spec) continue;
      specs.set(c.path, specHtml(spec, highlight));
      live.set(c.path, {
        head: liveSrc("head", spec),
        base:
          c.kind === "changed" && baseFiles.has(spec.storyFile)
            ? liveSrc("base", spec)
            : undefined,
      });
    }
  }
  writeFileSync(
    REPORT_PATH,
    generateReport(baseRef, filter, changes, specs, live),
    "utf-8"
  );
  if (changes.length) {
    console.log(`\n  DOM written to ${HEAD_DIR} and ${BASE_DIR}`);
    console.log(`  Diff report: ${REPORT_PATH}`);
    console.log(
      "  To run its stories live: pnpm capture-diff:serve, then open the report address it prints"
    );
  }

  // Non-zero when anything moved so this can gate an inner loop.
  process.exit(changes.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
