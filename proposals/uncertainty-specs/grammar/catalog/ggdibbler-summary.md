# ggdibbler catalog: summary (#980)

This catalog tests the distribution grammar in `../theory-fragment.html` on every main ggdibbler example. There are 122 entries in `ggdibbler.json`. Each has the real R code, its render in `img/`, a GoFish spec in the proposed grammar, the step that uses up the draw key, a fit class and a verdict.

Files:

- `render-ggdibbler.R` holds all the R code and renders every image (ggdibbler 0.6.8.9000, seed 980 unless the example sets one, 3.4 by 2.4 in, 110 dpi).
- `ggdibbler-r.json` is what the R script writes.
- `ggdibbler-specs.mjs` holds the GoFish specs and the classifications.
- `build-ggdibbler.mjs` merges the two and formats the specs with prettier into `ggdibbler.json`.

Sources, chosen by a fixed rule:

- the README;
- every `@examples` plot of each exported `geom_*_sample`, `stat_*_sample` and `position_*` function;
- every paper figure that shows a ggdibbler chart.

Specs follow version 2 of the grammar (`../theory-fragment.html`): `sample(data, { n, seed, at })` as a data step that adds the `draw` and `level` columns, `blend: "mean"`, summaries of the draws, and the draw key's type. Everything else is today's GoFish. Where a piece is missing, the spec writes the call it would most likely be and marks it with a `// gap:` comment. Those calls are not existing syntax. Each entry keeps its version 1 class and verdict in `v1_fit` and `v1_verdict`.

Two conventions changed from version 1:

- ggdibbler's alpha overlays are the plain overlay, `group({ by: "draw" })`, with the mark's opacity set to ggdibbler's alpha. ggplot paints the draws over each other, which is what the plain overlay does. `blend: "mean"` averages instead, so it is mentioned only where its limit is the point.
- Layers that share a seed in R share one sample: `const drawn = sample(X, { n, seed })`, read by every chart that needs it.

## Counts

| fit | v1 | v2 |
| --- | -: | -: |
| fits | 60 | 63 |
| gofish-gap | 58 | 59 |
| does-not-fit | 4 | 0 |

| verdict | v1 | v2 |
| --- | -: | -: |
| ok | 119 | 106 |
| warning | 0 | 14 |
| error | 3 | 2 |

Movement from version 1 to version 2:

| v1 → v2 | entries | which |
| --- | -: | --- |
| fits → fits | 60 | |
| gofish-gap → gofish-gap | 58 | |
| does-not-fit → fits | 3 | 62, 63, 100: the layers share one sample |
| does-not-fit → gofish-gap | 1 | 107: `at: "quantiles"` writes it; abline is missing |

Verdicts moved too. Thirteen entries now get a rule 3.2 warning and one gets a rule 3.3 warning, where version 1 had no rule. 107 moved from an error to ok, which is worse (see below).

## does-not-fit

None. Every ggdibbler example can be written in version 2.

## Non-ok verdicts

Rule 3.2 warnings. Each mark joins rows of different cells along a per-cell draw key, so it shows one possible world only if the cells are independent:

- 38 frequency polygons of price by cut
- 47 unemployment lines, one per draw
- 48 step lines
- 49 connected scatter of unemploy and psavert
- 50 points and lines with a missing value
- 55 polygons with random vertices
- 60 area from 0 to the Lake Huron level
- 61 band of level plus or minus 1, with a line
- 62 faceted areas with random x and y
- 87 custom connection shapes
- 94 convex hull per group per draw
- 95 segments to the group mean per draw
- 100 mean mpg per cyl as a line

Rule 3.3 warning:

- 109 one smooth over all draws pooled (paper Fig 7a). One smoother is fitted to every car's draws at once, so the band shrinks as n grows.

Rule 3.4 errors:

- 85 plain stack of groups and draws. `stack({ by: "draw" })` adds the counts of ten draws of one cell, so counts reach about 600.
- 110 paper Fig 8b, the same as 85. This is the paper's own example of why draws must not stack.

85 and 110 are marked `fits` because the grammar can write them and then rejects them by its own rule, which is the intended outcome.

## gofish-gap

Each gap is a missing piece of GoFish that has nothing to do with draws. The draw part of every one of these entries fits.

