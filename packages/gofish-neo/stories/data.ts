// Sample datasets for the gofish-neo confusion-matrix stories. Kept as a
// standalone module (not in `src/`) so the docs example scanner treats it as
// a dataset — gallery snippets import from here and its contents are shown
// alongside the example.

import type { Confusion } from "../src";

/** Builds one `Confusion` record per (actual, observed) pair with a nonzero
 *  count; pairs absent from `counts` are left at 0 in the built matrix — the
 *  simplest way to author "at least one zero cell" (just omit the pair). */
function fromCounts(
  counts: Record<string, Record<string, number>>
): Confusion[] {
  const out: Confusion[] = [];
  for (const actual of Object.keys(counts)) {
    for (const [observed, count] of Object.entries(counts[actual]!)) {
      if (count <= 0) continue;
      out.push({ actual: [actual], observed: [observed], count });
    }
  }
  return out;
}

// ─── animalsFlat: single dimension, 5 flat classes ─────────────────────────
// A strong diagonal (mostly-correct classifier) with plausible cross-class
// confusion and one true zero cell (dog↔fish never confused).
export const animalsFlat: Confusion[] = fromCounts({
  "animal:cat": {
    "animal:cat": 42,
    "animal:dog": 5,
    "animal:bird": 1,
    "animal:fish": 2,
  },
  "animal:dog": { "animal:dog": 38, "animal:cat": 6, "animal:bird": 1 },
  "animal:bird": {
    "animal:bird": 30,
    "animal:cat": 2,
    "animal:fish": 1,
    "animal:snake": 1,
  },
  "animal:fish": { "animal:fish": 25, "animal:snake": 3, "animal:bird": 2 },
  "animal:snake": { "animal:snake": 20, "animal:fish": 2, "animal:bird": 1 },
});

// ─── animalsHierarchical: one dimension, 2-level hierarchy, 6 leaves ───────
// animal → mammal{cat, dog, fox}, bird{owl, crow}, reptile{lizard}. More
// confusion WITHIN a parent group (cat/dog/fox, owl/crow) than ACROSS groups
// — the story a hierarchical matrix is meant to tell — plus several zero
// cells (e.g. lizard is never confused with a bird).
export const animalsHierarchical: Confusion[] = fromCounts({
  "animal:mammal:cat": {
    "animal:mammal:cat": 46,
    "animal:mammal:dog": 7,
    "animal:mammal:fox": 4,
    "animal:bird:owl": 1,
  },
  "animal:mammal:dog": {
    "animal:mammal:dog": 40,
    "animal:mammal:cat": 8,
    "animal:mammal:fox": 3,
  },
  "animal:mammal:fox": {
    "animal:mammal:fox": 22,
    "animal:mammal:dog": 5,
    "animal:mammal:cat": 3,
  },
  "animal:bird:owl": {
    "animal:bird:owl": 28,
    "animal:bird:crow": 6,
    "animal:mammal:cat": 1,
  },
  "animal:bird:crow": {
    "animal:bird:crow": 24,
    "animal:bird:owl": 5,
  },
  "animal:reptile:lizard": {
    "animal:reptile:lizard": 18,
    "animal:mammal:fox": 1,
  },
});

// ─── checkoutMultiOutput: two output dimensions per record ─────────────────
// A point-of-sale classifier predicts both `beverage` (soda/water/coffee) and
// `size` (small/large) for the same transaction; actual/observed can each
// carry both dimensions, so nesting (`classes: ["beverage", "size"]`) and
// conditioning (`where: {qualifier, label: "size", is: "size:large"}`) both
// have something interesting to show.
export const checkoutMultiOutput: Confusion[] = [
  // beverage correct, size correct (the bulk of the traffic)
  {
    actual: ["beverage:soda", "size:small"],
    observed: ["beverage:soda", "size:small"],
    count: 50,
  },
  {
    actual: ["beverage:soda", "size:large"],
    observed: ["beverage:soda", "size:large"],
    count: 34,
  },
  {
    actual: ["beverage:water", "size:small"],
    observed: ["beverage:water", "size:small"],
    count: 40,
  },
  {
    actual: ["beverage:water", "size:large"],
    observed: ["beverage:water", "size:large"],
    count: 18,
  },
  {
    actual: ["beverage:coffee", "size:small"],
    observed: ["beverage:coffee", "size:small"],
    count: 30,
  },
  {
    actual: ["beverage:coffee", "size:large"],
    observed: ["beverage:coffee", "size:large"],
    count: 36,
  },
  // beverage correct, size confused
  {
    actual: ["beverage:soda", "size:small"],
    observed: ["beverage:soda", "size:large"],
    count: 6,
  },
  {
    actual: ["beverage:soda", "size:large"],
    observed: ["beverage:soda", "size:small"],
    count: 4,
  },
  {
    actual: ["beverage:coffee", "size:small"],
    observed: ["beverage:coffee", "size:large"],
    count: 8,
  },
  {
    actual: ["beverage:coffee", "size:large"],
    observed: ["beverage:coffee", "size:small"],
    count: 5,
  },
  // beverage confused (water/coffee mix-up — both hot-cup-shaped at checkout),
  // size held correct
  {
    actual: ["beverage:water", "size:small"],
    observed: ["beverage:coffee", "size:small"],
    count: 7,
  },
  {
    actual: ["beverage:coffee", "size:small"],
    observed: ["beverage:water", "size:small"],
    count: 5,
  },
  {
    actual: ["beverage:water", "size:large"],
    observed: ["beverage:coffee", "size:large"],
    count: 4,
  },
  // soda is never confused with water/coffee (different packaging) — leaves
  // real zero cells at the beverage level once collapsed/marginalized.
];
