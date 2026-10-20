# Stacked ribbons: four hard references

Four harder reference pictures, used as stress tests for the two candidate
spellings:

- **Proposal 1, "ends are rows"**: `derive(unpivot({ on, variable, value, id }))`,
  one flat flow that stacks the ends inside nodes, `ribbon({ by })` joins a
  link's ends, `ribbon({ at })` names the node part an end attaches to.
- **Proposal 2, "syntax follows the data"**: a list is a flow tier, a record
  is a combinator `spread(opts, [child, ...])`, `cols([...])` expands one
  child per column, `chart(field("in"))` reads a parent's list field, and a
  ribbon joins ends that are the same datum.

Stories: `packages/gofish-graphics/stories/_proposals/stacked-ribbons/HardRefs.stories.tsx`
(titles `Proposals/Stacked Ribbons/Hard Refs/...`). No library source was
changed; the trade chord reuses the throwaway `_proposalChordRibbon.ts`.
Every picture was rendered with `capture-one` and looked at.

| Story                | PNG                                 | Shape rendered                           |
| -------------------- | ----------------------------------- | ---------------------------------------- |
| `FrankenSankey`      | `img/hard-frankensankey.png`        | P1 shape (one flat ends table)           |
| `FrankenSankeyParts` | `img/hard-frankensankey-parts.png`  | P2 shape (three charts in combinators)   |
| `SchoolDays`         | `img/hard-school-days.png`          | P1 shape                                 |
| `SchoolDaysTwoRows`  | `img/hard-school-days-two-rows.png` | P2 shape                                 |
| `ProbeBeatlesFlat`   | `img/hard-beatles-flat-fails.png`   | P1 shape: heads overlap (shared spacing) |
| `Beatles`            | `img/hard-beatles.png`              | P2 shape                                 |
| `TradeChord`         | `img/hard-trade-chord.png`          | P1 shape + throwaway chord ribbon        |

**PiCCL data.** The PiCCL paper (Shi, Wang, Chen, Wang, Lee, "PiCCL:
Data-Driven Mark Composition of Bespoke Pictorial Chart", IEEE VIS 2025;
library piccl.js) was found, but no repository or data was found in a quick
search. The school-days counts are read off the reference picture; the
Beatles and trade data are synthetic.

## Shared findings

