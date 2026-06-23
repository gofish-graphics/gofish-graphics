/**
 * Interactive visual diff review server.
 *
 * Starts an HTTP server on port 3005 with a SPA for reviewing visual diffs.
 * Supports accept/reject per story and bulk accept-all.
 *
 * Usage: tsx scripts/review-server.ts
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import {
  collectDiffs,
  acceptStory,
  formatDomDiff,
  ROOT,
  type DiffEntry,
} from "./diff-utils.js";
import { computePixelDiff, type PixelDiffResult } from "./pixel-diff.js";
import {
  getSnapshotBranchName,
  pullSnapshots,
  commitAndPushSnapshots,
} from "./snapshot-branch.js";

const PORT = 3005;

// ---------------------------------------------------------------------------
// Pull baselines from the snapshot branch before loading diffs
// ---------------------------------------------------------------------------

pullSnapshots(getSnapshotBranchName(), join(ROOT, "__snapshots__"));

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const diffs: DiffEntry[] = collectDiffs();
/** path → pixel diff result */
const pixelDiffs = new Map<string, PixelDiffResult | null>();

console.log(`Collected ${diffs.length} diff(s). Computing pixel diffs...`);

for (const entry of diffs) {
  if (entry.beforeScreenshotPath && entry.afterScreenshotPath) {
    const result = computePixelDiff(
      entry.beforeScreenshotPath,
      entry.afterScreenshotPath
    );
    pixelDiffs.set(entry.path, result);
    if (result !== null) {
      entry.diffPercent = result.diffPercent;
    }
  } else {
    pixelDiffs.set(entry.path, null);
  }
}

console.log("Pixel diffs computed.");

function findEntry(path: string): DiffEntry | undefined {
  return diffs.find((d) => d.path === path);
}

// ---------------------------------------------------------------------------
// URL routing helpers
// ---------------------------------------------------------------------------

function respond(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer
): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function respondJson(res: ServerResponse, data: unknown): void {
  respond(res, 200, "application/json", JSON.stringify(data));
}

