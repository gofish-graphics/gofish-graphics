# Draft issue (not opened): three operators divide a box by weight

Found while writing the croissant sampling proposal (#1332).

## What overlaps

Dividing a given box along one axis by a weight per group is spelled three ways today:

```js
// 1. stack with `size` (the gallery Mosaic Chart)
chart(seafood)
  .flow(
    stack({ by: "lake", dir: "x", size: "count" }),
    stack({ by: "species", dir: "y", size: field("count").normalize() })
  )
  .mark(rect({ fill: "species" }));

// 2. treemap with a one-axis tiling
chart(seafood)
  .flow(
    treemap({ by: "lake", size: "count", tile: Tile.dice }),
    treemap({ by: "species", size: "count", tile: Tile.slice })
  )
  .mark(rect({ fill: "species" }));

// 3. cut on a mark
chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }), stack({ dir: "y" }))
  .mark(rect({ w: 40, h: 200, fill: "species" }).cut({ dir: "y", size: "count" }));
```

The first two draw the same mosaic (treemap also sorts by size). See the
renders `img/s-mosaic-stack.png` and `img/s-mosaic-treemap.png` in
`proposals/croissant-sampling/`, and `img/d-hundred-cut.png` for the third.

The repo rule is zero overlap or full subsumption. This is a large partial
overlap.

## The family

One rule: the whole's size is the sum of its parts along one axis.

- Bottom-up, the parts are given and the whole is their sum: `stack`.
- Top-down, the whole is given and the parts divide it:
  - by weight: `stack({ size })`, `treemap({ tile: Tile.slice | Tile.dice })`, `cut({ size })`
  - by cells of a scale: `partition`, `cut` by a binned key
- `spread` keeps the parts' spaces separate, so it is outside the rule.

## Questions

1. Which operator owns "divide a box by weight along one axis"? Options:
   `stack({ size })` only, with `treemap` keeping the 2D tilings; or one
   divide operator (`cut`, or `divide`) with `stack` back to bottom-up only.
2. Is `cut` the mark-side form of the same operator (a function twin,
   `cut(mark, opts)`), so it is one operator in two spellings, not two?
3. Should `Tile.slice` and `Tile.dice` stay as treemap strategies when they
   are one-axis divides?

## Also

`stack`'s descriptor doc (`packages/gofish-ir/src/frontend/descriptors.ts`)
still describes it as "`spread({ glue: true })`", the framing rejected on
11-05 (stack glues spaces into one; spread keeps them separate).
