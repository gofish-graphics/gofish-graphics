# Rose Chart

<!-- ::: starfish example:rose-chart -->

**Live Editor**

::: starfish-live {template=vanilla-ts rtl lightTheme=aquaBlue darkTheme=atomDark previewHeight=400 coderHeight=512}

```ts index.ts
import { Chart, stack, derive, rect } from "gofish-graphics";
import { clock } from "gofish-graphics";
import { nightingale } from "./dataset";

const container = document.getElementById("app");

Chart(nightingale, { coord: clock() })
  .flow(
    stack({ by: "Month", dir: "x" }),
    stack({ by: "Type", dir: "y" }),
    derive((d) => d.map((d) => ({ ...d, Death: Math.sqrt(d.Death) })))
  )
  .mark(rect({ w: (Math.PI * 2) / 12, emX: true, h: "Death", fill: "Type" }))
  .render(container, {
    w: 400,
    h: 400,
    transform: { x: 200, y: 200 },
  });
```

```ts dataset.ts
export type NightingaleData = {
  Month: string;
  Type: string;
  Death: number;
};

export const nightingale: NightingaleData[] = [
  {
    Month: "Jan",
    Type: "Other",
    Death: 324,
  },
  {
    Month: "Jan",
    Type: "Wounds",
    Death: 83,
  },
  {
    Month: "Jan",
    Type: "Disease",
    Death: 2761,
  },
  {
    Month: "Feb",
    Type: "Other",
    Death: 361,
  },
  {
    Month: "Feb",
    Type: "Wounds",
    Death: 42,
  },
  {
    Month: "Feb",
    Type: "Disease",
    Death: 2120,
  },
  {
    Month: "Mar",
    Type: "Other",
    Death: 172,
  },
  {
    Month: "Mar",
    Type: "Wounds",
    Death: 32,
  },
  {
    Month: "Mar",
    Type: "Disease",
    Death: 1205,
  },
  {
    Month: "Apr",
    Type: "Other",
    Death: 57,
  },
  {
    Month: "Apr",
    Type: "Wounds",
    Death: 48,
  },
  {
    Month: "Apr",
    Type: "Disease",
    Death: 477,
  },
  {
    Month: "May",
    Type: "Other",
    Death: 37,
  },
  {
    Month: "May",
    Type: "Wounds",
    Death: 49,
  },
  {
    Month: "May",
    Type: "Disease",
    Death: 508,
  },
  {
    Month: "Jun",
    Type: "Other",
    Death: 31,
  },
  {
    Month: "Jun",
    Type: "Wounds",
    Death: 209,
  },
  {
    Month: "Jun",
    Type: "Disease",
    Death: 802,
  },
  {
    Month: "Jul",
    Type: "Other",
    Death: 33,
  },
  {
    Month: "Jul",
    Type: "Wounds",
    Death: 134,
  },
  {
    Month: "Jul",
    Type: "Disease",
    Death: 382,
  },
  {
    Month: "Aug",
    Type: "Other",
    Death: 25,
  },
  {
    Month: "Aug",
    Type: "Wounds",
    Death: 164,
  },
  {
    Month: "Aug",
    Type: "Disease",
    Death: 483,
  },
  {
    Month: "Sep",
    Type: "Other",
    Death: 20,
  },
  {
    Month: "Sep",
    Type: "Wounds",
    Death: 276,
  },
  {
    Month: "Sep",
    Type: "Disease",
    Death: 189,
  },
  {
    Month: "Oct",
    Type: "Other",
    Death: 18,
  },
  {
    Month: "Oct",
    Type: "Wounds",
    Death: 53,
  },
  {
    Month: "Oct",
    Type: "Disease",
    Death: 128,
  },
  {
    Month: "Nov",
    Type: "Other",
    Death: 32,
  },
  {
    Month: "Nov",
    Type: "Wounds",
    Death: 33,
  },
  {
    Month: "Nov",
    Type: "Disease",
    Death: 178,
  },
  {
    Month: "Dec",
    Type: "Other",
    Death: 28,
  },
  {
    Month: "Dec",
    Type: "Wounds",
    Death: 18,
  },
  {
    Month: "Dec",
    Type: "Disease",
    Death: 91,
  },
];
```

:::
