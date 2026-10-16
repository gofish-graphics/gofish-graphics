# Prior work on label placement (points, lines, areas, avoidance), for the GoFish proposal

Everything below was fetched from live docs or source pages on 2026-10-16. API spellings are quoted exactly. Every image URL was checked and returned HTTP 200 unless I say otherwise.

**Two unreleased precedents matter most:**

- **Vega-Lite's unmerged `label` encoding (PR #7378).** It turns the Vega `label` transform into one user-facing construct. That construct covers point, bar, line and area labels and has a named "avoid set".
- **directlabels.** Its "Positioning Methods" are lists of composable steps, which makes them a real strategy-pipeline precedent.

---

## 1. ggplot2 `geom_text` / `geom_label` and `position_nudge`

**Spelling.** Scatter:

```r
p + geom_point() + geom_text(hjust = 0, nudge_x = 0.05)
p + geom_text(vjust = 0, nudge_y = 0.5)
p + geom_text(check_overlap = TRUE)
```

There is no line or area labeling in base ggplot2.

**Model.** The user picks the exact position: the data point, plus `nudge_x`/`nudge_y` (that is, `position_nudge`), plus `hjust`/`vjust` justification. There is one automatic behavior, `check_overlap`: "If TRUE, text that overlaps previous text in the same layer will not be plotted. check_overlap happens at draw time and in the order of the data." So the only automation is to drop labels greedily, in data order, within one layer.

**Names.** `nudge_x`, `nudge_y`, `hjust`, `vjust`, `check_overlap`, `label.padding`, `label.r`.

**Concept.** A label is a mark (a geom) in its own layer, positioned by a position adjustment.

**Fit.** A text mark plus a nudge maps directly onto GoFish's existing `text` mark plus an offset. The `check_overlap` design does not fit: avoidance is scoped to "the same layer" and depends on data order.

Source: https://ggplot2.tidyverse.org/reference/geom_text.html

## 2. ggrepel (R): force-based repulsion

**Spelling.**

```r
ggplot(dat, aes(wt, mpg, label = car)) + geom_point() + geom_text_repel()
geom_text_repel(box.padding = 0.5, max.overlaps = Inf)
geom_text_repel(min.segment.length = 0, seed = 42, box.padding = 0.5)
geom_marquee_repel(box.padding = unit(5, "mm"), seed = 1)   # rich-text variant, exists now
```

For end-of-line labels, users combine a nudge to a fixed x, a one-axis constraint and a justification:

```r
geom_text_repel(data = subset(dat, wt > 3), nudge_x = 3.5 - subset(dat, wt > 3)$wt,
                segment.size = 0.2, direction = "y", hjust = 0)
```

There is no built-in area labeling. However, `position_nudge_center()` and `element_text_repel` (repelled axis text) exist.

**Model.** Each label starts at its point plus the nudge. A physics simulation then pushes overlapping labels apart (`force`) and pulls each label back toward its point (`force_pull`). It stops at `max.time` or `max.iter`. A label that still overlaps more than `max.overlaps` items is discarded. A segment (leader line) is drawn when the label ends up far enough from its point. Results are random unless you set `seed`.

**Names (with defaults).**

- Starting position: `nudge_x`, `nudge_y` (0).
- Padding: `box.padding` (0.25 lines), `point.padding` (0), `point.size` (1; `NA` disables repulsion from points).
- Forces: `force` (1), `force_pull` (1).
- Movement: `direction` (`"both"`, `"x"` or `"y"`), `xlim`, `ylim` (a region the labels must stay in).
- Limits: `max.time` (0.5), `max.iter` (10000), `max.overlaps` (10).
- Leader lines: `min.segment.length` (0.5), `arrow`, and `segment.curvature`, `segment.ncp`, `segment.angle`, `segment.square`, `segment.inflect`.
- Other: `seed`, `bg.color`, `bg.r` (halo).

**Avoidance.** Labels avoid each other and the data points of their own layer. They do not avoid other layers.

**Concept.** A label is a mark (a geom) that carries its own layout algorithm.

**Fit.**

- Works well: leader lines, `direction` (constraining movement to one axis), and the "drop if hopeless" rule (`max.overlaps`).
- Does not fit: results are nondeterministic without `seed`. The "nudge to x = 3.5 minus wt" idiom is an awkward way to express "align the labels at the right edge". GoFish would write that with `align`.

**Images.**

- https://ggrepel.slowkow.com/articles/examples_files/figure-html/comparison-1.png
- https://ggrepel.slowkow.com/articles/examples_files/figure-html/direction_y-1.png
- https://ggrepel.slowkow.com/articles/examples_files/figure-html/marquee-1.png

Source: https://ggrepel.slowkow.com/articles/examples.html

## 3. directlabels (R): a strategy family whose methods are pipelines

**Spelling.**

```r
direct.label(p, "last.points")
direct.label(p, "angled.boxes")
p + geom_dl(aes(label = group), method = "last.qp")   # method is required: method=stop("must specify method= argument")
```

**Methods, by plot type** (from the docs index):

- **lineplot:** `angled.boxes`, `first.bumpup`, `first.points`, `first.polygons`, `first.qp`, `lasso.labels`, `last.bumpup`, `last.points`, `last.polygons`, `last.qp`, `lines2`, `maxvar.points`, `maxvar.qp`
- **scatterplot (labels one point cloud per group):** `ahull.grid`, `chull.grid`, `extreme.grid`, `smart.grid`
- **densityplot:** `top.bumptwice`, `top.bumpup`, `top.points`
- **dotplot:** `angled.endpoints`, `top.qp`
- **contourplot:** `bottom.pieces`, `top.pieces`

**Model.** This is the key finding. A Positioning Method is either a function or a list of steps that runs in order. From `R/lineplot.R` and `R/scatterplot.R`:

```r
last.points  <- label.endpoints(max, 0)
last.qp      <- vertical.qp("last.points")          # QP solver so labels don't collide
angled.boxes <- list("far.from.others.borders","calc.boxes","enlarge.box","draw.rects")
smart.grid   <- list("big.boxes","empty.grid")
top.bumptwice: "Label the tops, bump labels up to avoid other labels, then to the side to avoid collisions with points."
```

`angled.boxes` is documented as "Draw a box with the label inside, at the point furthest away from the plot border and any other curve." So each method has two parts: a choice of anchor (`first`, `last`, `maxvar`, `top`, `far.from.others`) and a collision-resolution step (`bumpup`, `qp`, `empty.grid`). Helpers such as `dl.combine`, `dl.move` and `dl.trans` compose them.

**Concept.** A label is one label per group (series or cloud). It is a geom whose layout is a named strategy.

**Fit.**

- Works well: the split into "where on the series" (first, last, max-variance, furthest from others) and "how collisions are resolved" (bumpup, QP, grid) is exactly a two-axis strategy family. `last.qp` (a vertical one-dimensional non-overlap solve at the line end) is the classic best end-label algorithm.
- Does not fit: methods are chosen by string, and some names mix the two axes.

