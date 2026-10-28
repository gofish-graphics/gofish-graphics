# mix

```ts
mix(a, b, t);
```

Mixes color `a` toward color `b` by `t` (`0` to `1`) and returns the resulting
color. The mix is paint-like (Kubelka–Munk, via spectral.js), so blue and
yellow make green, not gray. `t = 0` returns `a`'s color, and `t = 1` returns
`b`'s, written as `#rrggbb` or `rgba(r, g, b, a)` (see the table below).

| Parameter | Type     | Description                           |
| --------- | -------- | ------------------------------------- |
| `a`       | `string` | The starting color                    |
| `b`       | `string` | The color to mix toward               |
| `t`       | `number` | How far to mix toward `b`, `0` to `1` |

`a` and `b` take any CSS color: hex, `rgb()` with commas or spaces, `hsl()`,
`oklch()`, or a named color like `"steelblue"`. Alpha changes linearly with
`t`, as in CSS `color-mix()`: `mix("steelblue", "rgb(0 0 0 / 0.5)", 0.3)` has
alpha `0.85`. As in `color-mix()`, the colors mix premultiplied: each color
counts in proportion to its alpha, so a transparent color adds no color of its
own. `mix("transparent", "#4682b4", 0.3)` is `"rgba(70, 130, 180, 0.3)"`.

| Inputs                   | Returns              |
| ------------------------ | -------------------- |
| Result alpha is 1        | `"#rrggbb"`          |
| Result alpha < 1         | `"rgba(r, g, b, a)"` |
| Either color unparseable | `a`, unchanged       |

```ts
import { chart, spread, rect, mix } from "gofish-graphics";

mix("blue", "yellow", 0.5); // "#388f54"
mix("#4190c5", "white", 0.5); // "#81c4e4"

// Bars in a lighter shade of one base color
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value", fill: mix("#4190c5", "white", 0.5) }))
  .render(container, { w: 500, h: 300 });
```

See also [`palette`](/js/api/color/palette) and
[`gradient`](/js/api/color/gradient) for color scales, and
[Color scales](/internals/layout/color-scales) for how GoFish uses `mix`
internally.
