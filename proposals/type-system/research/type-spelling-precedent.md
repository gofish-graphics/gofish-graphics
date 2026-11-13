# How to spell a column's type: precedent for one `traits` home or a chain

Research for the type system proposal (`proposals/type-system/proposal.md`, sections 1, 3 and 4). It answers one question. The proposal now has two `traits` fields, one on a unit and one on a column record. Should they be one, and does that point to a method chain?

It is a research note. Nothing in it is signed off.

## Terms

- A **unit** is a value made by `Unit(name?, { domain?, traits? })`. A unit is known by its name, so every column in `"items"` shares one unit across the whole figure (`measure.ts`, top comment).
- A **column record** is a schema entry such as `{ name, unit }`. Today it takes only those two keys (`ColumnRecord` in `schema.ts`). The proposal adds `traits`.
- A **value-shape fact** describes the values of one column alone: ordered, cyclic, diverging, has a zero.
- A **relational fact** names another column of the same table: `canSum({ over: "warehouse" })`, `canAverage({ weight: "sold" })`, `nested({ in: "region" })`, the table's `key`.
- A **refinement** is a fact added to a base type, such as "nullable" or "at least 0".
- The **wire** is the JSON that crosses from Python to the JS engine.

## The three candidates

```js
// A. one record per column; Unit is only the unit of measure
stock: { unit: Items, traits: [Trait.canSum({ over: "warehouse" })] },
month: { domain: Domain.discrete(MONTHS), traits: [Trait.ordered(), Trait.cyclic()] },

// B. everything on Unit, refined with a method
stock: Items.with(Trait.canSum({ over: "warehouse" })),
month: Unit({ domain: Domain.discrete(MONTHS), traits: [Trait.ordered(), Trait.cyclic()] }),

// C. chaining: each trait is a method that returns a refined type
stock: Items.canSum({ over: "warehouse" }),
month: Domain.discrete(MONTHS).ordered().cyclic(),
price: Unit.per(USD, Items).canAverage({ weight: "sold" }),
```

```python
# A
"stock": {"unit": Items, "traits": [Trait.can_sum(over="warehouse")]},
"month": {"domain": Domain.discrete(MONTHS), "traits": [Trait.ordered(), Trait.cyclic()]},

# B (`with` is a Python keyword, so the method needs another name)
"stock": Items.with_(Trait.can_sum(over="warehouse")),
"month": Unit(domain=Domain.discrete(MONTHS), traits=[Trait.ordered(), Trait.cyclic()]),

# C
"stock": Items.can_sum(over="warehouse"),
"month": Domain.discrete(MONTHS).ordered().cyclic(),
"price": Unit.per(USD, Items).can_average(weight="sold"),
```

## What GoFish ships today

Read from the repo, not recalled.

- `Unit("USD", { traits: [Trait.summable()] })` and `Unit({ domain: Domain.discrete(levels), traits: [Trait.ordered()] })` (`packages/gofish-graphics/src/ast/schema.ts`). A unit is frozen.
- `Trait` values are plain records, `{ kind: "ordered" }`. In Python, `trait.py` returns dicts, and its docstring says "A unit takes a set of traits, not one choice from them, and a `Trait` value never reaches the wire."
- Python `Domain.discrete(levels)` returns a plain dict.
- The wire form of a column is one flat record of traits: `{ HasQuantity, HasUnit, HasLevels, HasOrder, HasMidpoint }`. `traitsOf` in `schema.ts` turns every user spelling into it. Python sends that record.
- Unit traits meet by one rule: "every occurrence of one name is one unit", and two definitions of one name that disagree are a loud error (`meetUnitTraits`).

## The project's own rule

From `apps/docs/docs/internals/design/api-design.md`, "Calls, methods and options say how much the parts know about each other":