**Image.** https://tdhock.github.io/directlabels/docs/lineplot/bodyweight.angled.boxes.png

Sources:

- https://tdhock.github.io/directlabels/docs/index.html
- https://tdhock.github.io/directlabels/docs/lineplot/posfuns/angled.boxes.html
- https://github.com/tdhock/directlabels/blob/master/R/lineplot.R

## 4. geomtextpath (R): text along a path

**Spelling.**

```r
geom_textline(label = "Mercury vapor pressure", size = 6, vjust = -0.5, linewidth = 1, linecolor = "red4")
geom_labelpath(size = 5, fill = "#F6F6FF")
geom_textdensity(size = 6, fontface = 2, hjust = 0.2, vjust = 0.3)
geom_textcontour(bins = 6, size = 2.5, straight = TRUE)
geom_textsf(data = waterways, aes(label = name), text_smoothing = 65, vjust = -0.8)
```

**Model.** The user writes the line and the label in one geom. The library computes arclength, places the text at fraction `hjust` along the path, and curves each glyph to the tangent. On the docs page, `hjust` "can be numeric (0 to 1), or can accept position descriptions such as "xmid", "ymax", or "auto"." When `vjust` puts the text on the line, the line gets a gap. When `vjust` moves the text off the line, "the line is automatically "filled in"". `upright = FALSE` turns off the default flip that keeps text readable.

**Names.** `hjust` (position along the path), `vjust` (offset across the path), `text_smoothing` (0 to 100), `straight`, `upright`, `gap`, `remove_long`.

**Concept.** The line and its label are a fused geom: a line mark with a text channel.

**Fit.**

- Works well: `hjust` as a fraction of arclength, with named positions (`xmid`, `ymax`, `auto`), and `vjust` as the normal offset. This is the cleanest line-label parameterization.
- Does not fit: fusing the label into the line geom. In GoFish, a relational label would refer to an existing line instead.

**Images.**

- https://allancameron.github.io/geomtextpath/reference/figures/README-textline_demo-1.png
- https://allancameron.github.io/geomtextpath/reference/figures/README-density_demo-1.png
- https://allancameron.github.io/geomtextpath/reference/figures/README-volcano-1.png

Source: https://allancameron.github.io/geomtextpath/

## 5. ggforce `geom_mark_*`: a label on a region, with a leader line

**Spelling.**

```r
ggplot(iris, aes(Petal.Length, Petal.Width)) +
  geom_mark_hull(aes(fill = Species, label = Species, description = desc,
                     filter = Species == 'setosa')) +
  geom_point()
```

**Model.** The geom encloses a group (hull, ellipse, rect or circle). It places a label with a title (`label`) and a body (`description`) outside the region, in free space, and connects them with a connector. `label.buffer` is "The size of the region around the mark where labels cannot be placed."

**Names.**

- Region: `expand`, `radius`, `concavity`.
- Label: `label.margin`, `label.width`, `label.fontsize`, `label.buffer`.
- Connector: `con.colour`, `con.size`, `con.type` ("Either "elbow", "straight", or "none""), `con.border`, `con.cap`, `con.arrow`.

**Concept.** The enclosure and its annotation are fused into one geom.

**Fit.** This is a good precedent for "label a region from outside, with a leader line", and for the `con.*` connector vocabulary. GoFish already has `enclose` and `arrow`, so the label could be a separate relation that targets an `enclose`.

**Image.** https://ggforce.data-imaginist.com/reference/geom_mark_hull-3.png

Source: https://ggforce.data-imaginist.com/reference/geom_mark_hull.html

## 6. Vega `label` transform and the unreleased Vega-Lite `label` channel

### 6a. Vega `label` transform

**Spelling.** This is the labeled scatter example:

```json
{
  "type": "text",
  "from": { "data": "points" },
  "encode": {
    "enter": { "text": { "field": "datum.Title" }, "fontSize": { "value": 8 } }
  },
  "transform": [
    {
      "type": "label",
      "avoidMarks": ["trend"],
      "anchor": ["top", "bottom", "right", "left"],
      "offset": [1],
      "size": { "signal": "[width + 60, height]" }
    }
  ]
}
```

**Parameters:**

- `size` (required) — `[width, height]`.
- `anchor` — String or String[]; the default is all anchors except `middle`. The values are `top-left`, `left`, `bottom-left`, `top`, `bottom`, `top-right`, `right`, `bottom-right`, `middle`.
- `offset` — Number or Number[]; the default is 1 per anchor.
- `avoidMarks` — names of marks to avoid.
- `avoidBaseMark` — Boolean, default `true`.
- `lineAnchor` — `"start"` or `"end"`, default `"end"`. It applies when the base is a group of lines and gives one label per line.
- `markIndex` — default 0. It picks the base mark inside a group.
- `method` — `"naive"` (default), `"reduced-search"` or `"floodfill"`. It applies to area groups.
- `padding` — default 0. It is how far a label may extend past the chart bounds.
- `sort` — placement order.
- `as` — default `['x','y','opacity','align','baseline']`.

**Model.** The text mark reads `from: {data: "<base mark name>"}`, so a label is a text mark derived from another mark's scenegraph items. The transform then works per label:

1. It derives candidates: an anchor list × offsets around the base item's bounding box. For lines, the candidates sit at the start or end point. For areas, they come from the area search method.
2. It tests candidates in order against an occupancy bitmap. The bitmap holds the rasterized avoid-marks, plus labels already placed.
3. It places the label at the first candidate that fits. If none fits, it hides the label with `opacity = 0`.

This is greedy, ordered by `sort`. It never moves labels after placing them and has no force step.

**Area methods,** from the Vega-Lite label branch docs:

- `naive` — "the label is placed at the widest part of the area… does **not** prevent labels from overlapping with each other".
- `reduced-search` — "the center of the largest rectangle that can fit into the area… [with] the same height and width proportion as of the label". The search runs along the vertical lines of the data points.
- `floodfill` — "every pixel in the area… slow… best result".

**Concept.** A label is a transform on a text mark that points at a base mark.

### 6b. Vega-Lite `encoding.label`

This was merged once into master as PR #7222 in 2021. It was redone as PR #7378, which is still open on the `label` branch, so it is not released. Release status: Vega-Lite issue #7228, "Add automatic dodge / repel of overlapping text marks", is still open.

**Spelling.** One channel serves every geometry:

```json
{"mark": "point", "encoding": {"x": ..., "y": ...,
  "label": {"field": "Horsepower", "mark": {"color": "red", "fontSize": 5}}}}

{"mark": "line", "encoding": {..., "label": {"field": "price"}}}

{"mark": "area", "encoding": {..., "y": {"field": "density", "stack": "zero"},
  "color": {"field": "Species"}, "label": {"field": "Species"}}}
```

