# arrow

Draws a curved, arrowheaded connector from the first child to the second.
Like [`connect`](/js/api/operators/connect), `arrow` links elements that have
already been placed by another layer or constraint — but it renders a directed,
gently bowed arrow (powered by
[perfect-arrows](https://github.com/steveruizok/perfect-arrows)) instead of a
plain line. Reach for it in diagrams: callouts, pointer/heap edges, and labeled
annotations.

::: gofish

```js
gf.layer([
  gf
    .layer([
      gf.rect({ w: 70, h: 40, fill: gf.color.blue[2] }).name("a"),
      gf.rect({ w: 70, h: 40, fill: gf.color.red[2] }).name("b"),
    ])
    .constrain(({ a, b }) => [
      gf.Constraint.distribute({ dir: "x", spacing: 120 }, [a, b]),
      gf.Constraint.align({ y: "middle" }, [a, b]),
    ]),
  gf.Arrow({ stroke: "#333", strokeWidth: 3 }, [gf.ref("a"), gf.ref("b")]),
]).render(root, { w: 320, h: 100 });
```

:::

## Signature

```ts
arrow({
  // visual
  stroke?, strokeWidth?, start?,
  // curve shape (perfect-arrows)
  bow?, stretch?, stretchMin?, stretchMax?,
  padStart?, padEnd?, flip?, straights?,
}, [from, to])
```

`Arrow` is the v2 alias for the same factory. The children are usually two
[`ref(...)`](/js/api/selection/ref) calls (or datum-level sub-refs) pointing at
named elements placed by an earlier tier: the arrow runs **from the first child
to the second**. Fewer than two children renders nothing.

## Visual props

| Option        | Type      | Default   | Description                                                                        |
| ------------- | --------- | --------- | ---------------------------------------------------------------------------------- |
| `stroke`      | `string`  | `"black"` | Color of the arrow's line and head (and start dot, if shown)                       |
| `strokeWidth` | `number`  | `3`       | Line width; also scales the arrowhead and the start dot                            |
| `start`       | `boolean` | `false`   | Draw a filled dot at the start (source) point — useful for pointer/reference edges |

## Curve shape

The arrow's path is a quadratic bezier whose bow and routing come straight from
[perfect-arrows](https://github.com/steveruizok/perfect-arrows)'
`getBoxToBoxArrow`. These options are passed through unchanged:

| Option       | Type      | Default | Description                                                                                           |
| ------------ | --------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `bow`        | `number`  | `0.2`   | Baseline curvature. `0` is a straight line; higher values bow the arc further from center.            |
| `stretch`    | `number`  | `0.5`   | How much the bow grows as the endpoints get closer (and shrinks as they get farther apart).           |
| `stretchMin` | `number`  | `40`    | Distance (px) below which `stretch` has its full effect.                                              |
| `stretchMax` | `number`  | `420`   | Distance (px) above which `stretch` has no effect.                                                    |
| `padStart`   | `number`  | `5`     | Gap (px) between the source box and the start of the line.                                            |
| `padEnd`     | `number`  | `20`    | Gap (px) between the end of the line and the target box — leave room for the arrowhead.               |
| `flip`       | `boolean` | `false` | Flip which side the arrow bows toward.                                                                |
| `straights`  | `boolean` | `true`  | Allow perfectly straight lines when the endpoints are axis-aligned (instead of forcing a slight bow). |

## Examples

```ts
// Labeled callout: a text label pointing at a named shape (gently bowed default)
Arrow({}, [ref("label"), ref("Mercury")]);

// Pointer edge: straight, with a dot at the source (e.g. a heap/stack reference)
Arrow({ bow: 0, stretch: 0, padStart: 0, stroke: "#1A5683", start: true }, [
  ref("stackSlot"),
  ref("heapCell"),
]);

// Datum-level endpoints: arrow into a specific selected sub-element
Arrow({ bow: 0, padEnd: 25, padStart: 0, stroke: "#1A5683", start: true }, [
  ref("heap").path(0, 1).val,
  ref("heap").path(0, 2).elmTuples[0],
]);
```

## Notes

- The arrow's bbox is the union of the resolved endpoints' boxes — like
  `connect`, it does not contribute its own space.
- `ref(name)` resolves names declared via `.name(...)`. With `createName()`
  tokens, the name is global; with plain strings, it is layer-scoped.
- Use [`connect`](/js/api/operators/connect) instead when you want an
  _undirected_ line (or a multi-stop polyline) with explicit bbox-anchor
  control; use `arrow` when you want a _directed_ arrowhead and automatic curved
  routing.
- Pair the operator with z-order constraints
  ([`Constraint.zAbove` / `zBelow`](/js/api/constraints/constrain#constraint-zabove-constraint-zbelow))
  when an arrow needs to sit between two elements in paint order.
