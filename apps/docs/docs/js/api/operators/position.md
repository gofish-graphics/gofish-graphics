# position

Sets a single child's **min-corner** `(x, y)` offset in the parent's coordinate
space. It is a low-level, absolute-offset placement primitive: it draws nothing
of its own and contributes no styling, just a translate.

::: gofish

```js
gf.layer([
  gf.position({ x: 20, y: 30 }, [
    gf.rect({ w: 60, h: 40, fill: gf.color.blue[2] }),
  ]),
]).render(root, { w: 120, h: 90 });
```

:::

## Signature

```ts
position({ x?, y?, key? }, [child]);
```

`Position` is the v2 alias for the same factory. `position` takes **exactly
one** child; passing more is not meaningful (the operator only tracks one
child's box).

## Options

| Option | Type     | Default     | Description                                       |
| ------ | -------- | ----------- | ------------------------------------------------- |
| `x`    | `number` | `undefined` | Min-corner x offset, in the parent's coordinates. |
| `y`    | `number` | `undefined` | Min-corner y offset, in the parent's coordinates. |
| `key`  | `string` | `undefined` | Internal per-node key override.                   |

## Notes

- **Not center-anchored.** `position`'s `(x, y)` moves the child's min corner
  (its bbox's left/bottom edge in y-up terms), not its center — unlike, say,
  `spread`'s point placement. If you want center anchoring, offset by half the
  child's size yourself, or reach for `spread`/`scatter` instead.
- `position` is a workaround for `enclose`'s styling limits, not a
  replacement for it: `enclose` draws a convex-hull rectangle (with its own
  `fill`/`stroke`/`rx`/`ry`) around the union of its children's boxes, but
  it can't style anything other than that hull. When a diagram needs one
  child placed at a precise absolute offset with its _own_ styling (as in the
  bluefish Topology story's combinator trees), `position` is the more direct
  tool — it's a legitimate low-level primitive on its own, not a hack.
- Omitting `x` or `y` leaves that axis unset — the child falls back to its
  usual baseline-origin placement on that axis, exactly like an unplaced
  child in `layer`.