- **Shared spacing across rows (P1's main cost here).** In one flat flow,
  the two rows of a bipartite layout (days / glasses, songs / heads) share
  ONE node tier, so they share its `spacing` and its sort. The Beatles rows
  need 18 px between songs and 90 px between heads; with one tier the heads
  overlap (`ProbeBeatlesFlat`). Two charts in a `spread({ dir: "y" })`
  combinator fix it with zero core changes.
- **Separate sibling charts share one value scale.** This is what a sankey
  wants: the day ends and the glass ends (`SchoolDaysTwoRows`), and the bar
  and the country ends (`FrankenSankeyParts`), are drawn at the same px per
  count from separate charts. It is the behavior R2 (parallel coordinates)
  found and called undocumented. Both pictures need it, and parallel
  coordinates needs the opposite, so a real version needs an explicit
  choice: shared or independent, per child.
- **A number from an accessor is a data value, a literal number is px.**
  `rect({ w: 14 })` draws 14 px (`FrankenSankeyParts`), but
  `rect({ w: (d) => (d.kind === "area" ? 0 : 14) })` draws 36 px
  (`FrankenSankey`): the accessor's result goes through the x size scale.
  The same happened to `w: (d) => ... 1` in `ProbeBeatlesFlat` (about 10 px).
  So a per-row constant size in a flat ends table cannot be in px. This is
  one more cost of P1's "one flow, rows of several kinds": the kinds need
  different literal sizes, and only an accessor can say that.
- **Ribbon direction still follows ref order** (NOTES R4 bug 1). Every
  story sorts the refs (`sortRefs`) before grouping.
- **Labels.** The P2 shape draws node names for free (the node tier's
  axis), but on the wrong side for the FrankenSankey (left of the country
  ends, under the ribbons) and inside the Beatles heads. Real placement
  belongs to the label proposal.
- **Image nodes** (glasses, heads, notes) are out of scope: glasses are the
  stacked emotion ends drawn 90 px tall, heads are `enclose({ shape:
Shape.oval() })` around a writer's ends.

---

## 1. FrankenSankey (FT, "Final asylum appeals often fail")

**Data: ESTIMATED.** Country totals and % positive are printed in the
picture; accepted = total × pct (Germany 40% of 158,210, France 17% of 47,745,
Sweden 24% of 19,015, Italy 26% of 12,590, UK 57% of 12,500, Greece 16% of
9,550, Austria 56% of 6,960, Belgium 6% of 5,070, All 20 others 39% of
10,190). 2017 totals are the sums (96k accepted, 186k rejected). The
2008–2016 accepted/rejected totals are read off the area chart by eye.

**The stress.** One ribbon per (country, decision). Its two ends are in
different orders on the two sides: the 2017 bar is decision-first (all
accepted, then all rejected, each in country order), the country nodes are
country-first (each country's accepted, then its rejected). And the bar is
the last slice of a stacked area, so the chart has two ribbon identities
(the area bands by decision, and the sankey links).

**Working spec, P1 shape** (`FrankenSankey`): one ends table with three
kinds of rows (area: year × decision; bar: one per link, `key =
decision|country`; country: one per link, `g1 = country`, `key =
decision`), five tiers, two ribbon layers.

```js
layer([
  chart(frankenEnds, { color: FT })
    .flow(
      spread({
        by: field("part").sort(),
        dir: "x",
        spacing: 150,
        alignment: "end",
        axes: false,
      }),
      spread({
        by: field("col").sort(),
        dir: "x",
        spacing: 22,
        alignment: "end",
        axes: false,
      }),
      spread({
        by: field("side").sort(),
        dir: "x",
        spacing: 0,
        alignment: "end",
        axes: false,
      }),
      spread({ by: field("g1").sort(), dir: "y", spacing: 6, axes: false }),
      spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
    )
    .mark(
      rect({
        w: (d) => (d.kind === "area" ? 0 : 14),
        h: "value",
        fill: "decision",
      }).name("ends")
    ),
  chart(selectAll("ends")) // the stacked area
    .flow(
      filter((r) => project(r, "kind") === "area"),
      sortRefs((r) => project(r, "col")),
      group({ by: "decision" })
    )
    .mark(ribbon({ fill: "decision" })),
  chart(selectAll("ends")) // the sankey half
    .flow(
      filter((r) => project(r, "kind") !== "area"),
      sortRefs((r) => (project(r, "kind") === "bar" ? 0 : 1)),
      group({ by: "link" })
    )
    .mark(ribbon({ fill: "decision", opacity: 0.55, curve: Curve.bezier() })),
]).render(container, { w: 420, h: 320, axes: false });
```

**Working spec, P2 shape** (`FrankenSankeyParts`): three charts, the bar and
the countries read the same link objects in their own order.

```js
layer([
  spread({ dir: "x", spacing: 150, alignment: "end" }, [
    spread({ dir: "x", spacing: 0, alignment: "end" }, [
      chart(areaRows, { color: FT, axes: false })
        .flow(
          spread({
            by: field("col").sort(),
            dir: "x",
            spacing: 22,
            alignment: "end",
          }),
          spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
        )
        .mark(rect({ w: 0, h: "value", fill: "decision" }).name("area")),
      chart(barRows, { axes: false }) // links sorted decision, then country
        .flow(spread({ dir: "y", spacing: 0 }))
        .mark(rect({ w: 14, h: "value", fill: "decision" }).name("ends")),
    ]),
    chart(asylumLinks)
      .flow(
        spread({
          by: field("country").sort(countryOrder),
          dir: "y",
          spacing: 6,
        }),
        spread({
          by: field("decision").sort(DECISIONS),
          dir: "y",
          spacing: 0,
          axes: false,
        })
      )
      .mark(rect({ w: 14, h: "value", fill: "decision" }).name("ends")),
  ]),
  chart(selectAll("area"))
    .flow(
      sortRefs((r) => project(r, "col")),
      group({ by: "decision" })
    )
    .mark(ribbon({ fill: "decision" })),
  chart(selectAll("ends"))
    .flow(group({ by: (r) => r.datum[0] }))
    .mark(ribbon({ fill: "decision", opacity: 0.55, curve: Curve.bezier() })),
]).render(container, { w: 420, h: 320, axes: false });
```

Both render the FT structure: area bottom-aligned, accepted on top, the bar
continuing the 2017 slice, ribbons crossing from decision-first to
country-first, nine country nodes with gaps. Missing: the y axis, year
ticks, the country labels on the right (P2 draws them on the left), the
FT annotation text.

**P1 target spelling:**

```js
const ends = concat(
  // NEW: two tables in one flow
  years, // { year, decision, value }: the area
  unpivot({
    on: ["bar", "country"],
    variable: "side",
    value: "node",
    id: "link",
  })(links)
); // links: { bar: "2017", country, decision, value }
chart(ends)
  .flow(
    spread({ by: "part", dir: "x", spacing: 150 }), // left (area + bar) | right
    spread({ by: field("year").sort(), dir: "x", spacing: 22 }),
    spread({ by: "node", dir: "y", spacing: 6 }), // countries; one group on the left
    stack({ by: field("rank").sort(), dir: "y" }) // rank DEPENDS ON SIDE:
  ) //   bar: decision|country, country: decision
  .mark(rect({ w: (d) => (d.side ? 14 : 0), h: "value", fill: "decision" }))
  .layer(ribbon({ by: "band", fill: "decision" })) // band = decision, area rows only
  .layer(ribbon({ by: "link", fill: "decision", opacity: 0.55 }));
```

Needs: a row union (`concat`) before the flow, a `part` column the user
invents, a per-side `rank` key the user computes, and a rule that a row whose
`by` key is missing joins no ribbon (otherwise `by: "decision"` would also
catch the link ends). The end order on each side is data the user writes.

**P2 target spelling:**

```js
spread({ dir: "x", spacing: 150 }, [
  spread({ dir: "x", spacing: 0 }, [
    chart(years)
      .flow(
        spread({ by: "year", dir: "x", spacing: 22 }),
        stack({ by: "decision", dir: "y" })
      )
      .mark(ribbon({ h: "value", fill: "decision" })), // today's stacked area (Area/Stacked)
    chart(links)
      .flow(stack({ by: ["decision", "country"], dir: "y" })) // decision-first
      .mark(rect({ w: 14, h: "value", fill: "decision" })),
  ]),
  chart(links)
    .flow(
      spread({ by: "country", dir: "y", spacing: 6 }),
      stack({ by: "decision", dir: "y" })
    ) // country-first
    .mark(rect({ w: 14, h: "value", fill: "decision" })),
]).layer(ribbon({ fill: "decision", opacity: 0.55 })); // same link object = one ribbon
```

Needs: `.layer` on a combinator (today it is a sibling in `layer([...])`);
one shared value scale across the three children (works today, see above);
scoping so the area's own fused ribbon and the outer ribbon do not see each
other's ends; a multi-key `stack({ by: [a, b] })` (or two tiers). The area
meets the bar by position only (spacing 0 and equal 2017 totals), not by a
join.

**Verdict: P2.** The per-side end order is just each child's own flow, and
the two ribbon identities live in different children. P1 can draw it (it
did), but the user writes the order on each side as a `rank` column and
invents `part`/`kind` columns to keep two tables apart in one flow.
**New requirements:** per-side end order; composing a stacked area with a
sankey (two ribbon identities in one picture, or a row union); labels on
the far side of a node; an explicit shared-vs-independent scale choice.

---

## 2. PiCCL "7 emotional school days"

**Data: read off the picture** (one drop = 1): peaceful SUN 13, SAT 7, FRI
6, THU 2, WED 10, TUE 14; stressed MON 1, SUN 1, SAT 1, FRI 3, THU 5, WED 4,
TUE 7; funny MON 3, SUN 8, SAT 2, FRI 4, THU 2, WED 7, TUE 11; diffident WED
2, TUE 3; trusted MON 3, SUN 3, SAT 3, FRI 3, THU 4, WED 1.

**The stress.** Vertical (dir y). Ends stacked along the bottom edge of a
day and the top edge of a glass, sized by count, each side ordered by the
far node.

**Working spec, P1 shape** (`SchoolDays`):

```js
const schoolEnds = schoolLinks.flatMap((l) => [
  {
    ...l,
    side: 0,
    node: DAYS.indexOf(l.day),
    key: EMOTIONS.indexOf(l.emotion),
  },
  {
    ...l,
    side: 1,
    node: EMOTIONS.indexOf(l.emotion),
    key: DAYS.indexOf(l.day),
  },
]);
layer([
  chart(schoolEnds, { color: SCHOOL })
    .flow(
      spread({
        by: field("side").sort(),
        dir: "y",
        spacing: 220,
        alignment: "middle",
        axes: false,
      }),
      spread({
        by: field("node").sort(),
        dir: "x",
        spacing: 36,
        alignment: "start",
        axes: false,
      }),
      spread({
        by: field("key").sort(),
        dir: "x",
        spacing: 0,
        alignment: "start",
        axes: false,
      })
    )
    .mark(
      rect({
        w: "count",
        h: (d) => (d.side === 0 ? 4 : 90),
        fill: "emotion",
      }).name("ends")
    ),
  chart(selectAll("ends"))
    .flow(
      sortRefs((r) => project(r, "side")),
      group({ by: "link" })
    )
    .mark(
      ribbon({ fill: "emotion", opacity: 0.6, dir: "y", curve: Curve.bezier() })
    ),
]).render(container, { w: 700, h: 420, axes: false });
```

**Working spec, P2 shape** (`SchoolDaysTwoRows`): the same, as two charts in
a `spread({ dir: "y", spacing: 200 })`, each with its own spacing (days 60,
glasses 50) and its own node labels:

```js
layer([
  spread({ dir: "y", spacing: 200, alignment: "middle" }, [
    chart(
      schoolLinks.map((l) => ({ ...l, side: 0 })),
      { color: SCHOOL }
    )
      .flow(
        spread({
          by: field("day").sort(DAYS),
          dir: "x",
          spacing: 60,
          alignment: "start",
        }),
        spread({
          by: field("emotion").sort(EMOTIONS),
          dir: "x",
          spacing: 0,
          axes: false,
        })
      )
      .mark(rect({ w: "count", h: 4, fill: "emotion" }).name("ends")),
    chart(schoolLinks.map((l) => ({ ...l, side: 1 })))
      .flow(
        spread({
          by: field("emotion").sort(EMOTIONS),
          dir: "x",
          spacing: 50,
          alignment: "start",
        }),
        spread({
          by: field("day").sort(DAYS),
          dir: "x",
          spacing: 0,
          axes: false,
        })
      )
      .mark(
        rect({ w: "count", h: 90, fill: "emotion", opacity: 0.85 }).name("ends")
      ),
  ]),
  chart(selectAll("ends"))
    .flow(
      sortRefs((r) => project(r, "side")),
      group({ by: "link" })
    )
    .mark(
      ribbon({ fill: "emotion", opacity: 0.6, dir: "y", curve: Curve.bezier() })
    ),
]).render(container, { w: 760, h: 420, axes: false });
```

(The rows are copied with a `side` tag only to sort the refs; with a
facing-edge ribbon the copies and the sort would go.) Both match the
reference's structure closely. Missing: glass images and the liquid level,
the drop rows under each glass, the left legend ribbons from the title to the
emotion labels (skipped: they are a second, decorative sankey from one
source), the staggered day labels.

**P1 target spelling:**

```js
chart(links) // { day, emotion, count }
  .flow(
    derive(
      unpivot({
        on: ["day", "emotion"],
        variable: "side",
        value: "node",
        id: "link",
      })
    ),
    spread({
      by: field("side").sort(["day", "emotion"]),
      dir: "y",
      spacing: 220,
    }),
    spread({
      by: field("node").sort([...DAYS, ...EMOTIONS]),
      dir: "x",
      spacing: 36,
    }), // ONE spacing for both rows
    stack({ by: field("rank").sort(), dir: "x" }) // rank = far node's index (decision 4)
  )
  .mark(
    rect({ w: "count", h: (d) => (d.side === "day" ? 4 : 90), fill: "emotion" })
  )
  .layer(ribbon({ by: "link", dir: "y", opacity: 0.6 }));
```

Needs: the far-node `rank` (or automatic end order), a per-row mark size
through an accessor, and it cannot give the two rows different spacing.

**P2 target spelling:**

```js
spread({ dir: "y", spacing: 200 }, [
  chart(links)
    .flow(
      spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60 }),
      stack({ by: field("emotion").sort(EMOTIONS), dir: "x" })
    )
    .mark(rect({ w: "count", h: 4, fill: "emotion" })),
  chart(links)
    .flow(
      spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50 }),
      stack({ by: field("day").sort(DAYS), dir: "x" })
    )
    .mark(rect({ w: "count", h: 90, fill: "emotion" })),
]).layer(ribbon({ dir: "y", opacity: 0.6 })); // same link object at both rows = one ribbon
```

The end order is exact with no rank key: in a bipartite layout the far
nodes are one row, so "stack by the far node's field, in the far row's
order" is the crossing-free order. (`cols(["day", "emotion"])` zipped with
`cols(["emotion", "day"])` would write the two children as one template, but
their spacing and height differ, so the template saves little.)

**Verdict: P2.** Two rows with different spacing, heights and labels are a
record of two charts; the end order falls out of the far row's sort.
**New requirements:** per-row spacing (P1 cannot express it); image nodes;
a node that is more than its ends (the glass body below the ends).

---

## 3. PiCCL Beatles

**Data: SYNTHETIC.** 40 real song titles; the writer sets are approximated
and not checked (most Lennon–McCartney songs given to one writer, 9 credited
to both, `Flying`/`Dig It` to all four, `What Goes On` to Lennon, McCartney,
Starr). The reference also has a fifth head with no lines; it is left out.

**The stress.** Thin lines, not width-coded, one per (song, writer); a
song's lines leave one point; at a head the ends are EQUAL size and spread
evenly along the top edge.

**Working spec, P2 shape** (`Beatles`):

```js
const songEnds = beatlesLinks.map((l) => ({
  ...l,
  key: WRITERS.indexOf(l.writer),
}));
layer([
  spread({ dir: "y", spacing: 260, alignment: "middle" }, [
    chart(songEnds, { color: BEATLES, axes: false })
      .flow(
        spread({
          by: field("si").sort(),
          dir: "x",
          spacing: 18,
          alignment: "start",
          axes: false,
        }),
        spread({ by: field("key").sort(), dir: "x", spacing: 0, axes: false })
      )
      .mark(rect({ w: 0, h: 3, fill: "writer" }).name("ends")), // a song's ends share one point
    chart(beatlesLinks)
      .flow(
        spread({
          by: field("writer").sort(WRITERS),
          dir: "x",
          spacing: 90,
          alignment: "start",
          axes: false,
        }),
        spread({ by: field("si").sort(), dir: "x", spacing: 3, axes: false })
      )
      .mark(rect({ w: 1, h: 3, fill: "writer" }).name("ends")), // equal-size ends, evenly spread
  ]),
  chart(selectAll("ends"))
    .flow(
      sortRefs((r) => (project(r, "key") === undefined ? 1 : 0)),
      group({ by: "link" })
    )
    .mark(
      line({
        stroke: "writer",
        strokeWidth: 1.5,
        dir: "y",
        curve: Curve.bezier(),
      })
    ),
  chart(selectAll("ends"))
    .flow(
      filter((r) => project(r, "key") === undefined),
      group({ by: "writer" })
    )
    .mark(
      enclose({
        shape: Shape.oval(),
        padding: 16,
        fill: "writer",
        stroke: "writer",
        fillOpacity: 0.35,
      })
    ),
]).render(container, { w: 820, h: 420, axes: false });
```

It reads as the reference: songs along the top, lines bending down into
four heads, co-written songs fanning to several heads, no crossings inside a
head. The flat P1 version (`ProbeBeatlesFlat`) draws the same lines but the
heads overlap, because songs and heads share one 12 px node spacing.
Missing: head and note images, the songs' staggered heights (each note sits
at its own y in the reference), the line color per song.

