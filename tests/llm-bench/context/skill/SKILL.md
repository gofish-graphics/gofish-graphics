# GoFish cheatsheet

GoFish (`gofish-graphics`) is new; trust this page, not memory.

```js
import { chart, spread, rect } from "gofish-graphics";
export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: "category", dir: "x" }))
    .mark(rect({ h: "value" }))
    .render(container, { w: 500, h: 300 });
}
```

- `chart(data, { axes, color, coord, legend, schema })`.
- `.flow(op, ...)`: each operator splits rows into groups `by` a field and lays them out; the next runs inside each group. `spread` leaves gaps, `stack` none (sizes add up), `scatter` places at data values, `pack` packs them as touching circles (marks keep their pixel size), `group` only splits.
- `.mark(m)`: the shape per final group. Unset sizes fill the slot.
- `.layer(chart().flow(...).mark(...))`: a layer over the marks drawn so far.
- `.render(container, { w, h, axes })`: `w`, `h` = plot area; axes and legend go outside. Returns a Promise.
- An option naming a field is data-driven (`fill: "kind"` adds a legend). Sizes (`w`, `h`, `r`, `size`) sum a group's rows, positions average; `field("v").mean()`, `.count()` override. A negative `w`/`h` grows from 0 the other way; a stack lays signed parts end to end (a negative part goes back).
- `by: field("k").sort("v", "desc")`, `.sort(["a", "b"])`, `.bin()`. Default order: first appearance (top first for `dir: "y"`). `stack({ size: field("v").normalize() })` fills 100% (mosaic). `schema: { k: Schema.ordered(["a", "b", "c"]).diverging() }` orders `k` and centers a stack over it on its middle level.
- `axes: true | { x: { title, labelAngle: 45 | "auto" }, y: false }`. `color: palette("tableau10" | [colors] | { value: color })` or `gradient("blues" | [stops])`.
- `mark.label(field, { position: "center" | "outset" | "inset-top" | ..., fontSize })`; on an operator, one label per group.
- `line`/`ribbon` `curve`: `"linear"`, `"step"`, `"monotone"` (the default along a continuous axis), `"smooth"`.
- `coord: clock()`: `x`/`w` are angle, `y`/`h` radius. Pie: `stack({ by, dir: "x" })`, `rect({ w: "v", fill: "k" })`, no axes.
- `derive(bin("v"))` makes rows `{ start, end, count }` for `scatter({ xMin: "start", xMax: "end" })`.

Options (=default). [box] = x y w h cx cy x2 y2. [style] = fill stroke strokeWidth opacity.

## Operators (in `.flow()`)

- `spread`: by, dir, spacing=8, alignment="baseline", anchor="edge", reverse, axes, w, h, size
- `stack`: by, dir, spacing, alignment="baseline", anchor="edge", reverse, axes, w, h, size
- `scatter`: by, x, y, xMin, xMax, yMin, yMax, dims, alignment="baseline", axes, w, h
- `group` `pack`: by
- `table`: by: { x, y }, spacing, numCols
- `treemap`: x, y, w, h, dims, by, paddingInner, paddingOuter, tile="squarify", sort="desc", size
- `derive(fn)`, `fn(rows)` returns rows
- `resolve`: cols, from
- `join`: on, right
- `filter(pred)`, `pred(row)` returns a boolean

## Marks (in `.mark()`)

- `rect`: [box], [style], rx, ry, aspectRatio
- `circle`: r, [style]
- `ellipse`: [box], [style], aspectRatio
- `text`: [box], text, fill="black", stroke, strokeWidth, fontSize=12, fontWeight, rotate, textAnchor="start"
- `line`: [style], strokeDasharray, curve, dir: "x"|"y", along
- `ribbon`: [style], dir: "x"|"y", curve, along
- `polygon`: points, [style]
- `image`: [box], href, opacity
- `petal`: [box], fill, stroke, strokeWidth
- `blank`: w, h, fill

## Combinators (with children: `layer([a, b])`, `stack({ dir }, [a, b])`)

- `layer`: [box], coord, axes
- `enclose`: padding, rx, ry, [style], strokeDasharray
- `arrow`: bow, padStart, padEnd, flip, stroke, strokeWidth, start
- `position`: x, y
- `intersect` `exclude` `subtract` `paint` `mask`: no options

