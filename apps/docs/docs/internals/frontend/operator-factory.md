---
title: The Operator Factory
section: Frontend
order: 30
status: draft
covers:
  - packages/gofish-graphics/src/ast/marks/createOperator.ts
---

# `createOperator`: turning a layout into a frontend operator

`createOperator` is the factory that wraps a low-level layout node-builder
(`Spread`, `Scatter`, `Table`, `Frame`) and produces the frontend operator
(`spread`, `scatter`, `table`, `group`, plus `stack` as a thin wrapper over
`spread`) used inside `chart(...).flow(...)` and as a combinator inside
`.mark(...)`.

It lives at `src/ast/marks/createOperator.ts`.

The design is inspired by Krist Wongsuphasawat's **Encodable** ("Encodable:
Configurable Grammar for Visualization Components", IEEE VIS 2020 —
[arxiv:2009.00722](https://arxiv.org/abs/2009.00722)). `createOperator`
extends Encodable's per-component channel-grammar pattern to layout
operators: the channel system carries over verbatim, with a `split` step
added in front and a `combine` (low-level layout) step added behind. See
"Prior art" at the bottom of this doc for the mapping.

This doc explains what the factory does, why it has two call shapes, and how
to add a new operator. It assumes you've read
[The Mark Factory](/internals/frontend/mark-factory) — this is the same idea
applied to layout containers instead of leaf shapes.

## 1. The two call shapes every operator has

Every layout operator is a single function that you can call in two ways:

```ts
// (A) Combinator form — pass marks directly:
spread({ dir: "x" }, [m1, m2, m3]);

// (B) Operator form — used inside .flow():
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }));
```

| form           | what varies   | what's shared               | meaning                                               |
| -------------- | ------------- | --------------------------- | ----------------------------------------------------- |
| **combinator** | n marks       | one datum                   | "arrange these n marks horizontally"                  |
| **operator**   | n data slices | one `mark`, one outer datum | "for each group of data, build a mark; arrange those" |

In combinator form, the user provides the array (of marks). In operator form,
`split` produces the array (of data slices) from `by`. Either way, the
factory ends up with N children to hand to the same low-level layout. The two
forms aren't strictly category-theoretic duals — they're two ways of getting
to the same N-children-then-layout shape, with different sources of the
multiplicity.

`createOperator` produces both forms from one config. Disambiguation is by
arg shape: a second positional argument means combinator form; no second
arg means operator form.

## 2. The split → fmap → combine shape

Pick any layout operator and you'll find the same three steps — a fan-out
into N pieces, followed by a fan-in back to a single node:

::: starfish example:internal-operator-factory-pipeline hidden
:::

1. **Split.** Partition the data into pieces. For `spread`, this is
   "groupBy `by`-field"; for `table`, it's the cartesian product of two
   fields; for `group`, it's groupBy. For `scatter` with no `by`, it's
   "one piece per item".
2. **fmap.** Apply the user's mark to each piece, producing one
   `GoFishNode` per piece.
3. **Combine.** Hand the array of nodes to the low-level layout function
   (`Spread`, `Table`, `Scatter`, `Frame`), which positions them.

The combinator form skips `split` entirely — the user already supplied the
array of marks. The factory loops over them, applies each to the shared
datum, and hands the resulting nodes to the same `combine` step.

## 3. Anatomy of a `createOperator` call

From `src/ast/graphicalOperators/spread.tsx:430`:

```ts
export const spread = createOperator<any, SpreadOptions>(Spread, {
  split: ({ by }, d) =>
    by ? Map.groupBy(d, (r: any) => r[by]) : new Map(d.map((r, i) => [i, r])),
  channels: { w: "size", h: "size" },
});
```

Three pieces:

1. **The low-level layout function** — `Spread`, the existing
   `createNodeOperator`-built node builder that already knows how to position
   children along an axis. This is the **combine** step.
2. **`split(opts, d)`** — partition `d` into an ordered `Map<key, subdata>`.
   Insertion order matters (it determines layout order). When `by` is omitted,
   each item becomes its own one-element group.
3. **`channels`** (optional) — per-opt data-aware encodings. Same idea as
   `createMark`'s channels: `w: "size"` means the user can pass a field name,
   and the factory will apply `inferSize` before handing opts to `Spread`.

That's it. Both call shapes (operator and combinator) fall out of the
factory.

## 4. What happens at render time

### Operator form (`spread({ by, dir })` inside `.flow(...)`)

Walking `createOperator.ts:391-415`:

1. **Split** — `cfg.split(opts, d)` partitions the input into a
   `Map<key, subdata>`. (Some operators, like `table`, also return `keys` —
   row/column labels that get merged into the layout opts.)
2. **fmap** — for each `(key, subdata)` entry, call the user's mark with
   that subdata and a parent-prefixed key (`${key}-${i}`). The result is
   resolved to a `GoFishNode`. `node.setKey(...)` makes downstream
   coordinators able to look it back up.
3. **Apply channels** — `applyChannels` runs `inferSize` / `inferPos` /
   `inferColor` on annotated opts. For an entry-flagged channel
   (`{type, entry: true}`), the inference runs once per split entry,
   producing an array of values (one per child); otherwise it aggregates
   over all of `d` and produces one value.
4. **Strip factory keys** — `by` and `debug` never reach the low-level
   layout; remove them from opts.
5. **Combine** — call the low-level `layout` with the encoded opts and the
   array of child nodes.

### Combinator form (`spread({ dir }, [m1, m2, m3])`)

Same machinery, simpler:

1. Apply each mark in `marks` to the same `d`. Marks may be any of:
   `Mark<T>` functions, already-resolved `GoFishNode`s (e.g. `ref(...)`),
   or a `Promise<Mark<T>[]>` (e.g. when produced by SolidJS `For(...)`).
2. Apply channels (no per-entry inference — there's no split).
3. Strip factory keys.
4. Combine.

## 5. Channels in operator opts

The factory's channel system mirrors `createMark`'s, with one extra spec
shape — entry-flagged channels:

```ts
channels: {
  w: "size",                          // aggregate over all data, one value
  x: { type: "pos", entry: true },    // per-entry, produces array of values
}
```

| spec                            | what it does                                                        |
| ------------------------------- | ------------------------------------------------------------------- |
| `"size"` / `"pos"` / `"color"`  | aggregate over all of `d`, produce one value (single number/string) |
| `{ type: "size", entry: true }` | run once per split entry, collect into array (one value per child)  |
| user passed an array            | already final form — pass through unchanged                         |

`scatter` uses `entry: true` for `x`/`y`/`xMin`/`xMax`/`yMin`/`yMax` so a
field name like `x: "miles"` becomes a per-group mean position
(`src/ast/graphicalOperators/scatter.tsx:336`).

## 6. Adding a new operator: a worked example

Suppose you want a `wrap` operator that lays children out left-to-right
with line wrapping at a max width. (This isn't a real GoFish operator
today — it's an example.)

You already have the low-level node builder, `Wrap`, written with
`createNodeOperator`. Then:

```ts
export type WrapOptions = {
  by?: string;
  maxWidth: number;
  spacing?: number;
};

export const wrap = createOperator<any, WrapOptions>(Wrap, {
  split: ({ by }, d) =>
    by ? Map.groupBy(d, (r) => r[by]) : new Map(d.map((r, i) => [i, r])),
});
```

Both forms now work without further code:

```ts
// Operator form:
chart(items)
  .flow(wrap({ by: "category", maxWidth: 400 }))
  .mark(rect({ w: "size" }));

// Combinator form:
wrap({ maxWidth: 400 }, [m1, m2, m3, m4]);
```

If `Wrap` accepts a width-per-child, you'd add `channels: { width: "size" }`
so consumers can pass a field name there.

If your operator needs to feed extra data (like `colKeys`/`rowKeys`) into
the layout opts, return the wrapped `{entries, keys}` form from `split`
instead of a bare Map — see `table.tsx:228` for an example.

## 7. The relationship with `createMark`

The two factories are siblings:

|                  | wraps                               | output                                    |
| ---------------- | ----------------------------------- | ----------------------------------------- |
| `createMark`     | a leaf shape (`Rect`, `Ellipse`, …) | a `Mark<T>` (one node from one datum)     |
| `createOperator` | a layout (`Spread`, `Scatter`, …)   | a dual-mode operator (one node from many) |

Both use channel annotations to encode opts; both produce mark types
supporting `.name(...)` and `.label(...)` chaining.

Naming-wise: `createOperator` is the frontend factory; the low-level helper
that produces `Spread`, `Scatter`, etc. is `createNodeOperator`
(`withGoFish.ts:297`). The "node" prefix reflects that it returns a function
whose output is a single `GoFishNode`, not the dual-mode shape that
`createOperator` returns.

## 8. Prior art

`createOperator` extends the per-component channel-grammar pattern from
**Encodable** (Wongsuphasawat, IEEE VIS 2020 —
[paper](https://arxiv.org/abs/2009.00722),
[code](https://github.com/kristw/encodable)) to layout operators. The
channel system maps onto Encodable's directly — see
[The Mark Factory](/internals/frontend/mark-factory)'s "Prior art" section for the
mark-level table. `createOperator` adds two pieces Encodable doesn't have:

| step                       | what it does                                          | Encodable analogue                                                                           |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `split`                    | partition the input data into an ordered Map          | none — Encodable encodes a single component, not a layout                                    |
| `channels`                 | parse user opts into rendering parameters             | `Encoder` / `ChannelEncoder`                                                                 |
| `layout`                   | combine partitioned children into one node            | none — Encodable's encoders feed a renderer outside the grammar layer                        |
| `entry: true` channel flag | per-partition aggregation (e.g. mean x of each group) | extension; closest analogue is Encodable's per-channel scale resolution against grouped data |

The two-call-shapes design (combinator and operator/traversal) — where the
multiplicity comes from the marks array vs. the data partitions — is novel
to `createOperator`; Encodable doesn't address layout multiplicity.

## 9. Pointers

- The factory: `src/ast/marks/createOperator.ts`.
- Existing operators (each colocated with their low-level layout):
  - `spread` and `stack` — `graphicalOperators/spread.tsx`.
  - `scatter` — `graphicalOperators/scatter.tsx`.
  - `table` — `graphicalOperators/table.tsx`.
  - `group` — `graphicalOperators/group.ts` (sibling of `frame.tsx`,
    extracted to keep the chartBuilder ↔ createOperator import graph
    acyclic).
- The companion mark factory: [The Mark Factory](/internals/frontend/mark-factory).
- The `serialize` config field tags the produced operator with
  `__serialize` metadata the frontend-IR emitter reads — see
  [Frontend IR (Serialization)](/internals/frontend/serialization).
- Encodable: paper [arxiv:2009.00722](https://arxiv.org/abs/2009.00722),
  source [github.com/kristw/encodable](https://github.com/kristw/encodable).
