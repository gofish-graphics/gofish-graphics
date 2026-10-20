# Stacked ribbons: anchors on a mark's boundary

The idea: a mark modifier lays out named ANCHOR SLOTS along a named part of
the mark's boundary. The slots are the result of an ordinary flow, run in the
1D coordinate along that part. Slots can be intervals (stacked or spread) or
points. Ribbons, lines and labels attach to slots by name. A ribbon is a 1-1
band between two slots, and its width at each end is the slot's size, so the
ribbon has no `size` channel.

```js
rect({ w: 12, h: "value" }).anchor(
  "out",
  { at: "right" },
  chart()
    .flow(stack())
    .mark(blank({ h: "value" }))
);
```

Stories: `packages/gofish-graphics/stories/_proposals/stacked-ribbons/Anchors.stories.tsx`
(titles `Proposals/Stacked Ribbons/Anchors/...`). The emulation helper is
`anchors.ts`. No library source was changed. The chord reuses the throwaway
`_proposalChordRibbon.ts`. Every picture was rendered with `capture-one` and
looked at.

| Example       | PNG                             | Rows | Ribbon finds its slots by         |
| ------------- | ------------------------------- | ---- | --------------------------------- |
| Energy sankey | `img/anchors-energy.png`        | S2   | name path `"source.out"`          |
| School days   | `img/anchors-school-days.png`   | S1   | the same rows                     |
| FrankenSankey | `img/anchors-frankensankey.png` | S1   | the same rows                     |
| Chord, gaps   | `img/anchors-chord.png`         | S1   | an explicit key `by: chordPair`   |
| Beatles       | `img/anchors-beatles.png`       | S2   | name path `"writer.credits"`      |
| Labels        | `img/anchors-labels.png`        | own  | the slot is a named part          |
| Sankey tree   | `img/anchors-sankey-tree.png`   | S1   | the same rows (`from`/`to` names) |

The sankey tree picture is pixel-identical to `nodelink-sankey-tree.png`.

## How the emulation works

`anchorSlots` (in `anchors.ts`) evaluates each anchor flow by hand. For every
node and every anchor it takes the anchor's rows, groups them into slots (the
flow's `by`), sorts the slots (the flow's sort, or the far-position default
given as a proxy), and emits one row per slot. It also emits a GAP row
between slots for a spread's spacing, and a SLACK row that pads the part up
to the node's own size. Each slot row carries a `pair` key. A story renders
the user's node flow with two extra tiers where the node mark was (anchor,
then slot rank), and a ribbon layer that groups the slots by `pair`.

The emulation is the same code for S1 and S2. Only the `rows` function
differs: S1 filters the node's own rows, S2 filters the rows whose ref
column points at the node. That is the main finding for the S1 versus S2
question (see the synthesis).

Known workarounds, as before: inner tiers use `spread({ spacing: 0 })` (the
stack scale bug), ribbon refs are sorted from-end first, and the chord uses
gap rows because a polar `spread` with `spacing` does not close.

## What a mark inside an anchor says about its extent

`blank` exists today (`src/ast/marks/chart.ts`). It is an invisible
positioning guide that takes part in layout and anchors refs. Its options
are `w`, `h`, `fill`, `emX`, `emY` and `debug`. It has no direction-free
size.

With the reused names, the slot's extent along the part is `h` on a vertical
part (`left`, `right`) and `w` on a horizontal part (`top`, `bottom`). The
orientation is the part's own, in the mark's frame before the coordinate
transform. So the `bottom` of a polar rect is an arc along theta, and the
chord's slot is `blank({ w: "value" })`. This works, but it couples the slot
to `at`: moving an anchor from `right` to `bottom` means changing `h` to
`w`. The other dimension means nothing, and a 2D mark invites options that
mean nothing.

A direction-free `size` fixes both. `cut` is the precedent inside GoFish:
`image(...).cut({ dir, size: "amount" })` already sizes 1D pieces with
`size`.

