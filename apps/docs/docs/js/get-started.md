---
handwritten: true
---

# First Steps

GoFish is a JavaScript library for making bespoke graphics.

## 1. Install GoFish

```bash
npm install gofish-graphics@nightly
```

::: tip Why the nightly build?
GoFish is moving fast, and the published stable release lags well behind active
development. While the library is in early development we recommend early
adopters install the **nightly** build (shown above) to get the latest features
and fixes. Nightlies are published whenever `main` changes; pin a specific one
with `gofish-graphics@<version>` once you find a build you like.

The stable release on npm is far behind and will not match these docs, so do not
drop the `@nightly` tag.
:::

## 2. Create a chart!

::: gofish hidden

```ts
const alphabet = [
  { letter: "A", frequency: 28 },
  { letter: "B", frequency: 55 },
  { letter: "C", frequency: 43 },
  { letter: "D", frequency: 91 },
  { letter: "E", frequency: 81 },
  { letter: "F", frequency: 53 },
  { letter: "G", frequency: 19 },
  { letter: "H", frequency: 87 },
  { letter: "I", frequency: 52 },
];

gf.chart(alphabet)
  .flow(gf.spread({ by: "letter", dir: "x" }))
  .mark(gf.rect({ h: "frequency" }))
  .render(root, {
    w: 500,
    h: 300,
    axes: true,
  });
```

:::

```ts
const alphabet = [
  { letter: "A", frequency: 28 },
  { letter: "B", frequency: 55 },
  { letter: "C", frequency: 43 },
  { letter: "D", frequency: 91 },
  { letter: "E", frequency: 81 },
  { letter: "F", frequency: 53 },
  { letter: "G", frequency: 19 },
  { letter: "H", frequency: 87 },
  { letter: "I", frequency: 52 },
];

const root = document.createElement("div");

chart(alphabet, { axes: true })
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }))
  .render(root, {
    w: 500,
    h: 300,
  });
```

<!-- ::: info Note

Make sure to create or select a DOM element to render your chart to!

::: -->

## 3. Play with it

Change the code below and watch the chart update.

::: gofish-live {template=vanilla-ts rtl lightTheme=aquaBlue darkTheme=atomDark previewHeight=400 coderHeight=400}

```ts index.ts
import { chart, spread, rect } from "gofish-graphics";
import { alphabet } from "./dataset";

const root = document.getElementById("app");

// - Try changing `dir` to `y` and use `rect`'s `w` channel instead of `h`.
// - What happens when you map both `w` and `h` to "frequency"?
chart(alphabet, { axes: true })
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }))
  .render(root, {
    w: 500,
    h: 300,
  });
```

```ts dataset.ts
export const alphabet = [
  { letter: "A", frequency: 28 },
  { letter: "B", frequency: 55 },
  { letter: "C", frequency: 43 },
  { letter: "D", frequency: 91 },
  { letter: "E", frequency: 81 },
  { letter: "F", frequency: 53 },
  { letter: "G", frequency: 19 },
  { letter: "H", frequency: 87 },
  { letter: "I", frequency: 52 },
];
```

:::

## Where next

The [tutorials](/js/tutorials/) take you from this first chart to finished work.

- [Basics](/js/tutorials/basics) is the shared starting point: shapes, graphical
  operators, and how the two fit together.
- Then pick whichever you like, in either order: [Charts](/js/tutorials/charts)
  builds a bar chart up into a polar ribbon, and
  [Diagrams](/js/tutorials/diagrams) builds a diagram out of the same pieces.
- Later on, [Reactivity & Interaction](/js/reactivity) makes a visualization
  respond to the pointer, and [GoTree](/js/gotree) draws trees.
