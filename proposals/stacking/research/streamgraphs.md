# Streamgraphs and stacking: papers and systems, as read

Research notes for the stacking design (round after #1332). Findings only; no API proposal. Read on 2026-11-07. Every section says what was actually fetched. Where a source could not be read, the section says so and does not guess at its content. The croissant proposal's precedent table (d3, Vega-Lite, Plot, ggstream, Mascot on where centering lives) is not repeated here; this file adds the formulas, the sampling behavior, and the theory.

Notation, used throughout. There are n series f*1, ..., f_n over x, in stacking order. The baseline is g_0. The boundaries are g_i = g_0 + f_1 + ... + f_i, so band i lies between g*{i-1} and g_i, and g_n is the top. A prime means the derivative in x. "Common samples" means every series has a value at the same set of x positions.

Terms used in the table at the end:

- **Local in x**: the baseline at x depends only on the values (and maybe derivatives) of the series at that x.
- **Needs a whole-series summary**: some number computed over all x (a sum, a max, an onset time) enters the result.
- **Needs common samples**: the method, as implemented or as written, reads every series at the same x.

## Papers

### ThemeRiver (Havre, Hetzler, Nowell, 1999 tech report; Havre et al. 2000 and 2002)

Read: the 1999 report "ThemeRiver: In Search of Trends, Patterns, and Relationships", https://www.cg.tuwien.ac.at/courses/InfoVis/HallOfFame/2004/05_ThemeRiver/papers/themeriver99.pdf (full text).

Not read: the InfoVis 2000 paper (the PKU and Calgary copies refused the connection) and the TVCG 2002 paper (DOI 10.1109/2945.981848; no open copy found). Byron and Wattenberg's account of ThemeRiver's layout is used below and is marked as theirs.

- What the system decides: a river of theme "currents" over time, symmetric about the x axis. The 1999 report does not give a formula. Byron and Wattenberg (below) state it as g_0 + g_n = 0, so **g_0 = -(1/2) sum_i f_i**.
- Ordering: the 1999 report gives no ordering rule. A theme keeps its position: "If a theme ceases to occur ... then the current disappears and then reappears with the same color representation and in the same position relative to other themes." So the order is fixed per series across x.
- Sampling: the data are counts per "ordered time slice", common to all themes by construction. The boundaries are interpolated between them: "we do not have continuous data and so must approximate the true boundaries by interpolating between discrete data points. As long as the resolution of the data is sufficient, ThemeRiver provides an overview that meets our criteria ... If the user zooms in farther than the data resolution supports, our 'truth' as approximated by the interpolated lines is questionable." A user in their study "expressed more trust in the histogram, because she 'knew' that the bars were exactly the data values". The report does not say whether it interpolates each boundary or each theme, or which curve it uses ("alternate algorithms for line drawing for the currents and river").
- Locality: silhouette is local in x.

### Byron and Wattenberg 2008, "Stacked Graphs: Geometry & Aesthetics"

Read: https://leebyron.com/streamgraph/stackedgraphs_byron_wattenberg.pdf (full text; the formulas are images, read from a render of page 5). IEEE TVCG 14(6), 2008.

The paper's model is continuous: "We model our time series as a set of n real-valued non-negative functions, f1, ..., fn. In what follows, for simplicity, we will assume these are differentiable and defined on the interval [0,1]. One might also consider functions taking values at a discrete set of points, but the notation becomes more cumbersome and in any case it is easy to move from the discrete case to the differentiable case through interpolation." It says nothing more about how to interpolate.

The no-gap rule is stated as a principle: "To conform to the 'macro/micro' principle there can be no space between layers, so that the thickness of the overall stack reflects the sum of the individual time series. Given this constraint, the overall geometry of the stacked graph is determined by two factors: the shape of the 'baseline,' ... and the order of the layers."

The baselines, each the minimizer of an "energy" at each x:

| Name                              | Energy minimized                         | g_0                                                                                                  |
| --------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| zero (traditional)                | none                                     | g_0 = 0                                                                                              |
| silhouette (ThemeRiver)           | g_0^2 + g_n^2                            | g*0 = -(1/2) sum*{i=1..n} f_i                                                                        |
| deviation                         | sum\_{i=0..n} g_i^2                      | g*0 = -(1/(n+1)) sum*{i=1..n} (n - i + 1) f_i                                                        |
| wiggle                            | sum\_{i=0..n} (g_i')^2                   | g*0' = -(1/(n+1)) sum*{i=0..n} sum\_{j=1..i} f_j', which is the derivative of the deviation solution |
| weighted wiggle (the Streamgraph) | sum*{i=1..n} f_i ((g_i' + g*{i-1}')/2)^2 | g*0' = -(1/sum_i f_i) sum*{i=1..n} (f*i'/2 + sum*{j=1..i-1} f_j') f_i, integrated numerically        |

Two facts in the paper that matter for locality:

1. Unweighted wiggle is local. The paper says the deviation solution, differentiated, "minimizes the wiggle measure as well. In other words, this choice of g_0 has the effect of simultaneously minimizing both distance from the x-axis and variation in slope. Moreover, the formula is extremely efficient to calculate." So the deviation baseline, a pointwise weighted sum of the f_i, is also the wiggle minimizer (up to a constant). No derivative and no neighboring x are needed.
2. Weighted wiggle is not. Its g_0' depends on the f_i and f_i' at x, but g_0 itself "can be integrated numerically to yield a solution for g0", so g_0(x) depends on every x before it. It needs derivatives (or differences between neighboring samples) and an order along x. The paper: "While this formula, which minimizes weighted_wiggle, is not as computationally efficient as the formula for optimizing wiggle, it seems to have better visual properties". It also warns: "more complicated distortion functions may not admit the simple point wise optimizations above, possibly requiring results from the calculus of variations or numerical optimization."

Note for the croissant proposal: its "Wiggle" paragraph says wiggle's baseline "at one x depends on every x before it". That holds for weighted wiggle (what d3 and Plot call "wiggle"), not for the paper's unweighted wiggle, which is the local deviation formula. matplotlib's `"wiggle"` is a local formula of this kind (see below).

Ordering ("inside-out", for bursty series): "layers are given a 'inside-out' ordering, in which early-onset time series are placed at the middle, with later-onset series at the top and bottom." The algorithm: "we define the 'weight' of a time series as the sum of all its values. Then after sorting by onset time, we add time series to the list one by one, attempting to 'even out' the weight between the top and bottom half: more precisely, if the sum of the weight of the first half of the current list is greater than half the total weight, we add the series the end; otherwise, we add to the beginning." Onset is "the moment when it is first nonzero". The paper suggests a "measure of volatility" in place of onset, and leaves finding an order where "the 'wiggles' of neighboring layers cancelled out" to future work. Ordering needs whole-series summaries (onset, total).

### Di Bartolomeo and Hu 2016, "There is More to Streamgraphs than Movies: Better Aesthetics via Ordering and Lassoing"

Not read. Computer Graphics Forum 35(3), 2016, DOI 10.1111/cgf.12910. The Eurographics library's text bitstream requires login (HTTP 401), ResearchGate refused, and Semantic Scholar lists no open PDF. The supplementary site https://streamgraphs.github.io/ (read) has only figures for seven datasets.

What is known only second hand, from SineStream's related-work section (read, below): they "criticize that this definition only works for smooth time-series", propose an L1 wiggle, sum*i ((|g_i'| + |g*{i-1}'|)/2) w_i, and an ordering "TwoOpt": "an initial ordering is obtained by sorting all layers in a greedy manner. At each time step, a layer that introduces the lowest wiggle value to the streamgraph is selected and stacked on the graphs. Then, the initial ordering is iteratively refined by swapping adjacent layers if the swapping reduces the wiggle value." The search results' abstract snippets also mention a layer labeling ("lassoing") algorithm linear in the data size. The exact L1 baseline solution method is not known to me.

### Bu et al. 2021, "SineStream: Improving the Readability of Streamgraphs by Minimizing Sine Illusion Effects"

Read: full text, https://kitee0325.github.io/paper/ (the authors' copy linked from the search; the visvar.github.io copy downloaded as an empty PDF). IEEE TVCG 27(2), 2021, DOI 10.1109/TVCG.2020.3030404.

- Model: the same as Byron and Wattenberg, "n real-valued, non-negative, differentiable functions", with g*i = g_0 + sum*{j<=i} f_j.
- Baseline: weighted wiggle (L2) with a new weight. The energy is sum*i ((g_i' + g*{i-1}')/2)^2 w_i with **w_i = exp(-f_i'^2 / (2 c^2)) f_i**, "where c can be either the median, arithmetic mean, harmonic mean, or geometric mean of the |f1'|, |f2'|, ..., |fn'|. ... we choose to set c to be the median. When c = 0, we define wi = fi." The stated aim: "streams with large fluctuations are penalized so that the ones with small fluctuations will have lower slopes". The solution has the same shape as Byron and Wattenberg's, with f_i replaced by w_i as the weight, so it is integrated along x. It needs derivatives explicitly (in the weight as well as in the slope).
- Why L2 and not L1: L1 "prefers a large distortion over several small ones" and so "results in stronger illusions".
- Ordering: hierarchical clustering on a distance between layers, dist(i, j) = comp(i, j) w_th(i, j) w_len(i, j), with a "compensation degree" comp(i, j) = (1/L) sum_t |f_i'(t) + f_j'(t)| / (|f_i'(t)| + |f_j'(t)|), a thickness weight w_th(i, j) = max_t (f_i(t) + f_j(t)), and a length weight w_len(i, j) = max(m/L_i, m/L_j), where "fi(t) denotes the value of fi at the time point t and m indicates the number of time points". A leaf-ordering step on the cluster tree gives the order. All three terms need whole-series summaries, and comp and w_th sum or maximize over shared time points t, so the method as written assumes common samples.
- Sampling: everything is indexed by shared time points t in [1, m]. The paper does not discuss misaligned series.

### Thudt et al. 2016, "Assessing the Readability of Stacked Graphs"

Read: preprint, https://fatemerajabiyazdi.github.io/Files/Publications/streamgraphs_preprint.pdf. Graphics Interface 2016.

A study of stacked area (STACK), ThemeRiver (THEME), streamgraph (STREAM) and an interactive ThemeRiver that straightens one layer (INT). Straightening: "By clicking on one individual stream, the baseline of that stream is straightened ... Clicking on the bottom layer turns the streamgraph into a stacked area chart." In the notation here, straightening layer k sets g*0 = -sum*{j<k} f_j, a local rule. Finding: "STREAM and INT performed better than THEME and STACK", "suggesting that STREAM wiggle reduction improves the graphical perception for this task", with small differences.

### Heer, Kong, Agrawala 2009, "Sizing the Horizon"

Read: https://idl.cs.washington.edu/files/2009-TimeSeries-CHI.pdf (full text). CHI 2009.

A horizon graph divides one series by value, not several series by key: "A normal line chart is divided into bands defined by uniform value ranges. The bands are then layered to reduce the chart height. Negative values can be mirrored or offset into the same space as positive values." Mirrored: "negative values are reflected around the zero point". Offset: "we 'slide up' the negative values. As a result, slopes for negative values are preserved, but the positive and negative values no longer share a common" baseline. In formulas, with band height h, band k shows clamp(f(x) - k h, 0, h); it is local in x. The paper does not discuss how band edges are computed from samples. (My inference, not the paper's: clamping each sample and joining them with lines is not the same as clipping the interpolated line, because a segment that crosses a band edge needs a vertex at the crossing. ggplot2's `stat_align` adds such vertices for the zero line; see below.)

### NYT "The Ebb and Flow of Movies" (2008)

Not read directly. Byron and Wattenberg describe it as the published Streamgraph, laid out with weighted wiggle and the inside-out onset order. SineStream (Fig. 5) uses it as its example of the sine illusion.

### Not read this round

TextFlow, RankExplorer, MultiStream (Cuenca et al. 2018; a PDF exists at lirmm.fr), the Mascot/Atlas papers, Wilkinson's Grammar of Graphics (no copy found online; I could not confirm whether it defines "divide" beside "stack" and "dodge"), Bertin, Kindlmann and Scheidegger's algebraic process. Nothing below relies on them.

## Systems

### d3-shape `stack` (v3.2.0)

Read: source `src/stack.js`, `src/offset/*.js`, `src/order/*.js` from github.com/d3/d3-shape (main), and the docs at https://d3js.org/d3-shape/stack.

- What the user writes: `d3.stack().keys(K).value(fn).order(o).offset(off)(data)`, where data is one row per x and `value(row, key)` gives each key's value at that x. Each series is an array of points "where each point j corresponds to the jth element in the input data". So the input model makes the samples common: there is one x per row, and every key is read at it. The docs say nothing about missing values; the tidy example (`group.get(key).sales`) would throw if a key is missing at an x. The offsets treat NaN as 0 (`|| 0`).
- Offsets, exactly as coded (j is the sample index, i the series in stack order):
  - `none`: g_0 = 0; each series starts at the previous series' top (if that top is NaN, at its bottom).
  - `expand`: divides each value by the column total sum_i f_i(j), then `none`. The top is always 1.
  - `diverging`: positives stack up from 0, negatives stack down from 0, at each j separately.
  - `silhouette`: g_0(j) = -(1/2) sum_i f_i(j). Local. "Shifts the baseline down such that the center of the streamgraph is always at zero."
  - `wiggle`: this is Byron and Wattenberg's **weighted** wiggle, discretized: g*0(0) = 0 and g_0(j) = g_0(j-1) - [sum_i f_i(j) (Δf_i(j)/2 + sum*{k<i} Δf_k(j))] / sum_i f_i(j), with Δf_i(j) = f_i(j) - f_i(j-1). The x positions never enter. Because the formula is in increments, the spacing of x cancels (g_0' dx = Δg_0), so uneven spacing is fine, but every series must be sampled at the same j. Not local: a running sum over j in row order.
- Orders:
  - `none`: key order. `reverse`: key order reversed.
  - `ascending` / `descending`: by each series' sum of values.
  - `appearance`: "the earliest series (according to the maximum value) is at the bottom". The code sorts by the index of the peak, not by onset.
  - `insideOut`: take series in `appearance` order; put each on whichever side (top or bottom) has the smaller running total of sums; return `bottoms.reverse().concat(tops)`. "recommended for streamgraphs in conjunction with the wiggle offset".
  - All orders except none/reverse need whole-series summaries (sum or argmax).

### Vega `stack` transform and Vega-Lite

Read: `packages/vega-encode/src/Stack.js` (vega/vega main); Vega-Lite `src/stack.ts` and `src/compile/data/stack.ts` (vega/vega-lite main); https://vega.github.io/vega-lite/docs/impute.html.

- Vega offsets (`zero`, `center`, `normalize`), per group of rows that share the groupby fields (the x):
  - `zero`: positives and negatives stack separately from 0.
  - `center`: g_0 = (M - S)/2, where S = sum |f_i| in this group and M is the largest S over all groups. So the middle sits at M/2, a constant, and the shape is the silhouette. It uses absolute values. It needs one whole-table summary (M), only to keep coordinates non-negative.
  - `normalize`: each |f_i| divided by S, stacked from 0.
  - Order: the `sort` comparator within each group; Vega-Lite fills it from the `order` channel.
- Alignment: Vega groups by exact x value. Vega-Lite adds an `impute` transform before the stack for path marks: `impute: stackedFieldDef.impute === null ? false : isPathMark(mark)`, which emits `{type: "impute", field, groupby: [stackby...], key: x, method: "value", value: 0}`. So a series with no row at another series' x gets a value of **0** there, not an interpolated value. The impute docs list only `value`, `mean`, `median`, `max`, `min`; there is no interpolation method. With misaligned x this makes each series dip to zero between its own samples.

### Observable Plot `stackY` (0.6.17)

Read: `src/transforms/stack.js` and `docs/transforms/stack.md` (observablehq/plot main), and a run of `stackY` from the repo's installed 0.6.17 (`/tmp/sgres/scripts/plotstack.mjs`).

- Grouping: `group(facet, (i) => X[i])`, so a stack is the set of rows with exactly equal x. There is no alignment step and no imputation.
- Offsets: `normalize` (alias `expand`), `center` (alias `silhouette`), `wiggle`, and a function. `center` centers each stack at 0, then shifts everything so the lowest y1 across all stacks is 0 ("Both the center and wiggle offsets ensure that the lowest element across stacks starts at zero for better default axes"). `wiggle` is the same discrete weighted wiggle as d3, with two differences found in the code: the difference Δf_i is taken against the previous stack in which that series (by z) appeared (0 if none), and stacks are visited in the order their x first appears in the data, not sorted by x.
- Orders: null (input order), `value` (per stack; "can produce crossing paths"), `sum`, `appearance` ("order series by the position of their maximum value"), `inside-out` (the default with wiggle; like d3's but balancing a running signed sum), a field, a comparator, or an explicit z array.
- Misaligned x, run on ggplot2's own example (a at x = 1, 3, 5; b at x = 2, 4, 6): with no offset every row gets y1 = 0. Nothing stacks; the two areas overlap. With `wiggle` the baselines become 1.5, 1.5, 0 for a and 2, 2, 0.5 for b, an artifact of visiting x in data order 1, 3, 5, 2, 4, 6.

### ggplot2 `stat_align` and `position_stack`

Read: `R/stat-align.R`, `R/position-stack.R`, the `geom_area` docs in `R/geom-ribbon.R`, and NEWS.md (tidyverse/ggplot2 main); issue #4850 (the design sketch, by Thomas Lin Pedersen).

- What the user writes: `geom_area(aes(x, y, fill = g))`. Since 3.4.0 the default stat is `"align"`: "To facilitate stacking, the default stat = "align" interpolates groups to a common set of x-coordinates. To turn off this interpolation, stat = "identity" can be used instead." NEWS: "Added stat_align() to align data without common x-coordinates prior to stacking. This is now the default stat for geom_area()".
- What `stat_align` does, per panel, when there is more than one group:
  1. Finds where each group's y crosses 0 between consecutive samples and computes the crossing x by linear interpolation: cross = x*p - y_p (x*{p+1} - x*p)/(y*{p+1} - y_p).
  2. Takes the union of all groups' x and the crossings, `unique_loc`.
  3. Computes `adjust` = min(0.001 times the x range, the smallest gap in `unique_loc` / 3), and adds `unique_loc - adjust` and `unique_loc + adjust` to the set.
  4. For each group, evaluates `stats::approxfun(x, y)` (linear interpolation, NA outside the group's own range) at every location; drops the NAs; then pads one vertex at min - adjust and one at max + adjust with y = 0 (marked `align_padding`; padding that falls outside the scale is removed silently).
  5. If a group has several rows at one x, keeps the first and last and moves the first left by `adjust`, which makes a vertical step.
- `position_stack` then groups rows by exact x and stacks, "positive and negative values ... separately so that positive values stack upwards from the x-axis and negative values stack downward". The inserted zero crossings make that sign split exact on the line. Order: reverse of the group factor levels, "so that the plot matches the legend".
- Sample-point consequence: every group is evaluated at the union of all x, so all boundaries share vertices. For straight segments this is exact (see the theory section). `geom_area` draws straight segments only; it has no curve option.

### ggstream `geom_stream` (master)

Read: `R/geom_stream.R` and `R/min_wiggle.R` (davidsjoberg/ggstream). The README was read in the croissant round.

- What the user writes: `geom_stream(aes(x, y, fill = g), type = "mirror" | "ridge" | "proportional", bw = 0.75, n_grid = 1000, extra_span = 0.01, true_range = "both", sorting = "none" | "onset" | "inside_out", center_fun = NULL)`.
- What it does, per panel:
  1. Builds a uniform grid of `n_grid` points over [min x - extra_span R, max x + extra_span R], R the x range.
  2. Per group: moves each sample to its nearest grid point, sets every other grid point to y = 0, smooths that sequence with `stats::smooth.spline(..., spar = bw)`, and rescales so the mean equals the raw data's mean. (The function is named `new_wiggle` and computes a baseline from a wiggle-like formula, but it is called once per group, so with one stream the baseline term only rescales. I found no wiggle in the output.)
  3. Clamps smoothed values below 0 to 0, and by default (`true_range = "both"`) drops grid points outside the data's x range.
  4. At each grid x, stacks the groups: `mirror` starts at -(sum)/2 (the silhouette), `ridge` at 0, `proportional` divides by the sum first. Then adds `center_fun(x)` to both edges, a user baseline function.
- Sample-point consequence: every group ends on the same dense grid, so boundaries share vertices. It is "smooth each series, then sum", and the clamp keeps every band non-negative, so boundaries cannot cross.
- Orders: `onset` sorts by `arrange(y <= 0, -x)` then first appearance, which (as coded) orders groups by their latest positive x, descending. `inside_out` alternates that order: even ranks negated, odd ranks kept. Neither balances weights.

### matplotlib `stackplot`

Read: `lib/matplotlib/stackplot.py` (matplotlib main).

- What the user writes: `stackplot(x, y1, y2, ..., baseline='zero'|'sym'|'wiggle'|'weighted_wiggle')`. One x array for all series: common samples by the signature. Each band is a `fill_between(x, stack[i], stack[i+1])`, so neighbors use the same array for their shared edge.
- Baselines, with m series indexed k = 1..m:
  - `zero`: g_0 = 0.
  - `sym`: g_0 = -(1/2) sum_k f_k. "sometimes called 'ThemeRiver'".
  - `wiggle`: g*0 = -(1/m) sum_k (m - k + 1/2) f_k. Docstring: "Minimizes the sum of the squared slopes." This is the minimizer of the squared heights of the layer **midlines** (g_0 + sum*{j<k} f_j + f_k/2), a variant of Byron and Wattenberg's deviation formula, which uses the n + 1 edges instead. It is local in x.
  - `weighted_wiggle`: g_0 = -(1/2) sum_k f_k + C(j), where C is a running sum over j of sum_k (move_up_k - 1/2) Δf_k, with move_up_k = (sum of layers above k + f_k/2) / sum f, and Δ the difference from the previous sample (C = 0 at the first sample). "It is also called 'Streamgraph'-layout." Like d3, it uses index differences, so x spacing cancels; it is not local.

### Mascot (`densify`, `divide`, stack layout)

Read: `docs/dist/mascot-es.js` (functions `densifyElement`, `_doRectDensify`, `divideElement`, `_doAreaDivide`, `_stackAreasVert`) and the demos `streamGraph.js`, `stackedAreaChart.js`, `stackedAreaChart2.js` (mascot-vis/mascot-vis.github.io, master). The Mascot paper was not read.

- What the user writes (streamgraph demo):
  ```js
  let anyArea = msc.densify(rect, data, {
    orientation: "horizontal",
    attribute: "date",
  });
  let { newMark: area, collection: areas } = msc.divide(anyArea, data, {
    orientation: "vertical",
    attribute: "industry",
  });
  msc.encode(area, "height", "unemployments");
  msc.encode(area.anyVertex, "x", "date");
  msc.update(areas.layout, { vertCellAlignment: "middle" });
  ```
- Densify: turns a rect into an area with one vertex pair per value of `datatable.getUniqueAttributeValues(attr)`, the unique dates of the **whole table**, sorted for numbers and dates. For number attributes, empty data scopes are kept, not filtered. So the sample set is the union of x over all rows, decided before any series exists.
- Divide (area): makes one piece per industry, each a `duplicate` of the whole area, with the same vertex list, and stacks them with a `StackLayout`. Every piece has the same vertices as the whole, so common samples hold by construction.
- Stack layout for areas (`_stackAreasVert`): for each vertex index i, it reads each piece's height at i and stacks them, keeping a running total per index. `vCnt` comes from the first piece, so it assumes every piece has the same vertex count. With `vertCellAlignment: "middle"` it then shifts vertex i by half the column total, the silhouette. `"bottom"` and `"top"` stack from an edge. No wiggle.
- Note on direction: Mascot's divide makes the pieces, but their heights come from the `height` encoding and the whole's height is their sum. So geometrically it is still "parts given, whole computed". The divide is structural.
- Not traced: what height an encoding gives a vertex whose data scope is empty (a series with no row at some date).

### productplots (Wickham and Hofmann 2011, "Product plots")

Read: the paper, https://vita.had.co.nz/papers/prodplots.pdf (IEEE TVCG 17(12), 2011), and `R/divide.r`, `R/partition-1d.r` (hadley/productplots master).

- The explicit divide form. "spines: width is proportional to value, height occupies full range. Spines are space filling". "bars: height is proportional to value, width equally divides space. Bars are not space filling". In code, `hspine` divides the parent's bounds by `prop(wt)` (the shares), and `hbar` sizes each piece by `wt / max`, a global maximum passed down the recursion (`max_wt`).
- The stacked bar is built in the divide direction: "Stacked bar chart (2d). 1 hbar and 1 vspine." The hbar sizes each column by the marginal f(x); the vspine divides that column by the conditional f(y | x). The paper's basis: "given a conditional distribution and a marginal distribution, we can always find the joint distribution: f(x, y) = f(x|y) f(y)". So "whole given, parts as shares" composes with "size the whole" to give the same picture as stacking parts.
- Recursion: "For each probability in the marginal distribution, divide the current bounds into i sets of new bounds ... For each new bound and matching conditional distribution, call the partition function recursively". It cites Wilkinson for "coordinate systems based on recursive partitioning".
- Categorical only; no continuous x and so no sampling question.

### PiCCL `divide`

Not re-read this round. The croissant proposal's precedent section covers `PICCL.divide(object, direction, { key, sizeEncode, gap })`.

## Summary table

"Common samples" says what the formula needs at a minimum. If each series is a function that can be evaluated at any x, a pointwise method can work from independently sampled series by evaluating all of them at the union of x, as `stat_align` does. A method that integrates along x needs an ordered common grid (or analytic derivatives).

| Strategy                                                                                         | Formula for g_0                                          | Local in x?               | Needs derivative?                             | Needs common samples?                                                           | Needs whole-series summary?                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| zero (stacked area)                                                                              | 0                                                        | yes                       | no                                            | yes, pointwise                                                                  | no                                                                                             |
| diverging (d3, Vega `zero`, Plot default, ggplot2)                                               | positives from 0 up, negatives from 0 down               | yes                       | no                                            | yes, pointwise; exact on lines only with zero crossings inserted (`stat_align`) | no                                                                                             |
| expand / normalize / fill / proportional                                                         | stack f_i / sum f                                        | yes                       | no                                            | yes, pointwise                                                                  | no                                                                                             |
| silhouette (ThemeRiver; d3, matplotlib `sym`, ggstream `mirror`, Mascot `middle`)                | -(1/2) sum f_i                                           | yes                       | no                                            | yes, pointwise                                                                  | no                                                                                             |
| center, Vega                                                                                     | (M - S)/2, M = largest column total                      | yes, up to a constant     | no                                            | yes, pointwise                                                                  | yes (M), for the constant only                                                                 |
| center, Plot                                                                                     | silhouette, then shift so the lowest y1 is 0             | yes, up to a constant     | no                                            | yes, pointwise (exact x match, no alignment)                                    | yes (global min), for the constant only                                                        |
| deviation = unweighted wiggle (Byron and Wattenberg)                                             | -(1/(n+1)) sum (n - i + 1) f_i                           | yes                       | no (its derivative also solves wiggle)        | yes, pointwise                                                                  | no                                                                                             |
| matplotlib `wiggle`                                                                              | -(1/m) sum (m - k + 1/2) f_k                             | yes                       | no                                            | yes, single x array                                                             | no                                                                                             |
| weighted wiggle (Byron and Wattenberg; d3 `wiggle`, Plot `wiggle`, matplotlib `weighted_wiggle`) | integral of -(1/sum f) sum (f*i'/2 + sum*{j<i} f_j') f_i | no: a running sum along x | yes (differences between neighboring samples) | yes, an ordered common grid                                                     | no beyond the running sum (Plot adds the global-min shift)                                     |
| L1 wiggle (Di Bartolomeo and Hu)                                                                 | not read                                                 | not known                 | yes (in the energy, per SineStream)           | not known                                                                       | not known                                                                                      |
| SineStream                                                                                       | weighted wiggle with w_i = exp(-f_i'^2 / 2c^2) f_i       | no                        | yes, also in the weight                       | yes (indexed by shared time points)                                             | c is the median of \|f_1'\|, ..., \|f_n'\|; the paper does not say whether over one x or all x |
| straighten layer k (Thudt et al.)                                                                | -sum\_{j<k} f_j                                          | yes                       | no                                            | yes, pointwise                                                                  | no                                                                                             |
| user baseline function (ggstream `center_fun`)                                                   | any c(x) added to both edges                             | as the function is        | as the function is                            | no                                                                              | no                                                                                             |
| horizon band k (Heer et al.; divides one series)                                                 | band = clamp(f - k h, 0, h)                              | yes                       | no                                            | one series; exact on lines only with crossings of k h inserted                  | no (h is chosen from the range)                                                                |

| Order                                                            | Definition                                                                  | Needs whole-series summary?             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| given / key / factor levels (d3 `none`, ggplot2 reversed levels) | the order the user gives                                                    | no                                      |
| per-x value (Plot `value`)                                       | sort each stack by its values                                               | no, but bands can swap places between x |
| sum (d3 `ascending`/`descending`, Plot `sum`)                    | by total over x                                                             | yes                                     |
| appearance (d3, Plot)                                            | by the x of each series' maximum                                            | yes                                     |
| inside-out (Byron and Wattenberg)                                | sort by onset (first nonzero), add each to the lighter half by total weight | yes (onset, total)                      |
| inside-out (d3, Plot)                                            | appearance order, then alternate sides balancing totals                     | yes (argmax, total)                     |
| inside-out / onset (ggstream)                                    | latest positive x, alternated, no balancing                                 | yes                                     |
| TwoOpt (Di Bartolomeo and Hu, per SineStream)                    | greedy by wiggle, then adjacent swaps                                       | yes (wiggle over all x)                 |
| SineStream                                                       | hierarchical clustering on compensation, thickness and length               | yes                                     |

## Do the boundaries between bands need common sample points?

Short answer from what was read: every system read stacks on common samples, and every system shares the boundary between neighbors by construction, not by a stated rule. No source I read states a theorem that adjacent bands must share the boundary polyline; Byron and Wattenberg state the goal ("there can be no space between layers"), and the systems meet it by computing one array of boundary values and using it for both neighbors (d3: `s1[j][0] = s0[j][1]`; matplotlib: `stack[i]` in two `fill_between` calls; Mascot: one running total per vertex index). The rest of this section is the evidence and one small experiment.

### What each system does when x does not line up

| System                       | Misaligned x                                                                                                           | Result                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ggplot2 `geom_area` (3.4.0+) | `stat_align`: union of x plus zero crossings plus ±adjust points; linear interpolation; 0 padding at each group's ends | exact stacking of the straight-line interpolants                   |
| ggstream                     | snap to a dense uniform grid, smooth each series, stack per grid point                                                 | smooth-then-sum on a common grid                                   |
| Vega-Lite                    | `impute` with value 0 at missing keys (path marks only)                                                                | series drop to 0 between their own samples                         |
| Observable Plot              | none; stacks group by exact x                                                                                          | rows at unshared x are not stacked (all start at 0); areas overlap |
| d3-shape                     | the input is one row per x, so the user must align; missing values become NaN, treated as 0 by offsets                 | the user's job                                                     |
| matplotlib                   | one x array for all series                                                                                             | the user's job                                                     |
| Mascot                       | densify uses the union of x over the whole table, before divide                                                        | common by construction                                             |

### Straight segments: the union of x is exact

A piecewise linear function with knots at X_a, plus one with knots at X_b, is piecewise linear with knots at the union of X_a and X_b. So evaluating every series' linear interpolant at the union of x, then summing, gives exactly the sum of the interpolants, and the stacked boundaries drawn as polylines on that union are exact. This is what ggplot2's `stat_align` does (with `approxfun`), and why it is lossless for `geom_area`. Two extra details it handles: the sign split of `position_stack` is not linear (positives and negatives go to different stacks), so it inserts the zero crossings as extra knots, which makes the split exact on each segment; and a series that starts or ends inside another's range would otherwise have no value there, so it pads a 0 just outside its own range (the ±adjust points), which draws a near-vertical edge. Vega-Lite's impute with 0 is the alternative; it is exact only if the data really are 0 at the missing x.

The same reasoning gives the horizon-graph case (my inference): clamping to a band [k h, (k+1) h] is not linear either, so exact band edges on a polyline need vertices where the line crosses each band edge.

### Curves: stack then curve is not curve then stack

d3 and Plot apply the curve to the stacked boundary values (the "interpolant of sums"), with each boundary drawn once per neighbor from the same numbers, so neighbors share the same path and there are no slivers. The question is whether that path equals the sum of each series' own curve, and whether it can cross the boundary below.

I ran d3-shape 3.2.0's curves on two series at common x (script: `/tmp/sgres/scripts/cross.mjs`), stacked them, and sampled the lower boundary g_1 = f_1 and the upper boundary g_2 = f_1 + f_2 between the knots. Band 2's thickness is curve(g_2) - curve(g_1).

Case 1: x = 0, 1, 2, 3; f_1 = 0, 1, 1, 1; f_2 = 0, 0, 9, 9 (band 2 is empty, then bursts).

| Curve                | Min thickness of band 2 between samples | max \|(curve(g_2) - curve(g_1)) - curve(f_2)\| |
| -------------------- | --------------------------------------- | ---------------------------------------------- |
| linear               | 0.000                                   | 0.000                                          |
| basis                | 0.000                                   | 0.000                                          |
| cardinal             | -0.667 at x ≈ 0.59                      | 0.000                                          |
| natural              | -1.155 at x ≈ 0.58                      | 0.000                                          |
| monotoneX            | -0.385 at x ≈ 0.58                      | 0.385                                          |
| catmullRom (α = 0.5) | -0.227 at x ≈ 0.60                      | 2.206                                          |

Case 2: x = 0..4; f_1 = 1, 4, 1, 4, 1; f_2 = 1, 1, 6, 1, 1 (all positive). No crossings, but the minimum thickness of band 2 falls to 0.519 (monotoneX) and 0.175 (natural) where the data say 1, and monotoneX and catmullRom again differ from curve(f_2) (by 0.481 and 1.030).

What this shows:

1. Curves that are linear in the y values for fixed knots (linear, basis, cardinal, natural) commute with the sum: stacking then curving equals curving each series then stacking, as long as the knots are common. With different knots they do not, because each series' spline has its own knots.
2. Those curves can still overshoot, so a band's thickness curve(f_i) can go below 0 between samples and its two boundaries cross (cardinal and natural above). Basis (a B-spline with non-negative weights) cannot go negative, but it does not pass through the data.
3. monotoneX and centripetal Catmull-Rom are not linear in y (their tangents or parameterization depend on the values), so stack-then-curve differs from curve-then-stack. MonotoneX makes each boundary monotone where its data are, but two monotone boundaries can still cross (case 1).
4. ggstream avoids crossings by a different order of operations: it smooths each series, clamps it at 0, and then sums on a dense common grid drawn with straight segments. The thickness of each band is then its own smoothed curve, never negative.

I found no documentation in d3, Plot, or ggplot2 that discusses this. Plot's docs warn only that the per-x `value` order "can produce crossing paths", which is about order, not curves. Byron and Wattenberg and ThemeRiver both say the discrete data must be interpolated to get the continuous model, and neither says how.

(The catmullRom row is approximate: its curve is not guaranteed to be a function of x, and the script reads y at the nearest sampled point.)

## Stack up and divide: one operation in two directions?

Evidence, as read:

- productplots is the clearest. It has both directions as separate primitives over the same recursive partition: `hbar` sizes pieces against a global maximum (parts given), `hspine`/`vspine` splits a given parent by shares (whole given). Its stacked bar chart is "1 hbar and 1 vspine": size the whole by the marginal, then divide it by the conditional, using f(x, y) = f(y | x) f(x).
- The normalize offsets (d3 `expand`, Vega and Plot `normalize`, ggplot2 `position_fill`, ggstream `proportional`) are the divide direction with the whole fixed at 1: each part's extent is f_i / sum f. Every system implements it as stack-up followed by rescaling, in the same transform as the other offsets.
- Mascot names the operator `divide`, but in the area case the pieces' heights come from an encoding and the stack layout sums them, so the whole's height is computed from the parts. Its divide is structural (it makes pieces with shared vertices), not a division of a given extent by shares.
- PiCCL's `divide` takes a `sizeEncode` (per the croissant proposal's notes), also structural plus an encoding.
- An observation from the formulas above, not from a source: the stacked layout is n equations g*i - g*{i-1} = f_i in n + 1 unknowns g_0..g_n. Every baseline in the table is the one extra condition (g_0 = 0; g_0 + g_n = 0; a least-squares condition; a condition on g_0'). The divide direction fixes g_n - g_0 to a given whole W instead, which is consistent only if the f_i are rescaled to shares of W. So "stack" and "divide" differ in which extra condition is given, and "divide" adds a scale.
- Wilkinson, Bertin, and Kindlmann and Scheidegger were not read, so I cannot say whether they treat the two as one operation.

## Sources

- Byron and Wattenberg 2008: https://leebyron.com/streamgraph/stackedgraphs_byron_wattenberg.pdf
- ThemeRiver 1999 report: https://www.cg.tuwien.ac.at/courses/InfoVis/HallOfFame/2004/05_ThemeRiver/papers/themeriver99.pdf
- SineStream 2021: https://kitee0325.github.io/paper/ (authors' copy); project record https://visvar.github.io/pub/bu2021sinestream.html
- Di Bartolomeo and Hu 2016 (not read): https://diglib.eg.org/handle/10.1111/cgf12910; supplement https://streamgraphs.github.io/
- Thudt et al. 2016: https://fatemerajabiyazdi.github.io/Files/Publications/streamgraphs_preprint.pdf
- Heer, Kong, Agrawala 2009: https://idl.cs.washington.edu/files/2009-TimeSeries-CHI.pdf
- Wickham and Hofmann 2011: https://vita.had.co.nz/papers/prodplots.pdf; code https://github.com/hadley/productplots
- d3-shape: https://github.com/d3/d3-shape (src/stack.js, src/offset, src/order); https://d3js.org/d3-shape/stack
- Vega: https://github.com/vega/vega/blob/main/packages/vega-encode/src/Stack.js
- Vega-Lite: https://github.com/vega/vega-lite (src/stack.ts, src/compile/data/stack.ts); https://vega.github.io/vega-lite/docs/impute.html
- Observable Plot: https://github.com/observablehq/plot (src/transforms/stack.js, docs/transforms/stack.md)
- ggplot2: https://github.com/tidyverse/ggplot2 (R/stat-align.R, R/position-stack.R, R/geom-ribbon.R, NEWS.md); https://github.com/tidyverse/ggplot2/issues/4850
- ggstream: https://github.com/davidsjoberg/ggstream (R/geom_stream.R, R/min_wiggle.R)
- matplotlib: https://github.com/matplotlib/matplotlib/blob/main/lib/matplotlib/stackplot.py
- Mascot: https://github.com/mascot-vis/mascot-vis.github.io (docs/dist/mascot-es.js; docs/demos/static/streamGraph.js, stackedAreaChart.js, stackedAreaChart2.js)
