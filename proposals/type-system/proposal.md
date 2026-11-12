# A type system for GoFish (version 2)

**Summary.** GoFish already has most of the type system that the "GoFish Goes to School" draft describes: units, traits on columns, traits on coord axes, and facts about spaces that layout computes. The draft's one new idea is that adding up is a fact about a column and a key together, and that idea fixes real charts that GoFish draws wrong today. This proposal writes the whole system in GoFish's own words, gives a typing rule for every operator, channel and coord, and answers the questions the draft deferred.

**Recommendation.** Keep types as run-time values in the existing `Unit`, `Trait` and `Domain` families. Add one keyed trait, `Trait.canSum({ over })`, on the column, plus a `weight` for averages and a declared table `key`. Derive everything else. Treat the draft's Nominal, Ratio, Extensive and so on as names for bundles, not as primitives. Keep `coord` at the chart boundary, and if it becomes a method, put it at the start of the chain. Mirror a small part of the checks in TypeScript later.

Status: design proposal, nothing implemented. Every spelling marked "new" is hypothetical until signed off.

Research behind each section is in [`research/`](research/):
[current-types](research/current-types.md),
[traits-and-embedding](research/traits-and-embedding.md),
[key-space](research/key-space.md),
[type-equality](research/type-equality.md),
[summarizability-partition](research/summarizability-partition.md),
[coord-method](research/coord-method.md).

## Terms

- **Trait.** A named fact about a type that says what can be done with its values. GoFish names them `Has<Thing>` or `Can<Verb>`: `HasOrder`, `HasZero`, `CanSum`.
- **Unit.** A unit of measure such as USD or items. Two amounts can share an axis or be added only when their units match.
- **Domain.** The set of values a column can take, such as a list of levels or the interval from 0 to 1.
- **Key.** A column, or a set of columns, that says which thing a row is about. In a table of inventory per warehouse per month, the key is (warehouse, month).
- **Key context.** The keys that the operators so far have split by, at a given point in a `.flow(...)`.
- **Rest key.** The key columns that are not yet split. A mark draws one group of rows, and those rows differ only in the rest key.
- **Fold.** Turning the several rows of one group into one value: sum, mean, last, and so on.
- **Extensive.** A value that adds up over a key, such as units sold over stores. In this proposal it is the trait `CanSum` over that key.
- **Intensive.** A value per unit of something, such as a price. It combines by a mean weighted by its denominator.
- **Snapshot.** A reading at a point along an ordered key, such as inventory at the end of a month. Adding snapshots along that key counts the same things again. The draft called this Cumulative, which sounds like it sums. A running total, such as year-to-date sales, is the special case that really is a prefix sum.
- **Summarizability.** The conditions under which a sum over groups is correct: the groups do not overlap, they cover everything, and the value is of a kind that adds.
- **Space fact.** Something layout computes about a space, not something a user declares. Examples: this axis has lengths that start at 0, or this mark is a glyph that a coord moves but does not bend.
- **Elaboration.** Filling in a default from the types, so that the result is a spec the user could have written by hand.
- **Gradual typing.** A column with no declaration passes every check. Declaring more catches more.

## Related issues

- #1199: tracker for the type system.
- #1198: stocks, flows and values per unit. It compares per-dimension tags with one entity key and recommends the entity key. This proposal joins the two.
- #1195: an axis is described by facts that name what layout must keep. It rejected Stevens's levels as primitives.
- #1142: a unit is one definition (domain plus traits). Unit algebra such as USD/item is still open there.
- #1051 and #1052: `HasZero` and `HasCycle` on data columns. Both open.
- #1326: stacking in a log coord is an error unless the user overrides. Proposed.
- #984 and #992: rebuild space kinds from traits, and the net amount of a signed stack.
- #48: binning and cells. `partition` requires a key that has a region.
- #1208: sums taken while a chart is built see only that chart's units.
- #1281: tag operators by the traits they keep.
- #999: column types through `derive`.
- #1120: strict mode.
- #941: the LLM authoring benchmark, which could measure whether type errors help agents.
- #1289: make internal operands public so that defaults can expand into user code.

Earlier design work this builds on: the space-traits research (artifact N6YYcKQM), the scale-transforms proposal (artifact TduMB8U1), the stacking design space (3uB2dfsd) and the Flint notes (`internals/design/flint-chart-notes.md`).

## 1. The motivating example in real GoFish syntax

The draft's example used a `table(...)` call, TypeScript-style types and a `.coord()` method. None of those exist. `table` is already the grid operator. Here is the same example in today's families plus the new parts.

```js
const Items = Unit("items");
const Month = Unit({
  domain: Domain.discrete(MONTHS),
  traits: [Trait.cyclic()], // new: HasCycle on a column (#1052)
});

const inv = chart(rows, {
  key: ["warehouse", "month"], // new: the table's key
  schema: {
    month: Month,
    // new: traits on a column, keyed with `over`
    stock: { unit: Items, traits: [Trait.canSum({ over: "warehouse" })] },
    sold: { unit: Items, traits: [Trait.canSum()] },
    price: {
      unit: "USD/items",
      traits: [Trait.canAverage({ weight: "sold" })],
    },
    temp: { unit: Celsius },
  },
});
```

```python
inv = chart(
    rows,
    key=["warehouse", "month"],
    schema={
        "month": Month,
        "stock": {"unit": Items, "traits": [Trait.can_sum(over="warehouse")]},
        "sold": {"unit": Items, "traits": [Trait.can_sum()]},
        "price": {"unit": "USD/items", "traits": [Trait.can_average(weight="sold")]},
        "temp": {"unit": Celsius},
    },
)
```

What the checker then says:

