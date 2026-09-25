/* eslint-disable @typescript-eslint/ban-ts-comment -- hypothetical syntax, does not compile */
// @ts-nocheck
// SKETCH. Hypothetical syntax for build-in animations, for discussion only.
// Nothing here runs. Names that do not exist yet: time.stagger, time.parallel,
// time.after, animation.grow, animation.shrink, animation.fadeIn,
// animation.fadeOut, animation.appear, animation.wipe, animation.tween, and
// every .transition().
//
// Two namespaces (jmp, 2026-09-24):
//   time.*      = WHEN: sequence, stagger, parallel, transition, after.
//   animation.* = WHAT changes: effects, named by what they do, not by the
//                 phase they are used in (grow / shrink, fadeIn / fadeOut).
//
// Two kinds of time (cross-checked with the connected-scatterplot session,
// 2026-09-24):
//   time.sequence = DATA time. Groups come from a field and sit at its values.
//     Keys decide what happens: a key in consecutive groups moves, a new key
//     enters, a missing key exits (#892). `history` (approved) decides how long
//     past groups stay. AVL's Walmart stores are arrivals in data time:
//     time.sequence({ by: "openYear", history: Infinity }).
//   time.stagger = PRESENTATION time. The author picks the order. Items keep
//     once they arrive, by construction, so a stagger never needs `history`.
//     "One after another" is time.stagger({ spacing: 0 }).
//
// Two forms (after jmp's suggestions, 2026-09-24):
//
//   CHAINED (the common case, follows the static structure)
//     operator.transition({ enter, update, exit })  -> how its CHILDREN are
//       arranged in time for each phase: time.stagger / time.parallel.
//     mark.transition({ enter, update, exit })      -> how the MARK itself
//       looks in each phase: animation.grow / animation.fadeIn /
//       animation.tween / ..., each with its own duration and ease.
//
//   SELECTION (the long tail, when the timing regroups things)
//     .layer(chart(selectAll("name")).flow(<temporal operators>)
//                                    .mark(time.transition({ ... })))
//
// The chained form means the same as a selection form over that operator's
// children, so it is sugar. Lines marked "OPEN:" are unresolved.

import {
  chart,
  spread,
  stack,
  rect,
  field,
  selectAll,
  select,
  group,
  time,
  animation,
} from "gofish-graphics";

// ---------------------------------------------------------------------------
// 0. The static chart.
// ---------------------------------------------------------------------------

chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }));

// ---------------------------------------------------------------------------
// 1. All bars grow at once.
// ---------------------------------------------------------------------------

// Selection form.
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }).name("bars"))
  .layer(
    chart(selectAll("bars")).mark(
      time.transition({ enter: animation.grow({ duration: 600 }) })
    )
  );

// jmp suggestion
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(
    rect({ h: "frequency" }).transition({
      enter: animation.grow({ duration: 600 }),
    })
  );

// ---------------------------------------------------------------------------
// 2. THE TARGET. Bars grow one after another, left to right, overlapping.
//    Each bar starts 60 ms after the one before and grows over 600 ms.
// ---------------------------------------------------------------------------

// Selection form.
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(time.stagger({ by: "letter", lag: 60 }))
      .mark(time.transition({ enter: animation.grow({ duration: 600 }) }))
  );

// jmp suggestion
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({ lag: 60 }),
    })
  )
  .mark(
    rect({ h: "frequency" }).transition({
      enter: animation.grow({ duration: 600 }),
    })
  );

// ---------------------------------------------------------------------------
// 3. Variations. Only the arrangement or the effect changes.
// ---------------------------------------------------------------------------

// 3a. Tallest bar first. The order differs from the layout order, so the
//     stagger takes its own `by`. It means what `by` means everywhere: split
//     by this key and take the groups in the key's order. Here it is the
//     existing field expression that orders letters by frequency.
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({
        by: field("letter").sort("frequency", "desc"),
        lag: 60,
      }),
    })
  )
  .mark(
    rect({ h: "frequency" }).transition({
      enter: animation.grow({ duration: 600 }),
    })
  );

// 3b. From the middle outward (GSAP and Motion `from: "center"`).
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({ lag: 60, from: "center" }),
    })
  )
  .mark(
    rect({ h: "frequency" }).transition({
      enter: animation.grow({ duration: 600 }),
    })
  );

