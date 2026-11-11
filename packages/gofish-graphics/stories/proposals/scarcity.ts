// Data for the scarcity cartograms of the periodic-table proposal (#1347):
// the standard 18-column table weighted by crustal abundance. Throwaway.

import { standardTable, withAbundance, type Element } from "./periodicTable";

type Pt = [number, number];

/** The standard table with `abundance`, plus a `blank` row for every empty
 *  cell of rows 1-7 and 9-10 (cols 1-18), with the floor weight 1. The
 *  blank rows keep the gaps (between groups 2 and 13, and around the
 *  f-block) in their places. */
export const scarcityGrid = (blankWeight = 1) => {
  const cells = withAbundance(standardTable());
  const taken = new Set(cells.map((e) => `${e.col},${e.row}`));
  const blanks: any[] = [];
  for (const row of [1, 2, 3, 4, 5, 6, 7, 9, 10])
    for (let col = 1; col <= 18; col++)
      if (!taken.has(`${col},${row}`))
        blanks.push({
          z: 0,
          symbol: "",
          name: "",
          block: "blank",
          col,
          row,
          abundance: blankWeight,
        });
  return [...cells, ...blanks] as (ReturnType<typeof withAbundance<Element & { col: number; row: number }>>[number] | any)[];
};

/**
 * EMULATION of a table cartogram (Evans et al. 2013): every cell of the
 * 18 x 10 grid (row 8 is the gap) becomes a quadrilateral that keeps its
 * four grid neighbors, with area proportional to its weight, inside a fixed
 * rectangular frame. GoFish has no such layout; this solves the shared
 * corner positions by gradient descent on the squared relative area error,
 * with a penalty that keeps every quad convex. Corners of the frame are
 * fixed and the other frame vertices slide along their side.
 *
 * Returns one row per cell with its `ring` (4 points, frame units: x 0-18,
 * y 0-10 with row 1 at the top) and `error` = area / target - 1.
 */
