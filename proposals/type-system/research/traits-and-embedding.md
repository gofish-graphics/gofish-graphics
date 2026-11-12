# Traits and embedding for the GoFish type system

Research notes for the draft "GoFish Goes to School: A Type System for
Semantic Validity". This document answers two questions.

1. Are traits needed, and where do they sit?
2. Should the types live in the DSL, in TypeScript's type system, or both?

It is a research document. It lays out choices and a recommendation, and
nothing in it is signed off.

## Terms used here

- A **trait** is a named fact about a type that says what its values can do,
  e.g., `HasOrder` (the values have an order) or `CanSum` (a sum of the
  values means something). GoFish names traits `Has<Thing>` for a property
  and `Can<Verb>` for an operation (`apps/docs/docs/internals/design/api-design.md`,
  "Data types"). Rust calls this a trait, Haskell a type class, and Lean a
  class.
- An **instance** is the proof that one type has one trait. In Haskell and
  Lean an instance is also a value, a record of functions (a **dictionary**),
  that the compiler passes to the code that needs it.
- A **multi-parameter trait** relates two or more types. Here it relates a
  column and a key, e.g., "stock can be summed over warehouse".
- A **key** is a column that groups rows, e.g., the `by` of `spread` or
  `stack`. The **key context** is the set of keys at one point in a pipeline:
  the keys split so far, and the keys still left in each group.
- **Elaboration** is the step that turns a short spec into a full one by
  filling in defaults, e.g., choosing `.sum()` for a bar's height.
- **Extensive**, **intensive** and **cumulative** are the draft's three kinds
  of additivity. An extensive value adds over disjoint groups (units sold).
  An intensive value is a ratio of two extensive values and combines by a
  weighted mean (price). A cumulative value is a running total over an
  ordered key (inventory over months).
- A **phantom type** is a type parameter that no run-time value holds. It
  exists only so the compiler can check it.

## Summary

- Traits are needed, and GoFish already has most of the ones the draft needs.
  The draft hid them because it named bundles (`Ratio`, `Affine`, `Count`)
  instead of the traits inside them.
- Of the draft's five axes, only additivity needs new traits. They are traits
  of a (column, key) pair, so they sit on the column, not on the unit. The
  existing unit trait `CanSum` cannot express them, because two columns in one
  unit (stock and sold, both in items) add up over different keys.
- Units are not traits. A unit is the parameter of `HasUnit`, and unit
  arithmetic is the group of unit names that `measure.ts` already unifies.
- The coordinate frame is not a data trait. Operators compute it bottom up as
  facts about spaces, and coordinate transforms check those facts.
- The types must be run-time values in the DSL, because elaboration, error
  messages, Python and data-dependent facts all need them at run time.
- TypeScript can mirror a useful subset. The experiments below catch a stack
  over the wrong key, a stack of an averaged field, log after a stack, and a
  misspelled column, with readable messages and almost no compile-time cost.
  Arithmetic on units works for small exponents. The mirror degrades to the
  run-time check for untyped rows and dynamic names, as it must.
- Recommendation: the run-time types are the source of truth. A TypeScript
  mirror is worth building only for field names now, and for trait checks
  later if the LLM authoring benchmark shows that editor errors help.

## Part 1. Traits

### What exists today

GoFish has three groups of traits. Each is a record keyed by trait name, and
the record is also the wire form that Python sends.

Column traits (`packages/gofish-graphics/src/ast/schema.ts`, `ColumnType`):

| Trait         | Record                                           | Declared by                            |
| ------------- | ------------------------------------------------ | -------------------------------------- |
| `HasLevels`   | `{ levels }`                                     | `Domain.discrete(levels)`              |
| `HasOrder`    | `{}`                                             | `Trait.ordered()`                      |
| `HasMidpoint` | `{ at }`                                         | `Trait.diverging(midpoint?)`           |
| `HasUnit`     | `{ unit, symbol?, traits?, zone?, difference? }` | `Unit(name)` or a unit's name          |
| `HasQuantity` | `{ name }`                                       | a column record's `name`               |
| `HasDomain`   | `{ lo, hi, sorted }`                             | computed from the data, never declared |
| `HasInteger`  | `{}`                                             | attached by the Python host's decode   |

Unit traits (`UnitTraits`, inside `HasUnit.traits`): only `CanSum`, declared
with `Trait.summable()`. It was `CanAdd` until #1311 renamed it, because every
check it gates is a sum. (The memory note on trait naming still says `CanAdd`,
so it is out of date.)

Axis traits of a coordinate space (`AxisTraits` in
`ast/coordinateTransforms/coord.tsx`): `HasZero` and `HasCycle { period }`.
Polar declares θ as `HasCycle` with period 2π and r as `HasZero`. A calendar
cycle (`HasCycle` in `ast/cells.ts`) is a fourth place, for the parts of a
cycle such as the twelve months.

