// TEMPORARY (#1176 step 3c): the plan shadow check. The plan half
// (`buildPlan`) is what step 3d promotes to the layer's claim; the check half
// (`planShadowCheck`) is removed in step 3f, once layout seats children from
// the plan (step 3e).
//
// Under GOFISH_PLAN_CHECK, each layer builds a plan in the claim walk beside
// its claim: one solve in values in σ over every child, with the solver's own
// fallbacks for whatever no constraint pins. Layout then compares the plan's
// box for each child, at the σ it hands its children, with where it laid the
// child, and logs each difference with the cause it falls under (the causes
// are listed in the step 3 plan and in the 3c sweep notes).

import { GoFishNode } from "../_node";
import { GoFishRef } from "../_ref";
import type { GoFishAST } from "../_ast";
import { Extent } from "../extent";
import type { Size } from "../dims";
import * as Pwl from "./pwl";
import {
  literalSeats,
  placeByClaims,
  type ClaimChild,
  type ClaimPlacement,
  type Placement,
} from "../constraints/claimPlacement";
import type { ConstraintSpec } from "../constraints";
import { envFlag } from "../../util";

export const planCheckOn = (): boolean => envFlag("GOFISH_PLAN_CHECK");
/** Whether a layer claims its plan's summary (`GOFISH_PLAN_CLAIM`, with
 *  the check on): a preview of step 3d's claims. */
export const planClaimOn = (): boolean =>
  planCheckOn() && envFlag("GOFISH_PLAN_CLAIM");

/** What a child is to its parent's plan on one axis, about its data 0, in
 *  the parent's axis order. */
export type ChildForms = {
  /** Its box: what anchors read, and what layout lays out (no outline). */
  box: Extent;
  /** Its plot: what a chain lays it by (its box less dressing and chrome). */
  plot: Extent | undefined;
  /** All it draws: its box widened by the outlines and dressing at its
   *  ends. This is what takes room. */
  whole: Extent;
  /** Where its own data 0 sits from the origin these forms are about (a
   *  layer with a literal start puts its box start there, so its data 0
   *  is past its box's descent from it); 0 for most. */
  zero: Pwl.Value;
};

/** A layer's plan on one axis. */
export type LayerPlan = {
  placement: ClaimPlacement;
  /** Each child's forms (undefined for a child with no claim). */
  forms: (ChildForms | undefined)[];
  /** The envelopes of the placed children: the layer's own forms, about
   *  its data 0. `whole` is its summary (its claim in step 3d). */
  summary: ChildForms | undefined;
  /** The claim the layer reports today, to compare with the summary. */
  claim: Extent | undefined;
  /** The plot claim the layer reports today, to compare with the plan's. */
  plotClaim?: Extent;
};

const plans = new WeakMap<GoFishNode, [LayerPlan?, LayerPlan?]>();

const sub = (a: Pwl.Value, b: Pwl.Value): Pwl.Value =>
  Pwl.add(a, Pwl.negate(b));

/** How far a claim reaches past the box at each end, `[up, down]`. */
type Reach = [Pwl.Value, Pwl.Value];

/** `e` less a reach `[up, down]` past its box at each end. */
const within = (e: Extent, [up, down]: Reach): Extent =>
  Extent(sub(e.ascent, up), sub(e.descent, down));

/** `e` moved `by` pixels up its axis. */
const shifted = (e: Extent, by: Pwl.Value): Extent =>
  Pwl.isZero(by) ? e : Extent(Pwl.add(e.ascent, by), sub(e.descent, by));

/** `e` read in a frame whose y runs the other way: reflected about data 0. */
const reflectedExtent = (e: Extent): Extent => Extent(e.descent, e.ascent);

/** `e` drawn scaled by `k` about data 0 (`transform.scale`): a negative
 *  factor reflects it. */
const scaledExtent = (e: Extent, k: number): Extent =>
  k === 1
    ? e
    : k > 0
      ? Extent(Pwl.scale(k, e.ascent), Pwl.scale(k, e.descent))
      : Extent(Pwl.scale(-k, e.descent), Pwl.scale(-k, e.ascent));

/** Where a layer's data 0 sits from the origin its claim is about: past
 *  its box's descent from its literal start, which places its box start
 *  (`translate` in its layout); 0 when its parent places it. */
const zeroOf = (c: GoFishNode, rec: ChildForms, axis: 0 | 1): Pwl.Value => {
  const start = c.claimWalk?.literalStart[axis];
  return start === undefined
    ? Pwl.ZERO
    : Pwl.addConstant(rec.box.descent, start);
};