**P1 target spelling:**

```js
chart(credits) // { song, writer }: one row per credit
  .flow(
    derive(
      unpivot({
        on: ["song", "writer"],
        variable: "side",
        value: "node",
        id: "credit",
      })
    ),
    spread({
      by: field("side").sort(["song", "writer"]),
      dir: "y",
      spacing: 260,
    }),
    spread({ by: "node", dir: "x", spacing: 12 }), // FAILS: songs need 18, heads 90
    spread({ by: field("rank").sort(), dir: "x", spacing: 3 }) // EQUAL ends: spread of constant w
  )
  .mark(rect({ w: (d) => (d.side === "song" ? 0 : 1), h: 3, fill: "writer" }))
  .layer(line({ by: "credit", dir: "y", curve: Curve.bezier() }));
```

**P2 target spelling:**

```js
spread({ dir: "y", spacing: 260 }, [
  chart(credits)
    .flow(spread({ by: "song", dir: "x", spacing: 18 }), stack({ dir: "x" }))
    .mark(rect({ w: 0, h: 3 })), // one zero-width end per credit, all at the song
  chart(credits)
    .flow(
      spread({ by: "writer", dir: "x", spacing: 90 }),
      spread({ by: "song", dir: "x", spacing: 3 })
    )
    .mark(rect({ w: 1, h: 3, fill: "writer" })), // equal size, not value
]).layer(line({ stroke: "writer", dir: "y", curve: Curve.bezier() })); // same credit = one line
```