The size uses the MARK's scale along the part, absolutely. This is the
difference from `cut`, whose data sizes are relative weights that fill the
extent (flexbox semantics). A sankey needs absolute sizes: a ribbon must be
the same width at both ends, and a node larger than its links must leave
slack, not stretch its ribbons. A px size (`slot({ size: 1 })`) is a px.

## Naming: reused names, dedicated names, or a mix

The maintainer is not opposed to dedicated 1D names. Precedent:

| System                 | Name for the named place                     | Name for the reference               | Intervals?                                                                                        |
| ---------------------- | -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| SwiftUI                | `alignmentGuide`, custom `AlignmentID`       | the alignment in a stack             | no, a 1D value                                                                                    |
| TikZ                   | anchors (`north`, `south east`, user shapes) | `(a.east)`                           | no, points                                                                                        |
| Graphviz               | ports (record fields, HTML `PORT`) + compass | `a:p1:e -> b:p2`, `tailport`         | the record field is a box                                                                         |
| ELK                    | ports, `port.side`, `portConstraints`        | edge to port                         | ports have size; `spacing.portPort`, `portAlignment` (BEGIN, CENTER, END, JUSTIFIED, DISTRIBUTED) |
| Figma, Illustrator     | guides, layout grids (count, gutter, margin) | snapping                             | layout grid columns, with gutters                                                                 |
| CSS anchor positioning | `anchor-name`                                | `anchor(--a right)`, `position-area` | no, sides of a box                                                                                |
| ggplot2                | `guides()` means axes and legends            | n/a                                  | n/a                                                                                               |

ELK is the closest model for slots: a port has a side, a size, an order
constraint, an alignment along the side and a spacing between ports. That
is exactly `at`, `size`, the flow's sort, `align` and `spread({ spacing })`.

Three spellings, shown on the energy sankey:

```js
// 1. Reused names
.anchor("out", { at: "right" }, chart().flow(stack()).mark(blank({ h: "value" })))
// 2. Dedicated names
.anchor("out", { at: "right" }, slots().flow(stack()).mark(slot({ size: "value" })))
// 3. Mixed: an ordinary chart, a dedicated 1D leaf
.anchor("out", { at: "right" }, chart().flow(stack()).mark(slot({ size: "value" })))
```

and on the chord with gaps:

```js
// 1. Reused names
.anchor("ends", { at: "bottom" }, chart().flow(spread({ by: "to", spacing: 0.01 })).mark(blank({ w: "value" })))
// 2. Dedicated names
.anchor("ends", { at: "bottom" }, slots().flow(spread({ by: "to", spacing: 0.01 })).mark(slot({ size: "value" })))
// 3. Mixed
.anchor("ends", { at: "bottom" }, chart().flow(spread({ by: "to", spacing: 0.01 })).mark(slot({ size: "value" })))
```

A chained form was also considered:
`.anchor("out", { at: "right" }).flow(stack()).mark(slot({ size: "value" }))`.
It reads well, but `.flow` after `.anchor` returns an anchor builder, not
the mark, so the chain can no longer continue with `.name(...)` or a second
`.anchor(...)` without a way to close it. Rejected.

**Recommendation: the mixed spelling (3).** The container is an ordinary
`chart()` because it IS an ordinary flow over rows (the maintainer's first
requirement); a second container name (`slots()`) would carry no
information that `.anchor` does not already carry. The leaf is the only
thing that is really different: it is 1D and invisible. `slot` is the
plain word for "a place on the edge something attaches to". Why not the
others:

- `guide` collides with ggplot2's `guides()` (axes and legends), which
  GoFish users will know, and a Figma guide is a full-canvas line, not a
  piece of an edge.
- `port` (Graphviz, ELK) is exact for node-link pictures but odd for
  labels, which this mechanism also serves.
- `anchor` (TikZ, CSS) is the right word for the named set on the mark, so
  it stays as the modifier.

`slot()` with no `size` is a point. Inside an anchor, `dir` is fixed (along
the part), so `slot` has no `w`, `h` or `dir`.

