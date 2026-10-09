# Measures as types in the schema: design space

Scratch design doc for the question "can measures merge into the data schema work, in the style of F# units of measure?" Related: #955 (rank 1 failure), #994, #984, #528, #998, #256.

## 1. Short answer

Yes, it makes sense, and one part of it is plain cleanup that every option shares. A measure is already a type tag that rides the data array (`MEASURE_PROVENANCE`, `src/ast/data.ts:28`) right next to the column types (`COLUMN_TYPES`, `src/ast/schema.ts:197`). Moving it into the `ColumnType` record is #994. That gives one symbol, one copy path, one wire form for Python, and lets `Schema.time()` act as a unit declaration.

The F# analogy holds on one point and fails on two. It holds because a unit is a tag that is checked for equality and never changes the numbers. It fails because GoFish checks at run time, not compile time, and because GoFish never does unit arithmetic or conversion. So we need F#'s *inference* (unit variables), not F#'s *algebra* (`m/s^2`).

The real failures in #955 come from one confusion. Today a measure is two things at once: the **unit** that decides whether two columns may share an axis, and the **quantity name** that titles the axis (`"Production Budget"`, `"Beak Length (mm)"`). A bare column name is a fine title and a bad unit. The minimal fix is to treat a bare column name as an *unknown* unit (F#'s unit variable `'u`), which unifies with anything and stays a title. Only declared units (`Schema.unit(...)`, `.count()`, `.normalize()`, `Schema.time()`) can clash. That removes all 11 failures with no annotation.

The cost is real: the guard against putting a count and a measured length on one axis, and the guard against a price and a volume sharing an axis, both go quiet unless one side is declared. Section 4 lays out four ways to trade that off. Dimensions, conversion, derived units, and the point versus difference distinction should all wait. The last one belongs to #984's capabilities, not to the unit.

## 2. What a measure is today, and what a unit type would be

### Today

`Measure = string` (`src/ast/data.ts:12`). `resolveMeasure` (`src/ast/channels.ts:168-207`) picks, in order:

1. an explicit annotation, `field(name, m)`;
2. provenance on the array, which only `bin()` sets (`src/ast/transforms.ts:43-49`, it maps `start`/`end`/`size` to the source field and `count` to `"count"`);
3. the bare field name (`return provenance ?? fieldName`, `channels.ts:206`).

The comment at `channels.ts:154` already calls step 3 "a WEAK default binding, not a claim". The merge does not honor that. `mergeMeasures` (`src/ast/underlyingSpace.ts:442-452`) throws `MeasureClash` on any two distinct strings, whatever their source. Pipelines add declared measures: `.count()` and `.distinct()` give `"count"` (`src/ast/fieldExpr.ts:362-368`), `.normalize()` gives `"<base> share by <field>"` (`fieldExpr.ts:460-462`), and `mean`/`sum` report none, so the field name wins.

