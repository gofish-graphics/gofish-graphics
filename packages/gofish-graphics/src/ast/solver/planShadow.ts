// TEMPORARY (#1176 step 3c): the plan shadow check. It is removed in step 3f,
// once layout seats children from the plan (step 3e).
//
// Under GOFISH_PLAN_CHECK, each layer builds a plan in the claim walk beside
// its claim: one solve in values in σ over every child, by its box (its claim
// without its outline), with the solver's own fallbacks for whatever no
// constraint pins. Layout then compares the plan's box for each child, at the
// σ it hands its children, with where it laid the child, and logs each
// difference with the cause it falls under (the causes are listed in the
// step 3 plan).

import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import type { GoFishAST } from "../_ast";
import { Extent } from "../extent";
import * as Pwl from "./pwl";
import type { ClaimPlacement } from "../constraints/claimPlacement";
import { envFlag } from "../../util";

export const planCheckOn = (): boolean => envFlag("GOFISH_PLAN_CHECK");

/** A layer's plan on one axis, as the shadow reads it. */
export type PlanShadow = {
  placement: ClaimPlacement;
  /** The summary the plan gives: the envelope of the counted children's
   *  drawn boxes (box plus outline). */
  summary: Extent | undefined;
  /** The claim the layer reports today, to compare with the summary. */
  claim: Extent | undefined;
  /** Each child's box claim (its claim without its outline). */
  extents: (Extent | undefined)[];
  /** How far each child's outline reaches past its box. */
  outline: (i: number) => number;
};

/** A claim without the outline `o` its node draws past its box. */
export const unoutlined = (
  e: Extent | undefined,
  o: number
): Extent | undefined =>
  e === undefined || o <= 0
    ? e
    : Extent(Pwl.addConstant(e.ascent, -o), Pwl.addConstant(e.descent, -o));

/** The summary of a plan: the envelope of its counted children's boxes,
 *  each widened by its outline. */
export const planSummary = (
  p: ClaimPlacement,
  counted: (i: number) => boolean,
  outline: (i: number) => number
): Extent | undefined => {
  const up: Pwl.Value[] = [];
  const down: Pwl.Value[] = [];
  for (const [i, b] of p.boxes()) {
    if (!counted(i)) continue;
    up.push(Pwl.addConstant(b.hi, outline(i)));
    down.push(Pwl.addConstant(Pwl.negate(b.lo), outline(i)));
  }
  return up.length === 0
    ? undefined
    : Extent(Pwl.envelope(up), Pwl.envelope(down));
};

/** What a layer recorded about itself, for its parent to read: the cause
 *  of its first difference, where layout put its plan's frame, and how far
 *  its children's outlines reach past their boxes at its ends (its claim
 *  carries that reach, its laid box does not). */
type Record = {
  cause?: string;
  frame: number;
  outline: number;
  /** How far layout's data 0 of the layer sits from its claim's data 0:
   *  what a parent that seats it by its data 0 sees (cause 4). */
  drift: number;
};
const records = new WeakMap<GoFishAST, [Record?, Record?]>();

const TOL = 0.01;
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
const fmt = (x: number) => (Math.abs(x) < 1e-9 ? "0" : x.toFixed(2));

/** A short path to `node`, for the log. */
const pathOf = (node: GoFishAST): string => {
  const parts: string[] = [];
  for (let n: GoFishAST | undefined = node; n !== undefined; n = n.parent)
    parts.push((n instanceof GoFishNode ? n.key : undefined) ?? n.type);
  return parts.reverse().slice(-4).join(">");
};

/** Whether `c` has a size of its own on `axis`. */
const sized = (c: GoFishAST, axis: 0 | 1): boolean =>
  c instanceof GoFishNode && c.claimWalk?.ownScope[axis] === true;

type Laid = {
  dims: { min?: number; size?: number }[];
  localAnchor?: (
    axis: "x" | "y",
    anchor: "min" | "baseline"
  ) => number | undefined;
};

