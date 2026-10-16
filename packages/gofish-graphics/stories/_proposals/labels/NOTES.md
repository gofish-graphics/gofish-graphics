# Label proposal prototype: approximations

Throwaway stories for the labeling API proposal (`Proposals/Labels` in
Storybook). Nothing here is library code, and no file under `src/` was changed.
The `*-today` stories are real renders of today's API. The other stories render
the real chart with today's API, then run the proposed strategies in `place.ts`
and draw the labels on top.

## How a proposed render is made

1. The chart is rendered with the real API (`chart(...).render(...)`), without
   `.label()`.
2. On the next animation frames (`afterPaint`), `place.ts` reads the rendered
   geometry from the SVG. Circles come from `<ellipse>` elements. Lines, bands
   and polygons are `<path>` elements, sampled every 1 to 4 px of arc length
   with `getTotalLength` and `getPointAtLength`. The coordinates are exact, not
   recomputed from a scale.
3. Strategies produce ranked candidates. The greedy first-fit chooser
   (`chooseFirstFit`) picks one per label, or hides the label.
4. The chosen labels are appended to the same `<svg>` as raw `<text>` elements
   (plus a `<rect>` for the background-box style). They are not GoFish `text`
   marks.

## Approximations

- **Labels are raw SVG, not GoFish nodes.** They copy what GoFish's label
  elaboration draws: font `source-sans-pro, sans-serif`, 11px (12px for
  interior labels), and color from `autoLabelColorForFill` (imported from
  `src/ast/labels/autoLabelColor.ts`). They are centered with
  `dominant-baseline="central"`.
- **Text size** is measured by the browser (`getBBox` on a temporary `<text>`)
  for width. Height is taken as 1.0 em, not the line box.
- **Collision geometry.** A label is a rectangle, rotated for sloped labels,
  padded by 1px. Circles are 12-sided polygons with the radius plus 1px. Lines
  are their sampled polylines. Tests use separating axes.
- **Matching marks to data rows** goes by DOM order (circles and lines are in
  data order, which the `*-today` renders confirm), or by reading the legend
  swatch colors (bands and polygons). In the proposed stories the legend is read
  and then removed from the SVG, and the SVG is narrowed to the legend's left
  edge, because a directly labeled chart does not need one.
- **Plot bounds for `around()`** are found from the axis rectangles: right of
  the y-axis and above the x-axis.
- **`end()` / `start()`** reserve room by widening the SVG by 40px (line-end) or
  by setting `overflow: visible` on the SVG (strategy grid). A real
  implementation would add this to the layout.
- **`around()`** candidates sit 3px outside the circle's outline. Diagonal
  candidates touch the outline at 45 degrees. The labeled dots are obstacles for
  every label of the same call. Labels are placed in data order, and the data is
  sorted by population, most populous first, so big countries win.
- **`along()`** samples candidates at `at`, then at `at ± 0.03`, `± 0.06`, and
  so on (14 steps each way). A sloped label takes the angle of the chord across
  the label's own width, not the tangent at one point. A candidate is skipped
  when the line strays more than 0.3 × the text height from that chord. Other
  series' lines are obstacles, and a label's own line is not.
- **`interior()` on a band** slides the label's box (with 3px padding, 2px in
  the grid) across x in 2px steps. It takes the x with the most vertical room
  over the box's width. If the box does not fit, the label is hidden. Font size
  is fixed, not scaled to fill as d3-area-label does.
- **`interior()` on a polygon** is the Mapbox polylabel algorithm (grid plus
  best-first search, precision 0.5px). The label is hidden when its box does
  not lie fully inside. The `polygon-interior-box` variant searches a 3px grid
  for the point where the label's box can grow largest.
- **Halo** is a white stroke 3px wide with `paint-order: stroke`. The
  background style is a white rectangle with 2px horizontal and 1px vertical
  padding.
- **Line data.** `line-today`, `line-end` and `line-along` use yearly averages
  of vega-datasets `stocks.csv`. `line-along-monthly` uses the raw monthly
  prices.
- **Zoom.** Each story's container has CSS `zoom` (1.15 to 2) so the PNG is
  sharp. Zoom does not change SVG user units or text metrics.