// 3c. Fix the shape instead of the lag. dwell = the share of the total time
//     spent between starts (Chevalier et al. 2014). 0 = all at once, 1 = one
//     after another with no overlap.
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({ dwell: 0.3 }),
    })
  )
  .mark(
    rect({ h: "frequency" }).transition({
      enter: animation.grow({ duration: 600 }),
    })
  );
// OPEN: how to say "the whole build takes 1.5 s".

// 3d. Pop in one at a time with no motion (Keynote / PowerPoint "Appear").
//     The paint-only reveal from animation.md section 9.5.
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({ lag: 120 }),
    })
  )
  .mark(rect({ h: "frequency" }).transition({ enter: animation.appear() }));

// 3e. Grow and fade together.
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({ lag: 60 }),
    })
  )
  .mark(
    rect({ h: "frequency" }).transition({
      enter: [
        animation.grow({ duration: 600 }),
        animation.fadeIn({ duration: 300 }),
      ],
    })
  );

// 3f. Name the effect once and reuse it (SwiftUI's `Animation.ripple`, Motion's
//     variant objects). Nothing new is needed for this; it is a JS value.
const growIn = animation.grow({ duration: 600, ease: "cubicOut" });
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({ lag: 60 }),
    })
  )
  .mark(rect({ h: "frequency" }).transition({ enter: growIn }));

// ---------------------------------------------------------------------------
// 4. Grouped bars.
// ---------------------------------------------------------------------------

// 4a. One group at a time. The bars inside a group grow together.
//     (Keynote "By Set", PowerPoint "By Category".)
chart(weather)
  .flow(
    spread({ by: "month", dir: "x" }).transition({
      enter: time.stagger({ lag: 300 }),
    }),
    spread({ by: "city", dir: "x", spacing: 0 })
  )
  .mark(
    rect({ h: "precipitation", fill: "city" }).transition({
      enter: animation.grow({ duration: 400 }),
    })
  );

// 4b. One group at a time, and the bars inside each group also staggered.
//     (Keynote "By Element in Set".) Nested operators nest the time frames,
//     as Canis's nested grouping does. The inner stagger starts when its
//     month starts.
chart(weather)
  .flow(
    spread({ by: "month", dir: "x" }).transition({
      enter: time.stagger({ lag: 300 }),
    }),
    spread({ by: "city", dir: "x", spacing: 0 }).transition({
      enter: time.stagger({ lag: 50 }),
    })
  )
  .mark(
    rect({ h: "precipitation", fill: "city" }).transition({
      enter: animation.grow({ duration: 400 }),
    })
  );
// Timing: each month lasts 2 × 50 + 400 = 500 ms (three cities), and months
// start 300 ms apart, so neighboring months overlap by 200 ms.

