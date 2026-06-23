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
| [`Mosaic`](./Mosaic.stories.tsx) | `mosaic`, `size_sum_shared` | Survival mosaic: per-class columns, block height ∝ survival count. |

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
| `size: count` | **no direct equivalent** — aggregate + `normalize()` for one axis only ([gap #1](#feature-gaps)) |
| `aspect_ratio: square / fillX / fillY` | manual grid via `chunk(rows, cols)` (e.g. `cols = ceil(sqrt(n))` for square) ([gap #2](#feature-gaps)) |
| `aspect_ratio: maxfill` | `treemap({ tile: "squarify" })`, or manual chunking |
| `direction` (`LRBT`, `BT`, …) + `align` | `spread`'s `dir`, `reverse`, and `alignment` |
| `sort` | `derive(rows => orderBy(rows, key, dir))` (lodash) |
| `mark: circle / rect` + `color` | `circle({ fill })` / `rect({ fill })` with a `chart(data, { color: palette([...]) })` scale |

## Feature gaps

Behaviors in Atom that have no first-class GoFish counterpart today. The stories work
around them as noted; these are candidates for new operators.

1. **`size: count` — container size from member count.** Atom can size any container by
   how many records it holds, which is what makes a true mosaic/fluctuation layout work
   (cell *areas* proportional to a crosstab). GoFish has no count-sizing operator. The
   [`Mosaic`](./Mosaic.stories.tsx) story aggregates to counts up front and uses
   `normalize()` to make **height** proportional within a column, but **column width**
   stays uniform — `spread` lays out equal-width columns (the existing
   *Forward Syntax V3 / Mosaic Chart* has the same limitation). A 2-D count-proportional
   *unit* mosaic (dots packed into count-sized cells) is not expressible.

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
| `mosaic.json` | ✅ `Mosaic` (height-proportional; width gap #1) |
| `fluctuation.json` | ✅ `TitanicFacet` (faceted unit grid; count-sizing gap #1) |
| `squarified.json`, `titanic_spec_packxy_isolated.json`, `titanic_spec_packxy_mixed.json`, `titanic_spec_packxy_hierarchy.json` | ✅ `TitanicUnitDots` (treemap packing) |
| `size_sum_shared.json`, `size_sum_notShared.json` | ✅ `TitanicUnitDots` (`treemap valueField`); ⚠️ non-treemap sum-sizing is gap #1 |
| `size_uniform_shared.json`, `size_uniform_notShared.json` | ➖ Permutation of `TitanicFacet` / `UnitColumnChart` (uniform size, `isShared` toggle — gap #4) |
| `titanic_spec2.json`, `titanic_spec3.json`, `titanic_spec4.json` | ➖ Permutation of `UnitHistogram` / `TitanicFacet` (`aspect_ratio` / `direction` variants — gap #2) |
| `maxfill_aspect.json`, `square_aspect.json` | ➖ Aspect-ratio demos — gap #2 |
| `editor.json` | ➖ Kitchen-sink demo combining `groupby` + `bin` + `passthrough` + `flatten`; shapes covered piecewise by the stories above |
| `violin.json` | ❌ Not ported — needs density/violin layout (out of scope for the unit family) |
| `enumerate.json`, `unit_column_chart.json` | ❌ Empty/trivial `layouts` (nothing to render) |
| `default0–5.json` | ❌ Empty/placeholder editor defaults |
| `Untitled-2.json` | ❌ A Vega-Lite spec, not Atom |
| `titanic.csv`, `titanic3.csv` | (data, imported as `titanicPassengers`) |

## Re-rendering

```bash
pnpm --filter gofish-graphics build         # once per session (capture harness needs dist/)
pnpm --filter @gofish/tests capture-one atom # render every atom/* story to tests/tmp/iterate/
```