> A function call joins parts that are independent, or that pass very little between them: `chart(data)`, `field("x")`, `layer([a, b])`, and the operators handed to `.flow(spread(...), stack(...))`. A method chain is a universal interface that can read the caller's internal state, and even branch on it, or turn it into a new object: `.bin(...)` reads the field's type (a time column takes `Calendar`, a number takes `Bin`), `.format(fn)` sees fields that depend on the partition it is called on, `.sort()` uses the type's order, and `chart(...).flow(...).mark(...)` builds a spec step by step. An option is a local adjective of one thing, usually specific to its kind, such as `Calendar.month({ every: 3 })`, `Calendar.week({ start })` or `Bin.hex({ radius })`; a few, such as `w`, `h` and `fill`, apply almost everywhere.

And the next rule:

> A method that sets a field of the node (`.name`, `.zOrder`, `.hidden`) or reaches outward from it (`.label`, `.relate`) has no function twin (#1267).

On families:

> When an option's value is one of several named strategies, the family is a capitalized namespace such as `Overlap.separate` or `Curve.monotone` (#1013).

On data types: "A unit is a domain plus traits", the traits are "a list", and "`Domain` and `Trait` are families, but never reach the wire." The same page says the builder word for a `Has<Thing>` trait is an adjective, and the proposal keeps that for `ordered`, `cyclic` and `diverging`.

## Precedent

Each entry says how the base type is spelled, how refinements are attached, and where facts that name other columns live. "Fetched" means the sample was quoted from the documentation page named, on 2026-11-13. "Recalled" means I could not fetch it and wrote from memory.

### Zod (JS)

Fetched from zod.dev/api and zod.dev/metadata.

```ts
z.string().min(5);
z.number().positive();
z.literal("yoda").nullable();
const FishEnum = z.enum(["Salmon", "Tuna", "Trout"]);
const Dog = z.object({ name: z.string(), age: z.number().optional() });
// a fact about two fields lives on the object
.refine((data) => data.password === data.confirm, { error: "Passwords don't match" })
const A = z.string().meta({ description: "A cool string" });
```

- Refinements: chained methods. Each returns a new immutable schema.
- Relations between fields: on the object (`.refine` on `z.object`), never on a field. A field schema cannot name its sibling.
- Metadata: `.meta()` stores it in a registry (`z.globalRegistry`), not on the schema. The page says "Metadata is associated with a specific schema instance."
- Resembles C.

### Valibot (JS)

Fetched from valibot.dev/guides/pipelines and valibot.dev/guides/comparison.

```ts
const EmailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.email(),
  v.endsWith("@example.com")
);
```

- Refinements: a list of action functions passed to `v.pipe`. No methods.
- Why: the comparison page says Zod's "functions have several methods with additional functionalities" that bundlers cannot remove, and reports 17.7 kB for Zod against 1.37 kB for Valibot on one login form.
- Resembles A (a list of values), and is the direct argument against C on bundle size.

### Effect Schema (TS)

Fetched from effect.website/docs/schema/filters and /annotations.

```ts
Schema.Number.pipe(Schema.int());
Schema.Number.pipe(Schema.positive());
const MyString = Schema.String.annotations({ [DeprecatedId]: true });
```

- Refinements: functions applied with `.pipe(...)`, the same list idea as Valibot behind one method.
- Annotations: one `.annotations({...})` method that takes a record. That is B's `.with(...)`.
- Relations: a `Schema.filter` on the `Schema.Struct` compares `password` with `confirm_password`. On the struct, not the field.
- Resembles B.

### Pydantic (Python)

Fetched from pydantic.dev/docs/validation/latest/concepts/fields and /validators.

```python
positive: int = Field(gt=0)
int_list: list[Annotated[int, Field(gt=0)]]
name: Annotated[str, Field(strict=True), WithJsonSchema({'extra': 'data'})]

# a fact about two fields lives on the model
if self.password != self.password_repeat:
    raise ValueError('Passwords do not match')   # inside @model_validator(mode='after')
```

- Refinements: keyword options on `Field(...)`, or a list of annotation objects after the base type inside `Annotated[...]`.
- Relations: on the model, in a `model_validator`.
- Resembles A. `Annotated[base, a, b]` is a base type plus a list of facts, which is A's `{ unit, traits: [...] }` in Python's own type syntax.

### Pandera (Python, dataframes)

Fetched from pandera.readthedocs.io (dataframe_schemas, checks, and the `Column` reference).

```python
"column1": pa.Column(float, pa.Check(lambda x: x > 0), nullable=True)

schema = pa.DataFrameSchema({
    "small_values": pa.Column(float, pa.Check.less_than(100)),
    "one_to_three": pa.Column(int, pa.Check.isin([1, 2, 3])),
})

# joint uniqueness, on the schema
unique=["a", "c"],

# a check that compares columns, on the schema
schema = pa.DataFrameSchema(
    columns={"height_A": pa.Column(float), "height_B": pa.Column(float)},
    checks=pa.Check(lambda df: df["height_A"].mean() < df["height_B"].mean()),
)
```

`Column.__init__(dtype=None, checks=None, parsers=None, nullable=False, unique=False, ...)`, where `checks` is "Union[Check, list[Union[Check, Hypothesis]], None]".

- Refinements: a list of `Check` values in `checks`, plus keyword flags (`nullable`, `unique`).
- Relations: on the `DataFrameSchema`. `unique=[...]` is the table's key, and `checks=` holds checks that read several columns.
- The same word, `checks`, is used at both levels. The level decides what a check may read.
- Resembles A, and it is the closest precedent for a dataframe schema in Python.

### polars and pandas dtypes

Fetched from docs.pola.rs (the `Enum` reference and the categorical user guide) and pandas.pydata.org (`CategoricalDtype`).

```python
pl.Enum(["north", "south", "east", "west"])
bears = pl.Series(["Polar", "Panda", "Brown", "Brown", "Polar"], dtype=pl.Enum(["Polar", "Panda", "Brown"]))

t = pd.CategoricalDtype(categories=["b", "a"], ordered=True)
```

- polars: the order "is determined by the order in which you specify the categories." The type is the order; there is no flag. `Categorical` infers its categories and "cannot be ordered" the way `Enum` can.
- pandas: `ordered=True` is a keyword option on the type's constructor.
- Neither has relations between columns.
- Both resemble the constructor-option side of A (`Unit({ domain, traits })`). polars is the precedent for putting the order into the domain itself.

### R `factor` and the `units` package

Fetched from stat.ethz.ch (base `factor`) and r-quantities.github.io/units.

```r
factor(x = character(), levels, labels = levels, exclude = NA, ordered = is.ordered(x), nmax = NA)
z <- factor(LETTERS[3:1], ordered = TRUE)
a <- set_units(1:3, m/s)
units(x) <- "m/s"
```

- `ordered` is an argument of the constructor; `ordered(x)` is a wrapper that returns a factor of class "ordered".
- A unit is set on a vector with `set_units` or the replacement function `units<-`. It is attached to the values, not declared on a table.
- No relations between columns.
- Resembles A's constructor options; `ordered(x)` is a wrapper.

### Apache Arrow field metadata

Fetched from arrow.apache.org (`pyarrow.field` and the Columnar format page).

```python
field = pa.field('key', pa.int32(), metadata={"key": "Something important"})
```

> User-defined "extension" types can be defined setting certain `KeyValue` pairs in `custom_metadata`: `'ARROW:extension:name'` for the string name identifying the custom data type, `'ARROW:extension:metadata'` for a serialized representation of the `ExtensionType`.

The page's examples include "`trading-time` represented as `Timestamp` with serialized metadata indicating the market trading calendar."

- Signature: `pyarrow.field(name, type=None, nullable=None, metadata=None)`. Nullable is an option; everything else is a string map on the field.
- No relations between columns in the format.
- Resembles A, and it is the cleanest precedent for the wire: a field is a type plus a flat map of named facts, and new kinds are new names in the map.

### SQL DDL

Fetched from postgresql.org (`ddl-constraints` and `sql-createdomain`).

```sql
CREATE TABLE products (
    product_no integer,
    name text,
    price numeric CHECK (price > 0),
    discounted_price numeric CHECK (discounted_price > 0),
    CHECK (price > discounted_price)
);

CREATE TABLE example (a integer, b integer, c integer, UNIQUE (a, c));

CREATE TABLE t1 (
  a integer PRIMARY KEY, b integer, c integer,
  FOREIGN KEY (b, c) REFERENCES other_table (c1, c2)
);

CREATE DOMAIN us_postal_code AS TEXT
CHECK(VALUE ~ '^\\d{5}$' OR VALUE ~ '^\\d{5}-\\d{4}$');
```

> We say that the first two constraints are column constraints, whereas the third one is a table constraint because it is written separately from any one column definition. Column constraints can also be written as table constraints, while the reverse is not necessarily possible, since a column constraint is supposed to refer to only the column it is attached to.

> A foreign key can also constrain and reference a group of columns. As usual, it then needs to be written in table constraint form.

And for a domain: "`CHECK` expressions cannot contain subqueries nor refer to variables other than `VALUE`."

- SQL has three homes, and the split is by what a fact may read:
  - a **domain** (a named, reusable type) may read only its own value;
  - a **column constraint** is written on one column and should read only that column;
  - a **table constraint** may read several columns, and a fact about a group of columns must be written there.
- Every home uses one word, "constraint", and a list of them.
- This maps onto GoFish exactly. A unit is a domain: shared by name, unable to name a column. A column record is a column definition. `key` is a table constraint.
- Resembles A.

### dbt MetricFlow, LookML, Malloy

Fetched from docs.getdbt.com/docs/build/measures, docs.cloud.google.com/looker/docs/reference/param-measure-types, and docs.malloydata.dev (fields, aggregates). The dbt page says measures are now deprecated in favor of `type: simple` metrics, but the fields below still describe the semantic model.

```yaml
# dbt
entities:
  - name: user_id
    type: foreign
measures:
  - name: mrr
    expr: subscription_value
    agg: sum
    non_additive_dimension:
      name: subscription_date
      window_choice: max
```

```lookml
measure: total_shipping {
  type: sum_distinct
  sql_distinct_key: ${order_id} ;;
  sql: ${order_shipping} ;;
}
```

```malloy
measure: total_flight_time is sum(flight_time)
aircraft_models_avg_seats is aircraft.aircraft_models.seats.avg()
```

dbt's description: "Some measures cannot be aggregated over certain dimensions, like time, because it could result in incorrect outcomes. Examples include bank account balances..."

- These declare aggregation behavior per column, which is what `canSum` and `canAverage` do.
- The relational part of an aggregation fact lives **on the measure**, and it names the other column: dbt's `non_additive_dimension: { name: subscription_date }` is GoFish's snapshot `along: "month"`; LookML's `sql_distinct_key` is GoFish's `over` read as #1198's entity.
- The table's identity lives at the table: dbt's `entities` (with `type: primary`) sit beside the measures in the semantic model, not inside them.
- All are keyed records (YAML, LookML blocks). Malloy puts the grain in the expression at query time (`source.avg(...)`), not in a declaration.
- Resemble A. They are the best precedent for putting `canSum({ over })` on the column while `key` stays on the table.

### Tableau and Power BI

Fetched from help.tableau.com (calculations_aggregation) and learn.microsoft.com (TMSL Tables object).

- Tableau: "Right-click (control-click on Mac) a measure in the Data pane and select Default Properties > Aggregation." It is set per field in the UI.
- Power BI / Analysis Services column properties include `"summarizeBy": { "enum": ["default", "none", "sum", "min", "max", "count", "average", "distinctCount"] }`, `"isKey"`, `"isNullable"` and `"sortByColumn"`. Relationships between tables are separate `Relationship` objects.
- `sortByColumn` is a relational fact (this column sorts by that one) stored as a keyed property on the column.
- Resembles A: a flat keyed record per column. There is no way to say "sums over this key only"; it is one default per column.

### F# units of measure

Fetched from learn.microsoft.com/dotnet/fsharp.

```fsharp
[<Measure>] type cm
[<Measure>] type ml = cm^3
1.0<cm>
55.0<miles/hour>
let genericSumUnits ( x : float<'u>) (y: float<'u>) = x + y
```

- A unit is a named type declared once; derived units use `*`, `/` and powers. The page says units "are not persisted in the run-time environment", which is the main way GoFish differs (its units are run-time values).
- No refinements and no relations. It is the precedent for `Unit.per(USD, Items)` and for a unit being only a unit.

### Vega-Lite, Observable Plot, Flint

Vega-Lite fetched from the `bar.vl.json` example in the vega-lite repo. Plot fetched from `docs/features/scales.md` in the plot repo (the observablehq.com page returned HTTP 429). Flint is from `apps/docs/docs/internals/design/flint-chart-notes.md` in this repo, not fetched.

```json
"encoding": {
  "x": {"field": "a", "type": "nominal", "axis": {"labelAngle": 0}},
  "y": {"field": "b", "type": "quantitative"}
}
```

```js
Plot.plot({ x: { type: "log", domain: [1, 1e5], grid: true } });
```

```json
"semantic_types": { "quarter": "Quarter", "revenue": "Revenue" }
```

- Vega-Lite declares the type on each encoding, not on the data, so one field may be typed twice. The order of an ordinal comes from `sort`, also on the encoding.
- Plot has no field types at all. "A scale's type is most often inferred from associated marks' channel values."
- Flint maps each field to a named type in one table-level record, and units are a second per-field key (`{ semanticType: "Revenue", unit: "EUR" }`).
- None of them has facts that relate columns. Flint resembles A (a keyed record per field).

## Summary table

| System                 | Refinements                                                      | Facts about several columns                                 | Resembles |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| Zod                    | chained methods                                                  | on the object (`.refine`)                                   | C         |
| Valibot                | list in `v.pipe`                                                 | on the object                                               | A         |
| Effect Schema          | functions in `.pipe`, one `.annotations({})`                     | on the struct (`Schema.filter`)                             | B         |
| Pydantic               | `Field(...)` options, `Annotated[base, ...]` list                | on the model (`model_validator`)                            | A         |
| Pandera                | `checks` list plus flags                                         | on the schema (`unique=[...]`, `checks=`)                   | A         |
| polars, pandas         | constructor (`Enum(levels)`, `ordered=True`)                     | none                                                        | A         |
| R                      | constructor (`ordered = TRUE`), wrapper `ordered()`, `set_units` | none                                                        | A         |
| Arrow                  | `nullable` plus a metadata map                                   | none                                                        | A         |
| SQL                    | constraint list on the column, or a domain                       | table constraints (`UNIQUE (a, c)`, `FOREIGN KEY`)          | A         |
| dbt, LookML            | keys in a measure block                                          | aggregation relations on the measure; entities at the model | A         |
| Power BI, Tableau      | keyed column properties                                          | `sortByColumn` on the column; relationships separate        | A         |
| F#                     | none (units are types)                                           | none                                                        | none      |
| Vega-Lite, Plot, Flint | `type` per encoding; inferred; per-field record                  | none                                                        | A (Flint) |

Only Zod chains. Its sister libraries in the same niche moved away from chaining (Valibot, for bundle size) or kept one method that takes a record (Effect). The Python libraries, which matter for GoFish's audience, use options and lists, because Python's chaining style is unusual for declarations and `with` is a keyword.

## Assessment for GoFish

### Which candidates the precedents support

"A type is a value built up in both JS and Python" has three strong precedents.

1. **Pandera.** A dataframe schema in Python, built from values. Column facts are a `checks` list; table facts are on the schema. The same word is used at both levels.
2. **SQL with `CREATE DOMAIN`.** Three homes chosen by what a fact may read: domain (own value only), column, table. It is the clearest statement of the split, and its domain rule is the unit rule GoFish already has.
3. **dbt and LookML.** The only systems that declare aggregation behavior per column. They put the relational part of that fact (which dimension it does not add over, which key makes it distinct) on the measure, and put the table's identity beside it at the model level.

Zod is the precedent for C, and it is a strong library, but it is JS only, and its Python counterparts (Pydantic, Pandera) do not chain.

### What the project's rule says about C

Be straight about it: C bends the rule for value-shape facts, and its relational methods have no state to read.

- `ordered`, `cyclic` and `diverging` are adjectives. The rule says "An option is a local adjective of one thing", and `api-design.md` calls these builder words adjectives on purpose. By the rule they are options (an entry in a list or record), which is A.
- The rule allows a method that "can read the caller's internal state, and even branch on it, or turn it into a new object." A trait method on a domain reads a little state: `.ordered()` needs levels, and `.diverging()` defaults its midpoint to `n / 2`. That part could pass. But `Items.canSum({ over: "warehouse" })` reads nothing from `Items`. A unit does not know the table, so it cannot check that `warehouse` exists or is a key. The check happens when the schema is applied, which is where A puts the fact anyway.
- The "turn it into a new object" clause is wide enough that C can claim it. If it is used that way, every builder can be a method, and the rule stops separating methods from options.
- C deletes the `Trait` family. `api-design.md` names `Trait` as a family that "never reach[es] the wire", and the Python package binds `trait` as `Trait`. Those lines would change.

Existing GoFish chains:

- `field("x").bin(...)` is precedent **against** C. It is the rule's own example of a method that reads state (the field's type picks `Calendar` or `Bin`). A trait method that only stores its argument does not do that.
- `field("x").mean()` turns a field into a new object (an aggregate) that is used in a different place. It is an expression, not a declaration. It is weak precedent either way.
- `rect(...).name(...)`, `.hidden(...)` and `.zOrder(...)` are precedent **for** C. The rule allows "a method that sets a field of the node", and these store a value without reading anything. `.label` and `.relate` "reach outward", as `canSum({ over })` reaches toward another column. But these methods sit on marks, which are built once per spec. A unit is shared by name across the figure, so a method on it that reaches outward has nowhere to reach.

