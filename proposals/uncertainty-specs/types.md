# Types and schema changes for distributions (#980)

This page lists the type and schema changes the proposed API needs. It is
grounded in the code on `main` after #1200 and #1237. The TypeScript sketch
is `types-sketch.ts`, beside this page. It imports the real descriptor DSL
and IR types from `gofish-ir`, and it typechecks:

```
packages/gofish-graphics/node_modules/.bin/tsc --noEmit --strict --target es2022 \
  --moduleResolution bundler --module esnext --skipLibCheck --noUnusedLocals \
  proposals/uncertainty-specs/types-sketch.ts
```

It exits 0. It has six `@ts-expect-error` lines. With the directives removed,
the same command reports exactly six errors, so each one is a real error.

## The idea that keeps the change small

A group of rows is already a distribution: the empirical distribution of its
values. Today's `.mean()` and `.median()` fold a group's rows, and that is the
mean and median of that empirical distribution. `Bin.quantiles` cuts a
column's empirical quantiles. So the change does not add a second world. It
lets a cell hold a distribution that is not made of rows (a normal from two
parameter columns), and it records when rows are draws.

Three rules follow, and they settle several spelling conflicts below.

1. **One fold.** A distribution channel folds a group's rows into one Dist: the
   mixture of the rows' Dists, where a plain value is a Dist with all its mass
   at that value. So a plain column in a group gives its empirical Dist
   (Approach B), and one row with `dist.normal` gives that normal (Approach A).
   B is A with plain columns.
2. **One summary.** `.mean()`, `.median()` and `.quantile(p)` summarize the
   folded Dist. On a plain column that is exactly what they do today. Design
   note question 6 (row folds versus cell summaries) needs no second name.
3. **Binning a Dist key truncates it.** A cell of `field(d).bin(Bin.quantiles(n))`
   holds the Dist cut to the cell. For a sample, that is the draws that fall in
   the cell, which is today's row split.

## What exists today

- **Units and column classes.** `Unit(name?, { domain, traits })`
  (`packages/gofish-graphics/src/ast/schema.ts:360`). A unit stands for the
  column classes `HasUnit`, `HasLevels`, `HasOrder` and `HasMidpoint`
  (`schema.ts:310`). `Domain.discrete` and `Domain.ordered` are in
  `src/families/domain.ts:58` and `:65`. `Trait.summable()` and
  `Trait.diverging()` are in `src/families/trait.ts`. `CanAdd` lives on the
  unit (`schema.ts:152`, `HasUnit.classes`).
- **Column records.** A schema entry is `{ name?, unit? }`, a `Unit`, or a
  unit's name (`schema.ts:496` and `:507`). Unknown keys throw
  (`schema.ts:532`). The record of classes is the wire form (`schemaToWire`,
  `schema.ts:559`), and the types ride the data array under `COLUMN_TYPES`
  (`schema.ts:641`). A split leaf gets them with `copyColumnTypes`
  (`src/ast/marks/createOperator.ts:1276`).
- **The CanAdd check.** `checkSummable` (`src/ast/measure.ts:142`) runs at
  every sum: a size channel (`src/ast/channels.ts:213`), `.sum()`
  (`src/ast/fieldExpr.ts:460`), treemap, and a stack's free parts through
  `Units.sum` (`src/ast/constraints/distribute.ts:361`). It reads the unit,
  never the rows.
- **Where a stack reads its key's type.** `spread`'s split already reads
  `columnType(d, by)` when `glue` is set, for `HasMidpoint`
  (`src/ast/graphicalOperators/spread.tsx:253` to `:259`). A draw-key check
  goes there.
- **Field expressions.** `FieldOp` (`fieldExpr.ts:64`) and its IR mirror
  `FieldOpIR` (`packages/gofish-ir/src/frontend/schema.ts:961`). `field(name)`
  takes one column name (`src/ast/data.ts:198`). A key over two columns is its
  own accessor, `struct({ x, y })` (`src/ast/structExpr.ts`, IR
  `StructAccessor` at `schema.ts:950`).
- **Spans.** A channel value is one value (`ChannelValue`, IR `schema.ts:895`).
  The one span form is a `dims` entry, an `AxisInterval` `{ min, center, max,
size }` (IR `schema.ts:906`). An untagged plain object is an interval
  (`isAxisInterval`, `gofish-ir/src/frontend/validate.ts:587`). `scatter`'s
  `yMin`/`yMax` are two position channels (`descriptors.ts:1596`).
