# Mosaic Plot

<!-- ::: starfish example:mosaic-plot -->

**Live Editor**

::: starfish-live {template=vanilla-ts rtl lightTheme=aquaBlue darkTheme=atomDark previewHeight=400 coderHeight=512}

```ts index.ts
import { Chart, spread, stack, derive, rect, normalize } from "gofish-graphics";
import { data } from "./dataset";

const container = document.getElementById("app");

Chart(data)
  .flow(
    spread({ by: "origin", dir: "x" }),
    derive((d) => normalize(d, "count")),
    stack({ by: "cylinders", dir: "y", label: false })
  )
  .mark(rect({ h: "count", fill: "origin", stroke: "white", strokeWidth: 2 }))
  .render(container, {
    w: 500,
    h: 300,
    axes: true,
  });
```

```ts dataset.ts
export const data = [
  { origin: "Europe", cylinders: "4", count: 66 },
  { origin: "Europe", cylinders: "5", count: 3 },
  { origin: "Europe", cylinders: "6", count: 4 },
  { origin: "Japan", cylinders: "3", count: 4 },
  { origin: "Japan", cylinders: "4", count: 69 },
  { origin: "Japan", cylinders: "6", count: 6 },
  { origin: "USA", cylinders: "4", count: 72 },
  { origin: "USA", cylinders: "6", count: 74 },
  { origin: "USA", cylinders: "8", count: 108 },
];
```

:::