## Coordinates (`chart(data, { coord })`)

- `clock` `polar`: innerRadius, centralAngle, startAngle, direction, center

## How to use this folder

This folder is the GoFish skill. The cheatsheet above lists every operator and mark. `examples/` holds one complete GoFish example per gallery entry, listed below. To see how a kind of chart is built, read the example closest to it (for instance `examples/mosaic-chart.js`), or search the folder with Grep for an operator or option name. The examples load their own data; your program uses the `data` argument it is given.

## Examples

| example | what it shows | file |
| --- | --- | --- |
| 1D Strip Plot | A one-dimensional strip plot showing the distribution of daily precipitation in Seattle as thin tick marks along a single axis. | examples/1d-strip-plot.js |
| Activity Heatmap | A day-by-hour grid of activity values where each cell is shaded along a yellow-to-red intensity gradient. | examples/activity-heatmap.js |
| Aggregate Bar Chart | A horizontal bar chart of the US population by age group in the year 2000, with each bar's length encoding the total number of people. | examples/aggregate-bar-chart.js |
| Annotated Planets | The inner planets drawn as scaled circles with a labeled callout arrow pointing to one of them. | examples/annotated-planets.js |
| Area Chart | Fish catch counts across six lakes drawn as a single smoothed filled area. | examples/area-chart.js |
| Baking Recipes | A hand-drawn-style recipe card for dark chocolate brownies, its step-cell borders sized by align's new span value to exactly bound the groups of ingredient rows they apply to. | examples/baking-recipes.js |
| Balloon Chart | A whimsical scatterplot of fishing-catch locations where each lake's value floats as a colored balloon on a wavy string. | examples/balloon-chart.js |
| Bar Chart | A vertical bar chart of total fish catch counts across six lakes. | examples/bar-chart.js |
| Bar Chart Race | Twenty years of brand values as an animated bar chart race, in which every brand slides to its new rank as the years go by. | examples/bar-chart-race.js |
| Bar Chart with Negative Values | A bar chart whose values span positive and negative, with bars extending above and below the zero baseline. | examples/bar-chart-with-negative-values.js |
| Bar Chart with Value Labels | A bar chart of total fish catch per lake with each bar's total annotated above it. | examples/bar-chart-with-value-labels.js |
| Barley slope chart | Barley yield change from 1931 to 1932 at six field sites, with one colored slope per variety showing which sites gained and which declined. | examples/barley-slope-chart.js |
| Bird Migration A: Static | A static visualization of 72 bird species' yearly migrations, each species' daily positions threaded into one path over a map of the Americas. | examples/bird-migration-a-static.js |
| Bird Migration B: Hover | The same migration paths with interaction added: hovering a path thickens it, fades the rest, and reads the species' name out in the corner. | examples/bird-migration-b-hover.js |
| Bird Migration C: Animated | Switching from static lines to animated circle marks: each species is one circle at its position on the current day, and the chart plays through the year in ten seconds. | examples/bird-migration-c-animated.js |
| Bird Migration D: Trails | Adding animated path trails for the previous twenty days, with the current day's positions at full opacity. | examples/bird-migration-d-trails.js |
| Bird Migration E: Controls | Adding an interactive slider to scrub through the animation, with a play/pause button; dragging the slider pauses the clock and seeking is exact. | examples/bird-migration-e-controls.js |
| Bottle Fill Chart | A row of wine bottles filled with green liquid to heights that encode percentage values, an isotype-style bar chart with labeled fill lines. | examples/bottle-fill-chart.js |
| Bump Chart | A bump chart tracing the popularity ranking of new-car colors from 2000 to 2015, with one colored line per color rising and falling through the yearly rank positions. | examples/bump-chart.js |
| Categorical Color Palette | Fish catch totals per species as a bar chart colored by a categorical tableau10 palette. | examples/categorical-color-palette.js |
| Circle Treemap | Movie counts by major genre shown as a bubble chart of nested circles sized by each genre's frequency. | examples/circle-treemap.js |
| Colored Scatter Plot | A scatter plot of penguin flipper length against body mass, with points colored by species to reveal three distinct clusters. | examples/colored-scatter-plot.js |
| Connected Scatter Plot | A connected scatter plot tracing gas price against miles driven over successive years, with a line threading the points in chronological order to reveal the path through time. | examples/connected-scatter-plot.js |
| Connected Scatter Plot Animated | Fifty-five years of miles driven per person against the price of gas, with the line drawn in year by year as the animation plays. | examples/connected-scatter-plot-animated.js |
| Croissant Chart | A gaussian density sliced into gapped vertical bands of unequal width that hold their true x positions, sampling the distribution as a croissant chart over a hand-drawn standard-deviation axis. | examples/croissant-chart.js |
| DFSCQ File System Log | A four-stage pipeline diagram of the DFSCQ verified file system's write-ahead log, from an in-memory active transaction through a committed-transaction group, its on-disk block layout, and the applier that replays it to disk. | examples/dfscq-file-system-log.js |
| Diverging Likert Chart | Survey answers stacked in the order of the response scale, with every row centered on the middle of its Neutral bar. | examples/diverging-likert-chart.js |
| Donut Chart | A donut chart of fish catch by species, where the open center leaves a ring of wedges sized by each species' share of the total. | examples/donut-chart.js |
| Faceted Scatter Plot | Gas prices over the years shown as small-multiple scatter panels stacked vertically, one per side of the road. | examples/faceted-scatter-plot.js |
| Flower Chart | A distribution rendered as a meadow, where each binned count grows a layered flower of colored petals atop a green stem. | examples/flower-chart.js |
| Gapminder Animated | Fifty years of every country's fertility rate and life expectancy, played as an animation in which each country is one moving dot. | examples/gapminder-animated.js |
| Gapminder Trails | Five countries' fertility rate and life expectancy from 1955 to 2005, each a dot moving through the years that leaves a trail of its past years behind it. | examples/gapminder-trails.js |
| Grouped Bar Chart | Fish catch counts per lake, with bars grouped side by side by species. | examples/grouped-bar-chart.js |
| Grouped Box-and-Whisker Plot | Paired distributions across five categories shown as grouped box-and-whisker plots, with male and female boxes side by side over a labeled value axis. | examples/grouped-box-and-whisker-plot.js |
| Highlighted Ribbon Chart | Species catch flows across lakes as stacked ribbons, with Salmon and Trout picked out in color against gray. | examples/highlighted-ribbon-chart.js |
| Histogram | A histogram of movie IMDB ratings, with films binned into rating intervals and each bar's height showing the count of films per bin. | examples/histogram.js |
| Horizontal Bar Chart | Total fish catch counts across six lakes shown as horizontal bars. | examples/horizontal-bar-chart.js |
| Horizontal Stacked Bar Chart | A horizontal stacked bar chart of barley yield by variety, with each bar segmented and colored by the six experimental field sites. | examples/horizontal-stacked-bar-chart.js |
| Icicle Chart | Titanic passengers broken down by class and then survival as an icicle diagram, with nested rectangles in successive columns sized to encode each group's count. | examples/icicle-chart.js |
| Inner Planets to Scale | The four inner planets rendered as colored circles sized by their relative radii and spread in a row. | examples/inner-planets-to-scale.js |
| Insertion Sort | An insertion sort trace rendered as a stack of array stages, each with a dashed border around its sorted prefix and an arrow showing the element being moved into place. | examples/insertion-sort.js |
| Labeled Heatmap | A day-by-hour heatmap shaded along a blue gradient with each cell's value labeled in auto-contrasting text. | examples/labeled-heatmap.js |
| Layered Area Chart | Five overlapping series drawn as translucent filled areas so their changing magnitudes can be compared across a shared x-axis. | examples/layered-area-chart.js |
| Layered Bars and Area | Barley yield across all six field sites: stacked bars per variety and year, overlaid with translucent areas connecting each site's yield across the two years. Morris and Grand Rapids are colored and raised above the gray remaining sites via a data-driven paint order. | examples/layered-bars-and-area.js |
| Line Chart | A line chart tracing the average US price of gasoline year by year from 1956 to 2010, with the line ascending in chronological order to show how prices rose and fell over time. | examples/line-chart.js |
| Marginal Histogram (Jointplot) | A scatter plot of penguin beak length against beak depth framed by marginal histograms of each variable along the top and right edges. | examples/marginal-histogram-jointplot.js |
| Mosaic Chart | A mosaic plot of car counts by region of origin and cylinder count, where column widths show each region's share and stacked segments show the cylinder distribution within it. | examples/mosaic-chart.js |
| Nested Boxes Tree | A file-tree diagram built purely from the nest constraint — each subtree is a box sized to wrap its children plus padding, sizes propagating outward. | examples/nested-boxes-tree.js |
| Nested Mosaic Chart | Titanic survival broken down by passenger class as a mosaic plot, where each cell's width and height encode the proportions of a two-way contingency table. | examples/nested-mosaic-chart.js |
| Nested Waffle Chart | Titanic survival by passenger class shown as nested waffle grids, where colored dots fill each block in proportion to the count it represents. | examples/nested-waffle-chart.js |
| Nightingale Rose Chart | A recreation of Florence Nightingale's polar-area diagram of Crimean War mortality, with each month's wedge extending by cause of death (disease, wounds, and other). | examples/nightingale-rose-chart.js |
| Nightingale Rose Diagram | A polar rose chart of values across twelve sectors and six concentric rings shaded by a blues gradient. | examples/nightingale-rose-diagram.js |
| Node-Link Diagram | A small directed graph of labeled boxes connected by named edges, laying out nodes and relationships as a node-link diagram. | examples/node-link-diagram.js |
| Normalized Stacked Bar Chart | A normalized stacked bar chart showing the male and female proportion of the US population within each age group, with every bar scaled to a full height of one. | examples/normalized-stacked-bar-chart.js |
| Normalized Stacked Bar with Labels | US population by age group split into Male and Female shares, normalized so each horizontal bar spans 100% with raw counts labeled inside. | examples/normalized-stacked-bar-with-labels.js |
| Ohm Parse Tree | A parse-derivation diagram for the arithmetic expression "3 + (4 * 5)", with each matched grammar rule drawn as a colored bar spanning exactly the characters it covers, nested rules stacking downward toward the deepest match. | examples/ohm-parse-tree.js |
| Pie Chart | A pie chart breaking down total fish catch by species, with each wedge's angle proportional to its share of the catch. | examples/pie-chart.js |
| Polar Ribbon Chart | The lake-by-lake fish catch ribbons wrapped around a polar layout, coiling each species into a swirling spiral of nested colored bands. | examples/polar-ribbon-chart.js |
| Population Pyramid | Women and men in each age band drawn outward from a shared center, so the two sides of the population compare at a glance. | examples/population-pyramid.js |
| Pulley Diagram | A constraint-based physics diagram of three pulley wheels suspended from a ceiling bar by labeled ropes, lifting two hanging weights. | examples/pulley-diagram.js |
| Quantum Circuit Equivalence | A quantum-circuit diagram showing a controlled-Z gate is equivalent to an H-CNOT-H sequence, with control dots wired to their gates and the CNOT called out in a highlighted box. | examples/quantum-circuit-equivalence.js |
| Ribbon Chart | A ribbon chart tracking fish catch by species across six lakes, where each species' band is reordered at every lake so the largest sits on top and ribbons cross as rankings change. | examples/ribbon-chart.js |
| Ridgeline Chart | A ridgeline chart of Seattle's daily high temperatures by month, with each month's density silhouette overlapping the row above, a thin rule under every baseline, and month names in the left margin instead of a shared y axis. | examples/ridgeline-chart.js |
| Sankey Tree | A branching flow diagram where the width of each tapering band encodes the magnitude of a quantity as it splits across successive tiers. | examples/sankey-tree.js |
| Scatter Plot | A scatter plot of car horsepower against fuel efficiency in miles per gallon, revealing the downward trend between the two. | examples/scatter-plot.js |
| Scatter Plot with Pie Glyphs | A scatter plot placing each lake at its geographic location and drawing a miniature pie chart of its species composition as the point glyph. | examples/scatter-plot-with-pie-glyphs.js |
| Seattle Weather Stacked Bar Chart | A vertical stacked bar chart of the count of Seattle weather days per month, with each bar segmented and colored by weather type. | examples/seattle-weather-stacked-bar-chart.js |
| Selective Highlight | Stacked catch bars by lake with only the Salmon segments colored and every other species muted to gray. | examples/selective-highlight.js |
| Sequential Color Gradient | Ascending values as a bar chart whose fill interpolates along a sequential blues gradient. | examples/sequential-color-gradient.js |
| Simple Bar Chart | A simple vertical bar chart with one bar per category, each bar's height encoding its value. | examples/simple-bar-chart.js |
| Stacked Area Chart | Fish catch counts by lake split into stacked bands by species, each a colored filled area. | examples/stacked-area-chart.js |
| Stacked Bar Chart | Fish catch counts per lake, with each bar split into stacked species segments. | examples/stacked-bar-chart.js |
| Stacked Bar Chart with Labels | A stacked bar chart of fish catch counts per lake, with each species segment labeled in place. | examples/stacked-bar-chart-with-labels.js |
| Stacked Bar with Centered Labels | Catch counts by lake stacked by species, with each segment's value centered inside it in auto-contrasting text. | examples/stacked-bar-with-centered-labels.js |
| Streamgraph | A streamgraph of fish catch by species across six lakes, with the stacked bands centered around a wandering baseline so each species reads as a flowing organic layer. | examples/streamgraph.js |
| Stringline Chart | A Marey train schedule plotting Caltrain stations against time, with each colored diagonal line tracing a single northbound or southbound run. | examples/stringline-chart.js |
| Sunflower (Equal Scale) | A phyllotaxis spiral of 500 seeds placed by the golden angle; tagging x and y with the same measure gives them one shared data→pixel scale, so the packing stays perfectly circular in a wide canvas. | examples/sunflower-equal-scale.js |
| Three-Point Set Topologies | Nine point-set topologies on the same three labeled points, each drawn as nested ellipse neighbourhood outlines around the points they contain. | examples/three-point-set-topologies.js |
| Three-Point Set Topologies (Outline Only) | The same nine point-set topologies redrawn with unfilled, overlapping outlines instead of translucent fills, so every nested neighbourhood boundary stays legible. | examples/three-point-set-topologies-outline-only.js |
| Titanic Fare Circle Treemap | Each Titanic passenger drawn as a circle sized by fare paid and colored by survival, packed into a squarified treemap and faceted by passenger class. | examples/titanic-fare-circle-treemap.js |
| Titanic Survival Mosaic | A mosaic plot of Titanic survival: each column's width is proportional to the number of passengers in that cabin class, and each block's height to how many survived or died. | examples/titanic-survival-mosaic.js |
| Titanic Survival Unit Grid | A faceted grid of unit dots showing each Titanic passenger colored by survival, broken out by passenger class and sex. | examples/titanic-survival-unit-grid.js |
| Titanic Unit Column Chart | Each Titanic passenger is a dot, wrapped into one column per cabin class and colored by survival; equal dot sizes make the column heights read as class counts. | examples/titanic-unit-column-chart.js |
| Titanic Unit Histogram | Small-multiple age histograms — one panel per cabin class — where every bar is a stack of unit dots, one per passenger, colored by survival. | examples/titanic-unit-histogram.js |
| Titanic Unit Mosaic | The headline Atom unit mosaic: Titanic passengers as dots, blocked into class × sex rows and survived columns, where each count-proportional cell is filled one dot per passenger and colored by survival. | examples/titanic-unit-mosaic.js |
| Titanic Unit Violin | Per-class age violins built from unit dots: each age bin is a centered horizontal row of passengers, so stacking the bins up the age axis traces a symmetric density silhouette, colored by survival. | examples/titanic-unit-violin.js |
| Treemap | Movie counts by major genre laid out as a treemap of nested rectangles whose areas encode each genre's frequency. | examples/treemap.js |
| Violin Plot | Body-mass distributions for three penguin species drawn as violins, where each silhouette's width shows the density of measurements at that value. | examples/violin-plot.js |
| Waffle Chart | A waffle chart of fish catch across six lakes, where each catch becomes a colored square tiled into per-lake columns so the species mix reads as a grid of unit cells. | examples/waffle-chart.js |
| What's in a Bottle of Wine | A wine bottle sliced into proportional bands by ingredient and exploded into a vertical stack, with each slice labeled by category and its share of the bottle. | examples/what-s-in-a-bottle-of-wine.js |
