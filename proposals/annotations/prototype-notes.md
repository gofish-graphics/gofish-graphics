# Annotation prototypes: renders and notes

Stories: `packages/gofish-graphics/stories/_proposals/annotations/` (titles `Proposals/Annotations/...`).
Approach B helpers: `helpers.ts` in the same folder. Data prep (not part of any spec): `data.ts`.
Renders: `proposals/annotations/img/`. Re-copy after a capture with `sh proposals/annotations/copy-imgs.sh`.

Counts are for the spec only: the code between the `// ── spec ──` markers, after prettier, with a rough token count (identifiers, numbers, strings and punctuation). Where a spec uses a JS `maxBy(...)` only to build note text, that line is counted.

**Is B an exact rewrite?** For each example, the A and B stories were rendered with `capture-one` and their normalized SVGs compared byte for byte.

| Example              | A vs B normalized SVG                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ex1 peak callout     | identical                                                                                                                                                                                                                                                                                         |
| ex2 rule + band      | identical                                                                                                                                                                                                                                                                                         |
| ex3 highlight        | identical                                                                                                                                                                                                                                                                                         |
| ex4 enclosure + note | same elements, but the note and arrow paint earlier (under the dots) in B, and coordinates differ by up to 0.01 px. B puts the callout layer inside the chart as a `.layer()` tier, while A wraps the chart in an outer `layer([...])`. Ex1 uses the same two structures and comes out identical. |

## Example 1: peak callout

GOOG monthly price (vega-datasets `stocks.csv`, loaded through the `vega-datasets` package as `LabelPlacement.stories.tsx` does). The chart has a circle around the max month, a two-line note up and to the left, and a straight leader with a small head.

### A (today): 39 lines, 315 tokens. `img/ex1-peak-a.png`

```js
layer([
  chart(goog, { schema: { date: Unit.time() }, w: 560, h: 300 })
    .flow(scatter({ by: "date", x: "date", y: "price" }))
    .mark(blank().name("months"))
    .layer(line({ stroke: "#467DA8", strokeWidth: 2 }))
    .layer(
      chart(selectAll("months"))
        .flow(derive((ms) => [maxBy(ms, (m) => project(m, "price"))]))
        .mark(
          enclose({
            shape: Shape.oval(),
            padding: 6,
            fill: "none",
            stroke: RED,
            strokeWidth: 1.5,
          }).name("peak")
        )
    ),
  spread({ dir: "y", spacing: 2, alignment: "start" }, [
    text({ text: "Peak", fontSize: 13, fontWeight: 700 }),
    text({ text: `$${peak.price} in ${monthYear(peak.date)}` }),
  ]).name("note"),
])
  .relate(({ peak, note }) => [
    Constraint.distribute({ dir: "x", spacing: 40 }, [note, peak]),
    Constraint.distribute({ dir: "y", spacing: 30 }, [peak, note]),
    arrow(
      {
        bow: 0,
        stretch: 0,
        strokeWidth: 1,
        padStart: 4,
        padEnd: 2,
        stroke: RED,
      },
      [note, peak]
    ),
  ])
  .render(container, { axes: true });
```

