/**
 * Build a static Cloudflare Pages review site from the current diff state.
 *
 * Outputs to tests/tmp/review-site/ which can be deployed with:
 *   wrangler pages deploy tests/tmp/review-site \
 *     --project-name=gofish-visual-review \
 *     --branch=<branch>
 *
 * Environment variables:
 *   REVIEW_REPO   - GitHub repo (e.g. "owner/repo")
 *   REVIEW_BRANCH - Branch name
 *   REVIEW_SHA    - Commit SHA
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  cpSync,
  readdirSync,
} from "fs";
import { join, dirname } from "path";
import { collectDiffs, formatDomDiff, type DiffEntry } from "./diff-utils.js";
import { computePixelDiff } from "./pixel-diff.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = import.meta.dirname;
const CF_FUNCTIONS_DIR = join(SCRIPTS_DIR, "cf-functions");
const OUT_DIR = join(SCRIPTS_DIR, "../tmp/review-site");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function write(filePath: string, content: string | Buffer): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function copyFile(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

console.log("Building review site...");

// Collect diffs
const diffs: DiffEntry[] = collectDiffs();
console.log(`  ${diffs.length} diff(s) found`);

// Compute pixel diffs
for (const entry of diffs) {
  if (entry.beforeScreenshotPath && entry.afterScreenshotPath) {
    const result = computePixelDiff(
      entry.beforeScreenshotPath,
      entry.afterScreenshotPath
    );
    if (result !== null) {
      entry.diffPercent = result.diffPercent;

      // Write diff PNG
      const diffPngDest = join(
        OUT_DIR,
        "screenshots/diff",
        entry.path.replace(/\.html$/, ".png")
      );
      write(diffPngDest, result.diffPng);
    }
  }
}

// ---------------------------------------------------------------------------
// data/diffs.json
// ---------------------------------------------------------------------------

write(
  join(OUT_DIR, "data/diffs.json"),
  JSON.stringify(
    diffs.map((d) => ({
      path: d.path,
      kind: d.kind,
      status: d.status,
      diffPercent: d.diffPercent,
    })),
    null,
    2
  )
);

// ---------------------------------------------------------------------------
// data/meta.json
// ---------------------------------------------------------------------------

const codeBranch = process.env.REVIEW_BRANCH ?? "unknown";
const meta = {
  repo: process.env.REVIEW_REPO ?? "unknown/repo",
  branch: codeBranch,
  sha: process.env.REVIEW_SHA ?? "unknown",
  /** The orphan branch that receives accepted snapshots. */
  snapshotBranch: `snapshots/${codeBranch}`,
  /** Workflow run id, used by the commit endpoint to trigger rerun-failed-jobs
   *  after Commit Accepted, so visual-test re-runs against the new baselines
   *  and python-parity (blocked on visual-test) is allowed to run. */
  runId: process.env.REVIEW_RUN_ID ?? "",
};

write(join(OUT_DIR, "data/meta.json"), JSON.stringify(meta, null, 2));

console.log(
  `  Repo: ${meta.repo}, branch: ${meta.branch}, sha: ${meta.sha.slice(0, 8)}`
);

// ---------------------------------------------------------------------------
// data/dom-diffs/{path}.html  and  screenshots/  and  _after-files/
// ---------------------------------------------------------------------------

for (const entry of diffs) {
  // DOM diff HTML
  if (entry.beforeDom !== null && entry.afterDom !== null) {
    const html = formatDomDiff(entry.beforeDom, entry.afterDom);
    write(join(OUT_DIR, "data/dom-diffs", entry.path), html);
  } else if (entry.afterDom !== null) {
    write(
      join(OUT_DIR, "data/dom-diffs", entry.path),
      "<em>New story — no baseline to diff against.</em>"
    );
  }

  // Before screenshot
  if (entry.beforeScreenshotPath) {
    const pngPath = entry.path.replace(/\.html$/, ".png");
    copyFile(
      entry.beforeScreenshotPath,
      join(OUT_DIR, "screenshots/before", pngPath)
    );
  }

  // After screenshot
  if (entry.afterScreenshotPath) {
    const pngPath = entry.path.replace(/\.html$/, ".png");
    copyFile(
      entry.afterScreenshotPath,
      join(OUT_DIR, "screenshots/after", pngPath)
    );
  }

  // _after-files/dom/{path}.html  — used by Pages Functions for accept
  if (entry.afterDom !== null) {
    write(join(OUT_DIR, "_after-files/dom", entry.path), entry.afterDom);
  }

  // _after-files/screenshots/{path}.png
  if (entry.afterScreenshotPath) {
    const pngPath = entry.path.replace(/\.html$/, ".png");
    copyFile(
      entry.afterScreenshotPath,
      join(OUT_DIR, "_after-files/screenshots", pngPath)
    );
  }
}

