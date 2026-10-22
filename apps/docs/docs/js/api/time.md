---
title: time
---

# time

The `time` namespace holds the constructs that lay a chart out in time:
`time.sequence` (one keyframe per value of a field), `time.history` (keep
marks on screen after their keyframe), `time.transition` (the mark that moves
between keyframes, or a build-in), and `time.stagger` / `time.parallel` (how
children are arranged in time). The [Animation guide](/js/animation) explains
how they fit together.

```ts
const year = timer({ domain: [1955, 2005], duration: 10000 });

chart(gapminder, { legend: false })
  .flow(
    time.sequence({ by: "year", on: year }),
    scatter({ by: "country", x: "fertility", y: "life_expect" })
  )
  .mark(
    layer([
      time.history([circle({ r: 4, fill: "country", opacity: 0.3 })]),
      circle({ r: 4, fill: "country" }).transition({
        update: Animation.tween({ curve: Curve.monotone() }),
      }),
    ])
  )
  .render(container, { w: 500, h: 400 });
```

## Signature

```ts
time.sequence({ by, duration?, loop?, playing?, at?, on?, cyclic? })
time.history({ last? })            // in .flow(...)
time.history([marks])              // around marks
time.history({ last? }, [marks])
time.transition({ along?, at?, curve?, ease?, enter?, exit?, fill?, stroke?, strokeWidth?, opacity? })
time.stagger({ lag?, spacing?, dwell?, by?, from? })
time.parallel()
```

## Parameters

::: gofish-ref time.sequence time.history time.transition time.stagger time.parallel
:::

`time.transition`'s `ease` is a JavaScript function, so it has no serialized
form. `on` and `at` take a clock, such as a `timer()`: on the wire it is a read
of the document's `sources` table.

Each construct serializes. A chart that uses them crosses the frontend IR, and
a `timer()` it reads crosses as a source.
