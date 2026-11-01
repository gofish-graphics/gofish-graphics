# Annotations in GoFish: selection, subject, label

**Summary.** "Annotate" is not one primitive. Every annotation in the literature is a
target plus some of three parts: a subject drawn on the target, a note, and a connector
between them. GoFish already has a construct for each part except the connector, so the
proposal adds no `annotate` or `callout` operator. It adds one label option, one data step,
a way to select parts of a mark (spans of text, stretches of a line), one `Shape` member,
and a few fixes, and it moves color emphasis into its own design.

**Status (round 2, 2026-11-01).** Josh approved C overall. This round adds `part` / `parts`
for selecting spans of a text without tokenizing it (example 5), and bands now use the
existing `x` / `x2` edges (example 2).

**Round 5:** annotation styles table and key labels.

**Round 6:** where the key goes (five options, six renders), and a `label(...)` mark as
sugar for `blank().label(...)`.

**Recommendation (Approach C).** Write an annotation as a **selection**, a **subject mark**
over it, and a **`.label()`** on that mark. The label is the note. A new `leader` option on
`.label()` draws the connector. A new `topK` flow step selects extremes, and `ref(x).part(sel)` / `.parts(sel)` select
parts of a mark. Color highlights
are not annotations in this sense, because they restyle marks the annotation does not own.
They stay a separate construct (#641).

```js
.layer(
  chart(selectAll("months"))
    .flow(topK(1, { by: "price" }))                                  // selection
    .mark(
      enclose({ shape: Shape.oval(), padding: 6, fill: "none", stroke: RED })  // subject
        .label((d) => `Peak: $${project(d, "price")}`, {             // note
          position: Place.around({ directions: ["nw"], offset: 40 }),
          leader: { stroke: RED },                                   // connector (new)
        }),
    ),
)
```

Pictures for every example are in `img/`. The live review page is the published artifact.
Prior work is in `research/prior-work.md`, and the prototype renders and their exact code
are in `prototype-notes.md`.

---

## Terms

- **Annotation**: ink added to a visualization to point out part of it, as opposed to the
  ink that encodes the data.
- **Target**: what an annotation is about. It can be a set of marks (one point, a group, a
  series), a position in data space (y = 50, the summer of 2015), or another annotation.
- **Subject**: ink drawn on or around the target: a circle around a point, a box around a
  region, a blob around a group, a rule at a value. The word is d3-annotation's.
- **Note**: the text of the annotation.
- **Connector**: the line from the note to the subject or target.
- **Leader** (or leader line): a connector from a label to the thing it labels. It is the
  cartography and drafting term. ggrepel calls it a segment, matplotlib calls it `arrowprops`.
- **Emphasis**: making some marks stand out by restyling them and the others (color, gray
  out, paint order). gghighlight and ChartMark treat it as a predicate that splits the marks
  into "selected" and "other".

## What the notes asked, and the answers

| Question from the notes                                   | Answer                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is `annotate` a primitive?                                | No. It is a set of constructs with one shared interface, like the graphical operators. The label design already rejected a separate `annotate()` ([API Design](../../apps/docs/docs/internals/design/api-design.md), "One concept is one operator").                                                                          |
| Are layouts, arrows and enclosures already expressible?   | Yes, all eight d3-annotation types render with today's primitives (see the grid). The cost is verbosity: a callout needs an outer `layer`, two `Constraint.distribute` calls and an `arrow`.                                                                                                                                  |
| Do we need sugar like `.label()` and `.emphasize()`?      | Yes, but small: one `leader` option and one data step, sitting on existing constructs. No new top-level construct for callouts.                                                                                                                                                                                               |
| How do we balance brevity, readability and customization? | Brevity comes from `.label()`'s automatic placement and avoidance. Customization comes from each part being an ordinary mark the user can swap. The data link holds because the target is a selection, not a pixel position. Practitioners asked for exactly this mix (Rahman et al., _Designing Annotations_, EuroVis 2026). |
| Where do color highlights fit?                            | Outside this design, in #641. Emphasis restyles marks the annotation does not own and reshapes a shared color scale.                                                                                                                                                                                                          |

## Prior work

The full survey is `research/prior-work.md`. What matters for the design:

- **The same decomposition shows up everywhere.** d3-annotation's named types (`callout`,
  `elbow`, `curve`, `calloutCircle`, `calloutRect`, `xyThreshold`, `badge`) are presets over
  three parts: subject, connector, note. AnnoGram (VIS 2025) has a target with optional
  `text`, `enclosure`, `connector` and `indicator` slots. matplotlib's `annotate(text, xy,