Ambiguity: if the song row drew one mark per song (a note), its ref's datum
is the bag of the song's credits, and "same datum" would have to match a bag
against one credit. The spelling avoids it by giving each credit its own
zero-width end. A real `line` over a node with several outgoing lines needs
the rule spelled out (one shared point, or a bag-contains match).

**Verdict: P2.** Two rows with very different spacing, and equal-size ends
are just a constant width in a `spread`. **New requirements:** equal-size
distributed ends work today in both shapes (constant `w` plus `spread`
spacing, not `stack`), so no new end allocator is needed, but a real
`ribbon`/`line` that allocates its own ends needs an end-size option (value
vs equal); per-row spacing; a per-node offset (staggered notes); image
nodes.

---

## 4. PiCCL trade chord

**Data: SYNTHETIC.** 24 countries in 6 regions; flow i→j =
size_i × size_j × (3 if same region) × seeded jitter, flows under a
threshold dropped, self flows for the United States and China only.
Asymmetric. About 640 paths in the picture.

**The stress.** Many nodes, region grouping (two gap sizes in θ),
asymmetric chords (each end has its own width), self chords.

**Working spec, P1 shape** (`TradeChord`): the hair-color chord recipe with
a region tier. Country gaps and region gaps are both invisible data rows
inside the polar stacks, because a polar `spread` with `spacing` does not
close the circle.