---

## 1. Energy sankey (S2)

Target, reused names:

```js
layer([
  chart(nodes) // { name, depth } in column order
    .flow(
      spread({ by: "depth", dir: "x", spacing: 100 }),
      spread({ by: "name", dir: "y", spacing: 10 })
    )
    .mark(
      rect({ w: 12, h: "value" })
        .anchor(
          "in",
          { at: "left" },
          chart()
            .flow(stack())
            .mark(blank({ h: "value" }))
        )
        .anchor(
          "out",
          { at: "right" },
          chart()
            .flow(stack())
            .mark(blank({ h: "value" }))
        )
        .name("nodes")
    ),
  chart(links) // { source, target, value }
    .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
    .mark(
      ribbon({
        from: "source.out",
        to: "target.in",
        fill: "source",
        opacity: 0.45,
      })
    ),
]);
```

Target, dedicated names (the node mark only):

```js
    .mark(rect({ w: 12, h: "value" })
      .anchor("in",  { at: "left" },  slots().flow(stack()).mark(slot({ size: "value" })))
      .anchor("out", { at: "right" }, slots().flow(stack()).mark(slot({ size: "value" })))
      .name("nodes")),
```

**Emulation.** Anchor `in` of node n has the links whose `target` is n; `out`
has the links whose `source` is n. One slot per row (`stack()` with no `by`).
Slot order: the far node's rank in its column (the proxy for its placed y).
Columns are centered (`alignment: "middle"`).

**How the ribbon finds its slots.** `"source.out"` names anchor `out` of the
node in the resolved column `source`. Inside that anchor, the slot is the one
holding this link row.

**Problems.**

- `rect({ h: "value" })` on a nodes table with no `value` column. The node
  must be as tall as its longer anchor (d3-sankey's rule). That means the
  node's size reads its anchors, which is a cycle if anchors are laid out
  after the node. The emulation precomputes the value. A real version needs
  either a value column (computed by a data helper) or a declared rule
  "a mark's `h` may be the max of its anchors' lengths".
- `fill: "source"` reads a resolved column (the open question from
  `NOTES-nodelink.md`).

## 2. School days (S1)

Target:

```js
layer([
  spread({ dir: "y", spacing: 200 }, [
    chart(links) // { day, emotion, count }
      .flow(spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60 }))
      .mark(
        rect({ w: "count", h: 4 }).anchor(
          "emotions",
          { at: "bottom" },
          chart()
            .flow(stack({ by: "emotion" }))
            .mark(blank({ w: "count" }))
        )
      ),
    chart(links)
      .flow(
        spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50 })
      )
      .mark(
        rect({ w: "count", h: 90, fill: "emotion" }).anchor(
          "days",
          { at: "top" },
          chart()
            .flow(stack({ by: "day" }))
            .mark(blank({ w: "count" }))
        )
      ),
  ]),
  chart(selectAll(["emotions", "days"])).mark(
    ribbon({ fill: "emotion", opacity: 0.6 })
  ), // joins slots holding the same rows
]);
```

**Emulation.** A day's anchor has that day's link rows grouped by emotion; an
emotion's anchor has its rows grouped by day. The slot holding (day d,
emotion e) is the same row set at both ends.

**How the ribbon finds its slots.** By shared rows: no `from`/`to`. This is
the cleanest example. The node value is the sum of its rows, so the anchor
fills the part exactly and there is no slack.

**Problems.** `selectAll(["emotions", "days"])` selects anchors by name
across two charts. That assumes anchor names live in the same name scope as
mark names (`.name`), which is a decision. The slot order inside each anchor
is the anchor flow's own sort. Here it equals the far order by luck of the
data order; with the far-position default (synthesis d), no sort is needed.

## 3. FrankenSankey (S1)

Target:

