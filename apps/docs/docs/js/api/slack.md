---
title: Slack
---

# Slack

The `Slack` family holds the rules for where children go when minimum gaps
([`Spacing.atLeast`](/js/api/spacing)) leave them room. A rule is the value of
the `slack` option of [`layer`](/js/api/operators/layer), one per axis, and of
[`spread`](/js/api/operators/spread), along its `dir`.

A minimum gap gives each child a range of positions, not one position. The
least solution puts every child as early as its gaps allow. The greatest
solution puts every child as late as its gaps allow, within the span of the
least solution. A child's slack is the difference between the two. A rule
picks one point in each child's range, the same fraction of the way for
every child.

::: gofish

```js
gf.layer({ slack: { x: gf.Slack.end() } }, [
  gf.rect({ w: 60, h: 24, fill: "#a8dadc" }).name("a"),
  gf.rect({ w: 40, h: 24, fill: "#e63946" }).name("q"),
  gf.rect({ w: 60, h: 24, fill: "#a8dadc" }).name("b"),
])
  .relate((c) => [
    gf.Constraint.distribute({ dir: "x", spacing: gf.Spacing.atLeast(10) }, [
      c.a,
      c.q,
      c.b,
    ]),
    gf.Constraint.distribute({ dir: "x", spacing: gf.Spacing.atLeast(200) }, [
      c.a,
      c.b,
    ]),
    gf.Constraint.align({ y: "start" }, [c.a, c.q, c.b]),
  ])
  .render(root, { w: 400, h: 60 });
```

:::

## Signature

```ts
Slack.start; // or Slack.start()
Slack.center; // or Slack.center()
Slack.end; // or Slack.end()
Slack.at(t);

layer({ slack: { x?: Slack, y?: Slack } }, children);
spread({ dir, spacing: Spacing.atLeast(gap), slack: Slack });
```

`Slack.at` has one required argument, so it is a call only. The other members
are values as they are, and `Slack.end` and `Slack.end()` are the same rule. A
rule is a plain object, `{ kind: "at", t }`, of type `Slack.Slack`.
`Slack.start()`, `Slack.center()` and `Slack.end()` make the objects of
`Slack.at(0)`, `Slack.at(0.5)` and `Slack.at(1)`. The same object is the rule's
wire form.

A layer solves its constraints on each axis together, so it takes one rule per
axis. Its keys are axis names in the scope of its children: `x`, `y`, or a
name the enclosing coordinate space declares. An axis it leaves out takes
`Slack.start()`. A spread solves its own chain, and its rule applies along its
`dir`. A rule on an axis with no minimum gaps changes nothing.

The family is also a module of its own:

```ts
import { Slack } from "gofish-graphics";
import { end } from "gofish-graphics/slack"; // the same value as Slack.end
```

## Members

| Member           | Where each child goes                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| `Slack.start()`  | Where the least solution puts it, as early as its gaps allow. The default. |
| `Slack.center()` | Halfway between the least and the greatest solution.                       |
| `Slack.end()`    | Where the greatest solution puts it, as late as its gaps allow.            |
| `Slack.at(t)`    | A fraction `t` of the way from the least solution to the greatest.         |

`Slack.at(t)` puts each child at least + t × (greatest − least), where least
and greatest are its places in the two solutions. `t` is from 0 to 1, and any
other value is an error.

## `Slack.at(t)`

::: gofish-ref Slack.at
:::

## See also

- [`Spacing`](/js/api/spacing), whose `Spacing.atLeast` makes minimum gaps
- [`layer`](/js/api/operators/layer)
- [`spread`](/js/api/operators/spread)
- [`Constraint.distribute`](/js/api/constraints/relate#constraint-distribute)
- [Underlying space](/internals/core/underlying-space), the essay on how a
  scope solves its constraints