const boxes = new WeakMap<
  GoFishAST,
  { claim: Size<Extent | undefined>; box: Size<Extent | undefined> }
>();

/**
 * `c`'s box claim: the claim it would make if nothing in it drew an
 * outline. A layer's is its plan's box; a node with a size of its own, or
 * a leaf, has its claim less its own outline; and any other node composes
 * its children's boxes by its own claim rule (`composeExtent`), as it
 * composes their claims (a `position` moves its child's, a mask keeps its
 * first child's).
 */
const boxOf = (c: GoFishAST): Size<Extent | undefined> => {
  const claim = c.resolveExtent();
  if (!(c instanceof GoFishNode)) return claim;
  const memo = boxes.get(c);
  if (memo?.claim === claim) return memo.box;
  const o = c.claimedOverhang;
  const bare = (e: Extent | undefined) =>
    e === undefined || o === 0
      ? e
      : within(e, [Pwl.constant(o), Pwl.constant(o)]);
  let box: Size<Extent | undefined>;
  if (c.claimWalk !== undefined)
    box = ([0, 1] as const).map((axis) => {
      const rec = c.claimWalk!.ownScope[axis]
        ? undefined
        : plans.get(c)?.[axis]?.summary;
      return rec === undefined
        ? bare(claim[axis])
        : shifted(rec.box, zeroOf(c, rec, axis));
    }) as Size<Extent | undefined>;
  else if (c.children.length === 0) box = [bare(claim[0]), bare(claim[1])];
  else box = c.composeExtent(c.children.map(boxOf));
  boxes.set(c, { claim, box });
  return box;
};

/** `e` grown by what `to` reaches past `from` at each end. */
const reaching = (e: Extent, from: Extent, to: Extent): Extent =>
  Extent(
    Pwl.add(e.ascent, sub(to.ascent, from.ascent)),
    Pwl.add(e.descent, sub(to.descent, from.descent))
  );

/**
 * Whether `c` places itself on `axis` at a literal pixel of its own: a
 * layer's literal start, or a shape's literal start or center (`positionOf`
 * in its layout). Its claim is then about its parent's origin already, and
 * layout pins it where it put itself (`shouldPinSelfPlacement`).
 */
export const placesItself = (c: GoFishAST, axis: 0 | 1): boolean => {
  if (!(c instanceof GoFishNode)) return false;
  if (c.claimWalk !== undefined)
    return c.claimWalk.literalStart[axis] !== undefined;
  const d = (c.args?.dims as { min?: unknown; center?: unknown }[])?.[axis];
  return typeof d?.min === "number" || typeof d?.center === "number";
};

/**
 * A child's forms in `parent`'s plan on `axis`, from `whole`, the claim the
 * parent composes it by. A layer child reads its own plan's forms (as step
 * 3d makes its claim its plan's summary), moved by its literal start; a
 * child with a size of its own claims that size, all of it box, and its
 * plot is its own (its content's, inside its chrome). Any other node's box
 * is its claim less its outline, and its plot its plot claim. A child that
 * reads y the other way is read reflected about its data 0, as layout seats
 * it (its baseline at the bottom of its band).
 */
const formsOf = (
  parent: GoFishNode,
  c: GoFishAST,
  whole: Extent,
  axis: 0 | 1
): ChildForms => {
  let forms: ChildForms;
  const own = c instanceof GoFishNode && c.claimWalk?.ownScope[axis] === true;
  const rec =
    c instanceof GoFishNode && !own ? plans.get(c)?.[axis]?.summary : undefined;
  if (c instanceof GoFishNode && rec !== undefined) {
    const zero = zeroOf(c, rec, axis);
    const o = Pwl.constant(c.claimedOverhang);
    const recWhole = shifted(
      Extent(Pwl.add(rec.whole.ascent, o), Pwl.add(rec.whole.descent, o)),
      zero
    );
    // A nest that derives the child pads its claim: read its forms off
    // that claim instead.
    const w = whole !== c.resolveExtent()[axis] ? whole : recWhole;
    const box = reaching(w, recWhole, shifted(rec.box, zero));
    forms = {
      whole: w,
      box,
      plot: c.plotIsBox(axis)
        ? box
        : rec.plot && reaching(w, recWhole, shifted(rec.plot, zero)),
      zero,
    };
  } else {
    // What the claim reaches past the box, kept past a nest's padding.
    const claim = c.resolveExtent()[axis];
    const b = boxOf(c)[axis];
    const box =
      claim === undefined || b === undefined
        ? whole
        : reaching(whole, claim, b);
    const plot =
      c instanceof GoFishNode && !own ? c.resolvePlotExtent()[axis] : undefined;
    forms = {
      whole,
      box,
      plot: plot === undefined || plot === c.resolveExtent()[axis] ? box : plot,
      zero: Pwl.ZERO,
    };
  }
  if (axis === 1 && c.yFrame.direction !== parent.yFrame.direction)
    forms = {
      whole: reflectedExtent(forms.whole),
      box: reflectedExtent(forms.box),
      plot: forms.plot && reflectedExtent(forms.plot),
      zero: Pwl.negate(forms.zero),
    };
  return forms;
};