| Spec                                                                                               | Result                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spread({ by: "month" })`, `stack({ by: "warehouse" })`, `rect({ h: "stock" })`                    | Draws. Stock adds up over warehouses.                                                                                                                                                                                                                                                 |
| `spread({ by: "warehouse" })`, `stack({ by: "month" })`, `rect({ h: "stock" })`                    | Error: "`stock` is a snapshot along `month`. It adds up over `warehouse`, not over `month`. Stacking it by month would count the same items once per month. Use one month, or `field("stock").last()` or `.mean()`."                                                                  |
| `spread({ by: "month" })`, `rect({ h: "price" })`                                                  | Draws. The bar height elaborates to `field("price").mean({ weight: "sold" })`. Today an undeclared `price` is summed, and a `price` with a declared unit is an error that says to call `.mean()`, which is unweighted.                                                                |
| `stack({ by: "warehouse" })`, `rect({ h: "price" })`                                               | Error: "`price` is an average weighted by `sold`. It does not add up over `warehouse`."                                                                                                                                                                                               |
| `spread({ by: "month" })`, `stack({ by: "warehouse" })`, `rect({ h: "sold" })` in a log coord on y | Error: "a stack draws lengths from 0, and a log axis has no 0" (#1326).                                                                                                                                                                                                               |
| `spread({ by: "month", dir: "theta" })`, `rect({ h: "sold" })` in `Coord.clock()`                  | Draws. Month has `HasCycle`, so the spread closes the loop with the same gap between December and January as between other months (#1052).                                                                                                                                            |
| `rect({ h: "temp" })`                                                                              | Error: "`temp` is in °C, which has no zero, so a bar length means nothing. Subtract a reference, or use a position." (#1051) Today a declared °C is already an error, but for the wrong reason: the message says it has no `CanSum`, even with one row per bar. Undeclared, it draws. |

![What GoFish draws today: months on x, warehouses stacked, h = stock (correct)](img/inventory-by-warehouse.png)

![What GoFish draws today: warehouses on x, months stacked, h = stock (counts the same items once per month)](img/inventory-by-month.png)

![What GoFish draws today: h = price sums three prices per month (left); the weighted mean written by hand (right)](img/price-summed.png)

![What GoFish draws today: prices stacked by warehouse](img/price-stacked.png)

![What GoFish draws today: months around Coord.clock(), with a wider gap between December and January](img/months-clock.png)

![What GoFish draws today: bar lengths from 0 °C](img/temp-bars.png)

### Most specs on this small example are wrong

Take the four value columns, the two orders of `month` and `warehouse`, and the four ways to arrange two operators, all with `rect({ h })`. That is 32 specs. Every one of them renders today when the columns are undeclared. Under the rules in this proposal, 11 are valid.

| Value                            | spread, stack | stack, spread | spread, spread | stack, stack | Valid  |
| -------------------------------- | ------------- | ------------- | -------------- | ------------ | ------ |
| `sold` (sums over every key)     | 2             | 0             | 2              | 2            | 6 of 8 |
| `stock` (a snapshot along month) | 1             | 0             | 2              | 0            | 3 of 8 |
| `price` (an average)             | 0             | 0             | 2              | 0            | 2 of 8 |
| `temp` (no zero)                 | 0             | 0             | 0              | 0            | 0 of 8 |

- **Switching the fields** goes wrong whenever the value does not sum over both keys. For `stock`, exactly one order is valid.
- **Switching `spread` and `stack`** always goes wrong for a real stacked bar. A stack outside a spread adds the tallest bar of each group, which is the total of nothing. The only exceptions are one bar per group, or equal bars.

This is not special to GoFish. The errors are of two kinds, and a fixed grammar rules out only one.

|                     | Structural: a stack outside a spread | Data: the wrong field or key |
| ------------------- | ------------------------------------ | ---------------------------- |
| Specs out of the 32 | 8, all wrong                         | 24, of which 13 are wrong    |
| Vega-Lite           | cannot be written                    | can be written, and render   |
| GoFish today        | render                               | render                       |
| With these types    | error                                | error                        |

So of the 24 specs that Vega-Lite can roughly express, a little under half are valid, against about a third of GoFish's 32. Stacking month-end inventory over months, summing prices, stacking means, and drawing °C as bars from zero are all ordinary Vega-Lite specs. Its types (nominal, ordinal, quantitative, temporal) cannot tell them apart.

The same is true of programs in general: few syntactically valid programs type-check. The useful reading is the one Haskell, Rust and Lean users know. The type of the data constrains the valid specs so strongly that a chart could nearly be synthesized from it: enumerate the operator compositions, let the types prune them, then rank what is left. Mackinlay's APT split the problem the same way, into expressiveness and effectiveness, over a fixed list of chart kinds.

These counts were worked by hand from the rules, not run. The Vega-Lite column is from its documented behavior, not from running the specs, and "roughly express" covers some stretching for nested stacks.

## 2. What GoFish has today, next to the draft

The full table with file references is in [current-types](research/current-types.md). The short version:

| Draft                                                      | GoFish today                                                                                                                                  | Verdict                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Units (`USD`, `items`)                                     | `HasUnit`, declared with `Unit(...)`, unified across the figure, gradual                                                                      | Same                                                                                                                                                                 |
| Unit algebra (`USD / items`)                               | None (#1142 follow-up)                                                                                                                        | Draft has more                                                                                                                                                       |
| `Nominal`                                                  | `Domain.discrete(levels)` with no order                                                                                                       | Same                                                                                                                                                                 |
| `Ordered`                                                  | `HasOrder` from `Trait.ordered()`                                                                                                             | Same                                                                                                                                                                 |
| `Diverging(mid)`                                           | `HasMidpoint { at }` from `Trait.diverging(mid?)`, on an ordered key                                                                          | Same. The draft puts it on the value. GoFish puts it on the stack's key, which is right for Likert.                                                                  |
| `Cyclic(n)`                                                | `HasCycle` on coord axes and on calendar parts. Not on plain columns (#1052).                                                                 | Partly there                                                                                                                                                         |
| `Affine<u>`                                                | Only time: an instant minus an instant is a duration                                                                                          | Draft has more                                                                                                                                                       |
| `Ratio<u>`                                                 | `HasZero` exists on coord axes only (#1051 for columns)                                                                                       | Draft has more                                                                                                                                                       |
| `Bounded[lo, hi]`, `Positive`                              | Only a computed `HasDomain`. `Domain.continuous` is a TODO.                                                                                   | Draft has more. These are domains, not traits.                                                                                                                       |
| The ladder Nominal < Ordered < Affine < Ratio              | Facts that compose, with no ladder                                                                                                            | Conflicts with a decision on #1195: Stevens's names are allowed only as bundles                                                                                      |
| `Extensive<k>`                                             | `CanSum` on the unit, with no key                                                                                                             | Draft is finer, and this is the part worth taking                                                                                                                    |
| `Intensive<k, w>`                                          | No `CanSum`. `.mean()` is unweighted.                                                                                                         | Draft has more                                                                                                                                                       |
| `Cumulative<k>`                                            | Nothing. #1198 is the open design.                                                                                                            | Draft only                                                                                                                                                           |
| Key structure                                              | `HasOrder`, binned cells, the `HasRegion` flag that `partition` requires, calendar `HasCycle`                                                 | Mostly there                                                                                                                                                         |
| Embedded versus attached, decided by spread versus scatter | Decided by the operator and the units together: a size that its parent places at a datum, in a unit other than that axis's, is a glyph (#972) | GoFish is finer. The draft's rule is the common case. It is wrong for a bar in a scatter whose width is in the x axis's unit (a Gantt bar), which is still embedded. |
| (nothing)                                                  | Quantity apart from unit, time zones, origin state of a space (pinned, free, none), mirrored axes                                             | GoFish only                                                                                                                                                          |

![The Diverging Likert story: the midpoint lives on the response key](img/likert.png)

Which is better. Where the two differ in kind, GoFish's version is better, because it is made of small facts that compose and it matches decisions already taken. Where the draft has more, it is naming a real gap. The one place the draft changes the design is additivity per key.

Two memory notes turned out to be wrong and I corrected them: PR #1268 only renamed terms to "trait" and did not add `HasVector`, and `CanAdd` was renamed `CanSum` by #1311.

## 3. Are traits needed?

Yes. They looked buried in the draft because the draft names bundles of traits instead of the traits.

| Draft name            | Written as traits                                    |
| --------------------- | ---------------------------------------------------- |
| `Nominal`             | no `HasOrder`                                        |
| `Ordered`             | `HasOrder`                                           |
| `Affine<u>`           | `HasUnit` with a difference unit, and no `HasZero`   |
| `Ratio<u>`            | `HasUnit` plus `HasZero`                             |
| `Diverging(mid)`      | `HasMidpoint { at }`                                 |
| `Cyclic(n)`           | `HasCycle`                                           |
| `Bounded`, `Positive` | a domain: `Domain.continuous([lo, hi])`              |
| `Count<u>`            | `HasZero`, `CanSum` over every key, whole numbers    |
| `Extensive<k>`        | `CanSum { by: k }`                                   |
| `Intensive<k, w>`     | `CanAverage { weight: w }`                           |
| `Cumulative<k>`       | no `CanSum` over `k`, where `k` has `HasOrder`       |
| units                 | the parameter of `HasUnit`, not a trait              |
| coordinate frame      | space facts that operators compute, not a data trait |

So the trait list is short:

- **Value traits:** `HasZero` (#1051), `HasOrder`, `HasMidpoint`, `HasCycle` (#1052 for columns), and `HasUnit` with its difference unit.
- **Domains:** `Domain.discrete(levels)` and `Domain.continuous([lo, hi])` (new).
- **Keyed traits on a column:** `CanSum { by }` and `CanAverage { weight }` (both new in this form).
- **Key traits:** the same value traits on a key column, plus `HasRegion`.
- **Space facts:** computed, never declared.

Two corrections to the draft's rules fall out of writing them this way:

- **`HasZero` and summing are separate.** A price has a zero and does not add up across stores. So Ratio must not imply Extensive. Today `Trait.summable()` on a unit mixes the two.
- **Log needs two facts, not one.** The values must be above 0, which is a domain fact. And no mark on that axis may draw a length from 0, which is a space fact that a stack or a bar produces. A concentration has a meaningful zero and still plots well as dots on a log axis. The draft's rule would reject it.

Traits also carry elaboration. Each trait supplies the code its default expands to, so every default has a spelling the user could write (the "a default is sugar" rule in `api-design.md`):

| Trait found                                 | Default it supplies                | Written by hand                              | Public today?               |
| ------------------------------------------- | ---------------------------------- | -------------------------------------------- | --------------------------- |
| `CanSum` over the rest key                  | the fold of a size channel         | `h: field("sold").sum()`                     | yes                         |
| `CanAverage { weight }`                     | the fold                           | `h: field("price").mean({ weight: "sold" })` | needs `weight` on `.mean()` |
| no `CanSum` over an ordered rest key        | none: an error that offers choices | `h: field("stock").last()`                   | needs `.last()`             |
| `HasMidpoint` on a stack key                | the stack's origin                 | a stack option naming the origin             | internal only               |
| `HasMidpoint` or `HasZero` on a color field | a diverging palette centered there | a palette with a middle stop                 | needs a midpoint option     |
| `HasCycle` on a spread key                  | a closed spread in polar           | a spread option that closes the loop         | not built                   |

Four of these need a public spelling first. That is #1289.

## 4. Additivity: three ways to declare it

This is the main new API. The three kinds from the draft are the right way to explain it. The question is what the user writes.

### A. One trait per kind, each keyed (the draft)

```js
stock: {
  unit: Items,
  traits: [Trait.canSum({ over: "warehouse" }), Trait.snapshot({ along: "month" })],
},
price: { unit: "USD/items", traits: [Trait.canAverage({ weight: "sold" })] },
```

- The user states every kind for every key.
- The check is static: it reads the schema only.
- A key the user did not foresee, such as a later bin, has no tag.
- Precedent: `cell_methods` in the CF conventions for climate data (`time: point area: sum`), and Kimball's additive, semi-additive and non-additive facts.

### B. One entity key, checked on the rows (#1198's recommendation)

```js
stock: { unit: Items, entity: "warehouse" },
```

- The user states one fact: which thing the value belongs to.
- A sum is valid only when that key is unique among the rows being summed.
- It catches double counting along any key, including keys made later, and it catches values copied by a join.
- It cannot check data that is already aggregated and has no entity column.
- The check runs on the data, so it costs a pass over each summed group.
- Precedent: Lenz and Shoshani's disjointness read as a key constraint, Looker's symmetric aggregates, dbt MetricFlow's entities.

### C. One keyed trait, whose meaning is B and whose fast path is A (recommended)

`Trait.canSum({ over: "warehouse" })` and `entity: "warehouse"` say the same thing. Both name the keys the value may be summed across. So there is one declaration:

```js
stock: { unit: Items, traits: [Trait.canSum({ over: "warehouse" })] },
sold: { unit: Items, traits: [Trait.canSum()] }, // sums over every key
price: { unit: "USD/items", traits: [Trait.canAverage({ weight: "sold" })] },
```

- **Meaning.** A sum of `stock` over a set of rows is valid when no two of those rows share a `warehouse`. This is B's rule.
- **Static rule.** When the table's `key` is declared, the checker does not need the rows. `stack({ by: k })` needs `k` to be in the column's `over`. A channel fold needs every column of the rest key to be in `over`. This is A's rule, and it reports the error before any data is read.
- **Fallback.** When a key is unknown (no declared `key`, a `by` that is a function, anything after `derive`), the checker uses the row check.
- **The other kinds are derived, not declared.**
  - A key not in `over`, along which the value changes, is a snapshot. If that key has `HasOrder`, the error says so and offers `.last()` and `.mean()`. This is the draft's Cumulative.
  - A key not in `over`, along which the value is the same on every row, is a copy from a join. The error offers `.first()`. This is the fan trap, and the key-space research calls it Constant.
  - A bin of a key inherits the key's entry. `stock` does not add up over `month`, so it does not add up over quarters either.
- **Unit-level `Trait.canSum()`** (today's `Trait.summable()`) stays as "sums over every key" for every column in that unit. A unit that declares it cannot also hold a column with a narrower `over`. That is an error when the schema is applied, so "one unit cannot both add up and not" still holds.

Why C. It keeps #1198's single declaration and its coverage of unforeseen keys. It keeps the draft's static errors. It names the key with `over`, which reads as a sum over warehouses and has no group-by reading. And it adds no trait whose only job is to name a case: Cumulative and Constant come out of the check.

What C makes awkward. A user who wants the draft's derivations (a running sum of a flow is a running total, and the first difference of a running total is a flow) gets them only if a later example forces a declared `Trait.snapshot({ along })`. I would wait for that example. The waterfall chart is the likely one.

Runner-up: A, if Josh wants each kind visible in the schema. What would change my pick: a real chart that needs the snapshot declared to draw correctly, not only to explain an error.

### A key made of more than one field

`over` takes a list, and the rule is about the tuple: a sum over a set of rows is valid when no two of those rows agree on every column in `over`.

```js
// one row per (store, product, month)
key: ["store", "product", "month"],
schema: {
  on_hand: { unit: Items, traits: [Trait.canSum({ over: ["store", "product"] })] },
  floor_area: { unit: SquareMeter, traits: [Trait.canSum({ over: "store" })] },
  units_sold: { unit: Items, traits: [Trait.canSum()] },
}
```

- The static rule: a sum is valid when every key column that varies among the summed rows is in `over`.
- `stack({ by: "store" })` inside one month with `h: "on_hand"` draws. The rows vary in store and product, and both are in `over`.
- `stack({ by: "month" })` is an error. Month is not in `over`.
- `h: "floor_area"` in a bar per store is an error. The rows vary in product and month. The values are copies, so the message offers `.first()`.
- Listing two fields means each one adds on its own too, with the other fixed. So the list is a set of dimensions, not one indivisible composite. I could not construct a value that adds over a pair jointly but not over either member. That is an argument, not a proof.
- Nested keys are why the row check is the definition. With `over: ["county"]` and a stack by state, the static rule passes only if it knows that state is a function of county. Otherwise it checks the rows, and they pass.
- What it cannot say: a counted thing that is not a column, such as students in joint programs in a table that is already aggregated by department. That is #1198's open question 2, and it stays open.

### A rate: the unit says "per", the column says which weight

Neither the unit nor the column can hold both facts about an averaged value.

- The unit can say that the value is a rate. A quotient unit such as `USD/items` never sums, so once unit algebra lands, stacking a price is an error from the unit alone.
- The unit cannot name the weight. A unit is shared across columns and tables, and the weight is a column. Price per store is weighted by that store's units sold. A list price in the same unit has no weight. In the inventory table both `stock` and `sold` are in items, so the unit cannot pick one.
- Some weights have no quotient at all: mean temperature weighted by area, or a rating weighted by the number of reviews. And some rates cancel: an unemployment rate is persons over persons.
- Together they give a check that neither gives alone. The unit says "per items", so the weight must be a summable column in items. Naming `revenue` as the weight of a price is a type error.

```js
price: { unit: Unit.per(USD, Items), traits: [Trait.canAverage({ weight: "sold" })] },
```

A rate with no declared weight still cannot be stacked. A fold of it is an error that asks for the weight column or an explicit `.mean()`. A `derive` helper that computes `revenue / sold` supplies both the unit and the weight.

The trait is `canAverage` and not `weighted`, because `weighted` does not say what is weighted. `Trait.canAverage()` with no weight is a plain mean, which suits temperatures.

### Names

Two changes from the first version of this proposal, both from Josh's review on 11-12.

- **`over`, not `by`.** "Sum by warehouse" reads to a SQL or polars user as "group by warehouse, then sum", which is the invalid sum. "Can sum over warehouse" reads as a sum over warehouses. `line` and `ribbon` name their path tier with `along`, so `over` is free. Its only other use is an internal IR name.
- **`canSum` and `canAverage`, not `summable` and `weighted`.** `weighted` does not say what is weighted. `canAverage({ weight })` names the operation and what it needs, and with no weight it is a plain mean.

| Trait         | Builder                        | Kind of word                |
| ------------- | ------------------------------ | --------------------------- |
| `CanSum`      | `Trait.canSum({ over })`       | the operation               |
| `CanAverage`  | `Trait.canAverage({ weight })` | the operation               |
| `HasOrder`    | `Trait.ordered()`              | an adjective for the values |
| `HasCycle`    | `Trait.cyclic()`               | an adjective for the values |
| `HasMidpoint` | `Trait.diverging(mid?)`        | an adjective for the values |

The split follows the trait names. A `Can<Verb>` trait is an operation, and its builder is the trait's own name, so the word in an error message is the word the user wrote. A `Has<Thing>` trait describes the values, and its builder is the adjective, because `diverging` has no good `has` form. This replaces the rule in `api-design.md` that every builder word is an adjective, and it renames today's `Trait.summable()`.

**`canSum` with no `over`.** `Trait.canSum()` means the value sums over every key of its table, so any set of its rows may be added. This is a flow, such as units sold, where each row is its own event. When the table's `key` is declared, it is the same as listing every key column in `over`. Unit-level and column-level `Trait.canSum()` mean the same thing. The unit form applies it to every column in that unit.

| Declaration                           | Meaning                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Trait.canSum()`                      | sums over every key                                                                              |
| `Trait.canSum({ over: "warehouse" })` | sums over `warehouse` only                                                                       |
| `Trait.canSum({ over: [] })`          | sums over no key. This should be an error, since it only says "not summable" in a confusing way. |
| a declared unit with no `canSum`      | not summable, as today                                                                           |
| an undeclared column                  | unknown, so every check passes                                                                   |

