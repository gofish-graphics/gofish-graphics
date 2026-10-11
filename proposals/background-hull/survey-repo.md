# Background / hull: in-repo, issues and memory survey

Scope: what the repo, its issues and PRs, and the project memory already say
about a "background / hull" relational mark with box, hull and spine modes.
Outside precedent is in a separate survey. Paths are relative to the worktree
root unless absolute. Raw issue dump: `/Users/jmp/.claude/jobs/13f2459c/tmp/issues_raw.json`
(1139 issues + PRs, fetched 2026-10-11).

## Headline findings

1. **The feature already half-exists as `enclose`, with `background` as an
   alias.** `lib.ts:171-173` exports `enclose` and `enclose as background`;
   Python has `background = enclose` (`packages/gofish-python/gofish/ast.py:1693`).
   Today it is box mode only (padded AABB, rounded rect). The handwritten
   Diagrams tutorial and the Basics tutorial teach `background()` by that name.
2. **"box / hull / spine" is not written up anywhere under those names.** The
   closest writeup is Josh's own comment on **#717** (2026-07, after PR #714): one
   polymorphic `enclose` with a `shape` option `"rect" | "ellipse" | "hull" |
"alpha" | "bubble"`, plus an `avoiding` exclusion list, framed as "relation,
   not function". Roadmap **#1138** lists "Hulls — a group of marks in, a path
   out: convex, concave/alpha, rounded/padded, possibly bubble sets" as an agent
   one-shot.
3. **Name collision: "spine" already means something.** In this repo "space-filling
   spine" is the mosaic/marimekko `normalize` axis (`apps/docs/docs/js/api/operators/spread.md:229`,
   `stack.md:55`, `underlying-space.md:1492`, descriptors.ts:918/930,
   `_generated.py` docstrings). api-design.md:125 forbids reusing a word that
   already means something.
4. **The "in between relational mark and operator" tension is already
   formalized** in issue **#707** / `operators-over-placed-nodes.md`: one
   combinator indexed by operand kind (all fresh = operator, mixed refs+fresh =
   open term, all refs + ink = connector). `enclose` is the one construct that
   is used in all three rows today.
5. **Box mode already has two other spellings in core**: `rect` +
   `Constraint.align({x:"span"}, {y:"span"})` (BakingRecipes borders, Constraints
   `AlignSpan` story) and `Constraint.nest({x, y}, [outer, inner])` (size-setting
   containment; gotree containment and `NestedBoxesTree`). A desugaring of box
   mode should land on one of these, not a third path.
6. **`enclose` is combinator-only.** It is a `createNodeOperator`, not a
   `createRelationalMark`: no `.flow()` form, no bag form, no `.layer(enclose())`,
   no `{from,to}`-style form, and no relational auto-zBelow. "One hull per
   cluster" over a scatter cannot be written today without a manual map.
7. **`bubblesets-js@^3` is a declared but unused dependency** (`packages/gofish-graphics/package.json:129`,
   still in `pnpm-lock.yaml`). Its only user, the `wrap` operator, was deleted in
   #396 (commit 0c71a116f); CLAUDE.md still says "Bubblesets-js for enclosure rendering".
   There is no convex-hull or alpha-shape code anywhere in `src/`.

## 1. Design rules that bear on it

From `apps/docs/docs/internals/design/principles.md` and `api-design.md` (read whole):

- **Desugar into the existing core or rethink** (principles.md:151-157). A
  background should be sugar over existing nodes (enclose / layer / nest / a
  path mark), not a new core kind unless the hull geometry genuinely needs one.
- **One concept is one operator** (api-design.md:23); variation goes in an option
  or strategy. Memory `feedback_one_operator.md`: Josh rejected `label` +
  `annotate`; AnnoGram-style `{target, place, connect, enclose}` bundles became
  slots of one `label()`. Directly argues for one name with box/hull/bubble
  strategies, and #397 already floated (and leaned away from) a separate
  `bubbleset` operator.
- **Overlap is fine at the edges, not the middle** (api-design.md:30). Box-mode
  background vs `nest` vs `align span` is a large partial overlap today; build
  degenerate overlaps through one shared mechanism.
- **Prefer the simple general rule to a case split** (api-design.md:40); **data
  flows as lists** (:51): a split never inspects item shape.
