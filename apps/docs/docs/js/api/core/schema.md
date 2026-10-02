# Schema

Declares the types of a chart's columns. Pass a record of column types as the
`schema` option of [`chart`](/js/api/core/chart).

::: gofish example:diverging-likert-chart
:::

## Signature

```ts
Schema.ordered(levels); // HasOrder
Schema.ordered(levels).diverging(); // HasOrder and HasCenter
```

A column type is a set of classes. Each builder method adds one class, and
`.diverging()` exists only after `.ordered(...)`, because a center needs an
order.

| Builder                  | Class       | Meaning                                                                                                                                |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Schema.ordered(levels)` | `HasOrder`  | The column's values are `levels`, in this order.                                                                                       |
| `.diverging()`           | `HasCenter` | The order has a center: the middle level when the number of levels is odd, the boundary between the two middle levels when it is even. |

## Parameters

| Parameter | Type                   | Description                                  |
| --------- | ---------------------- | -------------------------------------------- |
| `levels`  | `(string \| number)[]` | Every value the column takes, first to last. |

## Behavior

**`HasOrder`.**

- Every `by` split over the column (`spread`, `stack`, `group`, `scatter`, ...)
  lays its groups out in the order of `levels`, not in order of first
  appearance. A `field(...).sort(...)` or `.reverse()` on the `by` reorders
  from there.
- A categorical color scale whose values all come from the column lists its
  legend in the same order.
- A value that is not in `levels` is an error that names the column and the
  value. Add it to the levels, or filter those rows out.

**`HasCenter`.**

- A [`stack`](/js/api/operators/stack) whose `by` column has `HasCenter` puts
  its 0 at the center of the order instead of at its first part's start. Half
  of a middle level lies on each side.
- The center comes from the order, not from the data: a stack with no part for
  some level keeps the same center. So the stacks of a `spread` line up on
  their centers.
- The parts of a centered stack must be nonnegative. A negative value is an
  error.
- An axis over a centered stack labels each tick with its distance from the
  center (`60 40 20 0 20 40 60`).
- The parts must follow the column's order, or its reverse. Reordering them
  some other way is an error.

## Example

```ts
const LEVELS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];

chart(survey, {
  schema: { response: Schema.ordered(LEVELS).diverging() },
  axes: true,
})
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" })
  )
  .mark(rect({ w: "count", fill: "response" }))
  .render(container, { w: 640, h: 300 });
```

A population pyramid is a two-level diverging order, with positive counts on
both sides:

```ts
chart(population, {
  schema: { sex: Schema.ordered(["Women", "Men"]).diverging() },
})
  .flow(
    spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
    stack({ by: "sex", dir: "x" })
  )
  .mark(rect({ w: "people", fill: "sex" }));
```

::: gofish example:population-pyramid hidden
:::