```js
layer({ coord: clock() }, [
  chart(tradeEnds, { color: TRADE })
    .flow(
      stack({
        by: field("region").sort(REGION_ORDER),
        dir: "x",
        y: 200,
        h: 12,
        axes: false,
      }),
      stack({ by: field("ci").sort(), dir: "x", axes: false }),
      stack({ by: field("sub").sort(), dir: "x", axes: false }) // sub = (j - i) mod N
    )
    .mark(
      rect({ w: "value", h: (d) => (d.gap ? 0 : 12), fill: "region" }).name(
        "ends"
      )
    ),
  chart(selectAll("ends"))
    .flow(
      filter((r) => project(r, "gap") === false),
      group({ by: "chord" })
    )
    .mark(chordRibbon({ fill: "color", opacity: 0.55 })), // THROWAWAY
]).render(container, { w: 520, h: 520, axes: false });
```

It reads as the reference's structure: region-colored arc groups with wider
gaps between regions, dense within-region chords, asymmetric bands. The
three-level stack (stack in stack in stack, with different child counts)
did not hit the stack scale bug here. Missing: country labels around the
ring; the reference's chords bow toward the ring for near neighbors and
self links, while the prototype always bends through the center (a
curve-tension option); the reference's black background.

**P1 target spelling:**

