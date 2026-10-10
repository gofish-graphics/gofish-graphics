// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── Measure-keyed domains (#1114 step 5) ─────────────────────────────────────
//
// After the type walk, one pass per render builds the keyed domain table:
// for each space root, each axis and each unit (after unification), the
// domain is the union of the intervals at the top of every sharing set with
// that unit in the space. A sized node maps its keyed domain into its own size
// (`layer.tsx`, the render root in `gofish.tsx`), so values of one unit land on
// one domain wherever they sit, and values of different units never merge.
// See apps/docs/docs/internals/design/measure-keyed-domains.md, section 5.
//
// This module reads only the resolved types and the sharing plans
// (`GoFishNode.sharing()`), never a claim or a pixel.

import * as Interval from "../util/interval";
import type { SharingPlan } from "./constraints/compose";
import { unionChildSpaces } from "./graphicalOperators/alignment";
import {
  isCONTINUOUS,
  originIs,
  spaceUnit,
  type AxisTicks,
  type UnderlyingSpace,
} from "./underlyingSpace";
import type { Size } from "./dims";
import { envFlag } from "../util";

const DUMP_SCOPES = envFlag("GOFISH_DUMP_SCOPES");

/** The part of a node the table reads (duck-typed: `_node.ts` imports this
 *  module). */
export type KeyedNode = {
  readonly uid: string;
  type: string;
  children: unknown[];
  _underlyingSpace?: Size<UnderlyingSpace>;
  axisDemand: [AxisTicks | undefined, AxisTicks | undefined];
  chrome?: { content: KeyedNode };
  sharing(): SharingPlan;
};

const isKeyedNode = (n: unknown): n is KeyedNode =>
  typeof n === "object" &&
  n !== null &&
  typeof (n as KeyedNode).sharing === "function" &&
  Array.isArray((n as KeyedNode).children);

/** Where a node sits on one axis: the space root it is in, and the top of the
 *  sharing set it belongs to (itself, when its parent detaches or nests it). */
type Seat = { spaceRoot: KeyedNode; top: KeyedNode; topType?: UnderlyingSpace };

/** The key of a domain: its unit's representative, or, for values with no
 *  unit (literals), the top of their set, which is a key of its own. */
export const domainKey = (
  space: UnderlyingSpace | undefined,
  top: KeyedNode
): string => {
  const unit = spaceUnit(space)?.unit;
  const key =
    unit === undefined ? `set:${top.uid}` : `${unit.kind}:${unit.name}`;
  // An origin-less space (a middle alignment) has only widths, no data
  // positions, so its domain is the unit's domain of widths, kept apart
  // from the domain of positions.
  return originIs(space, "none") ? `${key}/width` : key;
};

/** A finite interval, or undefined (an empty column, a NaN). */
const finite = (iv: Interval.Interval): Interval.Interval | undefined =>
  Number.isFinite(iv.min) && Number.isFinite(iv.max) && iv.min <= iv.max
    ? iv
    : undefined;

/**
 * The keyed domains of one render. Built once after the type walk (and again
 * whenever a rewrite of the tree re-resolves the types), and read by every
 * sized node's σ solve, by nicing, and by axis elaboration.
 */
export class KeyedDomains {
  private readonly seats = new Map<KeyedNode, [Seat, Seat]>();
  private readonly domains = new Map<
    KeyedNode,
    [Map<string, Interval.Interval>, Map<string, Interval.Interval>]
  >();
  private readonly demand = new Map<
    KeyedNode,
    [Map<string, AxisTicks>, Map<string, AxisTicks>]
  >();

  /** The table of the tree under `root`, the render root. */
  static build(root: KeyedNode): KeyedDomains {
    const table = new KeyedDomains();
    table.walk(
      root,
      ([0, 1] as const).map((axis) => ({
        spaceRoot: root,
        top: root,
        topType: root._underlyingSpace?.[axis],
      })) as [Seat, Seat]
    );
    return table;
  }

  private tables(spaceRoot: KeyedNode) {
    let d = this.domains.get(spaceRoot);
    if (d === undefined)
      this.domains.set(spaceRoot, (d = [new Map(), new Map()]));
    let t = this.demand.get(spaceRoot);
    if (t === undefined)
      this.demand.set(spaceRoot, (t = [new Map(), new Map()]));
    return { domains: d, demand: t };
  }

  /** Add a top's interval on `axis` to its key's domain. */
  private addTop(seat: Seat, axis: 0 | 1, space: UnderlyingSpace | undefined) {
    if (space === undefined || !isCONTINUOUS(space)) return;
    const iv = finite(space.dataInterval);
    if (iv === undefined) return;
    const key = domainKey(space, seat.top);
    const { domains } = this.tables(seat.spaceRoot);
    const prior = domains[axis].get(key);
    domains[axis].set(
      key,
      prior === undefined ? iv : Interval.union(prior, iv)
    );
  }