| missing piece | entries |
| --- | --- |
| contour stat | 01, 22, 23 |
| reference line mark (rule, abline) | 08, 09, 10, 11, 105, 106, 108 |
| boxplot (quartiles of the draws, whiskers, outliers) | 19, 20, 21 |
| 2D kernel density | 27, 28 |
| 1D kernel density (density, violin) | 29, 30, 76, 77, 103, 104 |
| area-proportional size (#972 not merged) | 25, 26 |
| dot-density binning (data-driven bin centers) | 31, 32 |
| jitter on both placed axes (Overlap.jitter moves only the free axis) | 41, 42, 114 |
| composite glyph placed by several fields of one row (pointrange, crossbar, capped error bar) | 44, 45, 46 |
| color that varies along one line | 49 |
| line break at a missing value | 50 |
| point shape channel | 53 |
| polygon whose vertices are rows in data space | 55, 94 (and 86) |
| QQ stat | 56, 57 |
| quantile regression stat | 58, 59 |
| segment from one row's two endpoints, or by angle and length | 64, 69, 95 |
| cutting a polygon into n cells (position_subdivide) | 07, 65, 66, 86, 119 |
| smoothing stat | 67, 68, 109 |
| text with a background box as one mark | 71 |
| user-given connection shape | 87 |
| cumulative count (ECDF) | 88, 89 |
| covariance ellipse stat | 90, 91, 92 |

## Position mapping

ggdibbler names a nested position `A_B`: A is the ggplot position for the groups and B is the position for the draws. GoFish writes each one as an order of ordinary flow steps. Below, `G` is the group key (for example `drv`) and the class spread is the plain x position. The nestings were read off the renders, not taken from the names.

| ggdibbler position | GoFish nesting |
| --- | --- |
| identity (with alpha) = identity_identity | `group({ by: "draw" })` then `group({ by: G })`, with the mark's opacity |
| identity (opaque, points) | `scatter` of all drawn rows, draw key not read |
| stack_identity | `group({ by: "draw" })` then `stack({ by: G })` |
| stack_dodge | `spread({ by: "draw", spacing: 0 })` then `stack({ by: G })` (draw outer) |
| dodge_identity | `spread({ by: G })` then `group({ by: "draw" })` |
| dodge_dodge | `spread({ by: G })` then `spread({ by: "draw", spacing: 0 })` (draw inner) |
| identity_dodge | `spread({ by: "draw", spacing: 0 })` then `group({ by: G })` |
| dodge (plain) | `spread({ by: G, spacing: s })` then `spread({ by: "draw", spacing: s })`, a flat dodge of G by draw written as two spreads with equal spacing |
| stack (plain) | `stack({ by: "draw" })` then `stack({ by: G })`: error under rule 3.4 |
| position_nest("stack_dodge") | the same as stack_dodge; any nesting is just a step order |
| subdivide | `subdivide({ by: "draw" })`: gap, no polygon-cutting operator |
| jitter | `scatter({ overlap: Overlap.jitter() })`: gap for 2D jitter |
| nudge (text, label) | plain scatter; nudge is a fixed offset with no draw meaning |
| times = n | `sample(data, { n })` |

The A_B name does not fix the order of steps. In stack_dodge the draw step is outside the group step, so each thin bar is one draw's whole stack. In dodge_dodge the draw step is inside it, so each group's bar is cut into draws. In GoFish this is visible because the order is written out.

## Merges

Entries were merged only when the plots differ in theme, color or labels, or when the code is byte-identical.

- 02 README raster = Rd geom_raster_sample example 1 (no title or theme) = paper Fig 5c (palette, title).
- 03 README raster with more error = paper Fig 5d (palette, title).
- 05 README stack_identity = Rd position_stack_nested example 3 (alpha 0.2 instead of 0.15).
- 06 README stack_dodge = Rd position_stack_nested example 4 (byte-identical plot code; README adds theme and title).
- 11 Rd geom_abline_sample coef example = paper Fig 10a (line color only).
- 25 Rd geom_count_sample = paper Fig 14a (same help-file example, theme) = paper Fig 10e (color and shape only, reconstructed).
- 31 Rd geom_dotplot_sample = paper Fig 14 middle panel (same help-file example).
- 67 Rd geom_smooth_sample = paper Fig 7b (paper code not given, reconstructed match).

Not merged: Fig 8b to 8d (110 to 112) are kept apart from the README bars because they are horizontal, which is a change of orientation, not of theme.

## Excluded

- Paper Fig 2, Fig 4 and Fig 12: diagrams, illustrations or code, not charts.
- Paper Fig 5a and 5b: plain ggplot2 of the means.
- Paper Fig 14b: a ggdist chart.
- The `scale_*_distribution` help pages: not geom, stat or position pages.
- The plain ggplot2 comparison plots inside the help examples.

## Not rendered

None. Every entry rendered. The `quantreg` package was installed so that 58 and 59 draw their lines. Some paper figures were reconstructed because the paper gives no code. Their sources say "reconstructed": 103 to 120 and 122. Only 121 (Fig 11b) uses the paper's own code. In Fig 6, 105 and 107 are contrast panels drawn with plain ggplot2. Fig 10d (119) uses the Iowa `toy_temp_dist` in place of the Australian map, because `ozmaps` is not installed.

## Where the version 2 text is wrong or incomplete

1. **`at: "quantiles"` makes Fig 6c writable with no warning.** 107 pairs the k-th quantile of the intercept with the k-th quantile of the slope. Version 1 could not write it, which was the right result for the paper's anti-example. In version 2, `sample(cells, { n: 50, at: "quantiles" })` on two independent cells gives both the same 50 levels, so draw k of one cell has the same level as draw k of the other. The draws are comonotone, which is a joint distribution the data never stated, and no rule flags it. `at: "quantiles"` also has no meaning for a joint cell such as a `dist.mvnormal`. The rule that would catch this: a draw key made with `at: "quantiles"` is a level, not a draw, so rule 3.2 should treat a join along it like a join along `level`.
2. **Rule 3.2 draws its line in the wrong place.** It warns on marks whose vertices are rows of different cells (lines, areas, polygons, hulls, segments). Its reason, that the picture is one possible world only if the cells are independent, applies just as well to a stat computed per draw over many cells: a contour (01), a density (29), a smooth (67), an ECDF (88), a QQ plot (56), an ellipse (90) or a boxplot (19). Under the text of 3.2 those get no warning, so the catalog gives them none. It also misses one mark that reads several cells of one row, such as a scatter of two Dist columns (24, 51). Either 3.2 is about joins and those are fine, or it is about any picture that combines cells within a draw, and then most of ggdibbler warns.
3. **"Is not one" is too strong in 3.2.** Under per-cell independent draws, a line through draw 3 of every month is a valid draw of the joint distribution in which the months are independent. It is one possible world under that assumption. The warning should say the chart assumes independence, not that the line is not a world.
4. **Rule 3.4's claim "GoFish already rejects this with CanSum" is wrong.** The stacked quantity in 85 and 110 is a count, and counts are summable, so CanSum accepts the stack. The error needs a second fact: the draw key is a key that sums are never taken across. That is the entity rule of #1198, not CanSum. Rule 3.4 should also say why a dotplot, which stacks draws in a bin, is fine: each stacked dot is one draw's share of probability, and shares of disjoint draws do sum.
5. **Eight examples share a seed, not three.** Section 4 says three ggdibbler examples use one seed so two layers read the same draws. The catalog finds eight: 50, 61, 62, 63, 67, 68, 87 and 100. Moving `sample` to the data fixes all eight.
6. **The table's blend row lists "ggdibbler (finite)".** No ggdibbler example averages. Every overlay paints the draws over each other at a fixed alpha, which is the plain overlay row. The blend row should list only ggdist's CCDF fade.
7. **Fixed column names collide with data.** `sample` writes a column named `level`. The `huron` data in 60 and 61 has its own `level` column (the lake level), so the specs rename it to `lake`. The fragment should say what happens on a clash, or let the author name the columns.
8. **What `sample` does on certain data is still not said.** ggdibbler on plain data draws the plain chart (04, 42). The fragment should say that `sample` on a table with no Dist is the identity, or that it repeats each row n times. Under the second reading, rule 3.4 would reject stacking a certain table after `sample`.
9. **A channel that reads draw is now covered.** Version 1 missed color by draw (93). Rule 3.1 now names it. The unread draw key (24, 40, 41, 52, 53, 114) is also covered by 3.1's "a draw key that nothing uses up".
10. **Nested position names do not map to one order.** The fragment says the two packages differ only in which step uses up the draw key. For ggdibbler the step order also matters, and its names hide it: stack_dodge puts the draw outside the group step, dodge_dodge puts it inside. The mapping table above is needed to apply the claim.
11. **There is no `dist.*` constructor for a categorical Dist with a probability vector** (113 to 116). This was already known from `ggdibbler.md`.
