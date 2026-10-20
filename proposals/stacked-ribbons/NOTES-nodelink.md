# Stacked ribbons: the node-link approach

The approach: nodes are placed by any chart or layout. Links are a table,
resolved against the named nodes with the existing `resolve`. The ribbon (or
line) takes `from` / `to` ref columns and a `size` channel. At each node, the
ends of the ribbons STACK along a part of the node (by default the edge that
faces the far node), ordered by the far end's placed position, with optional
overrides. This is "Approach A" in `NOTES.md`, now tested on the harder
pictures.

Stories: `packages/gofish-graphics/stories/_proposals/stacked-ribbons/NodeLink.stories.tsx`
(titles `Proposals/Stacked Ribbons/Node Link/...`); the rewrite helper is
`nodeLink.ts`. No library source was changed. The chord reuses the throwaway
`_proposalChordRibbon.ts`. Every picture was rendered with `capture-one` and
looked at.

| Example       | PNG                              | Result                                                     |
| ------------- | -------------------------------- | ---------------------------------------------------------- |
| Energy sankey | `img/approach-a-energy.png`      | done earlier (`Approach A/EnergySankey`)                   |
| Sankey tree   | `img/nodelink-sankey-tree.png`   | matches the direct version, nested gaps 8/4/2              |
| School days   | `img/nodelink-school-days.png`   | matches the reference structure                            |
| Beatles       | `img/nodelink-beatles.png`       | matches; equal ends along each head                        |
| FrankenSankey | `img/nodelink-frankensankey.png` | matches; bar decision-first, countries by decision         |
| Chord         | `img/nodelink-chord.png`         | matches d3, and fewer crossings than `chord-prototype.png` |

## The real `resolve`

```ts
resolve(cols: string[], opts: { from: GoFishRef; key?: string }): Operator
```

(`packages/gofish-graphics/src/ast/marks/chart.ts`, docs
`apps/docs/docs/js/api/operators/resolve.md`.) Each listed column's value is
matched against the nodes of `from` and replaced IN PLACE with the node's ref.
It is many-to-one and keeps the row grain. The match field defaults to the
INNERMOST field the `from` node was grouped by (`__splitBy`, recorded per
node, so two node charts grouped by different fields both work with no
`key`). A reference with no node throws. Two consequences show up below:

1. When the innermost `by` is not the node's identity (the sankey tree's
   innermost tier is `leaf`, which is `""` for most nodes), the spec must pass
   `key`. When one node chart has no `by` at all (the FrankenSankey's single
   bar), every node chart must carry the same key field and the spec passes
   it.
2. Because the columns are replaced in place, the link row loses the NAME of
   the node it points at. Every example colors the ribbon by a resolved
   column (`fill: "emotion"`, `stroke: "writer"`). The target specs assume a
   data channel that reads a resolved ref reads the ref's key value. That is
   a requirement, not current behavior (untested here).

## How the emulation works

`nodeLinkEnds` (in `nodeLink.ts`) rewrites the links into an ENDS table: one
row per ribbon end, carrying the fields of the node it sits on, its part, a
rank inside the part, and a SLACK row per node part that pads the part up to
the node's value. A story then renders the user's node flow unchanged, with
two extra tiers where the node mark was (part, then end rank), and a ribbon
layer over the ends grouped by link (refs sorted from-end first, the known
ribbon direction workaround). Inner tiers use `spread({ spacing: 0 })`, the
stack scale bug workaround. The rank needs the far end's position BEFORE
layout, so the emulation is given a proxy (the far node's index in its row
or column); a real implementation reads the far node's placed position.

---

## 1. Energy sankey (done earlier)

Target:

```js
layer([
  chart(nodes) // { name, depth, ... } in column order
    .flow(
      spread({ by: "depth", dir: "x", spacing: 100 }),
      spread({ by: "name", dir: "y", spacing: 10 })
    )
    .mark(rect({ w: 12, h: "value" }).name("nodes")),
  chart(links) // { source, target, value }
    .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
    .mark(
      ribbon({ from: "source", to: "target", size: "value", opacity: 0.5 })
    ),
]);
```

`resolve` needs no `key` here: the innermost `by` is `name`. The node depth
and the order inside a column are still a layout algorithm the user runs
first (`sankeyDepths`, `orderColumns` in `sankeyPrep.ts`). That is a node
layout question, separate from end allocation.

---

## 2. Sankey tree, nested gaps 8 / 4 / 2

Target:

