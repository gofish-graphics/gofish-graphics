---
title: "One Namespace per Strategy Family"
section: Speculative Notes
order: 66
status: speculative
---

# One namespace per strategy family

> **Status: design proposal (2026-10-03).** Nothing here is implemented. The direction was
> agreed in discussion on 2026-10-03; the exact syntax is not signed off. Related:
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
   shadows a Python built-in, `linear` is both a coordinate transform and a curve, and a
   packing strategy could not be called `pack` because the operator already is.
3. **Nothing ties a strategy to its option.** A reader who sees `circles()` has to know it
   belongs to `pack({ method })`.

Swift solves this with leading-dot syntax: you write `overlap: .separate()`, and the
compiler looks up `separate` on the option's type. JavaScript and Python have nothing like
it, so we spell the lookup out by hand. The proposal:

- **Each strategy family gets one namespace, named after the option key.** A namespace here
  means a module whose members you reach with a dot, such as `overlap.separate`.
- The function form stays. Only where the function lives changes.

```ts
scatter({ x: "mass", overlap: overlap.separate({ padding: 1 }) });
line({ curve: curve.monotone() });
treemap({ tile: tile.squarify() });
```

```python
scatter(x="mass", overlap=overlap.separate(padding=1))
```

`overlap: overlap.separate()` says "overlap" twice. A reader who minds can import the
member straight from the family's module:

```ts
import { separate } from "gofish-graphics/overlap";
scatter({ x: "mass", overlap: separate({ padding: 1 }) });
```

```python
from gofish.overlap import separate
scatter(x="mass", overlap=separate(padding=1))
```

This is not a second way to reach the function. `gf.overlap` **is** the module
`gofish-graphics/overlap`, so `gf.overlap.separate` and the imported `separate` are the same
function, reached through the same module. Strategies are **not** also exported at the top
level. There is one home per strategy.

The rest of this note catalogs every option that fits, surveys how other libraries handle
the same problem, works through the details (naming, packaging, the IR, docs, migration),
and ends with a full before and after table and a few open questions.

## 1. Catalog

The search covered `packages/gofish-graphics/src`, `packages/gofish-python/gofish`, and
the descriptor table in `packages/gofish-ir/src/frontend/descriptors.ts`. Two families are
still on unmerged branches, and one rename is newer than its branch:

- **`overlap`** is in draft PR #1003 (branch `swarm-overlap`). The pushed branch still
  spells the beeswarm `swarm()`. A newer local commit renames it to `separate()`, with IR
  kind `"separate"`. This note uses `separate`.
- **`tile`** is in draft PR #1005. On `main`, `tile` is still a string (`"squarify"`,
  `"slicedice"`, `"squarifyCircle"`, ...). This note uses the PR's spelling.
- Python names follow draft PR #1008 (snake_case everywhere), which turns the treemap's
  `sliceDice` into `slice_dice` and leaves the wire keys alone.

### Families: options whose value is chosen from a set of strategies

