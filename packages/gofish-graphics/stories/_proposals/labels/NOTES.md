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

## Sides and boundaries (`side.ts`, `Sides.stories.tsx`, `Boundary.stories.tsx`)

Stories: `path-sides`, `edge-sides`, `side-candidates`, `along-grid`,
`boundary-vocabulary`, `boundary-donut`, `boundary-region`. Same pipeline as
above (real render, geometry read from the SVG, raw `<text>` overlay).

- **Side rule.** `left`/`right` are the normals of the direction of travel
  (path point order). `above`/`below` pick the normal whose y points up or
  down; on a stretch steeper than about 75 degrees neither does, and the
  candidate is dropped. `inset`/`outset` need a closed path: the ring's
  signed area says whether outside is left or right of travel.
- **Sloped** labels use the chord across the label's width (as `along()`),
  moved `offset + h/2` along the normal, plus how far the path bulges toward
  the label inside the span (skipped past one text height).
- **Curved** labels follow the path offset by `offset + h/2`. The tangent for
  each normal is averaged over plus or minus the offset distance, so a sharp
  vertex of a sampled outline sweeps instead of jumping or folding. A window
  is rejected if the offset path folds back, or if it turns more than 70
  degrees under the text (`MAX_TURN`). Drawn with `<textPath>`, centered,
  reversed when the path runs leftward so glyphs stay upright. Collision
  geometry is a chain of small boxes along the curve.
- **`at: "start"` / `"end"`** put the label's start (end) at the path's start
  (end), not its center.
- **Side lists** are tried position-major: at each slide position, every side
  in order, then the next position.
- **Compass points** (`compassPoint`) are the outline points extreme in that
  direction, within 0.75px; ties along a flat edge take the middle of the
  run. Ties across separate runs (the C's two arm tips for `right`) take the
  run nearest the middle of the bounding box's side, then the first found.
- **Donut "top" edge.** The prototype finds a slice's outer arc as the run of
  outline points at the largest distance from the ring's center, and keeps
  the label inside that run. A real implementation would take the rect's top
  edge before the coordinate transform and map it. The donut renders with
  `axes: false` and no legend; the proposed panels map slices to species by
  DOM order (data order), checked against the legend colors.
- **Region hulls** are convex hulls of each cluster's points padded by a
  0.45-unit circle, computed in data units and drawn with a `polygon` mark in
  a layered chart. Dots and other regions' outlines are obstacles; labels
  slide 4px at a time along the outline, up to 30 steps each way.
- **Edge diagram** uses `arrow()` with `bow: 0, stretch: 0` for the ring and
  `bow: 0.3` for the opposite pair (perfect-arrows bows the two directions to
  opposite sides). No collision avoidance in that story.