xytext, arrowprops)` and Bluefish's `Ref` + `Arrow` + `Align` split it the same way.
- **The type and the target are independent axes** in every taxonomy. Rahman et al.'s
  taxonomy (1,888 charts) has 7 types: text 76%, enclosure 31%, connector 21%, indicator
  20%, glyph 14%, color 14%, geometric 3%. ChartAccent's target kinds (a data item by
  predicate, a coordinate, a chart element, another annotation) are reused by AnnoGram and
  ChartMark.
- **Targets should be rules, not positions.** ChartAccent participants liked targets that
  are "semantic based", that follow the data when it changes. Nine of ten practitioners in
  _Designing Annotations_ finish their annotations in PowerPoint or Figma and lose the data
  link. They want automatic placement they can override without losing the binding.
- **Emphasis is a different kind of thing.** gghighlight, ChartMark
  (`"opacity": {"selected": 1, "other": 0.5}`) and Vega-Lite conditions all restyle the
  marks outside the target.
- **The math side follows the same shape.** Head et al.'s Math Augmentation (CHI 2022)
  recommends keeping the augmentation apart from the formula. Its follow-up FFL (UIST 2023)
  is CSS-like: `selector { color; label; label-marker: extent }`. Delta (UIST 2026) keys
  labels by subexpression. TikZ uses `pin` for a note with a leader and `fit` for an
  enclosure.
- **Nobody has tested authoring.** AnnoGram's evaluation counts lines of code. ChartMark has
  no evaluation. So brevity is the only measured property, and it is a weak guide on its
  own.

## Examples

Five hard examples, each rendered with today's primitives (Approach A). The prototype
stories are in `packages/gofish-graphics/stories/_proposals/annotations/`.

1. **Peak callout** (`ex1-peak-a.png`): a circle around a line's maximum, a note, a leader.
2. **Rule and band** (`ex2-rule-band-a.png`): the mean as a labeled rule and summer 2015
   as a labeled band.
3. **Highlight one series** (`ex3-highlight-a.png`): AAPL in red on top, the others gray,
   an end label on AAPL only.
4. **Group enclosure and note** (`ex4-enclosure-a.png`): a blob around Sub-Saharan Africa
   with a note and an arrow. The arrow ends in empty space because it aims at the blob's
   bounding box (#975).
5. **Math augmentation** (`ex5-math-a.png`): `Var(X) = E[(X − μ)²]` with three colored
   terms, each with a bar, a note and a leader. The notes overlapped until their depths were
   staggered by hand.

Plus the **d3-annotation type grid** (`d3a-grid.png`): all eight types by composition.

## Annotation styles

The same GOOG chart, annotated ten ways. Each style is set by what links the note to its
target. The renders use today's primitives
(`stories/_proposals/annotations/AnnotationStyles.stories.tsx`). The C spelling is written
as a tier on the base chart. Line counts are for today's spec, with the base chart and small
shared helpers (the badge, the key) not counted.

| #   | Style                      | Link                 | Render                        | C spelling (proposed)                                                                                             | Today needs                                                                              | Lines |
| --- | -------------------------- | -------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| 1   | Proximity label            | closeness            | `img/styles/1-proximity.png`  | `topK(1, …)` tier, `.mark(label(d => …, { position: Place.around({ directions: ["left"] }) }))`                   | A `.label()` on an invisible `enclose`. Works today; the label reads the row.            | 11    |
| 2   | Leader label               | line                 | `img/styles/2-leader.png`     | `label(…, { position: Place.around({ directions: ["top-left"], offset: 36 }), leader: {} })`                      | A free `text`, two `distribute`s, an `arrow` (always has a head). Text computed outside. | 14    |
| 3   | Subject + leader (callout) | containment + line   | `img/styles/3-callout.png`    | `enclose({ shape: Shape.oval() }).label(d => …, { position, leader: {} })`                                        | Example 1: the same plus an oval `enclose`.                                              | 16    |
| 4   | Key label                  | shared symbol        | `img/styles/4-key.png`        | `enclose({ shape: Shape.oval() }).label("Peak before the 2008 crash", { key: {} })`                               | A hand-built badge per target, a key `spread`, six constraints in an outer `layer`.      | 20    |
| 5   | Key + leader               | shared symbol + line | `img/styles/5-key-leader.png` | `.label("…", { position: Place.around({ offset: 26 }), key: {}, leader: {} })`                                    | As row 4, with each badge a little way off and an `arrow` to its circle.                 | 22    |
| 6   | Region enclosure + label   | containment          | `img/styles/6-region.png`     | `filter(inFall)` tier, `enclose({ shape: Shape.box() }).label(() => "the 2008 fall", { position: "outset-top" })` | Works today.                                                                             | 18    |
| 7   | Reference rule             | position on an axis  | `img/styles/7-rule.png`       | `rect({ y: datum(mean), h: 1 }).label(() => \`mean $${mean}\`, { position: "outset-right" })`                     | Works today.                                                                             | 8     |
| 8   | Band                       | position on an axis  | `img/styles/8-band.png`       | `rect({ x: datum("2007-11-01"), x2: datum("2009-03-01") }).label(() => "recession", { position: "outset-top" })`  | Works today, but `datum` needs epoch milliseconds on a time axis.                        | 13    |
| 9   | Emphasis of a stretch      | color                | `img/styles/9-emphasis.png`   | `chart(ref("price").part({ x: [datum(a), datum(b)] })).mark(line({ stroke: RED }))`                               | A second red `line` over filtered months on a gray base; cut at the nearest months.      | 7     |
| 10  | Badge only                 | symbol, no note      | `img/styles/10-badge.png`     | `.mark(label("A", { background: { shape: Shape.oval(), fill: RED }, color: "white" }))`                           | A hand-built circle and letter, placed by two `distribute`s.                             | 9     |

Rows 1, 2 and 10 use the `label(...)` mark, which labels the selection with no `blank()`
stand-in (decisions 5 and 19). Rows 4 and 5 use the new `key` option (see "Key labels" and
"Where the key goes" under Approach C). Row 9 colors a line part (decision 12).

## Approaches

### A. Idioms only

Change nothing in the API. Write a how-to page (#1109, the annotation tutorial) and fix
the bugs the examples hit.

```js
// Peak callout, today: 39 lines
layer([
  chart(goog, { w: 560, h: 300 })
    .flow(scatter({ by: "date", x: "date", y: "price" }))
    .mark(blank().name("months"))
    .layer(line({ stroke: BLUE, strokeWidth: 2 }))
    .layer(
      chart(selectAll("months"))
        .flow(derive((ms) => [maxBy(ms, (m) => project(m, "price"))]))
        .mark(
          enclose({
            shape: Shape.oval(),
            padding: 6,
            fill: "none",
            stroke: RED,
          }).name("peak")
        )
    ),
  spread({ dir: "y", spacing: 2, alignment: "start" }, [
    text({ text: "Peak", fontWeight: 700 }),
    text({ text: `$${peak.price} in ${monthYear(peak.date)}` }), // computed outside the chart
  ]).name("note"),
]).relate(({ peak, note }) => [
  Constraint.distribute({ dir: "x", spacing: 40 }, [note, peak]),
  Constraint.distribute({ dir: "y", spacing: 30 }, [peak, note]),
  arrow({ bow: 0, stretch: 0, strokeWidth: 1, stroke: RED }, [note, peak]),
]);
```

- **Composes**: fully. It is today's core.
- **Easy**: anything. Every part is an ordinary mark.
- **Awkward**: a callout needs an outer `layer`, two distributes and an `arrow`. The note
  cannot read the selected row, so its text is computed outside the chart. "Above" in a
  `distribute` follows the axis direction, so it flips between a chart and a top-down
  diagram. Free notes do not avoid each other (the math example).
- **New terms**: none.

### B. A bundled `callout` construct (the d3-annotation and AnnoGram model)

One relational mark that takes a selection and three parts. Prototyped as a helper that
expands into Approach A. The renders are byte-identical to A for examples 1 to 3.

```js
.layer(
  callout(chart(selectAll("months")).flow(argmax("price")), {
    note: ["Peak", "$707 in Nov 2007"],
    subject: Shape.oval(),
    connector: "straight",
    dx: -40,
    dy: 30,
  }),
)
```

- **Composes**: it is exactly the composition in A, so it can be defined by that rewrite.
- **Easy**: the common callout in 12 lines instead of 39.
- **Awkward**: it is a second way to put text next to a mark. `callout` and `.label()`
  cover much of the same ground by different routes. That is the "large partial overlap"
  [API Design](../../apps/docs/docs/internals/design/api-design.md) warns against, and the
  same split the label design already rejected. Its `subject` option re-lists `enclose`'s
  shapes, and every new subject kind (a bracket, a rule) has to be added twice. Its notes
  do not take part in label placement or avoidance unless it is rebuilt on `.label()`.
- **New terms**: `callout`, `subject`, `connector`, and a preset family if the d3 types
  are wanted by name.

### C. Selection + subject + label (recommended)

Each part of an annotation is an existing construct, and the parts compose the way the
graphical operators do:

| Part      | Construct                                                                                                | Status     |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| target    | `chart(selectAll(name)).flow(filter(...) / topK(...))` or `datum(...)` coordinates                       | `topK` new |
| subject   | any relational mark over the selection: `enclose({ shape: Shape.* })`, a `rect` rule or band, or nothing | exists     |
| note      | `.label(accessor, { position })` on the subject mark                                                     | exists     |
| connector | `.label(..., { leader })`                                                                                | new option |
| emphasis  | separate construct                                                                                       | #641       |

**Example 1, peak callout:**

```js
chart(goog, { w: 560, h: 300 })
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(blank().name("months"))
  .layer(line({ stroke: BLUE, strokeWidth: 2 }))
  .layer(
    chart(selectAll("months"))
      .flow(topK(1, { by: "price" }))
      .mark(
        enclose({
          shape: Shape.oval(),
          padding: 6,
          fill: "none",
          stroke: RED,
        }).label((d) => `Peak: $${project(d, "price")}`, {
          position: Place.around({ directions: ["nw"], offset: 40 }),
          leader: { stroke: RED },
        })
      )
  );
```

```python
(
    chart(goog, w=560, h=300)
    .flow(scatter(by="date", x="date", y="price"))
    .mark(blank().name("months"))
    .layer(line(stroke=BLUE, stroke_width=2))
    .layer(
        chart(select_all("months"))
        .flow(top_k(1, by="price"))
        .mark(
            enclose(shape=Shape.oval(), padding=6, fill="none", stroke=RED)
            # a field accessor: Python lambdas do not cross the bridge
            .label("price", position=Place.around(directions=["nw"], offset=40),
                   leader={"stroke": RED})
        )
    )
)
```

**Example 4, group enclosure and note:**

```js
.layer(
  chart(selectAll("countries"))
    .flow(filter((c) => project(c, "Region") === "Sub-Saharan Africa"))
    .mark(
      enclose({ shape: Shape.blob({ convexity: 0.1, neck: 0.6 }), padding: 6,
                fill: TEAL, fillOpacity: 0.3, stroke: TEAL })
        .label(() => "Sub-Saharan Africa: high fertility, short lives", {
          position: Place.around({ directions: ["e"], offset: 24 }),
          leader: { curve: Curve.natural() },
        }),
    ),
)
```

The leader ends on the blob's outline, at the point nearest the note. The label already
reads its target's outline (`Outline`, #1205), so this is the same query #975 needs for
arrows. Fixing it once fixes both.

**Key labels** (round 5, from Josh's question: "How would we do the symbol label with the
description outside the chart? Like A with a circle around it next to a feature, then A
with a circle around it outside the chart with the text.")

A note links to its target in one of three ways:

- **Proximity label**: the text sits next to the target. The link is closeness.
- **Leader label**: the text sits a little way off. The link is a line.
- **Key label**: a marker sits next to the target, and the text sits in a key outside the
  plot. The link is a shared symbol.

Precedent: the practitioners in Rahman et al., _Designing Annotations_ (EuroVis 2026), name
a numbered key as their third choice when notes do not fit by the data. Footnotes in
typography work the same way.

Proposed spelling: a `key` option on `.label()`, orthogonal to `leader`.

```js
enclose({ shape: Shape.oval(), stroke: RED, fill: "none" }).label(
  "Peak before the 2008 crash",
  {
    position: Place.around({ directions: ["left"] }),
    key: {}, // auto marker A, B, C… in reading order
    // key: { marker: "A" }  // or give the symbol
  }
);
```

In Python it is `key={}`. It elaborates into two things:

- **The badge**: a label whose text is the marker, with
  `background: { shape: Shape.oval() }`. That is a small extension: `background` takes a
  `Shape`.
- **The key entry**: a copy of the badge and the note text, as chart chrome like a legend.
  Under #1257 that chrome is a plain child of the chart layer.

`key` and `leader` compose. With both, the badge sits a little way off with a line to the
target.

The prototype has two keyed notes, A on the 2007 peak and B on the 2009 trough
(`img/styles/4-key.png`, and with leaders `img/styles/5-key-leader.png`). Today it takes a
hand-built badge per target (a circle and a letter centered by a nested `.relate()`), a key
`spread` of rows, and an outer `layer` with six constraints: 20 lines plus about 20 lines
of helpers. The badge letters and the key rows are typed twice and can drift apart.
Decisions 15 to 18.

#### A `label(...)` mark (round 6)

Josh asked: "is there a way to have some syntax sugar for blank().label() where maybe you
could just pass label() directly?"

Yes. `label(text, opts)` is a relational mark, like `enclose` and `line`. In a selection
tier it labels the selected marks themselves, so there is no `blank()` stand-in.

```js
.layer(
  chart(selectAll("months"))
    .flow(topK(1, { by: "price" }))
    .mark(
      label((d) => `Peak $${project(d, "price")}`, {
        position: Place.around(),
        leader: {},
      }),
    ),
)

// combinator form: label one node or part
label("variance", { position: Place.around({ directions: ["top"] }) }, [
  ref("eq").part("Var(X)"),
]);
```

Python: `label("Peak", position=Place.around(), leader={})`.

- **It answers decision 5** (a note with no subject). The note labels the selection.
- **It follows an existing rule.** Relational-mark fusion already rewrites `.mark(R)` into
  `.mark(blank()).layer(R)`. With `R = label(...)` that is exactly today's
  `blank().label(...)` idiom.
- **The method becomes a rewrite.** `m.label(t, o)` is `label(t, o)` applied to `m`'s own
  nodes. API Design allows an operator that is exactly a composition of others ("Overlap
  is fine at the edges"), so the two forms cannot drift apart.
- **One word, two forms.** `enclose` already has a flow-step form and a mark form. `label`
  is not a top-level export today, so the name is free.
- **Labels become nameable.** `label(...).name("notes")` names the label nodes, which the
  key options below need. The `.label()` method names nothing new: `.name()` after it
  still names the mark.

Rows 1, 2 and 10 of the styles table now use it. Decision 19.

#### Where the key goes (round 6)

Josh asked: "I want to see more options for the key label, because I don't know if we want
to hardcode placement of the key description or not. I could see the answer being yes,
have an implicit default like the legend, or no, have it be more freeform and placeable
anywhere via some kind of constraint/relation/operator that uses the same object or
similar attribute as the relationship."

**How the legend works today.** `legendRing` (`legends/elaborate.tsx`) builds the color
legend from the root's color scale, once per render. It is a `spread` of rows (a swatch
and a text), placed by one `distribute` in x past the chart and one `align` to the top. The
only option is `legend: false`. There is no way to move it. Under #1257 the legend becomes a
plain child of the chart's outermost layer, with the same two constraints, but the design
does not say how a user changes them. Its recommendation for `in:` is the direction to
follow here: "chrome is elaboration into what a user could write".

**The shared base.** All options keep the same notes. `oval()` is
`enclose({ shape: Shape.oval(), stroke: RED, fill: "none" })`.

```js
const goog = chart(prices, { schema: { date: Unit.time() }, w: 360, h: 200 })
  .flow(scatter({ by: "date", x: "date", y: "price" }))
  .mark(blank().name("months"))
  .layer(line({ stroke: BLUE }).name("price"))
  .layer(
    chart(selectAll("months"))
      .flow(topK(1, { by: "price" }))
      .mark(oval().label("Peak before the 2008 crash", { key: {} }))
  )
  .layer(
    chart(selectAll("months"))
      .flow(filter(after2008), bottomK(1, { by: "price" }))
      .mark(oval().label("Low after the crash", { key: {} }))
  );
```

**Option 1. An implicit chrome key.** The key is its own piece of chrome, beside the legend,
with a side enum.

```js
goog.render(el, { axes: true, key: { position: "bottom" } }); // "right" by default
```

Default: yes. Freeform: no. Each new place (inside the plot, at each badge's height) needs a
new enum value. It overlaps the legend in the middle: a second chrome block with its own
placement code, and a `position` the legend does not have.

**Option 2. The key is the legend of a marker channel.** The markers A, B, C are the values
of a channel with an ordinal scale. `key: {}` puts the note's text in that channel, and the
scale gives it a marker, the way a color scale gives a category a color. The range is a
strategy family, `Marker.letters()` (default) or `Marker.numbers()`, set like
`Color.palette()`. The key is that channel's legend, so it goes where legends go.

```js
chart(prices, { marker: Marker.numbers(), ... })     // 1, 2, 3 instead of A, B, C
goog.render(el, { axes: true });                     // the key sits where the legend sits
goog.render(el, { axes: true, legend: { side: "bottom" } }); // proposed: move every legend
```

Default: yes, the legend's. Freeform: only by turning the default off and writing the key
(option 3). Shared across charts: yes. Like color, there is one marker scale per render, so
two panels share one key, and the same note text in two panels gets one marker.

**Option 3. The key is a chart over the selected notes.** The labels are named, and the
key is an ordinary chart over them, placed by any operator or constraint. The link is the
same object: each key entry is drawn from the label node it lists.

```js
const notes = (sel, text) =>
  chart(selectAll("months"))
    .flow(...sel)
    .mark(oval())
    .layer(label(text, { key: {} }).name("notes"));

const key = chart(selectAll("notes"))
  .flow(spread({ by: "marker", dir: "y", spacing: 8, alignment: "start" }))
  .mark(keyEntry()) // the marker, then the note's text
  .name("key");

layer([goog, key])
  .relate(({ price, key }) => [
    Constraint.align({ x: "middle", y: "start" }, [price, key]),
  ])
  .render(el, { axes: true, legend: false });
```

A label node carries its `marker` and its `text`. `spread({ by: "marker" })` gives one
entry per marker, and `keyEntry()` reads the first row of each, by the channel rule that
raw content reads the first row. So a note used twice is listed once. Default: none by
itself. Freeform: yes.

**Option 4. The notes are a data table.** The notes are rows. One tier draws a badge on
each note's target with `resolve`, and the key is a chart over the same rows
(`LabeledChart.stories.tsx` does this for node labels).

```js
const notes = [
  { id: "A", date: "2007-11-01", text: "Peak before the 2008 crash" },
  { id: "B", date: "2008-11-01", text: "Low after the crash" },
];
goog
  .layer(
    chart(notes)
      .flow(resolve(["date"], { from: selectAll("months") }))
      .mark(
        label((d) => d.id, {
          background: { shape: Shape.oval(), fill: RED },
          color: "white",
        })
      )
  )
  .layer(
    chart(notes)
      .flow(spread({ dir: "y", spacing: 8 }))
      .mark(keyEntry())
      .name("key")
  );
```

Default: none. Freeform: yes. No new terms beyond `keyEntry()`. But the targets are typed
by date, so they no longer follow the data (`topK` is gone), and the markers are typed by
hand.

**Option 5. A relation between each badge and its entry.** Not a block placement: each
entry is placed by a constraint against its own badge, like an end label. Render d puts
each entry at its badge's height, past the plot.

```js
layer([
  goog,
  chart(selectAll("notes")).mark(keyEntry().name("entries")),
]).relate(({ price, notes, entries }) => [
  Constraint.distribute({ dir: "x", spacing: 24 }, [price, entries]),
  Constraint.align({ y: "middle" }, [notes, entries]), // pairs row by row (proposed)
]);
```

This is option 3 with a different placement, so it adds no new key construct. It adds one
question: may a constraint take two plural selections of the same rows and apply pairwise?
Today it is a `map` over the pairs.

**How the options compose.** Option 2 elaborates into option 3. The default key is exactly
the option 3 chart over all keyed labels, `spread({ by: "marker", dir: "y" })` of
`keyEntry()`, placed as chrome by the legend's two constraints. So "default" and
"freeform" are one mechanism, the way #1257 makes axes "elaboration into what a user could
write". Option 5 is a placement of option 3. Option 4 is option 3 with the notes in a table
instead of on the labels. Option 1 is the only one that adds a second path.

| Option              | Default place?          | Freeform?                       | Shared across charts?                          | New terms                                    | Desugars into                                         | Overlap with existing                                     |
| ------------------- | ----------------------- | ------------------------------- | ---------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| 1 Chrome key        | yes, side enum          | no                              | only if root-owned like the legend             | `key`, `key.position`                        | a chrome block beside the legend                      | large and partial: a second legend with its own placement |
| 2 Marker legend     | yes, the legend's place | by turning it off and writing 3 | yes: one marker scale per render, notes dedupe | `key`, `Marker` family, `legend: { side }`   | marker scale + the legend's rows = option 3 as chrome | none: it is the legend                                    |
| 3 Chart over notes  | no                      | yes: any operator or constraint | yes: `selectAll` reaches every panel           | `keyEntry()`; label `marker` / `text` fields | `spread` of `keyEntry()` over selected labels         | reuses `selectAll`, `spread`, constraints                 |
| 4 Notes table       | no                      | yes                             | yes: one table                                 | `keyEntry()`                                 | `resolve` + `label` mark, `spread` over the table     | the `LabeledChart` idiom; loses the data link (`topK`)    |
| 5 Pairwise relation | no                      | per entry                       | yes, as 3                                      | pairwise constraint operands (or a `map`)    | one `align` per badge and entry                       | end labels                                                |

**Renders.** The same GOOG chart and notes, built with today's primitives
(`KeyLabelOptions.stories.tsx`, title `Proposals/Annotations/Key Options`). Today's line
counts are for the spec, not counting the shared annotated chart (13 lines: the two ovals,
two badges and their four constraints) or the badge and key helpers (about 20 lines).

| Render                                     | Today | Opt 1                         | Opt 2                                   | Opt 3 / 4                                        | Opt 5                |
| ------------------------------------------ | ----- | ----------------------------- | --------------------------------------- | ------------------------------------------------ | -------------------- |
| a. right (`img/key/a-right.png`)           | 7     | default                       | default                                 | `distribute` x + `align` top (4 lines)           | -                    |
| b. below (`img/key/b-below.png`)           | 9     | `key: { position: "bottom" }` | `legend: { side: "bottom" }`            | `distribute` y + `align` start (4 lines)         | -                    |
| c. inside (`img/key/c-inside.png`)         | 8     | not expressible               | via 3                                   | one `align` (3 lines)                            | -                    |
| d. at each badge (`img/key/d-aligned.png`) | 13    | not expressible               | via 5                                   | one `align` per note                             | one pairwise `align` |
| e. two panels (`img/key/e-shared-key.png`) | 33    | one key if root-owned         | automatic; C once                       | one `selectAll` over both panels; C once by `by` | as 3                 |
| f. formula (`img/key/f-formula.png`)       | 24    | `key: { position: "bottom" }` | `marker: Marker.numbers()`, side bottom | `distribute` y below the formula                 | -                    |

Render c was meant for the top-left corner, but the A row runs into the peak there, so it
uses the empty space under the line, bottom center. Placing a block in "the empty space" is
not something `Place` does today: `Place` places one label at a time.

The recommended spellings, under the renders:

```js
// a. the default
goog.render(el, { axes: true });

// b. a footnote list
goog.render(el, { axes: true, legend: { side: "bottom" } });

// c. inside the plot (option 3)
layer([goog, key])
  .relate(({ price, key }) => [
    Constraint.align({ x: "middle", y: "start" }, [price, key]),
  ])
  .render(el, { axes: true, legend: false });

// e. two panels, one key: same note text, same marker
spread({ dir: "x", spacing: 40 }, [
  panel(goog, "GOOG"),
  panel(aapl, "AAPL"),
]).render(el, { axes: true, legend: { side: "bottom" } });

// f. a formula with numbered terms
layer([
  text(EQ).name("eq"),
  label("variance: how far X spreads", { key: {} }, [ref("eq").part("Var(X)")]),
  label("expected value: the average over X", { key: {} }, [
    ref("eq").part(/E(?=\[)/),
  ]),
  label("squared distance from the mean μ", { key: {} }, [
    ref("eq").part(/\(X − μ\)²/),
  ]),
]).render(el, { marker: Marker.numbers(), legend: { side: "bottom" } });
```

```python
# c in Python
key = (
    chart(select_all("notes"))
    .flow(spread(by="marker", dir="y", spacing=8, alignment="start"))
    .mark(key_entry())
    .name("key")
)
layer([goog, key]).relate(
    lambda price, key: [Constraint.align([price, key], x="middle", y="start")]
).render(axes=True, legend=False)

# f in Python
layer([...]).render(marker=Marker.numbers(), legend={"side": "bottom"})
```

**Precedent.** Legends: Vega-Lite's `legend.orient` ("right", "bottom", and inside corners
such as "top-left"), ggplot2's `legend.position` (a side, or a point inside the plot),
matplotlib's `legend(loc=...)`. Observable Plot's `plot.legend("color")` returns the legend
as its own element that the page places, which is option 3. Markers: LaTeX footnote
counters (`\alph`, `\arabic`, `\fnsymbol`) and Typst's `numbering("a")` / `numbering("1")`.

**Recommendation: option 2, defined as option 3 placed as chrome.**

- **One mechanism for default and freeform.** The default key is a chart the user could
  write. To move it, turn it off and write that chart. This is #1257's direction ("chrome
  is elaboration into what a user could write").
- **One concept is one operator** (API Design). A key of markers is a legend of a channel.
  Making it a second chrome block (option 1) is a large partial overlap with the legend.
- **The hard case falls out.** Two panels share one key with no new rule, because the
  marker scale is per render, like color. A note used twice gets one marker because a scale
  maps equal values to one marker.
- **Channels are chosen by how they aggregate.** The marker is raw content, so a key entry
  over two labels with one marker reads the first, and lists the note once.
- **Strategy families.** `Marker.letters()` / `Marker.numbers()` follow the family rule
  (`Color.palette()`, `Tile.squarify()`).
- **Simple moves stay short.** `legend: { side }` covers the right and bottom cases, and it
  moves the color legend too, which it should.

**Runner-up: option 4, the notes table.** It needs no new construct except `keyEntry()`,
and the key is as free as option 3. What it loses: the targets are typed by date instead of
selected from the data, the markers are typed by hand, and there is no default. What would
change the pick: if notes in practice come from a table anyway (a CMS, a spreadsheet of
events), option 4 is the natural spelling, and it already works through `resolve`.

Decisions 20 to 27.

**Example 2, rule and band:** today's spelling with two fixes and no new marks. A band is a
`rect` with both edges given, `x` and `x2`, which rect already supports (the axis line is
drawn as `rect({ h: 1, x: datum(min), x2: datum(max) })`, and `x: "start", x2: "end"` is
tested on time columns). With no `h` it spans the plot.

```js
.layer(
  rect({ x: datum("2015-06-01"), x2: datum("2015-09-01"), fill: SAND, opacity: 0.3 })
    .label(() => "summer 2015", { position: "outset-top" }),
)
.layer(rect({ y: datum(mean), h: 1, fill: GRAY }).label(() => `mean ${mean}`, { position: "outset-right" }))
```

The fixes: `datum` reads its value through the axis's column type, so an ISO date works on
a time axis (today `datum` stores the raw value, so it needs epoch milliseconds). And a
tier's fields stay out of the axis title (today a mean rule renames the axis "temp, mean").
Known limit: an `align` on x in the same layer drops a box placed by a data span (#1245).
A `rule` or `band` mark name would save about one line per use (prototype B:
15 lines against 22, mostly the millisecond conversion), so the proposal does not add
them.

**Example 5, math: parts of a mark.** The formula is one `text` mark. A new ref method
selects parts of it by substring, regex or character range, so the formula is never cut
into tokens. The research note is `research/span-selection.md`.

```js
layer([
  text({ text: "Var(X) = E[(X − μ)²]", fontSize: 32 }).name("eq"),
  chart(
    ref("eq").parts({
      variance: "Var(X)",
      mean: /E(?=\[)/,
      deviation: "(X − μ)²",
    }),
    {
      color: Color.palette({ variance: RED, mean: BLUE, deviation: GREEN }),
    }
  )
    .flow(group({ by: "part" }))
    .mark(
      enclose({
        shape: Shape.bracket({ side: "bottom" }),
        stroke: "part",
      }).label(
        {
          variance: "how far X spreads",
          mean: "the average over X",
          deviation: "squared distance from the mean μ",
        },
        {
          // #804 record
          position: Place.around({ directions: ["s"], offset: 28 }),
          leader: {},
        }
      )
    ),
]);
```

```python
layer([
    text("Var(X) = E[(X − μ)²]", font_size=32).name("eq"),
    chart(ref("eq").parts(variance="Var(X)", mean=re.compile(r"E(?=\[)"),
                          deviation="(X − μ)²"),
          color=Color.palette(variance=RED, mean=BLUE, deviation=GREEN))
    .flow(group(by="part"))
    .mark(enclose(shape=Shape.bracket(side="bottom"), stroke="part")
          .label(NOTES, position=Place.around(directions=["s"], offset=28), leader={})),
])
```

- `ref(x).part(selector)` gives one part and throws unless exactly one matches.
  `ref(x).parts(selector)` gives a list of refs. This is the `ref` / `selectAll` singular
  and plural pair. Each part's datum is `{ part, match, start, end }`, so it flows as data
  like any selection.
- **It is not only for text.** A part is a stretch of something the mark already has.
  For text that is its characters. For a path it is a stretch of its length
  (`ref("route").part({ at: [0.2, 0.4] })`, `Place.along`'s words). For a line in data
  space it is a stretch of its data range (`ref("price").part({ x: [datum(a), datum(b)] })`).
  For a box it is a named outline edge (`ref("bar").part("y-max")`, the names from #1205).
- **Name.** "part" follows CSS `::part` and the outline parts from the label work. "span"
  is taken: it already means an extent in `align({ x: "span" })`.
- **Precedent.** Systems either name parts when the text is written (CSS `::part`, SVG
  `tspan`, `\tikzmarknode`, KaTeX `\htmlId`, Typst labels) or find them later by a rule
  (Typst `show "E": ...`, FFL selectors, DOM Ranges). The second kind keeps the formula
  whole, which is the point here. And the selection must return geometry (tikzmark, Typst
  `pinit`, `Range.getClientRects()`), not only a style hook as the CSS Highlight API does,
  because underlines and leaders need a shape to point at.
- **Not picked:** named runs written into the text (Typst, `tspan`). That is still
  tokenizing by hand, and a line has no runs to name; it belongs with rich text (decision
  7). A `parts()` flow step over `selectAll` is exactly `derive(refs => refs.flatMap(r =>
r.parts(sel)))`, so it adds a name without adding power.
- **Subject.** The bar under each term is `Shape.bracket({ side })`, a new `Shape` member.
  FFL calls it `label-marker: extent`, and TikZ draws it as a brace decoration.

The prototype (`ex5-math-spans-mask.png`) measures each span with the text mark's own
measuring function and colors it with `mask`. The plural form is `ex5-math-spans-plural-x.png`
(both X's), and the line part is `ex5-math-spans-line-part.png` (GOOG's 2008 fall).
Its leaders still use the old idiom with hand-staggered depths, because `leader` is not
built.

**How `parts` relates to `partition` and `cut`** (round 3, from Josh's question).

|               | `partition`                   | `cut`                                         | `part` / `parts`                                                            |
| ------------- | ----------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| input         | data rows by a key            | one drawn shape                               | one drawn mark                                                              |
| space divided | an axis (data space)          | the shape's extent along one direction        | the mark's own parameter: characters, arc length, data range, outline edges |
| coverage      | total, disjoint (cells)       | total, disjoint (a tiling)                    | any subset, may overlap                                                     |
| returns       | groups, placed in their cells | new ink (masked copies), placed by the parent | refs: no ink, nothing moves                                                 |

Discrete versus continuous does not separate them. Coverage does, and it is the cell versus
region refinement from #48: a cell is a region with the no-overlap and cover guarantee.
`partition` and `cut` need cells, and `parts` needs only regions. The larger difference is
the operand kind (#707): `partition` arranges fresh children, `cut` makes fresh ink, and
`parts` returns refs. So they stay three operations, and what they share is the selector:

- `parts` also takes a cell system, as in
  `ref("price").parts({ x: field("date").bin(Calendar.year) })`: a cover of the line, one
  stretch per year.
- `cut(src, opts)` is exactly `ref(src).parts(cover)` with each part made into
  `mask(region, copy of src)`, which is what a slice is today. It can be defined by that
  rewrite when #404's syntax is revisited, and its `size` weights become one more cell
  system along a direction.
- `partition` is unchanged. It divides an axis and places data.

Not prototyped. The cheap test is one line colored by yearly parts.

**How `parts` relates to anchors** (round 4; the stacked-ribbons proposal, #47, branch
`worktree-stacked-ribbons-proposal`, not signed off). There,
`.anchor({ name, position: "x-max", slots: data(...).flow(stack(...)) })` declares a named
region on a boundary part and lays out slots along it, and ribbons attach by anchor name.
Anchors and parts both name a region of a mark's own geometry, with the same part names.
They differ in where the region comes from:

- **built-in** parts exist already: outline edges (`x-max`, `r-min`), a path's `at` range,
  the label `Place` positions;
- **declared** parts are anchors: an anchor's `position` is a part selector, and its slots
  are a partition of that part into cells by a flow;
- **found** parts come from `parts(selector)`: substring, regex, data interval, cell system.

So "a part of a mark" is one concept with three sources, and it should have one reference
spelling. Today the anchors proposal writes a path step (`nodes.out`) and this proposal
writes `ref(x).part(sel)`. One option: `.part(name)` looks up built-in and declared parts by
name, and patterns are explicit selectors (a regex, `{ text: "E" }`, `{ x: [a, b] }`), so an
anchor named "E" and the substring "E" cannot collide. The anchors proposal's arrow rule (end
at an anchor point, clip to the outline on the connection) is also the rule for `leader` and
the #975 fix, so the three should be built once.

**d3-annotation types in C:**

| d3 type       | C spelling                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------- |
| label         | `.label(text, { position })`                                                                   |
| callout       | `.label(text, { position, leader: {} })` (the d3 underline is a style question, see decisions) |
| elbow         | `leader: { curve: Curve.step() }`                                                              |
| curve         | `leader: { curve: Curve.natural() }`                                                           |
| calloutCircle | `enclose({ shape: Shape.oval() }).label(..., { leader })`                                      |
| calloutRect   | `enclose({ shape: Shape.box() }).label(..., { leader })`                                       |
| xyThreshold   | `rect({ y: datum(v), h: 1 }).label(...)`                                                       |
| badge         | `.label("A", { position: Place.around(), background: { ... } })`                               |

- **Composes**: everything stays the same graph of marks and refs. `leader` elaborates into
  a `line` in the label tier from the label's box to the target's outline, so the core
  gains no node kind ([Principles](../../apps/docs/docs/internals/design/principles.md),
  "Why keep the core small"). Under a coordinate transform it inherits `.label()`'s rules:
  Cartesian now, polar with #1201. Animation follows from labels being attached to their
  marks (#1206).
- **Overlap check**:
  - `leader` against `arrow`: a small shared case. An arrow from a label to its target is a
    leader with a head. Both are built on one outline-clipped line (#975), so they cannot
    drift apart.
  - `topK` against `filter` + `derive`: an exact composition (sort by the key, take the
    first k). It is defined by that rewrite.
  - Annotation subjects against `enclose`: identical. The subject _is_ an `enclose`.
- **Easy**: callouts in about 12 lines. Notes read the selected rows, because a label reads
  its mark's data. Notes avoid each other and the data. Every part is swappable.
- **Awkward**: a note with no subject needs something to hang the label on (decision 5).
  Notes with a bold title over a body need rich text in `text` (decision 7). Placement is
  directional (`nw`, 40 px) rather than an exact pixel offset (decision 3).
- **New terms**: `leader`, `topK`, `part` / `parts` on refs, and `Shape.bracket`.
- **Cost to extend**: a new subject is a new `Shape` member or any relational mark. A new
  connector route is a `Curve` member. A custom placement is a `Place` strategy (#1101).

### D. Target-first effect lists (AnnoGram, ChartMark, FFL)

One target with a list of effects, in the style of CSS:

```js
annotate(chart(selectAll("months")).flow(topK(1, { by: "price" })), [
  enclose({ shape: Shape.oval() }),
  note("Peak", { position: Place.around({ directions: ["nw"] }), leader: {} }),
  emphasize(["color"]),
]);
```

This is sketch syntax only, not rendered. GoFish already writes "one target, several
effects" as a `.layer(chart(selection)...)` tier with a mark and its modifiers, so
`annotate` would be a second spelling of `.layer`. It is also the `operator()`-with-options
shape that bundles separate constructs under one name. The one thing it adds is emphasis
in the same list, and emphasis needs to reach the color scale, which a tier cannot do.
Rejected, but recorded because it is the dominant model in the recent grammars.

## Recommendation

Choose C.

- **It desugars into the existing core.** `leader` is a `line` in the label tier, and
  `topK` is sort and take. No new node kinds
  ([Principles](../../apps/docs/docs/internals/design/principles.md), "Why keep the core small").
- **One concept is one operator.** The note stays `.label()`, so there is no second text
  placement path. The subject stays `enclose`, so there is no second shape list
  ([API Design](../../apps/docs/docs/internals/design/api-design.md)).
- **Few new terms, with precedent.** "Leader" is the drafting and cartography word.
  `topK` is polars' `top_k`, which is the first precedent for data transforms in API
  Design. dplyr's `slice_max` is the alternative.
- **The data link holds.** Targets are selections, which follow the data. This is the
  property ChartAccent's and Rahman's study participants asked for.
- **Customization keeps the existing families.** Subjects are `Shape` members, leader
  routes are `Curve` members, and placements are `Place` members, each with #1101 as the
  escape hatch.
- **Same shape in JS and Python.** `leader` is a dict like `halo` and `background`, and
  `top_k` is a flow step.

**Runner-up: B as sugar over C.** If real use shows that people write the same callout
setup again and again, a `callout` preset can be added later as an exact rewrite into C:
subject + label + leader. It should be built on `.label()`, not beside it as in the
prototype. What would change the pick: user tests where people cannot find
"enclose + label + leader" and look for a word like "annotate" or "callout". A how-to page
titled "Annotate a visualization" may cover that without a new name.

## Gaps found, independent of the approach

These hurt every approach, ranked by how much they hurt in the prototypes:

1. **#975**: arrows end on the bounding box, not the outline. This broke example 4 and
   put elbow ends at centers.
2. **#521**: there is no leader from a label to its target. That is what `leader` adds.
3. **A free note cannot read the selected row.** A `.label()` on a selection tier already can (round 5 found `project(d, "price")` works), so C fixes this by making the note a label.
4. **#641**: one emphasis is spelled three times (palette, `zOrder`, label test).
5. **#796**: there is no extremum selector. That is what `topK` adds.
6. `mask` reads its stencil's luminance, not its alpha, so a dark text stencil passes
   almost no color. `.label()` on a line drawn over a selection throws ("Place.end needs an
   open path").
7. `arrow` cannot drop its head, and has no chart or bag form.
8. Free notes do not avoid each other. C makes notes into labels, which do.
9. `datum("2015-06-01")` on a time axis throws. It should read through the column type.
10. A rule tier's field joins the axis title.
11. #802 / #1203: operators and bare tiers cannot be named, which forces wrapper layers.
    Round 6: a chart after `.layer()` cannot be named either (`.name is not a function`), so
    render b places its key off the line with a spacing tuned past the axis title.
12. The legend cannot be moved. The only option is `legend: false`, and #1257 does not say
    how a user changes the place of a chrome child.
13. Label nodes cannot be named or selected, so no chart can be built over them. The
    `label(...)` mark fixes this.
14. Nothing places a block in a plot's empty space. `Place` places one label at a time, so
    render c's key was placed by hand (the top-left corner was too narrow).

## Decisions for Josh

1. **Factoring.** Annotation = selection + subject mark + `.label()`, with no
   `annotate` or `callout` name (C)? Or a bundled `callout` (B) now?
2. **`leader` spelling and default.** `leader: {}` / `leader: { stroke, curve, head }`,
   off unless given? Or on automatically when a label lands more than some distance from
   its target, as ggrepel does?
3. **Far placement.** Is `Place.around({ directions, offset })` enough for callouts, or do
   callouts need an exact offset (`Place.at({ dx, dy })`, matplotlib's `xytext` in offset
   points)? Note that "up" must mean screen up, not the axis direction.
4. **Extremum step name.** `topK(k, { by })` and `bottomK` (polars), `sliceMax` (dplyr), or
   `argmax`?
5. **A note with no subject.** Label the original mark with a predicate (#804's value-keyed
   record, `.label({ AAPL: "..." })`), or label the selection itself with the `label(...)`
   mark (decision 19)?
6. **Rules and bands.** Keep them as `rect` + `datum` with `x` / `x2` (no new marks), with
   the two fixes (`datum` reads ISO dates through the column type; tier fields stay out of
   the axis title)?
7. **Rich notes.** A title line over a body line (d3-annotation's `title` + `label`). Is that
   a `text` feature (multi-line, spans) for a separate issue?
8. **Emphasis.** Leave it to #641, with this survey's input that emphasis is a predicate
   that styles both the selected marks and the others?
9. **Brackets.** Add `Shape.bracket({ side })` for underbraces in math and diagrams?
10. **Parts of a mark.** Is `ref(x).part(sel)` / `.parts(sel)` the right pair of names?
    Should `parts` take a record of named selectors, a list, or both?
11. **Part selectors.** Text takes a substring, a regex or a `[start, end]` range. Should a
    line's part take a data interval, a length fraction, or both? Is a text part's shape its
    line box or its glyph ink?
12. **Coloring a part.** `mask` (works today), a `fill` record on `text`, or emphasis (#641)?
13. **Shared selectors.** Should `parts` accept cell systems (`Bin`, `Calendar`, weights), and
    should `cut` later be redefined as `parts` plus `mask`?
14. **Parts and anchors.** One reference spelling for built-in, declared (anchor) and found
    parts: `.part(name)` for names with explicit pattern selectors, or the path step
    (`nodes.out`)? And design `parts` together with anchors (#47) rather than here?
15. **Key label name.** Keep `key` as the `.label()` option that puts a note in the marker
    channel, so the key is that channel's legend (decision 20)? Or `footnote`?
16. **Marker style.** Markers come from a scale (decision 22), with a given marker
    (`key: { marker: "A" }`) as the override?
17. **Where the key goes.** Replaced by decisions 20 to 27 (round 6).
18. **Badge shape.** Let a label's background take a shape,
    `background: { shape: Shape.oval() }`, for the badge?
19. **`label` mark.** Add `label(...)` as a relational mark, with `.label()` defined as its
    rewrite?
20. **Key as a legend.** Is the key the legend of a marker channel (option 2), with one
    marker scale per render like color?
21. **Default = freeform.** Is the default key defined as an option 3 chart over the keyed
    labels, placed as chrome, so that writing that chart is the override?
22. **Marker family.** `Marker.letters()` and `Marker.numbers()` (and `Marker.symbols()`),
    or a Typst-style pattern, `Marker.pattern("a")`?
23. **Marker order.** Declaration order (known before layout), or reading order (needs
    layout first)?
24. **Turning off one legend.** `legend: false` drops every legend. Do we need a per-channel
    switch, such as `legend: { marker: false }`?
25. **Legend side.** Add `legend: { side: "right" | "bottom" }` for the common moves?
26. **Key entry.** Export `keyEntry()` (the legend's row: marker, then text), or have users
    write the row?
27. **Pairwise constraints.** May a constraint take two plural selections of the same rows
    and apply pairwise (`align({ y: "middle" }, [notes, entries])`), or stay a `map`?

## Related issues

- #641 emphasize: one declaration drives color and paint order.
- #796 callouts anchored to data extremes.
- #521 landing page needs a tag with a leader line.
- #975 arrows should end on shape outlines (ray hit).
- #974 boundary query (shared geometry interface).
- #1109 annotation tutorial.
- #804 value-keyed `.label()` record.
- #802 operators cannot be named; #1203 bare tier `.name()` not registered.
- #803 lower `.label()` onto public `selectAll` / `resolve`.
- #1201 polar and curved labels; #1206 animated label stability; #1240 should `Place` labels take room.
- #405 old labels and annotation design notes (draft PR).
- #732 span-to-span connectors (the DFSCQ funnel).
- #1069 arrow, enclose and position not tagged for serialization.
- #1257 chrome as plain children of the chart layer (annotations would be plain children too).
- #1101 custom strategy extensibility.
