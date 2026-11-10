// Throwaway helpers for the stack-profile proposal: three ways to space
// irregular shapes along one axis, computed by hand so today's engine can
// draw the result as polygons. Units are pixels.
//
//   box      gap between bounding boxes (today's spread)
//   contact  smallest distance between outlines, plus a gap (tidy trees)
//   optical  the mean white gap between outlines, each column capped at a
//            depth, is set to a target (HT Letterspacer style), over the
//            columns where both outlines exist; never closer
//            than contact
export type Model = "box" | "contact" | "optical";
export type Pt = [number, number];

/** A shape's extent across the spacing axis: lo(u) and hi(u) where it exists. */
type Profile = { u: number[]; lo: (number | null)[]; hi: (number | null)[] };

const U = (lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

/** Solve f(b) = target for increasing f on [lo, hi] by bisection. */
const solve = (f: (b: number) => number, target: number, lo: number, hi: number) => {
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (f(m) < target) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};

/**
 * Place shapes one after another along an axis. `prev` is the far side of
 * what is already placed (a function of u, null where nothing is), `near(i)`
 * is shape i's near side relative to its own origin. Returns each origin.
 */
function place(
  n: number,
  u: number[],
  far: (i: number) => (number | null)[],
  near: (i: number) => (number | null)[],
  extent: (i: number) => [number, number],
  model: Model,
  opt: { gap: number; depth: number; target: number }
): number[] {
  const out: number[] = [];
  const sky: (number | null)[] = u.map(() => null);
  let boxEnd = -Infinity;
  for (let i = 0; i < n; i++) {
    const nr = near(i);
    let b = 0;
    if (i > 0) {
      const [e0] = extent(i);
      const boxB = boxEnd + opt.gap - e0;
      let contact = out[i - 1];
      u.forEach((_, k) => {
        if (sky[k] !== null && nr[k] !== null)
          contact = Math.max(contact, (sky[k] as number) + opt.gap - (nr[k] as number));
      });
      if (model === "box") b = boxB;
      else if (model === "contact") b = contact;
      else {
        const cols = u.map((_, k) => k).filter((k) => nr[k] !== null && sky[k] !== null);
        const mean = (bb: number) =>
          cols.reduce((s, k) => {
            const w = bb + (nr[k] as number) - (sky[k] as number);
            return s + Math.min(w, opt.depth);
          }, 0) / cols.length;
        b = Math.max(contact, solve(mean, opt.target, contact - 500, contact + 500));
      }
    }
    out.push(b);
    const fr = far(i);
    u.forEach((_, k) => {
      if (fr[k] !== null) sky[k] = Math.max(sky[k] ?? -Infinity, b + (fr[k] as number));
    });
    boxEnd = Math.max(boxEnd, b + extent(i)[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ridges with bounded supports whose peaks shift, spaced along y.

const RIDGES = [62, 48, 70, 44, 64, 52].map((amp, i) => ({ a: 10 + 46 * i, w: 130, amp }));
const RU = U(0, 420, 421);
/** A gamma-like bump: an early peak and a long right tail. */
const ridgeH = (r: (typeof RIDGES)[number], x: number) => {
  const t = (x - r.a) / r.w;
  if (t < 0 || t > 1) return null;
  const q = t / 0.18;
  return r.amp * q * q * Math.exp(2 * (1 - q));
};

export function ridgeRings(model: Model) {
  const base = place(
    RIDGES.length,
    RU,
    (i) => RU.map((x) => ridgeH(RIDGES[i], x)),
    (i) => RU.map((x) => (ridgeH(RIDGES[i], x) === null ? null : 0)),
    (i) => [0, RIDGES[i].amp],
    model,
    { gap: 4, depth: 40, target: 32 }
  );
  return RIDGES.map((r, i) => {
    const xs = RU.filter((x) => ridgeH(r, x) !== null);
    const top: Pt[] = xs.map((x) => [x, base[i] + (ridgeH(r, x) as number)]);
    return { c: `r${i}`, ring: [[xs[0], base[i]], ...top, [xs[xs.length - 1], base[i]]] as Pt[] };
  });
}

// ---------------------------------------------------------------------------
// A row of glyph-like outlines, spaced along x. Counters are ignored.

const ellipse = (w: number, h: number): Pt[] =>
  Array.from({ length: 48 }, (_, i) => {
    const t = (2 * Math.PI * i) / 48;
    return [w / 2 + (w / 2) * Math.cos(t), h / 2 + (h / 2) * Math.sin(t)];
  });
const GLYPHS: Record<string, Pt[]> = {
  T: [[24, 0], [40, 0], [40, 86], [64, 86], [64, 100], [0, 100], [0, 86], [24, 86]],
  A: [[0, 0], [16, 0], [22, 26], [46, 26], [52, 0], [68, 0], [42, 100], [26, 100]],
  V: [[26, 0], [42, 0], [68, 100], [52, 100], [34, 32], [16, 100], [0, 100]],
  O: ellipse(70, 100),
  L: [[0, 0], [56, 0], [56, 14], [16, 14], [16, 100], [0, 100]],
  I: [[0, 0], [16, 0], [16, 100], [0, 100]],
};
export const WORD = ["T", "A", "V", "O", "L", "I"];
const GV = U(0, 100, 101);

/** Leftmost and rightmost x of a polygon on the horizontal line y = v. */
function scan(ring: Pt[], v: number): [number, number] | null {
  const xs: number[] = [];
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    if ((p[1] <= v && q[1] >= v) || (q[1] <= v && p[1] >= v)) {
      xs.push(p[1] === q[1] ? Math.min(p[0], q[0]) : p[0] + ((v - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
      if (p[1] === q[1]) xs.push(Math.max(p[0], q[0]));
    }
  });
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

export function glyphRings(model: Model) {
  const rings = WORD.map((g) => GLYPHS[g]);
  const sides = rings.map((r) => GV.map((v) => scan(r, v)));
  const x = place(
    rings.length,
    GV,
    (i) => sides[i].map((s) => (s ? s[1] : null)),
    (i) => sides[i].map((s) => (s ? s[0] : null)),
    (i) => [Math.min(...rings[i].map((p) => p[0])), Math.max(...rings[i].map((p) => p[0]))],
    model,
    { gap: 4, depth: 30, target: 14 }
  );
  return rings.map((r, i) => ({ c: WORD[i] + i, ring: r.map(([px, py]) => [px + x[i] + 4, py + 4] as Pt) }));
}