```js
layer([
  chart(treeNodes) // { key, depth, class, sub, leaf, count }
    .flow(
      spread({ by: "class", dir: "y", spacing: 8 }), // a class band holds its subtree
      spread({ by: "depth", dir: "x", spacing: 64, alignment: "middle" }),
      spread({ by: "sub", dir: "y", spacing: 4 }),
      spread({ by: "leaf", dir: "y", spacing: 2 })
    )
    .mark(rect({ w: 40, h: "count", fill: "class" }).name("nodes")),
  chart(treeLinks) // { source: parentKey, target: key, value: count, color }
    .flow(
      resolve(["source", "target"], { from: selectAll("nodes"), key: "key" })
    )
    .mark(
      ribbon({
        from: "source",
        to: "target",
        size: "value",
        fill: "color",
        opacity: 0.6,
      })
    ),
]);
```

The tree's nodes are a flat table (`sub` and `leaf` are `""` above their
depth). The links are parent to child, sized by the child's count.

**Emulation** (`Node Link/SankeyTree`): the same node flow over the ends
table, plus `spread({ by: "part" })` (in, out) and `spread({ by: "key" })`.

**Result.** This is the point of the example: the parent's right edge is
divided among its children's ribbons automatically, which was the unsolved
"edge slices" problem in the nested-data version (`NOTES.md` R4). The user
writes no slice and no end order. The picture matches
`direct-sankey-tree.png`.

**Finding: the node nesting decides the alignment.** The first try nested
`depth` outside `class`. Each column was then spread on its own, the gaps
added up differently per column (column 0 has three 8 px gaps; column 2 also
has four 4 px gaps and up to eight 2 px gaps), and the Crew ribbons bent
downward by about 30 px. Putting `class` outside `depth` makes
each class band hold its own three columns, so the drift is only the 4 and 2
px gaps inside a band. This is a node layout choice, and it is free here
because the node layout is just a chart.

**Requirements:**

- `size` uses the scale of the node's `h` (both are counts in one y scale).
- Slack: a root has no in-ends and a leaf has no out-ends; the empty part is
  slack and the node body still shows at full height.
- `resolve` needs `key: "key"` (the innermost `by` is `leaf`).

---

## 3. School days

Target:

```js
layer([
  spread({ dir: "y", spacing: 200 }, [
    chart(links)
      .flow(spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60 }))
      .mark(rect({ w: "count", h: 4 }).name("nodes")), // w sums the day's links
    chart(links)
      .flow(
        spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50 })
      )
      .mark(rect({ w: "count", h: 90, fill: "emotion" }).name("nodes")),
  ]),
  chart(links) // { day, emotion, count }
    .flow(resolve(["day", "emotion"], { from: selectAll("nodes") }))
    .mark(
      ribbon({
        from: "day",
        to: "emotion",
        size: "count",
        dir: "y",
        fill: "emotion",
        opacity: 0.6,
      })
    ),
]);
```

**Emulation** (`Node Link/SchoolDays`): two charts over the ends of each
row, each with its own spacing and height, in the same `spread({ dir: "y" })`.

**Result.** The two node rows are two ordinary charts with different spacing
and height, which the flat "ends are rows" spelling could not express. The
end order at each node is the far row's order with no rank key.

**Findings:**

- The node charts read the LINKS table: `spread({ by: "day" })` groups the
  links and `rect({ w: "count" })` sums them, so no node totals are computed.
  The node value equals the ribbon sizes by construction.
- `resolve` needs no `key`: the day refs match on `day`, the emotion refs on
  `emotion` (the inferred key is per node).
- The ribbon's `size` must use the x scale of the node's `w` (the parts are
  `bottom` and `top`, so the edge runs along x). Separate sibling charts
  already share one value scale today; the real ribbon must use it on
  purpose.
- Palettes: `{ color: SCHOOL }` must be on the chart whose `fill` first uses
  the field; on the other chart the ribbons fell back to the default palette.

---

## 4. Beatles: lines with equal-size ends

Target:

```js
layer([
  spread({ dir: "y", spacing: 260 }, [
    chart(credits)
      .flow(spread({ by: "song", dir: "x", spacing: 18 }))
      .mark(circle({ r: 2 }).name("nodes")),
    chart(credits)
      .flow(
        spread({ by: field("writer").sort(WRITERS), dir: "x", spacing: 90 })
      )
      .mark(
        ellipse({ w: 70, h: 44, fill: "writer", opacity: 0.35 }).name("nodes")
      ),
  ]),
  chart(credits) // { song, writer }
    .flow(resolve(["song", "writer"], { from: selectAll("nodes") }))
    .mark(
      line({
        from: "song",
        to: "writer",
        ends: { to: spread() },
        stroke: "writer",
        dir: "y",
      })
    ),
]);
```

**Emulation** (`Node Link/Beatles`): song ends of width 0 (all on one
point), head ends of width 1 px with 3 px spacing, an oval enclosing each
head's ends.