export const tableCartogram = (
  rows: { col: number; row: number; abundance: number }[],
  { emptyWeight = 0.3, iterations = 4000, smooth = 0.5 } = {}
) => {
  const NC = 18;
  const NR = 10;
  const W = NC;
  const H = NR;
  const weight: number[][] = Array.from({ length: NC }, () =>
    Array(NR).fill(emptyWeight)
  );
  for (const r of rows) {
    // Blank rows from `scarcityGrid` are empty cells too.
    weight[r.col - 1][r.row - 1] =
      (r as any).block === "blank" ? emptyWeight : r.abundance;
  }
  const total = weight.flat().reduce((a, b) => a + b, 0);
  const target = weight.map((col) => col.map((w) => (w / total) * W * H));
  // Vertices (i, j): i = 0..NC left to right, j = 0..NR top to bottom.
  const X: number[][] = [];
  const Y: number[][] = [];
  for (let i = 0; i <= NC; i++) {
    X.push([]);
    Y.push([]);
    for (let j = 0; j <= NR; j++) {
      X[i].push(i);
      Y[i].push(H - j);
    }
  }
  // A cell's corners, counter-clockwise (y up): BL, BR, TR, TL.
  const quad = (c: number, r: number): [number, number][] => [
    [c, r + 1],
    [c + 1, r + 1],
    [c + 1, r],
    [c, r],
  ];
  const areaOf = (q: [number, number][]) => {
    let a = 0;
    for (let k = 0; k < 4; k++) {
      const [i, j] = q[k];
      const [i2, j2] = q[(k + 1) % 4];
      a += X[i][j] * Y[i2][j2] - X[i2][j2] * Y[i][j];
    }
    return a / 2;
  };
  let lr = 0.01;
  const zeros = () => X.map((c) => c.map(() => 0));
  const [mx, vx, my, vy] = [zeros(), zeros(), zeros(), zeros()];
  for (let it = 0; it < iterations; it++) {
    const gx = X.map((c) => c.map(() => 0));
    const gy = Y.map((c) => c.map(() => 0));
    for (let c = 0; c < NC; c++)
      for (let r = 0; r < NR; r++) {
        const q = quad(c, r);
        const T = target[c][r];
        const A = areaOf(q);
        // d/dA of ((A - T) / T)^2
        const dA = (2 * (A - T)) / (T * T);
        for (let k = 0; k < 4; k++) {
          const [i, j] = q[k];
          const [ni, nj] = q[(k + 1) % 4];
          const [pi, pj] = q[(k + 3) % 4];
          gx[i][j] += (dA * (Y[ni][nj] - Y[pi][pj])) / 2;
          gy[i][j] += (dA * (X[pi][pj] - X[ni][nj])) / 2;
          // Convexity: the turn at each corner stays left by at least a
          // small margin, relative to the cell's target.
          const cross =
            (X[i][j] - X[pi][pj]) * (Y[ni][nj] - Y[i][j]) -
            (Y[i][j] - Y[pi][pj]) * (X[ni][nj] - X[i][j]);
          const margin = 0.15 * T;
          if (cross < margin) {
            const d = (-2 * (margin - cross)) / (T * T); // d penalty / d cross
            gx[pi][pj] += d * -(Y[ni][nj] - Y[i][j]);
            gy[pi][pj] += d * (X[ni][nj] - X[i][j]);
            gx[ni][nj] += d * -(Y[i][j] - Y[pi][pj]);
            gy[ni][nj] += d * (X[i][j] - X[pi][pj]);
            gx[i][j] += d * (Y[ni][nj] - Y[pi][pj]);
            gy[i][j] += d * (X[pi][pj] - X[ni][nj]);
          }
        }
      }
    // A pull of each vertex toward the mean of its grid neighbors, eased
    // off over the run (last 40%: none), so the quads stay near regular
    // and the areas get the final word.
    const pull = smooth * Math.max(0, 1 - it / (iterations * 0.6));
    for (let i = 1; i < NC; i++)
      for (let j = 1; j < NR; j++) {
        const mxn = (X[i - 1][j] + X[i + 1][j] + X[i][j - 1] + X[i][j + 1]) / 4;
        const myn = (Y[i - 1][j] + Y[i + 1][j] + Y[i][j - 1] + Y[i][j + 1]) / 4;
        gx[i][j] += pull * (X[i][j] - mxn);
        gy[i][j] += pull * (Y[i][j] - myn);
      }
    // Adam steps, so cells of very different sizes converge together.
    const t = it + 1;
    const adam = (g: number, m: number[][], v: number[][], i: number, j: number) => {
      m[i][j] = 0.9 * m[i][j] + 0.1 * g;
      v[i][j] = 0.999 * v[i][j] + 0.001 * g * g;
      const mh = m[i][j] / (1 - 0.9 ** t);
      const vh = v[i][j] / (1 - 0.999 ** t);
      return (lr * mh) / (Math.sqrt(vh) + 1e-12);
    };
    for (let i = 0; i <= NC; i++)
      for (let j = 0; j <= NR; j++) {
        const onX = i === 0 || i === NC; // left or right side
        const onY = j === 0 || j === NR; // top or bottom side
        if (!onX)
          X[i][j] = Math.max(0, Math.min(W, X[i][j] - adam(gx[i][j], mx, vx, i, j)));
        if (!onY)
          Y[i][j] = Math.max(0, Math.min(H, Y[i][j] - adam(gy[i][j], my, vy, i, j)));
      }
    if (it === Math.floor(iterations * 0.6)) lr /= 5;
  }
  const cells = rows.map((r) => {
    const q = quad(r.col - 1, r.row - 1);
    const T = target[r.col - 1][r.row - 1];
    return {
      ...r,
      ring: q.map(([i, j]): Pt => [X[i][j], Y[i][j]]),
      error: areaOf(q) / T - 1,
    };
  });
  return cells;
};
