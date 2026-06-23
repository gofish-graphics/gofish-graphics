# Atom replications

Replications of the unit-visualization examples from **Atom** — Park, Drucker,
Fernandez & Heer, *"Atom: A Grammar for Unit Visualizations"* (IEEE TVCG 2017) —
ported to the GoFish v3 fluent API.

- Reference implementation & example specs: <https://github.com/intuinno/unit>
  (example specs live under [`app/data/`](https://github.com/intuinno/unit/tree/master/app/data)).
- Dataset: the Titanic passenger manifest
  ([`titanic3.csv`](https://github.com/intuinno/unit/blob/master/app/data/titanic3.csv)),
  one record per passenger, exported as
  [`src/data/titanicPassengers.ts`](../../src/data/titanicPassengers.ts).

Nearly every spec in `app/data/` is the *same* Titanic data shown under a different
layout configuration — the specs are feature demos of the Atom grammar, not 33
distinct charts. The stories here cover the **distinct visualization shapes**; the
[coverage table](#coverage-of-appdata-specs) maps every upstream spec onto a story or
a feature gap.

## Stories

| Story | Atom spec(s) | What it shows |
| --- | --- | --- |
| [`TitanicFacet`](./TitanicFacet.stories.tsx) | `titanic_spec_packxy_*`, `fluctuation` | Small-multiple unit grid faceted by class × sex, dots colored by survival. |
| [`TitanicUnitDots`](./TitanicUnitDots.stories.tsx) | `squarified`, `size_sum_*`, `titanic_spec_packxy_*` | Circle treemap; each passenger a circle, packed and faceted by class, sized by fare. |
| [`UnitColumnChart`](./UnitColumnChart.stories.tsx) | `unit_column_chart_shared`, `horizontal_unit_column` | One column of unit dots per class; equal dot size makes column height encode class count. |
| [`UnitHistogram`](./UnitHistogram.stories.tsx) | `unit_small_multiple`, `titanic_spec1`, `editor` | Per-class age histograms whose bars are stacks of unit dots. |
| [`Mosaic`](./Mosaic.stories.tsx) | `mosaic`, `size_sum_shared` | Survival mosaic (aggregated rects): true 2-D marimekko — column width ∝ class size, block height ∝ survival count. |
| [`UnitMosaic`](./UnitMosaic.stories.tsx) | `mosaic`, `editor` | The headline Atom mosaic (paper Fig. 1b): class × sex rows × survived columns, each count-proportional cell filled one dot per passenger. |
| [`Violin`](./Violin.stories.tsx) | `violin` | Per-class age violins; each bin is a centered horizontal row of unit dots, tracing a symmetric density silhouette. |

## The Atom grammar in one paragraph

An Atom spec is a flat `layouts` array applied outside-in to a single flat table,
ending in a `mark`. Each **layout** is a `gridxy` operation with:

- a **`subgroup`** that partitions the current container — `groupby` (by a key),
  `bin` (a quantitative key into `numBin` buckets), `passthrough` (no split), or
  `flatten` (one container per record, i.e. the leaf units);
- a **`size`** rule — `uniform`, `count` (container sized by member count),
  `sum` (by `sum` of a field), or `max` — optionally `isShared` across siblings;
- an **`aspect_ratio`** — `fillX`, `fillY`, `maxfill`, `square`, or `parent`;
- a **`direction`** reading order (`LRBT`, `BT`, …) plus `align`, `margin`,
  `padding`, an optional `sort`, and a debug `box`.

The `mark` (`circle` or `rect`) is drawn at every leaf, with categorical `color` and
its own `size` rule.

## Atom → GoFish mapping

GoFish has no dedicated `gridxy` operator; an Atom layout decomposes into a short
`.flow()` of GoFish operators plus, where needed, a `derive()` data transform.

| Atom construct | GoFish equivalent |
| --- | --- |
| `subgroup: groupby(key)` | `spread({ by: key, dir })` for small multiples, or `.facet({ by, dir })` |
| `subgroup: bin(key, numBin)` | `derive()` that assigns a bin field (e.g. `Math.floor(age/10)*10`), then `spread({ by: binField })` — see [gap #3](#feature-gaps) |
| `subgroup: passthrough` | no operator (carry the array through) |
| `subgroup: flatten` | the terminal `.mark(...)` applied per record; grid wrapping via `derive(rows => chunk(rows, …))` + `spread(dir:"y")` + `spread(dir:"x")` |
| `size: uniform` | a fixed mark size (`circle({ r })`, `rect({ w, h })`) |
| `size: sum(field)` | `treemap({ valueField: field })` |
| `size: count` | per-group count via `groupBy`, then main-axis value-proportional sizing through the σ solve (`rect({ h: "count" })` / `stack`); square-unit (2-D) case awaits equal-aspect coupling ([gap #1](#feature-gaps)) |
| `aspect_ratio: square / fillX / fillY` | manual grid via `chunk(rows, cols)` (e.g. `cols = ceil(sqrt(n))` for square) ([gap #2](#feature-gaps)) |
| `aspect_ratio: maxfill` | `treemap({ tile: "squarify" })`, or manual chunking |
| `direction` (`LRBT`, `BT`, …) + `align` | `spread`'s `dir`, `reverse`, and `alignment` |
| `sort` | `derive(rows => orderBy(rows, key, dir))` (lodash) |
| `mark: circle / rect` + `color` | `circle({ fill })` / `rect({ fill })` with a `chart(data, { color: palette([...]) })` scale |

## Feature gaps

Behaviors in Atom that have no first-class GoFish counterpart today. The stories work
around them as noted; these are candidates for new operators.

1. **`size: count` — container size from member count.** Atom sizes a container by how
   many records it holds, which is what makes a mosaic/fluctuation layout work (cell
   *areas* proportional to a crosstab). GoFish has no `count` aggregator, but — contrary
   to an earlier version of this note — it is *not* missing value-proportional sizing.
   The scoped scale-factor (σ) solve already does that outside-in: a `stack`/`spread`
   inverts its composed size-claims against its pixel budget (`σ = pixels / Σ values`,
   `constraints/proposalPlan.ts`) so `rect({ h: "count" })` gives height ∝ count. Atom's
   mosaic is single-axis-proportional at every level (slice/dice: `fillY` then `fillX`),
   and that is exactly the **main-axis** case the σ solve handles — so a true marimekko of
   rects (column widths *and* heights ∝ count) is expressible today by driving each level
   with size-claims rather than equal-flex `spread`. The [`Mosaic`](./Mosaic.stories.tsx)
   story does exactly this: a horizontal `stack` with a `w: "classTotal"` claim resolves
   column widths ∝ class size, composed with a `normalize`d vertical `stack` for heights —
   a verified, variable-width mosaic with no `count` operator. (The existing
   *Forward Syntax V3 / Mosaic Chart* still renders equal-width because it uses `spread`.)

   What is genuinely deferred is the piece the **unit** ([`UnitMosaic`](./UnitMosaic.stories.tsx))
   version needs: to fill differently-sized count-proportional cells with *uniform square
   dots*, a data unit must measure the same on both axes — an equal-aspect coupling
   `σ = min(W/rangeX, H/rangeY)` applied to both axes (**issue #582**; the general
   `σ_y = k·σ_x` form and its candidate homes are in
   `apps/docs/docs/internals/design/size-claims.md` § "Aspect ratio: three candidate
   homes", gated on the bbox work in #39/#80). Lacking that coupling, `UnitMosaic` fixes
   the dot size and hand-picks per-block row counts (`R ∝ group size`, so a cell of `n`
   dots in `R` rows has area ∝ `n` for any `R`) to manufacture the same proportional areas
   bottom-up. With the σ solve + equal-aspect coupling, that bookkeeping disappears and the
   mosaic falls out of `count`-driven main-axis allocation directly.

2. **Aspect-ratio-driven auto-wrapping.** Atom's `aspect_ratio` (`square`, `maxfill`,
   `fillX`, `fillY`) chooses the grid's row/column counts automatically to hit a target
   shape. GoFish requires the author to pick the wrap width explicitly via
   `chunk(rows, cols)` (e.g. `Math.ceil(Math.sqrt(n))` to approximate `square`). There is
   no operator that derives the wrap from a desired aspect ratio or the parent box.

3. **Row-preserving binning.** The `bin()` helper in
   [`src/ast/transforms.ts`](../../src/ast/transforms.ts) *aggregates* a field into
   `{ start, end, count }` buckets — it does not partition the rows while keeping them, so
   it can't feed a unit (per-record) layout. [`UnitHistogram`](./UnitHistogram.stories.tsx)
   bins by deriving a bucket field manually instead. A row-preserving `bin` subgroup
   (group rows by computed bucket) would close the gap.

4. **`isShared` scales across siblings.** Atom's `isShared` flag on `size`/`color`
   chooses whether a scale is shared across sibling containers or computed per-container.
   GoFish controls shared scales structurally (`spread({ sharedScale })`, fixed vs.
   data-driven mark sizes) rather than per-encoding, so the `isShared: false`
   (per-container) variants of several specs collapse onto the shared rendering.

## Coverage of `app/data` specs

Upstream specs and how they are represented here. "Permutation" means the spec is the
same shape as a listed story with different `isShared` / `aspect_ratio` / `direction`
settings (see [gap #4](#feature-gaps)).

| Spec file | Status |
| --- | --- |
| `unit_column_chart_shared.json`, `unit_column_chart_shared_mark.json`, `horizontal_unit_column.json` | ✅ `UnitColumnChart` |
| `unit_small_multiple.json`, `titanic_spec1.json` | ✅ `UnitHistogram` |
| `mosaic.json` | ✅ `UnitMosaic` (count-proportional unit mosaic) and `Mosaic` (aggregated-rect 2-D marimekko, variable column widths) |
| `fluctuation.json` | ✅ `TitanicFacet` (faceted unit grid; count-sizing gap #1) |
| `squarified.json`, `titanic_spec_packxy_isolated.json`, `titanic_spec_packxy_mixed.json`, `titanic_spec_packxy_hierarchy.json` | ✅ `TitanicUnitDots` (treemap packing) |
| `size_sum_shared.json`, `size_sum_notShared.json` | ✅ `TitanicUnitDots` (`treemap valueField`); ⚠️ non-treemap sum-sizing is gap #1 |
| `size_uniform_shared.json`, `size_uniform_notShared.json` | ➖ Permutation of `TitanicFacet` / `UnitColumnChart` (uniform size, `isShared` toggle — gap #4) |
| `titanic_spec2.json`, `titanic_spec3.json`, `titanic_spec4.json` | ➖ Permutation of `UnitHistogram` / `TitanicFacet` (`aspect_ratio` / `direction` variants — gap #2) |
| `maxfill_aspect.json`, `square_aspect.json` | ➖ Aspect-ratio demos — gap #2 |
| `editor.json` | ➖ Kitchen-sink demo combining `groupby` + `bin` + `passthrough` + `flatten`; shapes covered piecewise by the stories above |
| `violin.json` | ✅ `Violin` |
| `enumerate.json`, `unit_column_chart.json` | ❌ Empty/trivial `layouts` (nothing to render) |
| `default0–5.json` | ❌ Empty/placeholder editor defaults |
| `Untitled-2.json` | ❌ A Vega-Lite spec, not Atom |
| `titanic.csv`, `titanic3.csv` | (data, imported as `titanicPassengers`) |

## Re-rendering

```bash
pnpm --filter gofish-graphics build         # once per session (capture harness needs dist/)
pnpm --filter @gofish/tests capture-one atom # render every atom/* story to tests/tmp/iterate/
```
