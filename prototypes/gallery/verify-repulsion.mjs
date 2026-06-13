// Throwaway verification for the refined pointer-repulsion rules.
// Run: node prototypes/gallery/verify-repulsion.mjs   (from repo root)
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);
const url = "file://" + join(here, "index.html");
const out = join(here, "shots");

const browser = await chromium.launch();
const errors = [];

async function newPage() {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  // visible-silhouette horizontal extent (ignores the transparent viewBox padding)
  await page.addInitScript(() => {
    window.silhouetteX = (el) => {
      const svg = el.querySelector("svg");
      if (!svg) {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }
      let left = Infinity,
        right = -Infinity;
      for (const g of svg.querySelectorAll("path,circle")) {
        const r = g.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      }
      if (!isFinite(left)) {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }
      return { left, right };
    };
  });
  await page.goto(url, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__galleryReady, null, { timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

// The .figure box now carries transparent horizontal padding (the widened
// viewBox that keeps a leaning arm from being clipped — see figureSVG), so the
// raw box is NO LONGER the figure's footprint. Horizontal overlap/clearance
// must be judged against the visible SILHOUETTE: the union of the rendered
// path/circle bboxes. Vertical extent is unaffected (padding is horizontal), so
// top/bottom still come from the box. silhouetteX is injected into page scope
// (see newPage's addInitScript) so every evaluate below can use it.

// snapshot of figures + frames in client coords, with stable DOM indices.
const readGeom = (page) =>
  page.evaluate(() => {
    const figs = [...document.querySelectorAll(".figure")].map((el, i) => {
      const r = el.getBoundingClientRect();
      const s = window.silhouetteX(el);
      return {
        i,
        cx: (s.left + s.right) / 2,
        left: s.left,
        right: s.right,
        top: r.top,
        bottom: r.bottom,
        w: r.width,
      };
    });
    const frames = [...document.querySelectorAll(".frame")].map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        i,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        cx: (r.left + r.right) / 2,
        cy: (r.top + r.bottom) / 2,
        w: r.width,
      };
    });
    return { figs, frames, vw: window.innerWidth };
  });
const figById = (page, i) =>
  page.evaluate((i) => {
    const el = document.querySelectorAll(".figure")[i];
    const r = el.getBoundingClientRect();
    const s = window.silhouetteX(el); // visible silhouette, not the padded box
    return {
      cx: (s.left + s.right) / 2,
      left: s.left,
      right: s.right,
      top: r.top,
      bottom: r.bottom,
    };
  }, i);

// ---------- CASE (a): high on the wall above a figure → no movement ----------
{
  const page = await newPage();
  const { figs, frames } = await readGeom(page);
  const fr = frames
    .filter((f) => f.w > 0 && f.right > 0 && f.left < 1600)
    .sort((a, b) => a.left - b.left);
  // find a horizontal COLUMN GAP (no frame covers it) that has a figure within
  // repulsion radius — that figure is the one we must NOT scatter from above.
  const RADIUS = 172;
  let gapX = null,
    near = null;
  for (let k = 0; k < fr.length - 1; k++) {
    const x = (fr[k].right + fr[k + 1].left) / 2;
    if (fr.some((f) => x > f.left && x < f.right)) continue; // some other column covers it
    const cand = figs
      .filter((f) => f.w > 0 && Math.abs(f.cx - x) < RADIUS)
      .sort((a, b) => Math.abs(a.cx - x) - Math.abs(b.cx - x))[0];
    if (cand) {
      gapX = x;
      near = cand;
      break;
    }
  }
  if (!gapX) {
    console.log("(a) wall   NO usable gap+figure pair found");
    await page.close();
  } else {
    const restCx = near.cx;
    const wallY = Math.max(20, near.top - 100); // well above the figure's head
    await page.mouse.move(gapX - 4, wallY);
    await page.mouse.move(gapX, wallY);
    await page.waitForTimeout(650);
    const after = await figById(page, near.i);
    const moveA = Math.abs(after.cx - restCx);
    await page.screenshot({ path: join(out, "repulsion-wall.png") });
    console.log(
      `(a) wall   pointer@gapX=${Math.round(gapX)},y=${Math.round(wallY)} nearFig.cx=${Math.round(restCx)} headY=${Math.round(near.top)} figureMoved=${moveA.toFixed(1)}px  ${moveA < 2 ? "OK (stays put)" : "FAIL (moved)"}`
    );
    await page.close();
  }
}