/**
 * A layer's plan on `axis`: one solve in values in σ over every child, by
 * its box, with a chain laying its parts by their plots; and its forms, the
 * envelopes of its children's where the solve places them. The summary
 * (`whole`) is the envelope of what the children draw, so an outline takes
 * room only where it reaches the ends of the hull (Q3); the box is the
 * envelope of their boxes, which is what layout lays out.
 *
 * `children` is what the claim walk knows of each child, with its claim as
 * its extent (`claimChildren` in `layer`). `ring` says the layer is a ring
 * of chrome, whose children past the first are chrome.
 */
export function buildPlan(
  node: GoFishNode,
  axis: 0 | 1,
  children: ClaimChild[],
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>,
  nested: (name: string) => Placement | undefined,
  ring: boolean,
  scale: number,
  claim: Extent | undefined
): LayerPlan {
  const forms = children.map((c, i) =>
    c.extent === undefined
      ? undefined
      : formsOf(node, node.children[i], c.extent, axis)
  );
  const placement = placeByClaims(
    axis,
    children.map((c, i) => {
      const f = forms[i];
      return {
        ...c,
        extent: f?.box,
        plot: f === undefined || f.plot === f.box ? undefined : f.plot,
        placesItself: placesItself(node.children[i], axis),
        chrome: ring && i > 0,
      };
    }),
    constraints,
    operands,
    new Set(node.children.map((_, i) => i)),
    nested
  );
  const box: [Pwl.Value[], Pwl.Value[]] = [[], []];
  const whole: [Pwl.Value[], Pwl.Value[]] = [[], []];
  const plot: [Pwl.Value[], Pwl.Value[]] = [[], []];
  for (const [i, b] of placement.boxes()) {
    const f = forms[i];
    box[0].push(b.hi);
    box[1].push(Pwl.negate(b.lo));
    // A child placed where its refs land (a stand-in, an enclose) is placed
    // by what it draws: all of it is its box.
    const preset = children[i].standIn || children[i].fromRefs;
    const reach = (to: Extent | undefined): [Pwl.Value, Pwl.Value] =>
      preset || f === undefined || to === undefined
        ? [b.hi, Pwl.negate(b.lo)]
        : [
            Pwl.add(b.hi, sub(to.ascent, f.box.ascent)),
            sub(sub(to.descent, f.box.descent), b.lo),
          ];
    const [wHi, wLo] = reach(f?.whole);
    whole[0].push(wHi);
    whole[1].push(wLo);
    if (placement.dressing.has(i) || placement.ink.has(i) || (ring && i > 0))
      continue;
    // A child that is all dressing (a layer of outlines around refs) has no
    // plot: it adds nothing to the layer's.
    if (f !== undefined && f.plot === undefined) continue;
    const [pHi, pLo] = reach(f?.plot);
    plot[0].push(pHi);
    plot[1].push(pLo);
  }
  const env = ([up, down]: [Pwl.Value[], Pwl.Value[]]) =>
    up.length === 0 ? undefined : Extent(Pwl.envelope(up), Pwl.envelope(down));
  const sBox = env(box);
  const sWhole = env(whole);
  // A `transform.scale` draws the content scaled about the layer's data 0.
  const summary =
    sBox === undefined || sWhole === undefined
      ? undefined
      : {
          box: scaledExtent(sBox, scale),
          whole: scaledExtent(sWhole, scale),
          plot:
            plot[0].length === 0 ? undefined : scaledExtent(env(plot)!, scale),
          zero: Pwl.ZERO,
        };
  // A layer that claims today but whose plan places nothing: a child with
  // no claim fills the room it is given, and whatever a relation ties to it
  // lands where it does (cause 12 in the check).
  if (planCheckOn() && summary === undefined && claim !== undefined)
    console.log(
      `[plan-nosummary] ${pathOf(node)} axis=${axis} unclaimed=` +
        children
          .flatMap((c, i) =>
            c.extent === undefined && !c.standIn && !c.inkOn
              ? [`${i}:${node.children[i].type}`]
              : []
          )
          .join(",")
    );
  const plan: LayerPlan = { placement, forms, summary, claim };
  const rec = plans.get(node) ?? [undefined, undefined];
  rec[axis] = plan;
  plans.set(node, rec);
  return plan;
}

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