The docs syntax block lists `label: {field, positions, avoid, mark, padding, method, lineAnchor}`.

**`LabelDefMixins`,** from `src/channeldef.ts` on the `label` branch:

- `position?: {anchor, offset}[]` — a list of candidates. The default depends on the mark:
  - Points: 8 positions in Imhof-like order, starting `top-right`, `top`, `top-left`, … with offset 2.
  - Vertical bars: `[{anchor:"top",offset:2},{anchor:"top",offset:-2}]`. A negative offset means inside.
  - Lines with `lineAnchor` set to `"end"`: `top-right`, `right`, `bottom-right`.
  - Rect: `middle`.
- `avoid?: "base-mark" | "all-marks" | {ancestor: n}` — "Indicates the mark or group of marks that each label will avoid." `{ancestor: 0}` is the same as `"base-mark"`. `"all-marks"` means every child of the root layer. The default is `"base-mark"`.
- `mark?` — text mark properties.
- `padding?: number | null` — `null` means unbounded. That is the default for multi-series lines, so end labels can go into the margin.
- `method?` — the area method; this branch defaults to `"reduced-search"`.
- `lineAnchor?` — `"begin"` or `"end"`. PR #7906 notes a mismatch between `begin` and Vega's `start`.
- `inherit?` — channels the label copies from its base. The default for line or trail is `["color","opacity"]`.

**Fit for GoFish.** This is the strongest precedent.

- One construct serves point, bar, line and area. The geometry of the base mark decides both the candidate generator and the defaults.
- Candidates are an ordered `{anchor, offset}` list.
- Avoidance is a named set that follows the scene hierarchy (`{ancestor: n}`). That maps onto GoFish's name scoping and `selectAll`.
- A negative offset means inside, which handles bar labels.
- What does not fit: the result is greedy and binary (placed or hidden). There is no leader line and no repulsion, and no text along the path for lines.

The thesis states the unifying insight: "The algorithm to add labels in these example chart types only differs in terms of (1) the graphical marks to be avoided by labels and (2) the candidate positions for labels."

**Image.** https://vega.github.io/vega/examples/img/labeled-scatter-plot.png

Sources:

- https://vega.github.io/vega/docs/transforms/label/
- https://vega.github.io/vega/examples/labeled-scatter-plot/
- https://github.com/vega/vega-lite/pull/7378
- https://raw.githubusercontent.com/vega/vega-lite/label/src/channeldef.ts
- https://raw.githubusercontent.com/vega/vega-lite/label/site/docs/label.md
- https://github.com/vega/vega-lite/issues/7228
- Paper: https://dig.cmu.edu/publications/2020-labeling.html (DOI 10.1109/VIS47514.2020.00027)
- Thesis: https://arxiv.org/abs/2405.10953

## 7. Observable Plot

**Spelling.**

```js
// point / bar
Plot.text(alphabet, {x: "letter", y: "frequency", text: d => ..., dy: -6, lineAnchor: "bottom"})

// end-of-line, multi-series
Plot.line(stocks, {x: "Date", y: "Close", stroke: "Symbol"}),
Plot.text(stocks, Plot.selectLast({x: "Date", y: "Close", z: "Symbol", text: "Symbol", textAnchor: "start", dx: 3}))

// extremes
Plot.text(aapl, Plot.selectMaxY({x: "Date", y: "Close", text: "Close", frameAnchor: "bottom", dy: -6}))

// area / region
Plot.text(states, Plot.centroid({text: d => d.properties.name, fill: "currentColor", stroke: "var(--vp-c-bg)"}))
Plot.tip(states, Plot.geoCentroid({title: d => d.properties.name, anchor: "bottom"}))
```

**Model.**

- A label is an ordinary `text` mark. A transform chooses which data rows get a label (`selectFirst`, `selectLast`, `selectMinY`, `selectMaxY`; grouped by `z`, `fill` or `stroke`). The text mark's anchors and `dx`/`dy` choose how it sits relative to its point.
- `centroid` and `geoCentroid` give the interior point of a region.
- `dodgeX` and `dodgeY` place dots without overlap along one axis, with `anchor` (`left`/`middle`/`right` or `bottom`/`middle`/`top`) and `padding`. They are a beeswarm, not label avoidance. Fil notes that dodgeY "by construction… disregards an initial y channel", so it cannot fix end labels that collide.
- Plot has no occlusion or anti-collision transform in core; the `src/transforms` listing has none. Issue #27, "Labeling algorithms (e.g., occlusion)?", is still open. It links Fil's prototype https://observablehq.com/@observablehq/plot-occlusion-27, cites Mapbox `text-variable-anchor` as the model to follow, and Bostock writes: "I really want an automatic algorithm for labeling scatterplots. And possibly stacked areas".
- `tip` chooses an anchor automatically from 9 options, using `preferredAnchor` when it fits.

**Names.**

- Text alignment: `textAnchor` (start, middle, end), `lineAnchor` (top, middle, bottom; vertical), `frameAnchor`, `dx`, `dy`, `rotate`, `lineWidth`.
- Selection: `selectFirst`, `selectLast`, `selectMinY`, `selectMaxY`, `centroid`.
- Dodge: `dodgeY(anchor, {padding})`.
- Tip: `anchor` and `preferredAnchor`.

**Concept.** A label is a mark plus a data transform, and the user composes them by hand.

**Fit.**

- Works well: compositional, and very close to GoFish. Text is just a mark, and "which point labels the series" is a separate selection.
- Gap: no avoidance, no line-following, and no area fit beyond the centroid.
- Image: Fil's prototype thumbnail https://static.observableusercontent.com/thumbnail/fc454ff7c630782f2bac4488a40dfba1f89b897e561b2b0040fbd9636e679251.jpg

Sources:

- https://github.com/observablehq/plot/blob/main/docs/marks/text.md
- https://github.com/observablehq/plot/blob/main/docs/transforms/select.md
- https://github.com/observablehq/plot/blob/main/docs/transforms/centroid.md
- https://github.com/observablehq/plot/blob/main/docs/transforms/dodge.md
- https://github.com/observablehq/plot/blob/main/docs/marks/tip.md
- https://github.com/observablehq/plot/issues/27

## 8. D3 ecosystem

**d3fc-label-layout.** This is an explicit strategy family.

```js
const strategy = layoutRemoveOverlaps(layoutGreedy());
const labels = layoutLabel(strategy)
  .size((d, i, g) => [w + pad * 2, h + pad * 2])
  .position((d) => projection(d.geometry.coordinates))
  .component(
    layoutTextLabel()
      .padding(2)
      .value((d) => d.properties.name)
  );
```