// ---------- CASE (b): body height near a figure → steps aside ----------
{
  const page = await newPage();
  const { figs } = await readGeom(page);
  const onscreen = figs.filter((f) => f.w > 0 && f.cx > 200 && f.cx < 1400);
  const f = onscreen[Math.floor(onscreen.length / 2)];
  const restCx = f.cx;
  const bodyY = f.bottom - 35; // lower body, below any plaque
  await page.mouse.move(restCx - 4, bodyY);
  await page.mouse.move(restCx, bodyY);
  await page.waitForTimeout(650);
  const after = await figById(page, f.i);
  const moveB = Math.abs(after.cx - restCx);
  await page.screenshot({ path: join(out, "repulsion-proximity.png") });
  console.log(
    `(b) body   pointer@x=${Math.round(restCx)},y=${Math.round(bodyY)} figureMoved=${moveB.toFixed(1)}px  ${moveB > 15 ? "OK (steps aside)" : "FAIL (no move)"}`
  );
  await page.close();
}

// ---------- CASE (c): pointer over a chart with a figure in front → clears edge ----------
{
  const page = await newPage();
  const { figs, frames } = await readGeom(page);
  // find a (figure, frame) pair where the figure's silhouette overlaps the frame
  // BOTH horizontally and vertically (the frame's bottom reaches below the head),
  // i.e. a chart the figure genuinely stands in front of — not one hanging above.
  let pick = null;
  for (const fr of frames) {
    if (fr.w <= 0 || fr.right < 0 || fr.left > 1600) continue;
    const cand = figs.find(
      (f) =>
        f.w > 0 &&
        f.right > fr.left + 6 &&
        f.left < fr.right - 6 &&
        fr.bottom > f.top + 12
    );
    if (cand) {
      pick = { fr, fig: cand };
      break;
    }
  }
  if (!pick) {
    console.log("(c) chart  NO overlapping figure/frame pair found");
  } else {
    const { fr, fig } = pick;
    // move the pointer onto the chart (frame center)
    await page.mouse.move(fr.cx - 4, fr.cy);
    await page.mouse.move(fr.cx, fr.cy);
    await page.waitForTimeout(900);
    const after = await figById(page, fig.i);
    const clearsLeft = after.right <= fr.left + 2;
    const clearsRight = after.left >= fr.right - 2;
    const ok = clearsLeft || clearsRight;
    await page.screenshot({ path: join(out, "repulsion.png") });
    console.log(
      `(c) chart  frame[${fr.i}] x=[${Math.round(fr.left)},${Math.round(fr.right)}] figRest=[${Math.round(fig.left)},${Math.round(fig.right)}] -> figNow=[${Math.round(after.left)},${Math.round(after.right)}]  ${ok ? "OK (clears frame, side=" + (clearsLeft ? "left" : "right") + ")" : "FAIL (still overlaps)"}`
    );
  }
  await page.close();
}