```js
layer({ coord: Coord.clock() }, [
  chart(cells) // one row per nonzero cell: { from, to, region, value, chord: sorted pair, color }
    .flow(
      spread({
        by: field("region").sort(REGIONS),
        dir: "x",
        spacing: 0.03,
        y: 200,
        h: 12,
      }),
      spread({ by: field("from").sort(order), dir: "x", spacing: 0.005 }),
      stack({ by: field("offset").sort(), dir: "x" }) // partner's position after me
    )
    .mark(rect({ w: "value", fill: "region" }))
    .layer(ribbon({ by: "chord", at: "bottom", fill: "color", opacity: 0.55 })),
]);
```

Needs: a polar spread whose spacing closes 2π (at two levels), `at:
"bottom"` with the screen-space curve, and a sub-arc order that depends on
the row (`offset = (j - i) mod N`, data the user computes).

**P2 target spelling:**

```js
const partners = cols(countries); // the matrix is wide: one column per partner
layer({ coord: Coord.clock() }, [
  chart(matrix) // { country, region, [partner]: value }
    .flow(
      spread({
        by: field("region").sort(REGIONS),
        dir: "x",
        spacing: 0.03,
        y: 200,
        h: 12,
      }),
      spread({ by: field("country").sort(order), dir: "x", spacing: 0.005 })
    )
    .mark(stack({ dir: "x" }, [rect({ w: partners, fill: "region" })]))
    .layer(
      ribbon({ by: chordPair, at: "bottom", fill: "color", opacity: 0.55 })
    ),
]);
```