// ---------------------------------------------------------------------------
// Copy Cloudflare Pages Functions
// ---------------------------------------------------------------------------

copyDir(CF_FUNCTIONS_DIR, join(OUT_DIR, "functions"));

// Move _routes.json to site root (not inside functions/)
const routesSrc = join(CF_FUNCTIONS_DIR, "_routes.json");
if (existsSync(routesSrc)) {
  write(join(OUT_DIR, "_routes.json"), readFileSync(routesSrc));
}

// ---------------------------------------------------------------------------
// index.html — SPA
// ---------------------------------------------------------------------------

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Visual Diff Review</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; height: 100vh; overflow: hidden; color: #222; background: #f5f5f5; }

    /* Sidebar */
    #sidebar { width: 280px; min-width: 280px; background: #1e1e2e; color: #cdd6f4; display: flex; flex-direction: column; overflow: hidden; }
    #sidebar-header { padding: 12px 16px; border-bottom: 1px solid #313244; }
    #sidebar-header h2 { font-size: 14px; font-weight: 600; color: #cba6f7; margin-bottom: 4px; }
    #sidebar-meta { font-size: 11px; color: #6c7086; margin-bottom: 4px; font-family: monospace; }
    #sidebar-stats { font-size: 12px; color: #a6adc8; }
    #sidebar-filters { display: flex; gap: 6px; padding: 8px 16px; border-bottom: 1px solid #313244; }
    .filter-btn { padding: 3px 10px; border-radius: 12px; border: 1px solid #45475a; background: transparent; color: #a6adc8; font-size: 12px; cursor: pointer; }
    .filter-btn.active { background: #cba6f7; color: #1e1e2e; border-color: #cba6f7; font-weight: 600; }
    #story-list { flex: 1; overflow-y: auto; }
    .story-item { padding: 10px 16px; cursor: pointer; border-bottom: 1px solid #181825; transition: background 0.1s; }
    .story-item:hover { background: #313244; }
    .story-item.active { background: #45475a; }
    .story-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .story-kind { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; margin-top: 2px; }
    .story-status { font-size: 11px; color: #a6adc8; margin-top: 1px; }
    .kind-regression { color: #f38ba8; }
    .kind-new { color: #89b4fa; }
    .kind-parity { color: #fab387; }
    .status-accepted { color: #a6e3a1 !important; }
    .status-rejected { color: #f38ba8 !important; }

    /* Main panel */
    #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    #main-header { padding: 14px 20px 10px; background: #fff; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    #main-title { font-size: 15px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #main-kind-badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
    #view-toggle { display: flex; gap: 6px; }
    .view-btn { padding: 5px 14px; border-radius: 6px; border: 1px solid #ccc; background: #f5f5f5; font-size: 13px; cursor: pointer; }
    .view-btn.active { background: #222; color: #fff; border-color: #222; }

    #main-content { flex: 1; overflow-y: auto; padding: 20px; }

    /* Screenshot area */
    #screenshot-area { position: relative; display: flex; justify-content: center; align-items: flex-start; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; min-height: 200px; margin-bottom: 16px; }
    #screenshot-area img { max-width: 100%; display: block; }
    #strobe-label { position: absolute; top: 12px; left: 12px; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 700; color: #fff; pointer-events: none; }

    /* Pixel diff layout */
    #pixel-diff-area { display: none; gap: 12px; }
    #pixel-diff-area.visible { display: flex; }
    #pixel-diff-area > div { flex: 1; }
    #pixel-diff-area img { max-width: 100%; border: 1px solid #e0e0e0; border-radius: 4px; display: block; }
    #pixel-diff-area h4 { font-size: 12px; color: #666; margin-bottom: 6px; }

    /* DOM diff */
    #dom-diff-section { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    #dom-diff-toggle { padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; border-bottom: 1px solid transparent; }
    #dom-diff-toggle:hover { background: #f8f8f8; }
    #dom-diff-toggle.open { border-bottom-color: #e0e0e0; }
    #dom-diff-content { max-height: 500px; overflow: auto; display: none; }
    #dom-diff-content.open { display: block; }

    /* Action buttons */
    #action-bar { display: flex; gap: 10px; padding: 12px 20px; background: #fff; border-top: 1px solid #e0e0e0; align-items: center; }
    .accept-btn { padding: 8px 24px; border-radius: 6px; border: none; background: #27ae60; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .accept-btn:hover:not(:disabled) { background: #219a52; }
    .accept-btn:disabled { opacity: 0.5; cursor: default; }
    .reject-btn { padding: 8px 24px; border-radius: 6px; border: 1px solid #e74c3c; background: transparent; color: #e74c3c; font-size: 14px; font-weight: 600; cursor: pointer; }
    .reject-btn:hover { background: #fdf2f2; }
    .accept-all-btn { padding: 8px 24px; border-radius: 6px; border: 1px solid #888; background: transparent; color: #555; font-size: 14px; font-weight: 600; cursor: pointer; margin-left: auto; }
    .accept-all-btn:hover:not(:disabled) { background: #f0f0f0; }
    .accept-all-btn:disabled { opacity: 0.5; cursor: default; }
    .commit-btn { padding: 8px 24px; border-radius: 6px; border: none; background: #2980b9; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .commit-btn:hover:not(:disabled) { background: #2471a3; }
    .commit-btn:disabled { opacity: 0.5; cursor: default; }
    #action-status { font-size: 13px; color: #666; }
    #action-status.error { color: #e74c3c; }

    /* Empty state */
    #empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #888; font-size: 15px; gap: 8px; }

    /* Spinner */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #555; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 6px; }
  </style>
</head>
<body>

<!-- SIDEBAR -->
<div id="sidebar">
  <div id="sidebar-header">
    <h2>Visual Diff Review</h2>
    <div id="sidebar-meta"></div>
    <div id="sidebar-stats"></div>
  </div>
  <div id="sidebar-filters">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="pending">Pending</button>
  </div>
  <div id="story-list"></div>
</div>

<!-- MAIN -->
<div id="main">
  <div id="main-header">
    <div id="main-title">Select a story</div>
    <span id="main-kind-badge"></span>
    <div id="view-toggle">
      <button class="view-btn active" data-view="strobe">Strobe</button>
      <button class="view-btn" data-view="side">Side by Side</button>
      <button class="view-btn" data-view="pixel">Pixel Diff</button>
    </div>
  </div>

  <div id="main-content">
    <div id="empty-state">
      <div>No story selected</div>
      <div style="font-size:13px;">Use ↑/↓ to navigate, A to accept, R to reject</div>
    </div>

    <!-- Strobe view -->
    <div id="strobe-view" style="display:none;">
      <div id="screenshot-area">
        <div id="strobe-container" style="position:relative;display:inline-block;max-width:100%;">
          <img id="img-after" style="display:block;max-width:100%;" />
          <img id="img-before" style="position:absolute;top:0;left:0;max-width:100%;display:block;" />
        </div>
        <div id="strobe-label" style="background:#222;">After</div>
      </div>
    </div>

    <!-- Side by side view -->
    <div id="side-view" style="display:none;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <h4 style="font-size:12px;color:#666;margin:0 0 6px;">Before (baseline)</h4>
          <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:12px;min-height:80px;display:flex;align-items:flex-start;justify-content:center;">
            <img id="sbs-before" style="max-width:100%;display:block;" />
            <div id="sbs-no-before" style="color:#aaa;font-size:13px;padding:32px;display:none;">No baseline</div>
          </div>
        </div>
        <div>
          <h4 style="font-size:12px;color:#666;margin:0 0 6px;">After (current)</h4>
          <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:12px;min-height:80px;display:flex;align-items:flex-start;justify-content:center;">
            <img id="sbs-after" style="max-width:100%;display:block;" />
          </div>
        </div>
      </div>
    </div>

    <!-- Pixel diff view -->
    <div id="pixel-diff-view" style="display:none;">
      <div id="pixel-diff-area">
        <div>
          <h4>After</h4>
          <img id="pd-after" />
        </div>
        <div>
          <h4>Pixel diff (changed pixels in red)</h4>
          <img id="pd-diff" />
          <div id="diff-percent-badge" style="margin-top:8px;display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;background:#e74c3c;color:#fff;"></div>
        </div>
      </div>
      <div id="no-pixel-diff" style="color:#888;font-size:14px;padding:16px 0;display:none;">
        No pixel diff available (images may be missing).
      </div>
    </div>

    <!-- DOM diff -->
    <div id="dom-diff-section">
      <div id="dom-diff-toggle">
        <span id="dom-diff-arrow">▶</span> DOM Diff
      </div>
      <div id="dom-diff-content"></div>
    </div>
  </div>

  <div id="action-bar">
    <button class="accept-btn" id="btn-accept">✓ Accept</button>
    <button class="reject-btn" id="btn-reject">✗ Reject</button>
    <span id="action-status"></span>
    <button class="accept-all-btn" id="btn-accept-all">Accept All Pending</button>
    <button class="commit-btn" id="btn-commit" disabled>⬆ Commit Accepted</button>
  </div>
</div>

<script>
  let allDiffs = [];
  let meta = { repo: '', branch: '', sha: '' };
  let currentPath = null;
  let currentView = 'strobe';
  let filter = 'all';
  let strobeInterval = null;
  let strobePhase = 'after';
  let hasUncommittedAccepts = false;

  const domDiffCache = {};

  function screenshotUrl(which, path) {
    const pngPath = path.replace(/\\.html$/, '.png');
    return '/screenshots/' + which + '/' + pngPath;
  }

  async function init() {
    const [diffsRes, metaRes] = await Promise.all([
      fetch('/data/diffs.json'),
      fetch('/data/meta.json'),
    ]);
    allDiffs = await diffsRes.json();
    meta = await metaRes.json();

    const metaEl = document.getElementById('sidebar-meta');
    const shortSha = meta.sha.slice(0, 8);
    metaEl.textContent = meta.branch + ' @ ' + shortSha;

    renderSidebar();
    if (allDiffs.length > 0) selectStory(allDiffs[0].path);
  }

  function filteredDiffs() {
    if (filter === 'pending') return allDiffs.filter(d => d.status === 'pending');
    return allDiffs;
  }

  function renderSidebar() {
    const pending = allDiffs.filter(d => d.status === 'pending').length;
    document.getElementById('sidebar-stats').textContent =
      pending + ' pending / ' + allDiffs.length + ' total';

    const list = document.getElementById('story-list');
    list.innerHTML = '';
    const items = filteredDiffs();
    if (items.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:#585b70;font-size:13px;">No items</div>';
      return;
    }
    for (const d of items) {
      const el = document.createElement('div');
      el.className = 'story-item' + (d.path === currentPath ? ' active' : '');
      el.dataset.path = d.path;
      const statusText =
        d.status === 'accepted' ? '✓ accepted' :
        d.status === 'rejected' ? '✗ rejected' : 'pending';
      const statusClass = d.status === 'accepted' ? 'status-accepted' : d.status === 'rejected' ? 'status-rejected' : '';
      el.innerHTML =
        '<div class="story-name">' + escHtml(d.path) + '</div>' +
        '<div class="story-kind kind-' + d.kind + '">' + d.kind.toUpperCase() + '</div>' +
        '<div class="story-status ' + statusClass + '">' + statusText +
          (d.diffPercent !== null ? ' · ' + d.diffPercent.toFixed(2) + '% px' : '') + '</div>';
      el.addEventListener('click', () => selectStory(d.path));
      list.appendChild(el);
    }
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function stopStrobe() {
    if (strobeInterval) { clearInterval(strobeInterval); strobeInterval = null; }
  }

  function startStrobe(hasBefore) {
    stopStrobe();
    const imgAfter = document.getElementById('img-after');
    const imgBefore = document.getElementById('img-before');
    const label = document.getElementById('strobe-label');

    if (!hasBefore) {
      imgBefore.style.opacity = '0';
      label.textContent = 'After (new)';
      label.style.background = '#3498db';
      return;
    }

    strobePhase = 'after';
    imgBefore.style.opacity = '0';
    label.textContent = 'After';
    label.style.background = '#27ae60';

    strobeInterval = setInterval(() => {
      strobePhase = strobePhase === 'after' ? 'before' : 'after';
      if (strobePhase === 'after') {
        imgBefore.style.opacity = '0';
        label.textContent = 'After';
        label.style.background = '#27ae60';
      } else {
        imgBefore.style.opacity = '1';
        label.textContent = 'Before';
        label.style.background = '#e74c3c';
      }
    }, 500);
  }

  async function selectStory(path) {
    currentPath = path;
    stopStrobe();
    setActionStatus('');

    document.querySelectorAll('.story-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === path);
    });

    const entry = allDiffs.find(d => d.path === path);
    if (!entry) return;

    document.getElementById('main-title').textContent = path;
    const badge = document.getElementById('main-kind-badge');
    badge.textContent = entry.kind.toUpperCase();
    const kindColors = { regression: '#e74c3c', new: '#3498db', parity: '#e67e22' };
    const color = kindColors[entry.kind] || '#888';
    badge.style.cssText = 'background:' + color + '22;color:' + color + ';border:1px solid ' + color + ';border-radius:12px;padding:2px 10px;font-size:11px;font-weight:700;';

    document.getElementById('empty-state').style.display = 'none';
    renderCurrentView(entry);
    await loadDomDiff(path);
  }

  function renderCurrentView(entry) {
    document.getElementById('strobe-view').style.display = 'none';
    document.getElementById('side-view').style.display = 'none';
    document.getElementById('pixel-diff-view').style.display = 'none';
    stopStrobe();

    if (currentView === 'strobe') {
      document.getElementById('strobe-view').style.display = 'block';
      renderStrobe(entry);
    } else if (currentView === 'side') {
      document.getElementById('side-view').style.display = 'block';
      renderSideBySide(entry);
    } else {
      document.getElementById('pixel-diff-view').style.display = 'block';
      renderPixelDiff(entry);
    }
  }

  function renderSideBySide(entry) {
    const sbsBefore = document.getElementById('sbs-before');
    const sbsAfter = document.getElementById('sbs-after');
    const noBefore = document.getElementById('sbs-no-before');

    sbsAfter.src = screenshotUrl('after', entry.path);
    if (entry.kind !== 'new') {
      sbsBefore.src = screenshotUrl('before', entry.path);
      sbsBefore.style.display = 'block';
      noBefore.style.display = 'none';
    } else {
      sbsBefore.src = '';
      sbsBefore.style.display = 'none';
      noBefore.style.display = 'block';
    }
  }

  function renderStrobe(entry) {
    const imgAfter = document.getElementById('img-after');
    const imgBefore = document.getElementById('img-before');

    imgAfter.src = screenshotUrl('after', entry.path);
    if (entry.kind !== 'new') {
      imgBefore.src = screenshotUrl('before', entry.path);
      imgBefore.style.display = 'block';
      startStrobe(true);
    } else {
      imgBefore.style.display = 'none';
      imgBefore.src = '';
      startStrobe(false);
    }
  }

  function renderPixelDiff(entry) {
    const pdAfter = document.getElementById('pd-after');
    const pdDiff = document.getElementById('pd-diff');
    const badge = document.getElementById('diff-percent-badge');
    const noPixel = document.getElementById('no-pixel-diff');
    const area = document.getElementById('pixel-diff-area');

    pdAfter.src = screenshotUrl('after', entry.path);

    if (entry.diffPercent !== null) {
      pdDiff.src = screenshotUrl('diff', entry.path);
      pdDiff.style.display = 'block';
      badge.textContent = entry.diffPercent.toFixed(3) + '% changed';
      badge.style.display = 'inline-block';
      area.style.display = 'flex';
      noPixel.style.display = 'none';
    } else if (entry.kind === 'new') {
      pdDiff.src = '';
      pdDiff.style.display = 'none';
      badge.textContent = 'New (no baseline)';
      badge.style.display = 'inline-block';
      area.style.display = 'flex';
      noPixel.style.display = 'none';
    } else {
      area.style.display = 'none';
      noPixel.style.display = 'block';
    }
  }

  async function loadDomDiff(path) {
    const content = document.getElementById('dom-diff-content');
    if (domDiffCache[path] !== undefined) {
      content.innerHTML = domDiffCache[path];
      return;
    }
    content.innerHTML = '<div style="padding:12px;color:#888;font-size:13px;">Loading...</div>';
    try {
      const res = await fetch('/data/dom-diffs/' + path);
      const html = res.ok ? await res.text() : '<em style="color:#aaa;">DOM diff unavailable.</em>';
      domDiffCache[path] = html;
      content.innerHTML = html;
    } catch {
      content.innerHTML = '<em style="color:#aaa;">Failed to load DOM diff.</em>';
    }
  }

  function setActionStatus(msg, isError) {
    const el = document.getElementById('action-status');
    el.textContent = msg;
    el.className = isError ? 'error' : '';
  }

  function setAcceptBusy(busy) {
    document.getElementById('btn-accept').disabled = busy;
    document.getElementById('btn-accept-all').disabled = busy;
    document.getElementById('btn-commit').disabled = busy || !hasUncommittedAccepts;
    if (busy) {
      document.getElementById('action-status').innerHTML = '<span class="spinner"></span>Committing...';
    }
  }

  function updateCommitBtn() {
    document.getElementById('btn-commit').disabled = !hasUncommittedAccepts;
  }

  function acceptCurrent() {
    if (!currentPath) return;
    const entry = allDiffs.find(d => d.path === currentPath);
    if (!entry || entry.status === 'accepted') return;
    entry.status = 'accepted';
    hasUncommittedAccepts = true;
    setActionStatus('Accepted (local only)');
    renderSidebar();
    updateCommitBtn();
  }

  function rejectCurrent() {
    if (!currentPath) return;
    const entry = allDiffs.find(d => d.path === currentPath);
    if (entry) {
      entry.status = 'rejected';
      setActionStatus('Rejected (local only)');
      renderSidebar();
    }
  }

  function acceptAll() {
    const pending = allDiffs.filter(d => d.status === 'pending');
    if (pending.length === 0) return;
    for (const d of pending) d.status = 'accepted';
    hasUncommittedAccepts = true;
    setActionStatus('Accepted ' + pending.length + ' diff(s) locally');
    renderSidebar();
    updateCommitBtn();
  }

  async function commitAccepted() {
    const acceptedEntries = allDiffs.filter(d => d.status === 'accepted');
    if (acceptedEntries.length === 0) return;

    // Cloudflare Workers cap each invocation at 50 outgoing subrequests
    // (free plan). The Worker spends 5–7 on fixed Git data API calls and
    // 1 blob-create per accepted screenshot, so a single /api/commit
    // beyond ~42 entries trips the limit. Chunk the accepts and let the
    // Worker make one commit per chunk on top of the previous chunk's
    // HEAD — final result is a small commit chain instead of one.
    const CHUNK_SIZE = 25;

    setAcceptBusy(true);
    try {
      // Phase 1: fetch file contents in the browser (avoids Worker subrequest limit)
      document.getElementById('action-status').innerHTML =
        '<span class="spinner"></span>Fetching ' + acceptedEntries.length + ' file(s)...';
      const domContents = {};
      const screenshotContents = {};
      await Promise.all(acceptedEntries.map(async (entry) => {
        const pngPath = entry.path.replace(/\\.html$/, '.png');
        const [domRes, screenshotRes] = await Promise.all([
          fetch('/_after-files/dom/' + entry.path),
          fetch('/_after-files/screenshots/' + pngPath),
        ]);
        if (domRes.ok) domContents[entry.path] = await domRes.text();
        if (screenshotRes.ok) screenshotContents[pngPath] = arrayBufferToBase64(await screenshotRes.arrayBuffer());
      }));

      // Phase 2: send to Worker for committing, chunked.
      const chunks = [];
      for (let i = 0; i < acceptedEntries.length; i += CHUNK_SIZE) {
        chunks.push(acceptedEntries.slice(i, i + CHUNK_SIZE));
      }

      let totalAccepted = 0;
      let lastCommitSha = '';
      const allErrors = [];
      const allWarnings = [];

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const isLastChunk = ci === chunks.length - 1;
        const chunkDom = {};
        const chunkScreens = {};
        for (const entry of chunk) {
          if (domContents[entry.path] != null) chunkDom[entry.path] = domContents[entry.path];
          const pngPath = entry.path.replace(/\\.html$/, '.png');
          if (screenshotContents[pngPath] != null) chunkScreens[pngPath] = screenshotContents[pngPath];
        }

        const label = chunks.length > 1 ? ' (' + (ci + 1) + '/' + chunks.length + ')' : '';
        document.getElementById('action-status').innerHTML =
          '<span class="spinner"></span>Committing' + label + '...';

        const res = await fetch('/api/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paths: chunk.map(e => e.path),
            domContents: chunkDom,
            screenshotContents: chunkScreens,
            repo: meta.repo,
            branch: meta.snapshotBranch,
            // Only run post-commit actions (CI rerun + status update) once,
            // after the final chunk lands.
            runId: isLastChunk ? meta.runId : undefined,
            headSha: isLastChunk ? meta.sha : undefined,
          }),
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          const text = await res.text();
          setActionStatus('Server error (' + res.status + ') on chunk ' + (ci + 1) + '/' + chunks.length + ': expected JSON but got ' + ct.split(';')[0].trim() + '. Check that the review site was built and deployed with the latest functions.', true);
          console.error('/api/commit non-JSON response:', text.slice(0, 500));
          return;
        }
        const data = await res.json();
        if (res.status === 401) {
          setActionStatus('Token expired — GITHUB_TOKEN is invalid or revoked.', true);
          return;
        }
        if (!res.ok || !data.ok) {
          setActionStatus('Error on chunk ' + (ci + 1) + '/' + chunks.length + ': ' + (data.error || 'Unknown error'), true);
          return;
        }
        totalAccepted += data.accepted || 0;
        lastCommitSha = data.commitSha || lastCommitSha;
        if (data.errors && data.errors.length) allErrors.push(...data.errors);
        if (data.postCommitWarnings && data.postCommitWarnings.length) allWarnings.push(...data.postCommitWarnings);
      }

      hasUncommittedAccepts = false;
      const warnings = allWarnings.join('; ');
      const commitsNote = chunks.length > 1 ? ' over ' + chunks.length + ' commits' : '';
      const msg = 'Committed ' + totalAccepted + ' diff(s)' + commitsNote + ': ' + (lastCommitSha || '').slice(0, 8) +
        (allErrors.length ? ' (' + allErrors.length + ' errors)' : '') +
        (warnings ? ' — warnings: ' + warnings : '');
      setActionStatus(msg, allErrors.length > 0 || Boolean(warnings));
      renderSidebar();
      updateCommitBtn();
    } catch (e) {
      setActionStatus('Error: ' + String(e), true);
    } finally {
      setAcceptBusy(false);
    }
  }

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const entry = allDiffs.find(d => d.path === currentPath);
      if (entry) renderCurrentView(entry);
    });
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSidebar();
    });
  });

  // Action buttons
  document.getElementById('btn-accept').addEventListener('click', acceptCurrent);
  document.getElementById('btn-reject').addEventListener('click', rejectCurrent);
  document.getElementById('btn-accept-all').addEventListener('click', acceptAll);
  document.getElementById('btn-commit').addEventListener('click', commitAccepted);

  // DOM diff toggle
  document.getElementById('dom-diff-toggle').addEventListener('click', () => {
    const content = document.getElementById('dom-diff-content');
    const arrow = document.getElementById('dom-diff-arrow');
    const toggle = document.getElementById('dom-diff-toggle');
    const isOpen = content.classList.contains('open');
    content.classList.toggle('open', !isOpen);
    toggle.classList.toggle('open', !isOpen);
    arrow.textContent = isOpen ? '▶' : '▼';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const items = filteredDiffs();
    const idx = items.findIndex(d => d.path === currentPath);
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const next = items[Math.min(idx + 1, items.length - 1)];
      if (next) selectStory(next.path);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const prev = items[Math.max(idx - 1, 0)];
      if (prev) selectStory(prev.path);
    } else if (e.key === 'a' || e.key === 'A') {
      acceptCurrent();
    } else if (e.key === 'r' || e.key === 'R') {
      rejectCurrent();
    }
  });

  init();
</script>
</body>
</html>`;

write(join(OUT_DIR, "index.html"), html);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nReview site built at: ${OUT_DIR}`);
console.log(
  `  index.html, data/diffs.json, data/meta.json, ${diffs.length} dom-diffs`
);
const screenshotCount = diffs.filter((d) => d.afterScreenshotPath).length;
console.log(`  ${screenshotCount} before/after screenshots, functions/ copied`);
console.log(
  `\nTo test locally:\n  npx wrangler pages dev ${OUT_DIR} --functions-dir ${OUT_DIR}/functions`
);