- `layoutGreedy()` "adds each label in sequence, selecting the position where the label has the lowest overlap with already added rectangles and is inside the container". It has `.bounds(rect)`.
- `layoutAnnealing()` has `.temperature` and `.cooling`.
- `layoutRemoveOverlaps(strategy)` is a combinator that wraps another strategy and then "removes overlapping labels… with the labels that have the greatest area of overlap removed first".
- The strategy contract is `{hidden, x, y, width, height}[] → same`.
- **Fit:** this is a direct precedent for GoFish strategy families such as `Overlap.*`, including strategies that take another strategy as an argument.
- Image: https://raw.githubusercontent.com/d3fc/d3fc/master/packages/d3fc-label-layout/screenshots/d3fc-label-layout.png
- Source: https://github.com/d3fc/d3fc/tree/master/packages/d3fc-label-layout

**D3-Labeler** (Evan Wang, github `tinker10`). Simulated annealing:

```js
d3.labeler()
  .label(label_array)
  .anchor(anchor_array)
  .width(w)
  .height(h)
  .start(nsweeps);
```

- Labels are `{x, y, width, height, name}` and anchors are `{x, y, r}`. "A _leader line_ may be used… None of the elements may cross the _graph boundary_."
- Source: https://github.com/tinker10/D3-Labeler

**d3-area-label** (Curran Kelleher). This is the streamgraph and stacked-area precedent.

```js
labels.text((d) => d.key).attr("transform", d3.areaLabel(area));
```

- The algorithm uses bisection on the label's scale. It finds the largest rectangle, with the label's aspect ratio, that fits between `y0` and `y1` across a span of x values. The label is both positioned and scaled.
- Options: `.area(area)` (reads `x`/`y0`/`y1` from a `d3.area`), `.x`, `.y0`, `.y1`, `.minHeight` (2), `.epsilon`, `.maxIterations`, `.interpolate` (true), `.interpolateResolution` (200), `.paddingLeft`/`Right`/`Top`/`Bottom`/`X`/`Y`/`padding`.
- **Fit:** the area label takes the area generator itself as its argument, which means it consumes the shape of the mark it labels. This matches GoFish's ref/relational model. Font size becomes an output, which matches Highcharts `minFontSize`/`maxFontSize`.
- Image: https://user-images.githubusercontent.com/68416/28745722-a5d9e7a4-749b-11e7-92a8-227a56cd3ead.png
- Source: https://github.com/curran/d3-area-label

## 9. matplotlib

**`ax.annotate(text, xy, xytext, arrowprops)`** places a label manually, with an optional arrow. It is the base of the other tools.

**adjustText.** The ggrepel port. It runs after plotting:

```python
adjust_text(texts, x=None, y=None, objects=None, target_x=None, target_y=None,
            avoid_self=True, prevent_crossings=True,
            force_text=(0.1, 0.2), force_static=(0.1, 0.2), force_pull=(0.01, 0.01),
            force_explode=(0.1, 0.5), pull_threshold=10, expand=(1.05, 1.2),
            max_move=(10, 10), explode_radius="auto", ensure_inside_axes=True,
            expand_axes=False, only_move={"text": "xy", "static": "xy", "explode": "xy", "pull": "xy"},
            min_arrow_len=5, time_lim=None, iter_lim=None)
```

- Model: first "explodes" the texts apart. Then it repeatedly pushes texts away from each other and from `objects` and points, and pulls them back toward their targets. Finally it adds arrows.
- The avoid set is explicit: `x`, `y` points plus `objects`, which are artists or bounding boxes.
- `only_move` limits which axes each force may move along.
- Image: https://raw.githubusercontent.com/Phlya/adjustText/master/figures/mtcars.gif
- Source: https://github.com/Phlya/adjustText/blob/master/adjustText/__init__.py

**matplotlib-label-lines.** Inline line labels:

```python
labelLines(ax.get_lines(), zorder=2.5)
labelLines(ax.get_lines(), align=False, xvals=[0.8, 0.55, 0.22, 0.104, 0.045], color="k")
labelLine(l1, 0.85, label=..., align=False, yoffset=0.01, ha="right")
```

- Signature: `labelLines(lines, align=None, xvals=None, drop_label=False, shrink_factor=0.05, xoffsets=0, yoffsets=0, outline_color="auto", outline_width=5, rotation=None)`.
- `align` means "the label will be aligned with the slope of the line". `xvals` is `(xfirst, xlast)` or one value per line, so labels are spread across x by default.
- The label sits on the line and uses a halo (`outline_color`) instead of breaking the line.
- Image: https://raw.githubusercontent.com/cphyc/matplotlib-label-lines/master/example.png
- Source: https://github.com/cphyc/matplotlib-label-lines

## 10. Plotly, ECharts, Highcharts, Datawrapper

**Plotly.**

- Scatter `textposition`: `'top left' | 'top center' | 'top right' | 'middle left' | 'middle center' | 'middle right' | 'bottom left' | 'bottom center' | 'bottom right'`. The default is `'middle center'`, and it accepts an array, one value per point.
- Bar `textposition`: `'inside' | 'outside' | 'auto' | 'none'`. `outside` text "gets pushed inside" when another bar is stacked on top.
- No collision avoidance for scatter text.
- Model: a fixed anchor per point; the label is an attribute of the trace.
- Source: https://github.com/plotly/plotly.js/blob/master/src/traces/scatter/attributes.js

**ECharts.**

- `series.label.position`: `'top' | 'left' | 'right' | 'bottom' | 'inside' | 'insideLeft' | … | 'insideBottomRight'`, or `[x, y]` (pixels or `%`). Also `label.distance` (5), `label.offset`, and `label.textMargin`, "the space around the label to escape from overlapping" (v6).
- `series-line.endLabel` (v5): "Label on the end of line". It is a separate label object with the same styling keys, and it animates with `valueAnimation`.
- `labelLine` draws leader lines (`length2`, `smooth`, `minTurnAngle`).
- `labelLayout` (v5): "Unified layout configuration of labels". It can be an object or a callback that receives `{labelRect, rect, align, verticalAlign, dataIndex, seriesIndex, text, labelLinePoints}` and returns `{x, y, dx, dy, align, verticalAlign, fontSize, rotate, draggable, labelLinePoints}`.
- `labelLayout.hideOverlap: boolean`.
- `labelLayout.moveOverlap: 'shiftX' | 'shiftY'`: "Place the labels on horizontal [vertical] direction sequencely". This is the one-dimensional end-label solver.
- Concept: the label is a property of a series, and layout is a post-pass hook.
- Sources: https://echarts.apache.org/en/option.html#series-line.labelLayout and https://echarts.apache.org/en/llms-documents/option-parts/option.series-line.md
- Examples: https://echarts.apache.org/examples/en/editor.html?c=line-race

**Highcharts series-label module.**