A measure drives five things: the clash check, axis titles (`src/ast/axes/elaborate.tsx:1222-1234`), the polar embedding gate (`src/ast/_node.ts:1083-1124`), one σ-scope per measure on an axis (a σ-scope is the region that shares one data-to-pixel slope; see the underlying-space essay), and the dual-axis plan (#528).

A separate tag, the calendar, was added by #1066 with its own merge, `mergeCalendars` (`underlyingSpace.ts:369-384`). It is called right beside `mergeMeasures` at every site: `src/ast/shapes/rect.tsx:117-122`, `src/ast/constraints/index.ts:328-337`, `src/ast/constraints/compose.ts:185-194`, and `src/ast/graphicalOperators/positionNode.tsx:41`. Ordinal axes use a third rule, `forgetOnConflict` (`underlyingSpace.ts:513-520`), because their "measure" is the grouping field's name.

### Terms

- A **dimension** is the kind of physical quantity: length, time, money.
- A **unit** is a scale for one dimension: metre, foot, USD, EUR. Two units of one dimension convert by a factor (or an offset, for °C and °F).
- A **quantity kind** (ISO 80000 term) is what is measured: "production budget", "worldwide gross". Two quantity kinds can share a unit.
- A **capability** is what the values support, in #984's sense: an order, a zero, an addition. A **torsor** is a set of points with no zero, where the difference of two points is a vector (instants and durations; °C readings and °C changes).

GoFish's measure today is used as a unit (for the clash check) and as a quantity kind (for the title). Those two roles want different merge rules. Two quantity kinds in one unit should share an axis. Their titles should list both names.

### F# and the other precedents

| System | Where the unit lives | Dimension vs unit | Points vs differences | Checked | Converts |
|---|---|---|---|---|---|
| F# units of measure | phantom type parameter, `float<m>` | units only; `m` and `ft` are unrelated unless you write a conversion | no; `degC` is treated as multiplicative, a known gap | compile time, erased at run time | never automatically |
| Haskell `dimensional` | dimension in the type (`Length`), unit is a value used to build and read | both | absolute °C needs special functions | compile time | yes, on read |
| Rust `uom` | dimension in the type, value stored in base units | both | separate quantities, `ThermodynamicTemperature` vs `TemperatureInterval` | compile time | yes |
| Python Pint | runtime `Quantity` carries a unit | both | offset units: `degC` vs `delta_degC`, `OffsetUnitCalculusError` | run time | yes, everywhere |
| pint-pandas | the column dtype, `pint[m]` | both | as Pint | run time, per column | yes |
| Frink | every number | both | special temperature functions | run time | everywhere |
| Lean mathlib | typeclass instances | n/a | `AddTorsor V P` | compile time | n/a |
| polars | dtype: `Datetime(unit, tz)` vs `Duration(unit)` | the "unit" is precision; tz is display | yes: `Datetime - Datetime = Duration` | run time, per column | tz conversion only |
| Arrow | field metadata or an extension type | whatever the producer writes | timestamp vs duration types | none built in | none |
| java.time | class: `Instant` vs `Duration` | n/a | yes: `Instant.plus(Duration)` | compile time | n/a |
| FLINT (`apps/docs/docs/internals/design/flint-chart-notes.md:99-103`) | per-field annotation `{ semanticType, unit }` | neither | no | lookup tables | no; units only pick formats and midpoints |

What carries over:

- **F#'s inference is the useful part.** An unannotated generic in F# gets a unit variable (`'u`). Unification binds variables to each other or to a concrete unit. Two concrete units that differ are an error. That is exactly the declared versus named rule, stated as type inference rather than as a priority list.
- **Static checking does not carry over.** GoFish schemas are run-time column metadata, so a clash is found when the chart is built, not when the code is typed. This is like Pint and pint-pandas, not F#. It is enough for us: the error fires at the first render, names the axis, and the user never sees a wrong picture. What we lose is the ability to type-check user JS inside `derive`, which F# could do and we cannot.
- **Every system that checks dimensions also converts units.** GoFish never converts. It only asks "may these two columns share one scale?" With no conversion, a dimension check adds nothing over an equality check on the unit. The one place conversion is real today is time zones: UTC and New York are two display units of one dimension, and `mergeCalendars` throws where it could convert.
- **The best precedents put points versus differences in the type, not the unit.** polars, java.time, and uom keep "°C" or "ms" as the unit and make instant versus duration a different type. Pint is the outlier: it makes `delta_degC` a different unit. For GoFish this is #984's capability record (`HasCalendar` already says "an instant has no zero", `schema.ts:57-61`).
- **pint-pandas and Arrow show where a unit goes in a table:** on the column's type. That is our `ColumnType`.

## 3. Design axes

### (a) Where the unit lives

1. **A key in `ColumnType`.** For example `{ HasUnit: { unit: "USD" } }`, declared with `Schema.unit("USD")`. Provenance from `bin()` writes the same key. This is #994. It is the pint-pandas choice.
2. **A separate per-column record.** What we have now, with a better name. It keeps two copy paths, which #998 shows going wrong (a scatter leaf with no `by` loses both, `createOperator.ts:1138`).
3. **Channel annotation only.** `field(name, m)` and nothing in the schema. It must be repeated at every use, and the user has no place to state a unit once.
4. **Schema and channel annotation, one lattice.** The schema states a column's unit once. `field(name, m)` is a local declaration that must agree with it (disagreement already throws, `channels.ts:191-201`).

Option 1 is common to every sketch below. Options 3 and 4 differ only in whether `field(name, m)` survives. Under orthogonality it should not: the schema fully subsumes it, since every channel that has a unit reads a named column. The one case it covers that the schema does not is a derive's new column, and `derive(fn, { schema })` (`src/ast/marks/chart.ts:153-169`) already covers that.

Naming is open. The record's keys are capability names (`HasOrder`, `HasCalendar`). A unit is a parameter, not a capability. `HasUnit` fits the pattern. A plain `unit` key is more honest.

### (b) Strength and one merge function

Strength does not need to be stored. A column with a `unit` key is declared. A column without one has an unknown unit, named by its column. So the record holds only declared units, and the merge decides what absence means.

The merge rules on offer:

| | declared A, declared A | declared A, declared B | named, declared A | named x, named y |
|---|---|---|---|---|
| Strict (today) | A | throw | throw (x ≠ A) | throw |
| Pairwise yield | A | throw | A | forget (no unit) |
| Unit variables | A | throw | bind x := A | bind x := y |

"Forget" and "bind" give the same axis. They differ in one place: with variables, a column bound to `USD` on one axis is `USD` everywhere in the chart, so meeting `count` elsewhere is a clash. With pairwise yield, each meeting is checked alone. Variables need a substitution carried through the chart; pairwise does not.

Calendar folds in. A time column's unit is "instant". Two instant columns share a unit, so the Gantt's `start`/`end` unify with no annotation. The zone is a display unit, like metres versus feet. Today two zones on one axis throw (`underlyingSpace.ts:376-381`). They could convert instead. That is a separate decision.

The ordinal `forgetOnConflict` rule does not fold in, and should not. An ordinal axis's "measure" is the grouping field's name. It is a title source, not a unit. Two grouping fields on one axis have no unit to clash. Under the split proposed here, the ordinal axis carries a title and no unit, and the special rule disappears.

So the one merge function is over a record `{ unit?, calendar?, titles }`. `unit` merges by the chosen rule, `calendar` by equal zone, and `titles` by set union. That replaces `mergeMeasures`, `mergeCalendars`, and `forgetOnConflict` at all six call sites.

### (c) Propagation

| Step | Traceable? | Unit of the output |
|---|---|---|
| `bin(f)` | yes | `start`, `end`, `size` take `f`'s unit (declared or variable); `count` is declared `count` |
| `.count()`, `.distinct()` | yes | declared `count` |
| `.sum()`, `.mean()` | yes | the source's unit |
| `.normalize()` | yes | declared `"<unit> share by <field>"` |
| a cumulative sum (waterfall) | only if it is a field op; today it is user JS | the source's unit |
| `derive(fn)` | no, `fn` is opaque JS (or a Python lambda) | see below |

For `derive`, the options are:

1. **Named by name.** Every new column is a fresh variable named by its column. Columns that keep their name and still fit keep their type, as `applySchema` already does for inherited types (`schema.ts:291-299`).
2. **Inherit by same name.** Already the behavior for column types. Nothing new.
3. **Explicit output schema.** `derive(fn, { schema: { lo: Schema.unit("USD") } })`. Already exists for column types (`chart.ts:153-169`). It would carry units for free once units live in `ColumnType`. This also deletes the derive IR's separate `provenance` field (`packages/gofish-ir/src/frontend/schema.ts:192-196`).

All three hold at once. Option 1 is the default. Option 3 is the override.

### (d) Dimension, conversion, and unit arithmetic

GoFish only checks equality. Nothing in the pipeline converts or multiplies units. The candidate uses are:

- **A secondary axis that converts** (ggplot2's `sec_axis(~ . * 9/5 + 32)`). This needs a declared conversion between two units of one dimension. It is a display feature, not a type check. It could be added later as a function on an axis, with no dimension system.
- **A derived unit**, like `bmi = weight / height^2`. The division happens in user JS, which GoFish cannot see. Arithmetic on units would only matter if GoFish had arithmetic field expressions. It does not. The user can declare `bmi: Schema.unit("kg/m²")` as an opaque string. Equality on that string is all an axis needs.
- **Share and count.** `normalize` already builds a derived unit by string (`fieldExpr.ts:460-462`). It is the only derived unit GoFish makes, and string naming works.

Recommendation: no dimensions, no conversion, no arithmetic. A unit is an opaque string compared for equality.

### (e) Points versus differences

The hard cases are °C readings versus °C changes, and instants versus durations. A unit type cannot tell them apart without Pint's "delta unit" trick. The capability record can: `HasCalendar` already marks instants as points with no zero. A future `HasZero` or torsor marker would mark readings versus changes.

What this decides is not "may they share an axis", which is a unit question, but "may this column be a bar length", "may it be stacked", "where is the baseline". Those are #984's questions. A Gantt bar placed by `x: start, w: dur` is fine because `dur` is a duration (a vector) acting on an instant (a point). A bar of height `temp_c` from zero is wrong because a reading has no zero. Neither is a unit clash.

Recommendation: keep it out of the unit. Note in #984 that a unit and a capability are two keys of one record, with no overlap.

### (f) The Python and IR bridge

The `ColumnType` record is already the wire form (`schema.ts:29-32`), and Python builds it (`packages/gofish-python/gofish/ast.py:2247-2279`). A unit key travels with no new channel. Python gets `Schema.unit("USD")` in the same class.

The derive IR's separate `provenance` field (`gofish-ir/src/frontend/schema.ts:192-196`, re-applied at `src/serialize/registry.ts:123`) becomes `schema` entries. That removes one field.

Later, the widget could read a pint-pandas dtype (`pint[USD]`) or an Arrow field's metadata and fill the unit key. That is deferred.

## 4. API sketches

All four sketches share the substrate from 3(a) option 1: a unit key in `ColumnType`, `Schema.unit(u)`, `bin` provenance written into it, `Schema.time()` implying the unit "instant", and `field(name, m)` removed. They differ in the merge rule and in how much the user writes.

The three running cases:

- **Box plot.** Quartiles and whiskers computed in user JS. `lo`, `q1`, `q3`, `hi` should all read as "Production Budget".
- **Gantt.** `start` and `end` with `Schema.time()`, from `stories/forwardsyntax/Time.stories.tsx:211-238`, which today needs `field("start", "date")`.
- **Marginal histogram and its guard.** `stories/seaborn/MarginalHistogram.stories.tsx` works today and must keep working. The guard case is a histogram and a strip of raw flipper lengths drawn on one `y` axis by mistake. Today that throws `count` versus `Flipper Length (mm)`.

### Sketch 1: Strict, units move into the schema

Names stay claims. The only change is where the declaration goes.

```js
// Box plot: every computed column must be declared.
chart(movies)
  .flow(
    derive(quartilesByGenre, {
      schema: {
        lo: Schema.unit("USD"), q1: Schema.unit("USD"),
        q3: Schema.unit("USD"), hi: Schema.unit("USD"),
      },
    }),
    spread({ by: "genre", dir: "x" })
  )
  .mark(layer([
    rect({ w: 1, yMin: "lo", yMax: "hi" }),
    rect({ w: 20, yMin: "q1", yMax: "q3" }),
  ]));

// Gantt: Schema.time() implies the unit, so no field(..., "date").
chart(revenue, { schema: { start: Schema.time(), end: Schema.time() } })
  .flow(scatter({ by: "start", xMin: "start", xMax: "end" }))
  .mark(rect({ h: "amount" }));

// Guard: count (declared) vs "Flipper Length (mm)" (a name, a claim) → throws.
```

The axis title is "USD", which is worse than "Production Budget". To fix that, a title must be stated in `axes`.

### Sketch 2: Pairwise yield

Named yields to declared. Two names forget the unit and keep both names as titles.

```js
// Box plot: no annotation. lo/q1/q3/hi are four names → no unit, one scale.
chart(movies)
  .flow(derive(quartilesByGenre), spread({ by: "genre", dir: "x" }))
  .mark(layer([
    rect({ w: 1, yMin: "lo", yMax: "hi" }),
    rect({ w: 20, yMin: "q1", yMax: "q3" }),
  ]));
// Title: "lo, hi, q1, q3" unless axes.y.title is set.

// Gantt: as Sketch 1. Without Schema.time() it would also work (two names).

// Guard: "Flipper Length (mm)" yields to count → renders silently on a count axis.
```

### Sketch 3: Unit variables (F#-style inference)

Each named column is one unit variable for the whole chart. Unification carries a substitution. The single-axis results match Sketch 2. The difference shows when a column appears twice.

```js
// Box plot: the code is Sketch 2's. Add one declaration on the input, and
// overlay the raw points on the same y axis:
chart(movies, { schema: { "Production Budget": Schema.unit("USD") } });
// The strip at y: "Production Budget" (USD) meets lo/q1/q3/hi on y, so all
// four variables bind to USD. The title lists "Production Budget".

// Gantt: as Sketch 1.

// Guard: flipper binds to count. Silent, unless flipper also meets a
// declared "mm" somewhere else in the chart, which is then a clash.
```

### Sketch 4: Input columns are claims, derived columns are variables

A column of the chart's input data is named by the user's own data, so its name stands as a declared unit. A column a `derive` creates is a variable. This keeps the two guards and fixes the computed-column cases.

```js
// Box plot: lo/q1/q3/hi are derive outputs → variables → unify. No annotation.

// Gantt: start/end are input columns → claims → would clash,
// but Schema.time() declares both as "instant" → unify.

// Guard: both are claims (count declared; flipper an input name) → throws.

// Bullet chart "good" vs "average", both input columns → throws.
// Fix: schema: { good: Schema.unit("score"), average: Schema.unit("score") }.
```

### Which feel strongest

Sketches 2 and 3 fix every reported failure with no user code, and they match the stated rule that a field name is a weak default. Sketch 3 is the principled form of Sketch 2: it is plain unification. But it needs a chart-wide substitution, and its extra catches are rare. Sketch 4 keeps the most guards. But "where did this column come from" is a new distinction, and it fails the bullet-chart case. Sketch 1 is the #994 refactor alone, and it does not fix #955.

## 5. Hard examples

"OK" means it renders as intended. "Error" means `MeasureClash` (`underlyingSpace.ts:497-505`), which names the axis and both units and suggests either one unit or a separate chart with its own `w`/`h`. "Silent" means it renders on one shared scale with no message.

| Example | Today | S1 strict | S2 pairwise | S3 variables | S4 input = claim |
|---|---|---|---|---|---|
| Box plot, lo/q1/q3/hi from JS | Error | Error until 4 declarations | OK | OK | OK |
| Gantt start/end, `Schema.time()` | Error until `field(.., "date")` | OK | OK | OK | OK |
| Gantt bar as `x: start, w: dur` | depends on rect's size merge | Error (instant vs `dur`) | OK | OK | OK (dur is derived) |
| Marginal histogram (separate charts) | OK | OK | OK | OK | OK |
| Guard: count vs flipper on one axis | Error | Error | Silent | Silent | Error |
| Bin edges with a mean rule from JS | Error | Error until declared | OK | OK | OK |
| Price vs volume layered on one axis (#528) | Error | Error | Silent | Silent | Error |
| USD vs EUR, both declared | Error | Error | Error | Error | Error |
| °C readings vs °C changes, both "°C" | Silent | Silent | Silent | Silent | Silent |
| Count vs its `normalize` share | Error | Error | Error | Error | Error |
| Waterfall: start/end from JS, amount declared USD | Error | Error until declared | OK (binds USD) | OK (binds USD) | OK |
| Good vs average, input columns | Error | Error until declared | OK | OK | Error until declared |
| `bmi` from JS beside weight | Error | Error (correctly) | Silent | Silent | Error (correctly) |
| Log-scaled y of USD | OK | OK | OK | OK | OK |
| Two time zones on one axis | Error | Error | Error | Error | Error |

Notes on rows:

- **°C readings vs changes.** No sketch catches it, and none should. It is a capability question (a reading has no zero, so it is not a bar length). It belongs to #984.
- **USD vs EUR.** The right outcome is the dual axis of #528, not a merge. Every sketch keeps this as an error, which is where #528 would start.
- **Log scale.** It is a property of the scale, not the unit. Bars on a log axis are a capability error (no zero), again #984.
- **Gantt `w: dur`.** The "today" cell needs a check of how rect merges a position with a size. Under the sketches it is a variable meeting "instant". That a duration acts on an instant is a #984 fact, not a unit fact.
- **The two silent guards** are the price of Sketches 2 and 3. Two pressures limit the damage. First, columns from real data often carry the unit in the name (`"Beak Length (mm)"`), so a user who declares units has an easy path. Second, the title "count, Flipper Length (mm)" shows the mix-up on the page.

## 6. What to defer

- **Dimensions and conversion.** No consumer today. Revisit with a converting secondary axis.
- **Unit arithmetic** (`kg/m²` from `kg` and `m`). Needs arithmetic field expressions first.
- **Points vs differences on the unit** (Pint's `delta_degC`). Do it through #984's capability record.
- **Time-zone conversion on a shared axis.** It is the one conversion that is free and exact. It is a separate decision from units.
- **Reading pint-pandas dtypes or Arrow field metadata in the Python widget.**
- **The dual axis itself (#528).** Every sketch hands it the same error to start from.
- **A chart-wide substitution** if Sketch 2 is chosen. Sketch 3 can follow later with no API change.

## 7. Open questions

1. Should the unit and the axis title split? This doc assumes yes: a unit decides sharing, and quantity names (column names, or a declared label) make the title. If not, every sketch inherits "USD" as a title.
2. Is losing the count-vs-length and price-vs-volume guards acceptable (Sketches 2 and 3), or is the guard worth Sketch 4's input/derived distinction?
3. Spelling: `Schema.unit("USD")` or `Schema.measure("USD")`? And is the record key `HasUnit: { unit }` or a plain `unit`?
4. Does `field(name, m)` go away, with `derive(fn, { schema })` as the only place to declare a computed column's unit?
5. Is a time column's unit "instant" (zone is display, could convert), or is the zone part of the unit (today's error)?
6. Should an untitled shared axis read "lo, hi, q1, q3", or show no title until one is declared?
7. Should #994's record refactor land first, alone, as the shared substrate, before the merge rule is chosen?
