# assignGradientColor

```ts
assignGradientColor(scale, t);
```

Interpolates a [`gradient`](/js/api/color/gradient) config at `t` (`0` to `1`)
and returns the resulting hex color, in LAB space. Use it to precompute a
per-row fill color inside [`derive`](/js/api/operators/derive) — for example
when one chart draws colors from more than one gradient, so a single `fill`
field can't reference a single scale.

```ts
import {
  chart,
  derive,
  spread,
  stack,
  rect,
  gradient,
  assignGradientColor,
} from "gofish";

const warmGradient = gradient(["#ffe0b2", "#e65100"]);
const coldGradient = gradient(["#bbdefb", "#0d47a1"]);

chart(pairedBars)
  .flow(
    derive((d) => {
      const values = d.map((item) => item.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      return d.map((item) => {
        const t = max === min ? 0 : (item.value - min) / (max - min);
        const scale = item.type === "warm" ? warmGradient : coldGradient;
        return { ...item, color: assignGradientColor(scale, t) };
      });
    }),
    spread({ by: "pair", dir: "x" }),
    stack({ by: "type", dir: "x" })
  )
  .mark(rect({ h: "value", fill: "color" }))
  .render(container, { w: 400, h: 400 });
```

See also [`gradient`](/js/api/color/gradient) and
[`palette`](/js/api/color/palette).
