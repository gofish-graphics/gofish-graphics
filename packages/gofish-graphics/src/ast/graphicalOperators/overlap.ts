// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * Overlap strategies for `scatter`'s `overlap` option.
 *
 * A scatter places each child on the axes a field gives it and lines the
 * children up on every other ("free") axis at the scatter's `alignment`. When
 * the children are dots, many of them land on top of each other. An overlap
 * strategy takes the place of that alignment on the free axis: it moves each
 * child along the free axis, away from the alignment line, so the children no
 * longer overlap.
 *
 * A strategy is a plain object made by a function call (`swarm({ padding })`),
 * so it crosses the Python bridge as IR and can take more parameters later.
 * `kind` names the strategy. Every strategy sees the children the same way:
 * as their enclosing circles, one {@link OverlapItem} each, in data order. It
 * answers with the offset of each circle's center from the alignment line
 * ({@link OverlapResolver}). The shared broad phase for "which placed children
 * are near this one" is {@link NeighborGrid}.
 *
 * Only built-in strategies are public. {@link ResolverStrategy} is an internal
 * hook that carries its own resolver function, for prototyping a strategy
 * before it gets a name and an IR shape; it is not exported from the library
 * and does not serialize.
 */

/** `swarm()`: a beeswarm. See {@link swarm}. */
export type SwarmStrategy = { kind: "swarm"; padding?: number };

/** Every built-in overlap strategy. */
export type OverlapStrategy = SwarmStrategy;

/**
 * A beeswarm. Each dot keeps its position on the data axis and moves along the
 * free axis to the free spot nearest the alignment line, in data order. This
 * is Observable Plot's `dodge`. Shapes other than circles are placed by their
 * enclosing circle.
 *
 * @param padding Pixels kept between neighboring dots. Default 0.
 */
export function swarm(opts: { padding?: number } = {}): SwarmStrategy {
  const { padding } = opts;
  if (padding !== undefined && !(Number.isFinite(padding) && padding >= 0))
    throw new Error(
      `[gofish] swarm: padding must be a non-negative number, got ${padding}`
    );
  return padding === undefined ? { kind: "swarm" } : { kind: "swarm", padding };
}

/** One child as an overlap strategy sees it: the pixel position of its
 *  enclosing circle's center on the data axis, and that circle's radius. */
export type OverlapItem = { at: number; r: number };

/**
 * Where the children grow from. `"middle"` grows both ways from the line.
 * `"start"` keeps every child on the line's positive side (each child's start
 * edge at or past the line), and `"end"` on its negative side.
 */
export type OverlapSide = "middle" | "start" | "end";

/** A strategy's placement rule: the free-axis offset of each item's center
 *  from the alignment line, in item order. Contract: a strategy moves only the
 *  free axis; it returns one free-axis number per child and cannot touch the
 *  data axis, which scatter alone places. */
export type OverlapResolver = (
  items: OverlapItem[],
  side: OverlapSide
) => number[];

/** Internal hook: a strategy that carries its own resolver. Not serializable,
 *  not exported from the library; for prototypes only. */
export type ResolverStrategy = { kind: "resolver"; resolve: OverlapResolver };

/** What `scatter` and the overlap constraint accept internally. */
export type AnyOverlapStrategy = OverlapStrategy | ResolverStrategy;

const RESOLVERS: {
  [K in AnyOverlapStrategy["kind"]]: (
    strategy: Extract<AnyOverlapStrategy, { kind: K }>
  ) => OverlapResolver;
} = {
  swarm: (s) => (items, side) => swarmOffsets(items, side, s.padding ?? 0),
  resolver: (s) => s.resolve,
};

/** Run a strategy: the free-axis offset of each item's center from the
 *  alignment line. */
export function resolveOverlap(
  strategy: AnyOverlapStrategy,
  items: OverlapItem[],
  side: OverlapSide
): number[] {
  const make = RESOLVERS[strategy?.kind] as
    | ((s: AnyOverlapStrategy) => OverlapResolver)
    | undefined;
  if (make === undefined)
    throw new Error(
      `[gofish] scatter overlap: unknown strategy kind ` +
        `"${(strategy as { kind?: unknown })?.kind}". Make one with swarm().`
    );
  items.forEach(({ at, r }, i) => {
    if (!Number.isFinite(at) || !Number.isFinite(r))
      throw new Error(
        `[gofish] scatter overlap: child ${i} has no finite position or ` +
          `size (position ${at}, radius ${r})`
      );
  });
  return make(strategy)(items, side);
}