```js
layer([
  spread({ dir: "x", spacing: 150, alignment: "end" }, [
    spread({ dir: "x", spacing: 0, alignment: "end" }, [
      chart(years) // { year, decision, value }
        .flow(
          spread({ by: "year", dir: "x", spacing: 22 }),
          stack({ by: "decision", dir: "y" })
        )
        .mark(rect({ w: 0, h: "value", fill: "decision" }).name("area")),
      chart(links) // { country, decision, value }: ONE bar
        .mark(
          rect({ w: 14, h: "value" }).anchor(
            "out",
            { at: "right" },
            chart()
              .flow(
                stack({ by: field("decision").sort(DECISIONS) }),
                stack({ by: "country" })
              )
              .mark(blank({ h: "value" }))
          )
        ),
    ]),
    chart(links)
      .flow(spread({ by: "country", dir: "y", spacing: 6 }))
      .mark(
        rect({ w: 14, h: "value" }).anchor(
          "in",
          { at: "left" },
          chart()
            .flow(stack({ by: field("decision").sort(DECISIONS) }))
            .mark(blank({ h: "value" }))
        )
      ),
  ]),
  chart(selectAll("area"))
    .flow(group({ by: "decision" }))
    .mark(ribbon({ fill: "decision" })),
  chart(selectAll(["out", "in"])).mark(
    ribbon({ fill: "decision", opacity: 0.55 })
  ),
]);
```

S1 is cleaner than S2 here: the bar and the countries are both drawn from
the links table, so no `resolve` and no `key` are needed.

**The override is gone.** In `NOTES-nodelink.md` the decision-first order
needed `ends: { from: stack({ by: "decision" }) }` on the ribbon. With
anchors it is just the anchor flow: `stack({ by: "decision" })`, then
`stack({ by: "country" })`. The order belongs to the node's edge, so it is
written on the node. This is the strongest argument for a full flow inside
the anchor.

**How the ribbon finds its slots.** The bar's slot (decision, country) and
the country's slot (decision) hold the same row.

**Problems.** In the emulation the slots are painted, so the bar shows two
colors; in the target the bar is one `rect`. Fill the bar's slots with a
visible slot mark, or draw the bar as two nodes (the alternative found in
`NOTES-nodelink.md`).

## 4. Chord with gaps between the ends of a group (S1)

Target, reused names:

```js
chart(cells, { coord: Coord.clock() }) // { from, to, value }: the N x N matrix
  .flow(
    spread({
      by: field("from").sort(NAMES),
      dir: "x",
      spacing: 0.04,
      y: 160,
      h: 16,
    })
  )
  .mark(
    rect({ w: "value", fill: "from" }).anchor(
      "ends",
      { at: "bottom" },
      chart()
        .flow(spread({ by: "to", spacing: 0.01 }))
        .mark(blank({ w: "value" }))
    )
  )
  .layer(
    ribbon({ by: chordPair, curve: Curve.chord(), fill: "lead", opacity: 0.67 })
  );
// chordPair = (r) => [r.from, r.to].sort().join("-"): cell (i, j) and cell (j, i)
// are different rows, so the shared-row rule cannot pair them.
```

Target, dedicated names (the group mark only):

```js
  .mark(rect({ w: "value", fill: "from" })
    .anchor("ends", { at: "bottom" },
      slots().flow(spread({ by: "to", spacing: 0.01 })).mark(slot({ size: "value" }))))
```

**This is the case that needs operator plus mark.** The slots are sized by
data (`size: "value"`) AND separated by a gap (`spread({ spacing })`), which
is d3's `ribbon.padAngle` and circlize's `small.gap`. Neither a single
operator nor a single option on the ribbon can say both. In the picture, the
ring is continuous and the ribbon ends have white gaps between them inside
each group.

**Emulation.** Group i's anchor has cells (i, j) for all j, one slot per `to`,
with a gap row between slots. The slot order is the cyclic far position
(from `NOTES-nodelink.md`). The self cell is one slot, and its ribbon is a
self chord.

**Problems.**

- Pairing needs an explicit key: say so in the API. The shared-row rule
  cannot pair cell (i, j) with cell (j, i) because they are two rows.