/**
 * Compare a layer's plan on `axis` with where layout laid its children.
 * `sigma` is the σ the layer hands its children and `origin` the pixel its
 * frame puts data 0 at. A seat is a child's data 0 (its baseline), which is
 * what layout will read off the plan (step 3e); a child with no baseline is
 * compared by its box. Logs one `[plan-check]` line per difference, and one
 * `[plan-summary]` line where the plan's summary differs from the claim.
 */
export function planShadowCheck(
  node: GoFishNode,
  axis: 0 | 1,
  plan: PlanShadow,
  laid: (Laid | undefined)[],
  sigma: number | undefined,
  origin: number | undefined,
  layoutOnly: boolean
): void {
  const s = sigma !== undefined && Number.isFinite(sigma) ? sigma : 0;
  const off = origin ?? 0;
  const name = axis === 0 ? "x" : "y";
  const rows: {
    i: number;
    dSeat: number;
    dLo: number;
    planSize: number;
    laidSize: number;
  }[] = [];
  let hiBox = -Infinity;
  let loBox = Infinity;
  let hiDrawn = -Infinity;
  let loDrawn = Infinity;
  for (const [i, b] of plan.placement.boxes()) {
    const lo = Pwl.at(b.lo, s);
    const hi = Pwl.at(b.hi, s);
    const o = plan.outline(i);
    // A child layer's claim already reaches past its laid box by its own
    // children's outlines.
    const inner = (records.get(node.children[i])?.[axis]?.outline ?? 0) / 2;
    hiBox = Math.max(hiBox, hi - inner);
    loBox = Math.min(loBox, lo + inner);
    hiDrawn = Math.max(hiDrawn, hi + o);
    loDrawn = Math.min(loDrawn, lo - o);
    const cp = laid[i];
    const d = cp?.dims[axis];
    if (d?.min === undefined || d.size === undefined) continue;
    if (!Number.isFinite(d.min) || !Number.isFinite(d.size)) continue;
    const laidLo = Math.min(d.min, d.min + d.size) - off;
    const laidHi = Math.max(d.min, d.min + d.size) - off;
    // A layer is seated by its data 0 (past a literal start of its own).
    // A leaf's claim is about its parent's origin already (a shape places
    // itself), so it is compared by its box.
    const c = node.children[i];
    const walk = c instanceof GoFishNode ? c.claimWalk : undefined;
    const e = plan.extents[i];
    const base = cp!.localAnchor?.(name, "baseline");
    const min = cp!.localAnchor?.(name, "min");
    const dSeat =
      walk !== undefined &&
      e !== undefined &&
      base !== undefined &&
      min !== undefined
        ? laidLo +
          (base - min) -
          (lo +
            // A child whose y reads the other way has its data 0 past its
            // ascent from this layer's start.
            Pwl.at(
              axis === 1 && c.yFrame.direction !== node.yFrame.direction
                ? e.ascent
                : e.descent,
              s
            ) +
            walk.literalStart[axis])
        : laidLo - lo;
    rows.push({
      i,
      dSeat,
      dLo: laidLo - lo,
      planSize: hi - lo,
      laidSize: laidHi - laidLo,
    });
  }
  // The shift that moves the most children onto the plan: where layout
  // puts the frame of the plan.
  const votes = new Map<string, number>();
  const driftOf = (i: number) =>
    records.get(node.children[i])?.[axis]?.drift ?? 0;
  for (const r of rows) {
    const k = (r.dSeat - driftOf(r.i)).toFixed(2);
    votes.set(k, (votes.get(k) ?? 0) + 1);
  }
  let frame = 0;
  let best = -1;
  for (const [k, n] of votes)
    if (n > best || (n === best && Math.abs(+k) < Math.abs(frame))) {
      best = n;
      frame = +k;
    }
  const own: Record = {
    frame,
    outline: hiBox === -Infinity ? 0 : hiDrawn - hiBox + (loBox - loDrawn),
    drift: 0,
  };
  const sumDescent =
    plan.summary === undefined ? undefined : Pwl.at(plan.summary.descent, s);
  const claimDescent =
    plan.claim === undefined ? undefined : Pwl.at(plan.claim.descent, s);
  if (sumDescent !== undefined && claimDescent !== undefined)
    own.drift = sumDescent - claimDescent - frame;
  const where = `${pathOf(node)} axis=${axis} σ=${fmt(s)}`;
  const found: { r: (typeof rows)[number]; cause: string }[] = [];
  for (const r of rows) {
    const c = node.children[r.i];
    const sizeOff = r.laidSize - r.planSize;
    const seatOff = r.dSeat - frame;
    const boxOff = r.dLo - frame;
    if (near(sizeOff, 0) && near(seatOff, 0) && near(boxOff, 0)) continue;
    const childRec = records.get(c)?.[axis];
    let cause: string;
    if (
      c instanceof GoFishRef ||
      (c instanceof GoFishNode && c.placedFromRefs !== undefined)
    )
      cause = "7";
    else if (layoutOnly) cause = "5";
    else if (
      near(sizeOff, 0) &&
      childRec !== undefined &&
      !near(childRec.drift, 0) &&
      near(seatOff, childRec.drift)
    )
      cause = "4<inherited";
    else if (c instanceof GoFishNode && !near(sizeOff, 0) && c.fillsRoom(axis))
      cause = "6";
    else if (sized(c, axis) && !near(sizeOff, 0)) cause = "2";
    else if (sized(c, axis)) cause = "3";
    else if (
      childRec !== undefined &&
      childRec.outline > 0 &&
      near(sizeOff, -childRec.outline)
    )
      cause = "1";
    else if (childRec?.cause !== undefined)
      cause = `${childRec.cause.split("<")[0]}<inherited`;
    else if (
      !(c instanceof GoFishNode && c.claimWalk !== undefined) &&
      plan.extents[r.i] !== undefined &&
      (Pwl.at(plan.extents[r.i]!.descent, s) < -TOL ||
        Pwl.at(plan.extents[r.i]!.ascent, s) < -TOL)
    )
      // A shape that places itself at a literal pixel: layout keeps it
      // there, while the plan reads the pixel only as part of its claim and
      // lets the constraints move the box.
      cause = "9";
    else if (near(sizeOff, 0) && near(boxOff, 0)) cause = "4";
    else if (near(sizeOff, 0) && near(seatOff, 0)) cause = "3";
    else cause = "8";
    found.push({ r, cause });
  }
  // A child that differs only because a sibling it is placed against does
  // takes the sibling's cause.
  const sibling = found.find((f) => !f.cause.startsWith("8"))?.cause;
  for (const f of found) {
    if (f.cause === "8" && sibling !== undefined)
      f.cause = `${sibling.split("<")[0]}<sibling`;
    own.cause ??= f.cause;
    const c = node.children[f.r.i];
    const label = c instanceof GoFishNode ? (c.key ?? c.type) : c.type;
    console.log(
      `[plan-check] cause=${f.cause} ${where} child=${f.r.i}:${label} ` +
        `seat=${fmt(f.r.dSeat - frame)} box=${fmt(f.r.dLo - frame)} ` +
        `size=${fmt(f.r.laidSize - f.r.planSize)} ` +
        `plan=${fmt(f.r.planSize)} laid=${fmt(f.r.laidSize)}`
    );
  }
  if (!near(frame, 0))
    console.log(
      `[plan-check] cause=4 ${where} frame=${fmt(frame)} children=${rows.length}`
    );
  // The summary the plan gives against the claim the layer reports today:
  // what step 3d changes.
  const sum = plan.summary;
  const claim = plan.claim;
  if (sum !== undefined && claim !== undefined) {
    const dw = Pwl.at(sum.width, s) - Pwl.at(claim.width, s);
    const dd = Pwl.at(sum.descent, s) - Pwl.at(claim.descent, s);
    if (!near(dw, 0) || !near(dd, 0))
      console.log(
        `[plan-summary] ${where} width=${fmt(dw)} descent=${fmt(dd)} ` +
          `claim=${fmt(Pwl.at(claim.width, s))} plan=${fmt(Pwl.at(sum.width, s))}`
      );
  } else if ((sum === undefined) !== (claim === undefined))
    console.log(
      `[plan-summary] ${where} only=${sum === undefined ? "claim" : "plan"}`
    );
  const rec = records.get(node) ?? [undefined, undefined];
  rec[axis] = own;
  records.set(node, rec);
}