### The scope problem with B and C

This is a wall, not a matter of taste. A unit is shared by name. Today, two definitions of `"items"` that disagree are an error (`meetUnitTraits`). In the inventory table, `stock` and `sold` are both in items, and they add up over different keys. So:

- If `Items.canSum({ over: "warehouse" })` returned a `Unit`, it would be a second definition of `"items"` that disagrees with `sold`'s, and today's rule would reject it.
- So in B and C the method must return a different kind of value, a column type, while `Unit(...)` still returns a unit. One dot then yields two kinds.
- `Items.canSum()` with no `over` becomes ambiguous. It could mean "the unit items adds up, for every column in it" (today's `Unit("items", { traits: [Trait.summable()] })`) or "this one column adds up". The proposal keeps both meanings on purpose. B and C cannot tell them apart by spelling.

A has no such problem. The unit's traits are in `Unit(...)`, the column's are in the column record, and the place says the scope, as in SQL.

### One list, two homes, or the table

Other systems keep the split visible.

- SQL: column constraint versus table constraint, and a multi-column fact must be a table constraint. A domain cannot read other columns at all.
- Pandera: `Column(checks=...)` versus `DataFrameSchema(checks=..., unique=[...])`.
- Zod, Effect, Pydantic: a field schema cannot name a sibling; cross-field facts go on the object.
- dbt and LookML are the exception that matters here. An aggregation fact that names another column stays on the measure.

What this suggests for GoFish:

- **Keep the same word, `traits`, at both levels.** Pandera does this with `checks`, and SQL with "constraint". The level is the scope: a unit's traits hold for every column in the unit, and a column's traits hold for that column in this table. This answers the "two `traits` fields" worry. Two fields are fine when they mean one thing at two scopes; they are a problem only if a reader cannot tell which scope a trait has.
- **Make the domain rule explicit and checked.** A trait that names a column (`canSum({ over })`, `canAverage({ weight })`, `nested({ in })`) is an error on a unit, when the unit is made. That is SQL's "a domain may read only `VALUE`".
- **Keep `canSum` and `canAverage` on the column.** They are aggregation facts. dbt (`non_additive_dimension`) and LookML (`sql_distinct_key`) put these on the measure, and the proposal's error messages read better when the fact sits next to the column it is about.
- **Keep `key` on the table.** SQL `PRIMARY KEY`, Pandera `unique=[...]` and dbt `entities` all put identity there.
- **Watch `Trait.nested({ in })`.** It is a dependency between two key columns, a fact about the table's identity rather than about how one value aggregates. SQL and Pandera would put it at the table next to the key. It is deferred (choice 20), so this does not need deciding now.

### Serialization

All three candidates compile to the same wire. `traitsOf` already turns every spelling into one flat record per column, and the proposal only adds a keyed entry to it, for example `{ HasUnit: { unit: "items" }, CanSum: { over: ["warehouse"] } }`. That record is Arrow's model: a field plus a map of named facts. So C costs nothing on the wire.

C costs something in the two client libraries.

- In A, a trait is a function that returns a dict, in one module per language (`families/trait.ts`, `trait.py`). A column record is a plain dict in Python.
- In C, each trait becomes a method on every receiver: on `Unit`, on the new column type, and on whatever `Domain.discrete(...)` returns. Python's `Domain.discrete` returns a plain dict today, so it would have to become a class. That is about three methods per trait per language, each with its own docstring and error text, and the generated docs must cover them.
- B adds one method per receiver, and needs a Python name other than `with`.

### Extension

- **A.** A new trait is a new function in the `Trait` family, one entry in the wire record, and one line in each language. A list accepts any value, so user-defined traits would need no new syntax, only an open registry. This is how Pydantic (`Annotated` metadata), Pandera (custom `Check`) and Arrow (extension names) extend.
- **B.** The same as A. `.with(t)` takes any trait value.
- **C.** A new trait is a new method on every receiver, in both languages. A user-defined trait cannot be a method without patching the class, so C would need B's `.with(t)` as an escape hatch the moment traits open up. At that point C is B plus sugar, with two spellings for every built-in trait.

Is user extension wanted? I paged through all 1354 issues and PRs in `gofish-graphics/gofish-graphics`. No issue asks for user-defined traits. Two open issues point that way. #1279 (extensibility audit) lists `Trait` among the "closed unions" and has an open item, "Traits as open, named capability objects with operations (zero, add, cycle period, order)". #1101 designs one extension model for strategy families and notes that a Python-side extension needs data or a callback across the bridge. So it is planned in the audit, not requested by users. A keeps it open at no cost; C makes it harder.

## Recommendation: A, with one word at two scopes

Keep a column record that takes `unit`, `domain` and `traits`. A unit keeps its own `traits` for facts shared by every column in it. A trait that names another column is legal only on a column, and is an error on a unit. The table's `key` stays a chart option. A reusable type of levels such as `Month` becomes a plain record, so `Unit` is only the unit of measure.

```js
const Items = Unit("items");
const USD = Unit("USD", { traits: [Trait.canSum()] });
const Celsius = Unit("°C");
const Warehouse = { domain: Domain.discrete(["North", "South", "West"]) };
const Month = {
  domain: Domain.discrete(MONTHS),
  traits: [Trait.ordered(), Trait.cyclic()],
};

const inv = chart(rows, {
  key: ["warehouse", "month"],
  schema: {
    warehouse: Warehouse,
    month: Month,
    stock: { unit: Items, traits: [Trait.canSum({ over: "warehouse" })] },
    sold: { unit: Items, traits: [Trait.canSum()] },
    price: {
      unit: Unit.per(USD, Items),
      traits: [Trait.canAverage({ weight: "sold" })],
    },
    temp: { unit: Celsius },
  },
});
```

```python
Items = Unit("items")
USD = Unit("USD", traits=[Trait.can_sum()])
Celsius = Unit("°C")
Warehouse = {"domain": Domain.discrete(["North", "South", "West"])}
Month = {
    "domain": Domain.discrete(MONTHS),
    "traits": [Trait.ordered(), Trait.cyclic()],
}

inv = chart(
    rows,
    key=["warehouse", "month"],
    schema={
        "warehouse": Warehouse,
        "month": Month,
        "stock": {"unit": Items, "traits": [Trait.can_sum(over="warehouse")]},
        "sold": {"unit": Items, "traits": [Trait.can_sum()]},
        "price": {
            "unit": Unit.per(USD, Items),
            "traits": [Trait.can_average(weight="sold")],
        },
        "temp": {"unit": Celsius},
    },
)
```

Why:

- It follows the project's rule. Adjectives are entries in a list, and `Trait` stays a family.
- It has the strongest precedent for this exact shape: SQL (domain, column, table), Pandera (`checks` at two levels), dbt and LookML (aggregation relations on the measure, identity at the table).
- It avoids the scope wall. The place of a trait says whether it holds for a unit or a column.
- It reads the same in Python, with dicts and keyword arguments.
- It costs nothing new on the wire, and a list stays open for user traits.

What it changes from today: `ColumnRecord` gains `domain` and `traits`, and `Unit({ domain, traits })` with no name is replaced by a plain record. That replacement is the part of A that the maintainer has not seen argued yet. If it is unwanted, A still works with `Month = Unit({ domain, traits })` kept as is; the two-scope rule does not depend on it.

## Runner-up: A, with relational facts at the table beside `key`

This is SQL's table-constraint form. Column records hold only value-shape facts, and every fact that names another column moves next to the key.

```js
const inv = chart(rows, {
  key: ["warehouse", "month"],
  schema: {
    warehouse: Warehouse,
    month: Month,
    stock: Items,
    sold: Items,
    price: Unit.per(USD, Items),
    temp: Celsius,
  },
  traits: [
    Trait.canSum("stock", { over: "warehouse" }),
    Trait.canSum("sold"),
    Trait.canAverage("price", { weight: "sold" }),
  ],
});
```

```python
inv = chart(
    rows,
    key=["warehouse", "month"],
    schema={
        "warehouse": Warehouse,
        "month": Month,
        "stock": Items,
        "sold": Items,
        "price": Unit.per(USD, Items),
        "temp": Celsius,
    },
    traits=[
        Trait.can_sum("stock", over="warehouse"),
        Trait.can_sum("sold"),
        Trait.can_average("price", weight="sold"),
    ],
)
```

It makes the value-shape and relational split fully visible, and every schema entry becomes a shorthand again. It loses on the precedent that matters most here: the systems that declare aggregation behavior (dbt, LookML, Power BI) keep it on the column, and an error about `stock` is easier to trace to a line that starts with `stock`.

B and C rank below both. B blurs the unit and column scopes and needs a Python name other than `with`. C has the same scope problem, bends the call, chain and option rule for adjectives, multiplies methods across receivers and languages, and needs B's escape hatch once traits open.

## What would change the pick

- **Toward the runner-up:** if most relational facts turn out to be about the table's identity rather than about aggregation. `Trait.nested({ in })`, a declared foreign key for multi-table inputs, or "unique together" would all be table facts in SQL and Pandera. If two of them land, put relations beside `key`.
- **Toward C:** if the trait set is declared closed for 1.0 (no user traits, #1279's item dropped), schemas become common in gallery code so that reading length dominates, and the unit-versus-column scope is settled so that `Items.canSum()` has one meaning. Even then, C would be sugar over A's record, which is a second spelling the project usually avoids.
- **Toward B:** if units stop being shared by name, so that a refined unit is not a second definition. That would reverse `meetUnitTraits` and the "one unit cannot both add up and not" rule, which the proposal keeps.

## What was fetched and what was not

Fetched on 2026-11-13: Zod (api, metadata), Valibot (pipelines, comparison), Effect Schema (filters, annotations), Pydantic (fields, validators), Pandera (dataframe schemas, checks, `Column` reference), polars (`Enum` reference, categorical guide), pandas (`CategoricalDtype`), R (`factor`), R `units` (`set_units`), Arrow (`pyarrow.field`, Columnar format), PostgreSQL (constraints, `CREATE DOMAIN`), dbt (measures), LookML (measure types), Malloy (fields, aggregates), Tableau (aggregation), Analysis Services TMSL (Tables object, for Power BI's `summarizeBy`), F# (units of measure), Vega-Lite (the `bar.vl.json` example from GitHub), Observable Plot (`docs/features/scales.md` from GitHub).

Not fetched: the observablehq.com Plot page (HTTP 429; the same text was read from the repo source instead), the Microsoft Learn Power BI data types page (it does not mention summarization; TMSL was used instead), Malloy's `primary_key` (not on the pages fetched, so it is not cited). Flint comes from this repo's notes, not from Flint's own docs.
