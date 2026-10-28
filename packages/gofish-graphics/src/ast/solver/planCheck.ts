// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

// TEMPORARY (#1176 step 3c): the plan check. Step 3e seats each child where
// its layer's plan places it, and this check measures what that moves; step
// 3f removes it.
//
// Under GOFISH_PLAN_CHECK, layout compares each layer's plan (`buildPlan`),
// at the σ it hands its children, with where it laid each child, and logs
// each difference with the cause it falls under (the causes are listed in
// the step 3 plan and in the 3c sweep notes).

import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import type { GoFishAST } from "../_ast";
import * as Pwl from "./pwl";
import type { LayerPlan } from "./plan";
import { envFlag } from "../../util";

export const planCheckOn = (): boolean => envFlag("GOFISH_PLAN_CHECK");

/** What a layer recorded about itself in the check, for its parent to read:
 *  the cause of its first difference, where layout put its plan's frame,
 *  and how far layout's data 0 of the layer sits from its plan's data 0
 *  (what a parent that seats it by its data 0 sees, cause 4). */
type Record = {
  cause?: string;
  frame: number;
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

/** Whether `c` holds a ref, or a node drawn from refs (an `enclose`, a
 *  `connect`), whose place the claim walk reads only as ink (cause 7). */
const refsWithin = (c: GoFishAST): boolean =>
  c instanceof GoFishRef ||
  (c instanceof GoFishNode &&
    (c.placedFromRefs !== undefined ||
      c.type === "connect" ||
      c.children.some(refsWithin)));

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
 * what layout will read off the plan (step 3e); a leaf is compared by its
 * box, as its claim is about its parent's origin. Logs one `[plan-check]`
 * line per difference.
 */
export function planCheck(
  node: GoFishNode,
  axis: 0 | 1,
  plan: LayerPlan,
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
  for (const [i, b] of plan.placement.boxes()) {
    const lo = Pwl.at(b.lo, s);
    const hi = Pwl.at(b.hi, s);
    const cp = laid[i];
    const d = cp?.dims[axis];
    if (d?.min === undefined || d.size === undefined) continue;
    if (!Number.isFinite(d.min) || !Number.isFinite(d.size)) continue;
    const laidLo = Math.min(d.min, d.min + d.size) - off;
    const laidHi = Math.max(d.min, d.min + d.size) - off;
    const c = node.children[i];
    const walk = c instanceof GoFishNode ? c.claimWalk : undefined;
    const f = plan.forms[i];
    const base = cp!.localAnchor?.(name, "baseline");
    const min = cp!.localAnchor?.(name, "min");
    // A child that reads y the other way has its data 0 that far from its
    // far end in this layer's axis order.
    const flip = axis === 1 && c.yFrame.direction !== node.yFrame.direction;
    const dSeat =
      walk !== undefined &&
      f !== undefined &&
      base !== undefined &&
      min !== undefined
        ? (flip ? laidHi - (base - min) : laidLo + (base - min)) -
          (lo + Pwl.at(f.box.descent, s) + Pwl.at(f.zero, s))
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
  // The layer claims its plan's summary, so a parent that seats it by its
  // data 0 sees it moved by the frame.
  const own: Record = {
    frame,
    drift: plan.summary === undefined ? 0 : -frame,
  };
  const where = `${pathOf(node)} axis=${axis} σ=${sigma === undefined || !Number.isFinite(sigma) ? "?" : fmt(s)}`;
  const found: { r: (typeof rows)[number]; cause: string }[] = [];
  for (const r of rows) {
    const c = node.children[r.i];
    const sizeOff = r.laidSize - r.planSize;
    const seatOff = r.dSeat - frame;
    const boxOff = r.dLo - frame;
    if (envFlag("GOFISH_PLAN_DEBUG"))
      console.log(
        `[plan-debug] ${where} child=${r.i}:${c.type} plan=[${fmt(r.dLo)}+${fmt(r.planSize)}] laid=${fmt(r.laidSize)} seat=${fmt(seatOff)} box=${fmt(boxOff)} dressing=${plan.placement.dressing.has(r.i)} fromRefs=${c instanceof GoFishNode && c.placedFromRefs !== undefined} sumBox=${plan.summary === undefined ? "-" : fmt(Pwl.at(plan.summary.box.width, s))}`
      );
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
    else if (childRec?.cause !== undefined)
      cause = `${childRec.cause.split("<")[0]}<inherited`;
    else if (refsWithin(c)) cause = "7";
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
    const fm = plan.forms[f.r.i];
    const kids =
      c instanceof GoFishNode ? c.children.map((k) => k.type).join(",") : "";
    console.log(
      `[plan-check] cause=${f.cause} ${where} child=${f.r.i}:${label} ` +
        `seat=${fmt(f.r.dSeat - frame)} box=${fmt(f.r.dLo - frame)} ` +
        `size=${fmt(f.r.laidSize - f.r.planSize)} ` +
        `plan=${fmt(f.r.planSize)} laid=${fmt(f.r.laidSize)}` +
        (fm === undefined
          ? ""
          : ` whole=${fmt(Pwl.at(fm.whole.width, s))} type=${c.type}[${kids}]`)
    );
  }
  if (!near(frame, 0))
    console.log(
      `[plan-check] cause=4 ${where} frame=${fmt(frame)} children=${rows.length}`
    );
  const rec = records.get(node) ?? [undefined, undefined];
  rec[axis] = own;
  records.set(node, rec);
}