| Option key                | Owner                                                  | JS today                                                                                                                                                                        | Python today                                                        | IR shape                                                                       | Form                              |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| `overlap`                 | `scatter`                                              | `separate({ padding })`, `jitter({ randomness, smoothing, padding, seed })`                                                                                                     | `separate(padding=)`, `jitter(...)`                                 | `{ kind: "separate" \| "jitter", ... }`                                        | function (unmerged, #1003)        |
| `tile`                    | `treemap`                                              | `squarify({ ratio })`, `slice()`, `dice()`, `binary()`, `sliceDice()`                                                                                                           | `squarify(ratio=)`, `slice()`, `dice()`, `binary()`, `slice_dice()` | `{ kind: "squarify" \| "slice" \| "dice" \| "binary" \| "sliceDice", ratio? }` | function (unmerged, #1005)        |
| `method`                  | `pack`                                                 | `circles()`                                                                                                                                                                     | `circles()`                                                         | `{ kind: "circles" }`                                                          | function, one member              |
| `curve`                   | `line`, `ribbon`, `time.transition`, `animation.tween` | strings `"linear"`, `"step"`, `"monotone"`, `"smooth"`, `"catmullRom"`, `"auto"`; calls `bezier()`, `orthogonal({ bend })`, `arc({ direction })`, `perfectArrows({ bow, ... })` | strings only; the calls can be passed as raw dicts                  | a string, or `{ type: "bezier" \| ..., options? }`                             | mixed strings and functions       |
| `method`                  | `interpolate()`                                        | the data-space subset of `curve`: `"step"`, `"linear"`, `"monotone"`, `"smooth"`                                                                                                | not exposed                                                         | not serialized                                                                 | string                            |
| `coord`                   | chart options, `layer` options                         | `polar(opts)`, `clock(opts)`, `wavy()`, `bipolar(d)`, `arcLengthPolar()`, `linear()`, `geo(projection, opts)`                                                                   | `polar(...)`, `clock(...)`, `wavy()`                                | `{ type: "polar" \| "clock" \| "wavy", ...opts }`                              | function                          |
| `color`                   | chart options                                          | `palette(values)`, `gradient(stops)`                                                                                                                                            | `palette(values)`, `gradient(stops)`                                | `{ _tag: "palette", values }`, `{ _tag: "gradient", stops }`                   | function                          |
| `enter`, `exit`, `update` | `.transition()`                                        | `animation.grow()`, `animation.fadeIn()`, `animation.wipe({ from })`, `animation.tween({ curve, ease })`, ...                                                                   | not exposed (JS only)                                               | not serialized                                                                 | function, **already a namespace** |

Two more namespaces already exist, though their members are operators and constraints, not
option values: `time.*` (`time.sequence`, `time.stagger`, ...) and `Constraint.*`
(`Constraint.align`, ...). They show the dotted form is already at home in GoFish.

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
| `randomness`    | inside `overlap.jitter()`                           | `"blue"`, `"quasi"`, `"uniform"`                                                 |
| `ease`          | effects, `time.transition`                          | `"linear"`, `"cubicInOut"`, ..., or a function `u => u'`                         |
| `from`, `shape` | `animation.wipe()`, `time.stagger()`                | sides and orders                                                                 |
| scheme name     | inside `palette()` and `gradient()`                 | `"tableau10"`, `"viridis"`, `"blues"`, `"reds"`                                  |
| `projection`    | `geo()` (a positional argument, not an option key)  | `"equalEarth"`, `"mercator"`, or a function                                      |

`projection` is the one to watch. Real map projections take arguments (a rotation, standard
parallels), so if GoFish grows them, `projection` becomes a family.

## 2. Precedent

| Library                                                                                                                                                                                                                                                                                    | How strategies are organized                                                                                                                                                                                                                                      | What autocomplete shows                                               | Cost                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Swift** ([implicit member expressions](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Implicit-Member-Expression); [SE-0299](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0299-extend-generic-static-member-lookup.md)) | You write `.monotone` where the compiler knows the expected type, and it looks the name up on that type. SwiftUI uses this everywhere: `.toggleStyle(.switch)`.                                                                                                   | Exactly the members that fit the parameter.                           | Needs a static type checker at the call site. JavaScript and Python cannot do it.                                                                   |
| **ggplot2 / plotnine** ([position_jitter](https://ggplot2.tidyverse.org/reference/position_jitter.html); [plotnine reference](https://plotnine.org/reference/))                                                                                                                            | Flat names with a family prefix: `position_jitter()`, `position_dodge()`, `scale_color_viridis_c()`, `coord_polar()`.                                                                                                                                             | Typing `position_` lists the family. Typing nothing lists everything. | Long names, still all in one flat namespace. The prefix is a namespace by convention only.                                                          |
| **d3** ([d3-shape curves](https://d3js.org/d3-shape/curve); [d3-hierarchy treemap](https://d3js.org/d3-hierarchy/treemap); [d3-scale-chromatic](https://d3js.org/d3-scale-chromatic))                                                                                                      | Flat camelCase names with a prefix: `curveMonotoneX`, `treemapSquarify`, `interpolateViridis`. Arguments are methods on the strategy: `curveCatmullRom.alpha(0.5)`, `treemapSquarify.ratio(2)`. The prefix also matches the package (`d3-shape`, `d3-hierarchy`). | `d3.` lists hundreds of names. `d3.curve` narrows to the family.      | Same as ggplot2. The package split helps people who import from `d3-shape` directly.                                                                |
| **Observable Plot** ([curves](https://observablehq.com/plot/features/curves); [dodge](https://observablehq.com/plot/transforms/dodge))                                                                                                                                                     | One namespace, `Plot.*`, holds marks, transforms, and helpers. Curves are strings (`curve: "monotone-x"`), or a d3 curve function for anything custom. Overlap is a transform, `Plot.dodgeY(...)`.                                                                | `Plot.` lists everything. Inside `curve: "`, the strings.             | Strings cannot take arguments, so tension and similar settings live on separate options (`tension`).                                                |
| **Altair** ([line marks](https://altair-viz.github.io/user_guide/marks/line.html))                                                                                                                                                                                                         | Everything is on `alt.*`. Strategies are strings inherited from Vega-Lite: `mark_line(interpolate="monotone")`, `alt.Scale(scheme="viridis")`.                                                                                                                    | `alt.` lists hundreds of classes.                                     | Same as Plot.                                                                                                                                       |
| **Vega-Lite, Plotly** ([Plotly `line_shape`](https://plotly.com/python-api-reference/generated/plotly.express.line.html))                                                                                                                                                                  | Strings: `"interpolate": "monotone"`, `line_shape="spline"`.                                                                                                                                                                                                      | The JSON schema or docstring lists the strings.                       | No arguments per strategy. Extra settings become sibling options.                                                                                   |
| **Polars** ([string namespace](https://docs.pola.rs/api/python/stable/reference/expressions/string.html))                                                                                                                                                                                  | Methods grouped by data type under an attribute: `pl.col("a").str.to_uppercase()`, `.dt.year()`.                                                                                                                                                                  | After `.str.`, only string methods.                                   | One more dot. The namespace hangs off a value, not off a module, but the motivation is the same: a large API, grouped so autocomplete stays useful. |
| **Bokeh** ([`bokeh.transform`](https://docs.bokeh.org/en/latest/docs/reference/transform.html))                                                                                                                                                                                            | Helper functions in a submodule: `from bokeh.transform import jitter, dodge`, then `x=jitter("x", width=0.1)`.                                                                                                                                                    | The submodule lists its helpers.                                      | The submodule is a broad category ("transform"), not one per option.                                                                                |
| **matplotlib** ([`patches`](https://matplotlib.org/stable/api/patches_api.html); [`ConnectionStyle`](https://matplotlib.org/stable/api/_as_gen/matplotlib.patches.ConnectionStyle.html))                                                                                                   | Submodules (`matplotlib.patches as mpatches`). For arrows, one class per option, named after the option: `FancyArrowPatch(connectionstyle=ConnectionStyle.Arc3(rad=0.2), arrowstyle=ArrowStyle.Fancy(...))`.                                                      | `ConnectionStyle.` lists the connection styles.                       | The same styles can also be written as strings (`"arc3,rad=0.2"`), so there are two spellings.                                                      |
| **TypeScript string literal unions** ([literal types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types))                                                                                                                                                   | `alignment: "start" \| "middle" \| "end"`.                                                                                                                                                                                                                        | Inside the quotes, only the allowed strings.                          | No arguments.                                                                                                                                       |

Three things stand out.

- **Prefix naming** (ggplot2, d3) is the common answer, and it is a namespace in all but
  name. It groups the family for autocomplete but keeps the flat export list and makes
  names long. `overlap.separate` is the same idea with a real dot instead of an underscore.
- **matplotlib's style classes** are the closest match to this proposal: the namespace is
  named after the option it fills (`connectionstyle=ConnectionStyle.Arc3(...)`), and it says
  the option name twice, just as `overlap: overlap.separate()` does. Its cost is the second,
  string spelling, which this proposal does not copy.
- **Strings** (Plot, Altair, Vega-Lite, Plotly) are the simplest and give good
  autocomplete in TypeScript, but they cannot take arguments. That is exactly the line this
  note draws between a family and a closed string set.

## 3. Details

### When does an option get a family?

An option gets a family namespace when its value is **chosen from a set of named strategies
and at least one of them takes arguments**. An option whose members never take arguments is
a closed string set and stays a string.

One option has one spelling. If any member of an option needs a function call, every member
is a function call. Today `curve` mixes the two: `curve: "monotone"` beside
`curve: arc({ direction: "up" })`. Under this rule the whole option moves to calls:
`curve.monotone()` and `curve.arc({ direction: "up" })`. A string set inside a strategy is
fine, as `randomness: "quasi"` inside `overlap.jitter()` is: the string picks a variant of
one strategy, and it takes no arguments of its own.

A function value such as a custom `ease` (`u => u * u`) is an escape hatch for code the
library cannot know, not a member of a set. It is allowed beside a closed string set, as
d3 and Plot allow a custom curve function beside their named ones.

### Naming

**The namespace is named after the option key.** When several options share one family, the
key is usually the same everywhere, and the name follows: `line`, `ribbon`,
`time.transition`, and `animation.tween` all take `curve`. Two cases do not fit cleanly.

- **Different keys, same set.** `interpolate()` takes `method: "monotone"` from the same
  set as `curve`. The simplest fix is to rename that key to `curve`. Then the rule holds
  with no exception.
- **Several keys, one set, on purpose.** `.transition()` takes effects under `enter`,
  `exit`, and `update`. That family is already a namespace, `animation`, named after what
  the values are, because no single key fits. This note keeps it as it is.

**Collisions with existing names.** Naming the namespace after the key can collide with an
operator or helper of the same name:

| Family            | Collides with                                                   | Notes                                                                                                                                              |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method` (pack)   | nothing, but `method` is too generic to be a namespace          | Renaming the key is cleaner, for example `pack({ packing: packing.circles() })`. A namespace called `pack` would collide with the `pack` operator. |
| `coord`           | the low-level `coord({ transform }, children)` combinator       | One of the two has to change name.                                                                                                                 |
| `color`           | `color`, the exported object of named colors (`color.red`, ...) | One of the two has to change name. Python has no such object.                                                                                      |
| `curve`           | nothing in the library                                          | `curve` is a natural local variable name in user code, which is a small cost.                                                                      |
| `tile`, `overlap` | nothing                                                         | `tile.slice()` also removes a Python problem in #1005, where `from gofish import *` would hide the built-in `slice`.                               |

The family name also frees member names. `linear` can be both `coord.linear()` and
`curve.linear()`, and a future packing strategy could be called anything without checking
the rest of the library.

### Closed string sets inside and outside strategies

Nothing changes for closed string sets. They keep autocomplete through their types and need
no import at all. A string set can later become a family if a member grows an argument, and
the rule above says when: the whole option moves at once.

### JavaScript packaging

Today `gofish-graphics` has a single entry point. `package.json` has
`"exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`, and
`vite.config.ts` builds one library entry, `src/lib.ts`.

Each family becomes one source module that holds the family's public factories and their
types, for example `src/families/overlap.ts` exporting `separate`, `jitter`,
`OverlapStrategy`, and so on. The operator imports its strategies from there. Then:

1. **The namespace on `gf`.** `src/lib.ts` gains `export * as overlap from
"./families/overlap";` and loses the flat `export { separate, jitter }`. An
   `export * as` namespace is the module itself, so `gf.overlap.separate` and the
   subpath import are the same function.
2. **The subpath.** `package.json` gains one `exports` entry per family:
   `"./overlap": { "types": "./dist/families/overlap.d.ts", "import": "./dist/overlap.js" }`.
3. **The build.** Vite 6, which the package uses, accepts several library entries:
   `lib.entry: { index: "src/lib.ts", overlap: "src/families/overlap.ts", ... }`. Rollup
   puts code the entries share in a common chunk, so the family module is loaded once
   whichever path a user takes. The type declarations are already emitted per file by
   `vite-plugin-dts`, so `dist/families/overlap.d.ts` comes for free.

**Tree-shaking.** Tree-shaking is a bundler removing code a program never uses. Bundlers
handle `export * as` namespaces well, because every member access is visible in the source.
The existing `animation` namespace is a plain object literal
(`export const animation = { grow, ... }`), which bundlers are less able to trim. If we
adopt this proposal, `animation` should become a module namespace too, for the same reason
and so that `gofish-graphics/animation` works like the others.

**Costs.** Each family adds one entry to `exports` and one to the Vite config. A wildcard
export (`"./*"`) would avoid the list but would expose every file in `dist`. A short
explicit list, checked by a script against the family list, is better. TypeScript users on
the old `"moduleResolution": "node"` setting do not see `exports` subpaths; they would
still reach everything through `gf.overlap`.

### Python packaging

Each family becomes a submodule: `gofish/overlap.py` defines `separate` and `jitter`.
`gofish/__init__.py` imports the submodule (`from . import overlap`) and lists `"overlap"` in
`__all__`, in place of the flat `separate` and `jitter`. Then `gofish.overlap.separate`,
`from gofish import overlap`, and `from gofish.overlap import separate` all reach the same
function, because Python modules are loaded once.

A keyword argument named `overlap` and a module named `overlap` do not conflict:
`scatter(overlap=overlap.separate())` is fine Python. Arguments stay keyword arguments, in
snake_case, as everywhere else in the Python API.

Today the Python strategy factories (`separate`, `jitter`, `circles`, `squarify`, ...) are
written by hand in `ast.py`. The descriptor table already lists each family's members and
their options as a union of `{ kind, ... }` objects, so the generator that writes
`_generated.py` could write the family modules too. That is a natural follow-up, not a
requirement.

### The IR

The IR mostly does not change. A strategy is still a plain object on the wire, and the
namespace exists only in the JS and Python surface: `overlap.separate({ padding: 1 })` still
serializes to `{ kind: "separate", padding: 1 }`, and `coord.polar()` to `{ type: "polar" }`.

The exception is `curve`. Under the one-spelling rule, `curve.monotone()` returns an object,
so the wire form of the string members changes from `"monotone"` to `{ type: "monotone" }`.
The descriptor entry, which today is `t.any`, becomes a proper union. Following the
project's no-shims rule, the old string form is removed rather than kept beside the new one.

The descriptor table would benefit from knowing about families. Today a family is only
implicit: a field whose type is a union of objects tagged by `kind`. Shared families such as
`curve` repeat the same type on every field. A small addition, a table of named families
that fields point to (as `t.ref("AxesOptions")` already does for shared option shapes),
would let three things read from one source: the generated Python family modules, the docs
tables, and the check that every family has an `exports` entry.

The discriminating key differs between families today (`kind` for overlap, tile, and pack;
`type` for curve and coord; `_tag` for color). That is worth tidying one day but is
separate from this proposal.

### Docs

A family with one owner is documented on the owner's page, as `overlap` is on the
`scatter` page today. A shared family gets its own page: `curve` on a new page, `coord` on
the existing `js/api/coords` pages, `color` on the existing `js/api/color` pages. Python
mirrors each under `python/api/`.

The `::: gofish-ref` tables render one construct's options from the descriptor table. With
named families in the table, `::: gofish-ref overlap` could render one row per member with
its own arguments, and the owner's options table would show the option's type as a link,
`overlap.*`, to that section.

Docs examples use the global `gf`, so they would read
`gf.scatter({ overlap: gf.overlap.separate({ padding: 1 }) })`. That is the documented
form, consistent with every other call in the examples.

### Migration

Per project rules, there are no aliases and no shims: the flat exports are removed and
every call site moves. A rough count across `stories/`, `src/`, the Python package, and the
docs:

| Family                      | Uses                               | Files    |
| --------------------------- | ---------------------------------- | -------- |
| `coord`                     | about 120                          | about 53 |
| `curve` (strings)           | about 88                           | about 30 |
| `curve` (calls)             | about 39                           | about 10 |
| `color` (`palette`)         | about 77                           | about 36 |
| `color` (`gradient`)        | about 57                           | about 22 |
| `pack` method (`circles()`) | about 23                           | about 12 |
| `overlap`                   | about 17 files on the #1003 branch |          |
| `tile`                      | about 13 files on the #1005 branch |          |

`animation.*` does not move. The edits are mechanical, and the renders should be
pixel-identical except where the `curve` IR change touches serialized snapshots.

A sensible order is the two unmerged families first (`overlap` and `tile`, while their PRs
are still open, so they never ship flat), then `pack`, then `curve`, and `coord` and `color`
last, once their name collisions are settled.

## 4. Before and after

Each row is one family member. JS on top, Python below.

| Family        | Before                                                                                                       | After                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `overlap`     | `scatter({ overlap: separate({ padding: 1 }) })`                                                             | `scatter({ overlap: overlap.separate({ padding: 1 }) })`                                                                                   |
|               | `scatter(overlap=separate(padding=1))`                                                                       | `scatter(overlap=overlap.separate(padding=1))`                                                                                             |
|               | `overlap: jitter({ randomness: "quasi" })`                                                                   | `overlap: overlap.jitter({ randomness: "quasi" })`                                                                                         |
|               | `overlap=jitter(randomness="quasi")`                                                                         | `overlap=overlap.jitter(randomness="quasi")`                                                                                               |
| `tile`        | `treemap({ tile: squarify({ ratio: 1 }) })`                                                                  | `treemap({ tile: tile.squarify({ ratio: 1 }) })`                                                                                           |
|               | `treemap(tile=squarify(ratio=1))`                                                                            | `treemap(tile=tile.squarify(ratio=1))`                                                                                                     |
|               | `slice()`, `dice()`, `binary()`, `sliceDice()`                                                               | `tile.slice()`, `tile.dice()`, `tile.binary()`, `tile.sliceDice()`                                                                         |
|               | `slice()`, `dice()`, `binary()`, `slice_dice()`                                                              | `tile.slice()`, `tile.dice()`, `tile.binary()`, `tile.slice_dice()`                                                                        |
| `pack` method | `pack({ method: circles() })`                                                                                | `pack({ packing: packing.circles() })` (key renamed; see question 1)                                                                       |
|               | `pack(method=circles())`                                                                                     | `pack(packing=packing.circles())`                                                                                                          |
| `curve`       | `line({ curve: "monotone" })`                                                                                | `line({ curve: curve.monotone() })`                                                                                                        |
|               | `line(curve="monotone")`                                                                                     | `line(curve=curve.monotone())`                                                                                                             |
|               | `"linear"`, `"step"`, `"smooth"`, `"catmullRom"`                                                             | `curve.linear()`, `curve.step()`, `curve.smooth()`, `curve.catmullRom()`                                                                   |
|               | `"linear"`, `"step"`, `"smooth"`, `"catmullRom"`                                                             | `curve.linear()`, `curve.step()`, `curve.smooth()`, `curve.catmull_rom()`                                                                  |
|               | `curve: bezier()`, `orthogonal({ bend: "auto" })`, `arc({ direction: "up" })`, `perfectArrows({ bow: 0.3 })` | `curve.bezier()`, `curve.orthogonal({ bend: "auto" })`, `curve.arc({ direction: "up" })`, `curve.perfectArrows({ bow: 0.3 })`              |
|               | (raw dicts only)                                                                                             | `curve.bezier()`, `curve.orthogonal(bend="auto")`, `curve.arc(direction="up")`, `curve.perfect_arrows(bow=0.3)`                            |
|               | `time.transition({ curve: "linear" })`                                                                       | `time.transition({ curve: curve.linear() })`                                                                                               |
|               | `interpolate(rows, { method: "monotone", ... })`                                                             | `interpolate(rows, { curve: curve.monotone(), ... })`                                                                                      |
| `coord`       | `chart(data, { coord: polar() })`                                                                            | `chart(data, { coord: coord.polar() })` (see question 2)                                                                                   |
|               | `chart(data, coord=polar())`                                                                                 | `chart(data, coord=coord.polar())`                                                                                                         |
|               | `clock()`, `wavy()`, `bipolar(100)`, `arcLengthPolar()`, `linear()`, `geo("equalEarth", { lon, lat })`       | `coord.clock()`, `coord.wavy()`, `coord.bipolar(100)`, `coord.arcLengthPolar()`, `coord.linear()`, `coord.geo("equalEarth", { lon, lat })` |
|               | `clock()`, `wavy()`                                                                                          | `coord.clock()`, `coord.wavy()`                                                                                                            |
| `color`       | `chart(data, { color: palette("tableau10") })`                                                               | `chart(data, { color: color.palette("tableau10") })` (see question 2)                                                                      |
|               | `chart(data, color=palette("tableau10"))`                                                                    | `chart(data, color=color.palette("tableau10"))`                                                                                            |
|               | `gradient(["#f7fbff", "#08519c"])`                                                                           | `color.gradient(["#f7fbff", "#08519c"])`                                                                                                   |
|               | `gradient(["#f7fbff", "#08519c"])`                                                                           | `color.gradient(["#f7fbff", "#08519c"])`                                                                                                   |
| effects       | `.transition({ enter: animation.grow() })`                                                                   | unchanged (JS only)                                                                                                                        |

The closed string sets in section 1 do not change.

## 5. Open questions

1. **The `pack` key.** The rule names the namespace after the key, and `method` is too
   generic for a namespace. Should the key be renamed (`pack({ packing: packing.circles() })`
   is one choice), or should `pack` be the one exception, with a namespace named something
   else?
2. **`coord` and `color` collisions.** Both namespaces collide with an existing export: the
   low-level `coord` combinator and the `color` object of named colors. Which side gives up
   its name? Or do these two families wait until that is settled?
3. **One-member families.** `pack` has only `circles()` today. Does it get a namespace now,
   so that the second member does not force a migration, or does it stay flat until it has
   two?
4. **`curve` becomes calls only.** Moving every curve to a call (`curve.monotone()`) changes
   the IR for the string members, and makes the most common case a little longer than
   today's `curve: "monotone"`. Is that acceptable, or should `curve` stay a closed string
   set, with the routed shapes (`bezier`, `arc`, ...) moving to a separate option?