"Every key" means every key of the table the column was declared in. If a join copies the column onto many rows, a sum along the new key is still wrong. The join rule catches that, not `canSum`: the joined column remembers its own key, and the error offers `.first()`.

Together these names are easier to hold than extensive, intensive and cumulative. Extensive and intensive stay as words for explaining, not as API. Cumulative is replaced by snapshot, because "cumulative" sounds like "it sums", and most such values (inventory, population, a balance) are readings at a moment, not running sums.

### Overlap check

- `Trait.canSum()` on a unit and `Trait.canSum({ over })` on a column: the first is the second with every key. Exact composition, one mechanism.
- `Trait.canAverage` and `.mean()`: the trait supplies the default fold, and `.mean({ weight })` is that fold written out. Exact composition.
- `entity` from #1198: the same fact as `over`. The `entity` name goes.

### Real charts this changes

- **Daily inventory snapshots binned by month.** `spread({ by: field("day").bin(Calendar.month) })`, `stack({ by: "warehouse" })`, `rect({ h: "stock" })`. Today GoFish sums about 30 daily snapshots per bar. With C, the rest key is `day`, which is not in `by`, so the mark is an error that offers `.last()`.
- **Melted quantiles.** The box plot story keeps five quantile columns in USD. Melt them into a `quantile` key and stack, and the chart type-checks today whenever USD is summable. With C, the melted value has no `by` that contains `quantile`.
- **Mosaic.** The story normalizes the share of `cylinders` within each `origin`. That share adds up over `cylinders` and is an average across `origin`. One unit-level flag cannot say that. A keyed trait can.
- **County rates rolled up to states.** A choropleth of unemployment by state from county rows needs the mean weighted by labor force. A plain mean or sum is wrong.
- **Lake area after a join.** `area_km2` repeats on every catch row. Summing it counts each lake once per species. The check finds the repeat and offers `.first()`.

