/**
 * The keyed domain table (`keyedDomains.ts`, #1114 step 5): per space root,
 * axis and unit, the union of the intervals at the top of every sharing set
 * with that unit. Built over small stand-in nodes, so each check names the
 * sharing sets it relies on.
 *
 * Run: `tsx src/tests/keyedDomains.test.ts` (wired as
 * `pnpm test:keyed-domains`).
 */
import { KeyedDomains, type KeyedNode } from "../ast/keyedDomains";
import type { SharingPlan } from "../ast/constraints/compose";
import {
  CONTINUOUS,
  ORDINAL,
  UNDEFINED,
  quantityUnits,
  type UnderlyingSpace,
  type UnitRecord,
} from "../ast/underlyingSpace";
import { Units, withUnits } from "../ast/measure";
import { DEFAULT_AXIS_TICKS } from "../ast/underlyingSpace";
import { interval, type Interval } from "../util/interval";

let failed = 0;
let passed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
};
const same = (a: Interval | undefined, min: number, max: number) =>
  a !== undefined && a.min === min && a.max === max;

let uid = 0;
/** A stand-in node: its y type, its children, and which of them it detaches
 *  on y (`detached`) or nests (`nested`). x is undefined throughout. */
const node = (
  y: UnderlyingSpace,
  children: KeyedNode[] = [],
  opts: { detached?: number[]; nested?: number[]; type?: string } = {}
): KeyedNode => {
  const sets = children.map((_, i) =>
    opts.detached?.includes(i) ? i + 1 : 0
  );
  const plan: SharingPlan = {
    sets: [children.map(() => 0), sets],
    nested: [new Set(), new Set(opts.nested ?? [])],
  };
  return {
    uid: `n${uid++}`,
    type: opts.type ?? "layer",
    ...(opts.type === "coord" ? { _space: {} } : {}),
    children,
    _underlyingSpace: [UNDEFINED, y],
    axisDemand: [undefined, undefined],
    sharing: () => plan,
  };
};
const pinned = (min: number, max: number, measure?: UnitRecord) =>
  CONTINUOUS(interval(min, max), "pinned", measure);

withUnits(new Units(), () => {
  const count = quantityUnits({ name: "count", unit: "count" });
  const mm = quantityUnits({ name: "Beak Depth (mm)" });
  const year = quantityUnits({ name: "year" });

  console.log("# keyed domains: one domain per unit");
  {
    // Two detached panels plotting one column share a domain: the faceted
    // scatter's x.
    const a = node(pinned(1955, 2010, year));
    const b = node(pinned(1955, 2000, year));
    const root = node(UNDEFINED, [a, b], { detached: [0, 1], nested: [0, 1] });
    const table = KeyedDomains.build(root);
    ok(
      "detached children with the same column share one domain",
      same(table.domainOf(b, 1, b._underlyingSpace![1], true), 1955, 2010),
      table.domainOf(b, 1, b._underlyingSpace![1], true)
    );
  }
  {
    // The marginal histogram's y: the count panel is detached, so its
    // domain never meets the scatter's millimeters.
    const scatter = node(pinned(13, 21, mm));
    const hist = node(pinned(0, 40, count));
    const root = node(pinned(13, 21, mm), [scatter, hist], { detached: [1] });
    const table = KeyedDomains.build(root);
    ok(
      "a detached child with another unit keeps its own domain",
      same(table.domainOf(hist, 1, hist._underlyingSpace![1], true), 0, 40)
    );
    ok(
      "the root's domain is its own unit's",
      same(table.domainOf(root, 1, root._underlyingSpace![1], true), 13, 21)
    );
  }
  {
    // Two detached charts of one declared unit share a domain, and an
    // intervening top of another unit does not split it.
    const left = node(pinned(0, 10, count));
    const right = node(pinned(0, 30, count));
    const root = node(UNDEFINED, [left, right], { detached: [0, 1] });
    const table = KeyedDomains.build(root);
    ok(
      "detached children with the same declared unit share one domain",
      same(table.domainOf(left, 1, left._underlyingSpace![1], true), 0, 30)
    );
  }

  console.log("# keyed domains: values with no unit");
  {
    // NestedCharts: literal bars in one set share the set's domain, read
    // through the set (`viaSet`), since they carry no unit of their own.
    const mini1 = node(pinned(0, 40));
    const mini2 = node(pinned(0, 95));
    const root = node(pinned(0, 95), [mini1, mini2]);
    const table = KeyedDomains.build(root);
    ok(
      "values with no unit share the domain of their set",
      same(table.domainOf(mini1, 1, mini1._underlyingSpace![1], true), 0, 95)
    );
    ok(
      "without the set, values with no unit have no keyed domain",
      table.domainOf(mini1, 1, mini1._underlyingSpace![1], false) ===
        undefined
    );
  }
  {
    // Two detached sets of literals are two domains.
    const a = node(pinned(0, 40));
    const b = node(pinned(0, 95));
    const root = node(UNDEFINED, [a, b], { detached: [0, 1] });
    const table = KeyedDomains.build(root);
    ok(
      "detached sets with no unit keep their own domains",
      same(table.domainOf(a, 1, a._underlyingSpace![1], true), 0, 40)
    );
  }

  console.log("# keyed domains: space roots");
  {
    // A coordinate transform starts a new space: the same unit inside it is
    // another domain.
    const petals = node(pinned(0, 7, count));
    const flower = node(UNDEFINED, [petals], { type: "coord" });
    const stem = node(pinned(0, 50, count));
    const root = node(pinned(0, 50, count), [stem, flower]);
    const table = KeyedDomains.build(root);
    ok(
      "a coord's children are keyed in the coord's own space",
      same(
        table.domainOf(petals, 1, petals._underlyingSpace![1], true),
        0,
        7
      )
    );
    ok(
      "the outer space does not see the coord's domain",
      same(table.domainOf(stem, 1, stem._underlyingSpace![1], true), 0, 50)
    );
  }

  console.log("# keyed domains: nicing demand");
  {
    const panel = node(pinned(1955, 2000, year));
    const other = node(pinned(1955, 2010, year));
    panel.axisDemand[1] = DEFAULT_AXIS_TICKS;
    const root = node(UNDEFINED, [panel, other], { detached: [0, 1] });
    const table = KeyedDomains.build(root);
    ok(
      "an axis over a keyed domain nices it wherever the unit sits",
      table.ticksOf(other, 1, other._underlyingSpace![1], true) ===
        DEFAULT_AXIS_TICKS
    );
  }
  {
    const cats = node(ORDINAL(["a", "b"]));
    const bars = node(pinned(0, 9));
    cats.axisDemand[1] = DEFAULT_AXIS_TICKS;
    const root = node(UNDEFINED, [cats, bars]);
    const table = KeyedDomains.build(root);
    ok(
      "a category axis nices nothing",
      table.ticksOf(bars, 1, bars._underlyingSpace![1], true) === undefined
    );
  }
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
