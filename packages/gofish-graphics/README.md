# GoFish Graphics

A JavaScript library for making bespoke charts and visualizations.

## Installation

```bash
npm install gofish-graphics@nightly
```

The latest stable release on npm is old and lags far behind development. The docs at
[gofish.graphics](https://gofish.graphics/) describe the current nightly builds, which
are published on every change to `main`. You must include the `@nightly` tag, otherwise
npm installs the outdated stable release.

## Usage

```ts
import { chart, spread, rect } from "gofish-graphics";

const alphabet = [
  { letter: "A", frequency: 28 },
  { letter: "B", frequency: 55 },
  { letter: "C", frequency: 43 },
  { letter: "D", frequency: 91 },
  { letter: "E", frequency: 81 },
];

const root = document.getElementById("app");

chart(alphabet, { axes: true })
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }))
  .render(root, {
    w: 500,
    h: 300,
  });
```

This creates a bar chart: `spread` arranges one group per `letter` along the x
axis, and `rect` draws a bar per row whose height encodes `frequency`.

## Learn more

- [Getting started](https://gofish.graphics/js/get-started)
- [Docs](https://gofish.graphics/)
- [GitHub](https://github.com/gofish-graphics/gofish-graphics)