![What GoFish draws today: daily snapshots summed per month (left); the last day of each month, by hand (right)](img/daily-snapshots.png)

![The Mosaic Chart story](img/mosaic.png)

## 5. Where the types live: the DSL, TypeScript, or both

The draft's syntax (`Count<items> & Cumulative<month>`) reads as TypeScript types. Three options:

|                                                                    | TypeScript types only                        | Run-time values in the DSL (recommended) | Both, from one definition (later) |
| ------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------- |
| Reasoning and elaboration                                          | No. Types are erased before the engine runs. | Yes                                      | Yes                               |
| Errors that name the data                                          | No                                           | Yes                                      | Yes                               |
| Python                                                             | No                                           | Yes, through the IR                      | Yes                               |
| Facts that depend on data (domains, dependent keys, the row check) | No                                           | Yes                                      | Run-time side only                |
| Errors in the editor before running                                | Yes                                          | No                                       | Yes, for a subset                 |

GoFish already does the middle column: `Unit`, `Trait` and `Domain` build values, and the wire carries the traits. So the DSL is the source of truth.

A TypeScript mirror is possible. One value can give both the wire record and a static type, the way Zod, Effect Schema and ArkType do. Experiments against the repo's TypeScript 5.9 (in [traits-and-embedding](research/traits-and-embedding.md), Part 3) showed:

- A stack over a key the field does not add up over is caught with a readable message.
- A stack of an averaged field is caught. Log after a stack is caught. A misspelled column gets a "did you mean" hint.
- The red underline lands on the mark, not on the stack, because the field is only known at the mark.
- Untyped rows, dynamic field names and undeclared columns compile with no error, so the static side never blocks a chart.
- Unit equality is easy. Unit arithmetic works for small exponents, but the editor shows an unreadable type.
- 300 checked pipelines added about 0.06 seconds to a compile. That was a toy builder, so the real cost is unmeasured.

