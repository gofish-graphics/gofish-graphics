# Implementation notes

Handoff from the design session (2026-11-17 to 11-23) to the session that implements the first parts. The design is in `proposal.md` and at https://claude.ai/artifact/JDLfHPePJ1GkP6GuVjXDHg. This file holds what the proposal does not: where things are in the code, exact repros, and how to check each piece.

## Scope

Josh, 11-23: implement the first seven bullets of "What to build" and tackle the rendering (possibly layout) bugs in polar space, e.g. the sunburst not closing the gaps between wedges.

1. The minimum gap, with a rule for the slack.
2. An average of positions.
3. `layout`: read the room offered.
4. One sequential tiling with settings.
5. Custom members (#1101, #692).
6. `measure`, in lengths.
7. An angle axis that wraps. (The other half of this bullet, a baseline per group on `stack`, is already on main. See below.)

## Do these first

- **Merge `origin/main` into the branch.** `worktree-layout-dsl-proposal` is four commits behind. What landed:
  - #1366: `treemap` is now `tile`, `Tile` is `Tiling`, `Place` is `Placement`, and a strategy option has the family's name in lowercase (`tile({ tiling: Tiling.squarify })`).
  - #1375: stack cross-sections. `stack` lost `spacing`, `anchor` and `glue`. A stack part with no data size on the stack axis is a type error that points to `spread({ spacing: 0 })`. The `Baseline` family exists: `Baseline.start | end | middle | wiggle | at(part, point)` on `stack` and `spread`.
  - #1401: tooltips, operator `.name()`.
- **The prototype stories will break on that merge.** They use `treemap`, `Tile`, and `stack` with `size:`, `reverse:` and in places `spacing`. Migrate them, since they are the test oracles. Each story file's comments mark its workarounds with `WALL`.
- **Rebuild `gofish-ir`** if every story fails with `Cannot read properties of undefined (reading 'type')` at `checkStrategy`: `pnpm --filter gofish-ir build`.
- **`capture-one` needs its own port** when other sessions run: `CAPTURE_ONE_PORT=36xx pnpm --filter @gofish/tests capture-one "<substring>"`. On the default port it can attach to another session's server and report "0 matching".
- **Syntax is not signed off.** Josh approved the direction by asking for the implementation. The spellings below are placeholders from the proposal, and his standing rule is sign-off on exact syntax, with real renders, before implementing. Confirm these with him at the first example that uses each one:
  - `Spacing.atLeast(n)` and `Spacing.contour(n)` for the minimum gap, and the slack rule: `justify: "start" | "end" | "center" | "even"`. "Even" may simply be what an `fr` gap already means.
  - How "the average of these positions" is written. Nothing is sketched.
  - `layout(children, (space, children) => node)` and `measure(child)`, against a second argument to `createMark`.
  - `Tiling.sequential({ order, score, phrase, recurse })`, with `Score` folding into the choice proposal's `Cost`.
  - What spacing means in a tiling: d3's inset or a stack's gap.

## Where things are

Paths are under `packages/gofish-graphics/src/` unless they start with `packages/`.

| Thing                                                 | Where                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spread` lowering to `layer` + `align` + `distribute` | `ast/graphicalOperators/spread.tsx` (`node.INTERNAL_relate([...])` inside `_elaborateInAxisScope`); `stack.tsx` is `spread` with `glue`                                                                                                                                    |
| Public constraints                                    | `ast/constraints/index.ts` (`Constraint.align / distribute / position / zAbove / zBelow / nest`); private ones: `grid`, `overlap`, `labelPlace`                                                                                                                            |
| Constraints as facts                                  | `ast/constraints/placementFacts.ts` (`anchor-pin`, `anchor-relation`, `anchor-participant`, `size-pin`); lowering in `align.ts`, `distribute.ts`                                                                                                                           |
| The placement solve                                   | `ast/constraints/placementSolver.ts` (per-node box closure, then a difference graph); `differenceGraph.ts` solves equalities only, by components and pin offsets, and checks that a cycle agrees with itself                                                               |
| After-the-solve steps                                 | `applyConstraints` in `ast/constraints/index.ts` runs `applyOverlapPlacement` and `applyLabelPlacement` after the solve. This is "solvers share unknowns in one direction" today                                                                                           |
| Symbolic values                                       | `ast/solver/pwl.ts` (`Pwl.Value`, piecewise-linear in the scale), `ast/solver/arith.ts` (`Arith<T>`: add, sub, scale, max, negate, abs; instances `numbers` and `values`), `ast/solver/formula.ts` (`Tape`: a layer's plan as formulas, with inputs layout measures later) |
| A node's size request                                 | `ast/extent.ts` (`Extent { ascent, descent, width }` in `Pwl.Value`); `GoFishNode.resolveExtent`                                                                                                                                                                           |
| The claim walk                                        | `ast/constraints/claimPlacement.ts`, `ast/solver/plan.ts`, `ast/solver/scopes.ts`                                                                                                                                                                                          |
| The node protocol                                     | `ast/_node.ts`: `Layout = (size, scales, children, node, shape?) => { intrinsicDims, transform }` near line 413; `Placeable` near line 319 (`dims`, `geometry()`, `place`, `setExtent`, `pinAnchor`); `shareAll` and `nestEach` near line 540                              |
| Geometry answers                                      | `ast/geometry/index.ts`: `Geometry extends HasBox, HasEnclosingCircle, HasOutline`. Available only after layout, in pixels                                                                                                                                                 |
| Tilings                                               | `ast/graphicalOperators/treemap.tsx` (after the merge: tile): `type Tiling = (region, weights, options) => Ring[]`; `ast/geometry/voronoiTiling.ts`                                                                                                                        |
| Strategy families                                     | `families/*.ts`; `ast/strategyKind.ts` (`bareKind`); the table `STRATEGIES` in `packages/gofish-ir/src/frontend/descriptors.ts`; checks via `Frontend.checkStrategy`                                                                                                       |
| Polar                                                 | `ast/coordinateTransforms/coord.tsx`, `polar.ts` (`centralAngle`), `clock.ts`; rect drawing in `ast/shapes/rect.tsx`                                                                                                                                                       |
| Choice, first version                                 | `ast/choice/choose.ts` (`chooseFirstFit`, whole chart only)                                                                                                                                                                                                                |

Design notes worth reading before touching the engine: `apps/docs/docs/internals/design/constraints-as-core.md` (what `spread` needs beyond align and distribute; note it still says `Monotonic`, which #1176 replaced with `Pwl`), `layout-synthesis.md`, `size-claims.md`, and `notes/design/modular-layout-algorithms.md`, `notes/design/silhouette-interface.md`. On the PR #806 branch: `notes/design/essence-of-gofish.md`.

## Per bullet

### 1. The minimum gap

- **Semantics.** `solveSeparations` in `stories/_proposals/UserSpaceSeparation.stories.tsx` (56 lines) is the reference: a topological order, one pass for the least solution, one mirrored pass for the greatest.
- **In the engine.** It is a second kind of fact next to `anchor-relation`. Resolve exact gaps into rigid groups first (what `differenceGraph.ts` does today), then separate the groups by longest path. Two minimum gaps on one pair compose by max and never conflict. A cycle of them is an error. `Arith` already has `max`, so the same code can run in formulas for the claim walk.
- **Slack rules.** Start is the least solution. End is the greatest, given an upper bound (the least solution's span by default). Center is their mean. Even shares the slack over the gaps:
  - Sankey columns with no relaxation: node i's top is `least_i + (i + 1) / (n + 1) * (greatest_i - least_i)`.
  - A tidy tree: Walker's rule. When subtree j is pushed right by d because of sibling i, each sibling z between them moves by `d * (z - i) / (j - i)`. `spreadRule` in `UserSpaceTrees.stories.tsx` is the reference and equals `d3.tree` exactly.
- **Contours.** `Spacing.contour` is a minimum gap whose size comes from two outlines. Pairwise against every earlier sibling is quadratic. Kennedy's fold against the merged outline is linear and gives the same answer, so implement the fold. By depth: `fit`, `mergeExtents` in `UserSpaceTrees.stories.tsx`. By vertical position (nodes of different heights): `fitPieces`, `mergePieces` in the same file. A contour in lengths depends on bullet 6.
- **What it must not try to do.** The beeswarm needs an above-or-below choice per pair. Pulls toward a position (sankey relaxation, straightening) are not minimum gaps. Solving "at least p" and "at most p" as one system contradicts itself. "At most" gaps bring back cycles and systems with no solution, so leave them out.
- **Check against.** `SepTreeStart` equals `TreeSymmetryLeft`. `SepTreeCenter` equals `TreeSymmetryMean`. `TreeSymmetrySpread` equals `d3.tree` (0 px, and on 398 random trees via `scratch/trees/check.mjs`). `SepGraphLayers` gives the same ranks as `layers`. Sankey columns for left, right and justify equal d3's (`scratch/d3s/sankey.mjs`, `cmp_sankey.py`). `Cluster` levels equal `d3.cluster`.

### 2. An average of positions

- A dendrogram puts a parent at the mean x of its children. A tidy tree puts it midway between its first and last child. Both are linear equations, and both can be computed in one pass once the children are placed.
- Today `Constraint.align({ x: "middle" })` centers on a group's box, which is the midpoint of the outer two edges, not the mean of the centers.
- **Check against.** `Cluster` in `UserSpaceD3Hierarchy.stories.tsx` computes the mean by hand and matches `d3.cluster` on all 24 nodes (`scratch/d3h/compare.mjs`).

### 3. `layout`

- The body runs in the place pass, when the room is known, and returns an arrangement of children that already exist. The engine then runs measure, solve and place on that arrangement as its own scope inside the box.
- Rules to enforce: the node asks for no room of its own (it fills, like `treemap` with `UNDEFINED` space); no scale is shared across the boundary; a mark created in the body is a loud error; the body is pure.
- Nearest existing mechanisms: `treemap` lays each child out in a room of its own (`nestEach`); `spread` installs its constraints late through `_elaborateInAxisScope`; `chooseFirstFit` rebuilds the whole chart per candidate. Issue #1334 is lazy node operators.
- **Check against.** `StacksSquarify` and `SeqSquarify` equal `BuiltinSquarify0` (3e-14 px and 0 px) with the size typed by hand. With `layout` the same stories should pass with no size typed.
- Nested stacks need sizes written as shares of the parent (`size: weights.map((w) => v(w / sum))`). Raw weights share one scale across nesting levels. After #1375 check how a stack child states a share.

### 4. One sequential tiling with settings

- Reference: `sequential` (40 lines), `drawSequential` (24 lines), `Score` and `Phrase` in `UserSpaceTilings.stories.tsx`. Squarify is `Score.squarified()` with `Phrase.bestDiscontinuous`.
- It works on one level: a flat list of sizes and one rectangle. That is what `tile` is.
- The built-in `binary` is not shown to be a setting of it. d3's binary splits both halves recursively; the paper's pivot is close but not the same.
- The paper (Baudel and Broeksema 2012) has errors that the story's comments list: its listing recurses over all remaining items instead of the row's; its aspect scores divide by the grand total where they need the size still to place; its "Best Discontinuous" phrasing is squarify's own.
- Spacing: d3 tiles the whole box and then shrinks each cell. A stack with gaps gives each child its share of the room that is left. They differ by up to 11% in cell area at spacing 2 (`StacksSquarifySpaced`). The built-in tilings can become presets with no pixel change only at spacing 0. This needs Josh's decision.

### 5. Custom members

- #1101: a member is a declared kind or a user function. #1279 is the audit: nine of twelve families are closed and checked by `Frontend.checkStrategy`, then a switch on `kind`. #692 is public `defineMark` and `defineOperator`.
- The proposal's position: the function returns GoFish (an arrangement), not geometry. A geometry-to-geometry function is a special case.
- Crossing to Python: a function is a callback, as `derive` is. Use the `add-cross-language-construct` skill for anything that crosses.

### 6. `measure`, in lengths

- Only the box exists before the scale is chosen (`Extent`). The enclosing circle and the outline exist only after layout (`geometry()`), in pixels. `pack` reads them after layout and therefore does not fit its room (#967, whose comment has a plan written for the old `Monotonic` engine).
- The public face of a length is `Pwl.Value` with the operations of `Arith`. Anything else (a comparison, a product, a square root) needs pixels, and asking for pixels is an error if the length depends on the scale. That is the error `pack` raises today: "pack: a child has no pixel size".
- A function that calls `measure` runs during the claim walk, after types are resolved, so it must be registered lazily.
- Kennedy's mean uses only add, subtract, max and halving, so it stays symbolic. Walker's spread and the by-position fit compare positions, so they need pixels wherever a position depends on the scale.
- A scope that scales evenly (a circle packing whose radii all come from data) can run once at scale 1 and report a length. That is what d3 does.

### 7. An angle axis that wraps, and stack baselines

- A `spread` along the angle leaves n - 1 gaps. `d3.pie` and `d3.chord` leave n. `Coord.clock({ centralAngle: 2 * Math.PI - pad })` matches d3 exactly but is computed by hand. Stories: `PieSpaced` (off by up to 0.039 rad), `PieSpacedClosed` (exact), `Chord` (exact with the hand-set sweep and a hand-set group size).
- **`Baseline.wiggle()` is already on main** (#1375, merged 11-21): `stack({ baseline: Baseline.wiggle() })`. The proposal's streamgraph prototype predates it and uses an invisible first band. After the merge, replace that workaround and compare with d3's formula using `StackWiggle` and `scratch/d3s/stack.mjs`, `cmp_stack.py`. Whether main's wiggle equals d3's `stackOffsetWiggle` is not checked.
- d3's diverging offset was not tested. It needs two stacks per x that meet at zero.

## Polar bugs

Repro stories are in `UserSpaceD3Hierarchy.stories.tsx`. Comparison script: `scratch/d3h/compare.mjs`, and `rim.mjs` for where arc ends land.

- **Gaps between sunburst wedges.** A rect with a pixel size on one axis, in a non-linear space, is drawn as a line along its midline with a thick stroke: `ast/shapes/rect.tsx`, the "Nonlinear: line path along the midline" branch near line 385, `fill: "none"`, `strokeWidth: thickness + 0.5`. The stroke's end caps follow the curve's tangent, not the radius, so each wedge's outer corners land inside its angle: by up to 0.033 rad in `Sunburst` and 0.006 rad in `Chord`. Short arcs are a single straight cubic. This is the visible gap. The fluent pie (no pixel height) and rects with both sizes from data take the area branch and draw filled wedges with no gaps. The fix is to draw the pixel-thickness case as a filled area too.
- **Same branch, other symptoms.** `stroke: "white"` repaints the whole wedge, because the stroke is the fill. Radii are 0.25 px off because of the extra 0.5.
- **A rect spanning the full circle draws nothing.** Its path starts and ends at the same point (`M150,131.25 C150,131.25 150,131.25 150,131.25`). The sunburst's root disc is missing.
- **A sunburst with data-sized rings gets its radii wrong.** With `h: v(1)` every subtree is pushed outward so its last ring ends at the rim, whatever the cross alignment. That is likely layout, not drawing. The story keeps pixel rings (37.5 px) for this reason.
- **A `ribbon` between two sub-arcs runs along the ring** and never crosses the disc (`ChordRibbons`). d3's ribbon goes through the center.
- **`.relate()` on a coord layer throws**: "`.relate()` is a layer method, but it was called on a coord." Wrapping the content in a layer works.
- **Units.** A plain number along the angle is radians, including `spread` spacing. A plain number along the radius is pixels. Data sizes along the angle fit `centralAngle`.

## Other bugs the prototypes hit

| Bug                                                                                          | Repro                                                                                 | What happens                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `stack` nested in a `stack` or `spread` along the same axis has no size of its own         | `Chord` without the group `w`; `WallStackBesideRect` in `UserSpaceD3Flow.stories.tsx` | It silently gets an equal share (every chord group 1.2166 rad), or inner stacks land on top of each other. A warning appears only when a data-sized sibling is present |
| A stack of data-sized parts beside a data-sized rect in a `layer` breaks the rect's size     | `WallStackPorts`                                                                      | Every node in a column gets the same height. No warning                                                                                                                |
| A `distribute` between two nested operands is ignored                                        | `ReproNestedDistribute` in `UserSpaceTrees.stories.tsx`                               | Subtrees overlap at the same x. No warning                                                                                                                             |
| `Constraint.position` inside a `spread` with `alignment: "start"` or `"middle"` is discarded | `GraphStraightened` comments                                                          | Every column snaps to the top. Only `"baseline"` keeps it                                                                                                              |
| `stack({ dir: "y", alignment: "start" })` over a rect and a stack throws                     | a root with children `[p(a 1, b 2), c 3, q(d 1, e 1)]`                                | "Constraint placement conflict on x: self-placement asserts 0, but self-placement implies 270". `"middle"` works                                                       |
| Even slack cannot be stated beside data sizes                                                | `spread({ spacing: fr(1) })` with `h: "value"`                                        | Warns that it mixes data-driven and flexible sizes, and the scale comes out wrong                                                                                      |
| No way to say a coordinate is already in pixels                                              | `WallSwarmDataY`, `SkylinePackPolar`                                                  | `scatter({ y: "dy" })` fits a scale to the offsets; `position` inside `scatter` loses the offset; `offset` takes no room                                               |
| `Bin.voronoi` clips to the data's bounding box                                               | `VoronoiRelax*`                                                                       | The box cannot be set. The story adds two corner rows                                                                                                                  |
| A `rect` inside a Voronoi tiling draws its cell's bounding box                               | `BuiltinVoronoi` with `rect()`                                                        | No error. It needs `region()`                                                                                                                                          |
| A `.name()` inside a `.mark((d) => ...)` function does not register                          | `UserSpaceTrees` notes                                                                | "Layer \"nodes\" not found"                                                                                                                                            |
| A `createMark` prop declared `"raw"` arrives wrapped                                         | same                                                                                  | A boolean test on it is always true                                                                                                                                    |
| Rendering a combinator puts the legend inside `w`                                            | `UserSpaceTilings`                                                                    | Wrap in `layer({ w, h }, [...])`                                                                                                                                       |
| `stack` along y runs up and `spread` along y runs down                                       | `UserSpaceTilings` probes                                                             | May be changed by #1375; recheck                                                                                                                                       |

None of these is filed as an issue.

## How the evidence was produced

- Stories: `packages/gofish-graphics/stories/_proposals/UserSpace*.stories.tsx`. They draw only through the public API, with the decisions computed in story code.
- Comparison scripts, copied from the session's scratch directory: `proposals/user-space-layouts/scratch/`. The JavaScript and TypeScript ones are saved with a `.txt` suffix so the repo's linter skips them (this file names them without it). Drop the suffix to run one. They read the normalized DOM that `capture-one` writes next to each PNG and compare with d3. Some contain absolute paths to the old scratch directory and to capture output under `tests/tmp/iterate/`; fix the paths before running. `scratch/d3s/package.json` lists the d3 packages that were installed outside the repo (d3-sankey 0.12.3, d3-shape 3.2.0, d3-force 3.0.0).
- The page is built by `python3 proposals/user-space-layouts/build.py` from `page.html` and `snippets.md`. `proposal.md` and `index.html` are generated. `build.py` takes its styles from `proposals/voronoi-treemap/index.html`.

## Results not to redo

- Circle packing as "slide in along an angle until something is touched" holds only in part. It packs within a few percent of d3, but d3's front chain and the built-in beeswarm both use holes a straight slide cannot reach.
- Nelson-Oppen does not combine these solvers. The symbolic and geometry solvers do arithmetic on the same coordinates, and it decides whether a solution exists, not which one. What works is no shared unknowns across a scope boundary, and one direction of sharing inside a scope (a solver order), which the engine already has for overlap and labels.
- Text that wraps belongs to `choose`, not to `layout`.
- Fixed ordered passes are well supported in the layout literature (three to five for visualizations). A pass that creates nodes is what that literature avoids. Ours is contained because what `layout` returns reuses the same passes inside a box whose size is set from outside.