/**
 * The broad phase every strategy shares: placed items bucketed by data-axis
 * position into cells of a fixed width. With a cell width of twice the largest
 * radius plus the padding, any item close enough to touch another lies in the
 * same cell or the one beside it.
 */
export class NeighborGrid {
  private readonly cells = new Map<number, number[]>();
  constructor(
    private readonly items: OverlapItem[],
    readonly cellWidth: number
  ) {}

  /** A grid sized so neighbors that can touch are at most one cell apart. */
  static forItems(items: OverlapItem[], padding: number): NeighborGrid {
    const maxR = items.reduce((m, it) => Math.max(m, it.r), 0);
    return new NeighborGrid(items, 2 * maxR + padding);
  }

  private cellOf(at: number): number {
    return this.cellWidth > 0 ? Math.floor(at / this.cellWidth) : 0;
  }

  /** Record item `i` as placed. */
  insert(i: number): void {
    const cell = this.cellOf(this.items[i].at);
    const bucket = this.cells.get(cell);
    if (bucket) bucket.push(i);
    else this.cells.set(cell, [i]);
  }

  /** The placed items within `reach` cells of data-axis position `at`. */
  *near(at: number, reach = 1): Generator<number> {
    const cell = this.cellOf(at);
    for (let c = cell - reach; c <= cell + reach; c++)
      yield* this.cells.get(c) ?? [];
  }
}

/** Below this, two intervals that touch count as touching, not overlapping. */
const EPS = 1e-6;

/**
 * The beeswarm placement (Observable Plot's `dodge`, with a uniform grid as the
 * broad phase in place of Plot's interval tree).
 *
 * Items are placed one at a time in order. Each placed neighbor `j` within
 * reach rules out the free-axis interval `yj ± sqrt(dr² − dx²)`, where
 * `dr = ri + rj + padding` and `dx` is the distance between the two centers on
 * the data axis: inside it the two circles (plus padding) would overlap. The
 * candidates are the line itself and the ends of those intervals; the item
 * takes the free candidate nearest the line.
 *
 * @returns The offset of each item's center from the line, in item order.
 */
export function swarmOffsets(
  items: OverlapItem[],
  side: OverlapSide,
  padding = 0
): number[] {
  const offsets = new Array<number>(items.length);
  const grid = NeighborGrid.forItems(items, padding);

  // Lower cost = nearer the line on the allowed side.
  const cost = (y: number) =>
    side === "middle" ? Math.abs(y) : side === "start" ? y : -y;

  items.forEach(({ at, r }, i) => {
    // The nearest allowed center: on the line, or a radius off it on a side.
    const base = side === "start" ? r : side === "end" ? -r : 0;
    const blocked: [number, number][] = [];
    const candidates: number[] = [base];
    for (const j of grid.near(at)) {
      const dx = at - items[j].at;
      const dr = r + items[j].r + padding;
      if (Math.abs(dx) >= dr) continue;
      const dy = Math.sqrt(dr * dr - dx * dx);
      const yj = offsets[j];
      blocked.push([yj - dy, yj + dy]);
      candidates.push(yj - dy, yj + dy);
    }
    const allowed = candidates.filter((y) =>
      side === "start"
        ? y >= base - EPS
        : side === "end"
          ? y <= base + EPS
          : true
    );
    // A stable sort keeps insertion order among ties, so a tie between the
    // two sides of a neighbor goes to the side found first.
    allowed.sort((a, b) => cost(a) - cost(b));
    // The farthest end of every blocked interval is always free, so a free
    // candidate always exists.
    offsets[i] = allowed.find((y) =>
      blocked.every(([lo, hi]) => !(lo + EPS < y && y < hi - EPS))
    )!;
    grid.insert(i);
  });
  return offsets;
}
