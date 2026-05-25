# Line Chart

<!-- ::: starfish example:line-chart -->

**Live Editor**

::: starfish-live {template=vanilla-ts rtl lightTheme=aquaBlue darkTheme=atomDark previewHeight=400 coderHeight=512}

```ts index.ts
import { Chart, scatter, Layer, select, blank, line } from "gofish-graphics";
import { catchLocationsArray } from "./dataset";

const container = document.getElementById("app");

Layer([
  Chart(catchLocationsArray)
    .flow(scatter({ by: "lake", x: "x", y: "y" }))
    .mark(blank().name("points")),
  Chart(select("points")).mark(line()),
]).render(container, {
  w: 500,
  h: 300,
  axes: true,
});
```

```ts dataset.ts
export type Lakes =
  | "Lake A"
  | "Lake B"
  | "Lake C"
  | "Lake D"
  | "Lake E"
  | "Lake F";

export const lakeLocations: Record<Lakes, { x: number; y: number }> = {
  "Lake A": { x: 5.26, y: 22.64 },
  "Lake B": { x: 30.87, y: 120.75 },
  "Lake C": { x: 50.01, y: 60.94 },
  "Lake D": { x: 115.13, y: 94.16 },
  "Lake E": { x: 133.05, y: 50.44 },
  "Lake F": { x: 85.99, y: 172.78 },
};

export const catchLocationsArray = Object.entries(lakeLocations).map(
  ([lake, { x, y }]) => ({ lake: lake as Lakes, x, y })
);
```

:::