// Locate a 2+-stacked column that is fully on-screen and has a figure standing
// in front of its BOTTOM chart only (silhouette overlaps the bottom frame
// vertically, while the TOP frame hangs entirely above the figure's head).
// Geometry is read in client coords (same space the repulsion rules compare in).
// The packing/layout object is queried from page scope via __galleryLayout().
const findStack = (page) =>
  page.evaluate(() => {
    const cols = window.__galleryLayout();
    const frameEls = [...document.querySelectorAll(".frame")];
    const figRects = [...document.querySelectorAll(".figure")]
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        const s = window.silhouetteX(el);
        return {
          i,
          r: {
            left: s.left,
            right: s.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
          },
        };
      })
      .filter((o) => o.r.width > 0); // content-visibility guard
    const TOL = 12;
    for (const c of cols) {
      if (c.items.length < 2) continue;
      const sorted = [...c.items].sort((a, b) => a.y - b.y);
      const top = sorted[0],
        bot = sorted[sorted.length - 1];
      if (top.frameIndex < 0 || bot.frameIndex < 0) continue;
      const topR = frameEls[top.frameIndex].getBoundingClientRect();
      const botR = frameEls[bot.frameIndex].getBoundingClientRect();
      if (topR.width <= 0 || botR.width <= 0) continue;
      if (topR.left < 0 || botR.right > window.innerWidth) continue; // fully visible
      // rule 2's region is now the piece's full hung footprint (frame ∪ plaque),
      // so the TOP piece's no-move guarantee depends on its PLAQUE bottom (which
      // hangs between the rows), not just the frame bottom — use that for clearsTop
      // so we pick a figure whose head sits below the top piece's whole footprint.
      const topPlaque = frameEls[top.frameIndex].nextElementSibling;
      const topPlaqueR = topPlaque ? topPlaque.getBoundingClientRect() : topR;
      const topUnionBottom = Math.max(topR.bottom, topPlaqueR.bottom);
      for (const { i, r } of figRects) {
        const hOverlap = r.right > botR.left + 6 && r.left < botR.right - 6;
        if (!hOverlap) continue;
        const overlapsBottom = botR.bottom > r.top + TOL; // bottom reaches head
        const clearsTop = topUnionBottom <= r.top - TOL; // top piece (frame+plaque) hangs above head
        if (overlapsBottom && clearsTop) {
          const box = (x) => ({
            left: x.left,
            right: x.right,
            top: x.top,
            bottom: x.bottom,
            cx: (x.left + x.right) / 2,
            cy: (x.top + x.bottom) / 2,
          });
          return {
            topIdx: top.frameIndex,
            botIdx: bot.frameIndex,
            figI: i,
            topR: box(topR),
            botR: box(botR),
            fig: { left: r.left, right: r.right, cx: (r.left + r.right) / 2 },
          };
        }
      }
    }
    return null;
  });

// ---------- CASE (d): hover a TOP-row chart in a stacked column → figure under the BOTTOM chart only must NOT move ----------
{
  const page = await newPage();
  const pick = await findStack(page);
  if (!pick) {
    console.log("(d) toprow NO stacked column with a bottom-only figure found");
    await page.close();
  } else {
    const restCx = pick.fig.cx;
    await page.mouse.move(pick.topR.cx - 4, pick.topR.cy);
    await page.mouse.move(pick.topR.cx, pick.topR.cy);
    await page.waitForTimeout(900);
    const after = await figById(page, pick.figI);
    const moveD = Math.abs(after.cx - restCx);
    await page.screenshot({ path: join(out, "repulsion-toprow.png") });
    console.log(
      `(d) toprow hover top frame[${pick.topIdx}] cy=${Math.round(pick.topR.cy)} (above head) figRest.cx=${Math.round(restCx)} figureMoved=${moveD.toFixed(1)}px  ${moveD < 2 ? "OK (stays put)" : "FAIL (moved)"}`
    );
    await page.close();
  }
}

// ---------- CASE (e): hover the BOTTOM chart of that same column → figure clears the frame edge ----------
{
  const page = await newPage();
  const pick = await findStack(page);
  if (!pick) {
    console.log("(e) botrow NO stacked column with a bottom-only figure found");
    await page.close();
  } else {
    await page.mouse.move(pick.botR.cx - 4, pick.botR.cy);
    await page.mouse.move(pick.botR.cx, pick.botR.cy);
    await page.waitForTimeout(900);
    const after = await figById(page, pick.figI);
    const clearsLeft = after.right <= pick.botR.left + 2;
    const clearsRight = after.left >= pick.botR.right - 2;
    const ok = clearsLeft || clearsRight;
    await page.screenshot({ path: join(out, "repulsion-botrow.png") });
    console.log(
      `(e) botrow hover bottom frame[${pick.botIdx}] x=[${Math.round(pick.botR.left)},${Math.round(pick.botR.right)}] figRest=[${Math.round(pick.fig.left)},${Math.round(pick.fig.right)}] -> figNow=[${Math.round(after.left)},${Math.round(after.right)}]  ${ok ? "OK (clears frame, side=" + (clearsLeft ? "left" : "right") + ")" : "FAIL (still overlaps)"}`
    );
    await page.close();
  }
}