Today `by` accepts any string and `stack` returns `Operator<any[], any[]>`, so TypeScript does not even check field names. The cheap first step is to check channel names and `by` against the row type. Mirror the trait checks later, generated from the same definitions, if the LLM benchmark (#941) shows that editor errors help.

## 6. Units

- Keep units as they are: gradual, unified across the figure, a clash between two declared units is an error.
- Add unit algebra (#1142): products, quotients and "per". `revenue / units` has unit `USD/items`.
- A quotient of two columns that both add up over a key is an average weighted by its denominator. So `derive` helpers that divide can supply `Trait.canAverage` without the user writing it.
- Points and differences: a unit with no zero has a difference unit, as time has duration. `20 °C + 20 °C` fails because a point plus a point is not defined, and `°C − °C` is in Δ°C. The same split serves geometry, where a position is a point and a size is a difference.
- Named types such as `Month`, `Temperature` and `Revenue` are aliases over these parts, like chart templates over operators. They come after the parts.

Open: whether unit conversion (°C to °F) and area-preserving maps belong here. The scale-transforms proposal already places the second with coords (`Coord.clock({ radius: "area" })`), and I would leave it there.

## 7. Keys

### Keys and values in graphical space

The draft asked how keys and values show up in the picture. The answer that held on ten chart types:

> The key always gives a mark its identity. On each axis, a mark's position comes from its key or from a value, and so does its size.

| Operator    | Position along its axis                 | Size along its axis           |
| ----------- | --------------------------------------- | ----------------------------- |
| `spread`    | key (a slot)                            | value, or the mark's own size |
| `table`     | key (row and column)                    | key (the cell)                |
| `partition` | key (its region)                        | key (its region)              |
| `scatter`   | value                                   | value, or the mark's own size |
| `stack`     | running sum of values over earlier keys | value                         |
| `treemap`   | the tiling, from values                 | value (area)                  |

`stack` is the only operator that turns a key into a position by adding values. That is why `stack` needs `CanSum` over its key and `spread` does not. It matches the rule that `stack` glues its children's spaces into one and `spread` keeps them apart.

### Key traits

A key column uses the same traits as any column. No second vocabulary is needed.

| Trait on the key                             | What it allows                                                                 | Status                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| none                                         | bars and points. No connectors.                                                | exists                                       |
| `HasOrder`                                   | sorted slots, a line or ribbon between neighbors, a stack origin at a midpoint | exists                                       |
| `HasCycle`                                   | a closed line, a closed polar spread                                           | exists for calendar parts, #1052 for columns |
| `HasRegion`                                  | `partition`                                                                    | exists as a TypeScript flag on binned fields |
| a continuous column as the key               | values between neighbors, so smooth curves and areas                           | follows from the column, no name needed      |
| a grid                                       | the product of two keys                                                        | no trait needed                              |
| `HasParent` (trees), `HasNeighbors` (graphs) | links to a parent, links along edges                                           | new names. Wait for an example.              |

Examples the key traits decide:

- **Ribbons between lakes.** `lake` has no order, so a ribbon between lake groups is an error unless the data says how the lakes connect. This is the question from the PyData talk.
- **Radar chart over unordered attributes.** The polygon's area depends on an order the attributes do not have. Error: "a closed line over `attribute` needs `HasCycle`".
- **Smooth curve over Likert levels.** A lint: the curve reads values between levels, and there are none.

![The Ribbon Chart story: ribbons between lakes, which have no order](img/lakes-ribbon.png)

### The key context

Each `by` adds a key to the context. The checker tracks two sets: the keys split so far, and the rest key. Additivity is looked up in two places:

1. `stack({ by: k })` and `treemap` add their children over `k`. They need `CanSum` over `k`.
2. A channel folds the rows of one group. It needs a fold that suits every column of the rest key.

Disjoint and complete, the first two summarizability conditions, cost almost nothing on `by`. A column has one value per row, so groups never overlap. Completeness fails only for a null key. Today a null becomes an unlabeled group in `by` and is dropped silently by a bin. Those should agree.

### Product keys and missing pairs

After `spread({ by: "lake" })` and `stack({ by: "species" })`, some species are missing from some lakes. For a ribbon between stacks, the value's type decides what a missing pair means:

- If the value adds up and has a zero, a missing pair is zero. The ribbon narrows to nothing.
- Otherwise a missing pair is unknown, and the ribbon shows a gap.

GoFish has no rule for this today.

### Multi-table inputs (smallest useful piece)

- A foreign key is a function from one table's key to another's.
- A join along a foreign key keeps the key context. Each joined column remembers the key of the table it came from.
- A join on a column that is not a key of the right table adds a key, the same way `by` does.
- A joined column summed along a key it does not depend on is the fan trap, caught by the check in section 4.

### Hannah's model, in type theory

Hannah Aizenman's papers ("Mind Your νs and Qs", GUGOG 2026, and the longer TopoInVis 2026 version) model a dataset as a bundle over a base space of keys, and a visualization as a structure-preserving map. Each piece has a type-theory reading:

| Her model                         | Type theory                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A section of the bundle           | A dependent function from keys to records                                                                                                         |
| The base space K and its topology | A key type with traits. On finite data a topology carries no more than a neighbor relation.                                                       |
| The sheaf conditions              | They hold for any function. They only become a check when a key has duplicate rows, which is a uniqueness check.                                  |
| Equivariance of an artist         | Parametricity: an operator that is generic in the key type, given some traits, commutes with every relabeling of the keys that keeps those traits |
| The map from graphic back to data | Every node knows its key, which GoFish already does                                                                                               |

That last row gives a statement worth keeping. Each trait fixes the relabelings that must not change the picture's meaning: any renaming for a plain key, order-keeping renamings for `HasOrder`, rotations for `HasCycle`, changes of unit for a unit. Kennedy proved the unit case this way in 1997. It is also a testing recipe: change the data in an allowed way and measure that the marks change to match.

I found no strong reason to prefer the categorical form. Sheaf gluing says something new only for covers that overlap, and GoFish has none. TypeScript does not enforce parametricity, so the statement becomes a rule for operator authors plus property tests.

## 8. Equality of types and of data shapes

The draft deferred "long versus wide and sparse versus dense should type the same". The recommendation is the smallest thing that works:

1. **One canonical form, which is a type and not a copy of the data.** Rows stay a list. The schema gains a declared `key`. The checker checks that the key is unique only where an operator relies on it.
2. **Equality is up to field order and key order only.** No search over isomorphisms and no e-graph. Nesting needs no rule, because `spread` then `stack` already turns a flat key into a nested one.
3. **Every other reshape is a named conversion that states what it needs:**
   - `unpivot` (wide to long) needs the melted columns to share one unit. The new key gets `Domain.discrete(columns)`.
   - `pivot` (long to wide) needs a unique key or an allowed fold.
   - Filling missing keys needs a value that adds up and has a zero, or an explicit fill. A rate has no honest fill.
   - Aggregating needs `CanSum`, or a weight.
4. **Grids, trees and positional indexes** stay in `derive` or polars.

Only `unpivot` has stories that need it now. The population pyramid, the heatmap, the Likert data and the ridgeline all reshape by hand before `chart`, so no check sees the reshape.

Declared shortcut: `unpivot` rejects columns with different units. The right fix is a value type that depends on the key, so that a spread over the new key passes and a stack fails. That needs new design.

Things that must not be equal: wide columns in different units, row order when the key has no order (today groups come out in first-appearance order when no levels are declared, so order is part of the input), a bag with several rows per key, and raw rows versus an aggregate.

## 9. Summarizability and partitioning

They connect, through the regions of a key. But the rule is not "a partition needs Extensive". There are two families of partition-shaped layout, and they need opposite things.

- **Value-sized pieces:** `stack`, `treemap`, `.normalize()`, pie, `cut`. The value sets each piece's size. This is plain summarizability: the groups split the parent, the size adds up over the key, and it is not negative when the whole is given. Then the whole's size is the parent's total.
- **Key-sized pieces:** `partition`, bins, calendar cells, map regions. The key sets each piece's size. A channel read as an amount should then be a value per unit of the cell: a count per unit width, or per km². This is Bertin's rule, and it is the classic choropleth mistake when broken.

Examples that decide it:

- **Histogram with unequal bins.** Bar area is the count. Bar height is the density. With equal bins the two agree, which is why the mistake hides.

  ![What GoFish draws today: unequal bins with bar height = count](img/histogram-unequal.png)

- **Choropleth.** Regions split the map, and color shows a value. An extensive value such as population colored by state mostly shows state size.
- **Monthly sales on true month widths.** It looks right and is slightly wrong, since months differ in length. So the key-sized rule should be a lint, not an error.
- **Venn and UpSet.** The groups overlap, so sizes do not add. The fix is to group by the exact combination of sets.
- **Top N before `.normalize()`.** Completeness is broken by `filter`. I would not add a "partial" type. A lint on `.normalize()` and on total labels is enough.

One correction to the draft. It says the cumulative case (a snapshot, in this proposal's words) is the disjointness condition. There are two disjointnesses. Groups of rows are disjoint for any `by` on a column. What fails for inventory over months is that the things each value counts overlap. That check belongs on the column and the key, and on every sum, not only on `stack`. Section 4's rule does this.

Recommendation: no shared trait now. Keep the word `partition` on the operator. The value-sized rule is section 4. The key-sized rule comes from units with "per" once #1142 lands.

## 10. Typing every operator, channel and coord

How to read the tables:

- **Needs** is what the construct requires. A failed need is an error unless it says lint.
- **Keys** is what it does to the key context.
- **Gives** is the space fact it produces.
- **Fills in** is the default it elaborates.
- **Now** says whether GoFish checks it today: yes, part, or no.

### Flow operators

| Operator                      | Needs                                                                               | Keys                                                                 | Gives                                                                                     | Fills in                                                                                     | Now                             |
| ----------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| `spread({ by, dir })`         | nothing of the value                                                                | adds `by`                                                            | one slot per key along `dir`. Children keep their own spaces. The axis is a list of keys. | slot order from `HasOrder`. Closes the loop if the key has `HasCycle` and the axis does too. | part                            |
| `stack({ by, dir })`          | the stacked size has `CanSum` over `by`, has `HasZero`, and its parts share a unit  | adds `by`                                                            | one continuous space along `dir` with lengths from a fixed origin                         | origin at the midpoint if `by` has `HasMidpoint`                                             | part (unit-level `CanSum` only) |
| `scatter({ by, x, y })`       | `x` and `y` are numbers or instants. A unit clash on a shared axis is an error.     | adds `by`                                                            | positions at data values. Marks are glyphs unless their sizes are in the axis unit.       | position fold: mean, weighted if the column has a weight                                     | part                            |
| `group({ by })`               | nothing                                                                             | adds `by`                                                            | a layer of children                                                                       |                                                                                              | yes                             |
| `table({ by: { x, y } })`     | nothing of the value                                                                | adds both keys                                                       | a grid. Both axes are lists of keys.                                                      | fills missing pairs with empty cells                                                         | yes                             |
| `treemap({ by, size, tile })` | `size` has `CanSum` over `by`, has `HasZero`, and is not negative                   | adds `by`                                                            | areas that add up to the parent's area. No axis.                                          |                                                                                              | part                            |
| `pack({ by })`                | the circle size has `HasZero` and is not negative                                   | adds `by`                                                            | circles with no axis. Areas compare and do not add up to the parent.                      |                                                                                              | no                              |
| `partition({ by })`           | `by` has `HasRegion`                                                                | adds `by`                                                            | each key's own region on a shared scale                                                   | lint: a size channel read as an amount inside a cell should be per unit of the cell          | part (`HasRegion` only)         |
| `enclose` (flow step)         | nothing                                                                             | none                                                                 | an outline around the children                                                            |                                                                                              | yes                             |
| `derive(fn)`                  | nothing                                                                             | unknown after it, unless the helper is typed                         |                                                                                           | checks after it use the row check                                                            | no (#999)                       |
| `filter(pred)`                | nothing                                                                             | same keys, fewer rows                                                |                                                                                           | lint on a later `.normalize()` or total label                                                | no                              |
| `join(right, { on })`         | `on` exists on both sides                                                           | same keys if `on` is a key of the right table. Otherwise adds a key. |                                                                                           | joined columns remember their own key                                                        | no                              |
| `resolve`                     | the name exists in scope                                                            | the key context of the named marks                                   |                                                                                           |                                                                                              | yes                             |
| `log`                         | nothing. It is a debug pass-through and should be renamed before a log coord ships. |                                                                      |                                                                                           |                                                                                              |                                 |

### Data helpers and field methods

| Construct                         | Needs                                                                     | Result type                                                                                                                | Now                                  |
| --------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `.sum()`                          | `CanSum` over the rest key                                                | same unit, `CanSum` over the keys split so far                                                                             | part                                 |
| `.mean()`                         | a unit, or a difference unit. With `{ weight }`, the weight has `CanSum`. | same unit, no `CanSum`                                                                                                     | no weight today                      |
| `.median()`, `.min()`, `.max()`   | `HasOrder`                                                                | same unit, no `CanSum`                                                                                                     | no                                   |
| `.last()`, `.first()` (new)       | `.last()` needs an ordered rest key                                       | same type                                                                                                                  | new                                  |
| `.count()`                        | nothing                                                                   | count unit, `CanSum` over every key, `HasZero`, whole numbers                                                              | yes                                  |
| `.distinct()`                     | nothing                                                                   | count unit, `HasZero`, and no `CanSum` across groups                                                                       | wrong today: the docs say it adds up |
| `.normalize()`                    | `CanSum` over the key it shares across, not negative                      | a share in [0, 1]. Adds up within its group. Across groups it is an average weighted by the group total.                   | part (adds up everywhere today)      |
| `.bin(Bin.*)`, `.bin(Calendar.*)` | a number or an instant                                                    | a key with `HasRegion` and `HasOrder`. Calendar parts also get `HasCycle`. It inherits additivity from the column it bins. | yes, except the last part            |
| `.sort()`, `.reverse()`           | `HasOrder`, or a field to sort by                                         | same key in a new order. A reordered key loses a midpoint that no longer splits it.                                        | part                                 |
| `.dropNulls()`                    | nothing                                                                   | same type with no nulls                                                                                                    | yes                                  |
| `repeat`                          | a count: whole numbers with `CanSum`                                      | one row per unit                                                                                                           | no                                   |
| `unpivot` (new)                   | the melted columns share one unit                                         | a new key over the column names                                                                                            | new                                  |

### Mark channels

| Channel                                    | On                                           | Needs                                                                                | Fold over the rest key                                                                     | Now                                 |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| size (`w`, `h`, `r`)                       | rect, ellipse, petal, polygon, image, circle | `HasZero`. A fold that suits the rest key.                                           | sum if `CanSum`. Weighted mean if there is a weight. Otherwise an error that offers folds. | part: always sums, unit-level check |
| area (`area`)                              | circle (rect and ribbon are proposed)        | same as size                                                                         | same, then the square root                                                                 | part                                |
| position (`x`, `y`, `cx`, `x2`, and so on) | every box mark                               | a number or an instant. `x` and `w` together need `w` in the difference unit of `x`. | mean, weighted if there is a weight                                                        | no check                            |
| color (`fill`, `stroke`)                   | every mark                                   | one value per group, or an explicit fold                                             | none: the value must agree across the group                                                | no check                            |
| raw (`text`, `href`)                       | text, image                                  | one value per group, or an explicit fold                                             | none                                                                                       | no check                            |
| `dims`                                     | rect                                         | each slot follows its own kind                                                       |                                                                                            | yes                                 |

The palette a color channel gets follows the type: categorical for no order, sequential for `HasOrder` or a number, diverging around the midpoint or the zero when the data spans it, cyclic for `HasCycle`.

### Relational marks and combinators

| Construct                                                         | Needs                                                                                | Gives                                                                                              | Fills in                                                                         | Now  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| `line` along a key                                                | the key has `HasOrder` or `HasCycle`. Lint: a smooth `Curve` needs a continuous key. | a path through the marks                                                                           | closes if `HasCycle` in a cyclic axis. Breaks at a missing key.                  | no   |
| `ribbon` along a key                                              | as `line`. If it fills down to a baseline, the value has `HasZero`.                  | a band                                                                                             | a missing pair is zero if the value has `CanSum` and `HasZero`. Otherwise a gap. | no   |
| `arrow`, `position`, `offset`                                     | the referenced marks exist                                                           | a glyph between placed marks. A coord does not bend it.                                            |                                                                                  | yes  |
| `layer([...])`                                                    | children that share an axis agree on its unit                                        | the union of the children's spaces. With `coord`, a new space that the parent places as one glyph. |                                                                                  | yes  |
| `enclose`                                                         | nothing                                                                              | an outline. Its size is not a data length.                                                         |                                                                                  | yes  |
| `union`, `intersect`, `subtract`, `exclude`, `atop`               | nothing of the data                                                                  | one region. Its sizes are no longer data lengths, so a parent stack cannot add them.               |                                                                                  | no   |
| `cut`                                                             | the weights have `CanSum`, `HasZero`, and are not negative                           | pieces whose sizes add up to the shape                                                             |                                                                                  | part |
| `ref`, `selectAll`                                                | the name is in scope                                                                 | the marks with their keys. A later `by` may use any key in their context.                          |                                                                                  | yes  |
| `text`, `image`, `blank`, `ellipse`, `petal`, `polygon`, `region` | the channel rules above                                                              | a box like a rect of the same size                                                                 |                                                                                  | part |

### Coords

A coord is checked against the space facts of what is inside it. For each axis it says which data operation becomes addition on screen (#1326), and what it does to lengths and to glyphs.

| Coord                                                | Axis traits                                                      | Needs from its content                                                                                                                                      | Lengths                                                  | Glyphs          | Fills in                                                                            | Now      |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- | -------- |
| linear (internal)                                    | none                                                             | nothing                                                                                                                                                     | kept                                                     | moved           | zero baseline for `HasZero`, midpoint for `HasMidpoint`                             | yes      |
| `Coord.polar()`, `Coord.clock()`                     | angle: `HasCycle`. Radius: `HasZero`.                            | Lint: a radius with no zero (dates) leaves an arbitrary hole. Lint: a filled mark whose radius shows an amount reads as area, so it wants `radius: "area"`. | bent into arcs and wedges                                | moved, not bent | a key with `HasCycle` on the angle closes the loop. Data 0 sits at the start angle. | part     |
| `Coord.wavy()`                                       | none                                                             | Lint: lengths are no longer comparable                                                                                                                      | bent                                                     | moved           |                                                                                     | yes      |
| `Coord.geo({ projection })`                          | longitude: `HasCycle`. Both axes in degrees.                     | Lint: a filled amount needs an equal-area projection                                                                                                        | not kept. Areas are kept only by equal-area projections. | moved           |                                                                                     | part     |
| `Coord.log` (proposed)                               | no zero. Screen addition is data multiplication.                 | The domain is above 0. No length is pinned at 0 on that axis. An additive `stack` is an error unless overridden (#1326).                                    | become ratios                                            | moved           | tick ladder                                                                         | proposed |
| `Coord.clock({ radius: "area" })` (proposed)         | radius: `HasZero`                                                | the radius value has `HasZero`                                                                                                                              | wedge area follows the value                             | moved           |                                                                                     | proposed |
| `Coord.envelope` (#1284, proposed)                   | one axis measures area                                           | the fill value has `HasZero`                                                                                                                                | follow the outline's area                                | moved           |                                                                                     | proposed |
| `Coord.along`, `Coord.spiral({ period })` (proposed) | one axis runs along a curve. Spiral: the period acts as a cycle. | Lint: a key laid along a spiral period should have `HasCycle` or a calendar part                                                                            | bent along the curve                                     | moved           | lines up equal phases                                                               | proposed |

Embedding, refined from the draft. It is a space fact computed from two inputs, as today (`foreignPlaced` and `isGlyph` in `_node.ts`): how the operator places the child, and whether the units match. A size is a glyph, moved by a coord and not bent, when its parent places it at a datum (a point or a cell, as `scatter` and `partition` do) and its unit differs from that axis's unit. A mark's own position in another unit counts the same way. Every other data size is a length of the space and is bent. So a bubble in a scatter is a glyph, a bar in a spread slot is a length, and a Gantt bar in a scatter, whose width is in the x axis's unit, is also a length. The draft's rule (spread embeds, scatter attaches) is the common case. The exception applies only inside a coord, and an explicit `emX` or `emY` forces embedding.

### The rules as judgments

`Γ` gives each column its type. `S` is the set of keys split so far and `R` is the rest key. `Φ` is the set of space facts. `⇝` means "elaborates to".

```text
              k ∈ R
(Spread)  ─────────────────────────────────────────────────────────
          Γ; S; R ⊢ spread(k) ⇒ S ∪ {k}; R ∖ {k}
                    ▷ slots along dir, closed if Γ ⊢ k : HasCycle

          k ∈ R    Γ ⊢ f : CanSum[k]    Γ ⊢ f : HasZero
(Stack)   ─────────────────────────────────────────────────────────
          Γ; S; R ⊢ stack(k) over f ⇒ S ∪ {k}; R ∖ {k}
                    ▷ lengths from the origin along dir

              R = ∅
(One row) ──────────────────────────────
          Γ; S; R ⊢ h: f ⇝ h: field(f)

              Γ ⊢ f : CanSum[R]
(Sum)     ──────────────────────────────────────
          Γ; S; R ⊢ h: f ⇝ h: field(f).sum()

              Γ ⊢ f : CanAverage[w]
(Mean)    ──────────────────────────────────────────────────────
          Γ; S; R ⊢ h: f ⇝ h: field(f).mean({ weight: w })

              Γ ⊢ a : CanSum[k]    Γ ⊢ b : CanSum[k]
(Ratio)   ──────────────────────────────────────────────────
          Γ ⊢ a / b : unit(a)/unit(b), CanAverage[b]

          dom(f) ⊆ (0, ∞)    Φ(axis) has no length pinned at 0
(Log)     ──────────────────────────────────────────────────
          Φ ⊢ log(axis) ok
```

The check runs in two directions. Types and the key context flow down the pipeline. Space facts flow back up from the marks, and the coord is checked against them. Then the solved traits fill in the defaults.

## 11. The `.coord()` method

Today a coord is one option on the two boundaries: `chart(data, { coord })` and `layer({ coord }, [...])`. The full study, with each option written on six stories in JS and Python, is in [coord-method](research/coord-method.md).

A fact that settles a lot: in GoFish, layout always runs in the space's own coordinates, and operators resolve `dir: "theta"` against the coord around them. So the position of a `.coord()` call in the chain can never change what the flow computes. A coord is a scope, not a last step.

| Option                           | Spelling                                               | For                                                                                                                                | Against                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Keep the option               | `chart(data, { coord: Coord.clock() })`                | One spelling on both boundaries. Sits beside `axes`, `padding`, `w`, `h`. No IR or Python change.                                  | Not a method.                                                                                                                                                                                                               |
| B. Method at the end (the draft) | `chart(data).flow(...).mark(...).coord(Coord.clock())` | Reads like ggplot2's `+ coord_polar()`.                                                                                            | Teaches "lay out, then view in polar", which is not what happens. A misplaced parenthesis changes the picture with no error: a pie per group becomes one whole-chart polar space, or a map overlay gets its own projection. |
| C. Method at the start           | `chart(data).coord(Coord.clock()).flow(...).mark(...)` | Same meaning as A. Reads as a scope. Names such as `theta` are declared before they are used. Python gets `.coord(y=Coord.log())`. | Two spellings, since `layer([...])` keeps the option. Frame settings split between the options and the method.                                                                                                              |
| D. Anywhere                      | either                                                 | Honest about order not mattering.                                                                                                  | Three spellings, and B's trap.                                                                                                                                                                                              |
| E. A wrapper                     | `Coord.clock(chart(...))`                              |                                                                                                                                    | `layer({ coord }, ...)` already says this.                                                                                                                                                                                  |

Layer rules that hold under any spelling:

1. One coord per boundary. It covers the flow, the mark, every `.layer()` tier and every child of `layer([...])`.
2. A boundary with no coord is in its parent's space.
3. A boundary with its own coord, inside another, is a separate space that the outer one places as a glyph. The two do not compose and neither overrides the other.
4. Sibling charts in different coords are separate boxes. Two sibling `geo` charts do not share a projection, so an overlay goes inside the map's boundary.
5. Combining transforms happens inside one coord value: per-axis warps, then one 2D map, as in `Coord.clock({ r: Coord.log() })`. A second `.coord()` call on one boundary is an error.

Why the start and not the end. The chain already reads from the outside in, not in the order things run. In `.flow(spread(...), stack(...)).mark(rect(...))` the spread contains the stack, which contains the rect, and the mark, written last, is the innermost thing. A coord is the outermost scope, so by the chain's own convention it comes first. It is true that the coord's map to the screen runs after layout. That is function application, `coord(layout(...))`, where the function applied last is written first. The coord also declares the names `r` and `theta` that the flow's `dir` uses, and a name should be declared before it is used. Josh's first guess was the end, and he reached the same conclusion from the code and from the names.

The type rule does not pick a position by itself. Axis names and traits flow down from the coord, and space facts flow up to it.

Recommendation: A, with C as the form to take if Josh wants the method. B is the one to avoid. I would move to C if axes and legends also become methods as part of the chrome work, so that the chain is the one place frame settings live.

One oddity found on the way: in a `.layer()` chain, the first chart's coord silently covers every later tier. That should be documented or made explicit. How a `selectAll` reference behaves across a coord boundary was not verified in the code.

## 12. Comparison with Flint

| Flint                                                       | Here                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Aggregation role per field (additive, intensive, and so on) | `CanSum { by }` and a weight, per column and key. Flint cannot say "adds over warehouses, not over months".                  |
| Zero baseline: meaningful, arbitrary, contextual, none      | `HasZero` is a data fact. Whether to show the zero is an operator choice.                                                    |
| Diverging: none, conditional, inherent                      | `HasMidpoint { at }`, which carries the point. "Conditional" becomes: the palette diverges when the data spans the midpoint. |
| Domain shape: open, bounded, fixed, cyclic                  | `Domain.continuous([lo, hi])` and `HasCycle`. Flint draws no working line between bounded and fixed.                         |
| A silent mean when a sum is invalid                         | An error that names the trait, per the "units are types" rule.                                                               |
| 44 named types                                              | Aliases over traits.                                                                                                         |

What Flint has that this does not yet: an identifier role (a key that must never be folded), and signed-additive (profit). Signed amounts already stack both ways from zero in GoFish (#773).

## 13. Recommendation, in order of work

1. **Column traits that are already open issues:** `HasZero` (#1051), `HasCycle` (#1052), `Domain.continuous`.
2. **`Trait.canSum({ over })` on the column, a declared `key`, and the row check** (this closes #1198). Public `.last()`, `.first()`, and `weight` on `.mean()`.
3. **`Trait.canAverage({ weight })`** and the schema-driven default fold.
4. **Key checks for connectors:** `line` and `ribbon` need `HasOrder` or `HasCycle`.
5. **Unit algebra** (#1142), then the key-sized lint.
6. **`unpivot`.**
7. **Field-name checks in TypeScript.**

Each step removes a wrong chart that renders today. Why this shape, against the principles in `api-design.md`:

- It desugars into the core. Every default expands to a fold or an option a user can write.
- One concept is one trait. `canSum` with `over` covers the unit flag, the entity key and the draft's Extensive.
- Meaning lives on the data type, and a mismatch is a loud error that names the trait.
- Few new terms: `Trait.canSum({ over })`, `Trait.canAverage({ weight })`, `Trait.cyclic`, `key`, `Domain.continuous`.
- A type is added only where a chart forces it. Snapshot, Constant, `HasNeighbors`, `HasParent` and cells all wait.
- The same shape in JS and Python, because the types are values on the wire.

## 14. Decisions for Josh

1. Is `Trait.canSum({ over })` the one declaration for additivity (approach C), or do you want each kind declared (approach A)?
2. Settled 11-12: the key word is `over`, not `by` or #1198's `entity`. Line and ribbon use `along`, so there is no clash.
3. Should a column that does not add up over an ordered key get a default fold (`.last()`), or an error that offers the choices? I recommend the error.
4. Settled 11-12: operations are spelled as the trait, `Trait.canSum` and `Trait.canAverage`. Open: do the value-structure words stay adjectives (`ordered`, `cyclic`, `diverging`), and should today's `Trait.summable()` be renamed to match?
5. Is `key` a chart option beside `schema`, or part of the schema?
6. Do plain numbers have `HasZero` by default, with units such as °C opting out through a difference unit?
7. Does `HasMidpoint` go on amounts too (profit around 0), as well as on ordered keys?
8. Are the key-sized checks (histogram density, choropleth of counts) lints and not errors?
9. `.coord()`: keep the option, or add the method at the start of the chain?
10. Should a null `by` value be an error, a visible "missing" group, or stay an unlabeled group? Bins drop nulls silently today.
11. Should declared levels keep empty groups, as cells do?
12. Is the TypeScript mirror worth starting with field names now?
13. Should `log`, the debug pass-through, be renamed before `Coord.log` exists?

Syntax to review: `Trait.canSum({ over })`, `Trait.canAverage({ weight })`, `Trait.cyclic()`, `key: [...]`, `traits` on a column record, `Domain.continuous([lo, hi])`, `.mean({ weight })`, `.last()`, `.first()`, `unpivot`.

## Gaps found on main (not filed)

- The schema docs list `.distinct()` among things that add up. Distinct counts do not add across groups.
- A bin drops rows with a null key silently, while `by` keeps them as a group.
- Daily snapshot data binned by month is summed.
- `.normalize()` shares add up across groups.
- In a `.layer()` chain the first chart's coord covers later tiers without saying so.
- A spread of months in `Coord.clock()` with default spacing and no `w` draws wedges at uneven angles that overlap.
- `field("day").bin(Calendar.month)` over half a year keeps all 12 months on the axis and overlaps the labels of the empty ones.
- A declared °C bar is rejected for having no `CanSum`, even with one row per bar. The reason should be the missing zero.
- `CLAUDE.md` lists a `keyContext` that is not in the source. Keys live on nodes.

Not verified: whether `treemap` drops negative sizes silently, and whether `cut` weights skip the `CanSum` check. The Lenz and Shoshani paper was read through #1198 and secondary sources, not in full.
