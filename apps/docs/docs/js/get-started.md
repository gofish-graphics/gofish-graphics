# First Steps

GoFish is a JavaScript library for making bespoke graphics.

## 1. Install GoFish

```bash
npm install gofish-graphics
```

## 2. Create a chart!

::: starfish example:HIDDEN-bar-chart-get-started hidden
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

Chart(seafood, { axes: true })
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

## 3. Anatomy of a GoFish specification

A basic GoFish spec has four pieces: `Chart`, `flow`, `mark`, and `render`.

### `Chart`: Data

The `Chart` function is how you start your specification. It's where you put your data.

```ts
Chart(alphabet);
```

### `flow`: Graphical Operators

The `flow` method is where you specify _graphical operators_. Graphical operators transform your
dataset (usually by applying a `groupBy`) and specify layout.

```ts
.flow(spread({ by: "letter",  dir: "x" }))
```

Here we're using the `spread` operator to create one group per `letter` and we arrange them
horizontally thanks the `dir: x` option.

### `mark`: Shapes

Lastly we call the `mark` method to specify the shapes we place in each of the regions created by
the `spread` operator.

```ts
.mark(rect({ h: "frequency" }))
```

In this case, we created some rectangles whose heights correspond to the `frequency` values of the
different letters. Since we didn't define the width of the rectangle, the `spread` operator and
`rect` shape work together to infer it for us!

<!-- ### Shapes

```ts
rect(alphabet, { h: "frequency" });
```

GoFish draws charts using _shapes_. To make a bar chart, we use the `rect` shape to draw rectangles.
We pass it a dataset, `alphabet`, and a parameter that maps the `frequency` field of the `alphabet`
dataset to the height of each rectangle.

GoFish automatically infers the width and color of the rectangle, because we haven't specified them.

### Graphical Operators

```ts
  .spreadX("letter")
```

The `rect` shape describes the size and color of each rectangle, but it doesn't tells us how the
rectangles should be arranged. That's what _graphical operators_ are for.

We use the `spreadX` operator to spread out rectangles horizontally. It also makes one rectangle per
`letter` in the `alphabet` dataset. -->

### Rendering

```ts
Chart(alphabet, { axes: true }).render(root, { w: 500, h: 300 });
```

The `render` method draws our chart to the screen! We give it a DOM container to render into (`root`
in this case) and some options. We've specified the width and height of our chart with `w` and `h`
(just like on `rect`). We've also told GoFish to create some axes, labels, and legends for us
automatically by passing `axes: true` in the `chart()` options.

## 4. Next steps

Go through [our tutorial](/js/tutorial), check out [some examples](/js/examples/index), or play with the
live editor below!

::: starfish-live {template=vanilla-ts rtl lightTheme=aquaBlue darkTheme=atomDark previewHeight=400 coderHeight=400}

```ts index.ts
import { Chart, spread, rect } from "gofish-graphics";
import { alphabet } from "./dataset";

const root = document.getElementById("app");

// - Try changing `dir` to `y` and use `rect`'s `w` channel instead of `h`.
// - What happens when you map both `w` and `h` to "frequency"?
Chart(alphabet, { axes: true })
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