- **The selection is honest.** The circle's target is chosen inside the chart by `derive((ms) => [maxBy(ms, m => project(m, "price"))])` over `selectAll("months")`. There is no extremum selector (#796), so the user writes `maxBy` and `project`.
- **The note's text is computed outside the chart** (`maxBy(goog, "price")` in JS). A note is a free mark, not bound to data, so it cannot read the selected datum. Binding it (`chart(selection).mark(text(...))`) would place it _on_ the point. No pixel offset from a data anchor is visible to layout: `offset` only moves the drawing (#1053/#1054).
- **Offsetting the note takes two `Constraint.distribute` calls** (x and y) over `.relate()` operands. The note must be a plain child of an outer `layer([...])` that wraps the chart. A fresh mark inside a `.relate()` drawing clause cannot be a constraint operand: `Constraint.distribute` throws "not an operand".
- **The y direction of `distribute` follows the axis.** `[peak, note]` means "note above" only because this chart's y axis points up. In a top-down diagram it means the opposite.
- **The leader is an `arrow` with `bow: 0, stretch: 0`, the only connector that runs box to box.** It always draws a head, where d3-annotation leaders usually have none. It ends on the target's _bounding box_, not its outline (#975). That is fine here because the subject is a small circle. `.label()` has no leader (#521).
- **The subject circle is a clean fit:** `enclose({ shape: Shape.oval(), padding: 6 })` over the one-ref selection.
- **The outer `.relate()` can see a name inside a nested chart.** `.name("peak")` sits on a mark inside a nested chart and still resolves. It works, but the reader must know the name scoping rules (#1203, #802).

### B (shorthands): 12 lines, 128 tokens. `img/ex1-peak-b.png`

```js
chart(goog, { schema: { date: Unit.time() }, w: 560, h: 300 })
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(blank().name("months"))
  .layer(line({ stroke: "#467DA8", strokeWidth: 2 }))
  .layer(
    callout(chart(selectAll("months")).flow(argmax("price")), {
      note: ["Peak", `$${peak.price} in ${monthYear(peak.date)}`],
      dx: -40,
      dy: 30,
    })
  )
  .render(container, { axes: true });
```

- `argmax(field)` ≡ `derive(xs => [maxBy(xs, x => project(x, field))])`.
- `callout(target, { note, dx, dy, subject, connector, color })` ≡ the A layer: `layer([target.mark(enclose(...).name("subject")), spread(texts).name("note")]).relate(...)` with two distributes and an arrow (the exact expansion is in the comment in `helpers.ts`). It is used as a `.layer()` tier, and `selectAll("months")` still resolves inside it.
- **It could not be a `.label()` option.** A `position` is a value of the closed `Place` family, so `Place.offset({ dx, dy })` and a `leader` option need library changes. A label is also not a named node that `arrow` can target. So the prototype is a function that returns a layer.
- The note's text is still computed outside the chart, as in A.

## Example 2: reference rule + band

Seattle's mean daily high per month, 2012 to 2015 (from `src/data/seatle-weather.ts`, averaged in `data.ts`).

### A (today): 22 lines, 194 tokens. `img/ex2-rule-band-a.png`

```js
const start = Date.parse("2015-06-01");
const end = Date.parse("2015-09-01");
chart(seattle, { schema: { date: Unit.time() }, w: 560, h: 280 })
  .flow(scatter({ by: "date", x: "date", y: "temp" }))
  .mark(line({ stroke: "#467DA8", strokeWidth: 2 }))
  .layer(
    rect({
      x: datum(start),
      w: datum(end - start),
      fill: "#f2b45c",
      opacity: 0.3,
    })
      .label(() => "summer 2015", { position: "outset-top", fontSize: 11 })
      .zOrder(-1)
  )
  .layer(
    rect({ y: datum(mean), h: 1, fill: "#555" }).label(() => `mean ${mean}`, {
      position: "outset-right",
      fontSize: 11,
    })
  )
  .render(container, { axes: true });
```

- **A time axis needs epoch milliseconds.** `datum("2015-06-01")` on a `Unit.time()` axis is not parsed. `x: datum("2015-06-01"), w: datum(ms)` produced the string `"2015-06-017948800000"`, and the render threw "placed on an axis with no position scale". The band's width is a duration in ms (`end - start`).
- **A literal label needs a function**, `.label(() => "summer 2015")`, because a bare string is read as a field name.
- `.zOrder(-1)` puts the band under the line by hand.
- The mean is computed in JS before the chart. The next story computes it inside.

### A, mean computed in the chart: 14 lines, 146 tokens. `img/ex2-rule-band-a-mean-in-chart.png`

```js
chart(seattle, { schema: { date: Unit.time() }, w: 560, h: 280 })
  .flow(scatter({ by: "date", x: "date", y: "temp" }))
  .mark(line({ stroke: "#467DA8", strokeWidth: 2 }))
  .layer(
    chart(seattle)
      .flow(derive((rows) => [{ mean: meanBy(rows, "temp") }]))
      .mark(
        rect({ y: "mean", h: 1, fill: "#555" }).label(
          (d) => `mean ${project(d, "mean").toFixed(1)}`,
          { position: "outset-right", fontSize: 11 }
        )
      )
  )
  .render(container, { axes: true });
```

- This works, and it is Vega-Lite's `y: mean(temp)` rule idiom. One wart: the rule's field joins the y axis title, which reads "temp, mean". A tier cannot say it is an annotation that should stay out of the axis title.

### B (shorthands): 15 lines, 155 tokens. `img/ex2-rule-band-b.png`

```js
chart(seattle, { schema: { date: Unit.time() }, w: 560, h: 280 })
  .flow(scatter({ by: "date", x: "date", y: "temp" }))
  .mark(line({ stroke: "#467DA8", strokeWidth: 2 }))
  .layer(
    band({ x: ["2015-06-01", "2015-09-01"], opacity: 0.3 })
      .label(() => "summer 2015", { position: "outset-top", fontSize: 11 })
      .zOrder(-1)
  )
  .layer(
    rule({ y: mean, stroke: "#555" }).label(() => `mean ${mean}`, {
      position: "outset-right",
      fontSize: 11,
    })
  )
  .render(container, { axes: true });
```

- `rule({ y: v })` ≡ `rect({ y: datum(v), h: strokeWidth, fill: stroke })`. `band({ x: [a, b] })` ≡ `rect({ x: datum(a), w: datum(b - a), fill, opacity })`, with ISO dates turned into ms. Both return the rect, so `.label()` and `.zOrder()` chain.
- The saving over A is small. The real gain is hiding the conversion to ms. A real `band` would want `.zOrder(-1)` and a label position (top for an x band, end for a rule) as defaults.

## Example 3: highlight one series (gghighlight)

Five stocks' yearly average price.

### A (today): 17 lines, 177 tokens. `img/ex3-highlight-a.png`

```js
const isAAPL = (d: any) => project(d, "symbol") === "AAPL";
chart(stocks, {
  schema: { date: Unit.time() },
  w: 560,
  h: 300,
  color: Color.palette({ AAPL: "#d62728" }), // unmapped series fall to gray
})
  .flow(
    group({ by: "symbol" }),
    scatter({ by: "date", x: "date", y: "price" })
  )
  .mark(
    line({ stroke: "symbol", strokeWidth: 2 })
      .zOrder((d) => (isAAPL(d) ? 1 : 0))
      .label((d) => (isAAPL(d) ? "AAPL" : ""), { position: Place.end() })
  )
  .render(container, { axes: true, legend: false });
```

- The idiom works. A partial `Color.palette` grays the unmapped series, `.zOrder(fn)` raises AAPL, and the label accessor returns `""` for the other series, which draws nothing.
- **One idea, "AAPL is emphasized", is spelled three times**: the palette key, the z test, and the label test (#641).

### B (shorthands): 20 lines, 133 tokens. `img/ex3-highlight-b.png`

```js
const hi = emphasize("symbol", { AAPL: "#d62728" }, ["color", "z", "label"], {
  position: Place.end(),
});
chart(stocks, {
  schema: { date: Unit.time() },
  w: 560,
  h: 300,
  ...hi.chart,
})
  .flow(group({ by: "symbol" }), scatter({ by: "date", x: "date", y: "price" }))
  .mark(hi.mark(line({ stroke: "symbol", strokeWidth: 2 })))
  .render(container, { axes: true, legend: false });
```

- `emphasize(field, colors, channels, labelOptions)` returns `{ chart, mark }`. `hi.chart` ≡ `{ color: Color.palette(colors) }`, and `hi.mark(m)` ≡ `m.zOrder(...).label(...)`. Prettier spreads it over more lines than A, but it has fewer tokens.
- **It still lands in two places**, because the color scale is a chart option while z and label are mark modifiers. A function color accessor cannot return a literal color, since its result always goes through the scale. The mark must still say `stroke: "symbol"`. A true one-declaration `emphasize` needs either a scale at the mark level or a modifier that can set the chart's palette (#641).

## Example 4: group enclosure + note

The `gapminderCountries` scatter. The blob is the spec from `EncloseShapes.stories.tsx` (ChartAccent Sub-Saharan Africa).

### A (today): 44 lines, 307 tokens. `img/ex4-enclosure-a.png`

```js
layer([
  chart(gapminderCountries, {
    w: 520,
    h: 320,
    color: Color.palette(REGION_COLORS),
  })
    .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
    .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
    .layer(
      chart(selectAll("countries"))
        .flow(filter((c) => project(c, "Region") === "Sub-Saharan Africa"))
        .mark(
          enclose({
            shape: Shape.blob({ convexity: 0.1, neck: 0.6 }),
            padding: 6,
            fill: "#47b8a0",
            stroke: "#47b8a0",
            fillOpacity: 0.3,
          }).name("africa")
        )
    ),
  spread({ dir: "y", spacing: 2, alignment: "start" }, [
    text({ text: "Sub-Saharan Africa", fontSize: 13, fontWeight: 700 }),
    text({ text: "high fertility, short lives" }),
  ]).name("note"),
])
  .relate(({ africa, note }) => [
    Constraint.distribute({ dir: "x", spacing: 16 }, [africa, note]),
    Constraint.align({ y: "end" }, [africa, note]),
    arrow(
      {
        bow: 0.4,
        stretch: 0,
        strokeWidth: 1,
        padStart: 4,
        padEnd: 2,
        stroke: TEAL,
      },
      [note, africa]
    ),
  ])
  .render(container, { axes: true, legend: false });
```

- **The arrow misses the blob (#975).** `arrow` aims from box to box. The blob's bounding box covers most of the plot, and its top-right corner is empty, so the arrow ends in blank space above the cloud. This is the worst visual failure in the set.

### A, workaround (arrow aimed at one member): 55 lines, 391 tokens. `img/ex4-enclosure-a-aim-at-member.png`

```js
const african = (c: any) => project(c, "Region") === "Sub-Saharan Africa";
layer([
  chart(gapminderCountries, {
    w: 520,
    h: 320,
    color: Color.palette(REGION_COLORS),
  })
    .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
    .mark(
      circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries")
    )
    .layer(
      chart(selectAll("countries"))
        .flow(filter(african))
        .mark(
          enclose({
            shape: Shape.blob({ convexity: 0.1, neck: 0.6 }),
            padding: 6,
            fill: "#47b8a0",
            stroke: "#47b8a0",
            fillOpacity: 0.3,
          }).name("africa")
        )
    )
    .layer(
      chart(selectAll("countries"))
        .flow(
          filter(african),
          derive((cs) => [maxBy(cs, (c) => project(c, "FertilityRate"))])
        )
        .mark(
          enclose({ padding: 6, fill: "none", stroke: "none" }).name("tip")
        )
    ),
  spread({ dir: "y", spacing: 2, alignment: "start" }, [
    text({ text: "Sub-Saharan Africa", fontSize: 13, fontWeight: 700 }),
    text({ text: "high fertility, short lives" }),
  ]).name("note"),
])
  .relate(({ africa, tip, note }) => [
    Constraint.distribute({ dir: "x", spacing: 24 }, [africa, note]),
    Constraint.distribute({ dir: "y", spacing: 36 }, [tip, note]),
    arrow(
      {
        bow: 0.4,
        stretch: 0,
        strokeWidth: 1,
        padStart: 4,
        padEnd: 2,
        stroke: TEAL,
      },
      [note, tip]
    ),
  ])
  .render(container, { axes: true, legend: false });
```

- This looks right, but only because the user picks a stand-in target by hand. The stand-in is a second selection (the African country with the highest fertility) in an invisible padded `enclose`, plus a second distribute on that point. The extremum here only works around #975.

### B (shorthands): 23 lines, 161 tokens. `img/ex4-enclosure-b.png`

```js
chart(gapminderCountries, {
  w: 520,
  h: 320,
  color: Color.palette(REGION_COLORS),
})
  .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
  .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
  .layer(
    callout(
      chart(selectAll("countries")).flow(
        filter((c) => project(c, "Region") === "Sub-Saharan Africa")
      ),
      {
        note: ["Sub-Saharan Africa", "high fertility, short lives"],
        subject: Shape.blob({ convexity: 0.1, neck: 0.6 }),
        fill: "#47b8a0",
        dx: 16,
        connector: "curve",
        color: TEAL,
      }
    )
  )
  .render(container, { axes: true, legend: false });
```

- This is the same `callout` as ex1, with `subject: Shape.blob(...)`, `fill`, and no `dy` (which means the tops are level). It inherits #975, so the render matches A.
- A faithful `callout` over a group needs the connector to end on the subject's _outline_, at the point nearest the note (#975). Then the helper would need no stand-in.

## Example 5: math augmentation (A only)

### A (today): 66 lines, 519 tokens. `img/ex5-math-a.png`

```js
const tok = (t: string, fill = "#222") =>
  text({ text: t, fontSize: 32, fill, fontFamily: "Georgia, serif" });
const note = (lines: string[], fill: string) =>
  spread(
    { dir: "y", spacing: 1, alignment: "middle" },
    lines.map((t) => text({ text: t, fontSize: 12, fill }))
  );
const terms = [
  // `depth` staggers the notes by hand so neighbors do not collide.
  {
    name: "v",
    color: "#c0392b",
    depth: 18,
    note: ["variance:", "how far X spreads"],
  },
  {
    name: "e",
    color: "#2e86c1",
    depth: 54,
    note: ["expected value:", "the average over X"],
  },
  {
    name: "d",
    color: "#1e8449",
    depth: 18,
    note: ["squared distance", "from the mean μ"],
  },
];
layer([
  spread({ dir: "x", spacing: 8, alignment: "baseline" }, [
    tok("Var(X)", terms[0].color).name("v"),
    tok("="),
    tok("E", terms[1].color).name("e"),
    tok("["),
    tok("(X − μ)²", terms[2].color).name("d"),
    tok("]"),
  ]),
  ...terms.map((t) => rect({ h: 2, fill: t.color }).name(`${t.name}Bar`)),
  ...terms.map((t) => note(t.note, t.color).name(`${t.name}Note`)),
])
  .relate((names) =>
    terms.flatMap((t) => {
      const [term, bar, n] = [
        names[t.name],
        names[`${t.name}Bar`],
        names[`${t.name}Note`],
      ];
      return [
        Constraint.align({ x: "span" }, [term, bar]),
        Constraint.distribute({ dir: "y", spacing: 4 }, [term, bar]),
        Constraint.align({ x: "middle" }, [bar, n]),
        Constraint.distribute({ dir: "y", spacing: t.depth }, [bar, n]),
        arrow(
          {
            bow: 0,
            stretch: 0,
            strokeWidth: 1,
            padStart: 2,
            padEnd: 2,
            stroke: t.color,
          },
          [n, bar]
        ),
      ];
    })
  )
  .render(container, { w: 440, h: 190 });
```

- This works well. Tokens sit on a baseline `spread`. Each colored term gets a 2 px bar that takes the term's x interval through `Constraint.align({ x: "span" })`, a note centered under the bar, and a short `arrow` from the note to the bar.
- **Notes do not avoid each other.** The first render overlapped the "variance" and "expected value" notes, so `depth` staggers them by hand. The collision logic of `.label()` (`avoiding`) is not available to free notes.
- **The connector always has a head**, because no headless `arrow` exists. A center-to-center `line` would start inside the note's text.
- **The names are computed**: `.relate((names) => ...)` indexed by `` `${t.name}Bar` `` works, but each term's (term, bar, note) triple is a record built by hand. A "bracket + note on a named node" idiom would remove most of the 66 lines.

## d3-annotation types: `img/d3a-grid.png`

One story (`D3 Annotation Types/Grid`) draws the same 10-point line chart 8 times. The shared pieces are `plot()` (dots named `pts` plus a line), `peak()` (`chart(selectAll("pts")).flow(filter(y === 9))`), `hidden(p)` (an invisible padded `enclose` that gives the target a box), and `note(title, body)` (a spread of two texts).

| d3 type         | GoFish composition                                                                                                      | How faithful / what is missing                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`         | note + `distribute` x + `align` y, no connector                                                                         | Good.                                                                                                                                                                                                                                                                       |
| `callout`       | note over a 1 px rule, `arrow` from the rule to the target                                                              | The rule's width is **hard-coded (44 px)**. `Constraint.align({ x: "span" }, [note, rule])` throws "needs an already-placed source" when the note is placed only by constraints. In a nested layer it throws "source has no resolved extent yet". The connector has a head. |
| `elbow`         | the same note, `line({ curve: Curve.orthogonal() }, [rule, target])`                                                    | `line` runs center to center. It starts at the middle of the underline and ends at the dot's center, not its edge (#975).                                                                                                                                                   |
| `curve`         | `arrow({ bow: 0.5 })`                                                                                                   | Good (the perfect-arrows bow). The head is always on.                                                                                                                                                                                                                       |
| `calloutCircle` | `enclose({ shape: Shape.oval(), padding: 7 })` + arrow                                                                  | Good. The arrow lands on the circle's box, which is close enough for a small circle.                                                                                                                                                                                        |
| `calloutRect`   | `enclose` (box) over a `filter`ed x range + arrow                                                                       | Good. The region is chosen by a data test, not drawn in data coordinates.                                                                                                                                                                                                   |
| `xyThreshold`   | `rect({ y: datum(8), h: 1 })` + `.label(() => "threshold 8", { position: "inset-top-end" })`                            | Good. A dashed rule is not possible: a rect has no dash, and a `line` would need two anchor points.                                                                                                                                                                         |
| `badge`         | `layer([circle, text])` centered by `align`, put at the target's top-left corner by two `distribute`s with zero spacing | Good. The badge needs its own nested `.relate()` to center the letter.                                                                                                                                                                                                      |

## Missing features hit, with issue numbers

1. **#975: connectors end on the bounding box, not the outline.** It broke ex4 (the arrow points at empty space), forced the stand-in member, and makes `line` elbows end at centers.
2. **#521: `.label()` has no leader to its mark and no offset placement.** Every callout leaves `.label()` for a `layer` + `.relate()` with two distributes, built by hand. The `Place` family is closed, so a helper cannot add `Place.offset`.
3. **#796: no extremum selector.** Users write `derive(xs => [maxBy(xs, x => project(x, f))])`. `argmax` or `top` as a flow step is a three-line helper.
4. **A note cannot read the selected datum** (no issue found; related to #1053/#1054 on pixel offsets). Note text is computed outside the chart, because a note bound to data sits on its datum, and `offset` only moves the drawing.
5. **#641: emphasis spans the chart and the mark.** One idea lands in the palette, the z order and the label. A helper cuts the repetition but still needs two touch points.
6. **No headless `arrow` and no dashed rule.** A plain leader between boxes is only possible as an `arrow` (head always on) or a center-to-center `line`.
7. **Free notes do not avoid each other** (ex5). Collision avoidance works only inside one `.label()` call.
8. **`Constraint.align({ x: "span" })` needs a source that is already placed** (the d3 callout underline). A note placed only by constraints cannot size its underline.
9. **`datum()` on a time axis needs epoch ms.** `datum("2015-06-01")` is concatenated into a string, and the render then throws. `band` hides this.
10. **An annotation tier's field joins the axis title** ("temp, mean" for the in-chart mean rule).
11. **#802 / #1203: naming.** A callout needs its target and its note to be names in one `.relate()`. That works across nested charts. But a fresh mark in a drawing clause cannot be a constraint operand, so the note must be a plain child of a wrapper `layer`.