// Find a piece whose PLAQUE has a figure standing in front of it: the figure's
// silhouette overlaps the plaque box both horizontally and vertically (plaques
// hang at body height, so this is the user's "figure hides my plaque" case).
// Returns frame+plaque rects and the union extent, all in client coords.
const findPlaqueFig = (page) =>
  page.evaluate(() => {
    const pieceEls = [...document.querySelectorAll(".piece")];
    const figRects = [...document.querySelectorAll(".figure")]
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        const s = window.silhouetteX(el);
        return {
          i,
          r: {
            left: s.left,
            right: s.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
          },
        };
      })
      .filter((o) => o.r.width > 0); // content-visibility guard
    const VW = window.innerWidth,
      TOL = 10;
    const box = (x) => ({
      left: x.left,
      right: x.right,
      top: x.top,
      bottom: x.bottom,
      cx: (x.left + x.right) / 2,
      cy: (x.top + x.bottom) / 2,
    });
    const hit = (preferNew) => {
      for (const pe of pieceEls) {
        const frame = pe.querySelector(".frame"),
          plaque = pe.querySelector(".plaque");
        if (!frame || !plaque) continue;
        const fr = frame.getBoundingClientRect(),
          pr = plaque.getBoundingClientRect();
        if (fr.width <= 0 || pr.width <= 0) continue;
        if (pr.left < 0 || pr.right > VW) continue; // plaque fully visible
        for (const { i, r } of figRects) {
          const hOverlap = r.right > pr.left + 6 && r.left < pr.right - 6;
          if (!hOverlap) continue;
          const vOverlap = pr.bottom > r.top + TOL && pr.top < r.bottom - TOL; // plaque over the silhouette
          if (!vOverlap) continue;
          // The genuinely-NEW case the change targets: the FRAME hangs entirely
          // above the head (old frame-bottom rule would NOT fire), yet the PLAQUE
          // reaches the head — only the union (plaque-bottom) rule clears the figure.
          if (preferNew && fr.bottom > r.top + TOL) continue;
          return {
            fr: box(fr),
            pr: box(pr),
            figI: i,
            frameAboveHead: fr.bottom <= r.top + TOL,
            unionLeft: Math.min(fr.left, pr.left),
            unionRight: Math.max(fr.right, pr.right),
            fig: { left: r.left, right: r.right, cx: (r.left + r.right) / 2 },
          };
        }
      }
      return null;
    };
    return hit(true) || hit(false); // prefer the new-behavior case, else any plaque/figure overlap
  });

// ---------- CASE (f): hover a PLAQUE with a figure in front → figure clears the union (plaque text unobstructed) ----------
{
  const page = await newPage();
  const pick = await findPlaqueFig(page);
  if (!pick) {
    console.log(
      "(f) plaque NO piece with a figure in front of its plaque found"
    );
    await page.close();
  } else {
    // hover the PLAQUE itself (not the frame). The plaque is pointer-events:none,
    // so the hover bubbles to the piece, arming rule 2 with the union region.
    await page.mouse.move(pick.pr.cx - 4, pick.pr.cy);
    await page.mouse.move(pick.pr.cx, pick.pr.cy);
    await page.waitForTimeout(900);
    const after = await figById(page, pick.figI);
    const clearsLeft = after.right <= pick.unionLeft + 2;
    const clearsRight = after.left >= pick.unionRight - 2;
    const ok = clearsLeft || clearsRight;
    await page.screenshot({ path: join(out, "repulsion-plaque.png") });
    console.log(
      `(f) plaque hover plaque cx=${Math.round(pick.pr.cx)},y=${Math.round(pick.pr.cy)} ${pick.frameAboveHead ? "[frame ABOVE head — only plaque reaches it]" : "[frame also over figure]"} union x=[${Math.round(pick.unionLeft)},${Math.round(pick.unionRight)}] figRest=[${Math.round(pick.fig.left)},${Math.round(pick.fig.right)}] -> figNow=[${Math.round(after.left)},${Math.round(after.right)}]  ${ok ? "OK (clears union, side=" + (clearsLeft ? "left" : "right") + ")" : "FAIL (still overlaps)"}`
    );
    await page.close();
  }
}

console.log(
  `console/page errors: ${errors.length}` +
    (errors.length ? " :: " + errors.slice(0, 5).join(" | ") : "")
);
await browser.close();