Open issues plan more: `HasZero` on columns (#1051), `HasCycle` on columns
(#1052), how data measures map onto axes (#1195), and a FLINT-style unit
definition (#1142). The "space as traits" research (artifact N6YYcKQM) found
that stack needs a `HasVector` (a net amount) plus an add trait, and that
"origin pinned, free or none" is a placement state of a space, not a trait.

Three facts about today's design shape everything below.

- A unit is a domain plus traits: `Unit(name?, { domain?, traits? })`. The
  domain says which values exist, and the traits say everything else.
- A trait may imply another, e.g., `Trait.diverging()` implies
  `Trait.ordered()`, and a trait may need another, e.g., `HasMidpoint` needs
  `HasOrder`.
- Unit typing is gradual. A column with no declared unit has an unknown unit
  that unifies with anything, and a sum of it passes. A unit declared by name
  alone has unknown traits, and a sum of it passes until a definition of that
  name is met (`meetUnitTraits` in `measure.ts`).

### The five axes, written as traits

The draft's `&` already reads as a conjunction of traits. The trouble is that
most of its names are bundles of traits, and one is a domain. This table maps
each draft name to what GoFish has or would need.

| Draft name        | As traits                                                                                        | Status                                               |
| ----------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `Nominal`         | no `HasOrder` (with or without `HasLevels`)                                                      | exists, as the absence of a trait                    |
| `Ordered`         | `HasOrder`                                                                                       | exists for levels; numbers need `Domain.continuous`  |
| `Affine<u>`       | `HasUnit { unit: u, difference: Δu }`, no `HasZero`                                              | `difference` exists; `HasZero` is #1051              |
| `Ratio<u>`        | `HasUnit { unit: u }` plus `HasZero`                                                             | needs `HasZero` (#1051)                              |
| `Diverging(mid)`  | `HasMidpoint { at: mid }`                                                                        | exists for levels                                    |
| `Cyclic(n)`       | `HasCycle`                                                                                       | exists on axes and calendar cells; columns are #1052 |
| `Bounded[lo, hi]` | a domain, `Domain.continuous([lo, hi])`                                                          | the code has a TODO for `Domain.continuous`          |
| `Positive`        | a domain, `Domain.continuous` with a lower bound above 0                                         | same TODO                                            |
| `Count<u>`        | `Ratio<u>` plus `CanSum` over every key, plus `HasInteger`                                       | a named bundle                                       |
| `Extensive<k>`    | `CanSum { by: k }`                                                                               | new, keyed                                           |
| `Intensive<k, w>` | `CanAverage { by: k, weight: w }`                                                                | new, keyed                                           |
| `Cumulative<k>`   | `HasRunningTotal { by: k }`                                                                      | new, keyed                                           |
| key structure     | the same column traits on the key column: `HasOrder`, `HasCycle`, levels, a binned or struct key | mostly exists                                        |
| units of measure  | not a trait; the parameter of `HasUnit`                                                          | exists (`measure.ts`)                                |
| coordinate frame  | not a data trait; facts that operators compute about spaces                                      | partly exists (space origin state, `AxisTraits`)     |

Some notes on the rows.

**Affine and ratio need only two value traits.** An affine value (a
temperature in °C, a date) can be subtracted, and the difference is in a
difference unit (°C − °C is Δ°C, an instant minus an instant is a duration).
GoFish already writes this as `HasUnit.difference`, so `CanSubtract` needs no
separate key. A ratio value adds `HasZero`. A point scale with a zero is a
vector space, so `HasZero` together with subtraction gives addition of values.
A mean of affine values is well defined, so subtraction also gives averaging.
The draft's hierarchy then has two primitive value traits:

- `HasZero`: the value 0 means "none of it", so a length from 0 means
  something.
- subtraction into a difference unit, which GoFish already has as
  `HasUnit.difference`.

**HasZero and summing are separate.** Price in USD per item has a zero ($0 is
free) and a ratio of two prices means something, but summing prices across
stores means nothing. So `Ratio` must not imply `CanSum`. Today
`Trait.summable()` on a unit mixes the two: its docs say amounts that do not
add up, "temperatures, prices, rates", are in a unit without it. That works
only while every column of a unit adds up over the same keys.

**Diverging belongs where GoFish already put it.** The draft puts
`Diverging(mid)` on the value. In GoFish, `HasMidpoint` is on the ordered key
of a Likert stack (the response levels), and `stackOrigin` in `schema.ts`
puts the stack's 0 at that point along the key's order. That is right for
Likert charts, where the bars are counts and the midpoint is in the response
scale. A diverging value such as profit is a value with `HasZero` whose
palette centers on 0. So `HasMidpoint` has two uses, on an ordered key and on
an amount, and on an amount its default point would be the zero.

**Bounded and Positive are domains.** The project rule is that the domain
says which values exist and the traits say everything else. `Bounded[0, 1]`
and `Positive` say which values exist, so they are `Domain.continuous` with
bounds. The engine already computes `HasDomain` from the data, which licenses
nothing, as the draft says. A declared domain would license things, e.g.,
an axis that spans the full range.

**Log needs two facts, and the draft merges them.** A log scale needs every
value on the axis to be above 0, which is a domain fact. It also needs no
mark on the axis to draw a length from 0, which is a fact about the space
that a stack or a bar produces. A concentration has a meaningful zero
(`HasZero`) and still plots well on a log axis as dots. The draft's rule
"log rejects any channel that carries a meaningful zero" would reject that
chart. The rule should be:

- the field's domain lies above 0, and
- the space on that axis has no length pinned at 0.

**Key structure is the same traits on the key column.** A column can be a
key in one chart and a value in another, so keys need no second set of
traits. A ribbon or a line along a key needs `HasOrder` or `HasCycle` on it,
and a spread over a `HasCycle` key closes the loop in polar space. The
draft's lakes example needs a chain of neighbors, which is `HasOrder` when
the lakes form one chain. A graph of neighbors would be a new trait, e.g.,
`HasNeighbors`, and it can wait for an example that needs it.

**Units are not traits.** A unit is a name in an abelian group (units
multiply, divide, and cancel). `measure.ts` already treats units as types,
with a union-find over unknown units, in the style of F# units of measure but
gradual. Traits sit on a unit (`CanSum`, and later `HasZero`), and a unit is
a parameter of `HasUnit`. Unit arithmetic (USD / items) is not supported yet.
It would extend the unit name into a product of base units with integer
exponents, as in Kennedy's system.

**The frame is synthesized, not declared.** Whether a length is embedded in
data space (a bar from `spread` or `stack`) or attached to a mark (a dot from
`scatter`) is decided by the operators. The type walk already computes a
space's origin state (pinned, free or none) bottom up, and a coordinate
transform already reads its own `AxisTraits` to decide how to fit. A log
coordinate would declare what it needs from the space on its axis, and the
check would compare that with the computed facts. No user annotates a frame.

### The new traits: indexed by a key

The one new idea in the draft is that additivity is a fact about a pair: a
column and a key. Inventory adds up across warehouses and does not add up
across months. Both stock and units sold are counted in items, so this fact
cannot live on the unit. A unit-level `CanSum` would have to be true for
`sold` and false for `stock`, and today's rule says one unit cannot both add
up and not.

So the new traits go on the column, and each one names its key with `by`,
the one key word GoFish uses for grouping.

| Trait             | Record                             | Meaning                                                                            |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `CanSum`          | `{ by: string[] }`                 | the values add over disjoint groups of each key in `by`                            |
| `CanAverage`      | `{ by: string[], weight: string }` | the values combine over each key in `by` by a mean weighted by the column `weight` |
| `HasRunningTotal` | `{ by: string }`                   | the values are a running total over the ordered key `by`                           |

Keeping the name `CanSum` fits #1311, since the trait still gates sums. The
change is that it gains a `by`.

#### Three candidate spellings for the traits

**Spelling 1. One trait per kind, each keyed by `by`** (the table above).

```ts
{ CanSum: { by: ["warehouse"] }, HasRunningTotal: { by: "month" } }
```

This matches the existing record keyed by trait name, so it is one more key
on `ColumnType`. Coherence (one kind per column and key) is a check: the same
key may not appear in two traits of one column.

**Spelling 2. One trait whose record maps each key to its kind.**

```ts
{ HasAggregate: { warehouse: "sum", month: "runningTotal" } }
```

Coherence holds by construction, because a record cannot list one key twice.
This is the shape of `cell_methods` in the Climate and Forecast (CF)
conventions for netCDF data, which say how each value relates to the cells of
each dimension, e.g., `"time: sum area: mean"` ([CF conventions, section
7.3](https://cfconventions.org/cf-conventions/cf-conventions.html#cell-methods)).
The drawback is that one trait now holds three kinds of fact, and the weight
of an average has no clean place in the record.

**Spelling 3. Traits on the key instead of the column.**

```ts
// on the month column
{ HasCycle: {}, Accumulates: ["stock"] }
```

This puts the fact on the key, but a key does not own its columns, and a
derived column would have to edit the key's type. I do not recommend it.

Spelling 1 is the best fit. It is one more key on the existing record and
uses the existing `by`.

#### How a key-indexed trait resolves

The checker needs `CanSum(stock, warehouse)`, a trait of a pair. This is a
multi-parameter type class in Haskell ([Jones 2000, "Type Classes with
Functional Dependencies"](https://web.cecs.pdx.edu/~mpj/pubs/fundeps.html)),
or in Rust a trait with a type parameter, `impl SumOver<Warehouse> for Stock`.
Resolution has five parts.

**Lookup against the key context.** Each operator changes the key context.
Let `S` be the keys split so far and `R` the keys left inside each group.
When the table declares its key (say `warehouse × month × day`), `R` starts
as the whole key. Each `spread`, `stack` or `group` moves its `by` from `R` to
`S`. Two checks then look up instances:

- `stack({ by: k })` over field `f` looks up `CanSum(f, k)`.
- A mark channel over `f` aggregates the rows of one group, so it ranges over
  the keys in `R`. It looks up an instance for every key in `R`. When `R` is
  empty there is one row per mark and nothing is aggregated.

Without a declared table key, `R` is unknown, and the channel check falls back
to today's gradual rule (a sum passes). A `by` that is a function or a
`chunk(n)` names no column, so its key is unknown too.

**Defaulting.** A column with no additivity trait for key `k` has unknown
additivity over `k`, as an undeclared unit is unknown today. The sum check
passes and the channel sums, which is today's behavior. A unit-level
`Trait.summable()` is sugar for `CanSum` over every key, given to every
column in the unit. In Rust terms it is a blanket instance.

**Coherence.** There is at most one instance per (column, key). Two column
traits that name the same key are an error when the schema is applied. A
unit-level `Trait.summable()` and a column-level `HasRunningTotal` over the
same key also overlap, and that is an error too, as Rust rejects overlapping
implementations
([Rust reference, coherence](https://doc.rust-lang.org/reference/items/implementations.html#trait-implementation-coherence)).
So an account balance in USD cannot sit in a unit that declares
`Trait.summable()`, and the user moves the declaration to the columns. This
keeps "one unit cannot both add up and not", and it avoids a specialization
rule a user would have to model.

**Implications** (like a Lean class that extends another, or a Haskell
superclass):

- `CanSum` over `k` gives a mean over `k` with equal weights. The result is a
  rate per cell of `k`, e.g., sales per day, so its unit gains "per day".
- `HasRunningTotal` over `k` needs `HasOrder` or `HasCycle` on `k`, or a time
  key. This is a prerequisite, like `HasMidpoint` needing `HasOrder`.
- `CanSum` over `k1` and over `k2` gives `CanSum` over the pair `k1 × k2`. The
  same holds for `CanAverage` with one weight.
- Binning a key keeps the trait. `CanSum` over `date` gives `CanSum` over
  `field("date").bin(Calendar.month)`, because coarser cells are still
  disjoint. `HasRunningTotal` over `date` gives `HasRunningTotal` over the
  month bins, and the value of a bin is its last value.

**Derivation rules** for columns that a transform computes:

- `a / b`, where `a` and `b` both have `CanSum` over `k`, has unit
  `unit(a) / unit(b)` and `CanAverage { by: k, weight: b }`. Price per item is
  revenue over units, weighted by units.
- A running sum over an ordered key `k` of a column with `CanSum` over `k`
  has `HasRunningTotal { by: k }`, and it keeps `CanSum` over every other key
  the input summed over.
- The first difference over `k` of a column with `HasRunningTotal { by: k }`
  has `CanSum` over `k`.
- `.normalize()` within groups of key `j`, of a column with `CanSum` over
  `k`, gives a share in the domain `[0, 1]`. The share has `CanSum` over `k`
  (shares within a group add to 1) and `CanAverage { by: j, weight: total }`
  across groups, where the weight is each group's total. Today the share unit
  is `"<base> share by <by>"` and simply adds up, which is too generous across
  groups.
- `.count()` has `CanSum` over every key, `HasZero` and integer values.

#### Judgment forms

Notation: `Γ` maps each column to its type. `S; R` is the key context. `Φ`
is the set of facts about spaces that layout computes. `⇝` means "elaborates
to". A rule reads "if the facts above the line hold, the fact below it holds".

```text
Column facts (instance resolution, including implications):
  Γ ⊢ f : T

Operators change the key context and produce space facts:
  Γ; S; R ⊢ op ⇒ S'; R' ▷ Φ

A channel elaborates to a written-out field expression:
  Γ; S; R ⊢ ch: f ⇝ e

A coordinate transform checks the space facts:
  Φ ⊢ coord ok
```

```text
              k ∈ R
(Spread)  ──────────────────────────────────────────────────────────
          Γ; S; R ⊢ spread(k) ⇒ S ∪ {k}; R ∖ {k}
                    ▷ positions along dir, closed if Γ ⊢ k : HasCycle

          k ∈ R    Γ ⊢ f : CanSum[k]    Γ ⊢ f : HasZero
(Stack)   ──────────────────────────────────────────────────────────
          Γ; S; R ⊢ stack(k) over f ⇒ S ∪ {k}; R ∖ {k}
                    ▷ lengths from 0 along dir (from the midpoint if
                      Γ ⊢ k : HasMidpoint)

(One row)     R = ∅
          ──────────────────────────────
          Γ; S; R ⊢ h: f ⇝ h: field(f)

              Γ ⊢ f : CanSum[R]
(Sum)     ──────────────────────────────────────
          Γ; S; R ⊢ h: f ⇝ h: field(f).sum()

              Γ ⊢ f : CanAverage[R; w]
(Mean)    ──────────────────────────────────────────────────────
          Γ; S; R ⊢ h: f ⇝ h: field(f).mean({ weight: w })

              Γ ⊢ f : HasRunningTotal[k]    k ∈ R
(Stock)   ──────────────────────────────────────────────────────
          error: say how to combine f over k, e.g. field(f).last()

              Γ ⊢ f : HasZero
(Length)  ─────────────────────────────
          Γ; S; R ⊢ h: f  is a length

          dom(f) ⊆ (0, ∞)    Φ(axis) has no length pinned at 0
(Log)     ──────────────────────────────────────────────────
          Φ ⊢ log(axis) ok

          Γ ⊢ a : CanSum[k]    Γ ⊢ b : CanSum[k]
(Ratio)   ──────────────────────────────────────────────────
          Γ ⊢ a / b : unit(a)/unit(b), CanAverage[k; b]
```

The draft's three errors come out of these rules. Stacking `stock` by month
fails (Stack), because `stock` has `HasRunningTotal` over month and no
`CanSum` over month. Log after a stack fails (Log), because the stack pins
lengths at 0. A stack of price fails (Stack), because price has
`CanAverage`, not `CanSum`.

### Elaboration is instance resolution

In Haskell, the compiler passes the instance's dictionary to the code that
uses a type class ([Wadler and Blott 1989](https://dl.acm.org/doi/10.1145/75277.75283)).
Scala 3 calls instances `given` values
([Scala docs](https://docs.scala-lang.org/scala3/reference/contextual/givens.html)),
and Lean instances are ordinary values found by search
([Theorem Proving in Lean 4, type classes](https://lean-lang.org/theorem_proving_in_lean4/type_classes.html)).
In the same way, a GoFish trait instance can carry the code that the default
expands to. The project rule that every default desugars to code a user could
write then holds by construction, because the elaborated spec is the spec
with each instance's code written in.

| Trait found                    | What it supplies                  | Written out by hand                                 | Public spelling today                |
| ------------------------------ | --------------------------------- | --------------------------------------------------- | ------------------------------------ |
| `CanSum` over the rest key `R` | the channel's aggregate           | `h: field("sold").sum()`                            | exists                               |
| `CanAverage { weight: w }`     | the channel's aggregate           | `h: field("price").mean({ weight: "sold" })`        | needs `weight` on `.mean()`          |
| `HasRunningTotal` over `R`     | no default; an error asks for one | `h: field("stock").last()`                          | needs `.last()`                      |
| `HasMidpoint` on a stack key   | the stack's origin                | a stack option that names the origin                | internal (`StackOrigin`)             |
| `HasMidpoint` on a color field | a diverging palette               | `Color.gradient` with a middle stop at the midpoint | needs a midpoint option              |
| `HasCycle` on a spread key     | a closed spread in polar          | a spread option that closes the loop                | not built (#1052 TODO in `cells.ts`) |
| `HasZero` on a size field      | lengths from 0                    | nothing to write; it is a check                     | #1051                                |

Four of these need a public spelling before the rule holds. That is the
existing advice to make internal operands public (#1289) so an elaboration
can expand into code a user can write. A `chart.explain()` (or a dev-tools
view) that prints the elaborated spec would let a user see every default.

Whether a running total over the rest key gets a default (`.last()`, the
end-of-period value that Kimball's semi-additive facts use) or an error is a
decision. The error is the safer choice, because the valid aggregates (last,
min, max, time-average) answer different questions.

### Answer to question 1

Traits are needed. The draft's intersection types are trait conjunctions
written with bundle names. Rewritten as traits:

- `Nominal`, `Ordered`, `Affine`, `Ratio` and `Count` are named bundles. The
  project already treats named types such as `Price` as sugar over traits,
  like chart templates over operators.
- `Diverging` and `Cyclic` are existing traits, `HasMidpoint` and `HasCycle`.
- `Bounded` and `Positive` are domains.
- Units are the parameter of `HasUnit`, with unit algebra in `measure.ts`.
- The frame is a set of space facts that operators compute.
- Only additivity needs new traits, and they need a key: `CanSum { by }`,
  `CanAverage { by, weight }` and `HasRunningTotal { by }`, on the column.

The recommended trait list, new and existing, is:

- Value traits: `HasZero` (new, #1051), `HasOrder`, `HasMidpoint`,
  `HasCycle` (new on columns, #1052), `HasUnit` with `difference`.
- Domains: `Domain.discrete`, and `Domain.continuous` with bounds (new).
- Key-indexed column traits: `CanSum { by }` (moved from the unit to the
  column, with a key), `CanAverage { by, weight }` (new),
  `HasRunningTotal { by }` (new).
- Space facts, not traits: the origin state of a space, and embedded versus
  attached geometry.
- Coordinate axis traits: `HasZero` and `HasCycle` as today, plus what a log
  axis needs from its content.

## Part 2. Embedding

### Why the types must be run-time values

TypeScript erases its types before the code runs. GoFish needs the types at
run time for five reasons.

- **Elaboration reads them.** Choosing `.sum()` or a weighted mean, the
  stack's origin and the palette are run-time decisions. An erased type
  cannot pick a function. In Haskell this is why instances become dictionary
  values.
- **Error messages name the data.** The checker reports "stock is a running
  total over month" with the column's name and the key's name. The engine
  already throws errors like this from the run-time types (`checkSummable`,
  `strayLevelsError`).
- **Python sends the IR.** A Python user's chart reaches the engine as
  serialized IR, and the column types travel as the `ColumnType` record. No
  TypeScript compiler ever sees a Python chart. The Python port of `Unit`
  writes the same record (`gofish/ast.py`).
- **Some types depend on the data.** `HasDomain` is computed from the rows.
  Levels can come from the data. The set of species can differ per lake (a
  dependent key). Whether a `by` splits rows into disjoint, complete groups
  depends on the rows. A `chart(selectAll("bars"))` reads rows that another
  chart produced.
- **Units unify across the whole figure.** `measure.ts` runs a union-find
  over unit variables during the type walk, across every chart in a layer.
  This is inference over the whole render, after the TypeScript compile is
  over.

### Precedent for types as values

Several libraries define a type once as a value and get both a run-time check
and a static type from it.

- [Zod](https://zod.dev) builds a schema with calls (`z.object({ n: z.number() })`)
  and gives its static type with `z.infer<typeof schema>`.
  [Effect Schema](https://effect.website/docs/schema/introduction/),
  [ArkType](https://arktype.io), [TypeBox](https://github.com/sinclairzx81/typebox)
  and [io-ts](https://github.com/gcanti/io-ts) do the same. TypeBox's values
  are also JSON Schema, which is close to GoFish's case of a type that is
  also a wire record.
- [Polars data types](https://docs.pola.rs/user-guide/concepts/data-types-and-structures/)
  and [Apache Arrow schemas](https://arrow.apache.org/docs/format/Columnar.html)
  are run-time type values on columns. Arrow's extension types carry extra
  metadata on a field, which is one way a Python data frame could carry GoFish
  traits to the engine. GoFish already reads `HasInteger` from Arrow.
- [Pint](https://pint.readthedocs.io) and
  [astropy.units](https://docs.astropy.org/en/stable/units/) check units at run
  time and can print them.
- [F# units of measure](https://learn.microsoft.com/en-us/dotnet/fsharp/language-reference/units-of-measure)
  are the contrast. They are checked statically and erased, so a program
  cannot read or print a value's unit. Kennedy's theory ("Types for
  Units-of-Measure: Theory and Practice", 2010) is the basis of `measure.ts`.
  [mp-units](https://mpusz.github.io/mp-units/) (C++) and
  [uom](https://docs.rs/uom) (Rust) are also static. mp-units separates a
  `quantity_point` from a `quantity`, which is the affine split above.
- [Dex](https://github.com/google-research/dex-lang) types arrays by their
  index sets, so keys are types. Its types are static, but its index sets are
  values that a program can loop over.
- Lean's `deriving` and instance values, Haskell dictionaries and Scala
  givens show that an instance can be a value that code passes and reads.
- Singletons ([Eisenberg and Weirich 2012](https://dl.acm.org/doi/10.1145/2364506.2364522))
  pair a run-time value with a type that equals it. TypeScript's literal
  types with `const` type parameters give a cheap version: the string
  `"month"` is both a value and the type `"month"`.
- Two-level type theory and staged compilation
  ([Kovács 2022, "Staged compilation with two-level type theory"](https://dl.acm.org/doi/10.1145/3547641))
  separate what is known at compile time from what is known at run time.
  GoFish's case has the same two stages. Literal field names and declared
  traits are known when TypeScript compiles a spec. Domains, data-dependent
  keys and Python charts are known only when the chart renders. The run-time
  checker covers both stages, and the TypeScript mirror covers only the first.

### How GoFish declares types today

- `chart(data, { schema })` takes, per column, a `Unit`, a unit's name, or a
  column record `{ name, unit }` (`SchemaEntry` in `schema.ts`). Python
  writes `chart(data, schema={...})` with `Unit("USD", traits=[Trait.summable()])`.
- `field(name)` returns a `FieldExpr` for a column. A column's unit is
  declared in the schema, not on `field`. `datum(v)` wraps a data-driven
  value.
- The `Trait` family (`families/trait.ts`) has `ordered()`, `diverging()` and
  `summable()`. Its values never reach the wire. `Unit` turns each one into
  the trait record it declares.
- Time is a unit: `Unit.time({ zone })`, with `Unit.duration` as its
  difference unit.

There is no `Schema` namespace and no `.summable()` method in the current
code. Those were earlier spellings (the memory note on heuristics mentions
`Schema.unit("mm").quantity(...)`).

The TypeScript side tracks row types and little else. `chart(rows)` returns
`ChartBuilder<Row[], Row[]>`, and `.flow` has overloads that thread
`Operator<T, U>` types through up to seven operators
(`ast/marks/chartBuilder.ts`; the types are explained in
`apps/docs/docs/internals/frontend/pipeline-types.md`). But `by` is typed as
`SplitBy`, which accepts any string, and `stack` returns
`Operator<any[], any[]>`, so the row type is lost at the first stack. Channel
names such as `h: "count"` are not checked against the row type.

### Three candidate spellings

All three extend the column record in `schema`, because the new traits
belong to a column, not to a unit. All three use `by`.

**Spelling A. Key-indexed traits in the existing `Trait` family.** A trait
with `by` goes on the column record. Without `by` it means every key.

```js
const items = Unit("items");
const months = Unit({
  domain: Domain.discrete(MONTHS),
  traits: [Trait.cyclic()],
});

chart(rows, {
  key: ["warehouse", "month"],
  schema: {
    month: months,
    stock: {
      unit: items,
      traits: [
        Trait.summable({ by: "warehouse" }),
        Trait.cumulative({ by: "month" }),
      ],
    },
    sold: { unit: items, traits: [Trait.summable()] },
    price: {
      unit: "USD/items",
      traits: [Trait.weighted({ weight: "sold" })],
    },
    temp: Unit("°C", { difference: "Δ°C" }),
  },
});
```

```python
items = Unit("items")
months = Unit(domain=Domain.discrete(MONTHS), traits=[Trait.cyclic()])

chart(
    rows,
    key=["warehouse", "month"],
    schema={
        "month": months,
        "stock": {
            "unit": items,
            "traits": [
                Trait.summable(by="warehouse"),
                Trait.cumulative(by="month"),
            ],
        },
        "sold": {"unit": items, "traits": [Trait.summable()]},
        "price": {"unit": "USD/items", "traits": [Trait.weighted(weight="sold")]},
        "temp": Unit("°C", difference="Δ°C"),
    },
)
```

The builder words follow the existing rule that the word names what the user
gets: `summable` declares `CanSum`, `weighted` declares `CanAverage`, and
`cumulative` declares `HasRunningTotal`. `Trait.cyclic()` declares `HasCycle`.

**Spelling B. A per-key record on the column, in the style of CF
`cell_methods`.**

```js
chart(rows, {
  key: ["warehouse", "month"],
  schema: {
    stock: {
      unit: items,
      over: { warehouse: Over.sum(), month: Over.runningTotal() },
    },
    sold: { unit: items, over: { warehouse: Over.sum(), month: Over.sum() } },
    price: {
      unit: "USD/items",
      over: {
        warehouse: Over.mean({ weight: "sold" }),
        month: Over.mean({ weight: "sold" }),
      },
    },
  },
});
```

```python
chart(
    rows,
    key=["warehouse", "month"],
    schema={
        "stock": {
            "unit": items,
            "over": {"warehouse": Over.sum(), "month": Over.running_total()},
        },
    },
)
```

Coherence holds by construction. The cost is a new family (`Over`) whose
values are trait kinds, and repetition when a field behaves the same over
every key.

**Spelling C. A chained column builder, in the style of Zod.**

```js
chart(rows, {
  schema: {
    stock: Column.amount(items)
      .sums({ by: "warehouse" })
      .cumulative({ by: "month" }),
    price: Column.amount("USD/items").weighted({ weight: "sold" }),
  },
});
```

```python
chart(
    rows,
    schema={
        "stock": Column.amount(items).sums(by="warehouse").cumulative(by="month"),
    },
)
```

This reads well, but the project rule says a method chain is for a call that
reads the caller's state. These methods only collect independent facts, so
by that rule they should be a list of calls, which is spelling A.

**Recommended: spelling A.** It adds no new concept. It extends the `Trait`
family and the column record that exist, uses the one key word `by`, and
keeps the wire as one more key per trait on `ColumnType`. Python mirrors it
word for word with keyword arguments. The `key` chart option (the table's
key) is new, and it is optional. Without it, the rest key `R` is unknown and
channel aggregation stays gradual.

## Part 3. What TypeScript can check

All experiments are in `/Users/jmp/.claude/jobs/e051d870/tmp/ts-traits/`
(outside the repo). I type-checked them with the TypeScript version the repo
installs (5.9.3, which meets the package's `^5.7.2`):

```sh
node <pnpm store>/typescript@5.9.3/node_modules/typescript/bin/tsc \
  --noEmit --strict --target es2022 --moduleResolution bundler \
  --module esnext inventory.ts
```

The files are:

- `traits.ts`: the sketch library (a column type value with a phantom trait
  shadow, operators with literal keys, the checks).
- `inventory.ts`: the draft's example, with expected errors and the cases
  that must degrade.
- `spelling-b.ts`: the same check with options-object inference.
- `units.ts`: units as tags, and units with exponent arithmetic.
- `gen-stress.mjs` and `stress.ts`: a 40-column schema and 300 pipelines,
  for compile cost.

### One value, two types

A column type is a class that holds the wire record and declares a phantom
`__shadow` type. Each builder call returns a new value whose shadow records
one more trait.

```ts
export type Shadow = {
  unit: string;
  sum: string; // CanSum over these keys
  run: string; // HasRunningTotal over this key
  avg: string; // CanAverage over these keys
  weight: string; // the weight column of CanAverage
  zero: boolean; // HasZero
};

export class Column<T extends Shadow> {
  declare readonly __shadow: T; // phantom: never set, never read at run time
  constructor(readonly wire: Wire) {}

  sums<K extends string>(...by: K[]): Column<Set<T, "sum", K>> {
    return new Column({ ...this.wire, CanSum: { by } }) as any;
  }
  runs<K extends string>(by: K): Column<Set<T, "run", K>> {
    return new Column({ ...this.wire, HasRunningTotal: { by } }) as any;
  }
}
```

An undeclared column gets a shadow in which every key is allowed, so every
static check passes for it:

```ts
export type Unknown = {
  unit: string;
  sum: string;
  run: never;
  avg: string;
  weight: string;
  zero: boolean;
};
```

### Tracking the key context through `.flow`

The operators need `const` type parameters. Without them, TypeScript widens
`"month"` to `string` when the call is an argument to `.flow`, and every check
loses its key. That was the first bug in the experiment.

```ts
export const stack = <const K extends string, const D extends Dir>(o: {
  by: K;
  dir: D;
}): Op<"stack", K, D> => ({ kind: "stack", ...o });

flow<O extends AnyOp[]>(...ops: O): Chart<Row, S, [...Ops, ...O]> {
  return new Chart(this.rows, this.schema, [...this.ops, ...ops]);
}
```

### A check with a readable message

The check is a conditional type that is `unknown` when the spec is fine and
an object type holding the message when it is not. The mark's parameter is
the mark type intersected with the check, so a bad mark is not assignable,
and TypeScript prints the message.

```ts
export type TypeError<Msg extends string> = { readonly "type error": Msg };

type Unsummed<S, Ops extends AnyOp[], H extends string> = Exclude<
  StackKeys<Ops>,
  ShadowOf<S, H>["sum"]
>;

type StackMessage<S, H extends string, K extends string> =
  K extends ShadowOf<S, H>["run"]
    ? `${H} is a running total over ${K}: stacking over ${K} counts the same items once per ${K}. stack({ by: "${K}" }) needs ${H} to sum over ${K}.`
    : K extends ShadowOf<S, H>["avg"]
      ? `${H} averages over ${K} (weight ${ShadowOf<S, H>["weight"]}): a stack over ${K} would add it. Use ${H}.mean({ weight }) instead.`
      : `stack({ by: "${K}" }) needs ${H} to sum over ${K}, and its type does not say it does.`;

type CheckMark<S, Ops extends AnyOp[], H extends string> = [
  Unsummed<S, Ops, H>,
] extends [never]
  ? unknown
  : TypeError<StackMessage<S, H, Unsummed<S, Ops, H>>>;

mark<H extends Extract<keyof Row, string>>(
  m: Rect<H> & CheckMark<S, Ops, H>
): Marked<Ops> { ... }
```

The log check works the same way on a `.coord(...)` method at the end of the
chain. It treats every stack's `dir`, and y for a rect's `h`, as an axis with
lengths pinned at 0.

```ts
type CheckCoord<Ops extends AnyOp[], C> =
  C extends Coord<"log", infer D>
    ? D extends PinnedAxes<Ops>
      ? TypeError<`log("${D}") has no 0, but this chart draws lengths from 0 along ${D} (a stack or a bar). Use a dot or a line instead of a bar, or drop log.`>
      : unknown
    : unknown;
```

### The draft's example, checked

```ts
const schema = {
  stock: amount("items").sums("warehouse").runs("month"),
  sold: amount("items").sums("warehouse", "month"),
  price: amount("USD/items").averages({
    by: ["warehouse", "month"],
    weight: "sold",
  }),
  temp: point("degC"),
};
const inv = chart(rows, { schema });

// OK: stock adds across warehouses.
inv
  .flow(spread({ by: "month", dir: "x" }), stack({ by: "warehouse", dir: "y" }))
  .mark(rect({ h: "stock" }));

// ERROR: stack over month needs stock to sum over month.
inv
  .flow(spread({ by: "warehouse", dir: "x" }), stack({ by: "month", dir: "y" }))
  .mark(rect({ h: "stock" }));
```

The compiler's output for the four errors, as printed:

```text
inventory.ts(32,9): error TS2345: Argument of type 'Rect<"stock">' is not
assignable to parameter of type 'Rect<"stock"> & TypeError<"stock is a running
total over month: stacking over month counts the same items once per month.
stack({ by: \"month\" }) needs stock to sum over month.">'.

inventory.ts(37,9): error TS2345: Argument of type 'Rect<"price">' is not
assignable to parameter of type 'Rect<"price"> & TypeError<"price averages over
warehouse (weight sold): a stack over warehouse would add it. Use
price.mean({ weight }) instead.">'.

inventory.ts(43,10): error TS2345: Argument of type 'Coord<"log", "y">' is not
assignable to parameter of type 'Coord<"log", "y"> & TypeError<"log(\"y\") has
no 0, but this chart draws lengths from 0 along y (a stack or a bar). Use a dot
or a line instead of a bar, or drop log.">'.

inventory.ts(52,50): error TS2345: Argument of type 'Rect<"stokc">' is not
assignable to parameter of type 'Rect<keyof Row>'.
  Type '"stokc"' is not assignable to type 'keyof Row'. Did you mean '"stock"'?
```

The message is readable once a user learns to skip the "Argument of type"
frame and read the quoted text. The squiggle is on the mark, not on the
`stack`, because the field is only known at the mark. A check placed on the
stack would need the field on the stack, as the draft's open question
`stack(k, field)` suggests.

The options-object spelling (`amount("items", { sums: ["warehouse"], runs:
"month" })`) gives the same error, using `const` type parameters on the
options (`spelling-b.ts`).

### Degrading to the run-time check

These three cases type-check with no error, which is the required behavior:

```ts
// Untyped rows and no schema.
declare const loose: any[];
chart(loose)
  .flow(spread({ by: "warehouse", dir: "x" }), stack({ by: "month", dir: "y" }))
  .mark(rect({ h: "stock" }));

// A field name known only at run time.
declare const picked: string;
chart(rows as Record<string, unknown>[], { schema })
  .flow(stack({ by: "month", dir: "y" }))
  .mark(rect({ h: picked }));

// A column the schema does not mention.
chart(rows)
  .flow(stack({ by: "month", dir: "y" }))
  .mark(rect({ h: "temp" }));
```

The rule that makes this work is that an unknown column, or a key typed as
`string`, gets the `Unknown` shadow, and `Exclude<"month", string>` is
`never`, so the check passes. The run-time checker then catches what it can
when the chart renders. The static side never blocks a spec that the run-time
side would accept, as long as every check is written so that wide types pass.

### Units

Units as string tags with equality only are easy and readable:

```ts
declare function shareAxis<U extends string>(a: Q1<U>, b: Q1<NoInfer<U>>): void;

shareAxis(revenue1, units1);
// error TS2345: Argument of type 'Q1<"items">' is not assignable to
// parameter of type 'Q1<"USD">'. Type '"items"' is not assignable to type '"USD"'.
```

Unit arithmetic also works, within limits. A unit is a record from base unit
to integer exponent, e.g., `{ USD: 1; items: -1 }`. Exponents add through
tuple lengths, from a fixed table so there is no recursion, and a zero
exponent drops out. Object types have no key order, so the product needs no
sorting.

```ts
type Add<A extends number, B extends number> = A extends keyof Enc
  ? B extends keyof Enc
    ? [...Enc[A], ...Enc[B]] extends [0, 0, 0, 0, ...infer R]
      ? N[R["length"] & number]
      : never
    : never
  : never;

type Mul<A extends Unit, B extends Unit> = {
  [K in keyof A | keyof B as Add<Get<A, K>, Get<B, K>> extends 0
    ? never
    : K]: Add<Get<A, K>, Get<B, K>>;
};

const price = revenue.div(units); // Q<{ USD: 1; items: -1 }>
shareAxis2(price, listPrice); // OK
shareAxis2(price.mul(units), revenue); // OK: USD/items * items = USD
shareAxis2(price, revenue); // ERROR
```

The limits:

- Exponents are bounded (here −4 to 4). A first version that computed tuple
  lengths by recursion hit "Type instantiation is excessively deep and
  possibly infinite".
- The hover shows the unevaluated alias,
  `Q<Mul<Div<{ USD: 1; }, { items: 1; }>, { items: 1; }>>`, not
  `Q<{ USD: 1 }>`, so a user cannot read the unit from the editor.
- The error message cannot print a record unit as `USD/items` without more
  type-level string building.
- There are no unit variables beyond ordinary generics, so there is no
  figure-wide unification as `measure.ts` does.

### Compile-time cost

From `tsc --extendedDiagnostics`:

| File                                    | Instantiations | Check time |
| --------------------------------------- | -------------- | ---------- |
| an empty file                           | 4,762          | 0.30 s     |
| `inventory.ts`                          | 10,400         | 0.34 s     |
| `units.ts`                              | 6,582          | 0.30 s     |
| `stress.ts` (40 columns, 300 pipelines) | 18,847         | 0.36 s     |

The checks cost about 0.06 seconds for 300 pipelines. This is a toy library.
The real `ChartBuilder` types are heavier, and the cost of threading a key
context through them is unmeasured.

### What TypeScript cannot check

- Anything that depends on the data: domains, levels from the data, whether a
  split is a partition, dependent keys, the rows behind `selectAll`.
- Dynamic field names, a `by` that is a function, and `chunk(n)`.
- Python. Python's type checkers have `Literal` types, so they could check
  field names, but they have no conditional types or template literal types,
  so they cannot express the trait checks. Python users get only the run-time
  check, and they get the same messages, because the engine raises them.
- The results of `derive(fn)`. TypeScript infers the new row type but not the
  new traits, so a derived column needs a run-time derivation rule or a
  `derive(fn, { schema })` annotation.
- Figure-wide unit unification across charts in a layer.
- Elaboration itself. TypeScript can say a spec is wrong, but it cannot
  choose `.sum()` or a weighted mean.

### What it would cost in the real code

- Every operator would need `const` literal types for `by` and `dir`, and
  `stack` would need to return something better than `Operator<any[], any[]>`.
- Every mark factory would need its channel names typed against the row
  type, and every channel that reads a field would need the check, not only
  `h`.
- The coordinate is a chart option today (`chart(data, { coord })`), set
  before the flow, and the project rule keeps it at the chart boundary. A
  static log check would then compare the chart's options with the flow and
  marks inside it, which is harder than the method at the end of the chain
  used in the experiment.
- The mirror would have to be kept in step with the run-time rules. Generating
  both from one table, as the Python factories are generated from
  `packages/gofish-ir/src/frontend/descriptors.ts`, would keep the cost down.

## Recommendation

1. The run-time types in the DSL are the source of truth. Extend the
   `ColumnType` record with the key-indexed traits (`CanSum { by }`,
   `CanAverage { by, weight }`, `HasRunningTotal { by }`), declared with
   spelling A, and send them on the wire as today's traits are.
2. Move `CanSum` from the unit to the column with a `by`. Keep
   `Trait.summable()` on a unit as sugar for every column in the unit over
   every key, and reject overlaps between it and a column-level trait.
3. Make elaboration a lookup of instances that carry their code, and add the
   missing public spellings (`.mean({ weight })`, `.last()`, a public stack
   origin, a closing spread) so every default has a written form.
4. On the TypeScript side, do the cheap part first: type channel names and
   `by` against the row type, so a misspelled column is an editor error.
   Today that is not checked at all. Mirror the trait checks later, generated
   from the same definitions as the run-time rules.

Evidence that would change this recommendation:

- If the LLM authoring benchmark (#941) shows that agents fix trait errors
  faster when `tsc` reports them in the loop than when the render throws,
  the trait mirror moves up.
- If threading literal keys through the real `ChartBuilder` makes its types
  much slower or its errors much worse, the mirror stops at field names.
- If most users come from Python, as the 1.0 roadmap expects, the static
  mirror helps fewer people, and effort goes to the run-time messages.

## Open questions

- Should the table declare its key (`key: [...]`)? Without it, channel
  aggregation cannot be checked, only stacks.
- Does a running total over the rest key get a default (`.last()`) or an
  error?
- Is `HasMidpoint` one trait for both an ordered key and an amount, or two?
- Should `Trait.summable()` on a unit stay as sugar, or should additivity be
  declared only on columns?
- What is the right name for the builder words, e.g., `weighted` or
  `averaged` for `CanAverage`?
- Signed amounts (profit) stack downward from 0. Is that `HasZero` alone, or
  does it need the `HasSides` trait from the "space as traits" research?

## Sources in the repo

- `packages/gofish-graphics/src/ast/schema.ts`: column traits, `Unit`,
  `stackOrigin`.
- `packages/gofish-graphics/src/families/trait.ts`: the `Trait` family.
- `packages/gofish-graphics/src/ast/measure.ts`: unit unification and
  `checkSummable`.
- `packages/gofish-graphics/src/ast/coordinateTransforms/coord.tsx`:
  `AxisTraits`.
- `packages/gofish-graphics/src/ast/cells.ts`: the calendar `HasCycle`.
- `packages/gofish-graphics/src/ast/marks/chartBuilder.ts` and
  `chartBuilder.typetest.ts`: the builder's static types.
- `apps/docs/docs/internals/core/underlying-space.md`, sections "Measures:
  units are types" and "Column types: the chart schema".
- `apps/docs/docs/internals/design/api-design.md`, section "Data types".
- `apps/docs/docs/internals/frontend/pipeline-types.md`.
- Issues #984, #1051, #1052, #1142, #1195, #1311 (merged).