- "Series labels are placed as close to the series as possible in a natural way, seeking to avoid other series… like if a human designer placed the labels in the optimal position. The series labels currently work with series types having a `graph` or an `area`."
- Options: `enabled`; `connectorAllowed` (false; "Allow labels to be placed distant to the graph if necessary, and draw a connector line… the algorithm will systematically search for open spaces in the whole plot area"); `connectorNeighbourDistance` (24); `minFontSize` and `maxFontSize` ("For area-like series, allow the font size to vary so that small areas get a smaller font size"); `onArea` ("Draw the label on the area of an area series… Set it to false to draw it next to the graph"); `boxesToAvoid` ("An array of boxes to avoid… Each item has a `left`, `right`, `top` and `bottom` property"); `format`; `formatter`; `style`; `useHTML`.
- **Fit:** one module covers line and area. It switches between on-area and beside-line, scales font size for areas, and uses an explicit avoid list.
- Source: https://github.com/highcharts/highcharts/blob/master/ts/Extensions/SeriesLabel/SeriesLabelDefaults.ts and https://api.highcharts.com/highcharts/plotOptions.series.label

**Datawrapper.** Automatic value labels on line charts.

- Labels "won't overlap" each other or the lines, including on mobile.
- With more labels, they are "placed at the most interesting data points," such as peaks and troughs.
- Users can label the first value, the last value or both, for all lines or some lines, and can raise "the number of value labels per line".
- The control is "Show value labels" in Refine.
- The model is product-level: the user picks how many and which kind, and the system picks where.
- Image: https://kirby.datawrapper.de/media/pages/blog/automatically-label-values-in-line-charts/883e83d42b-1740123228/image-3-1.png (I did not check this one for HTTP 200.)
- Source: https://www.datawrapper.de/blog/automatically-label-values-in-line-charts

## 11. Cartography

**Imhof (1975), "Positioning Names on Maps"** (The American Cartographer 2(2)), and the point-feature label placement problem (PFLP).

- Point names go in a ranked set of positions, with upper-right preferred.
- Christensen, Marks & Shieber (1995), "An Empirical Study of Algorithms for Point-Feature Label Placement" (ACM TOG 14(3), doi 10.1145/212332.212334), formalizes PFLP as choosing one of k candidate positions per point (k = 4 or 8) to reduce overlaps. They compare greedy, gradient descent, 0-1 integer programming and simulated annealing; annealing performs best. The problem is NP-hard.
- The modern descendants are QGIS "Cartographic" and the Vega and Vega-Lite anchor lists.

**MapLibre / Mapbox GL symbol layout** (style spec v8):

- `symbol-placement`: `point` | `line` ("placed along the line… Can only be used on LineString and Polygon") | `line-center`. For polygons with `point` placement, the renderer uses the pole of inaccessibility: `findPoleOfInaccessibility(polygon, 16)` in `symbol_layout.ts`.
- `text-anchor`: center, left, right, top, bottom, top-left, … "Part of the text placed closest to the anchor."
- `text-variable-anchor`: "provide an array of text-anchor locations: the renderer will attempt to place the label at each location, in order, before moving onto the next label". This is the ordered candidate list.
- `text-variable-anchor-offset` pairs each anchor with its own offset. `text-radial-offset` and `text-offset` are also available.
- Collision: `text-allow-overlap` (false), `text-ignore-placement` (false; "other symbols can be visible even if they collide with the text"), `text-overlap: never | always | cooperative`, `text-optional`, `text-padding` (2), `symbol-sort-key` (priority).
- Along-line options: `symbol-spacing` (250), `text-max-angle` (45), `text-keep-upright` (true), `text-rotation-alignment`.
- Note the split into two booleans per layer: "I avoid others" (`allow-overlap`) and "others avoid me" (`ignore-placement`).
- Sources: https://github.com/maplibre/maplibre-style-spec/blob/main/src/reference/v8.json and https://github.com/maplibre/maplibre-gl-js/blob/main/src/symbol/symbol_layout.ts

**QGIS label placement.** This is the most complete taxonomy for points, lines and polygons.

- **Point:** Cartographic (the "Position priority… placement candidates": top right, top left, bottom right, bottom left, middle right, middle left, top slightly right, bottom slightly left; it can be overridden by data); Around Point (a circle of radius Distance); Offset from Point.
- **Line:** Parallel; Curved ("following the curvature of the line"); Horizontal. Each takes position flags Above line / On line / Below line / Line orientation dependent position, and you can select several. There is also a **Line anchor** that controls where along the line the label goes.
- **Polygon:** Offset from Centroid; Horizontal ("best position… inside"); Around Centroid; Free (Angled) ("best position a rotated label inside"); Using Perimeter; Using Perimeter (Curved); Outside Polygons.
- **Obstacles:** "Features act as obstacles" is set per layer. It has an obstacle weight compared against label priority, and a polygon obstacle type: interior or boundary.
- **Overlap:** Never overlap / Allow overlaps if required / Allow overlaps without penalty.
- **Priority:** a per-label rank.
- Source: https://docs.qgis.org/latest/en/docs/user_manual/style_library/label_settings.html

**Area label geometry.**

- **polylabel** (Mapbox): the "pole of inaccessibility, the most distant internal point from the polygon outline (not to be confused with centroid)… Useful for optimal placement of a text label on a polygon." It is an iterative grid with a priority queue and is guaranteed to reach the global optimum within the `precision`. Usage: `polylabel(polygon, 1.0)` returns `[x, y]` with `.distance`. Image: https://cloud.githubusercontent.com/assets/25395/16745865/864a0a30-47c0-11e6-87bc-58acac41a520.png. Source: https://github.com/mapbox/polylabel
- **Largest inscribed rectangle with the label's aspect ratio:** used by Vega `reduced-search` and `floodfill` and by d3-area-label.
- **Curved text along the medial axis or skeleton,** for elongated regions: QGIS "Free (Angled)" and "Using Perimeter (Curved)" approximate it. Barrault (2001), "A methodology for placement and evaluation of area map labels" (Computers, Environment and Urban Systems 25(1)), is the classic reference.
- **Streamgraphs:** Byron & Wattenberg (2008), "Stacked Graphs – Geometry & Aesthetics" (IEEE TVCG 14(6)), discuss placing labels in the thickest part of each layer, scaled to fit. PDF: https://leebyron.com/streamgraph/stackedgraphs_byron_wattenberg.pdf

I cited Barrault and the area-labeling section of Byron & Wattenberg from memory. I did not re-read those two texts.

## 12. Diagramming systems

**Bluefish.** A label is ordinary composition through relations: a `Text` plus a `Ref` to the labeled shape inside a layout relation.

```jsx
<StackV spacing={30}>
  <Text>Mercury</Text>
  <Ref select="mercury" />
</StackV>
// refactored: Align({alignment:"centerX"}, [Ref({select:"mercury"}), Ref({select:"label"})]), Distribute(...)
// leader: Arrow([Ref({select:"label"}), Ref({select:"mercury"})])
```

