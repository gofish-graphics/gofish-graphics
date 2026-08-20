---
title: Chart Templates
section: Speculative Notes
order: 30
status: speculative
---

# Design of the High-Level Chart API

This level is the closest to the original GoG. But because we also have the mid- and low-level APIs,
we can make this level much more restrictive and less compositional. Our goal at this level is to
match user intentions of the form "I want to make a bar chart."

That being said, these charts still produce GoFish scenegraphs so they can be transformed by
coordinate systems, layered, added as marks to `chart` pipelines, etc. This preserves a lot (all?)
of the compositional power of the GoG.

## Do Less

The name of the game here is _do less_. Do less inference than you think. Cover fewer chart types
with one function call than you might want to. This keeps things readable and predictable. It also
makes contributing examples easier, because they don't have to be as general.

Inference at this level of abstraction also breaks down really quickly. What might work well for bar
charts or bars, lines, and areas, quickly breaks down for more complex charts like waffles, boxes,
and mosaics.

Chart names at this level carry semantic/pragmatic meaning. If we allow too much flexibility in e.g.
a bar chart, then the name "bar chart" loses its meaning.

## Leave Space for Chart-Type DSLs

Don't try to do too much in a flat API for things like waffles or mosaics. That's a nice space for a
domain-specific language (DSL) to express these charts. For example, the Atom grammar for unit
charts could be ported. Or we could port productplots. These are useful for collections of charts
that have hierarchical structure, but have domain-specific primitives with more restrictive
structure than the mid-level API.

(One boundary here has since moved: the silhouette work showed waffles decompose into `wrap`
compositions with a systematic elaboration — grouped waffle = `stack ∘ wrap`, stacked waffle =
`wrap ∘ wrap` — so a waffle template may eventually qualify as a thin expansion after all. Mosaics
and trees stay DSL/grammar-level for now.)

# The Recommended Shape (revised July 2026)

> **Status.** This section replaces the channel design of the 2026-07-12 revision (#787). The old
> shape gave every template `{ x, y }` channels; that is now recorded under "Forks Not Taken" with
> the reasons it lost. Everything else from that revision — templates as printable expansions,
> nesting for free, one function per template, the `Chart` postfix, the outermost-operator `dir`
> rule — carries forward unchanged. **The syntax below is a design proposal, not signed off.** Per
> our standing rule, the exact spellings need explicit approval on real rendered examples before
> implementation. The implementation issue #788 was scoped to the old shape and must be re-cut.

## Templates Are Named Expansions, Not a Catalog

Grammar-of-graphics systems draw a line between "marks" and "chart types" because their marks are
primitives whose semantics live in the compiler. Vega-Lite's `bar` mark carries banding, stacking,
and orientation heuristics that you cannot write down in the language itself. GoFish doesn't have
that line. A bar chart is already a composition you can write down, so a template is a named
expansion of operators and a mark:

```ts
barChart({ by: "lake", size: "count" });
// ≡ .flow(spread({ by: "lake", dir: "x" })).mark(rect({ h: "count" }))
```

Templates are macros with printable equations. They are not new primitives, and the set of them is
not a closed catalog. The Flint survey ([flint-chart-notes](./flint-chart-notes.md)) shows where
the catalog road ends: every structural fact has to be declared on each of 46 chart types, because
the system cannot recover those facts from a grammar. Our templates stay thin sugar whose meaning
is their expansion, and anything a template cannot say is one desugaring step away.

So the answer to "are these marks or chart types?" is neither. They are named expansions. We still
call them chart templates in prose, and the docs can show each one's equation.

Compared to the raw pipeline level, templates add exactly two kinds of defaults, both visible in
the equations: a **default mark** per scenario (rect in lanes and cells, circle in continuous
space), and in one case a **default key** (see `scatterChart` below). Pipelines deliberately have
neither.

## Templates Nest With No New Machinery

Issue #35 requires that templates stay nestable inside ordinary specs ("you can easily facet
etc"). This needs no mechanism at all, because `.mark()` already accepts both things a template
would naturally return:

- Any function `(d) => GoFishAST` is a valid `Mark` (`src/ast/types.ts`).
- A `ChartBuilder` can be passed to `.mark()` directly (issue #243). An empty-scope child
  (`chart()` with no data) inherits the incoming partition datum.

So a template with an opts-only call shape returns an empty-scope pipeline, and faceting is just
wrapping it in another spread tier:

```ts
chart(data)
  .flow(spread({ by: "region", dir: "x" }))
  .mark(barChart({ by: "lake", size: "count" }));
```

The top-level convenience form `barChart(data, opts)` is `chart(data)` plus the same expansion.

One caveat carries forward: `.mark()` recognizes an embedded chart by `instanceof ChartBuilder`,
so whatever object carries a template's modifiers must remain a real `ChartBuilder` (or a `Mark`
function). This constraint now applies to `.stack()`, `.group()`, and `.detail()` alike (see the
open questions).

## The Substrate Algebra

A template's first job is to choose a **spatial substrate** — the kind of space marks are placed
into. There are three, and they are the 0/1/2-discrete-axes points of one product:

| substrate                            | discrete axes | operator lowering   | default mark |
| ------------------------------------ | ------------- | ------------------- | ------------ |
| continuous × continuous              | 0             | `scatter`           | `circle`     |
| discrete lanes × continuous          | 1             | `spread`            | `rect`       |
| discrete × discrete (table of cells) | 2             | `spread` × `spread` | `rect`       |

Scatterplots live in the first. Bar charts, dot plots, strips, and Gantt charts live in the
second. Heatmaps, punchcards, and tables live in the third.

This is close in spirit to Semiotic's taxonomy (XYFrame / OrdinalFrame — its OrdinalFrame likewise
hosts bars, violins, and timelines uniformly), but more algebraic: Semiotic hard-codes sibling
frame components with per-frame accessor vocabularies, while here the substrates are generated by
one rule — how many axes the keys claim — and the slot vocabulary does not change across them. The
substrates also correspond one-to-one to existing GoFish operators, so each template's equation is
ordinary pipeline code.

