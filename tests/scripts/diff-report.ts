/**
 * Generate a self-contained HTML diff report for visual review.
 *
 * For each failing story (regression, parity, new, or removed), the report shows:
 *   - Strobe animation between before/after screenshots (base64-embedded, CSS keyframes)
 *   - Pixel diff image (base64-embedded) with diff percentage
 *   - Colored line diff of the DOM snapshot
 *
 * Output: tests/tmp/diff-report.html
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  collectDiffs,
  collectRemovedStories,
  formatDomDiff,
  escapeHtml,
  JS_DIR,
  PYTHON_DIR,
  type DiffEntry,
} from "./diff-utils.js";
import { computePixelDiff } from "./pixel-diff.js";

const OUTPUT = join(import.meta.dirname, "../tmp/diff-report.html");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readImageBase64(path: string): string | null {
  try {
    return readFileSync(path).toString("base64");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generate HTML
// ---------------------------------------------------------------------------

interface ReportEntry extends DiffEntry {
  beforeB64: string | null;
  afterB64: string | null;
  diffB64: string | null;
  computedDiffPercent: number | null;
}

function buildReportEntries(diffs: readonly DiffEntry[]): ReportEntry[] {
  return diffs.map((d) => {
    const beforeB64 = d.beforeScreenshotPath
      ? readImageBase64(d.beforeScreenshotPath)
      : null;
    const afterB64 = d.afterScreenshotPath
      ? readImageBase64(d.afterScreenshotPath)
      : null;

    let diffB64: string | null = null;
    let computedDiffPercent: number | null = null;
    if (d.beforeScreenshotPath && d.afterScreenshotPath) {
      const result = computePixelDiff(
        d.beforeScreenshotPath,
        d.afterScreenshotPath
      );
      if (result) {
        diffB64 = result.diffPng.toString("base64");
        computedDiffPercent = result.diffPercent;
      }
    }

    return { ...d, beforeB64, afterB64, diffB64, computedDiffPercent };
  });
}

function generateReport(entries: ReportEntry[]): string {
  const kindLabel: Record<string, string> = {
    regression: "REGRESSION",
    parity: "PARITY MISMATCH",
    new: "NEW (no baseline)",
    removed: "REMOVED",
  };

  const kindColor: Record<string, string> = {
    regression: "#e74c3c",
    parity: "#e67e22",
    new: "#3498db",
    removed: "#7f8c8d",
  };

  const entryHtml = entries
    .map((d, i) => {
      const domDiffHtml =
        d.beforeDom && d.afterDom
          ? formatDomDiff(d.beforeDom, d.afterDom)
          : d.afterDom
            ? `<pre style="margin:0;white-space:pre-wrap;">${escapeHtml(d.afterDom)}</pre>`
            : d.beforeDom
              ? `<pre style="margin:0;white-space:pre-wrap;">${escapeHtml(d.beforeDom)}</pre>`
              : "";

      // Strobe animation: two overlapping images, CSS toggles opacity
      const afterImg = d.afterB64
        ? `<img src="data:image/png;base64,${d.afterB64}" style="display:block;max-width:100%;" />`
        : `<div style="color:#999;padding:40px;text-align:center;">No screenshot</div>`;

      let strobeHtml: string;
      if (d.kind === "removed") {
        // No "after" state to strobe against — just show the baseline that
        // accepting this entry would delete.
        strobeHtml = d.beforeB64
          ? `<img src="data:image/png;base64,${d.beforeB64}" style="display:block;max-width:100%;" />`
          : `<div style="color:#999;padding:40px;text-align:center;">No screenshot</div>`;
      } else if (d.beforeB64) {
        const beforeImg = `<img src="data:image/png;base64,${d.beforeB64}" style="position:absolute;top:0;left:0;max-width:100%;display:block;animation:strobeBefore_${i} 1s step-end infinite;" />`;
        const afterImgAnim = d.afterB64
          ? `<img src="data:image/png;base64,${d.afterB64}" style="display:block;max-width:100%;animation:strobeAfter_${i} 1s step-end infinite;" />`
          : afterImg;
        strobeHtml = `
          <style>
            @keyframes strobeAfter_${i} { 0%,49%{opacity:1;} 50%,100%{opacity:0;} }
            @keyframes strobeBefore_${i} { 0%,49%{opacity:0;} 50%,100%{opacity:1;} }
          </style>
          <div style="position:relative;display:inline-block;">
            ${afterImgAnim}
            ${beforeImg}
          </div>`;
      } else {
        strobeHtml = afterImg;
      }

      // Pixel diff section
      let pixelDiffHtml = "";
      if (d.diffB64) {
        const pct =
          d.computedDiffPercent !== null
            ? d.computedDiffPercent.toFixed(3) + "% pixels changed"
            : "";
        pixelDiffHtml = `
          <div style="margin-top:12px;">
            <h4 style="margin:0 0 6px;font-size:13px;color:#666;">Pixel diff ${pct ? `<span style="color:#e74c3c;">(${escapeHtml(pct)})</span>` : ""}</h4>
            <img src="data:image/png;base64,${d.diffB64}" style="max-width:100%;border:1px solid #ddd;border-radius:4px;" />
          </div>`;
      }

      return `
    <div style="border:1px solid #ddd;margin:16px 0;border-radius:6px;overflow:hidden;">
      <div style="padding:12px 16px;background:${kindColor[d.kind]}22;border-bottom:1px solid #ddd;">
        <span style="font-weight:bold;color:${kindColor[d.kind]};">${kindLabel[d.kind]}</span>
        <span style="margin-left:12px;font-family:monospace;">${escapeHtml(d.path)}</span>
      </div>
      <div style="padding:16px;">
        <h4 style="margin:0 0 8px;font-size:13px;color:#666;">Screenshot (strobe: before ↔ after)</h4>
        ${strobeHtml}
        ${pixelDiffHtml}
      </div>
      <details style="padding:0 16px 16px;">
        <summary style="cursor:pointer;font-weight:bold;font-size:13px;margin-bottom:8px;">DOM diff</summary>
        <div style="max-height:600px;overflow:auto;border:1px solid #e0e0e0;border-radius:4px;">
          ${domDiffHtml}
        </div>
      </details>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Visual Diff Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 24px; color: #333; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  </style>
</head>
<body>
  <h1>Visual Diff Report</h1>
  <p>${entries.length} difference(s) found. This is a static view-only report. Run <code>pnpm test:visual:review</code> for the interactive review server.</p>
  ${entryHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const diffs = collectDiffs();
  const removedStories = collectRemovedStories();
  const allDiffs = [...diffs, ...removedStories];

  if (allDiffs.length === 0) {
    console.log("No diffs to report.");
    return;
  }

  const entries = buildReportEntries(allDiffs);
  const html = generateReport(entries);
  writeFileSync(OUTPUT, html, "utf-8");
  console.log(
    `Diff report written to ${OUTPUT} (${entries.length} entries, ${removedStories.length} removed)`
  );
}

main();