Needs everything P1 needs, plus: the identity is not a datum (end (i, j)
and end (j, i) are two different cells), so "same datum = same ribbon"
does not apply and `by: chordPair` must read the row AND the column; the
expansion makes 24 children per row, and zero cells must make no end; the
per-row partner order (start after me) cannot be a column order fixed for
all rows.

**Verdict: P1.** The matrix's cells are already the ends; region grouping
is one more tier; the chord is two cells joined by a key. P2 has to fall
back to an explicit key. **New requirements:** region grouping as a nested
polar spread that closes the circle (two gap sizes); `at: "bottom"` and a
screen-space band curve (as in the earlier chord finding); a curve tension
that depends on the ends' angular distance; radial labels.

---

## Summary of new requirements

| Requirement                                  | Surfaced by                | P1                    | P2                           |
| -------------------------------------------- | -------------------------- | --------------------- | ---------------------------- |
| Per-side end order                           | FrankenSankey              | user `rank` per side  | each child's own flow        |
| Stacked area + sankey in one picture         | FrankenSankey              | row union, two `by`s  | sibling children             |
| Per-row spacing / sort / size                | School days, Beatles       | not expressible       | one chart per row            |
| Equal-size distributed ends                  | Beatles                    | constant `w` + spread | constant `w` + spread        |
| Shared vs independent value scale (explicit) | FrankenSankey, School days | implicit (one flow)   | implicit today, undocumented |
| Region grouping in θ, closing 2π             | Trade chord                | needs spacing fix     | needs spacing fix            |
| Identity that is not a datum                 | Trade chord                | `by: "chord"`         | `by: chordPair` fallback     |
| Image nodes, node body beyond its ends       | School days, Beatles       | out of scope          | out of scope                 |
| Labels on the far side / radial              | all                        | label proposal        | label proposal               |

The split is by data shape: bipartite pictures with two different rows (3
of 4) are records of rows and read better in P2; the matrix-shaped chord,
whose cells are already ends, reads better in P1. P2 also needs P1's
explicit `by` as a fallback for the chord, so the two are not exclusive.