- **Channel kinds.** `ChannelInfer` is `size | pos | color | raw`
  (`descriptors.ts:48`). It drives `markChannels.generated.ts`.
- **Strategy families.** `STRATEGIES` (`descriptors.ts:627`) holds `Tile`,
  `Overlap`, `Curve`, `Bin`, `Calendar`, `Shape`, `Place`, each a
  `StrategyFamily` (`descriptors.ts:544`). `Overlap.noise` already spells a
  kernel bandwidth as `smoothing: number | "silverman"` (`descriptors.ts:673`).
- **Quantiles.** `Bin.quantiles` reads `HasDomain.sorted()`
  (`src/ast/cells.ts:619` and `:636`). `quantileRows`
  (`src/ast/quantileRows.ts`) is the declared shortcut that #1231 removes.
- **Python.** `FieldAccessor` and `field()` are at
  `packages/gofish-python/gofish/ast.py:3036` and `:3245`, `Unit` at
  `ast.py:2578`, and the marks and operators are generated into `_generated.py`.

## The changes by layer

### Value types (no code today)

`Dist<T>` is a type over the #1200 value types. Each summary asks for a
capability of T:

| Operation                               | Needs from T    | In #1200 terms                                    | Result                                     |
| --------------------------------------- | --------------- | ------------------------------------------------- | ------------------------------------------ |
| `quantile`, `median`, `cdf`, `interval` | an order        | `HasUnit` amounts, or `HasLevels` with `HasOrder` | T, or an interval of T                     |
| `mean`                                  | averages        | `HasUnit` amounts (instants and °C too)           | T                                          |
| `sd`                                    | differences     | `HasUnit` amounts                                 | T's difference unit (`HasUnit.difference`) |
| `prob(level)`                           | discrete values | `HasLevels`                                       | a share                                    |
| density (`slab`, `gradient`)            | length          | `HasUnit` amounts                                 | density                                    |
| sum over draws                          | never           | none                                              | error                                      |

In the sketch the summaries take a `this` type, so the wrong T is a compile
error:

```ts
mean(this: DistExpr<AffineValue, J>): ValueExpr<T>;
quantile(this: DistExpr<OrderedValue, J>, p: number): ValueExpr<T>;
sd<U extends UnitTag>(this: DistExpr<Amount<U>, J>): ValueExpr<Amount<DiffUnit<U>>>;

// @ts-expect-error .mean() on Dist<Ordinal>: an ordinal level has no average.
rating.mean();
```

A Dist is held at run time in one of six forms (`DistRep` in the sketch):
`pure`, `family` (named parameters, which may be Dists, so nesting is free),
`sample` (draws with ids and weights, and a shared `key` when joint),
`mixture`, `truncated` and `smoothed`. Its type carries its dependence,
`independent` or `joint`.

### Data and schema

**Additive.** The column record gets two keys, and the column type gets two
classes:

```ts
chart(draws, {
  schema: { temp: { unit: Celsius, draws: "draw", weight: "w" } },
});
// wire:
// temp: { HasUnit: {...}, HasSample: { draws: "draw", weight: "w" } }
// draw: { HasDraws: { joint: true } }
```

- `draws` names the column that says which draw each row is. It is a fact
  about the table, so it sits in the record and not on the unit. This is the
  same reason #1198 puts `entity` in the record.
- `HasDraws { joint, n?, seed? }` is on the draw-key column. The schema writes
  it from a record's `draws`. `sample` writes it with `joint: false` for
  `dist.*` cells. `resample` and `dist.dirichlet` write it with `joint: true`.
- `HasSample { draws, weight? }` is on the value column.
- `RECORD_KEYS` (`schema.ts:499`) grows to `name`, `unit`, `draws`, `weight`.

