/* eslint-disable @typescript-eslint/ban-ts-comment -- hypothetical syntax, does not compile */
// @ts-nocheck
// SKETCH. Canis, CAST and CAST+ examples in the two hypothetical forms from
// bar-grow-in.ts. Nothing here runs.
//
//   CHAINED when the Canis grouping follows the chart's spatial nesting:
//     operator.transition({ enter: <arrangement of its children> })
//     mark.transition({ enter: <effect> })
//   SELECTION when the grouping regroups the marks:
//     .layer(chart(selectAll("x")).flow(<temporal operators>).mark(time.transition(...)))
//
// The mapping from Canis:
//   "selector"                                -> the node the .transition() hangs on,
//                                                or chart(selectAll("name"))
//   "grouping" (nested)                       -> nested operators, each with
//                                                .transition(), or chained temporal
//                                                operators in a selection flow
//   "groupBy" + "sort" on the same field      -> time.stagger({ by: "field" })
//   "reference": "start after previous"       -> time.stagger({ spacing: 0 })
//   "reference": "start with previous" + delay -> time.stagger({ lag })
//   "delay": { field, minDelay }              -> placement on t by a field value
//   "effects": [{ type, duration }]           -> mark.transition({ enter: animation.<effect>({ duration }) })
//
// Canis JSON is quoted from the papers (Canis EuroVis 2020 Fig. 1b; CAST
// CHI 2021 Fig. 3; CAST+ TVCG 2025 Fig. 8). Lines marked "OPEN:" are unresolved.

import {
  chart,
  spread,
  stack,
  scatter,
  rect,
  circle,
  text,
  field,
  selectAll,
  time,
  animation,
  createMark,
} from "gofish-graphics";

// ---------------------------------------------------------------------------
// 1. Canis Fig. 1(b). Stacked bars: one series after another, and inside each
//    series the bars start 100 ms apart. Each bar wipes up from the bottom.
//    REGROUPS: in space the quarters are outside and the products (series)
//    inside the stack. Canis times products outside and quarters inside.
// ---------------------------------------------------------------------------
//
// {"charts": [{"source": "./stackBar.dsvg"}],
//  "animations": [{
//    "selector": ".rectangle",
//    "grouping": {"groupBy": "class", "reference": "start after previous",
//                 "grouping": {"groupBy": "id", "delay": 100}},
//    "effects": [{"type": "wipe bottom"}]}]}

