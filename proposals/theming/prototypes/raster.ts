/**
 * Throwaway raster port of Cogra's `scan` look (cogra/src/cogra/wear.py,
 * MIT, lynde-wolf/cogra) for the theming proposal: the figure is rasterized
 * at about 600 dpi, wobbled, ink-spread with a threshold that varies over
 * space, then box-averaged down to a 200 dpi-like grid and cut to 1 bit.
 *
 * Resolution: a CSS px is 1/96 in. We work at WORK = 6 px per CSS px
 * (576 dpi, k = 576/300 = 1.92) and scan at WORK / DOWN = 2 px per CSS px
 * (192 dpi), so in a 2x screenshot each scan pixel is exactly one device
 * pixel. Cogra's defaults are 600 and 200 dpi; this is 4% off both.
 *
 * Proposed spelling: Filter.scan() (one member, since it changes the
 * sampling grid, not only the paint).
 */

export type ScanOpts = {
  work?: number; // work px per CSS px
  down?: number; // box factor from work grid to scan grid
  strength?: number;
  weight?: number;
  seed?: number;
  specks?: number; // count of dust specks (Cogra: ~25 when on)
};

// ------------------------------------------------------------ small helpers

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Separable gaussian blur, in place on a w x h float array (edges clamp). */
function blur(a: Float32Array, w: number, h: number, sigma: number) {
  const rad = Math.max(1, Math.round(4 * sigma));
  const k = new Float32Array(2 * rad + 1);
  let s = 0;
  for (let i = -rad; i <= rad; i++)
    s += k[i + rad] = Math.exp(-0.5 * (i / sigma) ** 2);
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -rad; i <= rad; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        acc += a[row + xx] * k[i + rad];
      }
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let i = -rad; i <= rad; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        acc += tmp[yy * w + x] * k[i + rad];
      }
      a[y * w + x] = acc;
    }
  }
}

/** Smooth unit-variance noise with smoothing `sigma` (work px). Built at a
 *  reduced resolution for smooth fields, then bilinearly upsampled. */
function field(w: number, h: number, sigma: number, seed: number) {
  const f = sigma >= 3 ? Math.max(1, Math.floor(sigma / 2)) : 1;
  const lw = Math.ceil(w / f) + 2;
  const lh = Math.ceil(h / f) + 2;
  const r = rng(seed);
  const low = new Float32Array(lw * lh);
  for (let i = 0; i < low.length; i++) low[i] = gauss(r);
  blur(low, lw, lh, sigma / f);
  let m = 0;
  let v = 0;
  for (const x of low) m += x;
  m /= low.length;
  for (const x of low) v += (x - m) ** 2;
  const sd = Math.sqrt(v / low.length) || 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / f;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = x / f;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const i = y0 * lw + x0;
      const val =
        (low[i] * (1 - tx) + low[i + 1] * tx) * (1 - ty) +
        (low[i + lw] * (1 - tx) + low[i + lw + 1] * tx) * ty;
      out[y * w + x] = (val - m) / sd;
    }
  }
  return out;
}

/** Bilinear sample of `a` at (x, y), edges clamp. */
function sample(a: Float32Array, w: number, h: number, x: number, y: number) {
  x = Math.min(Math.max(x, 0), w - 1);
  y = Math.min(Math.max(y, 0), h - 1);
  const x0 = Math.min(Math.floor(x), w - 2);
  const y0 = Math.min(Math.floor(y), h - 2);
  const tx = x - x0;
  const ty = y - y0;
  const i = y0 * w + x0;
  return (
    (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) +
    (a[i + w] * (1 - tx) + a[i + w + 1] * tx) * ty
  );
}

// ------------------------------------------------------------ the look

/** Rasterize an <svg> at `scale` px per CSS px, on white paper. */
export async function rasterize(svg: SVGSVGElement, scale: number) {
  const w =
    Number(svg.getAttribute("width")) || svg.getBoundingClientRect().width;
  const h =
    Number(svg.getAttribute("height")) || svg.getBoundingClientRect().height;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const src = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  await img.decode();
  const W = Math.round(w * scale);
  const H = Math.round(h * scale);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  return { ctx, W, H, w, h };
}

/**
 * Cogra `scan`, steps 1-3 and 5 (plus optional specks, step 4):
 *   wobble  sigma 1.8k, amp 0.35k
 *   spread  blur 0.8k, soft threshold (soft 0.05) at
 *           thr = 0.33 - 0.06 N(7k) - 0.03 N(60k) + 0.02 N(0.8k), clip 0.18..0.5
 *   scan    box-average by DOWN, then gray > 140 is white.
 * Returns a canvas of 1-bit pixels at the scan grid.
 */
