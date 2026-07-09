import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Constraint, Layer, enclose, ref, rect, text } from "../../src/lib";

// Ported from Bluefish's example-gallery brownie.tsx (#437): a recipe card
// ("Dark Chocolate Brownies, makes 24 squares") — a title line above a
// hand-drawn-table-style grid: a left column of 6 ingredient rows, and to
// its right a sequence of step cells ("melt in double boiler", "stir in"
// x3, "lightly beat", "bake") whose borders span exactly the group of
// ingredient rows each step applies to. Green (#7CD4AC @ 0.3) padded
// background around a white, green-stroked table.
//
// THE PORT'S POINT: Bluefish's `CellBorder` helper is a transparent rect
// whose x-span/y-span are FORCED to match a horizontal/vertical `Ref`
// selection via two `LayoutFunction` calls (`f={({left,width,right}) =>
// ({left,width,right})}` and the vertical analog). That is exactly
// `Constraint.align({x:"span"}, [source, target])` /
// `Constraint.align({y:"span"}, [source, target])`, GoFish's new align
// value implemented on this branch (see `AlignSpan` in
// stories/lowlevel/Constraints.stories.tsx) — this story is its
// highest-stakes real-world exercise: 12 border cells, several of them
// spanning UNIONS of other cells (Bluefish's ad hoc `<Group>` of `<Ref>`s).
//
// GROUP-OF-REFS, GoFish equivalent: Bluefish's `<Group>` is a bbox union of
// named `<Ref>`s with no visual output. `enclose({fill:"none",
// stroke:"none"}, [ref(a), ref(b), ...])` is the direct analog — enclose's
// hull IS a bbox union over its (already-placed) children, and as of #713
// it correctly reads already-resolved `ref()` positions instead of
// collapsing them to the local origin (see the regression probe at
// stories/lowlevel/EncloseRefs.stories.tsx and the friction log on
// Topology.stories.tsx). Used here ~9 times as pure geometry (no paint) to
// build "column 0", "rows 0-1", "rows 0-2", etc.
//
// TIERING: the recipe's own layout chain is itself order-dependent —
// Bluefish's Distribute/Align calls run in sequence, each treating the
// previously-placed node as the anchor for the next (StackV places column
// 0 -> col0's union sizes step cell A1's x -> A1 sizes step cell B's x ->
// a union of A1+B+A2 sizes step cell C's x -> ...). A materialized
// group-of-refs union can only be built from cells that are ALREADY
// placed, and a union sibling that reads still-being-placed cells via
// `ref()` from the SAME layer that is placing them races the constraint
// solver (see the FRICTION note below) — so each "place some cells, then
// union them" step becomes its own nested `Layer`, wrapping the previous
// tier as its first child (mirroring the Wire/ArrayEntry cross-tier
// pattern from QuantumCircuit/InsertionSort, chained 8 times instead of
// just 2). This is more tiers than any prior Bluefish port needed, direct
// fallout of replicating Bluefish's own ad hoc, order-dependent alignment
// chain faithfully rather than re-deriving a cleaner grid from scratch.

const meta: Meta = {
  title: "Bluefish/Baking Recipes",
};
export default meta;

const GREEN = "#40A03F";

// Bluefish's `Pad`: padding 5, transparent background, wraps every text
// cell (title + 6 ingredients + 6 step cells).
const Pad = (t: string) =>
  enclose({ padding: 5, fill: "transparent", stroke: "none" }, [
    text({ text: t }),
  ]);

// Bluefish's `<Group>`: a pure bbox union of named refs, no paint.
const union = (names: string[], name: string) =>
  enclose(
    { padding: 0, fill: "none", stroke: "none" },
    names.map((n) => ref(n))
  ).name(name);

// Bluefish's `CellBorder`: a transparent green-stroked rect whose x/y span
// are forced onto it by two `align({..:"span"})` constraints declared by
// the caller (the rect itself has no w/h — an intrinsic size on a spanned
// axis is an ownership conflict GoFish rejects by design).
const border = (name: string) =>
  rect({ fill: "transparent", stroke: GREEN, strokeWidth: 1 }).name(name);

// FRICTION: `.constrain()` only resolves *direct* children by name —
// `layer.tsx`'s solver builds its name->placeable map from `node.children`
// alone (not recursively), even though `collectConstraintRefs` (which
// back the callback's destructured object) DOES recurse into nested plain
// `Layer`s, so referencing a name from an outer tier's `.constrain()`
// type-checks and silently no-ops instead of erroring (first symptom: the
// whole step-cell column collapsed onto the title, at local (0,0)).
// `Constraint.zAbove`/`zBelow` documents cross-tier nested-layer reach —
// align/distribute do not have it. Workaround: re-expose a name at each
// tier boundary as an explicit direct-child proxy, `ref(name).name(name)`
// — this "pull" is itself a normal ref lookup (scoped to the nearest
// enclosing Layer, recursive through nested plain Layers, per `_ref.tsx`),
// so it resolves the real node regardless of how deep it actually lives;
// it just needs to be listed as a literal child of THIS layer for the
// solver's direct-children map to see it.
const pull = (name: string) => ref(name).name(name);

