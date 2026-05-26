---
title: The Mark Factory
section: Frontend
order: 20
status: draft
covers:
  - packages/gofish-graphics/src/ast/withGoFish.ts
  - packages/gofish-graphics/src/ast/channels.ts
---

# `createMark`: turning a shape into a frontend mark

`createMark` is the factory that wraps a low-level shape function (`Rect`,
`Ellipse`, `Petal`, `Text`, `Image`) and produces the frontend mark (`rect`,
`ellipse`, `petal`, `text`, `image`) used inside `chart(...).mark(...)`.

It lives at `src/ast/withGoFish.ts:419`.

The design is inspired by Krist Wongsuphasawat's **Encodable** ("Encodable:
Configurable Grammar for Visualization Components", IEEE VIS 2020 —
[arxiv:2009.00722](https://arxiv.org/abs/2009.00722)), which factors a
visualization component's grammar into per-component channel declarations
plus a parser that turns user-supplied encoding specs into rendering
parameters. `createMark` is the same idea adapted to GoFish's shape +
node-tree model (see "Prior art" at the bottom of this doc).

This file explains what `createMark` does, why it exists, and how to add a new
mark by calling it.

## What it does

A low-level shape takes plain pixel-space numbers:

```ts
Rect({ w: 50, h: 100, fill: "tomato" });
```

A frontend mark takes _data-aware_ inputs — either a plain value, or a field name to
pull from the data:

```ts
rect({ w: 50, h: "value", fill: "category" });
//        ^^         ^^^^^^^         ^^^^^^^^^^
//        literal    sum the         look up category
//                   "value" field   in the color palette
```

`createMark` is the bridge. You give it the low-level shape and a per-prop
**channel annotation** describing how that prop encodes data; it returns a
function that performs the encoding at render time and forwards the resulting
shape props to the underlying low-level builder.

## Anatomy of a `createMark` call

From `src/ast/shapes/rect.tsx:631`:

```ts
export const rect = createMark(Rect, {
  w: "size",
  h: "size",
  fill: "color",
  stroke: "color",
});
```

Two arguments:

1. **The low-level shape function** (`Rect`). Takes `ShapeProps`, returns a
   `GoFishNode`. This is the thing that actually allocates layout and renders.
2. **Channel annotations** (`{ w: "size", h: "size", fill: "color", ... }`).
   A partial map from prop name → channel type. Props not in this map pass
   through unchanged.

The factory's signature (`withGoFish.ts:419`):

```ts
function createMark<ShapeProps, C extends ChannelAnnotations<ShapeProps>>(
  shapeFn: (opts: ShapeProps) => GoFishNode,
  channels: C
): <T>(opts: DeriveMarkProps<ShapeProps, C, T>) => NameableMark<T | T[] | ...>;
```

## Channel types

Two are wired up today, both defined at `src/ast/channels.ts`:

| channel   | accepts                                 | does                                                                 |
| --------- | --------------------------------------- | -------------------------------------------------------------------- |
| `"size"`  | `number \| (keyof T & string) \| Value` | string → `inferSize` (sums field across data); number → pass-through |
| `"color"` | `string \| (keyof T & string) \| Value` | string → `inferColor` (color palette lookup if field, else literal)  |

If your prop should be a position offset (mean rather than sum), see the
`inferPos` helper — `createOperator` uses it via channel annotations of its
own; `createMark` could grow a `"pos"` channel the same way if a future shape
needs one.

A prop that does not appear in the annotations map (e.g. `Rect.cornerRadius`)
is passed through to `shapeFn` exactly as the user wrote it.

## What happens at render time

Walking `withGoFish.ts:431-477`:

1. **Unwrap the input.** Marks are called with one of three shapes —
   `T` (single datum), `T[]` (array), or `{ item, key }` (an item paired with a
   key set by an upstream operator). Step 1 normalizes them to `(d, key)`.
2. **Wrap to an array.** `data = Array.isArray(d) ? d : [d]`. The `infer*`
   helpers all expect an array.
3. **Apply each channel.** For each prop in the user's `markOpts`:
   - `Value`-wrapped (`v(...)`) → pass through unchanged. (Already final.)
   - `"size"` channel → `inferSize(markValue, data)`. If `markValue` is a
     string, sum that field across `data`; if a number, use as-is.
   - `"color"` channel → `inferColor(markValue, data)`. If the string matches
     a field in the first datum, wrap it as a `Value` so the color scale
     picks it up; otherwise treat the string as a literal color.
   - Anything else → pass through.
4. **Call the low-level shape.** The encoded shape props go into `shapeFn`,
   producing the `GoFishNode`.
5. **Tag the node** with `name = key` and `datum = d` so downstream
   coordinators (`select(...)`, label placement) can find it back.

## `.name()` and `.label()`

`createMark` returns a `NameableMark`, which is the base mark plus two
chainable methods:

- `mark.name("layerName")` — registers each produced node into the chart's
  layer context so `select("layerName")` can pull the array of refs.
- `mark.label(accessor, options?)` — calls `node.label(...)` on every produced
  node, deferring label placement to the layout phase.

Both wrap the base mark in a new closure rather than mutating it, so naming
or labeling one mark never affects another.

## Adding a new mark

Suppose you write a new low-level shape `Diamond({ w, h, fill, stroke })`.
The high-level `diamond` mark is one line:

```ts
export const diamond = createMark(Diamond, {
  w: "size",
  h: "size",
  fill: "color",
  stroke: "color",
});
```

Now consumers can write:

```ts
chart(data).mark(diamond({ w: "value", fill: "category" }));
```

…and the encoding (sum `value`, look up `category` in the palette) happens
for free. Anything Diamond's `ShapeProps` adds that isn't a "size" or "color"
channel — say `rotation: number` — passes through verbatim.

## Adding a new channel type

Today's channels are `"size"` and `"color"`. To add (say) `"angle"`:

1. Add `"angle"` to the `ChannelType` union in `channels.ts`.
2. Write `inferAngle(accessor, data)` next to `inferSize` — same shape, just
   the aggregation rule that makes sense for angles (probably a literal-or-mean
   like `inferPos`).
3. Extend `DeriveMarkProps`'s conditional with the input type for `"angle"`.
4. Extend the `if (channelType === "size") ... else if (channelType === "color")`
   chain in `withGoFish.ts` to handle it.

`createOperator` has its own channel handling
(see [The Operator Factory](/internals/frontend/operator-factory)) and would need
the same treatment if the new channel should be available in operator opts as
well.

## Prior art

`createMark` is most directly inspired by **Encodable** (Wongsuphasawat,
IEEE VIS 2020 — [paper](https://arxiv.org/abs/2009.00722),
[code](https://github.com/kristw/encodable)). Encodable's
`createEncoderFactory({ channelTypes, defaultEncoding })` produces an
`Encoder` that the component author uses internally; users of the
component supply encoding specs (field, scale, format) that the encoder
resolves into rendering parameters. The shape map is one-to-one:

| Encodable                                  | `createMark`                                        |
| ------------------------------------------ | --------------------------------------------------- |
| `createEncoderFactory({ channelTypes })`   | `createMark(shapeFn, channels)`                     |
| `channelTypes: { x: "X", color: "Color" }` | `channels: { w: "size", fill: "color" }`            |
| `Encoder` returned to component author     | `Mark<T>` returned, called per datum                |
| `ChannelEncoder` parses field/literal      | `inferSize`/`inferPos`/`inferColor` parse the value |

GoFish's twist is that a mark also produces a node in a layout AST rather
than a render directly, and the channel set is smaller (`size`, `pos`,
`color`) — Encodable's vega-lite-flavored channel taxonomy is richer.
[The Operator Factory](/internals/frontend/operator-factory) extends the same pattern
to layout operators (split + per-partition application).

## Pointers

- The factory: `src/ast/withGoFish.ts:419`.
- The channel helpers (`inferSize`, `inferPos`, `inferColor`) and the
  `DeriveMarkProps` conditional: `src/ast/channels.ts`.
- The five existing call sites: `rect`, `ellipse`, `petal`, `text`, `image`
  in `src/ast/shapes/`.
- The companion factory for layout operators:
  [The Operator Factory](/internals/frontend/operator-factory).
- The factory's optional `serialize` config (third argument) tags the
  produced mark with `__serialize` metadata that the frontend-IR emitter
  reads — see [Frontend IR (Serialization)](/internals/frontend/serialization).
- Encodable: paper [arxiv:2009.00722](https://arxiv.org/abs/2009.00722),
  source [github.com/kristw/encodable](https://github.com/kristw/encodable).
