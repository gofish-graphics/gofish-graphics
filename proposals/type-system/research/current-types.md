# Current GoFish types vs. the "Goes to School" draft

Survey date: 2026-11-12, worktree `type-system-proposal` at 299783950.
Paths are relative to `packages/gofish-graphics/src/` unless they start with `apps/` or `packages/`.
"Unsure" marks a claim I could not confirm from code.

## 0. Summary

- GoFish has **two separate trait vocabularies** today:
  - **Column/unit traits**, on data: `HasLevels`, `HasOrder`, `HasMidpoint`, `HasUnit` (with `traits.CanSum`), `HasQuantity`, `HasDomain`.
  - **Coord axis traits**, on screen axes: `HasZero` and `HasCycle`.
  - The only bridge is cell-level `HasCycle` on `Calendar` parts.
  - `HasZero` and `HasCycle` are not column traits yet (#1051, #1052).
- The only arithmetic trait is **`CanSum`**.
  - #1197 planned `CanAdd`, `CanSubtract`, `CanNegate` and `CanMultiply`.
  - #1200 shipped `CanAdd`, and #1311 renamed it to `CanSum`.
  - The rest were dropped.
- The draft's **additivity axis** (Extensive / Intensive / Cumulative per key) has no counterpart in code.
  - Its open design is #1198, which recommends an `entity` key checked on the data, not per-dimension tags.
  - The memory notes record a decision that extensive/intensive is _not_ a primitive.
- The draft's **value-structure ladder** (Nominal, Ordered, Affine, Ratio, ...) is Stevens's scale types.
  - The maintainer explicitly rejected Stevens names as primitives (#1195 comments, 10-22).
  - They are allowed only as named bundles of facts (#1195 sketch; Stevens bundles are a #1142 follow-up).
- The draft says **embedding is decided by spread vs. scatter**. That is wrong for the current code: embedding is decided by **units** (`isGlyph`, `resolveEmbedding`).
- The draft's `.coord(...)` method and its `table(rows, {key, value})` annotation do not exist.
  - A coord is a chart or layer option.
  - `table` is already a **grid layout operator** (descriptors.ts:1748), so the draft's name collides.
- `log` exported from lib.ts is a debug pass-through, not a log scale.
  - A log coord is only a proposal (scale-transforms, TduMB8U1).
  - The "stack in log is an error" rule is #1326, proposed but not built.

## 1. Traits and where each lives

### 1.1 Column traits (`ColumnType`, `ast/schema.ts`)

| Trait         | Shape                                                    | Declared by                                                   | Read by                                                           | Ref                                       |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| `HasLevels`   | `{levels}`                                               | `Domain.discrete(levels)`                                     | ordinal domains, stray-level error                                | schema.ts:91–191, `strayLevelsError` :799 |
| `HasOrder`    | `{}`                                                     | `Trait.ordered()`, implied by `diverging`                     | ordinal axis order, ordered split (`datumProjection.ts:692`)      | schema.ts:96                              |
| `HasMidpoint` | `{at}` (edge coords, default n/2)                        | `Trait.diverging(mid?)`                                       | centered stack (`stackOrigin` schema.ts:1124–1173), mirrored axis | schema.ts:105                             |
| `HasUnit`     | `{unit, symbol?, traits?:{CanSum?}, zone?, difference?}` | `Unit(...)`, a unit name string, `Unit.time`, `Unit.duration` | unit unification, `checkSummable`                                 | schema.ts:262, 370–505                    |
| `HasQuantity` | `{name}`                                                 | column record `{name, unit}`                                  | axis titles "Quantity (unit)"                                     | schema.ts (#1126)                         |
| `HasDomain`   | `{lo, hi, sorted}`                                       | computed, never declared                                      | domains                                                           | schema.ts                                 |
| `HasInteger`  | `{}`                                                     | Python only                                                   | not read by the engine                                            | Python side                               |

Further notes:

- Column types ride the data array under `Symbol.for("gofish.columnTypes")`.
- `applySchema` (schema.ts:849–940) writes them.
- `columnTypeOf` (692–718) validates them. Examples: `HasOrder` without `HasLevels` is an error (703), and `HasMidpoint` needs order.
- `ACCEPTS` (214–230) says which values each trait admits.

Builders (`families/trait.ts`, `families/domain.ts`, schema.ts:267–491):

- `Unit(name?, {domain?, traits?})`. A unit needs a name or a domain.
- `Domain.discrete(levels)` is the only domain. `Domain.continuous` is a TODO.
- `Trait.ordered()`, `Trait.diverging(mid?)` (implies ordered), `Trait.summable()` (needs a named unit).
- Built-in units:
  - `Unit.time({zone})`: an instant, no `CanSum`, `difference` = duration.
  - `Unit.duration`: `CanSum`.
- Engine-internal units (measure.ts:76–95, 140):
  - `COUNT`: `CanSum`.
  - A normalize share unit "<q> share [by f]": `CanSum` (fieldExpr.ts:624).
  - √unit from the `area` channel: no traits.
- Unknown units (a bare string with no `Unit()` anywhere) have unknown traits and pass every check. This is gradual typing (#1125).

Figure-wide meet:

- Unit traits are merged across the figure by `meetUnitTraits` (measure.ts:250), the `Units` class (403–473) and `meetChartUnits` (schema.ts:959).
- Gap #1208: sums taken at build time (size channel, `.sum()`, treemap, cut, normalize) see only their own chart's schema. Only the stack sum, taken in the type walk, sees the figure.

### 1.2 Coord axis traits (`AxisTraits`, `ast/coordinateTransforms/coord.tsx:52–78`)

- `HasZero{}` means a fixed origin. `HasCycle{period}` means a period.
- Polar and clock declare θ `{HasCycle:{period: 2π}}` and r `{HasZero:{}}` (`polar.ts` ~54).
- Every other axis has neither.
- They act only in the coord fit (coord.tsx:440–471):
  - `HasZero` fits the hull including data 0, so no hole is opened by layout.
  - `HasCycle` sets `dataZero: "start"`, so data 0 sits at `baselineAngle`.
- Origin: PR #1168. Theory: #1195.

### 1.3 Cell-level `HasCycle` (`ast/cells.ts:296–317`)

- Shape: `{unit, levels, cells}` on parts of a cycle, e.g. `field("date").bin(Calendar.month)` giving month-of-year (`CycleCell`).
- TODO(#1052): a polar spread does not yet close the gap between the last part and the first.
- So the draft's "Cyclic(12) closes the loop in polar" is **intended but not built**.

### 1.4 Type-level flags

- `FieldExpr<HasRegion, Binned>` (fieldExpr.ts:107–300) is a TypeScript type parameter.
- `partition` needs a key with regions, i.e. a binned key. This is the only static (compile-time) trait in TS.

### 1.5 Not implemented (names that appear in notes or issues)

| Name                                                | Status                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HasVector`, `HasSides`, `CanAdd` on spaces         | research only (memory "space as traits", artifact N6YYcKQM). PR #1268 was only a naming sweep ("class"/"capability"/"typeclass" → "trait"). The memory line "PR #1268 MERGED, HasVector" is misleading. |
| `CanAdd`, `CanSubtract`, `CanNegate`, `CanMultiply` | #1197 plan. Only `CanAdd` shipped (#1200), then was renamed `CanSum` (#1311). "CanMultiply" survives only as a made-up unknown trait in a test.                                                         |
| `HasCenter`                                         | old name of `HasMidpoint` (still in #996's title)                                                                                                                                                       |
| `HasDifference`, `HasCalendar`                      | in the #1195 sketch (10-22). `HasCalendar` was removed when time became a unit (#1200). `HasDifference` was never built; `HasUnit.difference` carries the time→duration case only.                      |
| column `HasZero`                                    | #1051, open                                                                                                                                                                                             |
| column `HasCycle`                                   | #1052, open (cells only today)                                                                                                                                                                          |

## 2. Placement states and space kinds (`ast/underlyingSpace.ts`)

- Kinds:
  - `continuous`: `CONTINUOUS_TYPE`, :87–119.
  - `ordinal`: `ORDINAL_TYPE`, :121–153.
  - `undefined`.
- `continuous` carries:
  - `dataInterval`.
  - `origin: "pinned" | "free" | "none"` (:64).
  - `measure: UnitRecord {unit, titles, summands}` (:630).
  - `mirrored?` (:412).
  - `cells?`.
- `ordinal` carries domain, titles, `anonymous`, `cells`, `hasOrder`.
- The origin replaced the old five kinds (#984 table):
  - POSITION became `pinned`.
  - SIZE became `free`.
  - DIFFERENCE became `none`.
- The memory notes call the origin a "placement state": pinned = placed, free = pointed, none = width-only.
- Axis drawn: pinned gives an absolute axis, none a difference axis (streamgraph, #1213), free no axis.
- Middle alignment drops the origin, and the loss is absorbing (#954 parked).
- `joinUnits` (:656–704) joins spaces and raises `MeasureClash` (measure.ts:599–648) when two declared units meet.
- `differenceUnits` (:207) maps instant → duration. `magnitude` (:189) reads a size through it.
- The doc says "data 0 stands for the additive identity of the measure's algebraic structure, and measures do not carry that structure yet (a TODO on `seatInScope`)" (underlying-space.md ~1285).
- **Spread returns `ordinal`; stack returns `continuous`** (constraints/distribute.ts:330–400).
- #984 (open) proposes rebuilding the kinds from capabilities. Only the origin split and the names happened.

## 3. Units and errors (`ast/measure.ts`)

- F#-style gradual unit typing via union-find: `unify` (:529), `meetUnits` (:571).
- Two declared units on one shared axis raise `MeasureClash`. Two time zones on one axis are an error (:571).
- Quantities (titles) are kept apart from units (metrology terms; underlying-space.md 1948–1990).
- `checkSummable` (:183–213) has three messages:
  1. √ root unit (the area channel).
  2. A unit whose difference sums (an instant): "subtract a reference first".
  3. Generic: "has no CanSum ... declare `Unit(name, {traits:[Trait.summable()]})`, or average, e.g. `field(x).mean()`".
- It is called from:
  - the size channel (`inferSize` → `sumIn`, fieldExpr.ts:454–462)
  - the area channel
  - `.sum()`
  - the per-row entry size (`cut`)
  - stack (distribute.ts:369 `currentUnits().sum(q,"stack")`, free parts only)
  - treemap size (treemap.tsx:243)
  - the `normalize()` helper (chart.ts:243)
  - `field().normalize()`
- The check reads the column type, not the rows, so a one-row group is checked like any other.
- `count` and `distinct` produce `COUNT`. `sum`, `mean` and `median` keep the source unit; no Δ units (#1200 dropped automatic `Δ<unit>`).
- No unit algebra: there is no USD/item, and no product or quotient of units. That is a #1142 follow-up.

Unchecked gaps noted in docs and memory:

- `magnitude()` has no `HasZero` check (#1051).
- rect `x + w` unit agreement is unchecked.
- treemap drops negative values silently (per memory; I did not find the drop in treemap.tsx by grep, so unsure where).
- `cut` datum weights are not checked for `CanSum` (per memory; `cut` per-row entry size does call the check, so this needs a re-check).
- partition checks no key trait beyond the TS `HasRegion` flag.
- #1208 (cross-chart units at build time).
- #992: nested signed stacks need an "advance" (net value).

## 4. Channels (`ast/channels.ts`)

`ChannelType = "size" | "area" | "pos" | "color" | "raw" | "dims"` (:53).

| Channel                    | Default fold over rows                                     | Check                               | Ref                                       |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| size (`w`, `h`, `r`)       | sum                                                        | `CanSum`                            | inferSize :304, `inferEntrySize` :215–232 |
| area (`circle.area`)       | sum then √                                                 | `CanSum`; result unit √u, no traits | inferAreaSum :318, `sqrtArea` :327        |
| pos (`x`, `cx`, `x2`, ...) | mean (`meanOf`)                                            | none                                | inferPos :310                             |
| color (`fill`, `stroke`)   | first row (`firstRowValue` :362) unless a field expr folds | none                                | inferColor :412                           |
| raw (`text`, ...)          | first row                                                  | none                                | inferRaw :~450                            |
| dims                       | per slot                                                   | per slot                            | CHANNEL_INFER :576–602                    |

Notes:

- Field ops (fieldExpr.ts):
  - Domain ops: `sort`, `reverse`, `bin` (:187), `dropNulls`.
  - Folds: `sum`, `mean`, `median`, `count`, `distinct` (:224–253).
  - `normalize` (:218).
- The schema does not choose the default fold yet. #1198 records a decision to do that: a summable column sums by default, any other declared column averages.
- The memory note "channel types by aggregation semantics" matches the draft's "Intensive<weight>" only partly: `pos` means are **unweighted** (`meanOf`). There is no weighted mean.

## 5. Construct inventory

Sources: `packages/gofish-ir/src/frontend/descriptors.ts` (OPERATORS :1554, LEAF_MARKS :1929, COMBINATOR_MARKS :2323, COORDS :2563, CHART_OPTIONS :1144) and `lib.ts`.

Columns:

- **Data** is what the construct does to rows.
- **Space** is what it does to the underlying space on its axis.
- **Checks** lists what it verifies today.

### 5.1 Flow operators

| Construct                      | Data                           | Space                                                                                                | Checks                                                                                                                                             |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `derive(fn)`                   | arbitrary row map              | none                                                                                                 | none; column types through derive are #999                                                                                                         |
| `filter(pred)`                 | subset                         | none                                                                                                 | none                                                                                                                                               |
| `resolve`                      | follows refs                   | none                                                                                                 | none                                                                                                                                               |
| `join`                         | joins rows                     | none                                                                                                 | none (fan-out double counting is #1198 case 1)                                                                                                     |
| `spread({by, dir})`            | group by key                   | ordinal over the key's levels (or cells); children each keep their own space                         | key order from `HasOrder` or bins; cyclic close is TODO #1052                                                                                      |
| `stack({by, dir})`             | group by key                   | continuous; parts end to end as signed vectors; `HasMidpoint` on `by` centers it and sets `mirrored` | `CanSum` on free parts (distribute.ts:369); centered stack needs nonnegative parts; `stackOrigin` errors if `by` reorders levels non-monotonically |
| `scatter({by, x, y, overlap})` | group; position by mean        | continuous, pinned at data positions                                                                 | unit join on the shared axis                                                                                                                       |
| `group({by})`                  | group, no layout               | layer of children                                                                                    | none                                                                                                                                               |
| `table({by:{x,y}})`            | 2D grid by two keys            | two ordinal axes                                                                                     | key rules as for spread                                                                                                                            |
| `treemap({size, tile})`        | hierarchy                      | px proposals, not claims                                                                             | `CanSum` on size (treemap.tsx:243)                                                                                                                 |
| `pack`                         | circles packed                 | px                                                                                                   | none                                                                                                                                               |
| `partition`                    | splits a region by binned keys | region cells                                                                                         | TS `HasRegion` only                                                                                                                                |
| `log`                          | debug pass-through             | none                                                                                                 | none (not a log scale)                                                                                                                             |
| `enclose` (flow step)          | none                           | outline around children                                                                              | none                                                                                                                                               |

### 5.2 Leaf marks and channels

| Mark                                                      | Channels (types)                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `rect`                                                    | boxDims: x, cx, x2 (pos), w (size), emX, and the same on y; `dims`                                           |
| `circle`                                                  | r (size), area (area), boxDims                                                                               |
| `ellipse`, `petal`, `polygon`, `image`, `region`, `blank` | boxDims, paint                                                                                               |
| `text`                                                    | text (raw), boxDims                                                                                          |
| `line`, `ribbon`                                          | relational marks over refs (`createRelationalMark` chart.ts:751; line :1054, ribbon :1111); `Curve` strategy |
| `enclose`                                                 | `Shape` strategy (blob, fillet, arcs)                                                                        |

Embedding: `rect` draws a point, line or area depending on the embedded flags (shapes/rect.tsx:304–330). See section 6.

### 5.3 Combinators (lowercase over child lists)

- `spread`, `stack`, `scatter`, `group`, `table`, `layer` (coord, axes, padding, transform, box), `enclose`, `position`, `arrow`, `line`, `ribbon`, `treemap`, `pack`.
- Region composites: `union`, `intersect`, `exclude`, `subtract`, `atop`.
- Not in descriptors: `cut`, `cutMark`, `offset`, `stackX/Y`, `spreadX/Y`.

### 5.4 Strategy families (STRATEGIES :647, plus lib.ts)

- Filter, Tile, Overlap, Curve, Bin, Calendar, Shape, Place.
- Coord, Color, Animation, Domain and Trait are families too. Domain and Trait are not in STRATEGIES: they never reach the wire, only the traits they expand into.

### 5.5 Coords (COORDS :2563, `families/coord.ts`)

- `Coord.polar`, `Coord.clock` (θ HasCycle, r HasZero), `Coord.wavy`, `Coord.geo({projection, lon, lat})`.
- Internal `linear`.
- Proposals only: `log`, `sqrt`, `envelope` (#1284), `along`, `spiral`, `Transform` family.

## 6. Coord call shape and embedding

**Call shape.**

- `chart(data, { coord: Coord.polar() })`, or `layer({ coord: Coord.clock() }, [...])`.
- A nested chart with a coord can be used as a mark (scatterpie).
- There is no `.coord()` builder method.
- The memory note "coord at chart boundary" says the coord belongs only at a chart or layer boundary, and operators get only sibling-shared options.
- The draft's `.coord(log("y"))` would therefore be `chart(inv, { coord: <log coord> })`. No log coord exists yet.

**Embedded vs. attached (glyph):**

- Embedding is decided per node and axis by **unit**, not by operator: `isGlyph` (\_node.ts:1377), `resolveEmbedding` (\_node.ts:2283–2330), `baseEmbedded` (data.ts:~386–393).
- A dim embeds iff its size is a data value (or unsized) and its min is in the same unit as its size.
- A **glyph size** is a size in a unit that, on some axis, is placed at a datum in another unit (underlying-space.md 1474–1500, #972).
  - A glyph is not warped by the coord and has its own σ keyed by its unit.
  - Examples: a bubble in a scatter, a circle in a 2D histogram cell.
- A **length of the space** is any other data size. It is warped by the coord and scaled by the axis σ.
  - Examples: a bar in a stack, a circle in a spread slot, a histogram bar.
- Explicit `emX` / `emY` lock embedding on.
- Consequence for the draft:
  - Spread vs. scatter often correlates with the result: scatter places at a datum in another unit.
  - But it is not the rule. A circle in a spread slot is embedded, and a circle in a binned cell is a glyph.

## 7. Design docs

- **api-design.md, Data types section (96–148).** Decided:
  - Meaning lives on the data type (Mackinlay).
  - Units are types (#452).
  - Traits are `Has<Thing>` / `Can<Verb>` with plain names.
  - A unit is a domain plus traits.
  - Named types are sugar.
  - Add a type only where a real example forces it.
- **principles.md.** Checks are for internal correctness, not external utility. GoFish does not forbid "bad" charts.
- **core/underlying-space.md.**
  - Space kinds (236–490).
  - Glyph sizes (1474).
  - Measures: units are types (1948).
  - Column types: the chart schema (2298), with the definition → traits table.
  - Cells and HasCycle (2648, ~2739).
  - Partition (2781).
  - Says a later trait (`HasZero`, `HasCycle`) "is one more key on the record" (~2522).
- **design/flint-chart-notes.md sec 2.**
  - Flint's `aggRole` (additive / intensive / signed-additive / dimension / identifier) maps to GoFish channel folds.
  - Options A (traits, not names), B (+ domain shape, `cyclic(12)` with a value), C (+ named presets at the agent surface).
  - Open question: should a mismatch be an error? The measures-as-types position says yes. Flint silently averages.
- **design/how-axes-work.md sec 1.** "An axis shows a datatype" (decided).
  - Origin, center and units belong to the datatype, not to axis options.
  - `measureOrigin` hard-coding 0 is a known gap (#984).
- **design/distributions.md sec 4.**
  - The ops on `Dist<T>` need traits of T: order for quantiles, affine for the mean, torsor + norm for sd.
  - The mean of a torsor is a point, so a bar of mean temperature is a type error.
- **design/measure-keyed-domains.md sec 1.**
  - Domains are keyed by measure.
  - Gradual typing.
  - Axes only at `chart()` boundaries.
  - A coord starts a new space.
- **design/size-claims.md "Units, summarized".** Merge policy per size write: equal-width is strict, interval width is permissive, flex share never unifies.

## 8. Issues

| #     | State     | Gist                                                                                  | Decision                                                                                                                                                                                                                      |
| ----- | --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #14   | open      | `sqrt` scale for rose charts; a scale vs. a sqrt polar space                          | Superseded by the scale-transforms proposal (sqrt/log as coords; `scaleRadial = Coord.clock({radius:"area"})`)                                                                                                                |
| #48   | open      | Binning as a meta-operator (stack, divide, voronoi as partitions)                     | none; partition cells signed off 10-09 (memory)                                                                                                                                                                               |
| #452  | open      | Treat the underlying space as a type system; types as annotations on the IR           | Josh's comment: a layer's type is a union of domains                                                                                                                                                                          |
| #710  | closed PR | Flint design note: five orthogonal traits behind 46 names                             | Adopt traits, not names (option A/B)                                                                                                                                                                                          |
| #984  | open      | Rebuild the space kinds from typeclasses (vector space, torsor, monoid, finite order) | Only the origin split happened; open questions on negative sizes in non-rect marks                                                                                                                                            |
| #985  | closed PR | Signed h/w grow from the axis 0; free extents carry ascent and descent                | Merged (#773)                                                                                                                                                                                                                 |
| #992  | open      | A nested signed stack needs an advance (net) besides its extent                       | open design                                                                                                                                                                                                                   |
| #1013 | closed    | One namespace per strategy family                                                     | Done (`Overlap.separate()` etc.)                                                                                                                                                                                              |
| #1142 | open      | A unit as one definition: print format plus capabilities; unit algebra                | Decided 10-27: reusable `Unit`, domain + traits array, built-ins under `Unit.*`. A format is presentation, not a trait. Unit algebra (USD/item) is still open.                                                                |
| #1195 | open      | Axis structure as facts naming the operations layout must keep (fixed origin, period) | Stevens names rejected as primitives (10-22). Facts compose, the list is open. Sketch of Stevens types as bundles (`HasDifference`, `HasZero`, ...) not signed off. A translate inside a chart acts in coord space.           |
| #1197 | closed    | `CanAdd`/`CanSubtract`/`CanNegate`/`CanMultiply`                                      | Only `CanAdd` shipped (#1200), renamed `CanSum` (#1311)                                                                                                                                                                       |
| #1198 | open      | Stocks, flows, values per unit: when a sum over rows is valid                         | Recommends **B: an `entity` key** checked on the data (not CF-style per-dimension tags). Default fold comes from the schema (summable sums, other declared columns average). Composite keys and pre-aggregated data are open. |
| #1268 | closed PR | Rename class/capability/typeclass → trait everywhere                                  | naming only                                                                                                                                                                                                                   |
| #1311 | closed PR | `CanAdd` → `CanSum`; order is a trait (`Trait.ordered()`)                             | Reverses the #1142 "order belongs to the domain" correction                                                                                                                                                                   |
| #1312 | closed    | Which traits an operator needs and which it keeps                                     | Raised the requires-table and keeps-table ideas; closed without code (unsure of the resolution)                                                                                                                               |
| #1281 | open      | Tag operators by the traits they preserve (stack keeps order, treemap does not)       | open                                                                                                                                                                                                                          |
| #1326 | open      | Unsafe escape hatches: casts and named overrides; first case is stack in a log coord  | proposed: each coord axis declares which data op becomes screen `+`; `CanSum` check reads the coord                                                                                                                           |
| #1051 | open      | Column `HasZero` for size encodings (no bars of dates or °C)                          | open                                                                                                                                                                                                                          |
| #1052 | open      | Column `HasCycle` (polar close, parts of time)                                        | open; cells partly built                                                                                                                                                                                                      |
| #1199 | open      | Type-system tracker                                                                   | lists #1016, #1120 strict mode, #1122, #1147, #996, #999, #1001, #1090, #1091                                                                                                                                                 |
| #1208 | open      | Build-time sums do not see units from other charts                                    | open                                                                                                                                                                                                                          |

The keyword searches ("trait", "type system", "extensive", "intensive", "additive", "summab", "unit of measure", "HasZero", "torsor") found nothing beyond the above, plus:

- #1091: lint rules by type, research.
- #1270: bidirectional resolution of spaces.
- #1318: typing a layer's parts after every layer.
- #1279: extensibility audit.
- #989: rect negative literal size.

"Extensive" appears only in #1197 and #460; "intensive" only in #1197, #1198 and #710.

## 9. Memory decisions (read-only)

- Traits are named `Has<Thing>` / `Can<Verb>`. The word is "trait", never typeclass, class or capability. `HasCycle`, not `CanWrap` or `HasPeriod`.
- No Stevens scale types as primitives. Bundles such as `Trait.interval()` / `ratio()` are a #1142 follow-up.
- Extensive/intensive is **not** a primitive. Semi-additive data goes through #1198 (entity key recommended).
- Lenz–Shoshani reduces to three needs:
  - min/max need an order.
  - avg needs affine structure (weights summing to 1).
  - sum needs the counted things to be partitioned by the cells.
- Plain numbers `HasZero` by default (#1051). `HasCycle` is #1052.
- Points vs. differences is deferred to #1142.
- Scale transforms (TduMB8U1):
  - log and sqrt become coords that set axis traits.
  - The family is `Transform`.
  - Stack in a log coord is an error (#1326).
  - `area` stays a channel kind.
  - Josh doubts that a coord should apply the Jacobian.
- Coord only at the chart or layer boundary.
- Default is sugar: every default desugars to user-writable code.
- No heuristics users must model.

## 10. Comparison: draft types vs. current

Legend:

- **same** = same idea, another name.
- **draft finer** = the draft distinguishes more.
- **current finer** = the code distinguishes more.
- **draft only** / **current only** = missing on the other side.

### 10.1 Units

| Draft                                            | Current                                                        | Verdict                                                  |
| ------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------- |
| units of measure (`Count<items>`, `USD`, `degC`) | `HasUnit` via `Unit(name, ...)`, gradual, union-find           | same                                                     |
| unit algebra (`USD / items`)                     | none (#1142 open)                                              | draft only                                               |
| `Count<items>` (count of a thing)                | `COUNT` unit; `count`/`distinct` produce it                    | current coarser: one COUNT, no "of items"                |
| —                                                | `HasQuantity` (quantity ≠ unit)                                | current only                                             |
| —                                                | time zone as a unit parameter, instant → duration `difference` | current only (the draft has `Affine<u>`, which is close) |

### 10.2 Value structure

| Draft                                       | Current                                                                                            | Verdict                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Nominal`                                   | `Unit({domain: Domain.discrete(levels)})` with no order: `HasLevels` alone                         | same                                                                        |
| `Ordered`                                   | `HasOrder` (`Trait.ordered()`)                                                                     | same                                                                        |
| `Diverging(mid)`                            | `HasMidpoint{at}` (`Trait.diverging(mid?)`) implying `HasOrder`                                    | same                                                                        |
| `Affine<u>` (points, no zero)               | only `Unit.time` (`difference` = duration); generic points have no marker                          | draft finer                                                                 |
| `Ratio<u>` (true zero)                      | `HasZero` on coord axes only; column `HasZero` is #1051                                            | draft finer on data; current has it on axes                                 |
| `Cyclic(n)`                                 | `HasCycle{period}` on coord θ; cell-level `HasCycle` on calendar parts; column `HasCycle` is #1052 | partly same (period as a value, as Flint notes advise); draft finer on data |
| `Bounded[lo,hi]`                            | `HasDomain` (computed only); `Domain.continuous` TODO                                              | draft finer                                                                 |
| `Positive`                                  | none (centered stack needs nonnegative parts at runtime; treemap drops negatives)                  | draft only                                                                  |
| (ladder Nominal < Ordered < Affine < Ratio) | facts that compose, no ladder (#1195 decision)                                                     | **conflicts with a decision**: Stevens names allowed only as sugar          |
| —                                           | `CanSum` (summable) on the unit                                                                    | current only as a unit trait; the draft puts summing on axis 3              |

### 10.3 Additivity (per field, per key)

| Draft                             | Current                                                                                              | Verdict                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `Extensive<k...>`                 | `CanSum` on the unit, not per key                                                                    | draft finer                         |
| `Intensive<k, w>` (weighted mean) | no `CanSum`: the error message suggests `.mean()`, which is unweighted                               | draft finer (weight)                |
| `Cumulative<k>` (stock over k)    | none; #1198 proposes `entity` (option B) or per-dim tags (option A, CF `cell_methods`), recommends B | draft only (open issue)             |
| per-(field, key) declaration      | #1198 rejects per-dimension tags in favor of one entity key checked on rows                          | **conflicts with a recommendation** |

### 10.4 Key structure

| Draft        | Current                                                     | Verdict                      |
| ------------ | ----------------------------------------------------------- | ---------------------------- |
| discrete key | `spread`/`stack` `by` on any column, `HasLevels`            | same                         |
| ordered key  | `HasOrder`, `Bin` cells                                     | same                         |
| interval key | `field().bin(...)` cells, `HasRegion` TS flag               | same (partition requires it) |
| cyclic key   | calendar-part cells with `HasCycle`; polar close TODO #1052 | partial                      |
| grid key     | `table({by:{x,y}})`, `Bin` products                         | same                         |

### 10.5 Coordinate frame

| Draft                                                   | Current                                                                       | Verdict                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| data vs. mark-local frame                               | underlying space per node, a coord starts a new space, nested charts as marks | same idea                                                     |
| embedded vs. attached, decided by spread vs. scatter    | glyph vs. length of the space, decided by **units** (`isGlyph`)               | current finer, and the draft's rule is wrong for current code |
| `.coord(log("y"))`, `.coord(polar())`                   | `chart(data, {coord: Coord.polar()})`; no log coord                           | the draft's syntax does not exist                             |
| stack creates a meaningful zero; log has none, so error | #1326 proposal (coord axis declares which op becomes screen `+`)              | draft only (proposal exists)                                  |
| —                                                       | origin `pinned`/`free`/`none`, `mirrored`                                     | current only                                                  |

### 10.6 Syntax collisions

- `table(rows, {key, value})` in the draft clashes with the existing `table` grid operator. Annotations live today in `chart(data, { schema })`.
- `Nominal`, `Cyclic(12)` as bare types in the draft vs. `Unit({domain, traits})` today. Named types would be aliases: `const Month = Unit({domain: Domain.discrete(MONTHS), traits: [...]})`.
- Draft `&` intersection types vs. today's `traits: [...]` array.
