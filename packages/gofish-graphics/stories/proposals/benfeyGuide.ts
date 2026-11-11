// The guide for Benfey's 1964 spiral periodic table (#1347 prototype): the
// inner boundary of the table, as four pieces for `along`, in units of one
// track (one period's thickness). Angles are degrees clockwise from 12
// o'clock; every piece runs clockwise, so its left normal points away from
// the center or from its lobe's slit.
//
// Concave corners. Every piece is stroked with miter joins (`miterBand`),
// so at a concave corner the tracks meet on the corner's bisector and the
// far tracks get shorter; nothing folds as long as the straight run on each
// side of the corner is at least depth · tan(turn / 2). That is why each
// lobe starts and ends with a straight run (a dense arc would fold), and why
// a lobe's mouth is at least 2 · depth + slit wide: the two corners at its
// base turn 180° between them.

import { clockArc, clockPt, fillet, type Piece, type Pt } from "./prototypeCoords";

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + k * b[0], a[1] + k * b[1]];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** The clockwise tangent at angle phi (the direction a clockwise arc
 *  travels). */
const tangent = (phi: number): Pt => [Math.cos(rad(phi)), -Math.sin(rad(phi))];
/** Where the line p + t·u meets the line q + s·w: returns t and s. */
const meet = (p: Pt, u: Pt, q: Pt, w: Pt) => {
  const den = u[0] * w[1] - u[1] * w[0];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  return { t: (dx * w[1] - dy * w[0]) / den, s: (dx * u[1] - dy * u[0]) / den };
};
/** The angle between two unit directions, in radians. */
const turnOf = (a: Pt, b: Pt) =>
  Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));

export type BenfeyGuideOptions = {
  /** Radius of the s piece (the inner edge of H's ring). */
  r0?: number;
  /** Angle of one s column. */
  sAngle?: number;
  /** Half the width of each lobe's slit. */
  slit?: number;
  /** How far each lobe's legs reach out from its first corner. */
  fLeg?: number;
  dLeg?: number;
  /** The direction each lobe points, in degrees clockwise from 12. */
  fDir?: number;
  dDir?: number;
  /** Extra straight run past each clearance, in track units. */
  slack?: number;
};

/**
 * A hairpin around a slit: from `start` straight along `head` to a corner
 * at `run`, out along `dir` for `leg`, round a slit 2 · slit wide, and back
 * in until it meets the line through `endAt` along `endHead`, then straight
 * on to `endAt`. The tip's corners are rounded by `slit`; the base corners
 * stay sharp (miter joins).
 */
const hairpin = (
  start: Pt,
  head: Pt,
  run: number,
  dir: Pt,
  leg: number,
  slit: number,
  endAt: Pt,
  endHead: Pt
) => {
  const c1 = add(start, head, run);
  const t1 = add(c1, dir, leg);
  const right: Pt = [dir[1], -dir[0]]; // clockwise across the leg
  const t2 = add(t1, right, 2 * slit);
  const back: Pt = [-dir[0], -dir[1]];
  const { t, s } = meet(t2, back, endAt, endHead);
  const c2 = add(t2, back, t);
  const corners = (from: Pt) =>
    // A fine step: the tip's arc is offset by up to 4 tracks.
    fillet([from, c1, t1, t2, c2, endAt], [0, slit, slit, 0], slit / 60);
  return {
    path: corners(start),
    /** The same hairpin from a later start on its first run. */
    from: corners,
    c2,
    /** Straight run left between the second corner and the end. */
    tail: -s,
    turn2: turnOf(back, endHead),
  };
};

/**
 * Four pieces: the s arc of the core, the f lobe, the d lobe, the p arc.
 * The f lobe stands on the d lobe's first two tracks (periods 4 and 5); the
 * d lobe's tracks for periods 6 and 7 start where the f lobe ends.
 */
export const benfeyGuide = (o: BenfeyGuideOptions = {}) => {
  const {
    r0 = 1.6,
    sAngle = 24,
    slit = 0.25,
    fLeg = 4.5,
    dLeg = 4,
    fDir = 60,
    dDir = 115,
    slack = 1.2,
  } = o;
  const phi1 = 2 * sAngle; // the end of the s spokes
  const rd = r0 + 3; // inner edge of period 4
  const h1 = tangent(phi1);
  const sd = clockPt(rd, phi1);
  const sf = clockPt(rd + 2, phi1); // inner edge of period 6
  const fu = clockPt(1, fDir);
  const du = clockPt(1, dDir);

  // f lobe (periods 6 and 7, depth 2). It starts and ends on the straight
  // line through sf along h1, so its end cap is a normal of the d lobe's
  // first run too.
  const fRun = 2 * Math.tan(turnOf(h1, fu) / 2) + slack;
  // A first pass finds where the return leg lands; the end goes a
  // clearance past it.
  const probe = hairpin(sf, h1, fRun, fu, fLeg, slit, add(sf, h1, 100), h1);
  const fEndRun = dist(sf, probe.c2) + 2 * Math.tan(probe.turn2 / 2) + slack;
  const f = hairpin(sf, h1, fRun, fu, fLeg, slit, add(sf, h1, fEndRun), h1);

  // d lobe (periods 4-7, depth 4). Its tracks for periods 6 and 7 start
  // under the f lobe's end, so its first corner clears that point by the
  // full depth.
  const dRun = fEndRun + 4 * Math.tan(turnOf(h1, du) / 2) + slack;
  // The p spokes start at phiP, on ring 4, heading clockwise: take the
  // smallest phiP that leaves the return leg enough straight run.
  const dAt = (phiP: number) =>
    hairpin(sd, h1, dRun, du, dLeg, slit, clockPt(rd, phiP), tangent(phiP));
  let phiP = phi1 + 20;
  while (phiP < 300) {
    const d = dAt(phiP);
    if (d.tail >= 4 * Math.tan(d.turn2 / 2) + slack) break;
    phiP += 0.25;
  }
  const d = dAt(phiP);
  const dLate = d.from(add(sd, h1, fEndRun));

  const s = clockArc(r0, 0, phi1);
  const p = clockArc(r0 + 1, phiP, 360);
  const pieces: Piece[] = [
    { path: s, span: 2, depth: 7 },
    { path: f.path, span: 14, depth: 2 },
    // EMULATION: the d piece's tracks for periods 6 and 7 (offset 2 and
    // up) follow a path that starts later, under the f lobe's end, because
    // the f lobe stands on the d lobe's first two tracks. One path per
    // piece cannot say that: every track of a piece starts on one normal.
    { path: (offset) => (offset < 2 ? d.path : dLate), span: 10, depth: 4 },
    { path: p, span: 6, depth: 6 },
  ];
  return { pieces, angles: { phi1, phiP } };
};
