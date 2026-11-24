---
title: Spacing
---

# Spacing

The `Spacing` family holds the ways [`spread`](/js/api/operators/spread) sets
its neighbors apart along `dir`. A spacing is a value of spread's `spacing`
option, beside a bare amount. `Spacing.box(gap)` leaves a gap between the
facing edges of each child's box. `Spacing.pitch(distance, { at })` puts the
same point on each child a fixed distance from the last one. The `spacing` of
[`Constraint.distribute`](/js/api/constraints/relate#constraint-distribute) takes the
same values.

::: gofish example:ridgeline-chart
:::

## Signature

```ts
spread({ dir, spacing: Spacing.box(gap) });
spread({ dir, spacing: Spacing.pitch(distance, { at? }) });
spread({ dir, spacing: gap }); // the same as Spacing.box(gap)
```

A bare amount is `Spacing.box(amount)`: `spacing: 8` and
`spacing: Spacing.box(8)` lay the children out the same way. The amount is a
number of pixels, `percent(n)`, or `fr(k)`, in both members.

A spacing is a plain object, `{ kind, ...params }`, of type
`Spacing.Spacing`, for example `{ kind: "pitch", distance: 36, at: "baseline" }`.
The same object is the spacing's wire form.

The family is also a module of its own:

```ts
import { Spacing } from "gofish-graphics";
import { pitch } from "gofish-graphics/spacing"; // the same function as Spacing.pitch
```

## Members

| Member              | Measures from               | To                                                   | Depends on the children's sizes |
| ------------------- | --------------------------- | ---------------------------------------------------- | ------------------------------- |
| `Spacing.box()`     | the end of one child's box  | the start of the next child's box                    | yes                             |
| `Spacing.pitch()`   | the point `at` on one child | the point `at` on the next child                     | no                              |
| `Spacing.atLeast()` | the end of one child's box  | the start of the next child's box, at least `gap` on | yes                             |

`Spacing.atLeast(gap)` is a minimum gap, a placeholder name that is not yet
final. The exact constraints are solved first, and the minimum gaps then push
apart what they would put closer. Its `gap` is pixels only. A minimum gap
gives each child a range of positions, not one position, and the
[`slack`](/js/api/slack) of the spread or distribute that states it picks one.

`at` is `"start"`, `"middle"`, `"end"` or `"baseline"`. `"middle"` is center
to center. `"baseline"` is each child's local 0, which for a ribbon or a text
is its baseline, not an edge of its box.

## `Spacing.box()`

::: gofish-ref Spacing.box
:::

## `Spacing.pitch()`

::: gofish-ref Spacing.pitch
:::

## `Spacing.atLeast()`

::: gofish-ref Spacing.atLeast
:::

## Example

```ts
// Rows 36 px apart, baseline to baseline, whatever each row's height.
spread({
  by: "month",
  dir: "y",
  spacing: Spacing.pitch(36, { at: "baseline" }),
});

// Nodes as points: centers 70 units apart.
spread({ dir: "y", spacing: Spacing.pitch(70, { at: "middle" }) }, nodes);

// Columns with a 10 px gap between their edges.
spread({ by: "letter", dir: "x", spacing: Spacing.box(10) });
```

## See also

- [`spread`](/js/api/operators/spread)
- [`Constraint.distribute`](/js/api/constraints/relate#constraint-distribute)
- [`Slack`](/js/api/slack), where minimum gaps put what they leave room for
- [Underlying space](/internals/core/underlying-space), the essay on how a
  chain of children claims its room
