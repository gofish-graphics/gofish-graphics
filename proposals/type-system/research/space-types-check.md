# Space types: the 11-13 notes checked against the proposal and the code

Date: 2026-11-13. Worktree `type-system-proposal`.
Input: [`notes-2026-11-13-space-types.md`](notes-2026-11-13-space-types.md), called "the notes" below.
Paths are relative to `packages/gofish-graphics/src/` unless they start with `proposals/` or `apps/`.

How each claim was checked:

- **[code]** I read the code named.
- **[ran]** I rendered it. The probe stories are in `proposals/type-system/stories/SpaceTypes.stories.tsx` (title `Probe/Space Types`). To render them, copy the file into `packages/gofish-graphics/stories/<any folder>/` and run `pnpm capture-one "Probe/Space Types"`. The PNGs and DOM land in `tests/tmp/iterate/probe/`.
- **[reasoning]** My argument only. Nothing was run.

## Terms

- **Space type.** What the notes call the output type: what a layout makes of the data on screen. In the engine it is the `UnderlyingSpace` of a node on each axis (`ast/underlyingSpace.ts`).
- **Origin state.** The engine's one fact about where a continuous axis's data 0 sits: `pinned` (data 0 is placed, so positions mean something), `free` (a length whose baseline a parent has not placed yet), or `none` (only differences mean something).
- **Mirrored.** A flag on a continuous space: both sides of 0 hold nonnegative amounts measured away from it, as in a Likert chart. An axis over it labels ticks with their distance from 0.
- **Stack origin.** The point a stack's running sums start from, stored as a part and a fraction of the way through it (`StackOrigin` in `ast/constraints/distribute.ts`). The default is the first part's tail.
- **Hallucinator and confuser.** Kindlmann and Scheidegger's words. A hallucinator is structure the picture shows that the data lacks. A confuser is structure the data has that the picture loses.
- **Metamorphic test.** A test that changes the input in a known way and checks that the output changes in the matching way, without knowing the right output.

## Summary

- Most of the notes are already in the proposal or in the engine under other names. "Reference point: edge, neutral point, or none" is `StackOrigin` plus the origin state. "Instance resolution is elaboration" is section 3's elaboration table. Bidirectional checking is the last paragraph of section 10, and the engine's passes already run in that shape.
- Two ideas are new and worth adopting:
  1. A small, closed vocabulary for the **Gives** column of section 10 (position, length, difference, slot, area), tied to the origin states the engine already computes. The notes' main idea is right, but the engine already has most of it.
  2. Rules for how sibling spaces join under a shared axis. The probe for example 6 found a real bug: one diverging and one linear sibling under a shared axis print negative tick labels for the survey's counts.
- Several of the notes' premises are false of GoFish. `stack` does not need an ordered key. Untagged data is not Linear. Checks do not fire at one boundary. The default treemap does invent an order (by size). A cyclic calendar key is treated as ordered today.
- The data-by-coord table holds in shape but not as stated. A lint on every lossy cell would flag every pie and every bar chart of months. The fit has to depend on what the mark claims (a connector or a closing gap), not on the data and the coord alone.
- Do not adopt Lean, the `asLinear` retag, an `arbitrary` keyword, or a lint on every override.

## 1. Map of ideas

Verdicts: **there** (already in the proposal or the engine), **new, fits**, **new, conflicts**, **unclear**.

