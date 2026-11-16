---
title: Baseline
---

# Baseline

The `Baseline` family holds the places a stack can put its own 0. A baseline is
the value of the `baseline` option of [`stack`](/js/api/operators/stack). The
parent of a stack lines its baseline up with the baselines of its other
children, so in a bar chart every stack starts from one line.

::: gofish

```js
gf.chart(seafood)
  .flow(
    gf.spread({ by: "lake", dir: "x" }),
    gf.stack({ by: "species", dir: "y", baseline: gf.Baseline.middle() })
  )
  .mark(gf.rect({ h: "count", fill: "species" }))
  .render(root, { w: 400, h: 400 });
```

:::

## Signature

```ts
Baseline.start; // or Baseline.start()
Baseline.end; // or Baseline.end()
Baseline.middle; // or Baseline.middle()
Baseline.wiggle; // or Baseline.wiggle()
Baseline.at(part, point);
```

A stack lays its parts end to end. Each part has a tail and a head, and the
tail of each part is on the head of the one before it. The start of the stack
is the tail of its first part, and its end is the head of its last part.

`Baseline.at` has two required arguments, so it is a call only. The other
members are values as they are, and `Baseline.start` and `Baseline.start()` are
the same baseline. A baseline is a plain object, `{ kind, ...params }`, of type
`Baseline.Baseline`, for example `{ kind: "at", part: "Neutral", point: 0.5 }`.
The same object is the baseline's wire form.

The family is also a module of its own:

```ts
import { Baseline } from "gofish-graphics";
import { middle } from "gofish-graphics/baseline"; // the same value as Baseline.middle
```

## Members

| Member                     | Where the stack's 0 is                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `Baseline.start()`         | The start of the stack. The default.                                                       |
| `Baseline.end()`           | The end of the stack, so the parts lie before 0.                                           |
| `Baseline.middle()`        | Halfway from the start of the stack to its end (d3's `stackOffsetSilhouette`).             |
| `Baseline.wiggle()`        | A line that keeps the bands of a streamgraph as flat as it can (d3's `stackOffsetWiggle`). |
| `Baseline.at(part, point)` | A point on one part.                                                                       |

With `start`, `end` and `at`, the stack's 0 is data 0, and a position on its
axis is an amount from 0. A stack of parts that are all nonnegative amounts
then has an axis that counts up from 0 on both sides of it. With `middle` and
`wiggle`, the stack's 0 is not data 0, so a position on its axis is not an
amount. Its axis shows only differences. The stack's 0 is still its baseline,
and a parent with `alignment: "baseline"` lines it up with the baselines of
its other children, so rows of centered stacks share one middle.

`Baseline.wiggle()` moves its 0 along the cross axis. At each place, the slope
of the 0 is the average slope of the middles of the parts, weighted by their
thickness (Byron and Wattenberg 2008). Over parts that are boxes, every slope
is 0, so it is the same as `Baseline.start()`.

## `Baseline.at(part, point)`

| Argument | Type                                                   | Description                                                                                                                                        |
| -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `part`   | `string \| number`                                     | The part: a value of the `by` column in a flow, or a child index in the combinator form.                                                           |
| `point`  | `number \| "start" \| "middle" \| "end" \| "baseline"` | A fraction of the way from the part's tail to its head (0 is the tail, 1 the head), or one of the part's anchors. `"baseline"` is the part's tail. |

```js
gf.chart(survey, {
  schema: { response: gf.Unit({ domain: gf.Domain.discrete(LEVELS) }) },
})
  .flow(
    gf.spread({ by: "question", dir: "y" }),
    gf.stack({
      by: "response",
      dir: "x",
      baseline: gf.Baseline.at("Neutral", 0.5),
    })
  )
  .mark(gf.rect({ w: "count", fill: "response" }));
```

A part that the data lacks takes no room, and the baseline falls on the
boundary where the part would be. The stack finds that boundary from the order
of the `by` column, so the column must declare its levels with
`Domain.discrete(levels)` in the chart's `schema`. Without them, a baseline on
a missing part is an error.

`Trait.diverging()` on the unit of the `by` column is `Baseline.at` at the
midpoint of the column's order. A stack over such a column takes no
`baseline` option: the trait already puts its 0, and giving both is an error.

## On `spread`

`spread` has a `baseline` option too, but it does not take one yet: a spread
with a baseline is an error. `Baseline.wiggle()` is for `stack` only.
