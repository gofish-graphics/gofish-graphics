// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

// A layer's plan (#1176): one solve in values in σ over every child, by its
// box, with the solver's own fallbacks for whatever no constraint pins. The
// envelopes of the children where the solve places them are the layer's
// claim, its box and its plot. A node deep inside a layer lands where the
// plans of the layers between compose (`planPlacement`).

import { GoFishNode } from "../_node";
import { hasOrigin } from "../underlyingSpace";
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
import {
  getPositioningConstraintRefs,
  type AlignConstraint,
  type ConstraintSpec,
} from "../constraints";
import { childNameKey } from "../constraints/shared";

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
   *  its data 0. `whole` is its claim. Undefined when no child takes room
   *  (they all fill the room the layer is given). */
  summary: ChildForms | undefined;
};

/** `c`'s plan on `axis`, when it is a layer that is no scope of its own
 *  there (a size of its own is its claim). */
const planOf = (c: GoFishAST, axis: 0 | 1): LayerPlan | undefined =>
  c instanceof GoFishNode && c.claimWalk?.ownScope[axis] === false
    ? c.claimWalk.plan(axis)
    : undefined;

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
      const rec = planOf(c, axis)?.summary;
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
 * Whether `c` places itself on `axis` as it is laid out: a layer's literal
 * start, a shape's start or center, a pixel or a datum (`positionOf` in its
 * layout), or a node its own layout places from the refs it reads
 * (`GoFishNode.placedByLayout`). Layout pins it where it put itself, so the
 * plan takes it there (`at:`).
 */
export const placesItself = (c: GoFishAST, axis: 0 | 1): boolean => {
  if (!(c instanceof GoFishNode)) return false;
  if (c.placedByLayout?.[axis] === true) return true;
  if (c.claimWalk !== undefined)
    return c.claimWalk.literalStart[axis] !== undefined;
  const d = (c.args?.dims as { min?: unknown; center?: unknown }[])?.[axis];
  return d?.min !== undefined || d?.center !== undefined;
};

/**
 * Whether layout hands `node` a region on `axis` (`buildChildProposals`):
 * its parent layer's cell for it spans the axis, or the parent passes on to
 * it the region the parent was handed, to a child whose cell leaves the
 * axis open or that no constraint places.
 */
const handedRegion = (node: GoFishAST, axis: 0 | 1): boolean => {
  const p = node.parent;
  if (!(p instanceof GoFishNode) || (p.type !== "layer" && p.type !== "box"))
    return false;
  const key = childNameKey(node);
  if (key === undefined) return false;
  for (const c of p.constraints)
    if (c.type === "position" && c.region !== undefined)
      if (c.children.some((r) => r?.name === key))
        return c.region.spans[axis] !== undefined || handedRegion(p, axis);
  return (
    !getPositioningConstraintRefs(p.constraints).has(key) &&
    handedRegion(p, axis)
  );
};

/**
 * `constraints` as the solve sees them once layout has handed each child
 * its region (`placementConstraints`): an `align` loses each axis on which
 * every one of its operands is handed a region (`handedRegion`), since the
 * region placed them there, and goes when it has no axis left. A partition
 * inside another partition's cell is such a case.
 */