export const BakingRecipes: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Baking Recipes",
      description:
        "A hand-drawn-style recipe card for dark chocolate brownies, its step-cell borders sized by align's new span value to exactly bound the groups of ingredient rows they apply to.",
    },
  },
  render: () => {
    const container = initializeContainer();

    // ── Tier 0: ingredient column, stacked top-to-bottom, left-aligned ──
    const tier0 = Layer([
      Pad(
        "Preheat oven to 325°F (160°C) and butter a 9x13-in. baking pan"
      ).name("title"),
      Pad("6 oz. (170 g) 70% cacao chocolate").name("r0"),
      Pad("6 oz. (170 g) butter").name("r1"),
      Pad("1-1/2 cup (300 g) granulated sugar").name("r2"),
      Pad("3 large eggs").name("r3"),
      Pad("1 tsp. (5 mL) vanilla extract").name("r4"),
      Pad("1 cup (125 g) all-purpose flour").name("r5"),
    ]).constrain(({ title, r0, r1, r2, r3, r4, r5 }) => [
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
    const tier1 = Layer([
      tier0,
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
    const tier2 = Layer([
      tier1,
      pull("col0"),
      pull("row0_1"),
      pull("row0_2"),
      pull("row3_4"),
      Pad("melt in double boiler").name("A1"),
      Pad("stir in").name("B"),
      Pad("lightly beat").name("A2"),
    ]).constrain(({ col0, row0_1, row0_2, row3_4, A1, B, A2 }) => [
      Constraint.distribute({ dir: "x", spacing: 0 }, [col0, A1]),
      Constraint.align({ y: "middle" }, [row0_1, A1]),
      Constraint.distribute({ dir: "x", spacing: 0 }, [A1, B]),
      Constraint.align({ y: "middle" }, [row0_2, B]),
      Constraint.align({ y: "middle" }, [row3_4, A2]),
      Constraint.align({ x: "start" }, [A1, A2]),
    ]);

    // ── Tier 3: col1_2 = union(A1, B, A2) — the column-group C is
    // distributed after.
    const tier3 = Layer([tier2, union(["A1", "B", "A2"], "col1_2")]);

    // ── Tier 4: "stir in" (C), right of col1_2, centered on rows 0-4 ──
    const tier4 = Layer([
      tier3,
      pull("col1_2"),
      pull("row0_4"),
      Pad("stir in").name("C"),
    ]).constrain(({ col1_2, row0_4, C }) => [
      Constraint.distribute({ dir: "x", spacing: 0 }, [col1_2, C]),
      Constraint.align({ y: "middle" }, [row0_4, C]),
    ]);

    // ── Tier 5: col1_3 = union(col1_2, C) ──
    const tier5 = Layer([tier4, union(["col1_2", "C"], "col1_3")]);

    // ── Tier 6: "stir in" (D), right of C; "bake..." (E), right of D —
    // both centered on rows 0-5.
    const tier6 = Layer([
      tier5,
      pull("C"),
      pull("row0_5"),
      Pad("stir in").name("D"),
      Pad("bake 325°F (160°C) for 35 min.").name("E"),
    ]).constrain(({ C, row0_5, D, E }) => [
      Constraint.distribute({ dir: "x", spacing: 0 }, [C, D]),
      Constraint.align({ y: "middle" }, [row0_5, D]),
      Constraint.distribute({ dir: "x", spacing: 0 }, [D, E]),
      Constraint.align({ y: "middle" }, [row0_5, E]),
    ]);

    // ── Tier 7: col0_5 = union(r0, E) — full table width, used to span
    // the title's border underneath it.
    const tier7 = Layer([tier6, union(["r0", "E"], "col0_5")]);

    // ── Tier 8: the 12 cell borders, each sized by align's new "span"
    // value against the horizontal/vertical group it bounds — the direct
    // translation of Bluefish's `CellBorder`'s two `LayoutFunction` calls.
    const tier8 = Layer([
      tier7,
      pull("col0"),
      pull("r0"),
      pull("r1"),
      pull("r2"),
      pull("r3"),
      pull("r4"),
      pull("r5"),
      pull("A1"),
      pull("row0_1"),
      pull("col1_2"),
      pull("row0_2"),
      pull("row3_4"),
      pull("col1_3"),
      pull("row0_4"),
      pull("E"),
      pull("row0_5"),
      pull("col0_5"),
      pull("title"),
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
    ]).constrain(
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
      ]
    );

    const tableBg = enclose(
      { padding: 0, fill: "#FFFFFF", stroke: GREEN, strokeWidth: 3 },
      [tier8]
    );

    // Bluefish's `Background` wraps the TITLE and the TABLE together (10px
    // gap between them, 50px padding around the pair) — the title sits
    // INSIDE the pale-green card, not floating above/outside it.
    const titledTable = Layer([
      text({ text: "Dark Chocolate Brownies (makes 24 squares)" }).name(
        "recipeName"
      ),
      tableBg.name("table"),
    ]).constrain(({ recipeName, table }) => [
      Constraint.align({ x: "start" }, [recipeName, table]),
      Constraint.distribute({ dir: "y", spacing: 10 }, [recipeName, table]),
    ]);

    const greenBg = enclose(
      { padding: 50, fill: "#7CD4AC", stroke: "none", opacity: 0.3 },
      [titledTable]
    );

    Layer([greenBg]).render(container, {});

    return container;
  },
};

// ── Friction log ─────────────────────────────────────────────────────────
//
// 1. `.constrain()`'s cross-tier name reach is narrower than documented for
//    z-order. The first draft destructured names like `col0`/`row0_1`
//    straight out of a NESTED tier's `.constrain()` callback (mirroring
//    the `zAbove`/`zBelow` "Cross-tier references" doc, which explicitly
//    supports reaching into a nested plain `Layer`). It type-checked and
//    rendered with no error, but every step cell (A1..E) collapsed onto
//    the title cell at local (0, 0) — the whole right side of the table
//    vanished into one overlapping stack of text. Root cause, found by
//    reading `layer.tsx`/`constraints/index.ts`: `collectConstraintRefs`
//    (which backs the callback's destructured object) DOES recurse into
//    nested plain `Layer`s, so the name resolves to a harmless placeholder
//    `{name}` and the callback never throws — but the actual SOLVER
//    (`applyConstraints`, fed by a `nameToPlaceable` map built from
//    `node.children[i]` only) does not recurse at all. A name from an
//    outer layer's constraint list that isn't a *direct* child silently
//    has no placeable and gets skipped. This narrower behavior appears to
//    be genuinely undocumented for align/distribute/position (only
//    zAbove/zBelow's own flatten-and-topo-sort pass descends nested
//    layers). Workaround: the `pull(name)` helper — an explicit
//    `ref(name).name(name)` proxy added as a literal direct child of
//    whichever layer's `.constrain()` needs that name. `ref()` itself
//    (used as enclose/line/pull children, not as a constrain target) DOES
//    do a real recursive, scope-bounded lookup (`_ref.tsx`: "layer-local
//    lookup from the nearest enclosing Layer", searched recursively), so
//    the proxy resolves the real node regardless of how deep it actually
//    lives — it just needs to physically be a child of the constraining
//    layer for the solver's direct-children map to see it. This cost a
//    full render/inspect cycle to diagnose (the failure mode is silent,
//    not a thrown error) and is worth fixing or documenting upstream: either
//    make `applyConstraints`' name resolution match `collectConstraintRefs`'
//    recursion (so the two agree), or have the solver throw on an
//    unresolvable name instead of silently dropping the constraint.
//
// 2. The "union of refs" building block worked exactly as advertised.
//    `enclose({fill:"none", stroke:"none"}, [ref(a), ref(b), ...])` — used
//    9 times here (`col0`, five row-groups, `col1_2`, `col1_3`, `col0_5`)
//    — correctly unions already-placed cells' bboxes with no visual
//    output, confirming the #713 fix (see `EncloseRefs.stories.tsx`) holds
//    up under much heavier real-world use than its original regression
//    probe.
//
// 3. `Constraint.align({x:"span"}/{y:"span"})` — the primitive this port
//    exists to validate — worked on the first try once the cross-tier
//    names actually resolved (friction #1 above): all 12 border rects
//    (6 ingredient rows + 5 step-cell borders + the title strip) sized
//    correctly from a bare bordered `rect({fill, stroke, strokeWidth})`
//    with no `w`/`h`, including the trickiest cases — `bC`'s x-span reused
//    Bluefish's own `col1_3` union (`col1_2` ∪ `C`), producing a border
//    that deliberately visually overlaps/nests inside `bB`/`bA2`'s
//    narrower `col1_2`-spanned boxes, exactly matching the source's
//    staggered look (verified against the rendered rect coordinates: `bA1`
//    width 125px < `bB`/`bA2` width 166.85px < `bC` width 208.31px, all
//    sharing the same left edge). `D` (the second "stir in" cell) getting
//    no border at all is also a faithful reproduction of the original,
//    not a gap in this port.
//
// Net: no library changes were needed and no cell/border is missing or
// mis-spanned — the only real gap this port surfaced is the
// align/distribute cross-tier documentation vs. implementation mismatch
// in friction #1.