**Proposed spelling for equal-size ends.** The ends at a node part are laid
out by an operator, named with the same words the library already has:

- `ends: stack()`: ends are sized by `size` and touch (the default when
  `size` is given; a sankey).
- `ends: spread()`: ends are equal slots spread evenly along the part
  (`spread({ spacing: 3 })` for a fixed pitch). This is the Beatles head.
- no `size` and no `ends`: every end is the part's anchor point, which is
  what `line({ from, to })` does today, so existing node-link graphs keep
  their meaning. This is the Beatles song.

Why an operator and not a flag: "sized and touching" versus "equal and
spaced" is exactly the `stack` versus `spread` distinction, and the same
operator carries the order override (section 5). A flag (`equal: true`)
would be a second vocabulary for the same choice.

**Findings:**

- Without `size` a line end is a point; `ends: spread()` gives each end an
  equal slot and puts the point at the slot's middle.
- In the emulation, the heads grow to fit their ends (enclose). In the
  target, the head is a node of its own size and the ends divide its top
  edge. That is the right direction: the node is placed first.
- `stroke: "writer"` reads a resolved column (see "The real resolve").

---

## 5. FrankenSankey: an end-order override

Target (the 2017 bar is ONE node):

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
      chart([{ name: "2017", total: total2017 }]).mark(
        rect({ w: 14, h: "total" }).name("nodes")
      ),
    ]),
    chart(countries) // { name, total }
      .flow(spread({ by: "name", dir: "y", spacing: 6 }))
      .mark(rect({ w: 14, h: "total" }).name("nodes")),
  ]),
  chart(selectAll("area"))
    .flow(group({ by: "decision" }))
    .mark(ribbon({ fill: "decision" })),
  chart(links) // { source: "2017", target: country, decision, value }
    .flow(
      resolve(["source", "target"], { from: selectAll("nodes"), key: "name" })
    )
    .mark(
      ribbon({
        from: "source",
        to: "target",
        size: "value",
        fill: "decision",
        opacity: 0.55,
        ends: {
          from: stack({ by: field("decision").sort(DECISIONS) }), // then the far end
          to: stack({ by: field("decision").sort(DECISIONS) }), // both ends share a far node
        },
      })
    ),
]);
```

**Emulation** (`Node Link/FrankenSankey`): `nodeLinkEnds` with
`order: { from: (l) => [decisionIndex] }`, the area rows from `HardRefs`.

**The override rule.** `ends: stack({ by })` groups the ends at a node by
`by` in its sort order, and inside each group the far end's position orders
them, as always. So `by: "decision"` at the bar gives "all accepted in
country order, then all rejected in country order", exactly the FT bar. At a
country node both ends go to the same far node, so the far position ties;
the `to` override breaks the tie by decision. (The links table's row order
would break it the same way, so `to` is only there to be explicit.) The
override is per side because the two sides want different orders.

**Precedent.** d3-sankey has one `linkSort` comparator for all nodes; `null`
(the default) sorts by the far node's y, and a comparator replaces that
order everywhere, both sides. It cannot say "decision first at the bar, far
end at the countries". ggalluvial distinguishes `geom_alluvium` (one order
for a whole alluvium across every axis) from `geom_flow` (each pair of axes
ordered on its own), and orders lodes inside a stratum by aesthetics
(`aes.bind`) and `lode.guidance`. The node-link ribbon is the `geom_flow`
model: each node orders its own ends. `ends: stack({ by })` is the per-node,
per-side `aes.bind`.

**Alternative found: the bar as TWO nodes.** If the 2017 cells of the
stacked area are the nodes (one per decision), the links go from a decision
node to a country, the default far-position order is correct at both ends
(the bar's accepted node orders by country; a country's two ends come from
two nodes, accepted above rejected), and no override is needed. The bar is
then colored by decision for free, which the FT picture is: a ONE-node bar is
drawn in one color, and only the emulation's ports make it two-colored. The
cost is that the area's last column must be 14 px wide nodes, not area knots.
This suggests the override is rarely needed when the nodes are modeled at
the grain the picture colors.

---

## 6. Chord: asymmetric ends on the inner arc

Target:

```js
layer({ coord: Coord.clock() }, [
  chart(groups) // { name, total }, total = row sum of the matrix
    .flow(
      spread({
        by: field("name").sort(NAMES),
        dir: "x",
        spacing: 0.04,
        y: 160,
        h: 16,
      })
    )
    .mark(rect({ w: "total", fill: "name" }).name("nodes")),
  chart(pairs) // { a, b, ab, ba, lead }, a <= b, one row per pair
    .flow(resolve(["a", "b"], { from: selectAll("nodes") }))
    .mark(
      ribbon({
        from: "a",
        to: "b",
        size: { from: "ab", to: "ba" },
        at: "bottom",
        curve: Curve.chord(),
        fill: "lead",
        opacity: 0.67,
      })
    ),
]);
```

**Emulation** (`Node Link/Chord`): `nodeLinkEnds` with per-end sizes,
`at: { from: "bottom", to: "bottom" }` (so both sides rank together on one
part), gap rows in a polar `stack`, the throwaway `chordRibbon`.

**Findings:**

- `size: { from, to }` is the asymmetric case: cell (i, j) sizes the end at
  i, cell (j, i) the end at j. A plain field sizes both ends.
- `at: "bottom"` puts both ends on the same part (the inner arc). The
  emulation first ranked the from-ends and the to-ends separately (the
  sankey default: out face, in face) and two ends got the same rank on one
  arc; they merged into one mark and the ribbon's fill failed ("lead is not
  constant"). Ends on one part must be ranked together, so the part, not the
  side, is the unit of allocation.
- **Far position on a cycle.** "Order by the far end's position" must be
  measured going around the circle from this node, not by raw angle. The
  emulation uses `(i - j) mod N`: going clockwise along my arc, my
  counter-clockwise neighbor comes first and my clockwise neighbor last. The
  result has visibly fewer crossings than d3's default order by `j`
  (`chord-prototype.png`). A real implementation needs to know the
  dimension is cyclic.
- **Self chord: one end.** A pair with `a === b` (a diagonal cell) allocates
  one end, not two. This is a special case inherent to the domain (d3 does
  the same); it should be the stated rule for `from === to`.
- `lead` (the name of the larger end, d3's color rule) is computed before
  `resolve`, because `resolve` replaces `a` and `b` with refs.
- A polar `spread` with `spacing` still does not close the circle
  (`chord-ring-spread-fails.png`); the emulation keeps the gap rows inside a
  `stack`.
- The band curve is still the throwaway: control points in screen space
  (`Curve.chord()` is a hypothetical name).

---

## Consolidated: what the node-link ribbon needs

| Option / rule    | Proposed spelling                                                                                                                                                               | Surfaced by               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| End refs         | `from`, `to` (ref columns from `resolve`)                                                                                                                                       | all                       |
| End size         | `size: "value"`; per end `size: { from, to }`                                                                                                                                   | all; chord                |
| End layout       | `ends: stack()` (default with `size`), `ends: spread()`                                                                                                                         | Beatles                   |
| Point ends       | no `size`, no `ends`: the part's anchor (today's line)                                                                                                                          | Beatles songs             |
| Order override   | `ends: stack({ by })`, per side `ends: { from, to }`                                                                                                                            | FrankenSankey             |
| Default order    | far end's placed position; ties by link row order                                                                                                                               | all                       |
| Node part        | `at: "bottom"`, per side `at: { from, to }`; default the facing edges along `dir`                                                                                               | chord, school days        |
| Shared scale     | `size` uses the node's measure along the part (`h` for left/right, `w` for top/bottom); a unit mismatch is a type error                                                         | all                       |
| Slack            | node value > sum of ends: the rest of the part is empty node body; the block sits at the part's start (d3's rule); a different anchor would be `ends: stack({ anchor })` (open) | sankey tree, mismatch     |
| Overflow         | node value < sum of ends: throw, naming the node and both sums (like `resolve`'s error)                                                                                         | `approach-a-mismatch.png` |
| Self link        | `from === to`: one end                                                                                                                                                          | chord                     |
| Cyclic order     | far position measured around the cycle from this node                                                                                                                           | chord                     |
| Channel on a ref | `fill: "<resolved column>"` reads the ref's key                                                                                                                                 | school days, Beatles      |
| Band curve       | a screen-space chord curve (`Curve.chord()`)                                                                                                                                    | chord                     |

**What does not fit.**

- The order rule "far end's placed position" is circular if read literally:
  the far END's position depends on the far node's own end order, which
  depends on this side. The rule must be the far NODE's position, with ties
  broken by row order or an override. That is what d3 does and what the
  emulation does. It is enough for every example here.
- Node layout is still the user's job. The energy sankey's columns and
  in-column order, and the sankey tree's band nesting, are node layout
  choices. The node-link ribbon does not help with them and should not; a
  sankey node layout is a separate operator.
- Ribbon fill by a resolved column needs a decision (read the key, or keep
  the name next to the ref). Every example hit it.
- The ribbon reads its scale from the node, so the node must be drawn with
  a data-sized `h` / `w`. A node drawn as an image or with a px size (the
  Beatles heads) can only take `ends: spread()` or point ends; `ends:
stack()` on it would have no scale to read and should be an error.
