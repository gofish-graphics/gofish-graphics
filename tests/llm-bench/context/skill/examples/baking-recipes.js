// Baking Recipes
// A hand-drawn-style recipe card for dark chocolate brownies, its step-cell borders sized by align's new span value to exactly bound the groups of ingredient rows they apply to.

import { Constraint, enclose, layer, rect, ref, text } from "gofish-graphics";
const GREEN = "#40A03F";
const Pad = (t) =>
  enclose({ padding: 5, fill: "transparent", stroke: "none" }, [
    text({ text: t }),
  ]);
const union = (names, name) =>
  enclose(
    { padding: 0, fill: "none", stroke: "none" },
    names.map((n) => ref(n)),
  ).name(name);
const border = (name) =>
  rect({ fill: "transparent", stroke: GREEN, strokeWidth: 1 }).name(name);
const container = document.getElementById("app");
// ── Tier 0: ingredient column, stacked top-to-bottom, left-aligned ──
const tier0 = layer([
  Pad("Preheat oven to 325°F (160°C) and butter a 9x13-in. baking pan").name(
    "title",
  ),
  Pad("6 oz. (170 g) 70% cacao chocolate").name("r0"),
  Pad("6 oz. (170 g) butter").name("r1"),
  Pad("1-1/2 cup (300 g) granulated sugar").name("r2"),
  Pad("3 large eggs").name("r3"),
  Pad("1 tsp. (5 mL) vanilla extract").name("r4"),
  Pad("1 cup (125 g) all-purpose flour").name("r5"),
]).relate(({ title, r0, r1, r2, r3, r4, r5 }) => [
  Constraint.align({ x: "start" }, [title, r0, r1, r2, r3, r4, r5]),
  Constraint.distribute({ dir: "y", spacing: 0 }, [
    title,
    r0,
    r1,
    r2,
    r3,
    r4,
    r5,
  ]),
]);
// ── Tier 1: row/column unions over the ingredient column ──
const tier1 = layer([tier0]).relate(() => [
  union(["r0", "r1", "r2", "r3", "r4", "r5"], "col0"),
  union(["r0", "r1"], "row0_1"),
  union(["r0", "r1", "r2"], "row0_2"),
  union(["r3", "r4"], "row3_4"),
  union(["r0", "r4"], "row0_4"),
  union(["r0", "r5"], "row0_5"),
]);
// ── Tier 2: "melt in double boiler" (A1), "stir in" (B), "lightly
// beat" (A2) — A1 sits right of col0 centered on rows 0-1; B sits
// right of A1 centered on rows 0-2; A2 shares A1's column (left-
// aligned to A1, not B) centered on rows 3-4.
const tier2 = layer([
  tier1,
  Pad("melt in double boiler").name("A1"),
  Pad("stir in").name("B"),
  Pad("lightly beat").name("A2"),
]).relate(({ col0, row0_1, row0_2, row3_4, A1, B, A2 }) => [
  Constraint.distribute({ dir: "x", spacing: 0 }, [col0, A1]),
  Constraint.align({ y: "middle" }, [row0_1, A1]),
  Constraint.distribute({ dir: "x", spacing: 0 }, [A1, B]),
  Constraint.align({ y: "middle" }, [row0_2, B]),
  Constraint.align({ y: "middle" }, [row3_4, A2]),
  Constraint.align({ x: "start" }, [A1, A2]),
]);
// ── Tier 3: col1_2 = union(A1, B, A2) — the column-group C is
// distributed after.
const tier3 = layer([tier2]).relate(() => [union(["A1", "B", "A2"], "col1_2")]);
// ── Tier 4: "stir in" (C), right of col1_2, centered on rows 0-4 ──
const tier4 = layer([tier3, Pad("stir in").name("C")]).relate(
  ({ col1_2, row0_4, C }) => [
    Constraint.distribute({ dir: "x", spacing: 0 }, [col1_2, C]),
    Constraint.align({ y: "middle" }, [row0_4, C]),
  ],
);
// ── Tier 5: col1_3 = union(col1_2, C) ──
const tier5 = layer([tier4]).relate(() => [union(["col1_2", "C"], "col1_3")]);
// ── Tier 6: "stir in" (D), right of C; "bake..." (E), right of D —
// both centered on rows 0-5.
const tier6 = layer([
  tier5,
  Pad("stir in").name("D"),
  Pad("bake 325°F (160°C) for 35 min.").name("E"),
]).relate(({ C, row0_5, D, E }) => [
  Constraint.distribute({ dir: "x", spacing: 0 }, [C, D]),
  Constraint.align({ y: "middle" }, [row0_5, D]),
  Constraint.distribute({ dir: "x", spacing: 0 }, [D, E]),
  Constraint.align({ y: "middle" }, [row0_5, E]),
]);
// ── Tier 7: col0_5 = union(r0, E) — full table width, used to span
// the title's border underneath it.
const tier7 = layer([tier6]).relate(() => [union(["r0", "E"], "col0_5")]);
// ── Tier 8: the 12 cell borders, each sized by align's new "span"
// value against the horizontal/vertical group it bounds — the direct
// translation of Bluefish's `CellBorder`'s two `LayoutFunction` calls.
const tier8 = layer([
  tier7,
  border("bR0"),
  border("bR1"),
  border("bR2"),
  border("bR3"),
  border("bR4"),
  border("bR5"),
  border("bA1"),
  border("bB"),
  border("bA2"),
  border("bC"),
  border("bE"),
  border("bTitle"),
]).relate(
  ({
    col0,
    r0,
    r1,
    r2,
    r3,
    r4,
    r5,
    bR0,
    bR1,
    bR2,
    bR3,
    bR4,
    bR5,
    A1,
    row0_1,
    bA1,
    col1_2,
    row0_2,
    bB,
    row3_4,
    bA2,
    col1_3,
    row0_4,
    bC,
    E,
    row0_5,
    bE,
    col0_5,
    title,
    bTitle,
  }) => [
    // Each ingredient row: full col0 width x that row's own height.
    Constraint.align({ x: "span" }, [col0, bR0]),
    Constraint.align({ y: "span" }, [r0, bR0]),
    Constraint.align({ x: "span" }, [col0, bR1]),
    Constraint.align({ y: "span" }, [r1, bR1]),
    Constraint.align({ x: "span" }, [col0, bR2]),
    Constraint.align({ y: "span" }, [r2, bR2]),
    Constraint.align({ x: "span" }, [col0, bR3]),
    Constraint.align({ y: "span" }, [r3, bR3]),
    Constraint.align({ x: "span" }, [col0, bR4]),
    Constraint.align({ y: "span" }, [r4, bR4]),
    Constraint.align({ x: "span" }, [col0, bR5]),
    Constraint.align({ y: "span" }, [r5, bR5]),
    // "melt in double boiler": its own extent x rows 0-1.
    Constraint.align({ x: "span" }, [A1, bA1]),
    Constraint.align({ y: "span" }, [row0_1, bA1]),
    // "stir in" (B): spans A1+B+A2's combined column width x rows 0-2
    // — Bluefish's own `col1_2` group, reused verbatim (see header note).
    Constraint.align({ x: "span" }, [col1_2, bB]),
    Constraint.align({ y: "span" }, [row0_2, bB]),
    // "lightly beat" (A2): same wide col1_2 span x rows 3-4.
    Constraint.align({ x: "span" }, [col1_2, bA2]),
    Constraint.align({ y: "span" }, [row3_4, bA2]),
    // "stir in" (C): col1_2+C's combined width x rows 0-4 (excludes
    // the flour row — matches Bluefish's `row0_4`/`col1_3` groups).
    Constraint.align({ x: "span" }, [col1_3, bC]),
    Constraint.align({ y: "span" }, [row0_4, bC]),
    // "bake...": its own column width x all 6 rows. (D, the second
    // "stir in", gets no border of its own in the original either —
    // faithfully reproduced, not an omission.)
    Constraint.align({ x: "span" }, [E, bE]),
    Constraint.align({ y: "span" }, [row0_5, bE]),
    // Title strip: full table width (col0_5 = col0 through E) x the
    // title cell's own height.
    Constraint.align({ x: "span" }, [col0_5, bTitle]),
    Constraint.align({ y: "span" }, [title, bTitle]),
  ],
);
const tableBg = enclose(
  { padding: 0, fill: "#FFFFFF", stroke: GREEN, strokeWidth: 3 },
  [tier8],
);
// Bluefish's `Background` wraps the TITLE and the TABLE together (10px
// gap between them, 50px padding around the pair) — the title sits
// INSIDE the pale-green card, not floating above/outside it.
const titledTable = layer([
  text({ text: "Dark Chocolate Brownies (makes 24 squares)" }).name(
    "recipeName",
  ),
  tableBg.name("table"),
]).relate(({ recipeName, table }) => [
  Constraint.align({ x: "start" }, [recipeName, table]),
  Constraint.distribute({ dir: "y", spacing: 10 }, [recipeName, table]),
]);
const greenBg = enclose(
  { padding: 50, fill: "#7CD4AC", stroke: "none", opacity: 0.3 },
  [titledTable],
);
layer([greenBg]).render(container, {});
