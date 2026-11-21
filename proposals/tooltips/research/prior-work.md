# Tooltips: prior work

Each claim below was checked against the current official documentation, source repository, or issue tracker named next to it, and the URL actually read is given. Where observablehq.com refused automated fetches (HTTP 429), the Plot docs were read from their source in the repository (raw.githubusercontent.com/observablehq/plot/main/docs/...), which is what the site renders, and anything that could not be confirmed is marked **[unverified]**.

---

## 1. Vega-Lite and Altair

Docs read: https://vega.github.io/vega-lite/docs/tooltip.html (source https://raw.githubusercontent.com/vega/vega-lite/main/site/docs/tooltip.md), selection docs https://raw.githubusercontent.com/vega/vega-lite/main/site/docs/parameter/select.md, vega-tooltip README and APIs https://github.com/vega/vega-tooltip/blob/main/docs/APIs.md.

**(a) Simplest.** `{"mark": {"type": "point", "tooltip": true}, ...}` shows all _encoded_ fields; it is equivalent to `{"content": "encoding"}`. `"tooltip": {"content": "data"}` shows all fields of the underlying datum. Without the plugin the renderer uses the native HTML `title` attribute.

Altair: `mark_point(tooltip=True)`, or the channel list (https://altair-viz.github.io/_sources/gallery/scatter_tooltips.rst.txt):

```python
alt.Chart(source).mark_circle(size=60).encode(
    x='Horsepower', y='Miles_per_Gallon', color='Origin',
    tooltip=['Name', 'Origin', 'Horsepower', 'Miles_per_Gallon'])
```

**(b) Customized.** The `tooltip` encoding channel takes one field def or an array; each def carries `title`, `format`, `timeUnit`. Per-field opt-out from generated tooltips: `"detail": {"field": "x", "type": "nominal", "tooltip": false}`. A `filter` predicate per tooltip field hides it per datum (`{"filter": {"not": {"equal": 0}}}`, from vega/vega-lite#9152, closed 2026-07).

Altair (via `gh search code`, vega/altair `tests/examples_methods_syntax/maps_faceted_species.py`):

```python
alt.Tooltip('county_id:N').title('County ID'),
alt.Tooltip('habitat_yearround_pct:Q').title('Habitat %').format('.2%')
```

and `natural_disasters.py`: `alt.Tooltip("Year:T", format='%Y')`.

Computed content means a `calculate` transform first. **[unverified]** whether an expression can be the tooltip directly.

**(c) Model.** The tooltip is a channel on the mark, plus a mark-level boolean/content option and global `config.mark.tooltip`. Hit-testing is the element under the pointer (Vega scenegraph picking). "Nearest" is a separate mechanism: a point _selection_ with `nearest: true`, which "accelerates user selection with an invisible voronoi diagram" (select.md), with the stated limit "not supported for multi-element mark types (i.e., line and area). … consider layering a discrete mark type (e.g., point) with a 0-value opacity."

The multi-series idiom (https://raw.githubusercontent.com/vega/vega-lite/main/examples/specs/interactive_multi_line_pivot_tooltip.vl.json) is a pivoted rule layer that carries both the tooltip and the selection:

```json
{"transform": [{"pivot": "symbol", "value": "price", "groupby": ["date"]}],
 "mark": "rule",
 "encoding": {
   "opacity": {"condition": {"value": 0.3, "param": "hover", "empty": false}, "value": 0},
   "tooltip": [{"field": "AAPL", "type": "quantitative"}, {"field": "AMZN", "type": "quantitative"}, ...]},
 "params": [{"name": "hover", "select": {"type": "point", "fields": ["date"],
   "nearest": true, "on": "pointerover", "clear": "pointerout"}}]}
```

The per-line point highlight is a second layer filtered by `{"param": "hover", "empty": false}`. The Altair version (https://altair-viz.github.io/_sources/gallery/multiline_tooltip.rst.txt) uses five layers (line, invisible selector points, points, rule, text) with `alt.selection_point(nearest=True, on="pointerover", fields=["x"], empty=False)`.

**(d) Names.** `tooltip` (channel and mark property), `content: "encoding" | "data"`, `nearest`, `pointerover`/`pointerout`, `tooltipHandler`.

**(e) Custom content.** Via the vega-tooltip handler (https://github.com/vega/vega-tooltip/blob/main/docs/APIs.md): options `offsetX`/`offsetY` (default 10), `theme`, `sanitize`, `maxDepth`, `formatTooltip` (custom HTML), `disableDefaultStyle`, `baseURL`. The tooltip value is an object rendered as a key/value table; special keys are `title` (header) and `image` (an image URL or base64). The handler can be replaced entirely (`view.tooltip(handler)`). No nested-chart mechanism; the workaround is a pre-rendered image.

**(f) Aggregates.** From tooltip.md: "encoding a field without an aggregate as a tooltip means that the field will be used to group aggregates by. To avoid that … add an aggregate to the tooltip encoding." So adding a tooltip field can silently change the chart's grouping.

**(g) Limits.** Nearest does not work on line or area; multi-series tooltips need pivot plus a rule layer. Filtered fields and `tooltip: false` fields are also dropped from the generated ARIA description, so tooltip content feeds accessibility.

## 2. Observable Plot (the most compositional precedent)

Sources: https://raw.githubusercontent.com/observablehq/plot/main/docs/marks/tip.md (site https://observablehq.com/plot/marks/tip), .../docs/interactions/pointer.md, .../docs/interactions/crosshair.md, .../docs/features/marks.md, .../docs/marks/geo.md.

**(a) Simplest.** `Plot.lineY(aapl, {x: "Date", y: "Close", tip: true})`. "If no title channel is supplied, the tip mark displays all channel values."

**The decomposition.** tip.md says the `tip: true` code "can be written more explicitly with a tip mark and a pointer transform":

```js
Plot.plot({
  marks: [
    Plot.lineY(aapl, { x: "Date", y: "Close" }),
    Plot.tip(aapl, Plot.pointerX({ x: "Date", y: "Close" })),
  ],
});
```

So `tip: true` is sugar: it derives a tip mark from the host mark (same data and channels) wrapped in a pointer transform, "placed atop all other marks" (marks.md). The option accepts `true`, `"x" | "y" | "xy"` (selecting pointerX, pointerY or pointer), or an options object passed to the derived tip, which may include a `pointer` key.

Three independent pieces:

- **tip** is a mark. It also works with no pointer, as a static annotation: `Plot.tip([text], {x, y, anchor: "bottom"})`.
- **pointer / pointerX / pointerY** is a transform that filters _any_ mark's data to the focused point: `Plot.ruleX(data, Plot.pointerX({x}))`, `Plot.text` with `px`/`py`.
- **crosshair** is a composite (rules plus edge text labels) driven by a pointer, with options `x`, `y`, `color`, `opacity`, `ruleStroke`, `textFill`, `maxRadius`, and so on.

**(b) Customized.**

```js
Plot.dot(olympians, {
  x: "weight",
  y: "height",
  stroke: "sex",
  channels: {
    name: "name",
    nationality: { value: "nationality", label: "country" },
    sport: "sport",
  },
  tip: {
    format: {
      name: true,
      sport: true,
      nationality: true,
      y: (d) => `${d}m`,
      x: (d) => `${d}kg`,
      stroke: false,
    },
  },
});
```

Each format is a d3 format string, a function, `true` (default), or `null`/`false` (suppress); the order of the `format` object sets row order. The label comes from `{value, label}`, else the scale's label, else the channel name. Free text uses the `title` channel, for example `title: (d) => [d.name, d.info].join("\n\n")`, which wraps at 20 em and keeps newlines. If `tip` is not set, `title` becomes an SVG `<title>` element; with `tip`, it no longer does (marks.md).

**(c) Model and hit-testing.** pointer "finds the point closest to the pointer by measuring distance in x and y"; pointerX and pointerY divide the non-dominant axis distance by 100, so it acts as a tiebreak. `maxRadius` defaults to 40 px. Target position precedence: `px`, then the x1/x2 midpoint, then `x`, then `x1`, then `frameAnchor` (the midpoint makes bars pointable). `pool` (default for tip) means at most one tip is visible across marks. Clicking locks the focused point ("sticky"), which allows copying text. "When faceting, the pointer transform is exclusive across facets." Placement: `anchor` takes one of 9 values (four sides, four corners, middle), chosen automatically with `preferredAnchor` defaulting to `bottom` (`left` under pointerY); `frameAnchor` places the tip at a frame position.

**(e) Custom content.** SVG text only: no HTML, no nested chart. Open issue #1767 "Allow the tip title channel to contain rich text or markup"; #1213 "foreignObject mark?" (open); #1719 "Portal support for tips" (closed).

**(f) Aggregates.** `Plot.rectY(olympians, Plot.binX({y: "count"}, {x: "weight", fill: "sex", tip: true}))` works. The tip "recognizes that x1 & x2 and y1 & y2 are paired channels", and the stack transform adds a hint so the tip shows a length (frequency) rather than the y1–y2 range. A stack total cannot be shown: in #1975 Bostock says the stack transform computes y1–y2 extents per value, so "the total across the entire stack isn't accessible." For geo, "when you use the tip option, the centroid transform is implicitly applied" (geo.md), so a choropleth tip targets polygon centroids, not polygon containment.

**(g) Limits (pointer.md and issues).** The pointer "understands only points and not the arbitrary geometry of marks" (dead spots on large marks). Only one point is focused at a time; coincident points are an open problem (#1621). "A grouped tip for multi-series plots" #2003 is open, so there is no x-unified tooltip. Linked pointers (#1795) are done by hand with several pointerX marks. #2188: programmatically setting the pointer is open. #2187: static `Plot.tip` does not work in JSDOM. #2213: tips for clipped marks.

**Mosaic / vgplot** reuses Plot's tip. Example https://raw.githubusercontent.com/uwdata/mosaic/main/specs/yaml/us-county-map.yaml: "County name tooltips … anchored to invisible centroid dot marks", written `mark: dot, x: {centroidX: geom}, fill: transparent, tip: true, title: name`. vgplot's own interactors are `nearestX`/`nearestY`, `toggle`, `highlight` (https://idl.uw.edu/mosaic/vgplot/); that page does not mention tips.

## 3. ggplot2 ecosystem

**plotly::ggplotly** (https://plotly-r.com/controlling-tooltips.html): `ggplot(mtcars, aes(wt, mpg, text = row.names(mtcars)))` adds a non-visual `text` aesthetic on the layer, then `ggplotly(p, tooltip = "text")` or `tooltip = c("text", "x", "city")`, a chart-level whitelist of aesthetic names. Suppress with `style(hoverinfo = "skip", traces = 1)`. Stated limits: "You can't supply custom text in this way to a statistical aggregation"; plotly.js does not render LaTeX or images in the tooltip; computed values are formatted with `format()`. **[unverified]** The default `tooltip = "all"` is from memory.

**ggiraph** (https://www.ardata.fr/ggiraph-book/intro.html, https://davidgohel.github.io/ggiraph/reference/interactive_parameters.html, https://davidgohel.github.io/ggiraph/reference/opts_tooltip.html):

```r
ggplot(mtcars, aes(x = disp, y = qsec, tooltip = carname, data_id = carname)) +
  geom_point_interactive(size = 3, hover_nearest = TRUE)
girafe(ggobj = gg)
```

Each geom has an `_interactive` twin with the aesthetics `tooltip`, `data_id`, `onclick`, `hover_css`, `selected_css`, `tooltip_fill`, `hover_nearest`. `tooltip` accepts plain text or `htmltools::HTML()`; without HTML, newlines become `<br/>`. `data_id` links hover across elements and provides Shiny inputs. Chart-level options:

```r
opts_tooltip(css, offx = 10, offy = 0, use_cursor_pos = TRUE, opacity = 0.9,
             use_fill, use_stroke, delay_mouseover = 200, delay_mouseout = 500,
             placement = c("auto", "doc", "container"), zindex)
```

The tooltip follows the cursor by default; `placement` here means which container holds the tooltip, not its side. Also `opts_hover(css)`, `opts_hover_inv(css = "opacity:0.1;")`, and `linked = TRUE` for legend–geom linking. The model is a channel per mark plus chart-level options, rendered to SVG.

## 4. Plotly (Python and JS)

Sources: https://plotly.com/python/hover-text-and-formatting/, https://plotly.com/python/reference/layout/, https://plotly.com/python/reference/treemap/.

- **(a)** Plotly Express shows all mapped columns by default. `hover_name="country"` gives a bold title; `hover_data=["continent", "pop"]` adds columns.
- **(b)** `hover_data={'species': False, 'sepal_length': ':.2f', 'suppl_2': (':.3f', array)}` (`:` starts a number format, `|` a date format). `hovertemplate='Price: %{y:$.2f}<extra></extra>'` (`<extra></extra>` removes the trace-name box). `customdata=df[['country','pop']]` with `%{customdata[0]}`. `hoverinfo` is "now-deprecated" in favor of `hovertemplate`. Styling via `hoverlabel=dict(bgcolor=..., font_size=...)`.
- **(c)** `layout.hovermode` (chart-level): `"closest"` gives "a single hoverlabel … for the closest point within the hoverdistance"; `"x"`/`"y"` give "multiple hoverlabels … at the closest x- (or y-) coordinate … no more than one hoverlabel … per trace"; `"x unified"`/`"y unified"` give "a single hoverlabel" for those points, with spikelines on by default; `False` disables hover. `hoverdistance` (default 20 **[unverified default]**) "is only a real distance for hovering on point-like objects." `layout.hoversubplots: "single" | "overlaying" | "axis"` extends hover to stacked subplots that share an axis (synchronized small multiples).
- **(e)** A subset of HTML only; no images or LaTeX (plotly-r).
- **(f)** Treemap hover has hierarchy variables `currentPath`, `root`, `entry`, `percentRoot`, `percentEntry`, `percentParent`; default `hoverinfo` is `"label+text+value+name"`.
- **(g)** "If multiple points in a given trace exist at the same coordinate, only one will get a hover label." "Text supports just one customized field per trace." Hover fires only over traces unless `hoveranywhere`.

## 5. D3 and the plain SVG baseline

**SVG `<title>`** (https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/title) "provides an accessible, short-text description … browsers usually display it as a tooltip"; it should be the first child.

```html
<circle cx="5" cy="5" r="4"><title>I'm a circle</title></circle>
```

It costs nothing, survives static SVG export, and is announced by screen readers. It has no styling, positioning or delay control and does not show on touch. MDN prefers `aria-labelledby` when visible text exists.

**Hand-rolled.** `d3.pointer(event, target)` returns `[x, y]` relative to the target and handles SVG CTM inversion (https://d3js.org/d3-selection/events). `delaunay.find(x, y, i)` "returns the index of the input point that is closest" (https://d3js.org/d3-delaunay/delaunay). Bostock's multi-line chart (https://observablehq.com/@d3/multi-line-chart, read via api.observablehq.com) is the canonical nearest-point-across-series pattern:

```js
svg
  .on("pointerenter", pointerentered)
  .on("pointermove", pointermoved)
  .on("pointerleave", pointerleft)
  .on("touchstart", (event) => event.preventDefault());
function pointermoved(event) {
  const [xm, ym] = d3.pointer(event);
  const i = d3.least(I, (i) =>
    Math.hypot(xScale(X[i]) - xm, yScale(Y[i]) - ym)
  ); // closest point
  path
    .style("stroke", ([z]) => (Z[i] === z ? null : "#ddd"))
    .filter(([z]) => Z[i] === z)
    .raise();
  dot.attr("transform", `translate(${xScale(X[i])},${yScale(Y[i])})`);
  if (T) dot.select("text").text(T[i]);
  svg.property("value", O[i]).dispatch("input", { bubbles: true });
}
```

In this version the Voronoi is drawn "for fun" only, and lookup is a linear `d3.least`. The tooltip is an SVG group, not a div. The focused datum is exposed as the chart's `value`, which makes it a selection other cells can read.

## 6. Other chart libraries

- **ECharts** (https://echarts.apache.org/en/llms-documents/option-parts/option.tooltip.md). A chart-level component `tooltip: {trigger: 'item' | 'axis' | 'none'}`. `'axis'` is "mainly used for charts that have category axes" and draws `axisPointer.type: line | shadow | cross`. `triggerOn: 'mousemove|click' | 'click' | 'none'` (`none` means shown manually via the `showTip` action). `formatter` is a string template (`'{b0}: {c0}<br />{b1}: {c1}'`) or a callback returning a string or an HTMLElement, receiving an array of params in axis mode. `valueFormatter` formats values only and is escaped. Also `position` (array or function), `confine`, `appendTo`, `enterable`, `renderMode: 'html' | 'richText'` (canvas, no DOM), `order`. Synchronized panels: `axisPointer.link: [{xAxisIndex: [0, 3, 4]}]` (option.axisPointer.md). **[unverified]** The existence of a series-level `tooltip` is taken from the docs index; not read.
- **Highcharts** (https://www.highcharts.com/docs/chart-concepts/tooltip). `tooltip.shared`: "A single tooltip displays information for all series at a specific x-axis value." `tooltip.split`: "separate tooltips for each series point." `format`/`headerFormat`/`pointFormat` strings (`'The value for <b>{x}</b> is <b>{y}</b>, in series {series.name}'`), overridden by a `formatter` callback. `useHTML` allows tables and images. `stickOnContact` lets the pointer enter the tooltip. `series.tooltip` gives per-series overrides. `xAxis.crosshair: true`. **[unverified]** Full descriptions of `positioner`, `followPointer` and `followTouchMove`: the API page lists only names.
- **Recharts** (https://recharts.github.io/en-US/api/Tooltip/, README). A child component: `<LineChart data={data}>…<Tooltip /></LineChart>`. Props `content` (custom component; the repo example is `CustomTooltip = ({ active, payload, label })`), `formatter`, `labelFormatter`, `shared` ("reacting to the current data point, or to all data points at the current axis coordinate"), `trigger: 'hover' | 'click'`, `cursor`, `position`, `offset` (10), `allowEscapeViewBox`, `defaultIndex`, `filterNull`.
- **visx.** XYChart (https://raw.githubusercontent.com/airbnb/visx/master/packages/visx-xychart/README.md): `<Tooltip snapTooltipToDatumX snapTooltipToDatumY showVerticalCrosshair showSeriesGlyphs renderTooltip={({tooltipData, colorScale}) => …} />`; `tooltipData.nearestDatum` is "the globally closest Datum, across all Series", and `datumByKey` is the closest per series, which "enables shared tooltips". New `@visx/tooltip/floating` (https://raw.githubusercontent.com/airbnb/visx/master/packages/visx-tooltip/Readme.md): `useChartTooltip({placement: 'top', offset: 10})`, `tooltip.show({anchor: point | {type: 'svg-local-point', x, y}, items})`, `FloatingTooltip.Root/Portal/Positioner/Content/Arrow`, built on Floating UI. Its readme says: "Your chart still owns nearest-datum lookup and event handling."
- **Nivo line** (https://raw.githubusercontent.com/plouc/nivo/master/website/src/data/components/line/props.ts): `tooltip` (point tooltip function), `useMesh` ("Use a voronoi mesh to detect mouse interactions"), `enableSlices: 'x' | 'y' | false` with `sliceTooltip` (the shared mode), `debugMesh`, `enableCrosshair`, `crosshairType`, `enableTouchCrosshair` ("the crosshair to be dragged around a touch screen").
- **Bokeh** (https://docs.bokeh.org/en/latest/docs/user_guide/interaction/tools.html; example https://github.com/bokeh/bokeh/blob/branch-3.9/examples/interaction/tools/hover_tooltip_formatting.py):

  ```python
  p.add_tools(HoverTool(
      tooltips=[('date', '@date{%F}'), ('close', '$@{adj close}{%0.2f}'), ('volume', '@volume{0.00 a}')],
      formatters={'@date': 'datetime', '@{adj close}': 'printf'},
      mode='vline'))
  ```

  A _tool_ added to the figure, optionally restricted with `renderers=[line]`. `mode`: `"mouse"` ("directly over a glyph"), `"vline"` ("whenever a vertical line from the mouse position intersects a glyph"), `"hline"`. `$`-fields are plot-space values (`$index`, `$x`, `$snap_x`, `$color`). Custom HTML templates are supported, with `{safe}` to skip escaping.

- **Matplotlib / mplcursors** (https://mplcursors.readthedocs.io/en/stable/): `cursor = mplcursors.cursor(hover=True)`; `cursor.connect("add", lambda sel: sel.annotation.set_text(labels[sel.index]))`. An imperative callback. Line picks are _interpolated_ (the integer part of the index is the segment, the fraction is the position along it); images return `(y, x)`. Options `multiple`, `add_highlight`. No contour support.
- **Swift Charts** (WWDC23 "Explore pie charts and interactivity in Swift Charts", https://developer.apple.com/videos/play/wwdc2023/10037/; chartOverlay doc via developer.apple.com JSON):

  ```swift
  Chart { ForEach(...) { LineMark(...) }
    if let selectedDate {
      RuleMark(x: .value("Selected", selectedDate, unit: .day))
        .annotation(position: .top, spacing: 0,
                    overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) { valueSelectionPopover }
    }
  }
  .chartXSelection(value: $rawSelectedDate)
  ```

  Selection is a chart modifier that writes a _data value_ (not a datum; the user snaps it to data by hand). The popover is an `annotation` modifier on an ordinary, conditionally present mark. `chartGesture { proxy in DragGesture … proxy.selectXValue(at:) }` overrides the gesture. The older pattern is `chartOverlay { proxy in … proxy.value(at:) }`. Forum reports of `overflowResolution` misbehaving: https://developer.apple.com/forums/thread/741642.

- **Tableau** (https://help.tableau.com/current/pro/desktop/en-us/viz_in_tooltip.htm). Viz in Tooltip is markup in the tooltip editor: `<Sheet name="Tooltip: Profit by Sub-Category" maxwidth="300" maxheight="300" filter="<All Fields>">`. The target sheet is filtered to the hovered mark's dimensions ("at the most specific level of detail") or to named fields. It is "a static image of a target view, not an interactive sheet"; "A Viz in Tooltip cannot have its own Viz in Tooltip"; it is not available for totals since 2023.3. **[unverified]** The default tooltip (all fields on the view, `<SUM(Sales)>` tokens) and "Responsive" vs "On Hover" come from third-party pages only (the official page returned 404). A UW accessibility note (https://kb.wisc.edu/QueryLibrary/page.php?id=112063) says Tableau tooltips are hover-only and not keyboard-reachable.

## 7. UI frameworks: the "attach a floating thing" pattern

- **HTML `title`** and **SVG `<title>`**: an attribute or child _on the target_.
- **Popover API** (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover): `popover="auto" | "hint" | "manual"`. `hint` is for popovers "shown … in response to … mouseover/mouseout and focus/blur", and it does not close open `auto` popovers.
- **Interest invokers** (https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using_interest_invokers): `<button interestfor="my-tooltip">` plus `<p id="my-tooltip" popover="hint">`. Invokers can be only `<a>`, `<button>`, `<area>`, or SVG `<a>`. Interest is hover, focus, or long-press; Esc cancels. Events `interest`/`loseinterest`; CSS `interest-delay: 1s 2s`. Not yet universal (MDN suggests feature detection). Model: _a separate element named by id from the target_.
- **CSS anchor positioning** (https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Anchor_positioning/Using; https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-try-fallbacks): `anchor-name: --a` on the target, `position-anchor: --a` on the floating element (the floating element names its target). `position-area` is a 3×3 grid (`top center`, `top span-left`, `bottom`). `anchor(--a end)` is a length usable in `calc()`. `position-try-fallbacks: flip-block, flip-inline, flip-start`. `popovertarget` creates an implicit anchor.
- **Floating UI** (https://floating-ui.com/docs/tutorial, https://floating-ui.com/docs/virtual-elements): `computePosition(reference, floating, {placement: 'top' | 'top-start' | 'top-end' | …, middleware: [offset(6), flip(), shift({padding: 5}), arrow()]})`. A _virtual element_ is any object with `getBoundingClientRect`, such as a zero-size rect at the pointer; this is how follow-cursor and data-point anchoring are done.
- **Radix Tooltip** (https://www.radix-ui.com/primitives/docs/components/tooltip): `Provider` (`delayDuration` 700, `skipDelayDuration` 300), `Root`, `Trigger`, `Portal`, `Content` (`side` "top", `sideOffset`, `align` "center", `alignOffset`, `avoidCollisions`, `collisionPadding`, `sticky`), `Arrow`. Opens on focus or hover; Esc closes. Touch is not documented.
- **React Aria** (https://react-aria.adobe.com/Tooltip): `<TooltipTrigger><Button/><Tooltip><OverlayArrow/></Tooltip></TooltipTrigger>`; `placement` ('top'), `offset` (main axis), `crossOffset`, `shouldFlip`, `triggerRef` (when used standalone). "Tooltips are not shown on touch screen interactions."
- **SwiftUI.** `.help("…")` is a _modifier on the target_. It sets the help tag (tooltip) on macOS and visionOS _and_ the accessibility hint, and has no visible effect on iPhone (doc index https://developer.apple.com/documentation/swiftui/view/help(_:).md; page did not render for me, so content is from Apple's search snippet and forums). `.popover(isPresented:attachmentAnchor: = .rect(.bounds), arrowEdge:)` is a modifier whose content is a view builder; "On iPhone, popovers adapt into sheets." (Apple docs JSON for `popover(isPresented:attachmentAnchor:arrowEdge:content:)`.)
- **Figma** (https://help.figma.com/hc/en-us/articles/360040035834-Prototype-triggers): the "While hovering" trigger is for "tooltips, on-screen prompts", and it reverts automatically on leave. **[unverified]** The overlay position options ("Manual", relative to the trigger); the page I fetched did not cover them.

Placement vocabulary across these:

- side: `side` / `placement` / `position` / `arrowEdge` / `anchor` (Plot) / `position-area`
- align: `align`, `-start`/`-end`, `span-*`
- gap: `offset` / `sideOffset` / `spacing`
- cross: `crossOffset` / `alignOffset`
- collision: `flip`, `shift`, `avoidCollisions`, `shouldFlip`, `confine`, `overflowResolution`
- container: `portal`, `appendTo`, `placement` (ggiraph)
- follow-cursor: `use_cursor_pos`, `followPointer` (Highcharts), virtual element (Floating UI)

## 8. Research literature

- **Shneiderman 1996**, "The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations" (VL'96), origin of "details on demand" (cited via Zong et al.; not read directly).
- **Satyanarayan, Moritz, Wongsuphasawat, Heer**, "Vega-Lite: A Grammar of Interactive Graphics", InfoVis 2017 (https://vis.mit.edu/pubs/vega-lite). Selections are defined by events, points of interest, and a predicate; `nearest` is a selection _transform_. **[unverified]** Whether the paper treats tooltips as grammar; Vega-Lite keeps the tooltip as a channel, not a selection.
- **Zong, Pollock, Wootton, Satyanarayan**, "Animated Vega-Lite", VIS 2022 / TVCG 2023 (https://vis.mit.edu/pubs/animated-vega-lite). Time is either an encoding channel or an event stream driving selections; relevant if hover is modeled as an input stream. (Josh is a co-author.)
- **Zong et al.**, "Lyra 2: Designing Interactive Visualizations by Demonstration", TVCG 2021 (https://vis.mit.edu/pubs/lyra2). Generates Vega-Lite interactions by demonstration; no tooltip-specific content found.
- **Wu, Chang, Hellerstein, Satyanarayan, Wu**, "DIEL: Interactive Visualization Beyond the Here and Now", TVCG 2022 (https://vis.mit.edu/pubs/diel). Interface state is a query over event tables, so hover is just a table; nothing tooltip-specific found.
- **Heer & Moritz**, "Mosaic", TVCG 2024 (https://idl.uw.edu/papers/mosaic). Extends Vega-Lite selections across views; no tooltip content in the paper (vgplot reuses Plot's `tip`).
- **Zong, Lee, Lundgard, Jang, Hajas, Satyanarayan**, "Rich Screen Reader Experiences for Accessible Data Visualization", EuroVis 2022 (https://vis.mit.edu/pubs/rich-screen-reader-vis-experiences/; text https://ar5iv.labs.arxiv.org/html/2205.04917). Trees let users "traverse deeper into branches to acquire details-on-demand"; "Magnifier users also wished for in situ tooltips." This argues that tooltip content should be the same information reachable by keyboard or tree navigation. Implemented in Olli (https://mitvis.github.io/olli/).
- **Chartability** (https://chartability.github.io/POUR-CAF/): "If chart is interactive with a mouse … it must also be made interactive for use with a keyboard." "Focusing should mirror hovering, selecting … should mirror clicks." Charts must be tested with touch and a screen reader.
- **WCAG 2.2 SC 1.4.13 Content on Hover or Focus** (https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html): _dismissible_ (without moving the pointer), _hoverable_ (the pointer can move onto it), _persistent_. Plot's click-to-stick, Highcharts `stickOnContact` and ECharts `enterable` partly address this; a default `pointer-events:none` tooltip (as in ggiraph) fails "hoverable".
- **Touch.** I found no tooltip-specific touch study; searches returned general fat-finger and occlusion work (Google, https://research.google.com/pubs/archive/37154.pdf; Microsoft "Ripples"). **[unverified]** Vogel and Baudisch "Shift" (CHI 2007) is from memory. Practice is split: no tooltip on touch (React Aria); long-press (interest invokers); drag-to-scrub (Nivo `enableTouchCrosshair`, Swift `chartGesture`, D3 `preventDefault` on `touchstart`); popover becomes a sheet (SwiftUI on iPhone).
- **Static export.** SVG `<title>` survives in exported SVG. Plot `tip` doubles as a static annotation mark (but #2187: it fails in JSDOM). Tableau's viz in tooltip is itself rendered as a static image. **[unverified]** That Plotly and Vega PNG export drops hover is inferred, not checked.

---

## Synthesis

### Taxonomy of models

1. **Channel on the mark.** Vega-Lite/Altair `tooltip`, ggplotly `text` + `tooltip=`, ggiraph `tooltip` aesthetic, SVG/HTML `title`, Plot's `title` channel. _Easy:_ data-bound per-datum content; accessibility (the content doubles as the ARIA description in Vega-Lite and as `<title>` in SVG). _Awkward:_ anything other than "the element under the pointer"; nearest, x-unified and crosshair need a second mechanism; in Vega-Lite a non-aggregated tooltip field changes grouping.
2. **Boolean or options object on the mark that desugars to a derived mark.** Plot `tip: true | "x" | {format}`, Vega-Lite `mark.tooltip: true | {content}`, ggiraph `hover_nearest`. _Easy:_ one keyword gives sensible defaults (all channels, scale labels, paired x1/x2 shown as a range or a length). _Awkward:_ anything spanning marks (shared or grouped tips, Plot #2003).
3. **Separate mark or layer reading a pointer selection.** Plot `Plot.tip(data, Plot.pointerX(...))` with `ruleX` and `crosshair`; Vega-Lite nearest selection plus a rule layer; Swift Charts `chartXSelection` plus `RuleMark.annotation`; Mosaic tips on invisible centroid dots. _Easy:_ full composition (highlight dot, rule, tip and label are ordinary marks sharing one focus); static annotation is the same mark without a pointer; pointer targets (`px`/`py`, centroids) can differ from the drawn geometry. _Awkward:_ verbosity (five layers in Altair); keeping several pointers consistent (Plot recommends the same targets and mode).
4. **Chart-level component with a trigger mode.** ECharts `tooltip.trigger: item | axis`, Highcharts `shared`/`split`, Plotly `hovermode`, Recharts `<Tooltip shared>`, visx XYChart `<Tooltip>`, Nivo `enableSlices`, Bokeh `HoverTool(mode=...)`, ggiraph `opts_tooltip`. _Easy:_ x-unified, crosshair, synchronized axes (ECharts `axisPointer.link`, Plotly `hoversubplots`). _Awkward:_ content is a string template or a callback over series params, not data-bound marks; per-mark differences need per-series overrides.
5. **Imperative event callback or handler.** D3 (`d3.pointer` + `d3.least`/`Delaunay.find`), mplcursors `connect("add")`, the vega-tooltip `formatTooltip` handler, the visx floating `tooltip.show()`, Swift `chartOverlay` + `proxy.value(at:)`. _Easy:_ anything, including HTML and nested charts. _Awkward:_ no defaults, not serializable; hit-testing and accessibility are left to the author.

Cross-cutting split from UI frameworks: **modifier on the target** (SwiftUI `.help`/`.popover`, HTML `title`, ggiraph aesthetic) versus **separate element naming its target** (`interestfor`/`popover="hint"`, CSS `position-anchor`, Radix and React Aria Trigger plus Content, Floating UI's `reference` argument).

### Independent axes of the design space

1. **Where declared:** channel, mark option, separate mark or layer, chart-level component, or callback.
2. **Content and its default:** all encoded channels (Vega-Lite `encoding`, Plot, Plotly Express); all datum fields (Vega-Lite `content: "data"`); only named fields (ggplotly whitelist, Bokeh, Altair list); free text or a template (`title`, `hovertemplate`, Bokeh `@field{fmt}`, ECharts `{b}{c}`); a component or callback (Recharts, visx, ECharts formatter). Formatting per field (d3 format or function); per-field opt-out (`false`).
3. **Labels:** scale or axis label, then channel name (Plot); `title` (Vega-Lite); tuple label (Bokeh).
4. **Target choice (hit-test):** element under the pointer (SVG, Vega, Bokeh `mouse`, Highcharts default); nearest in 2D (Plot `pointer`, Vega-Lite `nearest` Voronoi, Nivo `useMesh`, ggiraph `hover_nearest`); nearest along one axis with a tiebreak (Plot `pointerX`, Bokeh `vline`, Plotly `x`); all series at the nearest x (Plotly `x unified`, ECharts `axis`, Highcharts `shared`, Recharts `shared`, Nivo slices, visx `datumByKey`); interpolated along a line (mplcursors); a raw value, not snapped (Swift `chartXSelection`). Parameters: max radius (Plot 40 px, Plotly `hoverdistance`); pointer targets separate from geometry (`px`/`py`, centroids); coincident-point policy (Plot #1621, Plotly "only one").
5. **Cardinality and pooling:** one tip globally (Plot `pool`), one per series (Highcharts `split`, Plotly `x`), or one unified box; exclusive across facets versus linked.
6. **Placement:** anchored to the datum versus following the cursor (ggiraph `use_cursor_pos`, ECharts default follow, Floating UI virtual element); side, align, offset; collision handling (flip, shift, confine, overflowResolution); container (in-SVG versus portal or body; Plot is in-SVG and clips, see #2213 and `overflow: visible`).
7. **Persistence:** hover-only, click-to-stick (Plot), enterable or hoverable (ECharts `enterable`, Highcharts `stickOnContact`, WCAG 1.4.13); delays (Radix 700/300, ggiraph 200/500, `interest-delay`).
8. **Rich or nested content:** none (Plot, Plotly); image key (vega-tooltip); HTML (ggiraph, Highcharts `useHTML`, ECharts, Bokeh); any component (Recharts, visx, Swift annotation views); a filtered static sub-view (Tableau).
9. **Aggregated or derived marks:** aggregate rows (Plot shows bin range and count, but no stack total, #1975); grouping side effects (Vega-Lite); no custom text on stats (ggplotly); hierarchy variables (Plotly treemap `percentParent`, `currentPath`); polygons answered at their centroid (Plot geo, Mosaic).
10. **Static export and accessibility:** `<title>` survives and is announced; Vega-Lite reuses tooltip fields for the ARIA description; keyboard parity (Chartability); touch (none, long-press, scrub, or sheet); WCAG 1.4.13.

### Naming table

| Concept              | Vega-Lite / Altair                     | Plot / vgplot                           | Plotly                                | ECharts                        | Highcharts                              | Bokeh                      | ggiraph / ggplotly                             | Recharts / visx / Nivo                 | Swift Charts                            | UI frameworks                                                            |
| -------------------- | -------------------------------------- | --------------------------------------- | ------------------------------------- | ------------------------------ | --------------------------------------- | -------------------------- | ---------------------------------------------- | -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| The thing            | tooltip                                | tip (and title)                         | hover label (`hoverlabel`)            | tooltip                        | tooltip                                 | HoverTool / tooltips       | tooltip                                        | Tooltip                                | annotation / popover                    | tooltip, popover hint, help                                              |
| Content              | tooltip field defs; `content`          | channels, title, format                 | hovertemplate, hover_data, customdata | formatter, valueFormatter      | format / pointFormat / formatter        | tooltips (label, @field)   | tooltip aes, `text` aes                        | content / renderTooltip / tooltip fn   | annotation content                      | Content                                                                  |
| Trigger / hit-test   | selection `nearest`, `on: pointerover` | pointer / pointerX / pointerY           | hovermode closest / x / y             | trigger item / axis; triggerOn | (default) / shared                      | mode mouse / vline / hline | hover_nearest                                  | shared / useMesh / snapTooltipToDatumX | chartXSelection                         | Trigger, interestfor                                                     |
| Placement            | (vega-tooltip offsetX/Y)               | anchor, preferredAnchor, frameAnchor    | (auto), hoverlabel.align              | position, confine              | positioner                              | (attachment) [unverified]  | offx/offy, use_cursor_pos, placement=container | position, offset                       | annotation position, overflowResolution | side/align/sideOffset, placement/offset/crossOffset, position-area, flip |
| Shared across series | pivot + rule layer idiom               | none (#2003 open)                       | `x unified`                           | `trigger: "axis"`              | `shared` (`split` = per series)         | `vline`                    | —                                              | `shared`, `datumByKey`, `enableSlices` | via RuleMark annotation                 | —                                                                        |
| Cross-panel sync     | shared selection                       | exclusive across facets; manual linking | hoversubplots                         | axisPointer.link               | (synchronized charts demo) [unverified] | —                          | data_id linking                                | —                                      | —                                       | —                                                                        |

The most common precedent for the thing is **tooltip**; for the multi-series mode it is **shared** or **axis**; for the hit-test it is **nearest**, **pointer** or **hover**. Plot is the outlier with **tip**. For placement, UI frameworks mostly say **side / align / offset / flip / shift**; chart libraries say **position / anchor / offset**.

### Hard real examples that stress a design

1. **Multi-series line, pointer never on a line:** Vega-Lite pivot plus rule https://vega.github.io/vega-lite/examples/interactive_multi_line_pivot_tooltip.html; Altair multiline https://altair-viz.github.io/gallery/multiline_tooltip.html; D3 multi-line https://observablehq.com/@d3/multi-line-chart; Plot grouped tip (open) https://github.com/observablehq/plot/issues/2003.
2. **Dense scatterplot and coincident points:** Plot #1621 https://github.com/observablehq/plot/issues/1621; Plotly's "only one will get a hover label" https://plotly.com/python/hover-text-and-formatting/; Nivo `useMesh` Voronoi.
3. **Stacked bar where a segment is an aggregate:** Plot binX plus stack hints (tip.md) and the stack-total limit in #1975 https://github.com/observablehq/plot/issues/1975; Vega-Lite's rule that a tooltip field changes grouping (tooltip.md); ggplotly's "can't supply custom text … to a statistical aggregation".
4. **Choropleth:** Plot geo with implicit centroid https://observablehq.com/plot/marks/geo; Mosaic US counties with invisible centroid dots https://github.com/uwdata/mosaic/blob/main/specs/yaml/us-county-map.yaml; Plot #1587 (polylabel centroids).
5. **Treemap with nested groups:** Plotly treemap hover variables `currentPath`, `percentParent`, `percentRoot` https://plotly.com/python/reference/treemap/. The question is which level of the nesting a hover answers.
6. **Small multiples with a synchronized tooltip:** Plot "exclusive across facets" (pointer.md) and linked pointers #1795 https://github.com/observablehq/plot/issues/1795; Plotly `hoversubplots: "axis"`; ECharts `axisPointer.link`.
7. **Node-link diagram:** the D3 force-directed graph uses `node.append("title")`, https://observablehq.com/@d3/force-directed-graph (**[unverified]**, not fetched because of the 429). Nodes are points but edges are lines, so a nearest-point pointer cannot target edges (Plot's "points only" limit).
8. **Tooltip containing a small chart:** Tableau Viz in Tooltip (filtered static sub-view) https://help.tableau.com/current/pro/desktop/en-us/viz_in_tooltip.htm; Swift Charts annotation with an arbitrary view (WWDC23 10037); visx and Recharts components; ECharts formatter returning an HTMLElement. Not possible in Plot (#1767, #1213) or Plotly.

### Notes most relevant to GoFish

- Plot's three-piece split is the cleanest precedent: a tip mark, a pointer focus transform usable on any mark, and `tip: true` as sugar. It matches GoFish's "every default desugars to writable user code" rule. Swift Charts arrives at the same split independently: a selection value, then an ordinary mark plus `.annotation`.
- The gaps every precedent leaves are: shared or grouped across series (Plot #2003; Vega-Lite needs a pivot); aggregate totals (Plot #1975); non-point geometry (centroids as a proxy for polygons); rich or nested-chart content; keyboard and touch parity. A GoFish design that answers these structurally would go beyond the state of the art. One example is focusing a node in the layout tree, so a stack segment or a whole stack can be the target.
- The UI-framework placement vocabulary (`side`, `align`, `offset`, `flip`/`shift`) is shared across Radix, React Aria, Floating UI and CSS. Plot's 9-value `anchor` maps more closely onto CSS `position-area`.