- The group's `w: "value"` sums all cells, but the anchor adds gaps. With
  gaps the anchor is longer than the group arc, so this overflows. Either the
  group grows by the gaps (the anchor's length feeds the mark's size, as in
  example 1) or the gap is taken from the slots. d3 takes it from the
  slots: `padAngle` shrinks each ribbon end, and the group arc is the plain
  sum. The emulation grows the group (its gap rows are drawn as group
  color). This needs a rule (synthesis e).
- `spacing: 0.01` is in theta units. A px spacing in a polar anchor would be
  an arc length; a data-unit spacing would be in the value scale. Which unit
  a spacing inside an anchor uses is open.

## 5. Beatles (S2, point slots)

Target:

```js
layer([
  spread({ dir: "y", spacing: 260 }, [
    chart(songs) // { song }
      .flow(spread({ by: "song", dir: "x", spacing: 18 }))
      .mark(circle({ r: 2 }).name("songs")),
    chart(writers) // { writer }
      .flow(
        spread({ by: field("writer").sort(WRITERS), dir: "x", spacing: 90 })
      )
      .mark(
        ellipse({ w: 70, h: 44, fill: "writer", opacity: 0.35 })
          .anchor(
            "credits",
            { at: "top" },
            chart()
              .flow(spread({ spacing: 3 }))
              .mark(blank())
          )
          .name("writers")
      ),
  ]),
  chart(credits) // { song, writer }
    .flow(
      resolve(["song"], { from: selectAll("songs") }),
      resolve(["writer"], { from: selectAll("writers") })
    )
    .mark(line({ from: "song", to: "writer.credits", stroke: "writer" })),
]);
```

**Emulation.** A writer's anchor has the credit rows whose `writer` is that
writer, one 1 px slot each, spaced 3 px, ordered by the song's position. A
song has no anchor: every line ends at the circle's default point.

**How the line finds its slots.** `"writer.credits"` at one end; a plain ref
column (`"song"`) at the other means the mark's default anchor point, which
is what `line({ from, to })` does today.

**Problems.**

- `at: "top"` on an ellipse. An ellipse has no `top` part today; the label
  proposal's `Outline.parts` leaves curved shapes without parts. An anchor
  on an ellipse needs a part (the top arc, or the whole outline with an
  angle range).
