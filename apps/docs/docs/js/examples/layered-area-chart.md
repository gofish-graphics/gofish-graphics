# Layered Area Chart

<!-- ::: starfish example:layered-area-chart -->

**Live Editor**

::: starfish-live {template=vanilla-ts rtl lightTheme=aquaBlue darkTheme=atomDark previewHeight=400 coderHeight=512}

```ts index.ts
import {
  Chart,
  spread,
  Layer,
  select,
  blank,
  area,
  group,
} from "gofish-graphics";
import { streamgraphData } from "./dataset";

const container = document.getElementById("app");

Layer([
  Chart(streamgraphData)
    .flow(spread({ by: "x", dir: "x", spacing: 50 }))
    .mark(blank({ h: "y", fill: "c" }).name("points")),
  Chart(select("points"))
    .flow(group({ by: "c" }))
    .mark(area({ opacity: 0.7 })),
]).render(container, {
  w: 500,
  h: 300,
  axes: true,
});
```

```ts dataset.ts
export const streamgraphData = [
  { x: 0, y: 28, c: 0 },
  { x: 0, y: 20, c: 1 },
  { x: 1, y: 43, c: 0 },
  { x: 1, y: 25, c: 1 },
  { x: 2, y: 81, c: 0 },
  { x: 2, y: 10, c: 1 },
  { x: 3, y: 19, c: 0 },
  { x: 3, y: 15, c: 1 },
  { x: 4, y: 52, c: 0 },
  { x: 4, y: 48, c: 1 },
  { x: 5, y: 24, c: 0 },
  { x: 5, y: 28, c: 1 },
  { x: 6, y: 87, c: 0 },
  { x: 6, y: 66, c: 1 },
  { x: 7, y: 17, c: 0 },
  { x: 7, y: 27, c: 1 },
  { x: 8, y: 68, c: 0 },
  { x: 8, y: 16, c: 1 },
  { x: 9, y: 49, c: 0 },
  { x: 9, y: 25, c: 1 },
  { x: 0, y: 34, c: 2 },
  { x: 1, y: 22, c: 2 },
  { x: 2, y: 77, c: 2 },
  { x: 3, y: 12, c: 2 },
  { x: 4, y: 19, c: 2 },
  { x: 5, y: 31, c: 2 },
  { x: 6, y: 40, c: 2 },
  { x: 7, y: 21, c: 2 },
  { x: 8, y: 59, c: 2 },
  { x: 9, y: 33, c: 2 },
  { x: 0, y: 18, c: 3 },
  { x: 1, y: 41, c: 3 },
  { x: 2, y: 90, c: 3 },
  { x: 3, y: 25, c: 3 },
  { x: 4, y: 60, c: 3 },
  { x: 5, y: 19, c: 3 },
  { x: 6, y: 20, c: 3 },
  { x: 7, y: 31, c: 3 },
  { x: 8, y: 72, c: 3 },
  { x: 9, y: 20, c: 3 },
  { x: 0, y: 23, c: 4 },
  { x: 1, y: 30, c: 4 },
  { x: 2, y: 67, c: 4 },
  { x: 3, y: 18, c: 4 },
  { x: 4, y: 43, c: 4 },
  { x: 5, y: 26, c: 4 },
  { x: 6, y: 76, c: 4 },
  { x: 7, y: 29, c: 4 },
  { x: 8, y: 64, c: 4 },
  { x: 9, y: 27, c: 4 },
];
```

```ts v1syntax.ts
import { Frame, StackX, rect, ConnectX, ref, v } from "gofish-graphics";
import _ from "lodash";
import { streamgraphData } from "./dataset";

const root = document.getElementById("app");

Frame([
  ..._(streamgraphData)
    .groupBy("c")
    .flatMap((items, c) =>
      StackX(
        { spacing: 0, sharedScale: true },
        items.map((d) =>
          rect({
            name: `${c}-${d.x}`,
            x: v(d.x),
            h: v(d.y),
            w: 0,
            fill: v(c),
          })
        )
      )
    )
    .value(),
  ..._(streamgraphData)
    .groupBy("c")
    .map((items, c) =>
      ConnectX(
        {
          interpolation: "linear",
          opacity: 0.7,
        },
        items.map((d) => ref(`${c}-${d.x}`))
      )
    )
    .value(),
]).render(root, { w: 500, h: 300 });
```

:::