- The paper notes the bounding-box limits. For the pulley and the topologies diagrams, "we manually adjusted the text to avoid intersecting other shapes". It argues for "a boundary curve abstraction… It would also support precise labeling along curved lines and arrows."
- The public `bluefish-solid` plot code has a stub type for an avoid list: `label?: keyof T | { field: keyof T; avoid: Symbol[] }` in `plot/dot.tsx`. It is not implemented.
- **Fit:** this is the closest model to GoFish: label = text + ref + relation. Its open gaps are avoidance and curved paths.
- Sources: https://arxiv.org/html/2307.00146v4, https://github.com/bluefishjs/bluefish/blob/main/packages/bluefish-solid/src/plot/dot.tsx and https://github.com/bluefishjs/bluefish/blob/main/docs/learn/tutorial-2-relations.md

**Penrose.** A label is a shape, and its placement comes from constraints plus objectives solved with L-BFGS.

- Constraints: `disjoint(s1, s2, padding)`, `touching`, `contains(s1, s2, padding)`, `overlapping`, `onCanvas`.
- Objectives: `near(s1, s2)`, `nearPt`, `notTooClose(s1, s2, weight)` ("Try to repel shapes"), `repelPt`, `above`, `below`, `leftwards`, `rightwards`, `centerLabel(s1: Line|Rect, s2: Rect, w)`, `centerLabelAbove`.
- Usage: `ensure disjoint(label, shape)`, `encourage near(label, point)`.
- **Fit:** hard constraints versus soft objectives is the cleanest way to say "must not overlap" versus "prefer near". The drawbacks: a global solver is slow and its results are not deterministic.
- Sources: https://github.com/penrose/penrose/blob/main/packages/core/src/lib/Constraints.ts and https://github.com/penrose/penrose/blob/main/packages/core/src/lib/Objectives.ts

**Graphviz.**

- `label` is drawn inside a node. `xlabel` is an "External label for a node or edge… For nodes, the label will be placed outside of the node but near it. For edges, the label will be placed near the center of the edge". Overlapping xlabels may be dropped unless `forcelabels=true`.
- Edge-end labels use `headlabel` and `taillabel`, positioned in polar terms by `labelangle` (default −25.0) and `labeldistance`: "The origin… is the point where the edge touches the node. The ray of 0 degrees goes from the origin back along the edge."
- Graph and cluster titles use `labelloc` and `labeljust`.
- Sources: https://graphviz.org/docs/attrs/xlabel/ and https://graphviz.org/docs/attrs/labelangle/

**dagre.** Edge labels are given a size and become dummy nodes during layout, so the layout avoids them. `labelpos` is l, c or r, default r: "Where to place the label relative to the edge". `labeloffset` defaults to 10. Source: https://github.com/dagrejs/dagre/wiki

**TikZ.** This is the best line-label vocabulary.

- `pos=⟨fraction⟩`: "anchored on some point on the line… 0 is the previous coordinate, 1 is the current one… 0.5 is the middle". Aliases: `midway`, `near start`, `near end`, `at start`, `at end`.
- `sloped`: "the node [is] rotated such that a horizontal line becomes a tangent to the curve… normally done in such a way that text is never "upside down"".
- `auto=left|right`: picks the anchor so the node sits on the left or right side of the path. `swap` flips it.
- Node labels: `label=[options]⟨angle⟩:⟨text⟩`, for example `label=above right:q`.
- `pin=…` "also adds an edge from this node to the main node", which is a label with a leader. `label distance` and `pin distance` set the gap.
- Example: `\draw (a) -- node[pos=0.5, above, sloped] {text} (b);`
- Sources: https://tikz.dev/tikz-shapes#sec-17.8 (placing nodes on a line or curve) and https://tikz.dev/tikz-shapes#sec-17.10 (label and pin options)

## 13. UI positioning: CSS anchor positioning and Floating UI

**CSS anchor positioning.**

```css
.infobox {
  position: fixed;
  position-anchor: --my-anchor;
  position-area: top left;
  position-try-fallbacks:
    flip-block,
    flip-inline,
    flip-block flip-inline;
}
```

- `position-try-fallbacks` takes a comma-separated list of options. An option is a try-tactic (`flip-block`, `flip-inline`, `flip-start`), a `position-area` value (`top`, `bottom left`, …) or a `--named @position-try` rule.
- The browser "tries each option in the order listed… applies the first option that stops the element from overflowing… If no option fits, the element falls back to its default position."
- `position-try-order` can reorder by available space. `position-visibility` can hide the element.
- **Fit:** this is exactly the cartographic ordered candidate list, with symmetric "flip" tactics. However, it only avoids overflowing the container, not other elements.
- Source: https://developer.mozilla.org/en-US/docs/Web/CSS/position-try-fallbacks

**Floating UI.**

- `computePosition(ref, floating, {placement: 'right', middleware: [...]})`.
- `placement` is `top`, `top-start`, `top-end`, `right`, and so on.
- Middleware: `offset`, `shift`, `flip`, `arrow`, `size`, `autoPlacement`, `hide`, `inline`.
- "The order in which middleware are placed in the array matters". `offset()` goes first, and `arrow()` and `hide()` go last.
- `flip({fallbackPlacements})` is the candidate list. `shift({padding})` slides along the axis, which is continuous adjustment. `hide` drops the element.
- **Fit:** this is a pipeline of placement strategies (offset → flip → shift → hide) that matches directlabels' step lists and d3fc's `removeOverlaps(greedy())`.
- Source: https://floating-ui.com/docs/middleware

**Figma** has no automatic label placement. I listed it for completeness only and did not fetch anything for it.

## 14. Research

