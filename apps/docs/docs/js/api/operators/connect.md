# connect

Draws a connector (line) between each consecutive pair of children. Used for
linking elements that have already been placed by another layer or
constraint — most commonly inside a [nested-tier](/internals/design/principles)
layout where the inner tier places the shapes and the outer tier draws the
connections.

::: gofish

```js
gf.layer([
  gf
    .layer([
      gf.rect({ w: 60, h: 40, fill: gf.color.blue[2] }).name("a"),
      gf.rect({ w: 60, h: 40, fill: gf.color.red[2] }).name("b"),
    ])
    .constrain(({ a, b }) => [
      gf.Constraint.distribute({ dir: "x", spacing: 80 }, [a, b]),
      gf.Constraint.align({ y: "middle" }, [a, b]),
    ]),
  gf.Connect(
    {
      stroke: "black",
      strokeWidth: 2,
      source: ["end", "middle"],
      target: ["start", "middle"],
    },
    [gf.ref("a"), gf.ref("b")]
  ),
]).render(root, { w: 240, h: 80 });
```

:::

## Signature

```ts
connect({
  source?, target?,
  stroke?, strokeWidth?, fill?, opacity?, mixBlendMode?,
  interpolation?,
  // for non-anchor mode:
  direction?, mode?,
}, [child1, child2, ...])
```

`Connect` is the v2 alias for the same factory. The children are usually
`ref(...)` calls that point at named elements placed by an earlier tier.

## Anchor mode (recommended)

When `source` or `target` is provided, `connect` runs a straight line between
the _anchored points_ on each consecutive pair of children's bounding boxes —
ignoring `direction` and `mode`. The anchor is a normalized fraction of the
bbox: `[0, 0]` = bottom-left, `[1, 1]` = top-right, `[0.5, 0.5]` = center.
(GoFish is y-up.)

Anchors accept three forms — pick the one that reads clearest at the call
site:

```ts
// Single keyword: both axes share the alignment
source: "middle"; // = [0.5, 0.5]

// Per-axis tuple: each axis can be a keyword or a number
source: ["start", "middle"]; // = [0,   0.5]
source: [0.5, "end"]; // = [0.5, 1]

// Axis-keyed object: only set the axes you care about; omitted = 0.5
source: {
  x: "start";
} // = [0,   0.5]
source: {
  y: 0.25;
} // = [0.5, 0.25]
```

Where `start` → `0`, `middle` → `0.5`, `end` → `1`.

### One anchor or two?

|                                  | Behavior                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both `source` and `target` given | Line runs directly between the two anchored points.                                                                                                                                                                       |
| Only one given                   | The line's other endpoint is the specified point **clamped onto the opposite bbox** per axis — matching Bluefish's `Line`. Produces an axis-aligned line when the specified point lies inside the other bbox on one axis. |
| Neither (and `direction` set)    | See "Edge mode" below.                                                                                                                                                                                                    |

```ts
// Both anchors: literal line between two corners
Connect({ source: "end", target: "start" }, [ref("a"), ref("b")]);

// One anchor: target endpoint is clamped onto B's bbox
Connect({ source: ["end", "middle"] }, [ref("A"), ref("B")]);
// → straight horizontal line from A's right-middle to B's left edge at the same y

// Center-to-center is the most common: just use "middle"
Connect({ source: "middle", target: "middle" }, [ref("A"), ref("B")]);
```

## Edge mode (no anchors)

When neither `source` nor `target` is given, `connect` falls back to
edge mode: it routes between the children's facing edges along
`direction`. This is the legacy path; most diagrams should prefer anchor
mode.

| Option      | Type                                   | Default  | Description                           |
| ----------- | -------------------------------------- | -------- | ------------------------------------- |
| `direction` | `"horizontal" \| "vertical" \| 0 \| 1` | `0`      | Axis the connector runs along         |
| `mode`      | `"edge" \| "center"`                   | `"edge"` | Where the line attaches on each child |

## Visual props

| Option          | Type                     | Default                                                    | Description                                                                                                             |
| --------------- | ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `stroke`        | `string`                 | `fill`                                                     | Stroke color                                                                                                            |
| `strokeWidth`   | `number`                 | `0`                                                        | Stroke width                                                                                                            |
| `fill`          | `MaybeValue<string>`     | `"black"`                                                  | Fill (for closed paths; channel-bindable)                                                                               |
| `opacity`       | `number`                 | `1`                                                        | Element opacity                                                                                                         |
| `mixBlendMode`  | `"multiply" \| "normal"` | `"multiply"` in edge mode / `"normal"` in `mode: "center"` | Blend mode of the rendered path. Override to `"normal"` for opaque strokes that don't darken under colored backgrounds. |
| `interpolation` | `"linear" \| "bezier"`   | `"linear"`                                                 | Path interpolation between consecutive children                                                                         |

## Examples

```ts
// Center-to-center, opaque
Connect(
  {
    stroke: "#774e32",
    strokeWidth: 3,
    mixBlendMode: "normal",
    source: "middle",
  },
  [ref("A"), ref("B")]
);

// Bottom-to-top vertical link (e.g. ceiling → hanging weight)
Connect({ source: ["middle", "start"], target: ["middle", "end"] }, [
  ref("ceiling"),
  ref("weight"),
]);

// One-sided clamp: A's right-middle straight across to B
Connect({ source: ["end", "middle"] }, [ref("A"), ref("B")]);

// Multi-stop polyline: each consecutive pair gets its own segment
Connect({ source: "middle" }, [ref("A"), ref("B"), ref("C")]);
```

## Notes

- This is the **low-level layout operator**, distinct from the v3 builder method
  [`ChartBuilder.connect()`](/js/api/core/connect). The builder `.connect(line())`
  is sugar that threads a ref-consuming _mark_ through a chart's own marks; this
  operator connects explicitly-listed `ref(...)` children inside a layout.
- The high-level [`line`](/js/api/marks/line) and [`area`](/js/api/marks/area)
  marks are thin wrappers over `connect`: they take the array of refs from
  [`selectAll(...)`](/js/api/selection/ref) and connect them. To re-partition
  a selection before connecting (e.g. one area per species), run it through a
  path-aware operator first — `group({ by: "datum.species" })`; see
  [`spread` → path-aware `by`](/js/api/operators/spread#path-aware-by).
- `ref(name)` resolves names declared via `.name(...)`. With
  `createName()` tokens, the name is global; with plain strings, it is
  layer-scoped.
- The connector's bbox is the union of the resolved endpoints — it does
  not contribute its own space.
- Pair the operator with z-order constraints
  ([`Constraint.zAbove` / `zBelow`](/js/api/constraints/constrain#constraint-zabove-constraint-zbelow))
  when a connector needs to sit _between_ two elements in paint order — see
  the [pulley diagram](/js/examples/pulley-diagram) for the canonical use case.