/** Whether a layer in `c` (short of a node with a size of its own) has a
 *  claim today but no plan summary on `axis`: its plan places nothing, as
 *  a child with no claim fills its room (cause 12). */
const unsummarized = (c: GoFishAST, axis: 0 | 1): boolean => {
  if (!(c instanceof GoFishNode) || c.claimWalk?.ownScope[axis] === true)
    return false;
  const p = plans.get(c)?.[axis];
  if (
    p !== undefined &&
    p.summary === undefined &&
    p.claim !== undefined &&
    p.forms.some(
      (f, i) =>
        f === undefined &&
        !p.placement.ink.has(i) &&
        !(c.children[i] instanceof GoFishRef)
    )
  )
    return true;
  return c.children.some((k) => unsummarized(k, axis));
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
 * line per difference, and one `[plan-summary]` line where the plan's
 * summary differs from the claim.
 */
export function planShadowCheck(
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
  const own: Record = { frame, drift: 0 };
  const sum = plan.summary?.whole;
  const claim = plan.claim;
  if (sum !== undefined && claim !== undefined)
    own.drift = Pwl.at(sum.descent, s) - Pwl.at(claim.descent, s) - frame;
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
    else if (unsummarized(c, axis)) cause = "12";
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
  // The summary the plan gives against the claim the layer reports today:
  // what step 3d changes.
  if (sum !== undefined && claim !== undefined) {
    const dw = Pwl.at(sum.width, s) - Pwl.at(claim.width, s);
    const dd = Pwl.at(sum.descent, s) - Pwl.at(claim.descent, s);
    if (!near(dw, 0) || !near(dd, 0))
      console.log(
        `[plan-summary] ${where} width=${fmt(dw)} descent=${fmt(dd)} ` +
          `claim=${fmt(Pwl.at(claim.width, s))} plan=${fmt(Pwl.at(sum.width, s))}`
      );
    const pc = plan.plotClaim;
    const ps = plan.summary?.plot;
    if (pc !== undefined && ps !== undefined) {
      const pw = Pwl.at(ps.width, s) - Pwl.at(pc.width, s);
      const pd = Pwl.at(ps.descent, s) - Pwl.at(pc.descent, s);
      if (!near(pw, 0) || !near(pd, 0))
        console.log(
          `[plan-plot] ${where} width=${fmt(pw)} descent=${fmt(pd)} ` +
            `claim=${fmt(Pwl.at(pc.width, s))} plan=${fmt(Pwl.at(ps.width, s))}`
        );
    }
  } else if ((sum === undefined) !== (claim === undefined))
    console.log(
      `[plan-summary] ${where} only=${sum === undefined ? "claim" : "plan"}`
    );
  const rec = records.get(node) ?? [undefined, undefined];
  rec[axis] = own;
  records.set(node, rec);
}

/** Where `parent` seats `child`'s data 0 on `axis` without solving its own
 *  plan (it may be the plan being built): 0 for a child no constraint acts
 *  on there, the pixel a literal position pins it at, else undefined. A
 *  child with a literal start of its own is not seated at its data 0, and
 *  is left to the solve. */
function seatOf(
  parent: GoFishNode,
  child: GoFishAST,
  axis: 0 | 1
): number | undefined {
  const seating = parent.claimWalk?.seating();
  if (seating === undefined) return undefined;
  if (
    child instanceof GoFishNode &&
    child.claimWalk?.literalStart[axis] !== undefined
  )
    return undefined;
  const i = seating.indexOf(child);
  const acting = seating.acting[axis].get(i) ?? [];
  if (acting.length === 0) return 0;
  const name = seating.operandName.get(i);
  return name === undefined
    ? undefined
    : literalSeats(acting).get(name)?.[axis];
}

/** `x ↦ at + sign·x`: where a point of a node's frame lands in an
 *  ancestor's. */
type Frame = { at: Pwl.Value; sign: 1 | -1 };

/** Whether `child` reads `axis` the other way from `parent`. */
const flips = (parent: GoFishNode, child: GoFishAST, axis: 0 | 1): boolean =>
  axis === 1 && child.yFrame.direction !== parent.yFrame.direction;

/** Whether plans compose through `n` on `axis`: a layer that is not a
 *  scope of its own there. */
const composes = (n: GoFishNode, axis: 0 | 1): boolean =>
  n.claimWalk !== undefined && !n.claimWalk.ownScope[axis];

/** `[lo, hi]` and a point `zero` moved by the frame map `m`, the box kept
 *  in order. */
const moved = (
  m: Frame,
  lo: Pwl.Value,
  hi: Pwl.Value,
  zero: Pwl.Value
): [Pwl.Value, Pwl.Value, Pwl.Value] => {
  const f = (x: Pwl.Value) => Pwl.add(m.at, m.sign === 1 ? x : Pwl.negate(x));
  return m.sign === 1 ? [f(lo), f(hi), f(zero)] : [f(hi), f(lo), f(zero)];
};

/**
 * Where `target` lands in `frame`'s frame on `axis`, by composing plans
 * (a plan's port): the target's box in its parent's plan, moved by each
 * ancestor's data 0 in the next ancestor's plan (reflected where y runs the
 * other way), up to the nearest node it shares with `frame`, which seats
 * both sides without solving (`seatOf`); then down to `frame`. Undefined
 * where no plan reaches: a node that is not a layer, or a scope of its own.
 */
export function planPlacement(
  target: GoFishNode,
  frame: GoFishNode,
  axis: 0 | 1
): Placement | undefined {
  if (target.resolveExtent()[axis] === undefined) return undefined;
  const up = new Set<GoFishNode>();
  for (let n: GoFishNode | undefined = frame; n; n = n.parent) up.add(n);
  let shared: GoFishNode | undefined = target.parent;
  while (shared !== undefined && !up.has(shared)) shared = shared.parent;
  if (shared === undefined || !composes(shared, axis)) return undefined;

  // The target's box and data 0 in the frame of `n`, the child of `shared`
  // that holds it.
  let n: GoFishNode = target;
  let lo: Pwl.Value;
  let hi: Pwl.Value;
  let zero: Pwl.Value;
  if (target.parent === shared) {
    const b = boxOf(target)[axis];
    if (b === undefined) return undefined;
    lo = Pwl.negate(b.descent);
    hi = b.ascent;
    zero = Pwl.ZERO;
  } else {
    let first = true;
    lo = hi = zero = Pwl.ZERO;
    while (n.parent !== shared) {
      const p = n.parent!;
      if (!composes(p, axis)) return undefined;
      p.resolveExtent();
      const plan = plans.get(p)?.[axis];
      const i = p.claimWalk!.seating().indexOf(n);
      const box = plan?.placement.boxes().get(i);
      const f = plan?.forms[i];
      if (box === undefined || f === undefined) return undefined;
      const base = Pwl.add(Pwl.add(box.lo, f.box.descent), f.zero);
      if (first) {
        [lo, hi, zero] = [box.lo, box.hi, base];
        first = false;
      } else {
        const m: Frame = { at: base, sign: flips(p, n, axis) ? -1 : 1 };
        [lo, hi, zero] = moved(m, lo, hi, zero);
      }
      n = p;
    }
  }
  const seat = seatOf(shared, n, axis);
  if (seat === undefined) return undefined;
  [lo, hi, zero] = moved(
    { at: Pwl.constant(seat), sign: flips(shared, n, axis) ? -1 : 1 },
    lo,
    hi,
    zero
  );

  // Then into `frame`'s frame: x_shared = at + sign·x_frame, inverted.
  let at: Pwl.Value = Pwl.ZERO;
  let sign: 1 | -1 = 1;
  const chain: GoFishNode[] = [];
  for (let m = frame; m !== shared; m = m.parent!) chain.push(m);
  for (const m of chain.reverse()) {
    const p = m.parent!;
    if (p !== shared && !composes(p, axis)) return undefined;
    const s = seatOf(p, m, axis);
    if (s === undefined) return undefined;
    at = Pwl.add(at, Pwl.constant(sign * s));
    if (flips(p, m, axis)) sign = -sign as 1 | -1;
  }
  [lo, hi, zero] = moved({ at: Pwl.scale(-sign, at), sign }, lo, hi, zero);
  return { lo, hi, extent: Extent(sub(hi, zero), sub(zero, lo)) };
}
