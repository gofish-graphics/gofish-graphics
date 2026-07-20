# gofish-neo

Hierarchical and multi-output confusion matrices for GoFish, based on the
published algebra from Neo (Görtler et al., "Neo: Generalizing Confusion
Matrix Visualization to Hierarchical and Multi-Output Labels", CHI 2022).

A confusion matrix cross-tabulates what a classifier predicted against what
was actually true. Neo generalizes it in three ways:

- Class labels can be hierarchical. A label is a colon-delimited path such as
  `"animal:mammal:cat"`, and the labels form a tree. Any subtree can be
  collapsed into a single row and column whose counts are the sums over its
  descendants.
- A classifier can have several outputs per record. The `actual` and
  `observed` fields are arrays with one label per output. The spec can
  marginalize the extra outputs away, condition on one of them, or nest one
  output inside another as extra hierarchy levels.
- Counts can be renormalized by row, by column, or over the visible cells,
  and per-class measures (precision, recall, accuracy, and raw counts) render
  as strips beside the matrix.

## Usage

```ts
import { confusionMatrix } from "gofish-neo";

const data = [
  { actual: ["animal:mammal:cat"], observed: ["animal:mammal:cat"], count: 46 },
  { actual: ["animal:mammal:cat"], observed: ["animal:mammal:dog"], count: 7 },
  // ...
];

const node = await confusionMatrix(
  { classes: ["animal"], measures: ["precision", "recall"] },
  data
);
node.render(container, { w: 800, h: 600 });
```

The spec fields are `classes`, `where`, `filter`, `normalization` ("total",
"row", or "column"), `encoding` ("color" or "size"), `collapsed` (node ids to
render as aggregated leaves), and `measures`, plus rendering options such as
`cellSize`, `spacing`, `colors`, `showCounts`, and `excludeDiagonal`.

The renderer composes three kinds of GoFish structure on one shared row and
column pitch: a `table()` grid for the matrix body, `gofish-gotree` trees for
the hierarchical margin labels, and bar strips for the measures. The pure
data algebra (path parsing, label tree, pipeline, matrix, normalization,
measures) is exported separately from `src/index.ts`, so you can build other
views from it. The `stories/` directory has examples, including a radial
matrix built directly on the algebra with a polar coordinate frame.

## License and provenance

This package is an independent reimplementation of the algebra described in
the Neo paper. Apple's reference implementation
([apple/ml-hierarchical-confusion-matrix](https://github.com/apple/ml-hierarchical-confusion-matrix))
is under Apple's own sample code license, which is not compatible with this
repository's MIT license. No code was copied or ported from it. The input
data format (`actual`, `observed`, `count`, colon-delimited paths) is kept
compatible on purpose.

The implementation diverges from the reference implementation in three
declared places, each documented at the definition site:

- `filter` matches subpaths on both the `actual` and `observed` sides with
  segment-aware prefix tests. The reference implementation only inspects the
  `actual` side and matches raw substrings.
- `trueNegatives` uses the standard one-vs-rest definition (total minus TP,
  FP, and FN), so the four quantities partition the grand total. The
  reference implementation subtracts TP from the whole-matrix diagonal sum
  instead.
- Zero denominators (an empty row or column, or a measure over an empty
  class) yield 0 rather than NaN.
