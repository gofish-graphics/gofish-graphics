# Types for the example datasets

> Correction (Josh, 11-13): in the seafood catch data `lake` is ordered. The lakes lie along connected rivers, so Lake A to Lake F is a real order, and the ribbon and line stories between lakes are valid once that order is declared. Read the claims below that `lake` has no order with this in mind.

Survey date: 2026-11-13, worktree `type-system-proposal`.
This note writes the proposal's vocabulary on every dataset in `packages/gofish-graphics/src/data/`, so the rules can be judged on data we already draw.

Labels used below:

- **Proposed** marks a spelling from the proposal that does not exist yet. None of it was run.
- **Today** marks a spelling that main accepts now. **Run** means I executed it against the built library (see [What I ran](#what-i-ran)). **Not run** means I wrote it but did not execute it.
- A **key** is the set of columns that names which thing a row is about. "Checked" means a script confirmed that no two rows share it.
- A **rest key** is the part of the key that the flow has not split yet, so a mark folds those rows into one value.

## Summary

| Dataset                  | Rows               | Key (checked)                                                             | The one interesting typing fact                                                                                                                |
| ------------------------ | ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `seafood` (catch)        | 30                 | `lake`, `species`                                                         | `lake` has no order, so six gallery stories that draw ribbons between lakes become errors once `lake` is declared                              |
| `catchDataWithLocations` | 30                 | `lake`, `species`                                                         | `x` and `y` belong to the lake and are copied onto every species row, with no join to remember that                                            |
| `fishData`               | 30                 | `Lake`, `Fish Type`                                                       | a second copy of the catch table with other column names, and 28 of 30 counts differ                                                           |
| `birds`                  | 26,280             | `species`, `day`                                                          | `day` is a day of the year, and closing the loop is right: day 365 lies 0.03° from day 1                                                       |
| `caltrain`               | 1,436              | `Train`, `Station`                                                        | `Time` is minutes after midnight and runs past 1,440 for trains after midnight                                                                 |
| `categoryBrands`         | 1,975              | `year`, `name`                                                            | a top-N list: a missing brand is not a zero, so the proposal's "missing pair is zero" rule is wrong here                                       |
| `countryPopulations`     | 70                 | `country`                                                                 | `uncertainty` belongs to the region and repeats on every country, so summing it counts it about five times                                     |
| `denseMasses`            | 1,000              | none (735 exact duplicate rows)                                           | individuals with no id: the proposal has no spelling for "one row per thing, no id column"                                                     |
| `drivingShifts`          | 55                 | `year`                                                                    | `year` is a number, and declaring it `Unit.time()` today silently reads 1956 as 1.956 seconds after 1970                                       |
| `energy`                 | 48 nodes, 68 links | links: `source`, `target`                                                 | a graph, not a table. Adding every link counts energy 2.77 times                                                                               |
| `gapminderCountries`     | 191                | `Country`                                                                 | the right weight for averaging life expectancy is in the table (`Population`), but the right weight for fertility (women aged 15 to 49) is not |
| `genderPayGap`           | 10                 | `Gender`, `Pay Grade`                                                     | a wide table of five order statistics: none of them sums or averages                                                                           |
| `newCarColors`           | 160                | `Color`, `Year`, and also `Year`, `Rank`                                  | two candidate keys: a rank is a key inside a year                                                                                              |
| `nightingale`            | 36                 | `Month`, `Type`                                                           | the Rose story stacks square roots of deaths, and `derive` hides it from every rule                                                            |
| `olympicMedals`          | 60                 | `Country_Code`, `Medal_Type`                                              | the cleanest fit: a count that sums over every key, and an ordered medal key                                                                   |
| `penguins`               | 344                | none                                                                      | `Sex` has a `"."` and nulls, and per-penguin measurements can both sum and average, which leaves the default fold open                         |
| `seattleWeather`         | 1,461              | `date`                                                                    | the gallery story "Seattle Highs by Day of the Week" draws bars of °C from 0, so the `HasZero` rule rejects it                                 |
| `streamgraphData`        | 50                 | `x`, `c`                                                                  | `c` is a category coded as a number                                                                                                            |
| `titanic`                | 16                 | `class`, `sex`, `survived`                                                | already aggregated. `class` has a partial order: Crew is not after Third                                                                       |
| `titanicPassengers`      | 1,309              | none after parsing (221 exact duplicates). The raw file: `name`, `ticket` | `fare` is per ticket, so summing it over passengers gives 43,550 instead of 19,303. The parser drops `ticket`, so no `over` can name it        |
| `world110m`              | 287 rings          | none (`id` repeats for 30 countries)                                      | geo shapes: a row is a ring of points, and the vocabulary has nothing for it                                                                   |

## What typing these taught us

### Patterns that repeat

- **Counts that sum over every key are the common case.** `seafood`, `fishData`, `nightingale`, `olympicMedals`, `titanic` and `streamgraphData` all have one count column with `Trait.canSum()`. For these the proposal adds nothing over today's unit-level `Trait.summable()`. The keyed `over` earns its place only on the datasets below.
- **Snapshots along a year.** `categoryBrands.value` (brand value on January 1st) and `gapminderCountries.Population` would be snapshots if the table had more than one year. Only `categoryBrands` has the year, and there `canSum({ over: "name" })` and `canSum()` plus `snapshot({ along: "year" })` say the same thing, because `category` is a function of `name` and adds no key.
- **Values per individual.** Penguin measurements, gapminder rates, Seattle temperatures and wind, and driving-shift miles per person are all averages of something. Most need no weight column (each row counts once). The ones that need a weight do not carry it.
- **Labels that are functions of part of the key.** `category` of `name`, `Direction` and `Type` of `Train`, `Country_Name` of `Country_Code`, `continent` of `region`. These are harmless, since a color or text channel only needs one value per group, and the proposal's "the value must agree across the group" rule already covers them.
- **Numbers that are not amounts.** Years (`drivingShifts`, `categoryBrands`, `newCarColors`), day of year (`birds`), minutes after midnight (`caltrain`), category codes (`streamgraphData.c`, `pclass`, `survived` as 0 or 1) and ranks (`newCarColors`). Seven of the twenty datasets have at least one.

### Vocabulary gaps, ranked by how many datasets hit them

1. **Times and orders stored as numbers (7 datasets: `drivingShifts`, `categoryBrands`, `newCarColors`, `birds`, `caltrain`, `streamgraphData`, `titanicPassengers`).** There is no spelling for "this number is a year" or "this number has an order but no sum". `Trait.ordered()` needs `Domain.discrete(levels)`, so a numeric key cannot be declared ordered. `Unit.time()` accepts a number and reads it as milliseconds since 1970 with no error (run, see `drivingShifts`). The proposal's line rule needs `HasOrder` on the key, so it needs a way to give a number column an order.
2. **A value that belongs to a coarser key, in a table that is already flat (4 datasets: `countryPopulations.uncertainty`, `catchDataWithLocations.x`/`y`, `titanicPassengers.fare`, and the label columns above).** The proposal catches this "fan trap" only after a `join`, because "the joined column remembers its own key". Here there was never a join. The row check can still find it (the value is constant within each region), but there is no way to declare it. A spelling such as `{ unit, key: "region" }` on the column would say it directly.
3. **No key at all (4 datasets: `penguins`, `denseMasses`, `titanicPassengers`, `world110m`).** One row per individual, with no id column, and in three of them exact duplicate rows. The static rule needs a declared key. An implicit row-number key (each row is its own thing) would make these work, and is what `canSum()` already assumes.
4. **Weights that are not in the table (3 datasets: `drivingShifts`, `gapminderCountries`, `seattleWeather`).** Miles per person needs population per year. Gas price needs gallons sold. Fertility needs women aged 15 to 49. `canAverage()` with no weight then means "equal weights", which is a claim the data cannot back.
5. **Pre-aggregated statistics with no fold (2 datasets: `genderPayGap`, and the `Ridgeline` story's counts).** A median does not sum or average. The proposal handles this as "neither trait, so a fold is an error", which is right, but it means the value has no type that says what it is.
6. **Cycles that are not quite cycles (3 datasets: `nightingale`, `birds`, `caltrain`).** `nightingale.Month` is month-of-year in name only: the values match calendar 1855, so a closed line would join December 1855 to January 1855. `birds.day` really is a cycle. `caltrain.Time` is a time of day unrolled past midnight.
7. **Wide tables (2 datasets: `genderPayGap`, `seattleWeather` with `temp_max`/`temp_min`).** The proposal's `unpivot` covers both, with the five quantiles or the two temperatures sharing one unit.
8. **Shapes and graphs (2 datasets: `world110m`, `energy`).** A ring of points and a node-link graph. Neither is a flat table. Neither is in scope for the proposal, and `energy` is not used by any story.
9. **Two candidate keys (1 dataset: `newCarColors`).** `key` takes one list.
10. **A partial order (1 dataset: `titanic.class`).** First, Second and Third are ordered. Crew is not in that order.

### Places where the proposal's rules look wrong on real data

- **"A missing pair is zero if the value sums and has a zero" (section 7) is wrong for `categoryBrands`.** The table is a top-N list per year: 75 brands in 2000 and 100 after, and only 37 of 173 brands are present in all 20 years. A brand that drops out of the list still has a value. A ribbon or line that drew it at zero would be false. Whether a missing pair is zero is a fact about how the table was made (complete or truncated), not about the value's traits. It needs its own declaration, or the default should be a gap.
- **The `stack` rule, read literally, flags the Nested Mosaic story.** The rule says each child of a stack must be one length along its direction, and that a spread or stack of several lengths "has an extent but no amount". `NestedMosaicChart` stacks `class` on y around a stack of `sex` on x, with `size: field("count").normalize()` on each. Here the outer stack sets each child's length from its own `size`, so the picture is right. The rule needs to say that a stack whose `size` option gives each child's length does not read the child's extent. I did not run a checker, so this is my reading of the rule's text.
- **`derive` hides a real error in the Rose story.** `Pie.stories.tsx` `Rose` computes `Math.sqrt(Death)` in a `derive` and then stacks the roots by `Type`. A sum of square roots is not the square root of the sum, so each wedge's outer radius is wrong. Today it draws with `Death` declared summable (run). Under the proposal, `derive` makes the column unknown, so no rule fires. If `derive` kept a column's type by name (one reading of #999), the stack would pass `canSum` and still be wrong. The right spelling is the proposed `Coord.clock({ radius: "area" })` with no derive.
- **`canSum` and `canAverage` can both hold, and the proposal does not say which fold is the default.** Body mass per penguin sums (total mass of a group) and averages (mean mass). The proposal assumes a column has one of the two.

### Existing stories the proposed rules would reject

These are rejections only once the relevant column is declared. Undeclared columns pass every check.

| Story                                                                                                                                      | Rule                                                            | Right?                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bin `WeekdayTemperature` (gallery "Seattle Highs by Day of the Week")                                                                      | `HasZero`: a bar of °C from 0 (#1051)                           | Yes. Today it draws with °C declared (run), because the explicit `.mean()` skips the sum check.                                                            |
| Area `Basic`, Area `Stacked`, Ribbon `Basic`, Ribbon `Polar`, Streamgraph `Default`, Lengths "Area Chart With Flexible Gaps" (all gallery) | `ribbon` along a key needs `HasOrder` (section 10)              | By the proposal's logic, yes: lakes have no order, so the band between them shows nothing. It turns GoFish's signature example into an error. Josh's call. |
| LineChart `Default` (`scatter({ by: "lake" })` then `line()`)                                                                              | `line` along a key needs `HasOrder`                             | Yes. The path visits lakes in file order.                                                                                                                  |
| Bin "Seattle Rain on a Time Axis" (`partition` by year and month, `h: precipitation.sum()`)                                                | key-sized lint (section 9): an amount in cells of unequal width | A lint, as the proposal says. Months differ by up to 3 days, about 10%.                                                                                    |
| NestedMosaicChart `Default`                                                                                                                | stack outside a stack                                           | No, see above. A false positive if the rule is read literally.                                                                                             |
| Pie `Rose`                                                                                                                                 | none fires                                                      | A miss. The story is wrong and no rule sees it.                                                                                                            |

## What I ran

All scripts are in `/Users/jmp/.claude/jobs/e051d870/tmp/datasets/`, run with the package's `tsx` from the worktree, after `pnpm --filter gofish-graphics build`.

- `keys.ts` (output `keys.out`): row counts, samples, uniqueness of every candidate key, functional dependencies, ranges and nulls for all 20 datasets.
- `extra.ts` (output `extra.out`): Titanic fares per ticket, the birds' loop closure, Nightingale's monthly values, the sum of `uncertainty`, the brand top-N, and the sum over `energy` links.
- `today.ts` (output `today.out`): 22 specs, each a dataset with its schema in today's spelling and a flow that an existing story draws, built with `.toDisplayList()`. 19 drew and 3 threw. Each result is quoted in the dataset's section.
- `sex.ts` (output `sex.out`): the `penguins.Sex` stray-level error, and how `Unit.time()` reads a numeric year.

I did not run any proposed spelling, since none exists. I did not render a story with `capture-one`, and I did not add a story or a test to the repo. The judgments of "would be rejected" come from reading the proposal's rules, not from a checker.

---

## `seafood` (catch)

`packages/gofish-graphics/src/data/catch.ts`. Imported by about 30 story files, more than any other dataset.

30 rows:

```js
{ lake: "Lake A", species: "Bass", count: 23 }
{ lake: "Lake A", species: "Trout", count: 31 }
{ lake: "Lake D", species: "Bass", count: 12 }
```

**Key (checked).** `lake`, `species` is unique. It is a full grid: 6 lakes times 5 species. No nulls.

**Proposed.**

```js
const Fish = Unit("fish");

chart(seafood, {
  key: ["lake", "species"],
  schema: {
    // No order: lakes are places. So a line or ribbon along lake is an error.
    lake: Unit({
      domain: Domain.discrete([
        "Lake A",
        "Lake B",
        "Lake C",
        "Lake D",
        "Lake E",
        "Lake F",
      ]),
    }),
    species: Unit({
      domain: Domain.discrete(["Bass", "Trout", "Catfish", "Perch", "Salmon"]),
    }),
    // Fish caught: each fish is caught once, in one lake, so the count adds
    // over both keys.
    count: { name: "Catch", unit: Fish, traits: [Trait.canSum()] },
  },
});
```

**Today (run).**

```js
const Fish = Unit("fish", { traits: [Trait.summable()] });

chart(seafood, {
  schema: {
    lake: Unit({
      domain: Domain.discrete([
        "Lake A",
        "Lake B",
        "Lake C",
        "Lake D",
        "Lake E",
        "Lake F",
      ]),
    }),
    species: Unit({
      domain: Domain.discrete(["Bass", "Trout", "Catfish", "Perch", "Salmon"]),
    }),
    count: { name: "Catch", unit: Fish },
  },
});
```

- `BarStacked` (`spread` by lake, `stack` by species, `h: "count"`): draws (run). Under the proposal it passes: `count` sums over `species`.
- Area `Stacked` (the same flow with `ribbon`): draws today (run). Under the proposal it is an error, because `ribbon` along `lake` needs `HasOrder`.

**Allows and rejects.**

- Pie `Basic` (`stack` by species, `w: "count"`): the rest key is `lake`, and `count` sums over it. Passes.
- `BarGrouped`, `FacetedChart`, `CircleArea` and `InferredSize`: pass. `CircleArea` with `r: "count"` sets a radius from an amount, which is the area lint of #972, not a type error.
- Area `Basic`, Area `Stacked`, Ribbon `Basic` and `Polar`, `Streamgraph`, `Lengths` (all gallery): error once `lake` is declared. See the table above.

**Where the vocabulary does not fit.** Nothing here. This table is what the proposal was written for.

### `catchLocations` and `catchDataWithLocations`

`catchLocationsArray` has one row per lake (`lake`, `x`, `y`), key `lake`. `catchDataWithLocations` copies each lake's `x` and `y` onto all five species rows (30 rows, key `lake`, `species`).

```js
// Proposed. x and y belong to the lake, not to the (lake, species) row.
chart(catchDataWithLocations, {
  key: ["lake", "species"],
  schema: {
    count: { unit: Fish, traits: [Trait.canSum()] },
    x: { unit: "map units" }, // no canSum: a position
    y: { unit: "map units" },
  },
});
```

- `Scatter` `WithPieGlyphsDenormalized` scatters by `lake` with `x: "x"`. A position fold is a mean, and the mean of five equal copies is the value, so it passes.
- There is no way to say that `x` depends only on `lake`. The proposal finds that only after a `join` (gap 2). A `scatter` without `by: "lake"` would place 30 points, five on top of each other, and no rule says why.

### `fishData`

`packages/gofish-graphics/src/data/fish.ts`, used only by three files in `src/tests/`. Same shape as `seafood` with the columns `Lake`, `Fish Type`, `Count`. Key `Lake`, `Fish Type` (checked). The script found that only 2 of the 30 counts equal `seafood`'s. It is a second, slightly different copy of the same table. The types are the same as `seafood`'s. This is a data hygiene question, not a typing one.

## `birds`

`packages/gofish-graphics/src/data/birds.ts`. Used by the two `BirdMigration` stories.

26,280 rows:

```js
{ day: 1, lon: -101.642, lat: 24.843, species: "Townsend_s_Warbler" }
{ day: 2, lon: -101.605, lat: 24.784, species: "Townsend_s_Warbler" }
{ day: 1, lon: -97.053, lat: 19.794, species: "Wilson_s_Warbler" }
```

**Key (checked).** `species`, `day` is unique: 72 species times 365 days, no gaps.

**Proposed.**

```js
const Degree = Unit("°");

chart(birds, {
  key: ["species", "day"],
  schema: {
    species: Unit({ domain: Domain.discrete(birdSpecies) }),
    // Day of the year, 1 to 365. Cyclic: day 365 is next to day 1. The proposal
    // has no spelling for a numeric domain with a cycle, so this is a guess.
    day: {
      domain: Domain.continuous([1, 366]),
      traits: [Trait.ordered(), Trait.cyclic()],
    },
    // Positions on the globe. They do not sum. Longitude has a cycle too, which
    // Coord.geo already knows.
    lon: { name: "Longitude", unit: Degree },
    lat: { name: "Latitude", unit: Degree },
  },
});
```

**Today (run).** One species' path, `scatter({ by: "day", x: "lon", y: "lat" })` with `line()`, and `lon` and `lat` declared in `Unit("°")`: draws. `day` cannot be declared ordered today, because `Trait.ordered()` needs `Domain.discrete`.

**Allows and rejects.**

- `BirdMigrationStatic` `A_StaticLines` (`group` by species, `scatter` by day, `line`): passes. The line runs along `day`, which has an order.
- With `Trait.cyclic()` the proposal closes the line. I checked whether that is right: the median distance between a species' day 365 and day 1 is 0.029°, against a median daily step of 0.187°. So the paths are closed loops, and closing them is right. This is the first real example in the repo where a closed line along a data key is correct.

**Where the vocabulary does not fit.** A numeric key with an order and a cycle (gap 1). `Domain.continuous` plus `Trait.cyclic()` is my guess at a spelling. The proposal only shows `cyclic` on a discrete month.

## `caltrain`

`packages/gofish-graphics/src/data/caltrain.ts`. Used by the `StringlineChart` story, which uses the low-level combinators and never calls `chart(data)`, so no schema applies to it today.

1,436 rows:

```js
{ Train: "237N", Direction: "northbound", Type: "Local", Station: "Tamien", Time: 573 }
{ Train: "237N", Direction: "northbound", Type: "Local", Station: "San Jose", Time: 580 }
{ Train: "138S", Direction: "southbound", Type: "Limited", Station: "San Francisco", Time: 607 }
```

**Key (checked).** `Train`, `Station` is unique. 90 trains, 29 stations. `Direction` and `Type` are functions of `Train` (checked).

**Proposed.**

```js
chart(caltrain, {
  key: ["Train", "Station"],
  schema: {
    Train: Unit({ domain: Domain.discrete(trainIds) }), // an id, no order
    Direction: Unit({ domain: Domain.discrete(["northbound", "southbound"]) }),
    Type: Unit({ domain: Domain.discrete(["Local", "Limited", "Bullet"]) }),
    // Stations in order along the line, south to north. Not cyclic: the line ends.
    Station: Unit({
      domain: Domain.discrete(caltrainStopOrder),
      traits: [Trait.ordered()],
    }),
    // Minutes after midnight. Runs to 1,532 for trains after midnight, so it is
    // a time of day unrolled past 24 hours, not a clock time.
    Time: { name: "Departure", unit: "minutes after midnight" },
  },
});
```

**Today (not run).** The story does not use `chart`. A `chart` version would declare `Station` with `Domain.discrete(caltrainStopOrder)` and `Trait.ordered()`, which today's API accepts.

**Allows and rejects.** A stringline is a `line` per train along `Station`. `Station` has an order, so the proposal's line rule passes.

**Where the vocabulary does not fit.**

- `Time` is a time of day stored as minutes (gap 1). `Unit.time()` would read 573 as 0.573 seconds after 1970. A time of day has a cycle of 1,440 minutes, but this data deliberately unrolls it past midnight so a late train's line does not wrap. So `Trait.cyclic()` would be wrong here, and nothing says "a time of day, not wrapped".

## `categoryBrands`

`packages/gofish-graphics/src/data/categoryBrands.ts`. Used by `BarChartRace` and the build-in animation stories.

1,975 rows:

```js
{ year: 2000, name: "Coca-Cola", category: "Beverages", value: 72537 }
{ year: 2000, name: "Microsoft", category: "Technology", value: 70196 }
{ year: 2010, name: "Gillette", category: "FMCG", value: 23298 }
```

**Key (checked).** `year`, `name` is unique. 20 years, 173 brands, 22 categories. `category` is a function of `name`. There are 75 rows in 2000 and 100 in every later year. Only 37 brands appear in all 20 years.

**Proposed.**

```js
const USDMillion = Unit("USD million");

chart(categoryBrands, {
  key: ["year", "name"],
  schema: {
    year: { unit: "year", traits: [Trait.ordered()] }, // a number with an order
    name: Unit({ domain: Domain.discrete(brandNames) }),
    category: Unit({ domain: Domain.discrete(categories) }), // a function of name
    // A brand's value on January 1st: a reading at a point in time. It adds
    // over brands (the value of a portfolio) but not over years.
    value: {
      name: "Brand value",
      unit: USDMillion,
      traits: [Trait.canSum({ over: "name" })],
      // or, the open second spelling:
      // traits: [Trait.canSum(), Trait.snapshot({ along: "year" })],
    },
  },
});
```

The two spellings agree here. `category` adds no key, since it is a function of `name`.

**Today (run).**

```js
chart(categoryBrands, {
  schema: {
    value: {
      name: "Brand value",
      unit: Unit("USD million", { traits: [Trait.summable()] }),
    },
  },
});
```

- One frame of the race (year 2000, `spread` by name sorted by value, `w: "value"`): draws.
- A bar per brand over all years (`spread({ by: "name" })`, `h: "value"`): draws today, and adds up to 20 yearly values per bar. Under the proposal it is an error that offers `.last()` or `.mean()`.

**Allows and rejects.** `BarChartRace` splits by `year` with `time.sequence`, then by `name`, so the rest key is empty and it passes.

**Where the vocabulary does not fit.**

- **A truncated table.** The table lists the top brands each year. A brand missing from a year is not worth zero. The proposal says a missing pair is zero when the value sums and has a zero, so a ribbon between years (a "bump" of brand values) would drop each brand to zero when it leaves the list. That rule is wrong for this table.
- **Completeness.** A total per year is the total of the top 100, not of all brands. The proposal's answer for this is a lint on totals after `filter`, but there is no `filter` here: the source was truncated before GoFish saw it. Nothing in the schema can say so.
- `year` is a number (gap 1).

## `countryPopulations`

`packages/gofish-graphics/src/data/countryPopulations.ts`. Used by `BubbleTreemap`, `VoronoiTreemap` and `EncloseShapes`.

70 rows:

```js
{ continent: "Asia", region: "East Asia", country: "China", pop: 1410, uncertainty: 1 }
{ continent: "Asia", region: "East Asia", country: "Japan", pop: 124, uncertainty: 1 }
{ continent: "Africa", region: "East Africa", country: "Mozambique", pop: 34, uncertainty: 8 }
```

**Key (checked).** `country` is unique. 4 continents, 13 regions. `continent` is a function of `region`, and so is `uncertainty`.

**Proposed.**

```js
chart(countryPopulations, {
  key: ["country"],
  schema: {
    continent: Unit({ domain: Domain.discrete(continents) }),
    region: Unit({ domain: Domain.discrete(regions) }),
    // Population in millions. Adds over countries. A snapshot of 2023, but the
    // table has no year, so nothing to say "along".
    pop: {
      name: "Population",
      unit: "million people",
      traits: [Trait.canSum()],
    },
    // A made-up spread per region, in percent, copied onto every country of
    // the region. It belongs to the region. There is no spelling for that.
    uncertainty: { name: "Uncertainty", unit: "%" },
  },
});
```

**Today (run).**

- `VoronoiTreemap` `SliceThenDice` with `pop` in `Unit("million people", { traits: [Trait.summable()] })`: draws.
- A bar of `uncertainty` per region, with `%` declared summable: draws, and adds 5 copies per region on average. Over all rows the sum is 324 against 60 over regions. Without `summable`, today's check stops it, but only by saying a percent never sums, which is the unit-level answer.

**Allows and rejects.**

- The treemaps (`treemap({ by: "continent", size: "pop" })`, then `region`, then countries): `pop` sums over `country`, so they pass.
- `BubbleTreemap` `Uncertainty` reads `padding: "uncertainty"` on the region's `enclose`. That is one value per group, and the copies agree, so it passes the "must agree across the group" rule. The rule is right.

**Where the vocabulary does not fit.**

- `uncertainty` depends only on `region`, in a table that never went through a `join` (gap 2). The row check finds it (the value is constant within each region), but the user cannot declare it.
- `pop` is in millions. `gapminderCountries.Population` is in persons. Both are people. Under today's units these are two units that clash on a shared axis, with no conversion. Unit conversion is open in section 6 of the proposal.

## `denseMasses`

`packages/gofish-graphics/src/data/denseMasses.ts`. Synthetic. Used by the `Noise` stories.

1,000 rows:

```js
{ group: "A", mass: 3775 }
{ group: "A", mass: 3350 }
{ group: "B (bimodal)", mass: 4700 }
```

**Key (checked).** None. Masses are on a 25 g grid, so 735 rows are exact copies of another row. Each row is one made-up individual.

**Proposed.**

```js
chart(denseMasses, {
  // no key: one row per individual, with no id
  schema: {
    group: Unit({
      domain: Domain.discrete(["A", "B (bimodal)", "C (skewed)"]),
    }),
    mass: { name: "Mass", unit: "g", traits: [Trait.canAverage()] },
  },
});
```

**Today (not run).** `mass: { name: "Mass", unit: Unit("g") }` would be the spelling.

**Allows and rejects.** The `Noise` stories place every row as a dot with `scatter({ x: "mass" })`. Each dot is one row, so no fold happens and nothing is checked.

**Where the vocabulary does not fit.** No key, and duplicate rows that are different individuals (gap 3). The proposal says "a bag with several rows per key" must not be equal to a deduplicated table, but it has no spelling for "these rows are distinct things with no id". An implicit row-number key would do it.

## `drivingShifts`

`packages/gofish-graphics/src/data/drivingShifts.ts`. Used by the connected scatter stories, `LineChart` `GasPrices`, `CurveLadder` and `FacetedChart`.

55 rows:

```js
{ side: "left", year: 1956, miles: 3675, gas: 2.38 }
{ side: "right", year: 1957, miles: 3706, gas: 2.4 }
{ side: "right", year: 1983, miles: 6943, gas: 2.66 }
```

**Key (checked).** `year` is unique, 1956 to 2010 with no gaps.

**Proposed.**

```js
chart(drivingShifts, {
  key: ["year"],
  schema: {
    year: { unit: "year", traits: [Trait.ordered()] },
    // Miles driven per person in a year. A rate per person: its weight is the
    // population, which is not in the table.
    miles: {
      name: "Miles driven per person",
      unit: "mi/person",
      traits: [Trait.canAverage()],
    },
    // Gas price per gallon, inflation adjusted. Its weight is gallons sold.
    gas: { name: "Gas price", unit: "USD/gal", traits: [Trait.canAverage()] },
    // Where to put the year's label in the connected scatter. Not data.
    side: Unit({ domain: Domain.discrete(["left", "right", "top", "bottom"]) }),
  },
});
```

**Today (run).**

```js
chart(drivingShifts, {
  schema: {
    miles: { name: "Miles driven per person", unit: Unit("mi/person") },
    gas: { name: "Gas price", unit: Unit("USD/gal") },
    side: Unit({ domain: Domain.discrete(["left", "right", "top", "bottom"]) }),
  },
});
```

- Connected scatter (`scatter({ by: "year", x: "miles", y: "gas" })`, `circle`, then `line`): draws.
- `year: Unit.time()`: draws with no error, and the x axis reads "12:00:01 AM, 12:00:02 AM, 12:00:03 AM". It reads 1956 as 1,956 milliseconds after 1970 (run, `sex.out`).

**Allows and rejects.**

- The connected scatter's line runs along `year`, which has an order. Passes.
- `FacetedChart` spreads by `side`. That passes every rule, and it is meaningless: `side` is a label hint, not a property of the year. Types cannot catch this.

**Where the vocabulary does not fit.**

- Weights that are not in the table (gap 4). A mean of `miles` over a decade with equal weights is close to right, since population changes slowly, but the schema cannot say whether it is.
- `year` as a number, and `Unit.time()` accepting it silently (gap 1). This last one is a bug today, not only a gap: `Unit.time()` should reject a number, or take a granularity.
- `side` is presentation data in the data table. The vocabulary has no word for it, and does not need one.

## `energy`

`packages/gofish-graphics/src/data/energy.ts`. Not imported by any story, test or doc.

48 nodes and 68 links:

```js
nodes: [{ name: "Agricultural 'waste'" }, { name: "Bio-conversion" }, ...]
links: [
  { source: 0, target: 1, value: 124.729 },
  { source: 1, target: 2, value: 0.597 },
  { source: 1, target: 3, value: 26.862 },
]
```

**Key (checked).** Links: `source`, `target` is unique. Node names are unique. `source` and `target` are indexes into `nodes`, a foreign key.

**Proposed.** A sketch only, since the proposal does not type a graph:

```js
chart(energy.links, {
  key: ["source", "target"],
  schema: {
    // Energy flowing along one link, in TWh. It adds over the links that cross
    // one cut of the graph, not over all links.
    value: { unit: "TWh", traits: [Trait.canSum()] },
  },
});
```

**Today (not run).** No story uses it.

**Where the vocabulary does not fit.** `canSum()` is wrong and `canSum({ over })` cannot say what is right. 14 nodes are both a source and a target, so energy passes through several links in a row. The sum over all links is 7,856 TWh, 2.77 times the 2,841 TWh that leaves the source nodes. A sum is valid over a set of links that do not lie on one path, and that is a fact about the graph, not about a key column. The proposal's `HasNeighbors` ("wait for an example") would need this as its example.

## `gapminderCountries`

`packages/gofish-graphics/src/data/gapminderCountries.ts`. Used by `EncloseShapes`.

191 rows:

```js
{ Country: "Afghanistan", Region: "South Asia", FertilityRate: 7.81, LifeExpectancy: 51, Population: 19701940 }
{ Country: "Albania", Region: "Europe & Central Asia", FertilityRate: 2.47, LifeExpectancy: 74.2, Population: 3121965 }
{ Country: "Liberia", Region: "Sub-Saharan Africa", FertilityRate: 5.95, LifeExpectancy: 55.9, Population: 2891968 }
```

**Key (checked).** `Country` is unique. 6 regions. No nulls.

**Proposed.**

```js
const Persons = Unit("persons");

chart(gapminderCountries, {
  key: ["Country"],
  schema: {
    Region: Unit({ domain: Domain.discrete(regions) }),
    // Adds over countries.
    Population: { unit: Persons, traits: [Trait.canSum()] },
    // Years lived per person born: a mean over persons, so the population is
    // the weight (strictly, births; population is close).
    LifeExpectancy: {
      name: "Life expectancy",
      unit: "years",
      traits: [Trait.canAverage({ weight: "Population" })],
    },
    // Births per woman. The right weight is women aged 15 to 49, which is not
    // in the table. With no weight this means a plain mean, which is wrong for
    // a region.
    FertilityRate: { name: "Fertility rate", unit: "births/woman" },
  },
});
```

**Today (not run).** `Population` with `Unit("persons", { traits: [Trait.summable()] })`, and the two rates in units with no `summable`. Today's error for a region bar of `LifeExpectancy` would suggest `field("LifeExpectancy").mean()`, which is unweighted and wrong by a lot (India and the Maldives count the same).

**Allows and rejects.**

- `EncloseShapes` scatters `FertilityRate` against `LifeExpectancy`, one dot per row. No fold, so it passes.
- A bar of `LifeExpectancy` per `Region` would elaborate to the population-weighted mean. This is the proposal's best case: the weight is in the table and has the right unit.
- A bar of `FertilityRate` per `Region` would be an error asking for a weight. That is right, and the user cannot answer it from this table.

**Where the vocabulary does not fit.** The weight that the unit asks for ("per woman") is not a column (gap 4). The proposal's rule "the weight must be a summable column in the denominator's unit" correctly refuses `Population` as the weight of `FertilityRate`, since persons are not women, but the only honest answer left is "you cannot average this".

## `genderPayGap`

`packages/gofish-graphics/src/data/genderPayGap.ts`. Used by the `BoxPlot` story, which already passes a schema.

10 rows:

```js
{ Gender: "Male", "Pay Grade": "Five", Median: 94000, "75-Percentile": 97000, "25-Percentile": 92000, Max: 103000, Min: 85000 }
{ Gender: "Female", "Pay Grade": "Five", Median: 83000, "75-Percentile": 86000, "25-Percentile": 82000, Max: 95000, Min: 70000 }
{ Gender: "Female", "Pay Grade": "Three", Median: 38000, "75-Percentile": 41000, "25-Percentile": 36000, Max: 48000, Min: 35000 }
```

**Key (checked).** `Gender`, `Pay Grade` is unique. Every row satisfies Min ≤ 25th ≤ Median ≤ 75th ≤ Max (checked).

**Proposed.**

```js
// Order statistics of a distribution of pay. None of them sums, and none of
// them averages: the mean of two medians is not a median.
const pay = { name: "Pay", unit: "USD" };

chart(genderPayGap, {
  key: ["Gender", "Pay Grade"],
  schema: {
    Gender: Unit({ domain: Domain.discrete(["Male", "Female"]) }),
    "Pay Grade": Unit({
      domain: Domain.discrete(["One", "Two", "Three", "Four", "Five"]),
      traits: [Trait.ordered()],
    }),
    Min: pay,
    "25-Percentile": pay,
    Median: pay,
    "75-Percentile": pay,
    Max: pay,
  },
});
```

**Today (run).** The `BoxPlot` story's own schema (shown above minus `key`, and with `unit: Unit("USD")`):

- The box (`rect({ w: 16, y: "25-Percentile", y2: "75-Percentile" })` after `spread` by pay grade and a `spread` over the rest): draws.
- A bar of `Median` per pay grade (rest key `Gender`, two rows): throws "A size channel sums the column "Median", in the unit "USD", which cannot be summed... average them instead, e.g. field("Median").mean()". The error is right. The advice is wrong: the mean of two medians is not a median either.

**Allows and rejects.** The box plot reads each column as a position of one row, so no fold happens. Passes.

**Where the vocabulary does not fit.**

- A wide table whose column names are levels of a hidden key (`quantile`). `unpivot` would make that key, and the proposal's melted-quantiles example is exactly this.
- A column that neither sums nor averages has no positive type. "Neither trait" is right for the checker, but the error message needs to know the value is an order statistic to give good advice (gap 5).

## `newCarColors`

`packages/gofish-graphics/src/data/newCarColors.ts`. Used by `BumpChart`, which uses the low-level combinators, not `chart(data)`.

160 rows:

```js
{ Color: "White (solid+pearl)", Year: 2000, Rank: 2 }
{ Color: "Red", Year: 2000, Rank: 4 }
{ Color: "White (solid+pearl)", Year: 2008, Rank: 1 }
```

**Key (checked).** `Color`, `Year` is unique, and so is `Year`, `Rank`. 10 colors, 16 years, ranks 1 to 10.

**Proposed.**

```js
chart(newCarColors, {
  key: ["Color", "Year"], // also a key: ["Year", "Rank"]
  schema: {
    Color: Unit({ domain: Domain.discrete(colors) }),
    Year: { unit: "year", traits: [Trait.ordered()] },
    // A rank among the colors of one year: ordered, 1 is first. It does not
    // sum, and a mean rank is a different statistic.
    Rank: {
      domain: Domain.discrete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      traits: [Trait.ordered()],
    },
  },
});
```

**Today (not run).** `Rank: Unit({ domain: Domain.discrete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), traits: [Trait.ordered()] })` is valid today.

**Allows and rejects.** A bump chart is a `line` per color along `Year`, at the slot of its `Rank`. `Year` has an order, so it passes.

**Where the vocabulary does not fit.**

- Two candidate keys (gap 9). `key` takes one list. The second key is what makes a bump chart work: each year has exactly one color per rank.
- `Year` as a number (gap 1).

## `nightingale`

`packages/gofish-graphics/src/data/nightingale.ts`. Used by Pie `Rose` (gallery "Nightingale Rose Chart").

36 rows:

```js
{ Month: "Jan", Type: "Other", Death: 324 }
{ Month: "Jan", Type: "Wounds", Death: 83 }
{ Month: "Jul", Type: "Other", Death: 33 }
```

**Key (checked).** `Month`, `Type` is unique: 12 months times 3 causes. The disease deaths run Jan 2,761, Feb 2,120, Mar 1,205, Apr 477 and so on, which matches calendar 1855 (January 1855's 2,761 is the well-known peak). I did not check every value against a source.

**Proposed.**

```js
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

chart(nightingale, {
  key: ["Month", "Type"],
  schema: {
    // Months of 1855. Ordered. Cyclic only as month-of-year: December 1855 is
    // not followed by January 1855.
    Month: Unit({ domain: Domain.discrete(MONTHS), traits: [Trait.ordered()] }),
    Type: Unit({ domain: Domain.discrete(["Disease", "Wounds", "Other"]) }),
    // Deaths during the month: each death happens once, in one month, of one
    // cause. Adds over both keys.
    Death: { name: "Deaths", unit: "deaths", traits: [Trait.canSum()] },
  },
});
```

**Today (run).** The Rose spec with `Month` ordered, `Type` discrete, and `Death` in `Unit("deaths", { traits: [Trait.summable()] })`, in `Coord.clock()`, with the story's `derive` that takes `Math.sqrt(Death)` before stacking: draws, with no error.

**Allows and rejects.**

- **The Rose story is wrong, and no rule catches it.** It stacks the square roots of three causes, so each wedge's radius is √a + √b + √c instead of √(a + b + c). January's outer radius is 18 + 9 + 53 = 80 instead of √3168 ≈ 56. The proposal makes the derived column unknown, so nothing fires. The fix is the proposed `Coord.clock({ radius: "area" })`, with `h: "Death"` and no derive. Then `Death` stacks as an amount, which is valid.
- With `Trait.cyclic()` on `Month`, a spread in polar closes the loop with an even gap, which suits bars. A closed `line` would join December to January of the same year.

**Where the vocabulary does not fit.** Whether `Month` is cyclic depends on whether it means month-of-year or one month of 1855 (gap 6). The table has no year, so the declaration has to decide, and a closed line is the only place the difference shows.

## `olympicMedals`

`packages/gofish-graphics/src/data/olympic-medals.ts`. Used only by `src/tests/olympicMedalsStackedBars.ts`.

60 rows:

```js
{ Country_Code: "USA", Country_Name: "United States", Medal_Type: "Gold", Count: 46 }
{ Country_Code: "USA", Country_Name: "United States", Medal_Type: "Silver", Count: 29 }
{ Country_Code: "JAM", Country_Name: "Jamaica", Medal_Type: "Gold", Count: 4 }
```

**Key (checked).** `Country_Code`, `Medal_Type` is unique. 20 countries. `Country_Name` and `Country_Code` determine each other.

**Proposed.**

```js
chart(olympicMedals, {
  key: ["Country_Code", "Medal_Type"],
  schema: {
    Medal_Type: Unit({
      domain: Domain.discrete(["Gold", "Silver", "Bronze"]),
      traits: [Trait.ordered()],
    }),
    Count: { name: "Medals", unit: "medals", traits: [Trait.canSum()] },
  },
});
```

**Today (run).** `spread` by country, `stack` by medal type, `h: "Count"`, with `Medal_Type` ordered and `Count` summable: draws.

**Allows and rejects.** Every stack and spread of `Count` passes. A ribbon along `Medal_Type` would pass too, since it has an order, though the band between Gold and Silver means little. Order alone allows a connector. Whether a connector between ordered levels means something is not a type question.

**Where the vocabulary does not fit.** Nothing.

## `penguins`

`packages/gofish-graphics/src/data/penguins.ts`. Used by many stories: `Partition`, `MarginalHistogram`, `Croissant`, `Noise`, `Separate`, `Filter`, `ViolinPlot`, `EncloseShapes` and others.

344 rows:

```js
{ Species: "Adelie", Island: "Torgersen", "Beak Length (mm)": 39.1, "Beak Depth (mm)": 18.7, "Flipper Length (mm)": 181, "Body Mass (g)": 3750, Sex: "MALE" }
{ Species: "Adelie", Island: "Torgersen", "Beak Length (mm)": 39.5, "Beak Depth (mm)": 17.4, "Flipper Length (mm)": 186, "Body Mass (g)": 3800, Sex: "FEMALE" }
{ Species: "Chinstrap", Island: "Dream", "Beak Length (mm)": 42.4, "Beak Depth (mm)": 17.3, "Flipper Length (mm)": 181, "Body Mass (g)": 3600, Sex: "FEMALE" }
```

**Key (checked).** None. All seven columns together happen to be unique, but that is not a key. Two rows have every measurement null. `Sex` is null in 10 rows and `"."` in 1. `MarginalHistogram` makes its own key with `.map((d, i) => ({ ...d, id: i }))`.

**Proposed.**

```js
const mm = Unit("mm");

chart(penguins, {
  // no key: one row per penguin, with no id
  schema: {
    Species: Unit({
      domain: Domain.discrete(["Adelie", "Chinstrap", "Gentoo"]),
    }),
    Island: Unit({ domain: Domain.discrete(["Torgersen", "Biscoe", "Dream"]) }),
    // "." is a data error. Null is "not recorded".
    Sex: Unit({ domain: Domain.discrete(["MALE", "FEMALE"]) }),
    // Measurements of one penguin. Averaging is what anyone means; a sum of
    // beak lengths is a valid number that nobody wants.
    "Beak Length (mm)": { unit: mm, traits: [Trait.canAverage()] },
    "Beak Depth (mm)": { unit: mm, traits: [Trait.canAverage()] },
    "Flipper Length (mm)": { unit: mm, traits: [Trait.canAverage()] },
    // Mass both sums (the mass of a group) and averages. Which is the default?
    "Body Mass (g)": {
      unit: "g",
      traits: [Trait.canAverage(), Trait.canSum()],
    },
  },
});
```

**Today (run).**

- `Filter`'s scatter (`Flipper Length` against `Beak Length`), with `Sex` declared as `["MALE", "FEMALE"]` and colored by `Sex`: draws. The stray values are not checked, because `fill` does not use the levels.
- `spread({ by: "Sex" })` with the same declaration: throws "column "Sex" has values outside its levels: undefined, "."... add them to the levels, filter those rows out". The error is right. It prints the nulls as `undefined`.
- A bar of `Body Mass (g)` per species with no fold, `g` not summable: throws, suggesting `field("Body Mass (g)").mean()`. Here the advice is right.

**Allows and rejects.**

- The `Partition` histograms count rows per bin (`field(...).count()`). A count sums over every key. Passes.
- `Noise`, `Separate`, `Filter` and `MarginalHistogram` place one dot per row. No fold. Pass.

**Where the vocabulary does not fit.**

- No key (gap 3). The proposal's static rule needs one. With an implicit row key every check would work.
- **Both folds hold.** A measurement of an individual is "per penguin", so the mean (weighted by one per row) is valid, and so is the sum. The proposal does not say which one a size channel elaborates to when both traits are present. For beak lengths I left out `canSum`, which turns the declaration into a statement of intent, not of physics. That is a real choice the proposal should name.
- Missing data: `Sex` has two kinds of missing (null and `"."`), and measurements have nulls. The proposal says a null key should be either an unlabeled group or dropped, consistently. It says nothing about a null value inside a fold.

## `seattleWeather`

`packages/gofish-graphics/src/data/seatle-weather.ts`. Used by the `Bin` stories, `RidgelineChart`, `Croissant` and the build-in animations.

1,461 rows:

```js
{ date: "2012-01-01T00:00:00.000Z", precipitation: 0, temp_max: 12.8, temp_min: 5, wind: 4.7, weather: "drizzle" }
{ date: "2012-01-02T00:00:00.000Z", precipitation: 10.9, temp_max: 10.6, temp_min: 2.8, wind: 4.5, weather: "rain" }
{ date: "2013-12-31T00:00:00.000Z", precipitation: 0.5, temp_max: 8.3, temp_min: 5, wind: 1.7, weather: "rain" }
```

**Key (checked).** `date` is unique, every day of 2012 to 2015. Dates are ISO strings, and all parse.

**Proposed.**

```js
// No HasZero: 0 °C is not "no temperature". The proposal has no spelling for
// this yet (#1051), so the comment carries it.
const Celsius = Unit("°C");

chart(seattleWeather, {
  key: ["date"],
  schema: {
    date: Unit.time(),
    // Rain during the day: a flow. Adds over days, so a month's total is valid.
    precipitation: { unit: "mm", traits: [Trait.canSum()] },
    // The day's high and low. Average them. A mean of daily highs is fine; the
    // month's highest high is `.max()`, which is a different question.
    temp_max: {
      name: "Max temperature",
      unit: Celsius,
      traits: [Trait.canAverage()],
    },
    temp_min: {
      name: "Min temperature",
      unit: Celsius,
      traits: [Trait.canAverage()],
    },
    // The day's mean wind speed.
    wind: { name: "Wind speed", unit: "m/s", traits: [Trait.canAverage()] },
    // A label. The stories sort it sunniest first, which is the story's order,
    // not the data's.
    weather: Unit({
      domain: Domain.discrete(["drizzle", "rain", "sun", "snow", "fog"]),
    }),
  },
});
```

**Today (run).** `date: Unit.time()`, `precipitation` in `Unit("mm", { traits: [Trait.summable()] })`, temperatures in `Unit("°C")`, `wind` in `Unit("m/s")`, `weather` discrete:

- `SeasonalPrecipitation` (`spread` by month of year, `h: field("precipitation").mean()`): draws.
- `WeekdayTemperature` (`spread` by weekday, `h: field("temp_max").mean()`): draws.
- The same with `h: "temp_max"` and no fold: throws "...in the unit "°C", which cannot be summed: it has no CanSum... average them instead, e.g. field("temp_max").mean()". Following that advice gives the `WeekdayTemperature` story, which is still a bar from 0 °C.
- Monthly totals (`spread` by year and month, `h: "precipitation"`): draws.

**Allows and rejects.**

- **`WeekdayTemperature` (gallery) is rejected by the `HasZero` rule.** Its bars measure from 0 °C, so a 15 °C day looks half as hot as a 30 °C day. This is the proposal's `temp` row in section 1, found in a real gallery story. The rejection is right. Today's error is the one that leads the user to write it.
- The "Seattle Rain by Month" stories sum `precipitation` within each month. Valid.
- "Seattle Rain on a Time Axis" draws monthly totals on true month widths. The section 9 lint applies.
- `CalendarHeatmap` colors by `temp_max.mean()` of one day. One row per cell, no fold. Passes. A diverging palette would center on 0 °C only if °C had a midpoint, which it does not.

**Where the vocabulary does not fit.**

- `temp_max` and `temp_min` are two columns of one quantity (gap 7). An `unpivot` would make them a `bound` key with levels `max` and `min`. They should not be stacked.
- `wind` with no weight means equal days, which is right here, since every row is one day.

## `streamgraphData`

`packages/gofish-graphics/src/data/streamgraphData.ts`. Synthetic. Used by Area `Layered` and two tests.

50 rows:

```js
{ x: 0, y: 28, c: 0 }
{ x: 0, y: 20, c: 1 }
{ x: 5, y: 31, c: 2 }
```

**Key (checked).** `x`, `c` is unique: 10 x values times 5 series.

**Proposed.**

```js
chart(streamgraphData, {
  key: ["x", "c"],
  schema: {
    x: { traits: [Trait.ordered()] }, // a number used as an ordered key
    // A series id written as a number. No order, no sum.
    c: Unit({ domain: Domain.discrete([0, 1, 2, 3, 4]) }),
    y: { traits: [Trait.canSum()] },
  },
});
```

**Today (run).** `c: Unit({ domain: Domain.discrete([0, 1, 2, 3, 4]) })`, with Area `Layered`'s flow (`spread` by `x`, `group` by `c`, `ribbon({ h: "y", fill: "c" })`): draws.

**Allows and rejects.** The ribbons run along `x`, a number, so they pass if numbers have an order. Declaring `c` discrete makes its color categorical, which is right.

**Where the vocabulary does not fit.** A category written as a number, and an ordered key written as a number (gap 1). `x` has no unit and no meaning beyond its order.

## `titanic`

`packages/gofish-graphics/src/data/titanic.ts`. Used by `IcicleChart`, `NestedWaffleChart`, `SankeyTree` and `NestedMosaicChart`.

16 rows:

```js
{ class: "First", sex: "Female", survived: "Yes", count: 141 }
{ class: "First", sex: "Male", survived: "Yes", count: 62 }
{ class: "First", sex: "Female", survived: "No", count: 4 }
```

**Key (checked).** `class`, `sex`, `survived` is unique, a full 4 by 2 by 2 grid. Counts total 2,201, which includes the crew.

**Proposed.**

```js
chart(titanic, {
  key: ["class", "sex", "survived"],
  schema: {
    // First, Second and Third are ordered. Crew is not part of that order.
    class: Unit({
      domain: Domain.discrete(["First", "Second", "Third", "Crew"]),
    }),
    sex: Unit({ domain: Domain.discrete(["Female", "Male"]) }),
    survived: Unit({ domain: Domain.discrete(["Yes", "No"]) }),
    // People: each person is in one cell. Adds over every key.
    count: { name: "People", unit: "people", traits: [Trait.canSum()] },
  },
});
```

**Today (run).** With `count` in `Unit("people", { traits: [Trait.summable()] })`, the `NestedMosaicChart` flow (three nested stacks, each `size: field("count").normalize()`): draws.

**Allows and rejects.**

- `count` sums over every key, so every stack and normalize passes the value rule.
- `NestedMosaicChart` is a stack inside a stack. Read literally, the proposal's stack rule rejects it. It should not (see the summary).
- `IcicleChart`, `NestedWaffleChart` and `SankeyTree` use the low-level combinators with `_.sumBy` by hand. No schema reaches them.

**Where the vocabulary does not fit.**

- **Already aggregated.** This is the proposal's open case "a table that is already aggregated, with no entity column". Here it works, because the cells are disjoint and `count` is a count of people. It would fail for a column such as "number of families", where a family can span cells.
- **A partial order** (gap 10). Declaring `class` ordered would put Crew after Third, which says crew rank below third class.

## `titanicPassengers`

`packages/gofish-graphics/src/data/titanicPassengers.ts`, parsed from `titanicPassengers.json`. Used by the `atom` stories (`Mosaic`, `UnitHistogram`, `Violin`, `TitanicFacet` and others) and `Labels`.

1,309 rows after parsing:

```js
{ survived: 1, pclass: 1, sex: "female", fare: 211.3375, class: "First", alive: "yes", age: "29" }
{ survived: 1, pclass: 1, sex: "male", fare: 151.55, class: "First", alive: "yes", age: "0.9167" }
{ survived: 0, pclass: 3, sex: "male", fare: 7.225, class: "Third", alive: "no", age: "20" }
```

**Key (checked).** None after parsing: 221 rows are exact copies of another row. The raw JSON has `name` and `ticket`, and `name`, `ticket` is unique there (`name` alone repeats twice). The parser drops both. `pclass` and `class` say the same thing, and so do `survived` and `alive` (checked). `age` is a string, missing in 263 rows.

**Proposed.** On the raw file, since the parsed rows have lost the key:

```js
chart(titanicRaw, {
  key: ["name", "ticket"],
  schema: {
    pclass: Unit({
      domain: Domain.discrete([1, 2, 3]),
      traits: [Trait.ordered()],
    }),
    sex: Unit({ domain: Domain.discrete(["female", "male"]) }),
    survived: Unit({ domain: Domain.discrete([0, 1]) }),
    // Years. Averages. Stored as text, with "" for missing.
    age: { unit: "years", traits: [Trait.canAverage()] },
    // The price of the whole ticket, repeated on every passenger who shared
    // it. It adds over tickets, not over passengers.
    fare: { unit: "GBP", traits: [Trait.canSum({ over: "ticket" })] },
  },
});
```

**Today (not run).** The parsed rows have no `ticket`, so today's `fare: Unit("GBP", { traits: [Trait.summable()] })` would sum per passenger with no error.

**Allows and rejects.**

- The atom stories count passengers. `Mosaic` adds `count: 1` to each row and stacks it. A count sums over every key. Passes.
- **A sum of `fare` per class would double count.** 216 tickets cover 596 passengers, and in 215 of those every passenger shows the same fare. Summed over passengers, fares total 43,550. Summed over tickets, 19,303. The proposal's `canSum({ over: "ticket" })` says exactly this, and the row check would catch it, but only on the raw file.

**Where the vocabulary does not fit.**

- The data preparation removed the key that the type needs (gaps 2 and 3). No declaration on the parsed rows can repair that.
- `fare` mixes real fares with a made-up stand-in for the one missing fare (`TIER_FARE`). A column with imputed values has no marker.
- `age` is a number stored as text with missing values. `pclass` and `survived` are categories stored as numbers (gap 1).

## `world110m`

`packages/gofish-graphics/src/data/world110m.ts`. Used as the basemap in the `BirdMigration` stories.

287 rows:

```js
{ id: "4", ring: [[61.21, 35.65], [62.23, 35.27], ...] }   // 69 points
{ id: "24", ring: [[16.33, -5.88], ...] }                   // 66 points
{ id: "380", ring: [...] }                                   // 10 points
```

**Key (checked).** None. `id` repeats for 30 of 175 countries, since a country with islands has several rings. The row's position in the list is its only identity.

**Proposed.** The vocabulary has nothing for the `ring` column. The best it can say:

```js
chart(world110m, {
  // no key: one row per ring
  schema: {
    // ISO 3166-1 numeric code, as text. An id: no order, no sum.
    id: Unit({ domain: Domain.discrete(isoCodes) }),
    // ring: a closed list of [lon, lat] points in degrees. Not a column type.
  },
});
```

**Today (not run).** The story declares nothing. `polygon({ points: "ring" })` reads the column, and `Coord.geo` knows the axes are degrees.

**Allows and rejects.** Nothing applies. The story draws one polygon per row.

**Where the vocabulary does not fit.** A geometry column (gap 8). Areas of these rings are not the countries' areas unless the projection is equal-area, which the proposal's `Coord.geo` lint already covers. Holes are emitted as rings, a declared shortcut in the data file.