- **Kittivorawong, Moritz, Wongsuphasawat, Heer (2020), "Fast and Flexible Overlap Detection for Chart Labeling with Occupancy Bitmap"** (IEEE VIS short paper). It rasterizes the avoid-marks into a bitmap and tests candidates greedily. It beats particle-based labeling on large filled marks. https://dig.cmu.edu/publications/2020-labeling.html. Thesis with the Vega-Lite integration: https://arxiv.org/abs/2405.10953
- **Luboschik, Schumann, Cords (2008), "Particle-Based Labeling: Fast Point-Feature Labeling without Obscuring Other Visual Features"** (IEEE TVCG 14(6), doi 10.1109/TVCG.2008.152). Marks are sampled as particles, and labels test candidate positions greedily against the particles near them. It is the source of "avoid all visual features, not just points".
- **Christensen, Marks, Shieber (1995),** PFLP; see section 11.
- **Fekete & Plaisant (1999), "Excentric Labeling: Dynamic Neighborhood Labeling for Data Visualization"** (CHI). Labels for the points under a cursor focus circle are pulled out into ordered columns at the left and right, joined by leader lines. It is a boundary-style labeling that runs on demand. https://www.cs.umd.edu/hcil/excentric/
- **Bekos, Niedermann, Nöllenburg (2019), "External Labeling Techniques: A Taxonomy and Survey"** (Computer Graphics Forum 38(3), EuroVis STAR, doi 10.1111/cgf.13729). It contrasts internal labeling (labels on or next to features) with external labeling (labels in a margin or boundary, connected by leaders). Leader styles are straight (s), orthogonal (po, opo) and diagonal (do). Boundary labeling comes from Bekos, Kaufmann, Symvonis, Wolff (2007).
- **Direct labeling:** practitioner guides (for example the EU data visualization guide at https://data.europa.eu/apps/data-visualisation-guide/direct-labelling) and Datawrapper argue for direct labels over legends. directlabels' own motivation is the same.

---

# Synthesis

## A. Taxonomy of label-placement models

| Model                                                            | What the user writes                             | What the system decides                                  | Systems                                                                                                                                                                                                                                                                                | Geometric query needed                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Fixed anchor + offset**                                        | anchor (9-way) and dx/dy or nudge                | nothing                                                  | ggplot2 `nudge_*`/`hjust`, Plot `textAnchor`/`lineAnchor`/`dx`, Plotly `textposition`, ECharts `label.position`, Mapbox `text-anchor`/`text-offset`, TikZ `label=above right:`, Graphviz `labelangle`/`labeldistance`                                                                  | the anchor point and bounding box of the base                                                                   |
| **Ordered candidate search** (greedy, first fit, otherwise hide) | ordered list of (anchor, offset); an avoid set   | which candidate, or hide                                 | Imhof/PFLP, QGIS Cartographic "position priority", Mapbox `text-variable-anchor(-offset)`, Vega `anchor`+`offset`, Vega-Lite `position: [{anchor, offset}]`, CSS `position-try-fallbacks`, Floating UI `flip({fallbackPlacements})`, d3fc `layoutGreedy`, Plot `tip` `preferredAnchor` | base bounding box; occupancy of the avoid set                                                                   |
| **Global optimization over candidates**                          | candidates; a cost                               | an assignment                                            | Christensen et al. annealing, D3-Labeler, d3fc `layoutAnnealing`, Penrose (L-BFGS on constraints and objectives)                                                                                                                                                                       | same, plus a cost                                                                                               |
| **Continuous force / repel**                                     | initial nudge, paddings, forces, allowed axes    | final position and leader line                           | ggrepel, adjustText                                                                                                                                                                                                                                                                    | label boxes and the points or objects to avoid                                                                  |
| **One-dimensional non-overlap ("dodge" a stack of labels)**      | the axis                                         | shift along that axis                                    | directlabels `*.qp`/`bumpup`, ECharts `moveOverlap: 'shiftY'`, Floating UI `shift`, ggrepel `direction="y"`; Plot `dodgeY` is related (dots, not labels)                                                                                                                               | intervals on one axis                                                                                           |
| **End-point / feature selection**                                | which point on the series                        | (nothing else)                                           | directlabels `first.points`/`last.points`/`maxvar.points`, Plot `selectFirst`/`selectLast`/`selectMaxY`, ECharts `endLabel`, Vega `lineAnchor`, Datawrapper "first/last, peaks and troughs"                                                                                            | an ordered polyline and its extremes                                                                            |
| **Along-path text**                                              | fraction along the path, side or offset, upright | tangent rotation, glyph curvature, line gap              | geomtextpath (`hjust`, `vjust`), TikZ (`pos`, `sloped`, `auto`), Mapbox `symbol-placement: line`/`line-center`, QGIS Parallel/Curved, matplotlib-labellines (`xvals`, `align`)                                                                                                         | polyline + arclength parameterization + tangent and normal                                                      |
| **Interior point / inscribed shape**                             | (optional) method                                | position, sometimes font size                            | Plot `centroid`, polylabel, Mapbox polygons (pole of inaccessibility), Vega `naive`/`reduced-search`/`floodfill`, d3-area-label, Highcharts `onArea` + `min/maxFontSize`, QGIS Horizontal/Free inside polygon, directlabels `smart.grid`                                               | polygon (or y0/y1 band) + largest inscribed rectangle with the label's aspect ratio, or pole of inaccessibility |
| **External / boundary with leader**                              | connector style                                  | label position in free space or the margin; leader route | ggforce `geom_mark_*` (`con.type`), ggrepel segments, Highcharts `connectorAllowed`, TikZ `pin`, ECharts `labelLine`, excentric labeling, boundary labeling (Bekos)                                                                                                                    | free-space search; leader routing                                                                               |
| **Drop on collision**                                            | allow or forbid                                  | which labels to hide                                     | ggplot2 `check_overlap`, ggrepel `max.overlaps`, Vega (opacity 0), ECharts `hideOverlap`, d3fc `layoutRemoveOverlaps`, Mapbox `text-allow-overlap`/`text-optional`, QGIS "Never overlap"                                                                                               | pairwise overlap, ranked by priority (`sort`, `symbol-sort-key`, QGIS Priority)                                 |

Several systems compose these steps instead of choosing one:

- directlabels: lists of steps.
- d3fc: `removeOverlaps(greedy())`.
- Floating UI: `[offset, flip, shift, hide]`.
- Mapbox: variable anchors, then drop.

## B. Unified versus separate operators

**One construct for point, line and area:**

- **Vega `label` transform and Vega-Lite `encoding.label`.** The base mark's type picks the candidate generator. Bounding box and anchors are used for point, bar and rect; the `lineAnchor` endpoint for lines; `method` for areas. The candidate test (bitmap against the avoid set) is shared.
- **QGIS.** One labeling panel whose placement-mode list changes with the geometry type.
- **Mapbox/MapLibre.** One `symbol` layer with `symbol-placement`, plus polygon fallback to the pole of inaccessibility.
- **Highcharts series-label.** Line and area: `onArea` switches inside versus beside.

**Separate constructs:**

- ggplot ecosystem: `geom_text`/`geom_text_repel` (points), `geom_textline` (lines), `geom_mark_*` (regions), directlabels (groups).
- Plot: `text` + `select*` (points and line ends), `centroid` (regions).
- matplotlib: `adjustText` (points), `labelLines` (lines).
- ECharts: `label` versus `endLabel`.
- d3: `d3fc-label-layout` (points), `d3-area-label` (areas).
- TikZ: `label`/`pin` on nodes versus `pos`/`sloped` on paths.

**What each geometry needs from the base shape:**

- **Point or bar:** an anchor point plus a bounding box (or exact shape). Candidates are compass anchors × offset; a negative offset means inside (Vega-Lite bars).
- **Line:** an ordered polyline. It needs (a) feature selection (first, last, extreme, max-variance, "furthest from others"), (b) an arclength parameterization for `pos`/`hjust ∈ [0,1]` or named positions (`xmid`, `ymax`), and (c) a tangent and normal for `sloped`/upright and for the across-line offset (`vjust`, `auto=left|right`, QGIS above/on/below).
- **Area or region:** a polygon, or the y0/y1 band of a stacked area. It needs an interior point (centroid, pole of inaccessibility) or the largest inscribed rectangle with the label's aspect ratio (Vega, d3-area-label). It can also return a font size (Highcharts, d3-area-label). Outside-region labels need a free-space search plus a leader (ggforce, QGIS Outside Polygons).

## C. How avoidance is expressed

| System             | What labels avoid                                               | How the avoid set is named                                                                          |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Vega               | base mark (default on) + named marks + prior labels             | `avoidBaseMark: true`, `avoidMarks: ["trend"]` (mark names)                                         |
| Vega-Lite (branch) | base mark, all marks, or the subtree of the n-th ancestor layer | `avoid: "base-mark" \| "all-marks" \| {ancestor: n}`                                                |
| ggrepel            | other labels + its own layer's points                           | implicit; `point.size = NA` and `point.padding`                                                     |
| adjustText         | other labels + given points + objects                           | `x`, `y`, `objects=[artists or bounding boxes]`, `avoid_self`                                       |
| Highcharts         | other series + boxes                                            | implicit for series; `boxesToAvoid: [{left, right, top, bottom}]`                                   |
| Mapbox             | symbols already placed (priority by sort key)                   | per layer: `text-allow-overlap` (I may overlap) and `text-ignore-placement` (others may overlap me) |
| QGIS               | other labels + layers marked as obstacles                       | per layer "Features act as obstacles" + weight versus priority                                      |
| Penrose            | any shape named in a constraint                                 | `ensure disjoint(a, b, padding)`                                                                    |
| CSS / Floating UI  | container or viewport overflow only                             | implicit boundary; `shift({padding})`                                                               |
| ggforce            | the region itself                                               | `label.buffer`                                                                                      |
| Bluefish (stub)    | named shapes                                                    | `label: {field, avoid: Symbol[]}`                                                                   |

Three ways to name the avoid set recur:

1. **By reference** to named marks (Vega `avoidMarks`, Bluefish `avoid: Symbol[]`, Penrose).
2. **By scope** (Vega-Lite `{ancestor: n}` / `"all-marks"`).
3. **Per obstacle-layer flags** (Mapbox, QGIS).

For GoFish, (1) maps onto `selectAll("name")`/`ref(...)` and (2) onto name scoping up to the nearest `createMark`. Avoiding other labels is the default in every automatic system.

## D. Names users already know

- **anchor:** Vega, Vega-Lite, Mapbox `text-anchor`, Plot `textAnchor`/`lineAnchor`/`frameAnchor`, CSS `position-anchor`, TikZ anchors. The 9 compass values (`top-left` … `bottom-right`, `middle`/`center`) are near-universal, although Plotly says `'top center'`, ECharts adds `insideX`, and CSS uses `position-area: top left`.
- **offset:** Vega `offset`, Mapbox `text-offset`/`text-radial-offset`, Floating UI `offset()`, ECharts `label.offset`, labellines `xoffsets`/`yoffsets`, dagre `labeloffset`.
- **dx/dy:** Plot, ECharts `labelLayout`, Vega encodings.
- **nudge:** ggplot2 and ggrepel.
- **distance:** ECharts `label.distance`, TikZ `label distance`, QGIS Distance, Graphviz `labeldistance`.
- **avoid:** Vega `avoidMarks`, Vega-Lite `avoid`, Highcharts `boxesToAvoid`, adjustText `avoid_self`, Bluefish `avoid`.
- **repel:** ggrepel, Penrose `repelPt`. **dodge:** Plot. **shift / flip:** Floating UI and CSS. **hideOverlap / moveOverlap:** ECharts. **allow-overlap:** Mapbox. **check_overlap / max.overlaps:** ggplot.
- **padding:** Vega (past chart bounds), ggrepel `box.padding`/`point.padding`, Mapbox `text-padding`, Floating UI, d3-area-label.
- **placement:** Floating UI `placement`, Mapbox `symbol-placement`, QGIS "Placement". **position:** ECharts `label.position`, Vega-Lite `position`.
- **pos / sloped / auto / swap / midway / pin:** TikZ. **hjust / vjust along a path, upright:** geomtextpath. **align:** labellines (follow the slope).
- **method:** Vega (`naive`/`reduced-search`/`floodfill`) and directlabels (named Positioning Methods). These are strategy-family precedents. d3fc uses `layoutGreedy`/`layoutAnnealing`/`layoutRemoveOverlaps` as strategy constructors, and `removeOverlaps(strategy)` is a combinator.
- **lineAnchor: start | end:** Vega. **endLabel:** ECharts. **selectFirst / selectLast:** Plot. **first.points / last.points:** directlabels.
- **leader / connector / segment:** D3-Labeler "leader line", ggforce `con.*`, ggrepel `segment.*` and `min.segment.length`, ECharts `labelLine`, Highcharts `connectorAllowed`, TikZ `pin`.
- **priority / sort:** Vega `sort`, Mapbox `symbol-sort-key`, QGIS Priority.

## E. Takeaways for a compositional grammar

1. **A label is a relation from a text mark to an existing mark.** This holds in Vega (`from: {data: <mark name>}`), Bluefish (`Text` + `Ref` inside `StackV`/`Align`), TikZ (`label=` on a node, `node[pos]` on a path) and Plot (text + `select*`). It fits GoFish's relational marks (line, ribbon, arrow, enclose read existing marks through `ref`/`selectAll`).
2. **The base geometry decides the candidate generator.** Point and box give compass anchors × offset. A line gives an arclength position plus side. An area gives an inscribed point or rectangle. Collision testing against the avoid set is shared, and the thesis says so explicitly. One operator with a geometry-driven default and a `method`/strategy option has precedent in both Vega and QGIS.
3. **The placement strategy is a family, and strategies compose.** Precedents:
   - candidate lists: Mapbox, CSS, Vega
   - greedy versus annealing: d3fc
   - force: ggrepel
   - one-axis solves: directlabels QP, ECharts shiftY
   - combinators: d3fc `removeOverlaps(...)`, Floating UI middleware order, directlabels step lists

   This fits GoFish's `Family.strategy()` namespaces.

4. **Avoidance should be a named set**, written as references or scopes, not a fixed boolean. The defaults across systems are: the base mark plus other labels, with opt-in to all marks.
5. **What does not fit a deterministic, compositional layout:** randomness (ggrepel and adjustText without a seed, annealing), post-render DOM measurement (adjustText, d3fc `.size` via `getBBox`, the Plot occlusion prototype), and per-library fused geoms (geomtextpath, ggforce, ECharts `endLabel`). These hide the label-as-relation structure.