**Internal change.** `HasDomain.sorted()` becomes `HasDomain.quantile(p)`.
For a plain column it is the type-7 quantile of the sorted values, as now. For
a Dist key it is the Dist's own quantile. `quantileEdges` then cuts a Dist with
no new code, and `quantileRows` is deleted (#1231). No user writes `HasDomain`,
so nothing public breaks.

`DataIR` does not change. A `dist.*` value is a field expression over plain
columns, and draws are plain rows.

### Field-expression IR

**Additive.** A new tagged accessor, beside `FieldAccessor` and
`StructAccessor`, because a normal reads two columns:

```ts
interface DistAccessor {
  type: "dist";
  family: DistFamilyName; // normal, lognormal, student, beta, dirichlet, categorical
  params: Record<
    string,
    number | string | FieldAccessor | DistAccessor | DatumValue
  >;
  ops?: FieldOpIR2[];
}
type ChannelValue2 = ChannelValue | DistAccessor;
```

New ops, added to `FieldOpIR` and `FieldOp`: `quantile { p }`, `cdf { at }`,
`sd`, `prob { level }` and `kde { smoothing? }`. `mean` and `median` keep
their wire form. `.interval(p)` adds no op: it returns a plain
`{ min: q((1 − p) / 2), max: q((1 + p) / 2) }`, which is an `AxisInterval`.

### Construct descriptors

**Additive.** One new channel kind, `dist`, in `ChannelInfer`. It folds a
group's rows into one Dist, as `size` sums and `pos` averages. Signal marks
use it:

```ts
const distAxis = {
  x: chDist("The distribution, along x. Give x or y, not both."),
  y: chDist("The distribution, along y. Give x or y, not both."),
};
interval: { type: "interval", kind: "leaf-mark", include: [paint],
  fields: { ...distAxis, levels, along: {...}, band: { type: t.ref("Band") } } },
```

New operators: `sample { n?, coverage?, at, seed? }`, `resample { n, seed? }`,
`overlay { by, weight?, opacity: { min } }` and `summarize { columns }`.
New leaf marks: `slab { x | y, side, normalize }`, `interval { x | y, levels,
along?, band? }`, `dots { x | y, n }`, `gradient` (rect's box channels, each
of which may be a Dist), `cdf` and `ccdf`. The full entries are in the
sketch, in the shape of the `OPERATORS` and `LEAF_MARKS` tables.

### Strategy families

**Additive.** `Band` joins `STRATEGIES`: `Band.pointwise()` (default) and
`Band.depth({ outliers })`, with `outliers` a number (default 1.5) or `false`.
The `dist.*` constructors get a table in the same `StrategyFamily` shape
(`DIST_FAMILIES`), so the validator, the JSON Schema and the Python
generator read it the way they read `STRATEGIES`. It is a separate table
because a dist is a channel's value, not one choice for an option.

### Python wire

**Additive.** Python gets a `DistAccessor(dict)` class beside
`FieldAccessor` (`ast.py:3036`), the new methods on both, a `dist` module, and
generated wrappers for the new marks and operators. The schema's new classes
cross as they are, like `HasUnit`. `sample` and `resample` take a `seed`, and
JS and Python must share one seeded generator so a story draws the same
values on both sides (design note question 1). Python can send draws as rows
with no new transport.

### The checker

Four checks, each at a place that already reads column types:

| Rule                                                       | Where                                                           | Kind          |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| A Dist in a T channel with no lift                         | `inferNumeric`, `channels.ts:248`                               | static        |
| `stack` by a draw key                                      | `spread`'s split, `spread.tsx:259`                              | static        |
| A sum over several draws (size channel, `.sum()`, treemap) | beside `checkSummable`, `measure.ts:142`                        | from the rows |
| A connecting mark over independent draws                   | the path-tier choice, `classifyOperator`, `chartBuilder.ts:210` | static        |
| `quantile` on a nominal T, `mean` on an ordinal T          | `evalFieldValues`, `fieldExpr.ts:488`                           | static        |

The error texts are the design note's, word for word where the note has one.
The fluent TS surface catches the first, second, fourth and fifth at compile
time in the sketch. The engine runs all of them, for Python and for untyped
columns:

```ts
// @ts-expect-error rect h holds Dist<USD> and nothing draws it.
chart([])
  .flow(spread({ by: "region", dir: "x" }))
  .mark(rect({ h: sales }));
// @ts-expect-error stack by "draw" after sample: the sum of a sample's draws has no meaning.
chart([]).flow(sample({ n: 20 }), stack({ by: "draw", dir: "y" }));
```

The sum check over several draws is #1198's entity check with the draw key as
the repeated key. They should be one function.

## Spelling conflicts reconciled

- **`.interval(p)` as a span.** Chosen: `rect({ dims: { x: d.interval(0.95) } })`
  and `scatter({ dims: { y: d.interval(0.95) } })`. `rect({ x: d.interval(p) })`
  is an error, because `x` is one position. The IR already has one span form,
  the `dims` interval, and a plain object of two quantiles is one. So the span
  needs no IR change. Signal's two `.quantile(p)` calls stay valid and mean
  the same.
- **`field(d).quantile(p)` on a Dist expression.** Chosen: `d.quantile(p)`.
  `field()` takes a column name. A `dist.*` value is already an expression.
- **`rvar(field, { draw })`, B's `interval({ draw })`, and `overlay({ weight })`.**
  Chosen: the column record, `{ draws: "draw", weight: "w" }`. Which rows are
  one draw is a fact about the table, as #1198 argues for `entity`. With it,
  A and B need no per-mark `draw` option, and `overlay` reads the weight. An
  explicit `overlay({ by, weight })` stays as an override for a key that is
  not a draw key, such as a model ensemble.
- **`rvar(field)` with no draw key.** Dropped. A plain column in a Dist
  channel is the group's rows as draws, by the one-fold rule.
- **`dist.kde(field)`.** Chosen: `field("temp").kde({ smoothing })`. It folds a
  group's rows, like `.mean()`, while `dist.*` builds a Dist per row from
  parameters. `smoothing` is `Overlap.noise`'s word for the same bandwidth
  (`descriptors.ts:673`). This also gives B's `slab` its bandwidth option.
- **`gradient({ y: d })` and `gradient({ x: start, x2: end })`.** Both. `gradient`
  takes rect's box channels, and any of them may hold a Dist. One Dist end
  follows its density. Two ends give P(start ≤ t ≤ end).
- **Overlay opacity.** Chosen: `max(min, w / Σw)`, with `opacity: { min }`
  defaulting to 0.05. Equal weights give 1/n, as the sheet says. Papers A's
  `w / max(w)` makes equal weights all opaque, so it disagrees with 1/n.
- **`sample()` with no `n`.** Kept: every stored draw of a draws column. For a
  `dist.*` cell, which stores none, it is an error.
- **B's `sample({ value: dist.*, n, as })`.** Not needed. A's
  `sample({ n })` with a `dist.*` channel works in both, by the one-fold rule.
- **`sample({ at: "quantiles" })`.** Kept, as an enum beside `"random"`. It has
  no parameters, so it is not a strategy family.
- **`dist.normal` over an Instant.** Its `sd` is in the difference unit of
  `mean`'s unit, so a duration. The sketch types it with `DiffUnit<U>`.
- **`scale: "probit"` on `ccdf`.** Not a mark option. A scale acts on every mark
  on its axis (design note section 4), so it belongs to the axis. GoFish has no
  scale family yet. That is a separate issue.

Not types, but met along the way: `field(x).plus(1)` (papers A), `rule` as a
reference-line mark, `strokeDasharray` on `rect`, `spread({ wrap })`, an
opacity channel on `line`, and a `group` over two keys.

## Additive or breaking

Everything is additive for users. Two changes are internal: `HasDomain.sorted()`
becomes `quantile(p)`, and `quantileRows` is deleted (#1231 asks for that).
`mean` and `median` change meaning only on Dist inputs, which do not exist
today.

## Open decisions

1. Should the draw key live in the column record (`{ draws }`, this page's
   pick) or in a channel expression (`rvar`, the sheet's spelling)?
2. Should the namespace be `dist.normal` (like `time`) or `Dist.normal`
   (CLAUDE.md capitalizes factory namespaces, and `Dist.Dist` would be the
   type, like `Curve.Curve`)?
3. Should a mixed chart (a `dist.*` cell and a joint draws column) treat the
   two as independent, or is it an error?
4. Should a group with several `dist.*` rows fold to their mixture, or should
   a signal mark draw one shape per row, as ggdist does?
5. Is the draw-sum check the same function as #1198's entity check, so #1198
   lands first?
6. Should Python send `dist.*` parameters only, or also cells of SciPy
   distributions as an Arrow struct column (a `HasDist` class)? This page
   leaves cells out.
7. Is the probability bar `prob()` per level a flow step (one row per level,
   like `sample({ at: "quantiles" })`), or a mark?
8. What sets the axis extent of an unbounded Dist: a quantile range, and
   which?