function respondError(res: ServerResponse, status: number, msg: string): void {
  respond(res, status, "application/json", JSON.stringify({ error: msg }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

function handleGetDiffs(res: ServerResponse): void {
  respondJson(
    res,
    diffs.map((d) => ({
      path: d.path,
      kind: d.kind,
      status: d.status,
      diffPercent: d.diffPercent,
    }))
  );
}

function handleGetDiff(res: ServerResponse, path: string): void {
  const entry = findEntry(path);
  if (!entry) return respondError(res, 404, "Not found");
  respondJson(res, {
    path: entry.path,
    kind: entry.kind,
    status: entry.status,
    diffPercent: entry.diffPercent,
    beforeDom: entry.beforeDom,
    afterDom: entry.afterDom,
  });
}

function handleGetScreenshot(
  res: ServerResponse,
  which: string,
  path: string
): void {
  if (which === "diff") {
    const result = pixelDiffs.get(path);
    if (!result) return respondError(res, 404, "No pixel diff available");
    respond(res, 200, "image/png", result.diffPng);
    return;
  }

  const entry = findEntry(path);
  if (!entry) return respondError(res, 404, "Not found");

  const imgPath =
    which === "before" ? entry.beforeScreenshotPath : entry.afterScreenshotPath;

  if (!imgPath || !existsSync(imgPath)) {
    return respondError(res, 404, "Screenshot not found");
  }

  try {
    const buf = readFileSync(imgPath);
    respond(res, 200, "image/png", buf);
  } catch {
    respondError(res, 500, "Failed to read screenshot");
  }
}

function handleGetDomDiff(res: ServerResponse, path: string): void {
  const entry = findEntry(path);
  if (!entry) return respondError(res, 404, "Not found");
  if (!entry.beforeDom || !entry.afterDom) {
    respond(res, 200, "text/html", "<em>No DOM diff available.</em>");
    return;
  }
  const html = formatDomDiff(entry.beforeDom, entry.afterDom);
  respond(res, 200, "text/html", html);
}

function handleAccept(res: ServerResponse, path: string): void {
  const entry = findEntry(path);
  if (!entry) return respondError(res, 404, "Not found");
  try {
    acceptStory(path);
    entry.status = "accepted";
    respondJson(res, { ok: true });
  } catch (e) {
    respondError(res, 500, String(e));
  }
}

function handleReject(res: ServerResponse, path: string): void {
  const entry = findEntry(path);
  if (!entry) return respondError(res, 404, "Not found");
  entry.status = "rejected";
  respondJson(res, { ok: true });
}

function handleAcceptAll(res: ServerResponse): void {
  const errors: string[] = [];
  for (const entry of diffs) {
    if (entry.status === "pending") {
      try {
        acceptStory(entry.path);
        entry.status = "accepted";
      } catch (e) {
        errors.push(`${entry.path}: ${String(e)}`);
      }
    }
  }
  respondJson(res, { ok: errors.length === 0, errors });
}

function handleCommitToBranch(res: ServerResponse): void {
  const accepted = diffs.filter((d) => d.status === "accepted");
  if (accepted.length === 0) {
    respondJson(res, { ok: false, error: "No accepted stories to commit." });
    return;
  }
  try {
    const snapBranch = getSnapshotBranchName();
    commitAndPushSnapshots(
      snapBranch,
      join(ROOT, "__snapshots__"),
      `Accept ${accepted.length} visual diff(s)`
    );
    respondJson(res, {
      ok: true,
      committed: accepted.length,
      branch: snapBranch,
    });
  } catch (e) {
    respondError(res, 500, String(e));
  }
}

// ---------------------------------------------------------------------------
// SPA HTML
// ---------------------------------------------------------------------------

function serveApp(res: ServerResponse): void {
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
    #sidebar-header h2 { font-size: 14px; font-weight: 600; color: #cba6f7; margin-bottom: 6px; }
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
    #diff-percent-badge { position: absolute; top: 12px; right: 12px; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 700; background: #e74c3c; color: #fff; }

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
    #action-bar { display: flex; gap: 10px; padding: 12px 20px; background: #fff; border-top: 1px solid #e0e0e0; }
    .accept-btn { padding: 8px 24px; border-radius: 6px; border: none; background: #27ae60; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .accept-btn:hover { background: #219a52; }
    .reject-btn { padding: 8px 24px; border-radius: 6px; border: 1px solid #e74c3c; background: transparent; color: #e74c3c; font-size: 14px; font-weight: 600; cursor: pointer; }
    .reject-btn:hover { background: #fdf2f2; }
    .accept-all-btn { padding: 8px 24px; border-radius: 6px; border: 1px solid #888; background: transparent; color: #555; font-size: 14px; font-weight: 600; cursor: pointer; margin-left: auto; }
    .accept-all-btn:hover { background: #f0f0f0; }
    .commit-btn { padding: 8px 24px; border-radius: 6px; border: none; background: #2980b9; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    .commit-btn:hover:not(:disabled) { background: #2471a3; }
    .commit-btn:disabled { opacity: 0.5; cursor: default; }
    #action-status { font-size: 13px; color: #666; }
    #action-status.error { color: #e74c3c; }

    /* Empty state */
    #empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #888; font-size: 15px; gap: 8px; }

    /* Strobe animation styles */
    @keyframes strobeAfter { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
    @keyframes strobeBefore { 0%,49% { opacity:0; } 50%,100% { opacity:1; } }
  </style>
</head>
<body>

<!-- SIDEBAR -->
<div id="sidebar">
  <div id="sidebar-header">
    <h2>Visual Diff Review</h2>
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
          <div id="diff-percent-badge" style="margin-top:8px;display:inline-block;"></div>
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
    <button class="commit-btn" id="btn-commit" disabled>⬆ Commit to Branch</button>
  </div>
</div>

<script>
  let allDiffs = [];
  let currentPath = null;
  let currentView = 'strobe';
  let filter = 'all';
  let strobeInterval = null;
  let strobePhase = 'after'; // 'before' | 'after'
  let hasUncommittedAccepts = false;

  // Cached DOM diff HTML per path
  const domDiffCache = {};

  function setActionStatus(msg, isError) {
    const el = document.getElementById('action-status');
    el.textContent = msg;
    el.className = isError ? 'error' : '';
  }

  function updateCommitBtn() {
    document.getElementById('btn-commit').disabled = !hasUncommittedAccepts;
  }

  async function fetchDiffs() {
    const res = await fetch('/api/diffs');
    allDiffs = await res.json();
  }

  function pixelPercent(d) {
    return d.diffPercent === null ? -Infinity : d.diffPercent;
  }

  function sortByPixelPercentDesc(diffs) {
    return [...diffs].sort((a, b) => {
      const byPixelPercent = pixelPercent(b) - pixelPercent(a);
      if (byPixelPercent !== 0) return byPixelPercent;
      return a.path.localeCompare(b.path);
    });
  }

  function filteredDiffs() {
    const items = filter === 'pending'
      ? allDiffs.filter(d => d.status === 'pending')
      : allDiffs;
    return sortByPixelPercentDesc(items);
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

    // Show after first
    strobePhase = 'after';
    imgAfter.style.animation = 'none';
    imgBefore.style.animation = 'none';
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

    // Update sidebar highlight
    document.querySelectorAll('.story-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === path);
    });

    const entry = allDiffs.find(d => d.path === path);
    if (!entry) return;

    // Header
    document.getElementById('main-title').textContent = path;
    const badge = document.getElementById('main-kind-badge');
    badge.textContent = entry.kind.toUpperCase();
    const kindColors = { regression: '#e74c3c', new: '#3498db', parity: '#e67e22' };
    badge.style.background = (kindColors[entry.kind] || '#888') + '22';
    badge.style.color = kindColors[entry.kind] || '#888';
    badge.style.border = '1px solid ' + (kindColors[entry.kind] || '#888');
    badge.style.borderRadius = '12px';
    badge.style.padding = '2px 10px';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '700';

    document.getElementById('empty-state').style.display = 'none';

    // Show views
    renderCurrentView(entry);

    // Load DOM diff (lazy)
    await loadDomDiff(path, entry);
  }

  function renderCurrentView(entry) {
    const strobeView = document.getElementById('strobe-view');
    const sideView = document.getElementById('side-view');
    const pixelView = document.getElementById('pixel-diff-view');

    strobeView.style.display = 'none';
    sideView.style.display = 'none';
    pixelView.style.display = 'none';
    stopStrobe();

    if (currentView === 'strobe') {
      strobeView.style.display = 'block';
      renderStrobe(entry);
    } else if (currentView === 'side') {
      sideView.style.display = 'block';
      renderSideBySide(entry);
    } else {
      pixelView.style.display = 'block';
      renderPixelDiff(entry);
    }
  }

  function renderSideBySide(entry) {
    const sbsBefore = document.getElementById('sbs-before');
    const sbsAfter = document.getElementById('sbs-after');
    const noBefore = document.getElementById('sbs-no-before');

    sbsAfter.src = '/api/screenshot/after/' + encodeURIComponent(entry.path);
    if (entry.kind !== 'new') {
      sbsBefore.src = '/api/screenshot/before/' + encodeURIComponent(entry.path);
      sbsBefore.style.display = 'block';
      noBefore.style.display = 'none';
    } else {
      sbsBefore.src = '';
      sbsBefore.style.display = 'none';
      noBefore.style.display = 'block';
    }
  }

  function ts(path) { return path + '?t=' + Date.now(); }

  function renderStrobe(entry) {
    const imgAfter = document.getElementById('img-after');
    const imgBefore = document.getElementById('img-before');

    imgAfter.src = '/api/screenshot/after/' + encodeURIComponent(entry.path);
    if (entry.kind !== 'new') {
      imgBefore.src = '/api/screenshot/before/' + encodeURIComponent(entry.path);
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

    pdAfter.src = '/api/screenshot/after/' + encodeURIComponent(entry.path);

    if (entry.diffPercent !== null) {
      pdDiff.src = '/api/screenshot/diff/' + encodeURIComponent(entry.path);
      badge.textContent = entry.diffPercent.toFixed(3) + '% changed';
      area.style.display = 'flex';
      noPixel.style.display = 'none';
    } else {
      area.style.display = entry.kind === 'new' ? 'flex' : 'none';
      if (entry.kind === 'new') {
        pdDiff.src = '';
        pdDiff.style.display = 'none';
        badge.textContent = 'New (no baseline)';
        area.style.display = 'flex';
        noPixel.style.display = 'none';
      } else {
        noPixel.style.display = 'block';
      }
    }
  }

  async function loadDomDiff(path, entry) {
    const content = document.getElementById('dom-diff-content');
    if (domDiffCache[path] !== undefined) {
      content.innerHTML = domDiffCache[path];
      return;
    }
    content.innerHTML = '<div style="padding:12px;color:#888;font-size:13px;">Loading...</div>';
    const res = await fetch('/api/dom-diff/' + encodeURIComponent(path));
    const html = await res.text();
    domDiffCache[path] = html;
    content.innerHTML = html;
  }

  async function acceptCurrent() {
    if (!currentPath) return;
    await fetch('/api/accept/' + encodeURIComponent(currentPath), { method: 'POST' });
    const entry = allDiffs.find(d => d.path === currentPath);
    if (entry) entry.status = 'accepted';
    hasUncommittedAccepts = true;
    setActionStatus('Accepted (not yet committed)');
    renderSidebar();
    updateCommitBtn();
  }

  async function rejectCurrent() {
    if (!currentPath) return;
    await fetch('/api/reject/' + encodeURIComponent(currentPath), { method: 'POST' });
    const entry = allDiffs.find(d => d.path === currentPath);
    if (entry) entry.status = 'rejected';
    renderSidebar();
  }

  async function acceptAll() {
    await fetch('/api/accept-all', { method: 'POST' });
    for (const d of allDiffs) {
      if (d.status === 'pending') d.status = 'accepted';
    }
    hasUncommittedAccepts = true;
    setActionStatus('Accepted all pending (not yet committed)');
    renderSidebar();
    updateCommitBtn();
  }

  async function commitToBranch() {
    document.getElementById('btn-commit').disabled = true;
    setActionStatus('Committing...');
    try {
      const res = await fetch('/api/commit-to-branch', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionStatus('Error: ' + (data.error || 'Unknown error'), true);
        updateCommitBtn();
      } else {
        hasUncommittedAccepts = false;
        setActionStatus('Committed ' + data.committed + ' diff(s) to ' + data.branch);
        updateCommitBtn();
      }
    } catch (e) {
      setActionStatus('Error: ' + String(e), true);
      updateCommitBtn();
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
  document.getElementById('btn-commit').addEventListener('click', commitToBranch);

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

  // Init
  async function init() {
    await fetchDiffs();
    renderSidebar();
    const first = filteredDiffs()[0];
    if (first) selectStory(first.path);
  }

  init();
</script>
</body>
</html>`;
  respond(res, 200, "text/html; charset=utf-8", html);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method ?? "GET";

  // Decode path param from URL (everything after the prefix)
  function extractPath(prefix: string): string {
    return decodeURIComponent(pathname.slice(prefix.length));
  }

  if (method === "GET" && pathname === "/") return serveApp(res);
  if (method === "GET" && pathname === "/api/diffs") return handleGetDiffs(res);

  if (method === "GET" && pathname.startsWith("/api/diff/")) {
    return handleGetDiff(res, extractPath("/api/diff/"));
  }

  if (method === "GET" && pathname.startsWith("/api/screenshot/")) {
    // /api/screenshot/:which/:path
    const rest = pathname.slice("/api/screenshot/".length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) return respondError(res, 400, "Bad request");
    const which = rest.slice(0, slashIdx);
    const path = decodeURIComponent(rest.slice(slashIdx + 1));
    return handleGetScreenshot(res, which, path);
  }

  if (method === "GET" && pathname.startsWith("/api/dom-diff/")) {
    return handleGetDomDiff(res, extractPath("/api/dom-diff/"));
  }

  if (method === "POST" && pathname === "/api/accept-all") {
    return handleAcceptAll(res);
  }

  if (method === "POST" && pathname === "/api/commit-to-branch") {
    return handleCommitToBranch(res);
  }

  if (method === "POST" && pathname.startsWith("/api/accept/")) {
    return handleAccept(res, extractPath("/api/accept/"));
  }

  if (method === "POST" && pathname.startsWith("/api/reject/")) {
    return handleReject(res, extractPath("/api/reject/"));
  }

  respondError(res, 404, "Not found");
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const server = createServer(handleRequest);

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nReview server running at ${url}`);
  console.log("Keyboard shortcuts: ↑/↓ navigate, A accept, R reject\n");

  // Auto-open browser
  const cmd =
    process.platform === "darwin"
      ? `open ${url}`
      : process.platform === "win32"
        ? `start ${url}`
        : `xdg-open ${url}`;
  exec(cmd, () => {});
});
