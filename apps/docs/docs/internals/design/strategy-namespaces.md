---
title: "One Namespace per Strategy Family"
section: Speculative Notes
order: 66
status: speculative
---

# One namespace per strategy family

> **Status: design proposal (2026-10-03).** Nothing here is implemented. The direction and
> four syntax decisions were signed off on 2026-10-03 (see [Decided](#_5-decided)); a few
> questions remain open. Related:
> [#1003](https://github.com/gofish-graphics/gofish-graphics/pull/1003) (scatter `overlap`
> strategies) and [#1005](https://github.com/gofish-graphics/gofish-graphics/pull/1005)
> (treemap `tile` strategies), both draft.

## The proposal in brief

Many GoFish options take a **strategy**: one choice from a set of named ways to do a job,
made by a function call so that it can take its own arguments. For example,
`scatter({ overlap: separate({ padding: 1 }) })` picks the `separate` way of keeping dots
apart, with one pixel of padding.

We like the function form. It is modular, and adding an argument later does not break
anyone. The trouble is where the functions live. Today every strategy is a top-level export,
next to `chart`, `rect`, and `spread`. That causes three problems:

1. **Autocomplete is crowded.** Typing `gf.` lists `separate`, `jitter`, `squarify`, `dice`,
   `bezier`, and `circles` alongside the marks and operators, with nothing to say which
   option each one belongs to.
2. **Names collide.** A strategy name has to be unique across the whole library. `slice`
   shadows a Python built-in, and `linear` is both a coordinate transform and a curve.
3. **Nothing ties a strategy to its option.** A reader who sees `bezier()` has to know it
   belongs to the `curve` option.

Swift solves this with leading-dot syntax: you write `curve: .monotone`, and the compiler
looks up `monotone` on the option's type, `Curve`. JavaScript and Python have nothing like
it, so we write Swift's long form, the type-qualified name, by hand. The proposal:

- **Each strategy family gets one namespace, with a capitalized name.** A namespace here
  means a module whose members you reach with a dot, such as `Overlap.separate`. The name
  usually matches the option key.
- The function form stays. Only where the function lives changes.

```ts
scatter({ x: "mass", overlap: Overlap.separate({ padding: 1 }) });
line({ curve: Curve.monotone() });
treemap({ tile: Tile.squarify() });
chart(data, { coord: Coord.polar(), color: Color.palette("tableau10") });
```

```python
scatter(x="mass", overlap=Overlap.separate(padding=1))
```

A reader who would rather not write the namespace can import the member straight from the
family's module:

```ts
import { separate } from "gofish-graphics/overlap";
scatter({ x: "mass", overlap: separate({ padding: 1 }) });
```

```python
from gofish.overlap import separate
scatter(x="mass", overlap=separate(padding=1))
```

This is not a second way to reach the function. There is one module per family, with a
lowercase file name (`overlap`). The capitalized name `Overlap` is that same module, bound
under another name, so `gf.Overlap.separate` and the imported `separate` are the same
function, reached through the same module. Strategies are **not** also exported at the top
level. There is one home per strategy.

The rest of this note catalogs every option that fits, surveys how other libraries handle
the same problem, works through the details (when a family exists, naming, packaging, the
IR, docs, migration), and ends with a full before and after table, the decisions made so
far, and the questions still open.

## 1. Catalog

The search covered `packages/gofish-graphics/src`, `packages/gofish-python/gofish`, and
the descriptor table in `packages/gofish-ir/src/frontend/descriptors.ts`. Two families are
still on unmerged branches:

- **`overlap`** is in draft PR #1003, with `separate()` and `jitter()`.
- **`tile`** is in draft PR #1005. On `main`, `tile` is still a string (`"squarify"`,
  `"slicedice"`, `"squarifyCircle"`, ...). This note uses the PR's spelling.
- Python names follow draft PR #1008 (snake_case everywhere), which turns the treemap's
  `sliceDice` into `slice_dice` and leaves the wire keys alone.

### Families: options whose value is chosen from a set of strategies

| Option key                | Owner                                                  | JS today                                                                                                                                                                        | Python today                                                        | IR shape                                                                       | Form                              |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| `overlap`                 | `scatter`                                              | `separate({ padding })`, `jitter({ randomness, smoothing, padding, seed })`                                                                                                     | `separate(padding=)`, `jitter(...)`                                 | `{ kind: "separate" \| "jitter", ... }`                                        | function (unmerged, #1003)        |
| `tile`                    | `treemap`                                              | `squarify({ ratio })`, `slice()`, `dice()`, `binary()`, `sliceDice()`                                                                                                           | `squarify(ratio=)`, `slice()`, `dice()`, `binary()`, `slice_dice()` | `{ kind: "squarify" \| "slice" \| "dice" \| "binary" \| "sliceDice", ratio? }` | function (unmerged, #1005)        |
| `curve`                   | `line`, `ribbon`, `time.transition`, `animation.tween` | strings `"linear"`, `"step"`, `"monotone"`, `"smooth"`, `"catmullRom"`, `"auto"`; calls `bezier()`, `orthogonal({ bend })`, `arc({ direction })`, `perfectArrows({ bow, ... })` | strings only; the calls can be passed as raw dicts                  | a string, or `{ type: "bezier" \| ..., options? }`                             | mixed strings and functions       |
| `method`                  | `interpolate()`                                        | the data-space subset of `curve`: `"step"`, `"linear"`, `"monotone"`, `"smooth"`                                                                                                | not exposed                                                         | not serialized                                                                 | string                            |
| `coord`                   | chart options, `layer` options                         | `polar(opts)`, `clock(opts)`, `wavy()`, `bipolar(d)`, `arcLengthPolar()`, `linear()`, `geo(projection, opts)`                                                                   | `polar(...)`, `clock(...)`, `wavy()`                                | `{ type: "polar" \| "clock" \| "wavy", ...opts }`                              | function                          |
| `color`                   | chart options                                          | `palette(values)`, `gradient(stops)`                                                                                                                                            | `palette(values)`, `gradient(stops)`                                | `{ _tag: "palette", values }`, `{ _tag: "gradient", stops }`                   | function                          |
| `enter`, `exit`, `update` | `.transition()`                                        | `animation.grow()`, `animation.fadeIn()`, `animation.wipe({ from })`, `animation.tween({ curve, ease })`, ...                                                                   | not exposed (JS only)                                               | not serialized                                                                 | function, **already a namespace** |

One more option looks like a family but is not one:

| Option key | Owner  | JS today    | Python today | IR shape              | Why it is not a family                                                                     |
| ---------- | ------ | ----------- | ------------ | --------------------- | ------------------------------------------------------------------------------------------ |
| `method`   | `pack` | `circles()` | `circles()`  | `{ kind: "circles" }` | It has one strategy and no alternative, so there is nothing to choose. It is removed (§3). |

Several namespaces already exist, though their members are operators, constraints, or
helpers, not option values: `time.*` (`time.sequence`, `time.stagger`, ...),
`Constraint.*` (`Constraint.align`, ...), `Schema.*`, and `Serialize.*`, which `lib.ts`
already exports as `export * as Serialize from "./serialize"`, the same mechanism this note
proposes. The dotted form is already at home in GoFish.

### Closed string sets: options that stay strings

These options also pick from a fixed set, but no member takes arguments, and none is likely
to. They stay plain strings. In TypeScript, a string literal union (a type such as
`"start" | "middle" | "end"`) already gives you autocomplete at the option itself, which is
the closest thing JavaScript has to Swift's leading dot. Python IDEs do the same for
`Literal[...]` types.

| Option          | Owner                                               | Values                                                                           |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `alignment`     | `spread`, `stack`, `scatter`                        | `"start"`, `"middle"`, `"end"`, `"baseline"`                                     |
| `anchor`        | `spread`, `stack`                                   | `"edge"`, `"start"`, `"middle"`, `"end"`, `"baseline"`                           |
| `dir`           | `spread`, `stack`, `line`, `ribbon`                 | `"x"`, `"y"`, or an axis name                                                    |
| `sort`          | `treemap`                                           | `"asc"`, `"desc"`, `"none"`                                                      |
| `textAnchor`    | `text`                                              | `"start"`, `"middle"`, `"end"`                                                   |
| `mixBlendMode`  | `line`, `ribbon`                                    | `"normal"`, `"multiply"`                                                         |
| `blendMode`     | `over`, `intersect`, `exclude`, `subtract`, `paint` | `"color"`, `"multiply"`, `"screen"`, `"overlay"`, `"luminosity"`                 |
| `position`      | `.label()`                                          | `"center"`, `"outset"`, `"inset-top"`, ... (a small grammar of hyphenated words) |
| `labelAngle`    | axis options                                        | a number, numbers per tier, or `"auto"`                                          |
| `randomness`    | inside `Overlap.jitter()`                           | `"blue"`, `"quasi"`, `"uniform"`                                                 |
| `ease`          | effects, `time.transition`                          | `"linear"`, `"cubicInOut"`, ..., or a function `u => u'`                         |
| `from`, `shape` | `animation.wipe()`, `time.stagger()`                | sides and orders                                                                 |
| scheme name     | inside `palette()` and `gradient()`                 | `"tableau10"`, `"viridis"`, `"blues"`, `"reds"`                                  |
| `projection`    | `geo()` (a positional argument, not an option key)  | `"equalEarth"`, `"mercator"`, or a function                                      |

`projection` is the one to watch. Real map projections take arguments (a rotation, standard
parallels), so if GoFish grows them, `projection` becomes a family.

## 2. Precedent

| Library                                                                                                                                                                                                                                                                                    | How strategies are organized                                                                                                                                                                                                                                      | What autocomplete shows                                               | Cost                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Swift** ([implicit member expressions](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Implicit-Member-Expression); [SE-0299](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0299-extend-generic-static-member-lookup.md)) | You write `.monotone` where the compiler knows the expected type, and it looks the name up on that type. `.monotone` is short for `Curve.monotone`. SwiftUI uses this everywhere: `.toggleStyle(.switch)`.                                                        | Exactly the members that fit the parameter.                           | Needs a static type checker at the call site. JavaScript and Python cannot do it.                                                                   |
| **ggplot2 / plotnine** ([position_jitter](https://ggplot2.tidyverse.org/reference/position_jitter.html); [plotnine reference](https://plotnine.org/reference/))                                                                                                                            | Flat names with a family prefix: `position_jitter()`, `position_dodge()`, `scale_color_viridis_c()`, `coord_polar()`.                                                                                                                                             | Typing `position_` lists the family. Typing nothing lists everything. | Long names, still all in one flat namespace. The prefix is a namespace by convention only.                                                          |
| **d3** ([d3-shape curves](https://d3js.org/d3-shape/curve); [d3-hierarchy treemap](https://d3js.org/d3-hierarchy/treemap); [d3-scale-chromatic](https://d3js.org/d3-scale-chromatic))                                                                                                      | Flat camelCase names with a prefix: `curveMonotoneX`, `treemapSquarify`, `interpolateViridis`. Arguments are methods on the strategy: `curveCatmullRom.alpha(0.5)`, `treemapSquarify.ratio(2)`. The prefix also matches the package (`d3-shape`, `d3-hierarchy`). | `d3.` lists hundreds of names. `d3.curve` narrows to the family.      | Same as ggplot2. The package split helps people who import from `d3-shape` directly.                                                                |
| **Observable Plot** ([curves](https://observablehq.com/plot/features/curves); [dodge](https://observablehq.com/plot/transforms/dodge))                                                                                                                                                     | One capitalized namespace, `Plot.*`, holds marks, transforms, and helpers. Curves are strings (`curve: "monotone-x"`), or a d3 curve function for anything custom. Overlap is a transform, `Plot.dodgeY(...)`.                                                    | `Plot.` lists everything. Inside `curve: "`, the strings.             | Strings cannot take arguments, so tension and similar settings live on separate options (`tension`).                                                |
| **Altair** ([line marks](https://altair-viz.github.io/user_guide/marks/line.html))                                                                                                                                                                                                         | Everything is on `alt.*`. Strategies are strings inherited from Vega-Lite: `mark_line(interpolate="monotone")`, `alt.Scale(scheme="viridis")`.                                                                                                                    | `alt.` lists hundreds of classes.                                     | Same as Plot.                                                                                                                                       |
| **Vega-Lite, Plotly** ([Plotly `line_shape`](https://plotly.com/python-api-reference/generated/plotly.express.line.html))                                                                                                                                                                  | Strings: `"interpolate": "monotone"`, `line_shape="spline"`.                                                                                                                                                                                                      | The JSON schema or docstring lists the strings.                       | No arguments per strategy. Extra settings become sibling options.                                                                                   |
| **Polars** ([string namespace](https://docs.pola.rs/api/python/stable/reference/expressions/string.html))                                                                                                                                                                                  | Methods grouped by data type under an attribute: `pl.col("a").str.to_uppercase()`, `.dt.year()`.                                                                                                                                                                  | After `.str.`, only string methods.                                   | One more dot. The namespace hangs off a value, not off a module, but the motivation is the same: a large API, grouped so autocomplete stays useful. |
| **Bokeh** ([`bokeh.transform`](https://docs.bokeh.org/en/latest/docs/reference/transform.html))                                                                                                                                                                                            | Helper functions in a submodule: `from bokeh.transform import jitter, dodge`, then `x=jitter("x", width=0.1)`.                                                                                                                                                    | The submodule lists its helpers.                                      | The submodule is a broad category ("transform"), not one per option.                                                                                |
| **matplotlib** ([`patches`](https://matplotlib.org/stable/api/patches_api.html); [`ConnectionStyle`](https://matplotlib.org/stable/api/_as_gen/matplotlib.patches.ConnectionStyle.html))                                                                                                   | Submodules (`matplotlib.patches as mpatches`). For arrows, one capitalized class per option, named after the option: `FancyArrowPatch(connectionstyle=ConnectionStyle.Arc3(rad=0.2), arrowstyle=ArrowStyle.Fancy(...))`.                                          | `ConnectionStyle.` lists the connection styles.                       | The same styles can also be written as strings (`"arc3,rad=0.2"`), so there are two spellings.                                                      |
| **JavaScript built-ins** (`Math`, `Intl`)                                                                                                                                                                                                                                                  | Groups of related functions on a capitalized object: `Math.max()`, `Intl.NumberFormat(...)`.                                                                                                                                                                      | `Math.` lists only math functions.                                    | None worth naming. Every JavaScript programmer already reads a capitalized name followed by a dot as a group of functions.                          |
| **TypeScript string literal unions** ([literal types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types))                                                                                                                                                   | `alignment: "start" \| "middle" \| "end"`.                                                                                                                                                                                                                        | Inside the quotes, only the allowed strings.                          | No arguments.                                                                                                                                       |

Four things stand out.

- **Prefix naming** (ggplot2, d3) is the common answer, and it is a namespace in all but
  name. It groups the family for autocomplete but keeps the flat export list and makes
  names long. `Overlap.separate` is the same idea with a real dot instead of an underscore.
- **matplotlib's style classes** are the closest match to this proposal: a capitalized
  namespace named after the option it fills (`connectionstyle=ConnectionStyle.Arc3(...)`).
  Its cost is the second, string spelling, which this proposal does not copy.
- **Strings** (Plot, Altair, Vega-Lite, Plotly) are the simplest and give good
  autocomplete in TypeScript, but they cannot take arguments. That is exactly the line this
  note draws between a family and a closed string set.
- **d3 treats a curve as a value that can be configured.** `d3.curveMonotoneX` is used bare,
  and `d3.curveCardinal.tension(0.5)` is the same kind of value with a setting changed. So in
  d3 some curves are written with a call and some without. GoFish chooses calls for every
  strategy instead (see §3), so nobody has to remember which ones need parentheses.

## 3. Details

### When does an option get a family?

Count the strategies an option can choose from.

- **One strategy.** There is nothing to choose, so there is no option. Any settings the
  strategy would take live on the owner itself. This is the case for `pack` today.
- **Two or more, and at least one takes arguments.** The option is a family. Every member
  is a function call in the family's namespace.
- **Two or more, and none takes arguments (and none is likely to).** The option is a
  closed string set and stays a string.

Checked against the families in §1: `overlap` (two strategies, both take arguments), `tile`
(five, `squarify` takes `ratio`), `curve` (nine, several take arguments), `coord` (seven,
most take arguments), and `color` (two, both take arguments) all stay families. Only `pack`
is affected.

**One option has one spelling.** If any member of an option needs a function call, every
member is a function call. Today `curve` mixes the two: `curve: "monotone"` beside
`curve: arc({ direction: "up" })`. Under this rule the whole option moves to calls:
`Curve.monotone()` and `Curve.arc({ direction: "up" })`. We do not follow d3 in allowing a
bare `Curve.monotone` beside a called `Curve.arc(...)`. Accepting both a bare and a called
form would be two spellings of one thing, and calls everywhere mean nobody has to remember
which strategies need parentheses.

A string set inside a strategy is fine, as `randomness: "quasi"` inside
`Overlap.jitter()` is: the string picks a variant of one strategy, and it takes no
arguments of its own.

A function value such as a custom `ease` (`u => u * u`) is an escape hatch for code the
library cannot know, not a member of a set. It is allowed beside a closed string set, as
d3 and Plot allow a custom curve function beside their named ones.

### `pack` has no strategy option for now

`pack({ method: circles() })` offers one strategy, so under the rule above it has no
option. The `method` key, `circles()`, and the `PackMethod` type are removed, and `pack`
always packs enclosing circles. `circles()` takes no arguments today, so nothing has to move.

Settings for the packing go on `pack` itself. The first one asked for is a gap between
circles, filed as [#973](https://github.com/gofish-graphics/gofish-graphics/issues/973)
under the title "pack: circles({ padding })". Under this decision it becomes an option on
`pack`, and the note on [#967](https://github.com/gofish-graphics/gofish-graphics/issues/967)
already says it should be called `spacing`, the word `spread` and (after #1005) `treemap`
use for the gap between children. `pack` has no gap option yet.

When a second packing strategy arrives, `pack` gains a key whose value is chosen from a
`Packing` family, for example `pack({ method: Packing.circles() })`. The key name is open
(§6).

### Naming

**The namespace has a capitalized name.** There are four reasons.

1. **It is Swift's long form.** In Swift, `.monotone` is shorthand for the type-qualified
   name `Curve.monotone`. Writing `Curve.monotone()` is that long form, with the family
   name capitalized as a Swift type name is.
2. **JavaScript has the same convention.** `Math`, `Intl`, and Observable's `Plot` are
   capitalized names that hold a group of functions. GoFish already does the same with
   `Constraint`, `Schema`, and `Serialize`.
3. **In Python, a CapWords name reads as a type or an enum,** which is what a family is.
   PEP 8 asks for lowercase module names, but that rule is about the module's file name.
   The module file stays lowercase (`gofish/curve.py`); only the name the package binds it
   to is capitalized.
4. **It removes the collisions a lowercase name would cause.** A lowercase `coord`
   namespace would collide with the low-level `coord({ transform }, children)` combinator,
   and a lowercase `color` namespace with `color`, the exported object of named colors
   (`color.red`, ...). `Coord` and `Color` do not, so both of those keep their names.

**The name usually matches the option key, but does not have to.** Because the namespace
is capitalized, it is no longer the key itself, so a family can serve keys with other names.
`interpolate()` takes `method: "monotone"` from the curve set; it becomes
`method: Curve.monotone()` with no rename. `.transition()` takes effects under `enter`,
`exit`, and `update`, all from one family.

**A family name frees its member names.** `linear` can be both `Coord.linear()` and
`Curve.linear()`. `Tile.slice()` also removes a Python problem in #1005, where
`from gofish import *` would hide the built-in `slice`.

**The known cost.** CLAUDE.md still describes a "v2" API in which capitalized names are
components: `Rect()`, `Stack()`, `Spread()`. If that API is still in use, a capital letter
would mean two things: a component you call to make a mark, and a family you reach into
with a dot. As of today `lib.ts` no longer exports those capitalized names (the comment
above its operator exports says the node-level `Spread`, `Layer`, and so on are internal,
per #146), so the clash may already be gone. See §6.

### Closed string sets inside and outside strategies

Nothing changes for closed string sets. They keep autocomplete through their types and need
no import at all. A string set can later become a family if a member grows an argument, and
the rule above says when: the whole option moves at once.

### JavaScript packaging

Today `gofish-graphics` has a single entry point. `package.json` has
`"exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`, and
`vite.config.ts` builds one library entry, `src/lib.ts`.

Each family becomes one source module with a lowercase file name that holds the family's
public factories and their types, for example `src/families/curve.ts` exporting
`monotone`, `bezier`, `arc`, and so on. The operators and marks import their strategies from
there. That module is the single source. Then:

1. **The namespace on `gf`.** `src/lib.ts` gains `export * as Curve from
"./families/curve";` and loses the flat `export { bezier, orthogonal, arc, perfectArrows }`.
   An `export * as` namespace is the module itself, so `gf.Curve.monotone` and the subpath
   import are the same function. `Serialize` is already exported this way.
2. **The subpath.** `package.json` gains one `exports` entry per family, under the
   lowercase file name:
   `"./curve": { "types": "./dist/families/curve.d.ts", "import": "./dist/curve.js" }`.
3. **The build.** Vite 6, which the package uses, accepts several library entries:
   `lib.entry: { index: "src/lib.ts", curve: "src/families/curve.ts", ... }`. Rollup
   puts code the entries share in a common chunk, so the family module is loaded once
   whichever path a user takes. The type declarations are already emitted per file by
   `vite-plugin-dts`, so `dist/families/curve.d.ts` comes for free.

**Tree-shaking.** Tree-shaking is a bundler removing code a program never uses. Bundlers
handle `export * as` namespaces well, because every member access is visible in the source.
The existing `animation` namespace is a plain object literal
(`export const animation = { grow, ... }`), which bundlers are less able to trim (see §6
for its name).

**Costs.** Each family adds one entry to `exports` and one to the Vite config. A wildcard
export (`"./*"`) would avoid the list but would expose every file in `dist`. A short
explicit list, checked by a script against the family list, is better. TypeScript users on
the old `"moduleResolution": "node"` setting do not see `exports` subpaths; they would
still reach everything through `gf.Curve`. There is one more small cost: the subpath
`gofish-graphics/coord` is the `Coord` family, while the lowercase `coord` exported from
the package root is the combinator.

### Python packaging

Each family becomes a submodule with a lowercase file name: `gofish/curve.py` defines
`monotone`, `bezier`, `arc`, and so on. `gofish/__init__.py` binds it under the capitalized
name with `from . import curve as Curve` and lists `"Curve"` in `__all__`, in place of the
flat factories. Then `gofish.Curve.monotone`, `from gofish import Curve`, and
`from gofish.curve import monotone` all reach the same function, because Python loads a
module once.

Python also sets the lowercase `gofish.curve` as an attribute when the submodule is
imported. That is the same module under its file name, not a second namespace, and the docs
use only `Curve`.

Arguments stay keyword arguments, and member names are snake_case, as everywhere else in
the Python API: `Curve.catmull_rom()`, `Tile.slice_dice()`.

Today the Python strategy factories (`separate`, `jitter`, `squarify`, ...) are written by
hand in `ast.py`. The descriptor table already lists each family's members and their options
as a union of `{ kind, ... }` objects, so the generator that writes `_generated.py` could
write the family modules too. That is a natural follow-up, not a requirement.

### The IR

The IR mostly does not change. A strategy is still a plain object on the wire, and the
namespace exists only in the JS and Python surface: `Overlap.separate({ padding: 1 })` still
serializes to `{ kind: "separate", padding: 1 }`, and `Coord.polar()` to `{ type: "polar" }`.

There are two exceptions.

- **`curve`.** `Curve.monotone()` returns an object, so the wire form of the string members
  changes from `"monotone"` to `{ type: "monotone" }`. The descriptor entry, which today is
  `t.any`, becomes a proper union. Following the project's no-shims rule, the old string
  form is removed rather than kept beside the new one.
- **`pack`.** The `method` field is removed from the `pack` descriptor.

The descriptor table would benefit from knowing about families. Today a family is only
implicit: a field whose type is a union of objects tagged by `kind`. Shared families such as
`curve` repeat the same type on every field. A small addition, a table of named families
that fields point to (as `t.ref("AxesOptions")` already does for shared option shapes),
would let three things read from one source: the generated Python family modules, the docs
tables, and the check that every family has an `exports` entry.

The discriminating key differs between families today (`kind` for overlap and tile; `type`
for curve and coord; `_tag` for color). That is worth tidying one day but is separate from
this proposal.

### Docs

A family with one owner is documented on the owner's page, as `overlap` is on the
`scatter` page today. A shared family gets its own page: `Curve` on a new page, `Coord` on
the existing `js/api/coords` pages, `Color` on the existing `js/api/color` pages. Python
mirrors each under `python/api/`.

The `::: gofish-ref` tables render one construct's options from the descriptor table. With
named families in the table, `::: gofish-ref Overlap` could render one row per member with
its own arguments, and the owner's options table would show the option's type as a link,
`Overlap.*`, to that section.

Docs examples use the global `gf`, so they would read
`gf.scatter({ overlap: gf.Overlap.separate({ padding: 1 }) })`. That is the documented
form, consistent with every other call in the examples.

### Migration

Per project rules, there are no aliases and no shims: the flat exports are removed and
every call site moves. A rough count across `stories/`, `src/`, the Python package, and the
docs:

| Family                                  | Uses                               | Files    |
| --------------------------------------- | ---------------------------------- | -------- |
| `Coord`                                 | about 120                          | about 53 |
| `Curve` (strings)                       | about 88                           | about 30 |
| `Curve` (calls)                         | about 39                           | about 10 |
| `Color` (`palette`)                     | about 77                           | about 36 |
| `Color` (`gradient`)                    | about 57                           | about 22 |
| `pack`: delete `method` and `circles()` | about 23                           | about 12 |
| `Overlap`                               | about 17 files on the #1003 branch |          |
| `Tile`                                  | about 13 files on the #1005 branch |          |

For `pack`, the edit is a deletion: `method: circles()` is dropped from every call, along
with the `circles` export in JS and Python, the `PackMethod` type, and the descriptor field.
`circles()` takes no arguments, so no settings move. Issue #973 should be retitled to ask
for a `spacing` option on `pack`.

`animation.*` does not move unless §6 decides otherwise. The edits are mechanical, and the
renders should be pixel-identical except where the `curve` IR change touches serialized
snapshots.

A sensible order is the two unmerged families first (`Overlap` and `Tile`, while their PRs
are still open, so they never ship flat), then the `pack` deletion, then `Curve`, `Coord`,
and `Color`.

## 4. Before and after

Each pair of rows is one change: JS on top, Python below.

| Family    | Before                                                                                                       | After                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Overlap` | `scatter({ overlap: separate({ padding: 1 }) })`                                                             | `scatter({ overlap: Overlap.separate({ padding: 1 }) })`                                                                                   |
|           | `scatter(overlap=separate(padding=1))`                                                                       | `scatter(overlap=Overlap.separate(padding=1))`                                                                                             |
|           | `overlap: jitter({ randomness: "quasi" })`                                                                   | `overlap: Overlap.jitter({ randomness: "quasi" })`                                                                                         |
|           | `overlap=jitter(randomness="quasi")`                                                                         | `overlap=Overlap.jitter(randomness="quasi")`                                                                                               |
| `Tile`    | `treemap({ tile: squarify({ ratio: 1 }) })`                                                                  | `treemap({ tile: Tile.squarify({ ratio: 1 }) })`                                                                                           |
|           | `treemap(tile=squarify(ratio=1))`                                                                            | `treemap(tile=Tile.squarify(ratio=1))`                                                                                                     |
|           | `slice()`, `dice()`, `binary()`, `sliceDice()`                                                               | `Tile.slice()`, `Tile.dice()`, `Tile.binary()`, `Tile.sliceDice()`                                                                         |
|           | `slice()`, `dice()`, `binary()`, `slice_dice()`                                                              | `Tile.slice()`, `Tile.dice()`, `Tile.binary()`, `Tile.slice_dice()`                                                                        |
| `pack`    | `pack({ by: "group", method: circles() })`                                                                   | `pack({ by: "group" })` (no strategy option; see §3)                                                                                       |
|           | `pack(by="group", method=circles())`                                                                         | `pack(by="group")`                                                                                                                         |
| `Curve`   | `line({ curve: "monotone" })`                                                                                | `line({ curve: Curve.monotone() })`                                                                                                        |
|           | `line(curve="monotone")`                                                                                     | `line(curve=Curve.monotone())`                                                                                                             |
|           | `"linear"`, `"step"`, `"smooth"`, `"catmullRom"`                                                             | `Curve.linear()`, `Curve.step()`, `Curve.smooth()`, `Curve.catmullRom()`                                                                   |
|           | `"linear"`, `"step"`, `"smooth"`, `"catmullRom"`                                                             | `Curve.linear()`, `Curve.step()`, `Curve.smooth()`, `Curve.catmull_rom()`                                                                  |
|           | `curve: bezier()`, `orthogonal({ bend: "auto" })`, `arc({ direction: "up" })`, `perfectArrows({ bow: 0.3 })` | `Curve.bezier()`, `Curve.orthogonal({ bend: "auto" })`, `Curve.arc({ direction: "up" })`, `Curve.perfectArrows({ bow: 0.3 })`              |
|           | (raw dicts only)                                                                                             | `Curve.bezier()`, `Curve.orthogonal(bend="auto")`, `Curve.arc(direction="up")`, `Curve.perfect_arrows(bow=0.3)`                            |
|           | `time.transition({ curve: "linear" })`                                                                       | `time.transition({ curve: Curve.linear() })`                                                                                               |
|           | `interpolate(rows, { method: "monotone", ... })`                                                             | `interpolate(rows, { method: Curve.monotone(), ... })`                                                                                     |
| `Coord`   | `chart(data, { coord: polar() })`                                                                            | `chart(data, { coord: Coord.polar() })`                                                                                                    |
|           | `chart(data, coord=polar())`                                                                                 | `chart(data, coord=Coord.polar())`                                                                                                         |
|           | `clock()`, `wavy()`, `bipolar(100)`, `arcLengthPolar()`, `linear()`, `geo("equalEarth", { lon, lat })`       | `Coord.clock()`, `Coord.wavy()`, `Coord.bipolar(100)`, `Coord.arcLengthPolar()`, `Coord.linear()`, `Coord.geo("equalEarth", { lon, lat })` |
|           | `clock()`, `wavy()`                                                                                          | `Coord.clock()`, `Coord.wavy()`                                                                                                            |
| `Color`   | `chart(data, { color: palette("tableau10") })`                                                               | `chart(data, { color: Color.palette("tableau10") })`                                                                                       |
|           | `chart(data, color=palette("tableau10"))`                                                                    | `chart(data, color=Color.palette("tableau10"))`                                                                                            |
|           | `gradient(["#f7fbff", "#08519c"])`                                                                           | `Color.gradient(["#f7fbff", "#08519c"])`                                                                                                   |
|           | `gradient(["#f7fbff", "#08519c"])`                                                                           | `Color.gradient(["#f7fbff", "#08519c"])`                                                                                                   |
| effects   | `.transition({ enter: animation.grow() })`                                                                   | unchanged for now (JS only; see §6)                                                                                                        |

The closed string sets in section 1 do not change.

## 5. Decided

These were the open questions of the first draft. All four were decided on 2026-10-03.

1. **Capitalized namespaces.** `Overlap.separate()`, `Tile.squarify()`, `Curve.monotone()`,
   `Coord.polar()`, `Color.palette()`. The module file stays lowercase and is the single
   source; the capitalized name binds that same module. This settled the `coord` and
   `color` collisions, which the first draft asked about.
2. **`Curve` is calls only.** `Curve.monotone()`, never a bare string or a bare
   `Curve.monotone`. The string members change to objects in the IR.
3. **`pack` loses its strategy option** until a second packing strategy exists. Its
   settings live on `pack` itself. The later family is named `Packing`.
4. **A family exists only when there is a real choice:** at least two strategies, at least
   one of which takes arguments. This settled the one-member-family question.

## 6. Open questions

1. **Is the v2 API retired?** CLAUDE.md still describes capitalized components (`Rect()`,
   `Stack()`), and if they remain, a capital letter means two things. `lib.ts` no longer
   exports them (#146), so the answer may already be yes, in which case CLAUDE.md should
   drop the v2 section.
2. **The `pack` key, later.** When a second packing strategy arrives, is the key `method`
   or `strategy`? Both are generic, which suits a family whose future members we cannot
   predict.
3. **Lowercase `animation`.** The effects namespace is lowercase today
   (`animation.grow()`). Its members are option values for `enter`, `exit`, and `update`, so
   under this note it would be `Animation.grow()`, and it would become a module namespace
   with a `gofish-graphics/animation` subpath. Should it change now? (`time.*` holds
   operators, not option values, so this note does not touch it.)
4. **Type names.** `lib.ts` already exports a type called `Curve` (the union of curve
   values, in `routers.ts`). TypeScript allows a type and a namespace to share a name, but
   it is confusing. One option is for each family module to export its union type under the
   same short name, such as `Strategy`, so users write `Curve.Strategy` and
   `Overlap.Strategy`. Is that the right spelling?