// 4c. One city at a time across all months. (Keynote "By Series".) This
//     REGROUPS: in space the months are outside and the cities inside, and
//     in time it is the other way around. So it needs the selection form.
chart(weather)
  .flow(
    spread({ by: "month", dir: "x" }),
    spread({ by: "city", dir: "x", spacing: 0 })
  )
  .mark(rect({ h: "precipitation", fill: "city" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(time.stagger({ by: "city", spacing: 0 })) // one city after another
      .mark(time.transition({ enter: animation.grow({ duration: 400 }) }))
  );
// City order is presentation time, so it is a stagger, and city A's bars stay
// when city B's arrive. `history` is only for data time (time.sequence).

// ---------------------------------------------------------------------------
// 5. Stacked bars.
// ---------------------------------------------------------------------------

// 5a. Whole stacks, left to right.
chart(seattle)
  .flow(
    spread({ by: "month", dir: "x" }).transition({
      enter: time.stagger({ lag: 80 }),
    }),
    stack({ by: "weather", dir: "y" })
  )
  .mark(
    rect({ h: "count", fill: "weather" }).transition({
      enter: animation.grow({ duration: 500 }),
    })
  );

// 5b. Whole stacks left to right, and inside each stack the bottom segment
//     first. Follows the static structure, so it stays chained.
chart(seattle)
  .flow(
    spread({ by: "month", dir: "x" }).transition({
      enter: time.stagger({ lag: 80 }),
    }),
    stack({ by: "weather", dir: "y" }).transition({
      enter: time.stagger({ spacing: 0 }),
    })
  )
  .mark(
    rect({ h: "count", fill: "weather" }).transition({
      enter: animation.grow({ duration: 200 }),
    })
  );
// OPEN: does a segment grow in place from its stack start (ECharts), ride on
//       the segments below it (amCharts), or start at the axis (Chart.js)?
//       In 5a "ride" is a straight tween from the zero layout. In 5b it needs
//       the stack's placement on every frame.

// ---------------------------------------------------------------------------
// 6. Update and exit phases. Each phase gets its own arrangement, so the same
//    method covers ECharts' separate `animationDelayUpdate` and D3's
//    staggered re-sort.
// ---------------------------------------------------------------------------

// 6a. The race with a staggered re-sort each year (D3 Sortable Bar Chart:
//     `.delay((d, i) => i * 20)` on the update). Entrants fade in and leavers
//     fade out, as #892 ships.
chart(brands)
  .flow(
    time.sequence({ by: "year" }),
    spread({
      by: field("name").sort("value", "desc"),
      dir: "y",
      sharedScale: true,
    }).transition({ update: time.stagger({ lag: 20 }) })
  )
  .mark(
    rect({ w: "value", fill: "category" }).transition({
      enter: animation.fadeIn(),
      update: animation.tween({ curve: "linear" }),
      exit: animation.fadeOut(),
    })
  );
// DEFAULT FOR NOW (revisit once there are many examples): a stagger inside a
// sequence FITS inside each stretch between keyframes. The race moves from one
// year to the next in 250 ms, so the lag and each bar's move shrink together
// until the last bar arrives at 250 ms. The dwell (the share of the time spent
// between starts) stays the same. The alternatives were to let late bars spill into the next
// year's move (and get redirected mid-move) or to lengthen each year. Fit is
// the time version of shrinking children to fit their parent, and it keeps
// every year's layout true at its keyframe.

// 6b. Build in left to right, and when the data changes, exit right to left.
chart(alphabet)
  .flow(
    spread({ by: "letter", dir: "x" }).transition({
      enter: time.stagger({ lag: 60 }),
      exit: time.stagger({ lag: 60, from: "last" }),
    })
  )
  .mark(
    rect({ h: "frequency" }).transition({
      enter: animation.grow({ duration: 600 }),
      exit: animation.shrink({ duration: 300 }),
    })
  );
// shrink is its own effect because of what it does (collapse to the
// baseline), not because it is used for exits. Compose names its pairs the
// same way (expandVertically / shrinkVertically, fadeIn / fadeOut).

// ---------------------------------------------------------------------------
// 7. Chrome: axes first, then the bars. OPEN (jmp: revisit after exploring
//    custom axes). If axes become chrome that belongs to a node (the
//    recursive-axes thread), the operator that owns an axis could time it
//    through its own .transition(), e.g., Keynote's "Background First".
// ---------------------------------------------------------------------------

// Selection form with a Canis-style reference, kept for comparison.
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }).name("bars"))
  .layer(
    chart(select("axes"))
      .mark(time.transition({ enter: animation.fadeIn({ duration: 300 }) }))
      .name("axesIn")
  )
  .layer(
    chart(selectAll("bars"))
      .flow(time.stagger({ by: "letter", lag: 60 }))
      .mark(
        time.transition({
          enter: animation.grow({ duration: 600 }),
          after: "axesIn",
        })
      )
  );

// ---------------------------------------------------------------------------
// 8. The race: today, chained, and desugared.
// ---------------------------------------------------------------------------

// Today (BarChartRace.stories.tsx):
chart(brands)
  .flow(
    time.sequence({ by: "year" }),
    spread({
      by: field("name").sort("value", "desc"),
      dir: "y",
      sharedScale: true,
    })
  )
  .mark(rect({ w: "value", fill: "category" }))
  .layer(time.transition({ curve: "linear" }));

// Chained: the mark says how it moves between years. With no .transition()
// the chart steps from year to year, as time.sequence alone does today.
chart(brands)
  .flow(
    time.sequence({ by: "year" }),
    spread({
      by: field("name").sort("value", "desc"),
      dir: "y",
      sharedScale: true,
    })
  )
  .mark(
    rect({ w: "value", fill: "category" }).transition({
      update: animation.tween({ curve: "linear" }),
    })
  );

// Desugared: `group` superimposes the years in space (as the gapminder tower
// found), and the temporal flow places them on t.
chart(brands)
  .flow(
    group({ by: "year" }),
    spread({
      by: field("name").sort("value", "desc"),
      dir: "y",
      sharedScale: true,
    })
  )
  .mark(rect({ w: "value", fill: "category" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(time.sequence({ by: "year" })) // data time: a name in consecutive years moves
      .mark(time.transition({ update: animation.tween({ curve: "linear" }) })) // key = complement = name
  );
