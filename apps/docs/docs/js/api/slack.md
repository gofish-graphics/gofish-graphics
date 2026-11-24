---
title: Slack
---

# Slack

The `Slack` family holds the rules for where children go when minimum gaps
leave them room. A rule is the value of the `slack` option of
[`Spacing.atLeast`](/js/api/spacing), the spacing of a
[`spread`](/js/api/operators/spread) or a
[`Constraint.distribute`](/js/api/constraints/relate#constraint-distribute),
along their `dir`.

A minimum gap gives each child a range of positions, not one position. The
least solution puts every child as early as its gaps allow. The greatest
solution puts every child as late as its gaps allow, within the span of the
least solution. A child's slack is the difference between the two. A rule
picks one point in each child's range, the same fraction of the way for
every child.

::: gofish

```js
gf.layer([
  gf.rect({ w: 60, h: 24, fill: "#a8dadc" }).name("a"),
  gf.rect({ w: 40, h: 24, fill: "#e63946" }).name("q"),
  gf.rect({ w: 60, h: 24, fill: "#a8dadc" }).name("b"),
])
  .relate((c) => [
    gf.Constraint.distribute(
      { dir: "x", spacing: gf.Spacing.atLeast(10, { slack: gf.Slack.end() }) },
      [c.a, c.q, c.b]
    ),
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

Spacing.atLeast(gap, { slack: Slack });
```

`Slack.at` has one required argument, so it is a call only. The other members
are values as they are, and `Slack.end` and `Slack.end()` are the same rule. A
rule is a plain object, `{ kind: "at", t }`, of type `Slack.Slack`.
`Slack.start()`, `Slack.center()` and `Slack.end()` make the objects of
`Slack.at(0)`, `Slack.at(0.5)` and `Slack.at(1)`. They fix `t` and take no
options, so another fraction is `Slack.at(t)`. The same object is the rule's
wire form.

Only `Spacing.atLeast` takes a rule. The other spacings leave no room to
place.

Minimum gaps that share children are linked, and linked gaps share one room,
so they share one rule. In the example above, the two distributes share `a`
and `b`. The first states `Slack.end()`, and the second, which states no rule,
takes it. Two linked minimum gaps that state different rules are an error that
names both. Gaps that share no children, even in one layer, each take their
own rule. Where no linked gap states a rule, the rule is `Slack.start()`.

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
- [`spread`](/js/api/operators/spread)
- [`Constraint.distribute`](/js/api/constraints/relate#constraint-distribute)
- [Underlying space](/internals/core/underlying-space), the essay on how a
  scope solves its constraints
