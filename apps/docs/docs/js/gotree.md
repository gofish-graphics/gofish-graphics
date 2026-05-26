# GoTree

`gofish-gotree` is a declarative grammar for tree visualizations, embedded inside
GoFish. It ships as a separate workspace package — install and import it alongside
`gofish-graphics`:

```ts
import { tree } from "gofish-gotree";
import { gofish, circle } from "gofish-graphics";
```

A single function — `tree(spec, data)` — produces a tree visualization. Varying the
spec yields node-link diagrams, dendrograms, icicle plots, sunbursts, treemap slices,
and their radial duals. The grammar follows the structure of
[GoTree (Li et al., CHI 2020)](https://dl.acm.org/doi/10.1145/3313831.3376297) but
renames concepts to match GoFish conventions (`spread` instead of `juxtapose`,
`spacing` instead of `Padding`/`Margin`, `start | middle | end | baseline` instead
of `top | center | bottom`).

## Quick example — node-link tree

```ts
import { tree } from "gofish-gotree";
import { circle } from "gofish-graphics";

const data = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }] },
    { name: "B", children: [{ name: "B1" }, { name: "B2" }, { name: "B3" }] },
    { name: "C" },
  ],
};

const chart = tree(
  {
    node: (d) => circle({ r: 10, fill: "steelblue" }),
    link: { interpolation: "linear", stroke: "#888" },
    parentChild: { type: "spread", dir: "y", spacing: 48, alignment: "middle" },
    sibling: { type: "spread", dir: "x", spacing: 24, alignment: "start" },
    mode: "topDown",
  },
  data
);

chart.render(container, { w: 600, h: 400 });
```

## The spec

```ts
type GoTreeSpec = {
  node?: (d: HierarchyDatum) => Mark;
  link?: "none" | LinkOptions | ((s, t) => LinkOptions);
  parentChild?: Rel | Rel[];
  sibling?: Rel | Rel[];
  mode?: "topDown" | "bottomUp";
  sortBy?: (d: HierarchyDatum) => number;
  coord?: CoordTransform;
};

type Rel =
  | { type: "spread"; dir: "x" | "y"; spacing?: number; alignment?: Alignment }
  | { type: "nest"; dir: "x" | "y"; padding?: number; fill?: boolean }
  | { type: "align"; dir: "x" | "y"; alignment: Alignment };

type Alignment = "start" | "middle" | "end" | "baseline";
```

### `node` — the node-mark factory

`node` is a function that returns a GoFish mark for one tree node. It is called once
per hierarchy node with a `HierarchyDatum` (`data`, `depth`, `height`, `value`,
`width`). All node styling — fill, stroke, size, labels — lives in this factory.

```ts
node: (d) => circle({ r: 4 + d.height * 2, fill: colorByDepth(d.depth) });
```

### `link` — the edge encoding

- `"none"` — omit all edges (useful for icicle / treemap variants).
- An options object `{ interpolation, stroke, strokeWidth, opacity }` — applied
  uniformly.
- A function `(source, target) => LinkOptions` — per-edge styling.

```ts
link: { interpolation: "linear", stroke: "#90a4ae", strokeWidth: 1.5 }
```

In M1 only `interpolation: "linear"` is supported. `"bezier"`, `"orthogonal"`,
and `"arc"` are planned for later milestones.

### `parentChild` and `sibling` — the layout relations

Each role describes how parts of the tree relate along an axis:

- **`parentChild`** — how a parent node sits relative to its children-group.
- **`sibling`** — how siblings within a group sit relative to one another.

Each can be a single `Rel` or an array of `Rel`s (one per axis). The supported
relation types:

| `type`     | Meaning                                                                               | Status |
| ---------- | ------------------------------------------------------------------------------------- | ------ |
| `"spread"` | Distribute along `dir` with `spacing`. Aligns on the orthogonal axis via `alignment`. | M1 ✓   |
| `"align"`  | Align on `dir` (sibling-only — modifies the orthogonal spread's alignment).           | M1 ✓   |
| `"nest"`   | 1D containment: child-group fits within parent's extent along `dir`.                  | M2+    |

The classic node-link tree uses `spread` for both roles. For an icicle plot
(unimplemented in M1), you would mix `spread` and `nest`:

```ts
// M2+ — icicle plot
parentChild: [
  { type: "nest",   dir: "x" },                          // children fill parent's X
  { type: "spread", dir: "y", spacing: 0 },              // parent above children
],
sibling: [
  { type: "spread", dir: "x", spacing: 0 },              // siblings spread on X
  { type: "align",  dir: "y", alignment: "start" },      // siblings top-aligned
],
```

### `mode` — sizing direction

- `"topDown"` (default) — parent's encoded size partitions among children
  (treemap-style).
- `"bottomUp"` — children's sizes sum into the parent (dendrogram-style). The
  parent is drawn after the children-group along the parent-child axis.

### `coord` — coordinate transform

Pass any GoFish `CoordTransform` (e.g. `polar()` for a radial layout). Defaults to
linear cartesian.

```ts
coord: polar({ innerRadius: 20 }); // M3+ — radial node-link
```

## Translation from the GoTree paper

The grammar's structure is preserved from the paper; only the names change to align
with GoFish conventions.

| Paper                             | GoTree-in-GoFish                                  |
| --------------------------------- | ------------------------------------------------- |
| `Element.Node: "rectangle"`       | `node: (d) => rect({...})`                        |
| `Element.Link: "straight"`        | `link: { interpolation: "linear" }`               |
| `Element.Color: "depth"`          | inside `node`: `fill: byDepth(d.depth)`           |
| `Element.Width/Height`            | inside `node`: `w` / `h` on the mark              |
| `Element.LinkWidth`               | `link.strokeWidth`                                |
| `Element.Label`                   | inside `node`: include a `text` mark              |
| `Layout.Mode`                     | `mode`                                            |
| `Layout.X.Root: juxtapose`        | `parentChild: { type: "spread", dir: "x" }`       |
| `Layout.X.Subtree: flatten`       | `sibling: { type: "spread", dir: "x" }`           |
| `Layout.X.Subtree: align`         | `sibling: { type: "align", dir: "x" }`            |
| `Layout.X.Root: include`/`within` | `parentChild: { type: "nest", dir: "x" }` _(M2+)_ |
| `Padding` / `Margin`              | `spacing`                                         |
| `Alignment: top / left`           | `alignment: "start"`                              |
| `Alignment: center`               | `alignment: "middle"`                             |
| `Alignment: bottom / right`       | `alignment: "end"`                                |
| `SortingCriteria`                 | `sortBy: (d) => ...`                              |
| `SubtreeWidth`/`Height`           | inside `node`: `value(d.value, "key")`            |
| `CoordinateSystem.Category`       | `coord: linear()` or `coord: polar()`             |

## Milestone status

M1 ships only cartesian node-link with `spread`/`align` relations and `"linear"`
links. The remaining grammar (icicle, treemap-slice, sunburst, radial node-link,
dendrogram, orthogonal/bezier/arc links) is designed but unimplemented. Trying to
use those values raises an explicit error.

- **M1** (shipped) — node-link with `spread` and `align`.
- **M2** — `nest` primitive in `gofish-graphics`; enables icicle and treemap-slice.
- **M3** — polar coord wrap; enables sunburst and radial node-link.
- **M4** — `orthogonal`/`bezier`/`arc` links; sort.
- **M5** — `bottomUp` mode for dendrograms.