const withoutSpannedAligns = (
  node: GoFishNode,
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>
): ConstraintSpec[] => {
  const spanned = (c: AlignConstraint, axis: 0 | 1) =>
    c.children.every((r) => {
      const op = operands.get(r.name);
      return op?.direct === true && handedRegion(node.children[op.child], axis);
    });
  const out: ConstraintSpec[] = [];
  for (const c of constraints) {
    if (c.type !== "align") {
      out.push(c);
      continue;
    }
    const x = c.x !== undefined && spanned(c, 0) ? undefined : c.x;
    const y = c.y !== undefined && spanned(c, 1) ? undefined : c.y;
    if (x === c.x && y === c.y) out.push(c);
    else if (x !== undefined || y !== undefined) out.push({ ...c, x, y });
  }
  return out;
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
  const rec = planOf(c, axis)?.summary;
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
 * its extent (`claimChildren` in `layer`). `nested` is where an operand
 * nested in a child lands in that child's own frame
 * (`planPlacementInChild`). `ring` says the layer is a ring of chrome, whose
 * children past the first are chrome.
 */
export function buildPlan(
  node: GoFishNode,
  axis: 0 | 1,
  children: ClaimChild[],
  constraints: ConstraintSpec[],
  operands: Map<string, { child: number; direct: boolean }>,
  nested: (name: string) => Placement | undefined,
  ring: boolean,
  scale: number
): LayerPlan {
  // A child placed where its refs land is placed by what it draws: its
  // forms are where it is placed, all of them box.
  const forms = children.map((c, i): ChildForms | undefined =>
    c.extent !== undefined
      ? formsOf(node, node.children[i], c.extent, axis)
      : c.fromRefs && c.placed !== undefined
        ? {
            whole: c.placed.extent,
            box: c.placed.extent,
            plot: c.placed.extent,
            zero: Pwl.ZERO,
          }
        : undefined
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
    withoutSpannedAligns(node, constraints, operands),
    operands,
    new Set(node.children.map((_, i) => i)),
    // Into this layer's reading of the container: moved by its data 0 there
    // and reflected where its y runs the other way, as `formsOf` reads it.
    (name) => {
      const op = operands.get(name);
      const f = op && forms[op.child];
      const p = f && nested(name);
      if (op === undefined || f === undefined || p === undefined)
        return undefined;
      const sign = flips(node, node.children[op.child], axis) ? -1 : 1;
      const [lo, hi, zero] = moved(
        { at: f.zero, sign },
        p.lo,
        p.hi,
        sub(p.hi, p.extent.ascent)
      );
      return { lo, hi, extent: Extent(sub(hi, zero), sub(zero, lo)) };
    },
    hasOrigin(node._underlyingSpace?.[axis])
  );
  const box: [Pwl.Value[], Pwl.Value[]] = [[], []];
  const whole: [Pwl.Value[], Pwl.Value[]] = [[], []];
  const plot: [Pwl.Value[], Pwl.Value[]] = [[], []];
  for (const [i, b] of placement.boxes()) {
    const f = forms[i];
    box[0].push(b.hi);
    box[1].push(Pwl.negate(b.lo));
    // A child in a region's cell takes its cell as room.
    const room = placement.rooms.get(i);
    const roomOn = (to: [Pwl.Value[], Pwl.Value[]]) => {
      if (room === undefined) return;
      to[0].push(room.hi);
      to[1].push(Pwl.negate(room.lo));
    };
    roomOn(box);
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
    roomOn(whole);
    if (placement.dressing.has(i) || placement.ink.has(i) || (ring && i > 0))
      continue;
    // A child that is all dressing (a layer of outlines around refs) has no
    // plot: it adds nothing to the layer's.
    if (f !== undefined && f.plot === undefined) continue;
    const [pHi, pLo] = reach(f?.plot);
    plot[0].push(pHi);
    plot[1].push(pLo);
    roomOn(plot);
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
  return { placement, forms, summary };
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
 * `target`'s box and data 0 up the plans of its ancestors to `n`, the
 * child of `stop` that holds it, in `n`'s frame: the box in its parent's
 * plan, moved by each ancestor's data 0 in the next one's plan (reflected
 * where y runs the other way). Undefined where a plan does not place it.
 */
const throughPlans = (
  target: GoFishNode,
  stop: GoFishNode,
  axis: 0 | 1
): { n: GoFishNode; at: [Pwl.Value, Pwl.Value, Pwl.Value] } | undefined => {
  let n = target;
  let at: [Pwl.Value, Pwl.Value, Pwl.Value] | undefined;
  while (n.parent !== stop) {
    const p = n.parent;
    if (p === undefined || !composes(p, axis)) return undefined;
    const plan = p.claimWalk!.plan(axis);
    const i = p.claimWalk!.seating().indexOf(n);
    const box = plan?.placement.boxes().get(i);
    const f = plan?.forms[i];
    if (box === undefined || f === undefined) return undefined;
    const base = Pwl.add(Pwl.add(box.lo, f.box.descent), f.zero);
    at =
      at === undefined
        ? [box.lo, box.hi, base]
        : moved({ at: base, sign: flips(p, n, axis) ? -1 : 1 }, ...at);
    n = p;
  }
  return at === undefined ? undefined : { n, at };
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
    const walked = throughPlans(target, shared, axis);
    if (walked === undefined) return undefined;
    [lo, hi, zero] = walked.at;
    n = walked.n;
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

/**
 * Where `target`, nested in `container`, lands in the container's own
 * frame on `axis`, by the plans from the target up to the container's
 * (`throughPlans`): its offset inside the container, which holds wherever
 * its parent's solve places the container. Undefined where no plan reaches.
 */
export function planPlacementInChild(
  target: GoFishNode,
  container: GoFishNode,
  axis: 0 | 1
): Placement | undefined {
  const walked =
    container.parent && throughPlans(target, container.parent, axis);
  if (walked === undefined || walked.n !== container) return undefined;
  const [lo, hi, zero] = walked.at;
  return { lo, hi, extent: Extent(sub(hi, zero), sub(zero, lo)) };
}
