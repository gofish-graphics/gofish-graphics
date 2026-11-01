# Annotations in GoFish: selection, subject, label

**Summary.** "Annotate" is not one primitive. Every annotation in the literature is a
target plus some of three parts: a subject drawn on the target, a note, and a connector
between them. GoFish already has a construct for each part except the connector, so the
proposal adds no `annotate` or `callout` operator. It adds one option, one data step, and
four fixes, and it moves color emphasis into its own design.

**Recommendation (Approach C).** Write an annotation as a **selection**, a **subject mark**
over it, and a **`.label()`** on that mark. The label is the note. A new `leader` option on
`.label()` draws the connector. A new `topK` flow step selects extremes. Color highlights
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

**Example 2, rule and band:** today's spelling with two fixes and no new marks.

```js
.layer(
  rect({ x: datum("2015-06-01"), w: datum("2015-09-01"), fill: SAND, opacity: 0.3 })
    .label(() => "summer 2015", { position: "outset-top" }),
)
.layer(rect({ y: datum(mean), h: 1, fill: GRAY }).label(() => `mean ${mean}`, { position: "outset-right" }))
```

The fixes: `datum` reads its value through the axis's column type, so an ISO date works on
a time axis (today it needs epoch milliseconds and a width in milliseconds). And a tier's
fields stay out of the axis title (today a mean rule renames the axis "temp, mean"). The
`w: datum(end)` form above assumes an interval reading of `datum`, which is a decision
below. A `rule` or `band` mark name would save about one line per use (prototype B:
15 lines against 22, mostly the millisecond conversion), so the proposal does not add
them.

**Example 5, math:** each term gets a label with a leader. Because the notes are labels,
they avoid each other automatically, so no hand-staggered depths.

```js
tok("E", BLUE)
  .name("E")
  .label(() => "expected value: the average over X", {
    position: Place.around({ directions: ["s"], offset: 28 }),
    leader: {},
  });
```

The bar under each term is the one subject here that has no `Shape` member. It is an
underline the width of the term. FFL calls this `label-marker: extent`, and TikZ draws it
as a brace decoration. A future `Shape.bracket({ side })` would cover it. Until then it
stays a `rect` aligned to the term's span.

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
- **New terms**: `leader`, `topK`.
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
3. **A free note cannot read the selected row.** C fixes this by making the note a label.
4. **#641**: one emphasis is spelled three times (palette, `zOrder`, label test).
5. **#796**: there is no extremum selector. That is what `topK` adds.
6. `arrow` cannot drop its head, and has no chart or bag form.
7. Free notes do not avoid each other. C makes notes into labels, which do.
8. `datum("2015-06-01")` on a time axis throws. It should read through the column type.
9. A rule tier's field joins the axis title.
10. #802 / #1203: operators and bare tiers cannot be named, which forces wrapper layers.

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
   record, `.label({ AAPL: "..." })`), or allow `.label()` on a bare selection tier with no
   drawn subject?
6. **Rules and bands.** Keep them as `rect` + `datum` (no new marks), with the two fixes?
   Should `w: datum(end)` read as an interval end, so a band is `x: datum(a), w: datum(b)`?
7. **Rich notes.** A title line over a body line (d3-annotation's `title` + `label`). Is that
   a `text` feature (multi-line, spans) for a separate issue?
8. **Emphasis.** Leave it to #641, with this survey's input that emphasis is a predicate
   that styles both the selected marks and the others?
9. **Brackets.** Add `Shape.bracket({ side })` for underbraces in math and diagrams, now or
   when a second example needs it?

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