| Idea in the notes                                                                            | Where the proposal says it                                                                                                                                                                         | Where the engine does it                                                                                                                                                                                                                                                                                                                     | Verdict                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A layout operator's type is the structure it keeps, read on the data side and the space side | Section 7, "Keys and values in graphical space": position and size each come from the key or a value. Section 10's **Needs** and **Gives** columns. #1281 (tag operators by the traits they keep). | Each operator's `resolveUnderlyingSpace` computes its space type. `distributeSpaceFold` returns ordinal for `spread` and pinned continuous for `stack` [code].                                                                                                                                                                               | there, under other names                                                                                                                    |
| Space-side output types (position, length, area, order)                                      | **Gives** is free text: "one continuous space with lengths from a fixed origin", "areas that add up to the parent's area".                                                                         | `pinned` = position, `free` = length, `none` = difference, ordinal with `hasOrder` = slots [code]. There is no area fact: `treemap` gives `UNDEFINED`, or a magnitude per axis when it has its own data size (`treemap.tsx` 266–277) [code].                                                                                                 | new, fits (name the vocabulary; area is the only missing word)                                                                              |
| Who consumes the space type                                                                  | Section 10: the coord is checked against space facts. Section 4's log rule reads "a length pinned at 0".                                                                                           | Enclosing folds (`distributeSpaceFold`, `overlay` in `alignment.ts`), axes (`axisOver`, `mirrored` in `axes/elaborate.tsx` 1490–1530), legends (`keysDownTheScreen` in `distribute.ts`), coords (`AxisTraits` fit, `coord.tsx` 440–471), embedding (`isGlyph`, `resolveEmbedding`) [code]. The reader is not a consumer in code.             | there                                                                                                                                       |
| Effectiveness as a ranking over output types                                                 | Section 1 mentions Mackinlay's split and ranking only as a way to synthesize charts.                                                                                                               | none                                                                                                                                                                                                                                                                                                                                         | unclear. `principles.md` says GoFish "does not decide whether your chart is a good idea", so ranking would be a separate tool, not a check. |
| Hallucinators: output has more than the data                                                 | key-space.md 1.6 and open question 7 (first-appearance order, segment order in a nominal stack).                                                                                                   | Unordered keys are ordered by first appearance (`splitEntries`). Nominal palettes are assigned by first appearance [ran]. `treemap` sorts by size by default (`sort = "desc"`, `treemap.tsx` 225, 361–365) [code]. Cycle parts are cut at their first part (`ORDINAL` sets `hasOrder` for every cell list, `underlyingSpace.ts` 452) [code]. | there in pieces, not as a class                                                                                                             |
| Confusers: output has less than the data                                                     | Not named.                                                                                                                                                                                         | The `none` origin state is exactly a tracked confuser: middle alignment drops the baseline, the loss is absorbing, and the axis becomes a difference axis (`underlyingSpace.ts` 47–64) [code]. Nothing records it per stack part.                                                                                                            | partly there                                                                                                                                |
| `arbitrary` order on the output                                                              | key-space.md open question 7.                                                                                                                                                                      | `ORDINAL_TYPE.hasOrder` is false for an unordered key, and the axis already acts on it: outer labels sit at the start of a run over ordered keys and are centered over unordered ones [code]. A stack's continuous result keeps no order fact.                                                                                               | there for slots; no new word needed                                                                                                         |
| Data declares, chart requires, application checks has ≥ needs, extra columns fine            | Section 5: TypeScript field-name checks against the row type. key-space.md section 2 cites row types.                                                                                              | `applySchema` accepts extra data columns and schema entries for absent columns. Nothing infers what a chart requires [code].                                                                                                                                                                                                                 | there (open rows); the "requires" record is not built                                                                                       |
| Lints fire at one boundary (chart applied to data)                                           | Section 15: each diagnostic has a `site`, the operator. One list, reported once by `render`.                                                                                                       | Checks run where they apply: `checkSummable` at build time in channels, `treemap`, `.normalize()`; the stack sum in the type walk; `MeasureClash` at joins [code].                                                                                                                                                                           | new, conflicts. Many check sites, one report.                                                                                               |
| Composition derives area from length × length                                                | summarizability-partition.md 2.4 (mosaic: a share times its own weight is extensive). Section 4, "Mosaic".                                                                                         | Not computed. Each axis keeps its own unit: `count` on x, `count share by cylinders` on y (`shareQuantity`, `fieldExpr.ts` 624) [code, ran].                                                                                                                                                                                                 | there as an argument; the rule as stated breaks (example 1)                                                                                 |
| Shared axes unify (same unit, same baseline)                                                 | Section 10, `layer` row: "children that share an axis agree on its unit".                                                                                                                          | Units: `joinUnits` and `MeasureClash`. Baseline: `overlayOrigin` (pinned beats free beats none) and `allMirrored` (`alignment.ts` 67–162) [code].                                                                                                                                                                                            | there; the baseline join is unstated and has a bug (example 6)                                                                              |
| Diverging and cyclic as traits that pick a layout per instance                               | Sections 2 and 3: `HasMidpoint` on the stack's key sets the origin; `HasCycle` on a spread key closes the loop.                                                                                    | `stackOrigin` (`schema.ts` 1124) is called from `spread.tsx`'s split only when the key has `HasMidpoint` [code]. Cycle closing is TODO #1052 (`cells.ts` 292) [code].                                                                                                                                                                        | there                                                                                                                                       |
| Associated type: the layout an instance produces                                             | Not as such.                                                                                                                                                                                       | One record, `StackOrigin { part, fraction, mirrored }`, for every stack. Linear is `{ part: 0, fraction: 0, mirrored: false }` (`distributeOrigin`, `distribute.ts` 127–143) [code].                                                                                                                                                         | there, as one interface rather than per-kind types                                                                                          |
| Two-parameter fit (data kind × coord)                                                        | Section 10, Coords table: needs and fills-in per coord.                                                                                                                                            | One fit function reads the axis's traits (`HasZero`, `HasCycle`); it is not a table of pairs [code].                                                                                                                                                                                                                                         | there, without the n×m table                                                                                                                |
| The exact / lossy / missing table                                                            | Section 10 Coords lints; section 7 radar error ("a closed line over `attribute` needs `HasCycle`").                                                                                                | Nothing lints today [code].                                                                                                                                                                                                                                                                                                                  | new, conflicts as stated; fits when scoped to connectors (example 8)                                                                        |
| `asLinear(...)` retag                                                                        | Section 3: "a stack option naming the origin", internal only (#1289, make internal operands public).                                                                                               | No retag and no public option [code].                                                                                                                                                                                                                                                                                                        | new, conflicts with "a default is sugar" (the override belongs on the operator)                                                             |
| Untagged defaults to Linear                                                                  | Terms: an undeclared column passes every check.                                                                                                                                                    | An undeclared string key is "no order" for axes (`hasOrder` false) and gets the default edge origin [code].                                                                                                                                                                                                                                  | new, conflicts. See section 5.                                                                                                              |
| Coherence: one instance per data type                                                        | Section 4: "one unit cannot both add up and not"; units meet across the figure.                                                                                                                    | `meetUnitTraits`, `meetChartUnits` [code].                                                                                                                                                                                                                                                                                                   | there                                                                                                                                       |
| Consumers polymorphic in the baseline                                                        | Not stated.                                                                                                                                                                                        | `spread` ignores its children's continuous spaces on its own axis (generic). Overlays need the origin state (a capability). Axes branch on two facts, origin state and `mirrored`, not on n×m kinds [code].                                                                                                                                  | there                                                                                                                                       |
| Bidirectional checking                                                                       | Section 10, last paragraph; section 11. #1270 (bidirectional resolution of spaces, open).                                                                                                          | The passes alternate: `resolveAliases` down (coord names), `resolveUnderlyingSpace` up (types), `resolveEmbedding` and axis marking down, `resolveExtent` up (claims), layout down (`_node.ts` 1270, 2254, 2300) [code].                                                                                                                     | there                                                                                                                                       |
| Metamorphic tests                                                                            | Section 7, last lines: "change the data in an allowed way and measure that the marks change to match".                                                                                             | none built. One run here [ran].                                                                                                                                                                                                                                                                                                              | there as a sentence; new as a test kit, fits                                                                                                |
| Lean for laws                                                                                | Section 7 rejects categorical form; parametricity becomes "a rule for operator authors plus property tests".                                                                                       | none                                                                                                                                                                                                                                                                                                                                         | do not adopt                                                                                                                                |

## 2. The eleven examples

### Example 1. Mosaic as a stack of stacks: does length × length give area?

**Undecided as stated; holds with a condition.**

How the mosaic stories are written (`stories/forwardsyntax/MosaicChart.stories.tsx`, `stories/atom/Mosaic.stories.tsx`) [code]:

```js
chart(cars)
  .flow(
    stack({ by: "origin", dir: "x", size: "count" }),
    stack({ by: "cylinders", dir: "y", size: field("count").normalize() })
  )
  .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }));
```

- The x axis is in `count`. The y axis is in a share unit the engine names `count share by cylinders` [ran: the axis titles read "count" and "count share by cylinders"].
- No space type holds an area. Each axis keeps its own unit, and nothing multiplies them [code].
- The area comes out right only because the inner size is a share and the outer width is that share's weight: `m(a) · m(a,b) / m(a) = m(a,b)`. This is already in summarizability-partition.md 2.4.

With raw counts on both axes the same operators give a stacked bar of variable width, not a mosaic [ran, `MosaicRawCounts`]:

```js
chart(cars)
  .flow(
    stack({ by: "origin", dir: "x", size: "count" }),
    stack({ by: "cylinders", dir: "y" })
  )
  .mark(rect({ h: "count", fill: "origin" }));
```

The columns have different heights, and a cell's area is count × count. So "`+ ↦ length` composed with `+ ↦ length` yields `+ ↦ area`" is false in general.

What unit algebra (#1142, a unit is one definition and products and quotients are still open) would say [reasoning]:

| x unit | y unit                          | Area unit | Reads as an amount?          |
| ------ | ------------------------------- | --------- | ---------------------------- |
| count  | count share (count / count = 1) | count     | yes: the joint count         |
| count  | count                           | count²    | no                           |
| USD    | count share                     | USD       | yes (a Marimekko of revenue) |

So the rule is: **an area reads as an amount when the product of its two length units is a unit that can sum over the product key.** With #1142's "per" units this is a unit check, the same kind as the key-sized rule in section 9. It needs no composition rule on space types.

### Example 2. Mosaic via one-level treemaps

**Holds for areas; the output types differ in their axes.**

```js
chart(cars, { axes: false })
  .flow(
    treemap({ by: "origin", size: "count", tile: Tile.dice(), sort: "none" }),
    treemap({
      by: "cylinders",
      size: "count",
      tile: Tile.slice(),
      sort: "none",
    })
  )
  .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }));
```

- [ran, `MosaicTreemaps`] The cells have the same areas as the stack-of-stacks mosaic. Only the vertical order of the segments differs (the slice runs top-down).
- The route is different. The inner sizes are raw counts, not shares, because a treemap scales its children to the parent's area. So the requirement differs: both treemaps need `CanSum` on `count` over their key. The stack route needs a share in the inner stack.
- The output types are not the same. The stack route gives two honest axes (cumulative count on x, share on y). The treemap route gives no axis; its space is `UNDEFINED` on both axes [code, `treemap.tsx` 266–277].
- So the notes' hope that both routes have "the same output type" holds only for the area fact, which the engine does not record. This is the one place a space-side `area` fact would have a consumer: telling a reader that these two pictures mean the same thing.

### Example 3. Squarified treemap, alternating split direction

**Breaks the composition rule; holds if treemap's area is primitive.**

- A squarified treemap is not a product of two one-dimensional stacks. Its rows (strips) are groups the algorithm invents. No data key makes them. So no rule that composes lengths can derive the area [reasoning].
- GoFish does not try. A treemap's type is "areas that add up to the parent's area" by its own rule (section 10), and `checkSummable` runs once on its `size` (`treemap.tsx` 243) [code]. The alternation of direction is irrelevant to that rule.
- [ran, `SquarifyNested`] Nested squarified treemaps draw correctly. Each level is typed on its own.
- The hallucinators here are adjacency and strips. A treemap of an ordered key also drops the order (a confuser).

The notes say treemap "neither requires nor produces an order: permuting its input gives the same graphic". I ran that as a metamorphic test, the same data in the given order and reversed:

| `sort`             | Tile geometry per key | Colors per key                                        |
| ------------------ | --------------------- | ----------------------------------------------------- |
| `"desc"` (default) | identical [ran]       | different: the palette follows first appearance [ran] |
| `"none"`           | different [ran]       | different                                             |

So the claim holds for the default only because the default sorts by size, which is itself an order the treemap produces. Also verified: a negative weight becomes 0 silently (`resolveWeight`, `treemap.tsx` 199–208) [code]. Section 15's "not verified" line about negative treemap sizes can now say this.

### Example 4. Stacked means

**Holds under the proposal; breaks today.**

```js
chart(sales, {
  schema: { price: { unit: Unit("USD", { traits: [Trait.summable()] }) } },
})
  .flow(spread({ by: "month", dir: "x" }), stack({ by: "warehouse", dir: "y" }))
  .mark(rect({ h: field("price").mean(), fill: "warehouse" }));
```

- [ran, `StackedMeans`] Today it draws. The axis reads "price (USD)" up to 35, the sum of three mean prices.
- Why: `.mean()` keeps the source unit, and the stack checks the unit (`distribute.ts` 366–369 calls `currentUnits().sum`). USD is summable, so the check passes [code].
- Under the proposal, `.mean()` gives "same unit, no `CanSum`" (section 10, Data helpers), so the Stack rule fails with `cannot-sum`. The notes' requirement ("stacking needs the children's length to mean something additive") is the conjunction of two rules the proposal already has: `CanSum` on the value over the key, and "each child is one length along `dir`" (the stack-outside-spread rule).

### Example 5. Small multiples with a shared axis

**Holds; the baseline half of the rule is unwritten.**

- Units: two declared units on one shared axis raise `MeasureClash` (`joinUnits`) [code].
- Baselines: an overlay or alignment seats each child on the shared data 0. The result is `pinned` when any child is, `free` when all are, and `none` otherwise (`overlayOrigin`, `alignment.ts` 151–162) [code].
- A child with origin `none` (a middle-aligned overlay, a streamgraph) beside a pinned one adds nothing to the result's interval and is placed by its box (`seatedUnion`, `alignment.ts` 56–65) [code]. The shared axis then shows absolute values that do not describe that child [reasoning, not rendered]. That is a silent join where an error or a separate axis would be honest.
- So "children's mappings unify" is the engine's behavior for units, and a lossy join for origins. Section 10's `layer` row should state the origin rule too.

### Example 6. One diverging and one linear sibling under one shared axis

**Undecided in the notes; the code has a wrong join, and the right join exists for one case.**

Probe [ran, `DivergingAndLinear`]: a Likert row (`response` with `Trait.diverging()`) and a row of contact counts stacked by `channel`, as two charts in `spread({ dir: "y" }, [...])`, so they share x.

| Render                                                                  | x tick labels      | Correct?                                            |
| ----------------------------------------------------------------------- | ------------------ | --------------------------------------------------- |
| The Likert row alone (`DivergingAlone`)                                 | 60 40 20 0 20 40 … | yes: counts measured away from 0                    |
| Likert row and nonnegative linear row                                   | −60 −40 −20 0 20 … | no: the survey's left half reads as negative counts |
| Likert row and a linear row with a negative part (`DivergingAndSigned`) | −60 −40 −20 0 20 … | right for the signed row, wrong for the survey      |

Why: the shared axis is the overlay of the two rows, and `overlay` keeps `mirrored` only when every child has it (`allMirrored`, `underlyingSpace.ts` 419–420) [code]. The linear row has no `mirrored`, so the union loses it.

The notes' proposed join, "linear = diverging with its neutral point at the edge", is right when the linear sibling has no part below 0. Its amounts all lie on one side of 0, where a distance from 0 and a signed value are the same number. So the mirrored labels are correct for both rows [reasoning]. Stated on the engine's facts:

> A union of continuous spaces stays mirrored when at least one part is mirrored and every other part reaches nowhere below 0.

When a linear sibling has a negative part, no single labeling is right for both rows. That is a real conflict, and it should be an error (or two axes), not a silent choice.

So the counterexample the notes expected is real, but it is a missing case in a join, not a reason to give up joins. The engine's `StackOrigin` already treats linear as diverging with its origin at the first part's tail, which is the notes' join.

### Example 7. Likert: tag the data, no spec change

**Holds today for the tag; the override part conflicts with GoFish's rules.**

- [code; the `Diverging` story's `Likert` and `PopulationPyramid`] Adding `Trait.diverging()` to the schema moves the stack's origin to the midpoint and makes the axis mirrored. The spec does not change.
- The notes' "neutral ↦ baseline" is vague for an odd number of levels. GoFish's `HasMidpoint { at }` is an edge coordinate, `n/2` by default. With five levels the midpoint is the middle of Neutral, so Neutral straddles 0 and no segment starts at the baseline. With four levels two segments meet at 0 [code, `stackOrigin`].
- Override: GoFish has no retag. Section 3 lists the elaborated form as "a stack option naming the origin", internal today (#1289). That is the right place, since the midpoint is a fact about the key and the layout is the operator's choice. A wrapper on the data would be a second channel for the same choice.
- "Overriding should lint" conflicts with `principles.md` ("GoFish designs for internal correctness, not external utility"). A Likert chart stacked from the edge has an honest axis, so it is not internally wrong. An explicit option is the user writing the elaborated code. It should not lint.

### Example 8. Radial chart and the data × coord table

**Partly holds; the table needs a third input, the mark.**

| Key               | Coord     | Today [code]                                                                                                                  | Proposal                                 | My verdict [reasoning]                                                                                                        |
| ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ordered, no cycle | Cartesian | silent                                                                                                                        | silent                                   | silent                                                                                                                        |
| `HasCycle`        | polar     | silent; the gap between the last and first part is not closed (TODO #1052, `cells.ts` 292; the proposal's `months-clock.png`) | fills in: close the loop                 | close the loop, silent                                                                                                        |
| `HasCycle`        | Cartesian | silent; the cycle is cut at its first part, and the key gets `hasOrder: true` (`underlyingSpace.ts` 452)                      | silent                                   | silent for bars. A bar chart of months is the common case and asserts no adjacency.                                           |
| ordered, no cycle | polar     | silent                                                                                                                        | lint only for a radius with no zero      | lint only when the key has `HasOrder` and no `HasCycle` and the marks are a closed line, or slots placed around the full turn |
| no order          | polar     | silent                                                                                                                        | error for a closed line (the radar case) | silent for a pie; error for a closed line                                                                                     |

- The notes' "Linear" covers both nominal and ordered keys. They must be split. A pie of nominal categories puts the first and last next to each other, but a nominal key has no neighbors to misstate. Linting it would flag every pie.
- "Lossy ones warn" by data and coord alone would also flag every bar chart of months in Cartesian. The loss matters only when a mark claims the dropped structure: a line or ribbon (neighbors), or a closing gap. So the fit is a rule on key traits × coord axis traits × what the mark asserts. The proposal's rules for `line` and `ribbon` already carry the third input.
- No cell is "missing" (an error) in the notes' table. The real error cell is a closed line over a key with neither `HasOrder` nor `HasCycle`, which the proposal has.

### Example 9. Stacked bar: upper segments are length only

**Undecided: the engine has the pieces and nothing reads them.**

What the engine knows today [code]:

- Each part's space is `free` (a length from its own baseline) before the stack.
- The stack's result is one `pinned` interval for the whole stack. No per-part fact survives (`distributeSpaceFold`, `distribute.ts` 349–391).
- `StackOrigin` names the one part whose point sits at data 0, and how far through it. With the default origin, only the first part's tail is at 0. For an odd Likert stack, no part's tail is at 0.
- Across a spread of stacks, the stacks are aligned on their baselines, so the first segments share a common baseline and the rest do not (the stacked-bar walk-through in `internals/core/underlying-space.md`).

So the type could say "length only, no common baseline" in the engine's own words: every part except the origin part stays `free`. But no consumer needs it today. A consumer would be a label or tooltip that reports a segment's position, or a lint on a value read off the axis for an upper segment. Wait for one.

### Example 10. Bar chart on a wide table

**Holds.**

- `applySchema` (`schema.ts` 849–940) accepts extra data columns, and schema entries for columns the data lacks [code].
- Nothing infers what a chart requires. In TypeScript `by` takes any string, so even field names are unchecked (section 5). Section 5's first step, checking channel names and `by` against the row type, is the inferred requirement the notes want.
- GoFish has no stage that checks a spec without data. A nested `chart()` is an empty scope, and the TypeScript mirror is the one place a spec could be checked without its data.

### Example 11. Unordered categories into a stack

**Holds in the engine for slots; nothing to add for stacks yet.**

- `stack` takes any key. An unordered key is laid out in order of first appearance [code, `splitEntries`; key-space.md 1.6].
- For slots, the engine already marks the order as not meaningful: `ORDINAL_TYPE.hasOrder` is false, and the axis centers outer labels over unordered keys [code].
- A stack has no axis for its key. The legend lists the parts in the order they read down the screen (`keysDownTheScreen`), which follows the drawing whether or not the order means anything [code]. The continuous result drops the order fact, and no consumer misses it.
- So `arbitrary` is the absence of `HasOrder`, which the engine already tracks. A new word adds nothing. The one honest gap is in the docs: first-appearance order is a default that a user should be able to read about (key-space.md 1.6 already says so).

## 3. The open questions the code can answer

**Does the type traversal mirror the layout pass?** Yes [code]. The passes over one tree alternate:

| Pass                             | Direction | What moves                                                |
| -------------------------------- | --------- | --------------------------------------------------------- |
| `resolveAliases`                 | down      | coord axis names (`theta`, `r`) to every operator's `dir` |
| `resolveUnderlyingSpace`         | up        | space types, inside one figure-wide union-find of units   |
| `resolveEmbedding`, axis marking | down      | inside-a-coord, then glyph or length per dim              |
| `resolveExtent`                  | up        | size claims as functions of σ                             |
| layout                           | down      | sizes and σ, then placement                               |

One correction to the notes' directions. In GoFish, data enters at the root (`chart`) and the key context flows down to the marks. Space types flow up from the marks. So the data side and the space side meet at the mark (where a channel folds its rows) and at the coord (where the content's facts reach the coord's axis traits). The stack's origin is decided where the data reaches the stack's split (`spread.tsx`, `split`) and leaves as a space fact.

**How much space type do enclosing operators read?** Little, and all of it is in the existing record [code]:

| Reader                      | Reads                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| `stack` (glue fold)         | each child's kind, origin state, interval, units and summands             |
| `spread` (no glue)          | the children's keys only; their continuous spaces are dropped on its axis |
| overlay, alignment, `layer` | origin state, interval, units, `mirrored`, cells                          |
| `treemap`, `pack`           | nothing of the children; each child gets its own tile                     |
| coord                       | the content's interval and its own axis traits                            |
| axis                        | origin state, `mirrored`, cells, time zone, unit titles, `hasOrder`       |

Nothing reads order inside a continuous space, area, or a per-part baseline. That bounds what the notes' richer type would cost: only add a field when a reader exists.

**Is diverging placement a per-kind branch or a common reference-point interface?** A common interface, with one flag left over [code]. Every stack carries a `StackOrigin`. Linear is the default `{ part: 0, fraction: 0 }`, and `HasMidpoint` computes another part and fraction. The solver seats whichever it is at data 0 the same way (`stackOriginOffset`, `placementSolver.ts` 174). The per-kind remainder is the `mirrored` flag, read in two places: the nonnegative check on a centered stack (`distribute.ts` 373) and the tick labels (`elaborate.tsx` 502). Cycles are not a stack kind at all. They are a coord axis trait (`dataZero: "start"`).

**Does a join exist for every sibling pair that matters?** For diverging and linear, yes when the linear sibling is nonnegative, and no when it is signed (example 6). For pinned and `none`, the engine joins silently and should not (example 5).

## 4. What to adopt

Ranked by what they catch for what they cost.

**1. A rule for joining sibling spaces under a shared axis.** Add to section 10's `layer` row and to section 15's codes:

| Siblings on one axis                      | Result                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| all mirrored, or mirrored and nonnegative | mirrored                                                                                                                                       |
| mirrored and a part below 0               | error `mixed-sides`: "the survey row counts away from 0 on both sides, and the contacts row has a negative value. One axis cannot label both." |
| pinned and `none`                         | lint `no-shared-baseline`: "this row has no data 0, so the shared axis does not describe it"                                                   |
| units differ                              | error, as today (`MeasureClash`)                                                                                                               |

- Catches: the wrong tick labels in example 6, which render today with no message. Sections 9 and 10 check only units on a shared axis.
- Costs: a change to `allMirrored` and one new diagnostic. The mirrored fix is a bug fix on its own and could ship before the type system.

**2. A closed vocabulary for the Gives column.** Write each operator's **Gives** in five words the engine already computes, plus one it does not:

| Word                  | Engine fact             | Example                                 |
| --------------------- | ----------------------- | --------------------------------------- |
| position              | `pinned`                | a scatter axis, a stack's total         |
| length                | `free`                  | a bar before its parent places it       |
| difference            | `none`                  | a middle-aligned overlay, a streamgraph |
| slot (ordered or not) | ordinal with `hasOrder` | `spread`, `table`                       |
| area                  | none today              | `treemap`, a mosaic cell                |

- Catches: nothing on its own. It makes the rules in item 1 and the log rule ("no length pinned at 0") readable against one table, and it names the confuser the engine already tracks (`none`).
- Costs: documentation, and one new fact (area) only when a reader needs it. The first reader would be example 2 (two routes to one meaning) or a shared area scale across sibling treemaps.

**3. The area rule from units.** "An area reads as an amount when the product of its two length units can sum over the product key." It belongs with #1142, next to the key-sized rule of section 9.

- Catches: a "mosaic" of raw counts on both axes (example 1), which renders today. Section 9 covers value-sized pieces one axis at a time and does not see the product.
- Costs: needs unit products from #1142. A lint, not an error, for the same reason section 9 gives.

**4. Scope the key × coord fit by what the mark asserts.** In section 10's Coords table, state the lint as: a key with `HasOrder` and no `HasCycle`, on an angle axis with `HasCycle`, under a closed line or slots around the full turn. Nominal keys and bars stay silent.

- Catches: a radial line of years that joins the last year to the first. The proposal covers only the radar case (no order at all).
- Costs: one lint. It must not fire on pies or on Cartesian bar charts of months.

**5. A small metamorphic test kit**, as the testing half of section 7's parametricity statement:

- Permute the rows of a nominal key: tile geometry per key is unchanged for `treemap` with `sort: "desc"` [ran]. For `spread` and `stack` it changes by design (first appearance), so the test records that as declared.
- Scale a value column by k: the picture is unchanged and the tick labels scale by k.
- Rotate a cyclic key: a polar chart rotates.
- Catches: regressions in operators that are black boxes (d3 tilings, pack). Costs: a test harness on top of `capture-one`'s normalized DOM.

**6. A lint class for structure invented or dropped, opt-in under strict mode (#1120).** Members: a nominal key's order made by first appearance, a treemap or pack over an ordered key (order dropped), a nominal palette by first appearance.

- Catches: charts whose look depends on row order. Costs: noise if on by default, and `principles.md` argues against judging charts. Only as opt-in.

**Do not adopt:**

- **Lean as a design surface.** The proposal already reduces parametricity to property tests (section 7). Lean would add a language the maintainer did not ask for and checks nothing the tests do not.
- **`asLinear(...)` as a retag on data.** The override is the stack's origin option once it is public (#1289). A data wrapper is a second channel for one choice.
- **A lint on every override of a trait-driven default.** An explicit option is the elaborated code written out. Linting it contradicts "a default is sugar".
- **An `arbitrary` keyword.** It is the absence of `HasOrder`, which the engine already tracks.
- **"Untagged defaults to Linear".** See section 5.
- **Arrow and `forall` signatures, or per-instance associated types.** The engine solves the same problem with one `StackOrigin` record and per-axis traits, with no n×m table.
- **Per-part baseline facts (example 9)**, until a label or tooltip needs them.
- **An effectiveness ranking as a check.** It is external utility. It may belong in a chart-synthesis tool, not in the checker.

## 5. Where the notes are wrong about GoFish

- **`stack` does not need an ordered key.** It takes any key and lays out an unordered one by first appearance [code]. `stack` needs order only for a midpoint (`HasMidpoint` implies `HasOrder`, `schema.ts`).
- **Treemap does produce an order.** The default sorts by size, and `Tile.slice` and `Tile.dice` follow input order with `sort: "none"` [code, ran].
- **Untagged is not Linear.** In the proposal an undeclared column is unknown and passes every check. In the engine an undeclared string key is "no order" for axes, and gets the default edge origin for stacks [code]. These are two different defaults, and neither is Linear. This also exposes a tension inside the proposal: section 7 says a ribbon between `lake` groups is an error because `lake` has no order, while the Terms say an undeclared column passes every check. The proposal should say whether a key with no declared order is "no order" (as the engine treats it) or "unknown".
- **Cyclic is treated as ordered today.** The notes and key-space.md say a cycle is not a linear order. The engine gives calendar cycle parts `hasOrder: true` and cuts them at the first part, silently [code]. Fine for Cartesian bars, but it is the implicit cut the notes' table calls lossy.
- **Lints do not fire at one boundary.** Checks run at each operator, at build time or in the type walk, and section 15 gathers them into one report with a site per diagnostic [code].
- **Data types do not synthesize bottom-up.** In GoFish's tree, data and keys flow down from `chart` to the marks, and space types flow up (section 3 above).
- **"Diverging = neutral ↦ baseline" misses odd scales.** With an odd number of levels the neutral level is split by the baseline, and no segment starts there (example 7).
- **Stacking means is not caught by additivity today.** The current check is on the unit, and `.mean()` keeps a summable unit (example 4). The proposal fixes this; the notes assume it already holds.

## 6. What I could not verify

- Example 5's mix of a `none` sibling and a pinned sibling: argued from `alignment.ts`, not rendered.
- Whether a `line` over calendar months in `Coord.clock()` closes. The TODO says no; I did not render it.
- The colors in the example 6 probe: the palette passed to the combinator's `render` was not applied, so the colors are defaults. The tick labels, which are the point, are as described.
- #1270 (bidirectional resolution of spaces) was cited from the earlier survey, not read.
- Whether the IR (`gofish-ir`) could check a spec without its data. I did not look.
- The probe PNGs are in `tests/tmp/iterate/probe/`, which is not committed. Re-render them from the story file to see them.