  private walk(node: KeyedNode, seats: [Seat, Seat]): void {
    this.seats.set(node, seats);
    for (const axis of [0, 1] as const) {
      const seat = seats[axis];
      if (seat.top === node) this.addTop(seat, axis, seat.topType);
      // A continuous axis this node draws is demand for the domain of its
      // set's key: the domain is niced to its ticks (#659). A category axis
      // ticks at its keys and nices nothing.
      const ticks = node.axisDemand[axis];
      const space = node._underlyingSpace?.[axis];
      if (ticks !== undefined && space !== undefined && isCONTINUOUS(space)) {
        const key = domainKey(
          spaceUnit(space)?.unit !== undefined ? space : seat.topType,
          seat.top
        );
        this.tables(seat.spaceRoot).demand[axis].set(key, ticks);
      }
    }

    const children = node.children.filter(isKeyedNode);
    if (node.type === "coord") {
      // A coordinate transform starts a new space. Its children share both
      // axes (the coord overlays them), so the coord is the top of its own
      // set there, over the union of its children's types.
      const childTypes = children.map(
        (c) => c._underlyingSpace ?? ([undefined, undefined] as any)
      );
      const inner = ([0, 1] as const).map((axis) => {
        const type = unionChildSpaces(childTypes, axis);
        const seat: Seat = { spaceRoot: node, top: node, topType: type };
        this.addTop(seat, axis, type);
        return seat;
      }) as [Seat, Seat];
      for (const c of children) this.walk(c, inner);
      return;
    }

    const plan = node.sharing();
    node.children.forEach((child, i) => {
      if (!isKeyedNode(child)) return;
      const childSeats = ([0, 1] as const).map((axis): Seat => {
        // A child its parent detaches or nests is the top of a set of its
        // own. Any other child is in its parent's set.
        const own = plan.sets[axis][i] === 0 && !plan.nested[axis].has(i);
        return own
          ? seats[axis]
          : {
              spaceRoot: seats[axis].spaceRoot,
              top: child,
              topType: child._underlyingSpace?.[axis],
            };
      }) as [Seat, Seat];
      this.walk(child, childSeats);
    });
  }

  /**
   * The keyed domain a node maps on `axis` when its content has type `space`:
   * the domain of the content's unit in the node's space, or, when the
   * content has no unit (literals), the domain of the set the node is in
   * (`viaSet`), else the content's own interval. Undefined when the node was
   * not in the table or the content is not continuous.
   */
  domainOf(
    node: KeyedNode,
    axis: 0 | 1,
    space: UnderlyingSpace | undefined,
    viaSet: boolean
  ): Interval.Interval | undefined {
    const key = this.keyOf(node, axis, space, viaSet);
    if (key === undefined) return undefined;
    return this.tables(key.spaceRoot).domains[axis].get(key.key);
  }

  /** The ticks of an axis some node draws over the same keyed domain, or
   *  undefined when no axis is drawn over it: a keyed domain is niced iff some
   *  chart draws an axis for its key. */
  ticksOf(
    node: KeyedNode,
    axis: 0 | 1,
    space: UnderlyingSpace | undefined,
    viaSet: boolean
  ): AxisTicks | undefined {
    const key = this.keyOf(node, axis, space, viaSet);
    if (key === undefined) return undefined;
    return this.tables(key.spaceRoot).demand[axis].get(key.key);
  }

  /** A name for the keyed domain a node's axis is over (its space root and
   *  key), so two axes over one keyed domain can be told to be the same axis
   *  (`resolveAxes`). Undefined when the node is not in the table. */
  axisKey(
    node: KeyedNode,
    axis: 0 | 1,
    space: UnderlyingSpace | undefined
  ): string | undefined {
    const key = this.keyOf(node, axis, space, true);
    return key === undefined ? undefined : `${key.spaceRoot.uid}/${key.key}`;
  }

  private keyOf(
    node: KeyedNode,
    axis: 0 | 1,
    space: UnderlyingSpace | undefined,
    viaSet: boolean
  ): { spaceRoot: KeyedNode; key: string } | undefined {
    const seat = this.seats.get(node)?.[axis];
    if (seat === undefined) return undefined;
    if (spaceUnit(space)?.unit !== undefined)
      return { spaceRoot: seat.spaceRoot, key: domainKey(space, seat.top) };
    if (!viaSet) return undefined;
    return {
      spaceRoot: seat.spaceRoot,
      key: domainKey(seat.topType, seat.top),
    };
  }

  /** Behind `GOFISH_DUMP_SCOPES`, print one line per keyed domain: its
   *  space root, axis, key and domain, and whether an axis is drawn over it. */
  dump(): void {
    if (!DUMP_SCOPES) return;
    for (const line of this.print()) console.log(line);
  }

  /** One line per keyed domain. */
  print(): string[] {
    const lines: string[] = [];
    for (const [root, axes] of this.domains) {
      axes.forEach((m, axis) => {
        for (const [key, iv] of m) {
          const niced = this.demand.get(root)?.[axis].has(key) ? " axis" : "";
          lines.push(
            `[scope] domain space=${root.type}:${root.uid} axis=${axis === 0 ? "x" : "y"} ` +
              `key=${key} [${iv.min},${iv.max}]${niced}`
          );
        }
      });
    }
    return lines;
  }
}