chart(sales)
  .flow(spread({ by: "quarter", dir: "x" }), stack({ by: "product", dir: "y" }))
  .mark(rect({ h: "revenue", fill: "product" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(
        time.stagger({ by: "product", spacing: 0 }), //        groupBy class, start after previous
        time.stagger({ by: "quarter", lag: 100 }) //            groupBy id, delay 100
      )
      .mark(time.transition({ enter: animation.wipe({ from: "bottom" }) })) // effects
  );

// The same build timed the way the chart is nested (whole stacks left to
// right, bottom segment first inside each) stays chained:
chart(sales)
  .flow(
    spread({ by: "quarter", dir: "x" }).transition({
      enter: time.stagger({ lag: 100 }),
    }),
    stack({ by: "product", dir: "y" }).transition({
      enter: time.stagger({ spacing: 0 }),
    })
  )
  .mark(
    rect({ h: "revenue", fill: "product" }).transition({
      enter: animation.wipe({ from: "bottom" }),
    })
  );

// ---------------------------------------------------------------------------
// 2. CAST Fig. 3. The title fades in. Then the dots appear one at a time,
//    100 ms apart, in order of unemployment rate.
// ---------------------------------------------------------------------------
//
// "animations": [
//   {"selector": ".title", "effects": [{"type": "fade", "duration": 300}]},
//   {"reference": "start after previous", "selector": ".dot",
//    "grouping": {"groupBy": "id", "delay": 100,
//                 "sort": {"field": "rate", "order": "ascending"}},
//    "effects": [{"type": "circle", "duration": 500}]}]

chart(counties)
  .flow(
    scatter({ by: "id", x: "income", y: "education" }).transition({
      enter: time.stagger({ by: "rate", lag: 100 }),
    })
  )
  .mark(
    circle({ r: 3, fill: "rate" }).transition({
      enter: animation.wipe({ shape: "circle", duration: 500 }),
    })
  );
// OPEN: the title fading in first. That is chrome, like the axes in
//       bar-grow-in.ts section 7, so it waits on the custom-axes exploration.

// ---------------------------------------------------------------------------
// 3. CAST+ Fig. 8. Nested selection. For each category, its label appears,
//    then its bar, then the next category. CAST+ added nested selection
//    because grouping labels and bars separately forced the author to line
//    up two sets of delays by hand.
// ---------------------------------------------------------------------------
//
// "animations": [{
//   "grouping": {
//     "groupBy": "Category",
//     "selector": ".y-axis-label, .rectangle",
//     "nested": [
//       {"selector": ".y-axis-label", "reference": "start after previous", "effects": [{"duration": 200}]},
//       {"selector": ".rectangle",    "reference": "start after previous", "effects": [{"duration": 200}]}]}}]

// Ordering a mark's own parts drops to the lower level (jmp, 2026-09-24): a
// direct-style mark built from parts, where the same rule applies. An
// operator's .transition() arranges its children, and here the children are
// the label and the body.
const LabeledBar = createMark(
  ({ category, amount }) =>
    spread({ dir: "x", spacing: 4 }, [
      text({ text: category }).transition({
        enter: animation.fadeIn({ duration: 200 }),
      }),
      rect({ w: amount }).transition({
        enter: animation.grow({ duration: 200 }),
      }),
    ]).transition({ enter: time.stagger({ spacing: 0 }) }) // label, then body
);

// The same order written as a temporal constraint over named parts, the way
// Constraint.align relates parts in space (NodeLink.stories.tsx):
const LabeledBar2 = createMark(
  ({ category, amount }) =>
    spread({ dir: "x", spacing: 4 }, [
      text({ text: category })
        .name("label")
        .transition({ enter: animation.fadeIn({ duration: 200 }) }),
      rect({ w: amount })
        .name("body")
        .transition({ enter: animation.grow({ duration: 200 }) }),
    ]).constrain(({ label, body }) => [time.after(label, body)]) // body starts when label ends
);

chart(budget)
  .flow(
    spread({ by: "category", dir: "y" }).transition({
      enter: time.stagger({ spacing: 0 }),
    })
  )
  .mark((d) => LabeledBar(d));
// The spread's grouping by category holds each label with its bar, so there
// is no second selector. That is the CAST+ fix, and here it comes from the
// spatial structure.
// `spacing: 0` = each child starts when the one before it ends (Canis's
// "start after previous"), using spread's word for the gap between items.
// OPEN: how data reaches a createMark mark inside .mark(). The stories only
//       call these marks with literal props.

// ---------------------------------------------------------------------------
// 4. Canis data-driven delay. Each mark's start time comes from a field,
//    "obtained by linear interpolation based on the attribute values."
// ---------------------------------------------------------------------------
//
// "grouping": {"groupBy": "id", "delay": {"field": "rate", "minDelay": 50}}

// Selection form: a numeric `by` places each group at its own value on the
// time scale, the way time.sequence({ by: "year" }) places each year today.
chart(counties)
  .flow(scatter({ by: "id", x: "income", y: "education" }))
  .mark(circle({ r: 3 }).name("dots"))
  .layer(
    chart(selectAll("dots"))
      .flow(time.sequence({ by: "rate", duration: 3000, history: Infinity }))
      .mark(time.transition({ enter: animation.fadeIn({ duration: 400 }) }))
  );
// This stays a time.sequence because it reads rate AS data time: each dot is
// an arrival in data time, like AVL's Walmart stores by opening year, and
// `history: Infinity` keeps it after its moment.
// This is not the same as time.stagger({ by: "rate" }). That staggers in
// RANK order with even gaps, the way spread places items. Canis spaces the
// starts by the VALUE, the way scatter places items, so two close rates start
// close together.
// OPEN: a chained form for value spacing (the temporal counterpart of scatter).

// ---------------------------------------------------------------------------
// 5. CAST+ Gantt scenario. Tasks wipe in from the left one after another,
//    and each task's wipe lasts in proportion to the task's length. Follows
//    the static structure, so it is chained.
// ---------------------------------------------------------------------------

chart(tasks)
  .flow(
    spread({ by: field("task").sort("start"), dir: "y" }).transition({
      enter: time.stagger({ spacing: 0 }),
    })
  )
  .mark(
    rect({ x: "start", w: "days" }).transition({
      enter: animation.wipe({ from: "left", duration: "days" }),
    })
  );
// `duration: "days"` is a size claim on t from a field, the way `w: "days"` is
// a size claim on x. The sequence lays the tasks back to back, so each one
// starts when the one before it finishes.
// OPEN: the time scale for a field-valued duration (days -> ms).

// ---------------------------------------------------------------------------
// 6. CAST Scenario 2 (Mekko chart). Build the chart one segment at a time
//    across all regions. REGROUPS (regions outside in space, segments
//    outside in time), so it is a selection.
// ---------------------------------------------------------------------------

chart(market)
  .flow(
    spread({ by: "region", dir: "x", w: "total" }),
    stack({ by: "segment", dir: "y" })
  )
  .mark(rect({ h: "share", fill: "segment" }).name("cells"))
  .layer(
    chart(selectAll("cells"))
      .flow(time.stagger({ by: "segment", spacing: 0 }))
      .mark(
        time.transition({
          enter: animation.wipe({ from: "bottom", duration: 400 }),
        })
      )
  );