- **Strategy families are uppercase namespaces** (api-design.md:151;
  three-surfaces.md "An option whose value is one choice..."): an option whose
  value is one of several named strategies, at least one with arguments, gets a
  family `src/families/<name>.ts`, bound as `export * as X`, published as the
  subpath `gofish-graphics/<name>`, declared in `STRATEGIES`
  (`packages/gofish-ir/src/frontend/descriptors.ts:460`), wire shape
  `{ kind, ...params }`, Python module `gofish/<name>.py` bound in `__init__.py`.
  An option with one strategy has no option at all. Families are closed
  (extensibility is #1101). Closed string sets with no params (alignment, dir)
  stay strings. Memory: "strategies are objects/function calls, never strings"
  for extensible families.
- **A name says the shape of its value** (api-design.md:136;
  `js/concepts/refs-and-selection.md:100-119`): `ref` singular, fails on 0 or
  > 1; `selectAll` plural, never flattened.
- **Plural refs never auto-map** (`operators-over-placed-nodes.md:431-449`):
  "`enclose({ padding: 8 }, points)` is one hull around the whole selection";
  per-element instantiation is explicit (`.each`, #929).
- **Survey precedent first** (api-design.md:102): for layout, Typst, SwiftUI,
  CSS, Auto Layout, TikZ, Figma. **Designers' names over specialist names**
  (:131, Figma over Porter-Duff). **Do not reuse a word** (:125), see "spine"
  above. **Say "visualization"** (examples should mix charts and diagrams).
- **Break cleanly** (:173): no aliases or shims. Note the existing
  `background`/`enclose` alias is itself a second spelling; the proposal should
  settle one name and migrate.
- **Hard examples, rendered candidates, sign-off before implementation**
  (:186-198), and exploration gets a design-space document (:200).
- **Python surface**: children positional, options as snake_case kwargs; wire
  stays camelCase.
- Graphic-design framing (`internals/design/graphic-design.md:30`): "`enclose` is
  common region, `connect` and `arrow` are connectedness" (Gestalt relations as
  primitives, via Bluefish). A bubble set is the one relation that is both.
- Structure to imitate: `notes/design/relational-mark-default-split.md` (problem,
  rule, corpus check, precedent, option word, out of scope),
  `internals/design/build-in-animation.md` (§1 what other systems do, §4 design
  axes), `size-claims.md` (dimensions A/B/C, prior art, recommendation and
  staging), `distributions.md` (§7 API sketches).

## 2. Prior writeups of box / hull / spine

No doc uses "box / hull / spine" as a trio. What exists:

| Where                                                                       | What it says                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#717 comment** (Josh, after PR #714)                                      | One polymorphic `enclose` with `shape: "rect" \| "ellipse" \| "hull" \| "alpha" \| "bubble"`. `alpha` = one concavity knob from convex hull to tight wrap. `avoiding` list (contain A, avoid B) via bubblesets' negative energy; meaningless for rect/ellipse. "Relation, not function": the useful form takes refs to placed nodes. Label containment = sizing is an optimization problem (Penrose-like), later stage. Default `avoiding: "siblings"` tempting for Euler diagrams, but start explicit. Acceptance tests: Topology (avoiding, shapes), InsertionSort (refs). |
| **#397** (open)                                                             | Bring back bubbleset after `wrap` deletion. Option 1 `bubbleset: true` on `enclose` (leaned) vs option 2 a separate `bubbleset` operator. Layout: feed child pixel bboxes as rects to BubbleSets, draw path; size = bbox union + padding; underlying space UNDEFINED. Reference impl at the pre-#396 `wrap.tsx`.                                                                                                                                                                                                                                                             |
| **#974** (open)                                                             | Geometry `boundary(tolerance): Point[]` query; first users = hull enclosures (convex hull of children's outlines, or outlines to bubblesets) and bitmap label placement. An enclose node answers `boundary` with its own hull. Overrides: ellipse sampled, polygon ring, text rotated rect, else box corners.                                                                                                                                                                                                                                                                |
| **#1138 Roadmap**                                                           | "Hulls — a group of marks in, a path out: convex, concave/alpha, rounded/padded, possibly bubble sets." Listed as an agent one-shot. Also "Annotations — callouts, brackets, highlight regions" as a sibling one-shot.                                                                                                                                                                                                                                                                                                                                                       |
| `notes/design/relational-mark-default-split.md:102-111`                     | Enclose fused into a flow obeys the #752 default-split rule with the path-order half vacuous (a set, not a sequence): `spread(lake) → stack(species)` + fused enclose = one outline per species. `group(cluster) → scatter(x,y)` + fused enclose = one hull per cluster, no option. Option word deferred; "over" preferred to "along" for sets. `avoiding` is a separate relational slot.                                                                                                                                                                                    |
| `internals/design/shape-geometry.md:240, 291-296`                           | `boundary` enters "with the first bitmap labeler or hull enclosure"; a group's default boundary is its children's boundaries, "a hull enclosure can override it with a single hull". One law: every geometry answer lies inside the box.                                                                                                                                                                                                                                                                                                                                     |
| `operators-over-placed-nodes.md` + **#707**                                 | Operand-kind table; ink/box rule: post-layout box = own ink ∪ fresh operands; refs contribute nothing. "Every group-of-refs use in the Bluefish gallery is ink-mediated (a background, a border, an underline)".                                                                                                                                                                                                                                                                                                                                                             |
| `shapes-vs-marks.md` (speculative)                                          | Puts `enclose` with `connect`/`arrow` as ref-driven "derived marks" (now "relational marks", #634) whose bbox is induced by refs.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Story friction logs                                                         | `stories/bluefish/Topology.stories.tsx:1-25, 470-520` (no concave enclosure; "group-of-N-refs bounding decoration ... would also solve the concave case if it exposed a shape callback"); `InsertionSort.stories.tsx:178-200` (asymmetric padding wanted).                                                                                                                                                                                                                                                                                                                   |
| Bluefish (`/Users/jmp/bluefish/packages/bluefish-solid/src/background.tsx`) | `Background` takes `padding` (default 10) and a `background={() => <Rect .../>}` **component callback**; the first child is the background shape, sized to the bbox union of the rest and centered. Math3ma story passes a `Blob` (paper.js smoothed path) as the background component. This is the "background is a component" precedent Josh recalls.                                                                                                                                                                                                                      |

"Spine" as Josh means it (bubble-set skeleton, the connecting backbone) appears
nowhere. Bubble Sets (Collins et al. 2009) route a virtual-edge skeleton through
members and draw an iso-contour around it; the skeleton is where "spine" comes
from. In this repo "spine" = mosaic space-filling axis (see headline 3).

## 3. Related issues and PRs

| #         | State        | Gist                                                                                                                       |
| --------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 397       | open         | Bubbleset enclosure for `enclose` (replaces deleted `wrap`)                                                                |
| 717       | open         | Concave/path hulls or document convex-only; Josh's `shape` + `avoiding` comment                                            |
| 974       | open         | `boundary` geometry query; hull enclose is a first user                                                                    |
| 1138      | open         | Roadmap: "Hulls" agent one-shot; "Annotations: highlight regions"                                                          |
| 171       | open         | "Fix enclose operator for nested waffle chart" (no body); enclose commented out in `NestedWaffleChart.stories.tsx:4`       |
| 844       | open         | `ref()` to a constraint-placed sibling lands at origin; repro uses `enclose({padding:6},[ref("b")])`                       |
| 986       | open         | Relational default zBelow not applied to `.relate()` drawing clauses                                                       |
| 935       | open, parked | relate() follow-ups; item 2 uses `background([a,b])` as a false-cycle example; item 3 = clause paint order. Do not re-ask. |
| 929       | open         | relate() open-term steps (clause-born names, `.each`)                                                                      |
| 707       | open         | Operators over placed nodes: one combinator indexed by operand kind, ink/box rule                                          |
| 802       | open         | Operators cannot be `.name()`d (blocks selection-based annotation of groups)                                               |
| 803       | open         | Lower `.label()` onto public selectAll/resolve                                                                             |
| 796       | open         | Group-level callouts anchored to data extrema                                                                              |
| 1109      | open         | Annotation tutorial; "enclose around selected marks" as the elaborated form                                                |
| 751       | open         | Record chart data kind (rows/refs) instead of shape-sniffing (fusion guard)                                                |
| 1101      | open         | Extensibility model for strategy families                                                                                  |
| 290       | open         | `.stack()` as a mark method (mark-side methods vs operators)                                                               |
| 634       | open         | Rename derived marks to relational marks; lists `enclose` among them                                                       |
| 486       | open         | Choice operator / cost-based layout (label-containment sizing is related)                                                  |
| 396       | PR merged    | Deleted `wrap` (the bubbleset operator)                                                                                    |
| 713       | PR merged    | enclose stops re-placing placed children; "enclose = layer + hull ink"                                                     |
| 714       | PR merged    | Bluefish wave 1; gave enclose fill/stroke/dash/opacity, paint behind children                                              |
| 716       | closed       | enclose styling options                                                                                                    |
| 728       | PR merged    | Bluefish wave 2 (BakingRecipes: enclose as invisible group-of-refs, 9 uses)                                                |
| 930       | PR merged    | `.constrain()` → `.relate()`; clauses can draw (`background`/`enclose`)                                                    |
| 966 / 968 | PR           | Shape geometry design note; `geometry()` + `enclosingCircle` + `pack`                                                      |
| 1061      | PR merged    | Deps audit (did not remove bubblesets-js)                                                                                  |
| 405       | PR open      | Labels design; AABB obstacle gathering                                                                                     |
| 1084      | open         | Venn docs example passes rx/ry to ellipse (Venn = adjacent use case)                                                       |

## 4. Existing abstractions

### `enclose` / `background` (the box mode today)

- JS: `packages/gofish-graphics/src/ast/graphicalOperators/enclose.tsx:16-148`,
  `createNodeOperator`. Call shape `enclose(opts?, children)`; also `background`
  (`lib.ts:171-173`). Options: `padding=2` (scalar only), `rx=2`, `ry=2`,
  `fill="none"`, `stroke=gray (#D1D9E2)`, `strokeWidth=1`, `strokeDasharray`,
  `opacity=1`.
- Layout: lays out each child, places it only if unplaced (`placeUnplacedChild`,
  shared with `layer`, #713), so `ref(...)` children keep their LCA-reconciled
  positions. Box = union of children's placed boxes ± padding. Underlying space
  `[UNDEFINED, UNDEFINED]` (no data claims). Lowering: rect first, then children
  (`[box, ...childItems]`, line 142), role `"overlay"`.
- Children may be fresh marks, refs, or a mix. In `.relate()` it is a drawing
  clause (`layer([...]).relate(({a,b}) => [enclose({...}, [a, b])])`, see
  `stories/lowlevel/EncloseRefs.stories.tsx:20-36`).
- Descriptor: `packages/gofish-ir/src/frontend/descriptors.ts:1682-1712`
  (`combinatorMark("enclose", ...)`, doc "Draw a rounded-rect enclosure around the
  union of the children's bboxes"). `position`'s doc (:1716) still says
  "Unlike `enclose`'s convex-hull styling", which is inaccurate (it is a box).
- Python: `enclose(children, *, padding, rx, ry, fill, stroke, stroke_width,
stroke_dasharray, opacity)` (`packages/gofish-python/gofish/_generated.py:543-569`),
  alias `background = enclose` (`ast.py:1690-1693`).
- Docs: `apps/docs/docs/{js,python}/api/operators/enclose.md`; taught as
  `background()` in `js/tutorials/basics.md:131` ("an operator that draws a box
  behind its children") and `js/tutorials/diagrams.md:107` (handwritten: a
  `background` drawing clause over a mix of a fresh `text` and the operand
  `mercury`).
- Gaps, by code reading: no shape choice; scalar padding only; no per-group /
  bag / flow form; not a relational mark, so no auto-zBelow (a filled enclose in
  a `.relate()` clause over refs is a separate node appended after the layer's
  children, so it would paint over them; #986/#935-3 are the same family; not
  verified by render); `.name()` on the result works (it is a node).

### Other ways a "box behind a group" is spelled today

- `rect` + `Constraint.align({ x: "span" })` + `Constraint.align({ y: "span" })`
  (`stories/lowlevel/Constraints.stories.tsx:515-550` `AlignSpan`; BakingRecipes
  12 borders; OhmParseTree x-only span bars under char ranges). The rect is the
  "component"; any rect styling works; no padding (padding needs a padded source).
- `Constraint.nest({ x, y }, [outer, inner])` (`src/ast/constraints/nest.ts`):
  `outer = inner + 2·pad` per axis, inside-out or outside-in (CSS padding), folds
  into auto-fit, single-owner. Two operands only. Used by gotree for parent ⊃
  subtree (`packages/gofish-gotree/src/helpers.ts:109-170`) and
  `stories/lowlevel/{Nest,NestedBoxesTree}.stories.tsx`. The outer can be any
  mark (ellipse in gotree `TreemapOval`; comment notes an ellipse sized to the
  box overflows at the corners, i.e. inscribed, not circumscribed).
- `layer(opts)` with `box: true` (descriptor :1675) and `frame` (`frame.tsx`):
  coordinate boxes, not painted backgrounds.
- `enclose({ fill: "none", stroke: "none", padding: 0 }, refs)` as an invisible
  group-of-refs union (BakingRecipes `union()` helper, 9 uses). This is a second
  job for enclose (a "view" node with a box) distinct from painting.

### Relational marks (`line`, `ribbon`)

- Factory `createRelationalMark(type, produce, config)` at
  `src/ast/marks/chart.ts:641`; `line` at :912, `ribbon` at :969 (both call
  `Connect`). Three forms: combinator `line(opts, [refA, refB, ...])`; pairwise
  `line({ from, to })` over ref-bearing rows after `resolve`; bag form applied
  to `GoFishRef[]` (`chart(selectAll("pts")).mark(line())`, or `.layer(line())`
  over the previous tier). Bag split comes only from `inferred.by` (#752 default
  rule) or a `flow(group({ by }))`; `along` names the path tier.
- Fusion: `.mark(R(opts))` ⇒ `.mark(blank(anchor)).layer(R(rest))`
  (`tagRelationalFusable`, chart.ts ~540-570). Paint channels resolve per group
  with homogeneity collapse (`resolveGroupPaint`, chart.ts ~585-640): a field
  name as `fill` gives one color per group, loud error if mixed.
- Paint order: every relational mark defaults to zBelow its operands
  (`tagRelationalOperands` chart.ts:483; resolved in `layer.tsx:91-192`), via the
  existing `zAbove`/`zBelow` constraints; explicit `.zOrder(n)` suppresses it.
  This default is what a background wants ("behind what it relates").
- Python: `line(children=None, **options)` / `ribbon(...)`
  (`packages/gofish-python/gofish/ast.py:2881-2945`), same three forms.
- A hull relational mark could be `createRelationalMark("hull"|"enclose", (o,
children) => Enclose(...))`, inheriting bag, split, fusion, paint-per-group and
  zBelow for free; the combinator form keeps today's `enclose(opts, [...])`.

### Mark modifiers (the SwiftUI-modifier analog)

- `ModifierConfig` (`src/ast/marks/createOperator.ts:183-196`): method name +
  `apply(node, layerContext, datum, ...args)` + optional serialize `tag`.
  Existing modifiers: `.name` (:357), `.label` (:429), `.zOrder` (:451),
  `.transition` (:469), `.relate` (`chart.ts:1067-1075`). `RelatableMark` type
  `chart.ts:1045-1049`.
- `.label()` is the nearest precedent for a modifier that adds ink attached to a
  mark or operator and elaborates into ordinary marks (#741 "labels elaborate
  like axes"; #803 to lower onto `selectAll`/`resolve`). A `.background(...)`
  modifier would follow it.
- Memory (shape geometry, 2026-09-29/10-03): "`overlap` stays a scatter OPTION,
  not a modifier (modifiers apply to any operator/mark)"; a proposed `.jitter()`
  modifier was dropped. So Josh distinguishes modifiers (apply to anything) from
  options; a background modifier qualifies on that test.
- #802: operators cannot be `.name()`d, which limits selecting groups.

### Strategy families

- `src/families/{animation,color,coord,curve,overlap,tile}.ts`; e.g.
  `families/overlap.ts` (doc comment explains the pattern), bound in `lib.ts`
  as `export * as Overlap from "./families/overlap"`.
- `STRATEGIES` (`descriptors.ts:460-631`): `Tile`, `Overlap`, `Curve` with
  kinds, params (types, defaults, bounds), presets (`Overlap.sina()` = `noise`
  with preset params). `checkStrategy(family, value, where)` in `validate.ts`.
  Python: generated `gofish/{tile,overlap,curve}.py`, bound `from . import curve
as Curve`; snake_case params renamed to wire keys.
- A `Hull`/`Shape`/`Region` family (`X.box({ padding, radius })`,
  `X.hull({ concavity })`, `X.bubble({ ... })`) would be a new STRATEGIES entry
  plus generated Python module. `Curve` is the precedent for a family shared by
  several marks' options.

### Geometry and dependencies

- `geometry()` with `box` + `enclosingCircle` (#968, `ast/geometry/`); `boundary`
  is designed (#974) but not built. Convex hull: no code in `src/`. `pack` uses
  d3-hierarchy `packEnclose` (smallest enclosing circle), which is an "ellipse/
  circle" mode precedent.
- `bubblesets-js@^3.0.0` declared, unused. Deleted `wrap.tsx` (pre-#396,
  `git show 0c71a116f^:packages/gofish-graphics/src/ast/graphicalOperators/wrap.tsx`)
  used `new BubbleSets()`, `pushMember(BubbleSets.rect(...))`,
  `compute().sample(4).simplify(0).bSplines().simplify(0)`, painted the path
  behind children. No `avoid`/non-member use, no virtual edges.
- Best-in-class dependency rule (api-design.md "A dependency must be the best at
  its job") applies if a convex hull / concave hull library is added (d3-polygon
  `polygonHull` exists in d3; the deps audit #1061 moved away from d3-\* by habit).

## 5. Candidate story examples

Easy (box mode, fresh children):

- `stories/tutorials/Basics.stories.tsx:32` and `Diagrams.stories.tsx:43`: planets
  on a dark rounded background, `background({ padding: 20, fill: "#252150",
stroke: "none", rx: 16, ry: 16 }, [spread(...)])`.
- `stories/bluefish/QuantumCircuit.stories.tsx:174-190`: translucent yellow
  highlight pills, `enclose({ padding: 10, rx: 10, fill: "rgba(255,200,0,0.333)",
stroke: "none" }, [OPlus({})])`; note on text baseline offset inside the pill.
- `stories/bluefish/DFSCQ.stories.tsx:120-130`: `TitledBackground` card, title
  inside the box top-left (Bluefish `<TitledBackground>`).
- `stories/bluefish/InsertionSort.stories.tsx:165-177`: row outline around a
  `spreadX` of cells.
- `stories/lowlevel/NameScope.stories.tsx:34-60`: named background with a nested
  operand reached from an outer `.relate()`.

Medium (box over refs, or mixed refs + fresh):

- `apps/docs/docs/js/tutorials/diagrams.md:107-147` (handwritten): `.relate(({
mercury }) => [background({...}, [spread({dir:"y"}, [text(...), mercury])])])`,
  a background over an open term.
- `stories/lowlevel/EncloseRefs.stories.tsx:20-36`: hull over three named rects
  as a relate clause.
- `stories/bluefish/BakingRecipes.stories.tsx:25-70, 272-300`: invisible unions
  of refs (`union()`), bordered cells via `align span`, white table background
  and 0.3-opacity green card (`enclose({ padding: 50, fill: "#7CD4AC", opacity:
0.3 }, [titledTable])`).
- `stories/bluefish/OhmParseTree.stories.tsx:23-60, 272-380`: colored bars that
  span a character range on x only (a one-axis background).
- `stories/bluefish/InsertionSort.stories.tsx:178-235`: dashed teal sorted-prefix
  border over cells `[0, from)`; still uses a hand-computed invisible sizer
  (stale workaround since #713 fixed refs) and wants asymmetric padding.

Hard (hull, concave, hyperedge, per-group):

- `stories/bluefish/Topology.stories.tsx`: three points, colored translucent
  neighborhoods per topology; the a/c set must contain a and c but avoid b
  between them. Today a hand-ported 16-segment Bézier `polygon`. Acceptance test
  named in #717 for `avoiding` and shape strategies. Bluefish source:
  `/Users/jmp/bluefish/packages/bluefish-solid/src/example-gallery/topology.tsx`.
- Cluster hulls over a scatter: `stories/vega-lite/ColoredScatterPlot.stories.tsx`
  (penguins, three species clusters). Not expressible today (enclose has no
  bag/flow form). The #752 note's `group(cluster) → scatter → fused enclose`
  example targets exactly this.
- Grouped-bar or mosaic group outlines: the #752 note's `spread(lake) →
stack(species)` + fused enclose = one outline per species across lakes
  (non-contiguous members, so box mode is wrong and a hull or bubble is needed).
- Node-link group regions / hyperedges: `stories/lowlevel/NodeLink.stories.tsx`
  (edges tier painted behind nodes) is the base to add set regions over a graph
  (Bubble Sets' home use case). No story has one yet.
- gotree containment: `packages/gofish-gotree/stories/gallery/TreemapOval.stories.tsx:14-30`
  (ellipse parent sized to the child box overflows at corners), `BeamTree`
  (asymmetric overhang padding not expressible, memory gotree note),
  `CascadedTreemap`. These use `nest`, i.e. box mode with a component.
- `stories/lowlevel/NestedWaffleChart.stories.tsx:4` (enclose commented out) and
  #171: background per waffle group.
- Bluefish `Math3ma` story (`/Users/jmp/bluefish/packages/bluefish-solid/src/stories/Math3ma.stories.tsx:55-73`):
  nested backgrounds whose shape is a `Blob` component; "background as a
  component" in practice.
- Venn: docs Venn example (#1084), circles with rx/ry; Euler-diagram use was
  flagged in #717 (`avoiding: "siblings"`).

## 6. Decided and parked constraints from memory

Decided (build on these, do not reopen):

- **Relational marks + `.layer()`** (approved 2026-07-10, PR #745): `.layer()`
  hands every tier the previous tier's marks as scope; relational marks default
  to zBelow their operands via `zAbove`/`zBelow` constraints, not a concrete -1;
  no intent inference ("spooky"); `.connect()` deleted.
- **Blank-fusion** (approved, PR #748): `.mark(R(opts))` ⇒
  `.mark(blank(anchor)).layer(R(rest))`; anchor gets only `{w,h,emX,emY}`, all
  paint goes to the connector. Anchor keys on a non-fusing relational mark throw.
- **#752 default split** (PR #786): path tier threads, every other grouping
  splits; `along` replaced `by` on line/ribbon; refs-bag charts use
  `flow(group({by}))`. **Enclose follows the same rule with order vacuous; option
  word deferred, "over" not "along"; `avoiding` is a separate slot.**
- **Strategy namespaces** (#1013, decided 10-03/10-07): UPPERCASE namespace
  per family, `export * as X`, type inside the namespace (`Curve.Curve`), no
  top-level re-export, calls only (no bare strings for extensible families).
- **Paint order #982** (PR #988): each layer sorts only its own children; every
  painting site, enclose included, goes through `orderChildrenForPaint`.
- **Name scoping** (2026-09-25): string names visible up to the nearest
  `createMark`; innermost wins; same-level duplicate = loud error; `createName`
  tokens cross component boundaries.
- **relate() slot** (#878/#930): relate clauses may hold ink (arrow, background
  over refs) and open terms; clauses run in dependency order; local string `ref`
  outside `.relate()` is an error.
- **Operators over placed nodes, plurality** (#707 essay): plural refs never
  auto-map; `enclose(opts, points)` = one hull around the selection.
- **Shape geometry** (#966/#968): one file per query under `ast/geometry/`;
  `boundary` enters only with its first user (hull enclosure qualifies).
- **Naming habits**: Figma-style names over specialist ones; precedent survey
  unprompted (Typst, SwiftUI, CSS, Auto Layout, TikZ, Figma); `ref` singular /
  `selectAll` plural; never "facet"; American spelling; say "visualization".
- **Anchor chrome to the described shape**: annotation chrome anchors via `ref()`
  to the shape it describes, not the plot box (relevant if a background carries a
  title or label).
- **No back-compat, delete don't gate, radical unification**: one mechanism, no
  dual paths; migrate call sites (the `background`/`enclose` alias pair is a
  candidate to collapse).
- **Approve syntax before impl; comparison artifacts**: design asks get a
  published artifact with candidate syntax beside real renders.
- **Constraints vs operators**: don't add parallel fold/placement code; `nest`
  is the size-setting containment constraint.

Parked (do not re-ask):

- **#935** six relate() follow-ups, including the lumped constraint solve (false
  cycles such as `background([a,b])` named `bg` + distribute + align) and clause
  paint order.
- **#954** middle-alignment scale sharing; **#1053/#1054** pixel offset semantics.
- **#290** `.stack()` as a mark method (mark-side vs operator) stays open.

Open and relevant: #751 (rows vs refs data kind replaces shape sniffing in the
fusion guard; a fused hull would be a third consumer), #844 (ref to a
same-layer constraint-placed node lands at origin; repro is an enclose over a
ref), #986 (zBelow default missing for relate drawing clauses), #802 (operators
cannot be named), #1101 (user-defined strategies).