export async function scanRaster(svg: SVGSVGElement, o: ScanOpts = {}) {
  const {
    work = 6,
    down = 3,
    strength: s = 1,
    weight = 1,
    seed = 1956,
    specks = 0,
  } = o;
  const k = (work * 96) / 300;
  const { ctx, W, H } = await rasterize(svg, work);
  const px = ctx.getImageData(0, 0, W, H).data;
  const ink = new Float32Array(W * H);
  for (let i = 0; i < ink.length; i++)
    ink[i] =
      1 -
      (0.299 * px[4 * i] + 0.587 * px[4 * i + 1] + 0.114 * px[4 * i + 2]) / 255;

  // 2. wobble
  const amp = 0.35 * k * s;
  const dx = field(W, H, 1.8 * k, seed + 1);
  const dy = field(W, H, 1.8 * k, seed + 2);
  const wob = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      wob[i] = sample(ink, W, H, x + dx[i] * amp, y + dy[i] * amp);
    }

  // 3. spread with a threshold that varies over space
  blur(wob, W, H, 0.8 * k);
  const nW = field(W, H, 7 * k, seed + 3);
  const nB = field(W, H, 60 * k, seed + 4);
  const nE = field(W, H, 0.8 * k, seed + 5);
  for (let i = 0; i < wob.length; i++) {
    const b = wob[i];
    let thr =
      0.33 - 0.06 * weight * nW[i] - 0.03 * weight * nB[i] + 0.02 * s * nE[i];
    thr = Math.min(0.5, Math.max(0.18, thr));
    wob[i] = b < 0.02 ? 0 : 1 / (1 + Math.exp(-(b - thr) / 0.05));
  }

  // 4. specks (irregular blobs about 1.5 scan px across)
  const r = rng(seed + 6);
  for (let n = 0; n < specks; n++) {
    const cx = r() * W;
    const cy = r() * H;
    const rad = ((1.5 * down) / 2) * (0.7 + 0.6 * r());
    const th = r() * Math.PI;
    const ratio = 1 + r();
    for (let y = Math.floor(cy - 3 * rad); y <= cy + 3 * rad; y++)
      for (let x = Math.floor(cx - 3 * rad); x <= cx + 3 * rad; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const ux = x - cx;
        const uy = y - cy;
        const u =
          (ux * Math.cos(th) + uy * Math.sin(th)) / (rad * Math.sqrt(ratio));
        const v =
          ((-ux * Math.sin(th) + uy * Math.cos(th)) * Math.sqrt(ratio)) / rad;
        const cov = Math.min(
          1,
          Math.max(0, (1 - Math.hypot(u, v)) * rad + 0.5)
        );
        const i = y * W + x;
        wob[i] = Math.max(wob[i], cov);
      }
  }

  // 5. box-average down to the scan grid, then 1 bit
  const sw = Math.floor(W / down);
  const sh = Math.floor(H / down);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const octx = out.getContext("2d")!;
  const od = octx.createImageData(sw, sh);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      let acc = 0;
      for (let j = 0; j < down; j++)
        for (let i = 0; i < down; i++)
          acc += 1 - wob[(y * down + j) * W + x * down + i];
      const v = (255 * acc) / (down * down) > 140 ? 255 : 0;
      const o4 = 4 * (y * sw + x);
      od.data[o4] = od.data[o4 + 1] = od.data[o4 + 2] = v;
      od.data[o4 + 3] = 255;
    }
  octx.putImageData(od, 0, 0);
  return out;
}

/** Replace `svg` with its 1-bit scan, shown with nearest-neighbour pixels at
 *  `pxPerCss` scan pixels per CSS px (2 = one scan pixel per device pixel
 *  in a 2x screenshot). */
export async function replaceWithScan(svg: SVGSVGElement, o: ScanOpts = {}) {
  const canvas = await scanRaster(svg, o);
  const per = (o.work ?? 6) / (o.down ?? 3);
  canvas.style.width = `${canvas.width / per}px`;
  canvas.style.height = `${canvas.height / per}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  // Keep the svg in the document (moved off-screen): its <pattern> ids are
  // shared with the other charts on the page, and removing one copy breaks
  // url(#id) resolution for the rest in Chromium.
  svg.before(canvas);
  svg.style.cssText += "position:absolute;left:-10000px;top:0;";
  return canvas;
}