Each named template pins its substrate (that is part of the name's pragmatic meaning); the algebra
is the theory underneath that keeps the set coherent and tells us what a new template would cost.

## Typed Slots: Keys Locate, Measures Draw

Spec slots are typed by role. **Key slots** take independent variables (dimensions, in
Polaris/VizQL terms) and determine _where_ in the substrate marks go. **Measure slots** take
dependent variables and determine _what is drawn_ there, named by their encoding:

| slot                                     | role                                                                   | encoding           |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| `by`                                     | key: claims discrete axes (string = one lane axis, `{ x, y }` = table) | banding            |
| `x`, `y`                                 | measure: position on a continuous axis                                 | position           |
| `x: { start, end }`, `y: { start, end }` | measure: interval on a continuous axis                                 | position pair      |
| `size`                                   | measure: extent along the lane's free axis                             | magnitude (length) |
| `color`                                  | measure: fill                                                          | color              |

Notes on the slots:

- **`by` follows the standing unified-key rule** (one option, string or `{ x, y }`, never
  `xBy`/`yBy`).
- **`size` is dir-relative magnitude**, anchored at the baseline — the bar-length channel. On
  `scatterChart`, `size` is symbol area. Both are the Bertin magnitude channel applied to
  different geometry (bar length, dot area, violin width).
- **Intervals are the floating counterpart of `size`.** A `{ start, end }` value in a position
  slot places a floating extent by two positions on a shared scale. Stacking universally lowers to
  exactly this (Vega-Lite's stack transform emits `y0`/`y1`; ggplot's `position_stack` emits
  `ymin`/`ymax`; our stack glue fold computes cumulative offsets), so `size: f` is the anchored
  special case `{ start: 0, end: f }` plus aggregation. Position slots can also carry richer
  structured forms later (order statistics for box plots, OHLC for candlesticks).
- **`dir` names the lanes axis** and keeps its uniform meaning: the `dir` of the outermost
  operator of the lowering, the axis the chart runs along (the ggplot2/seaborn convention; see the
  #787 revision for the full survey). New rule: `dir` is **required exactly when no measure
  claims a position axis** (a bar chart's slots name no axis, so `dir` must, default `"x"` =
  vertical bars). When a position or interval measure claims an axis, `dir` is **derived** as the
  other axis, and stating it anyway is checked for conflict rather than trusted.

There is deliberately **no `{ x, y }`-everywhere convention**. On templates with keys, the old
shape made `x` mean "category" on bar and "measure" on scatter — the key/measure distinction was
still there, just recovered per-template by convention. The typed slots spell it. A bar chart and
a scatterplot now differ in spelling exactly where they differ in kind:

```ts
barChart({ by: "lake", size: "count" }); // 1 key, 1 magnitude measure
scatterChart({ x: "gas", y: "miles" }); // 0 keys, 2 position measures
```

`x`/`y` appear only where they honestly mean position. In data-frame terms (our preferred
precedent side): `by` is `group_by`, and a bar chart spec reads like
`df.group_by("lake").agg(...)` plus a length encoding. Charting libraries uniformly spell this
x/y; the data-frame world uniformly spells keys explicitly. We side with the latter — familiarity
matters for surface naming, not for structure.

## Keys Are Explicit: the No-Punning Rule and the Fold Law

Two laws govern the whole level.

**No punning.** Keys come only from `by` and from modifiers (`.stack(k)`, `.group(k)`,
`.detail(k)`). In particular, **color never introduces a key**, unlike Vega-Lite (`color` on a
field implies a series split and stacking) and ggplot (`fill=` silently splits). A key may
_default_ a color (a split field defaults the fill, as relational fusion already does), but a
color can never _create_ a key. Likewise, data types never decide structure: a discrete-looking
field in a position slot does not create lanes. The one thing data may choose is **scale flavor**
(ordinal vs continuous axes, via the existing domain-inference pass) — data may choose scales,
never structure.

**The fold law.** Channels fold over the rows of the finest partition — the union of all
introduced keys (Tableau's "level of detail"). One mark per cell. Each channel folds by its type,
matching the existing v3 channel semantics:

- `size` folds by **sum**,
- positions fold by **mean** (intervals componentwise),
- `color` folds by its aggregate (mean for quantitative),
- field expressions (`field(f).mean()`, `count()`, …) override the default fold per #709.

Multiplicity is therefore a property of the _keys_, never of a measure's type and never of the
data. If you want one mark per row, you say so — that's what `.detail()` is for.

## The Modifier Family: Within-Lane Operators

Modifiers are the only way to introduce keys beyond `by`. There are exactly three, and they are
the graphical operators applied _within_ a lane — this is also the boundary #290 identified for
which operators may appear mark-side (ggplot's position adjustments are the same family):

| modifier           | introduces    | within-lane placement                            | lowering       |
| ------------------ | ------------- | ------------------------------------------------ | -------------- |
| `.stack(k, opts?)` | located key   | cumulative offsets (fold per sub-key, then scan) | inner `stack`  |
| `.group(k)`        | located key   | sub-lanes (dodge)                                | inner `spread` |
| `.detail(k?)`      | unlocated key | co-located; each mark placed by its own measures | inner `layer`  |

- **`.stack(k)` always names its key explicitly.** `by` on a path/area template means overlaid
  series; stacking is never implied by a color or a series. `.stack` defaults the inner direction
  to the perpendicular of the template's `dir` and defaults the fill to `k`. An `anchor` option
  positions the stacked whole (`.stack("genre", { anchor: "center" })` is a streamgraph;
  d3-style wiggle minimization is an offset _policy_ that can slot in later without changing the
  spec). Normalized (percentage) stacking stays data-side per #709 (`size:
field("count").normalize()`); there is no `.normalize()` modifier.
- **`.group(k)` is the dodge.** Sub-lanes within each lane, sharing the lane's scale.
- **`.detail(k?)` adds a key with no visual encoding of its own** — the precedented concept
  (Tableau's Detail shelf, Vega-Lite's `detail` channel, Observable Plot's `z`). Marks for
  different `k` values share the same location and are each placed purely by their own measures.
  No-arg `.detail()` means row identity: one mark per row. This is what makes Gantt charts, strip
  plots, and multi-series lines expressible without punning.

**`Stackable` is now a theorem, not a list.** `.stack()` exists exactly where there is a fold to
refine by cumulative sum — i.e. on templates whose measure is magnitude-encoded (`size`). Bar and
area: stackable. Line, dot, scatter: `.stack()` is a type error (positions don't sum — which is
why stacked line charts aren't a thing). The typeclass from PR #70 stays, but its instances are
derived from the slot typing.

All three modifiers must preserve the carrier's `ChartBuilder`-ness so templates keep nesting and
composing with `.layer()` (open question below).

## The Template Set

Small first set, per "Do Less". Each is one function; substrate and default mark are fixed by the
template; equations are shown informally at the v3 level.

```ts
// lanes × continuous, default mark rect
barChart({ by, size?, x?, y?, color?, dir? })
// ≡ .flow(spread({ by, dir })).mark(rect({ [perp(dir)]: size }))

// lanes × continuous, default mark circle
dotChart({ by, x?, y?, size?, color?, dir? })
// ≡ .flow(spread({ by, dir })).mark(circle({ [freeAxis]: x|y }))

// continuous × continuous, default mark circle; row-identity detail in the equation
scatterChart({ x, y, size?, color? })
// ≡ .flow(scatter({ x, y })).mark(circle({ ... })).detail()

// table of cells, default mark rect
heatmapChart({ by: { x, y }, color?, size? })
// ≡ .flow(spread({ by: by.x, dir: "x" }), spread({ by: by.y, dir: "y" })).mark(rect({ fill: color }))

// path charts — slot spelling for the independent variable (`along` vs `by`) is still open (#752);
// shown tentatively:
lineChart({ along, x?, y?, color? })     // measure at position; not stackable
areaChart({ along, size?, color? })      // measure at magnitude; stackable
```

Notes:

- `barChart` accepts either `size` (anchored magnitude) or an interval-valued position slot
  (floating extents) as its measure; `dotChart` takes a position measure. Under the strict fold
  law a keyless `scatterChart` would render a single mean point (as Tableau literally does until
  you disaggregate), so its printable equation includes a row-identity `.detail()` — a visible
  template default, not inference. An explicit `.detail(k)` replaces it.
- `heatmapChart` is the working name; `heatmap` has no natural `Chart` postfix and the naming is
  flagged below.
- Box plots (structured order-statistic position slots), violins (density transforms), waffles
  (wrap compositions), mosaics, and trees are deliberately not in the first set.

## Syntax Gallery

Lanes, folding (the bar family):

```ts
// bar chart (dir defaults to "x": vertical bars)
barChart({ by: "lake", size: "count" });

// horizontal bar chart
barChart({ by: "lake", size: "count", dir: "y" });

// stacked bar chart — the key is explicit, fill defaults to it
barChart({ by: "lake", size: "count" }).stack("species");

// grouped (dodged) bar chart
barChart({ by: "lake", size: "count" }).group("species");

// histogram — falls out of field expressions, no new machinery
barChart({ by: field("value").bin(), size: count() });

// range bar (one row per key: floating interval, folds trivially)
// interval claims y ⇒ dir derived as "x"
barChart({ by: "month", y: { start: "low", end: "high" } });
```

Lanes, per-row (the `.detail()` family):

```ts
// Gantt chart — interval claims x ⇒ lanes derived on y; multiple bars per task are just rows
barChart({ by: "task", x: { start: "start", end: "end" } }).detail();

// strip plot — every row keeps its own dot
dotChart({ by: "day", x: "value" }).detail();

// Cleveland dot plot — same slots, no detail: rows fold to the mean
dotChart({ by: "country", x: "lifeExpectancy" });
```

Continuous space:

```ts
// scatterplot (row-identity detail is in the equation)
scatterChart({ x: "gas", y: "miles" });

// summary bubble chart — an explicit key replaces the default detail;
// positions fold to means, size counts the group
scatterChart({ x: "billLength", y: "bodyMass", size: count() }).detail(
  "species"
);

// connected scatterplot — the thread is paint over the points, not an encoding
scatterChart({ x: "gas", y: "miles" }).layer(line()); // data sorted by year upstream
```

Tables of cells:

```ts
// heatmap — two keys, color measure, cells fold
heatmapChart({ by: { x: "day", y: "hour" }, color: field("rides").mean() });

// punchcard — same substrate, magnitude measure, circle mark
heatmapChart(
  { by: { x: "day", y: "hour" }, size: count() },
  { mark: circle() }
);
```

Path charts (tentative pending `along`/`by`):

```ts
// line chart — dir derived from the claimed position axis
lineChart({ along: "date", y: "price" });

// multi-series line — detail is the series key (Vega-Lite's detail channel, Plot's z);
// stroke defaults to the key
lineChart({ along: "date", y: "price" }).detail("company");

// area chart
areaChart({ along: "date", size: "streams" });

// stacked area
areaChart({ along: "date", size: "streams" }).stack("genre");

// streamgraph — stacked area with a centered anchor
areaChart({ along: "date", size: "streams" }).stack("genre", {
  anchor: "center",
});
```

Composition with the rest of the system:

```ts
// faceting = an outer spread tier (no template involvement)
chart(data)
  .flow(spread({ by: "region", dir: "x" }))
  .mark(barChart({ by: "lake", size: "count" }));

// pie/donut = bar chart under a polar coordinate transform (coords stay orthogonal)
// ribbon-over-bars etc. compose via .layer() once the carrier question is settled
```

The organizing picture — substrates × measures, with modifiers adding keys:

| substrate (from `by`)  | `size` (folds Σ)         | position / interval                                         | `color` |
| ---------------------- | ------------------------ | ----------------------------------------------------------- | ------- |
| none — cont × cont     | bubble                   | scatter, connected scatter                                  | —       |
| `by: k` — lanes        | bar; `.stack` / `.group` | Cleveland dot (fold) · strip, Gantt (`.detail`) · range bar | —       |
| `by: { x, y }` — table | punchcard                | —                                                           | heatmap |

Known chart types are the inhabited cells; empty cells are visibly empty rather than silently
forbidden.

## Naming: the `Chart` Postfix

Unchanged from the #787 revision: short names belong to the grammar level (`line` is the
connector mark), templates uniformly take a `Chart` postfix (`barChart`, `dotChart`,
`scatterChart`, `lineChart`, `areaChart`), which also reads well in mark position —
`.mark(barChart(...))` means "each cell contains a bar chart". `heatmapChart` is the one awkward
case (flagged in the open questions). One function per template with options, never split names
like `barX`/`barY` (fork recorded below).

## What Exists Today

- `barChart(data, { x, y, orientation, fill, mark })` in `src/charts/bar.ts` (PR #70), exported
  from `lib.ts` and mirrored to Python as `gofish.charts.bar_chart`. Its channel shape follows the
  _old_ design and is now two revisions behind (`orientation` → `dir` per #787, `{ x, y }` →
  typed slots per this note). Implementation issue #788 covered the first rename only and must be
  re-cut before any code changes.
- It returns a `BarChartBuilder` wrapper implementing `Stackable`; the wrapper is not a
  `ChartBuilder`, so it cannot nest (open question below, unchanged).
- `src/templates/` (rectTemplate, waffle, and friends) predates v3, is not exported anywhere, and
  should be deleted when this layer lands.

# Forks Not Taken

## `{ x, y }` Channels on Every Template (the 2026-07-12 shape)

The previous revision of this note gave every template `{ x, y }` channels, with `dir` deciding
which axis the chart runs along, on familiarity grounds (ggplot2/plotnine precedent, "x and y act
more like axes than dimensions at this level"). Superseded because uniform `{ x, y }` is not
neutral: the key/measure distinction (Polaris's dimension/measure) still exists under it, but has
to be recovered per-template by convention — `x` means "category" on bar and "measure" on scatter.
That is implicit per-template knowledge, the exact failure mode this layer was designed against,
and the only other recovery mechanism is data-type inference (rejected in "The Road to `Auto`").
The typed slots spell the distinction instead; `x`/`y` survive exactly where they honestly mean
position. What survives from the old shape: the `x: { ... }` structured-slot idea (it becomes the
interval/order-statistics form on position slots), and the whole `dir` analysis (the
outermost-operator rule is unchanged; `dir` additionally became derivable when a position measure
claims an axis).

## The Road to Gantt Charts

An earlier draft considered `barChart({ x, h })` so bars would name their length channel, noted
that `{ x: "x", h: "y", y: "group" }` accidentally affords something Gantt-like, and rejected the
affordance ("Gantt charts can have multiple bars in the same group whereas a bar chart can't").
The typed slots resolve this fork rather than merely avoiding it. Bar length (`size`, anchored,
folds) and a Gantt bar (interval, floating) are different slot types, so neither chart can be
written by misreading the other's channels — and Gantt is _expressible_, in the bar family where
it belongs (same lane substrate, same default mark), as an explicit interval plus an explicit
per-row key: `barChart({ by: "task", x: { start, end } }).detail()`. Multiple bars per task are
rows sharing a lane, which is no longer a special case. The old worry was an _accidental_
affordance from channel punning; this is a declared one.

## The Road to `Auto`

Unchanged. Suppose channels carried data types and the template chose structure from them (both
continuous → scatterplot, both discrete → heatmap). That road leads to Vega-Lite's bar-mark
heuristics and Observable Plot's `auto` mark, and we don't take it. The sharpened form of the
rule after this revision: **data may choose scales, never structure.** The existing
domain-inference pass reads scale flavor (ordinal vs continuous) from data; which marks exist, how
many, and what folds is fully determined by the spec.

## Split Names Like `barX` / `barY`

Unchanged. Observable Plot spells orientation into the function name; the standing GoFish rule is
one polymorphic function with a `dir` option. Also recorded there: Plot's `barY` letter names the
value axis, the opposite of the ggplot2/seaborn/CSS reading that our `dir` follows.

## Color as an Implicit Key (punning)

Vega-Lite and ggplot let a color encoding introduce the series/stack split. Rejected: every key
has exactly one source (`by` or a modifier), and color is a consequence (a split key defaults the
fill), never a cause. This is what keeps "what folds over what" answerable by reading the spec's
keys, at the cost of one extra explicit call (`.detail("company")` on a multi-series line where
Vega-Lite writes `color: company`).

## Measure-Type-Driven Multiplicity

A draft of this revision let a measure's type decide multiplicity: magnitude folds, positions map
one-mark-per-row, which would have made strip plots and Gantt "free". Rejected on two grounds.
Empirically, position channels already fold (mean) like everything else. Semantically, `{ day,
value }` with repeated rows is _genuinely ambiguous_ between a strip plot (all rows) and a
Cleveland dot plot (mean per day) — both real charts — so a rule that silently picks one from a
type is inference deciding structure. Multiplicity comes from keys; `.detail()` says "per row" out
loud.

## Generalizing Relational Fusion for Templates

Unchanged from the previous revision: templates nest via `.mark()` accepting builders and
functions, so they need no rewrite mechanism; fusion stays specific to splitting relational marks'
anchor channels from paint channels.

# Open Questions

- **Carrier for modifiers** (carried forward, now load-bearing for three modifiers plus
  `.layer()` composition): `ChartBuilder` subclass, prototype mixins, or mark-value modifiers —
  with the hard constraint that the result still passes `instanceof ChartBuilder` so templates
  nest and `.layer(line())` works on them.
- **`along` vs `by` on path charts** (#752 adjacent): the independent-variable slot for
  line/area is deliberately unsettled; the gallery entries above are tentative.
- **Interval slots need their low-level counterpart checked**: a rect placed by a same-axis
  position pair (`{ start, end }`) on a shared scale, and the within-lane `layer` lowering for
  `.detail()`. Without these the Gantt equation isn't printable.
- **Interval folding**: componentwise mean is the consistent default, but a forgotten `.detail()`
  on a Gantt silently renders mean bars instead of erroring. Decide consistent-default vs
  explicit-error on real examples.
- **`.group()` semantics**: fold-per-subkey then dodge (grouped bar) is the primary reading; does
  it also compose with `.detail()` (dodged strips)? And jitter — ggplot's fourth position
  adjustment — is a placement tweak on the `.detail()` side, not a fold refinement; deferred.
- **`heatmapChart` naming**: the postfix rule produces an awkward name; alternatives need the
  standard naming survey before implementation.
- **`dir` derivation**: the "required iff no position measure claims an axis, derived and
  conflict-checked otherwise" rule needs sign-off; it makes `dir` present on bar but absent on
  Gantt/line, which is either honest typing or an irregularity depending on taste.
- **Python parity** is nearly free when a template desugars at construction (the IR is the
  expansion), but every fluent modifier (`.stack`, `.group`, `.detail`) goes through the
  cross-language checklist.