- Overflow in px: Lennon has 22 credits, so `spread({ spacing: 3 })` with
  1 px slots is 85 px, on an ellipse that is only 70 px wide.
  The emulation grows the head to enclose its slots. A real version should
  let `spread()` with no `spacing` distribute the slots evenly over the part
  (ELK's `DISTRIBUTED`), which always fits. Then the target is
  `chart().flow(spread()).mark(slot())`.

## 6. Labels on anchors

Target (reused names, the node mark only):

```js
    .mark(rect({ w: 12, h: "value" })
      .anchor("in",    { at: "left" },  chart().flow(stack()).mark(blank({ h: "value" })))
      .anchor("out",   { at: "right" }, chart().flow(stack()).mark(blank({ h: "value" })))
      .anchor("label", { at: (n) => (n.depth === last ? "left" : "right") }, chart().mark(blank()))
      .label("name", { position: Place.along({ at: "label", side: "outset" }) })   // a slot is a named part
      .name("nodes")),
```

**The same mechanism serves labels.** The label anchor is a single point slot
(`chart().mark(blank())`: one mark over the mark's rows, with no size) at the
middle of the part. The label proposal's `Place.along({ at })` reads a named
part of the mark's `Outline`. An anchor slot IS a named part, so a label
placed `at: "label"` sits on the slot, outset. Several tags along one edge
are the same thing with a flow: `.anchor("tags", { at: "top" },
chart().flow(spread({ spacing: 4 })).mark(slot({ size: 16 })))` and one
label per slot.

**Emulation.** The label slot is a zero-width blank as tall as the node,
centered against by a `text` in a `spread({ dir: "x", spacing: 4 })` with
the slot's ref (the pattern from `LabeledChart.stories.tsx`).

**Problems.** `at` as a function of the datum (d3's rule: labels to the left
in the last column) is new. The default position of a point slot on its part
(middle) is a decision (synthesis e).

## 7. Sankey tree (S1)

Target:

```js
chart(titanic) // leaf rows { class, sex, survived, count }
  .flow(
    spread({ by: "class", dir: "y", spacing: 8 }),
    derive(levels(["sex", "survived"])), // one copy of the rows per depth, with `child`
    spread({ by: "depth", dir: "x", spacing: 64, alignment: "middle" }),
    spread({ by: "sex", dir: "y", spacing: 4 }), // "" above its depth
    spread({ by: "survived", dir: "y", spacing: 2 })
  )
  .mark(
    rect({ w: 40, h: "count", fill: "class" })
      .anchor("in", { at: "left" }, chart().mark(blank({ h: "count" })))
      .anchor(
        "out",
        { at: "right" },
        chart()
          .flow(stack({ by: "child" }))
          .mark(blank({ h: "count" }))
      )
  )
  .layer(ribbon({ from: "out", to: "in", fill: "child", opacity: 0.6 })); // slots holding the same rows
```

**Emulation.** A node's rows are the leaf rows under it. Its `in` anchor is
ONE slot over all its rows; its `out` anchor has one slot per child key. The
parent's slot for child c holds the same rows as child c's `in` slot.

**Finding: a flowless anchor chart is one slot.** The first render made the
`in` anchor one slot per row, and ribbons ran from a node's `in` to its own
`out`. `chart().mark(blank(...))` with no flow must mean ONE mark over all
the rows, as `chart(data).mark(rect(...))` does today (the FrankenSankey's
one-bar chart relies on it).

**How the ribbon finds its slots.** By shared rows, but the rows alone are
ambiguous: a node's `in` slot holds the same rows as its parent's `out` slot
AND, when the node has one child, as its own `out` slot and the child's `in`
slot. So the ribbon names the anchors: `from: "out", to: "in"`. A unary
chain (one child per level) would still match parent `out` to grandchild
`in`. The rule needs "the nearest" or a key. Titanic has no unary node, so
the picture is correct, but the rule is not finished.

**Problems.** `levels([...])` (repeat the rows per depth and blank the keys
below it) is a hypothetical data helper. A root's `in` anchor and a leaf's
`out` anchor have no partner and draw nothing.

---

## Synthesis

### (a) S1 versus S2: one rule?

The emulation code is the same for both; only the anchor's rows differ. S1:
the mark's own rows (its datum bag). S2: the rows that reference the mark
through a resolved column. A single rule "an anchor's rows are the rows that
reach this mark" almost covers both, but not quite. In S2 the node also has
its own row (the nodes table row), and the energy node has TWO relations
(`source` for `out`, `target` for `in`). So S2 must name the relation once.

Where to name it. ORM precedent puts the reverse relation on the foreign key
side: Django `related_name` is declared on the `ForeignKey`, and Rails
`has_many :out_links, foreign_key: :source` names the column. Edge-side port
naming is also the Graphviz and TikZ precedent (`a:out -> b:in`,
`(a.east) -- (b.west)`). In GoFish the foreign key side is the links chart.
So:

- **Recommended:** `ribbon({ from: "source.out", to: "target.in" })`. The
  anchor chart stays `chart()` with no data. When rows attach to an anchor
  through a name path, those rows ARE the anchor's rows (and the mark's own
  rows are not); otherwise the anchor's rows are the mark's own rows.
  Stated as one rule: an anchor's rows are the rows attached to it, and a
  mark's own rows are attached to all its anchors unless another chart
  attaches rows by name.
- Explicit alternative: `resolve(["source", "target"], { from:
selectAll("nodes"), attach: { source: "out", target: "in" } })`. This puts
  the backref on `resolve`, exactly like Django, and the ribbon then needs no
  names (shared rows). It is cleaner in theory but splits one picture's
  intent across two calls.
- Rejected: `chart(links).flow(filter((l) => l.source === self))` inside the
  anchor. It needs a `self` the anchor does not have, and it repeats the
  join that `resolve` already did.

The S2 dependency runs backwards (the nodes chart's anchors read a later
chart's rows). That is fine because anchors are laid out AFTER the marks are
placed, which they must be anyway for the far-position order. It is not
fine for the node's own size (example 1, problem 1).

### (b) How ribbons pick slots

Three ways appeared:

1. **Shared rows** (school days, FrankenSankey, sankey tree, and S2 after
   attachment): the two slots that hold the same row set are one ribbon.
   This is the default and needs no options. With 2 slots per row set it is
   exact.
2. **Name path** (`"source.out"`): picks the anchor; the row picks the slot
   inside it. Also needed in S1 when more than two anchors hold the same
   rows (`from: "out", to: "in"` in the sankey tree).
3. **Explicit key** (`ribbon({ by: chordPair })`): when the two ends are
   different rows (the chord's (i, j) and (j, i) cells). It overrides the
   row identity.

A unary chain is still ambiguous under 1 plus 2. That is open.

### (c) Naming syntax for an anchor reference

- `"source.out"` (TikZ `a.east`). Short, readable. A dot may clash with a
  future nested field path.
- `"source:out"` (Graphviz `node:port`). No clash with field paths.
- `ref("source").anchor("out")`. Typed and explicit, but long in a ribbon
  call.

Recommendation: `"source.out"` unless GoFish ever reads dotted field paths,
then `"source:out"`.

### (d) Default `dir` and extent inside an anchor

The anchor chart is 1D. Its coordinate is the part's own tangent, in the
mark's frame before the coordinate transform (so a polar rect's `bottom` is
theta). `dir` defaults to it and any other `dir` is an error. The slot's
extent is `size` (mixed spelling) on the mark's own scale along the part,
absolute, not relative. With the reused names it is `h` on `left`/`right`
and `w` on `top`/`bottom`.

### (e) Slack and overflow

- **Slack** (the anchor is shorter than the part): the flow's block is
  placed by an `align` option on the anchor (`start`, `middle`, `end`).
  d3-sankey is `start`; a point label wants `middle` (TikZ `east` is the
  middle of the side). The emulation uses `start` for the sankeys and
  `middle` for labels. The default is a decision; `middle` matches TikZ,
  CSS and ELK's `CENTER`.
- **Overflow** with data sizes: throw, naming the mark, the anchor and both
  lengths (as `resolve` does). Exception: when the mark's size is DEFINED as
  its anchors' length (the energy node), there is no overflow by
  construction.
- **Overflow** with px sizes (the Beatles heads): `spread()` with no
  `spacing` distributes the slots over the part, which always fits; an
  explicit spacing that overflows throws.
- **Gaps with data sizes** (the chord): the gap either grows the mark or is
  taken out of the slots. d3 takes it from the slots. This is open.

### (f) Relation to `cut` and to label placement

- **`cut`** splits a mark's INTERIOR into visible pieces along `dir`, with
  `size` as RELATIVE weights that fill the extent (raw numbers are absolute
  px). An anchor splits a BOUNDARY PART into invisible slots, with sizes on
  the mark's ABSOLUTE scale and slack allowed. The shared kernel is "a 1D
  flow over the mark's rows, laid along a coordinate attached to the mark".
  `cut` could later be an anchor on the interior whose slots clip the mark,
  but the size semantics differ (fill versus scale), so that is not a free
  unification.
- **Label placement.** The label proposal's `Outline.parts` are the mark's
  own named pieces (`top`, `right`, ...), read by `Place.along({ at })`. An
  anchor ADDS named parts: each slot is a part, named by the anchor. So
  `Place.along({ at: "label" })` places a label on a slot, and many labels
  along one edge are one anchor with a flow. Anchors are the "many" that
  `Place.along` lacks. This also means `Outline.parts` should accept parts
  that are sub-intervals of other parts.
