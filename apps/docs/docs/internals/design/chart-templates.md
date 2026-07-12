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

# The Recommended Shape (July 2026)

The sections above set the philosophy. This section records the concrete shape we've converged on
after the first implementation round (`barChart`, PR #70) and the Flint survey
([flint-chart-notes](./flint-chart-notes.md)).

## Templates Are Named Expansions, Not a Catalog

Grammar-of-graphics systems draw a line between "marks" and "chart types" because their marks are
primitives whose semantics live in the compiler. Vega-Lite's `bar` mark carries banding, stacking,
and orientation heuristics that you cannot write down in the language itself. GoFish doesn't have
that line. A bar chart is already a composition you can write down, so a template is a named
expansion of an operator and a mark:

```ts
barChart({ x, y });
// ≡ .flow(spread({ by: x, dir: "x" })).mark(rect({ h: y }))

lineChart({ x, y });
// ≡ .flow(scatter({ by: x, x, y })).mark(line())
```

Templates are macros with printable equations. They are not new primitives, and the set of them is
not a closed catalog. The Flint survey shows where the catalog road ends: every structural fact
(banded axis, encoding channel, series count) has to be declared on each of 46 chart types, because
the system cannot recover those facts from a grammar. Our templates stay thin sugar whose meaning is
their expansion, and anything a template cannot say is one desugaring step away.

So the answer to "are these marks or chart types?" is neither. They are named expansions. We still
call them chart templates in prose, and the docs can show each one's equation.

## Templates Nest With No New Machinery

Issue #35 requires that templates stay nestable inside ordinary specs ("you can easily facet etc").
It turns out this needs no mechanism at all, because `.mark()` already accepts both things a
template would naturally return:

- Any function `(d) => GoFishAST` is a valid `Mark` (`src/ast/types.ts`). The FlowerChart story
  passes a closure returning a `spread`/`layer`/`stackX` composition straight to `.mark()`.
- A `ChartBuilder` can be passed to `.mark()` directly (issue #243). An empty-scope child
  (`chart()` with no data) inherits the incoming partition datum. The Atom stories already do
  `.mark(chart().flow(derive(...), spread(...)).mark(circle(...)))`.

So a template with an opts-only call shape just returns an empty-scope pipeline, and nesting is
automatic:

```ts
chart(data)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(barChart({ x: "species", y: "count" }));
```

This renders one bar chart per facet cell, so faceting a template is just wrapping it in another
spread tier. The top-level convenience form is then pure sugar: `barChart(data, opts)` is
`chart(data)` plus the same expansion. Two call shapes on one function already has precedent in
`stack(opts)` versus `stack(opts, marks)`.

One caveat. `.mark()` recognizes an embedded chart by `instanceof ChartBuilder`. Whatever object
carries a template's modifiers therefore has to remain a real `ChartBuilder` (or a `Mark`
function), or `.mark(barChart(...))` will not be recognized. The current `BarChartBuilder` wrapper
is not a `ChartBuilder`, so it fails this test (see the open questions).

## One Function per Template, With Explicit Options

The two obvious parameterizations from other systems are Vega-Lite's (one `bar` mark, orientation
and banding inferred from channel data types) and Observable Plot's (orientation in the name:
`barX`, `barY`, `lineY`). We take neither exactly:

- Explicit like Plot, because inference is already rejected below ("The Road to `Auto`"). Data types
  should check the spec, not choose it.
- One function per template with a `dir` option, not a name pair, because that is the standing
  rule for operators (`spread({ dir })`, not two parallel spreads). Name pairs like `barX`/`barY`
  are also hard to remember (which direction does the name refer to?), and they double the exported
  surface for every template and every language binding.
- Channels stay `{ x, y }` per "The Road to Gantt Charts" below, with `dir` deciding which axis the
  chart runs along. What `dir` means at the template level is subtle enough to get its own section
  next.

## Which Axis Does the Orientation Option Name?

Renaming `orientation` to `dir` looks like a one-line consistency fix, but the two name opposite
axes for the same chart (`orientation: "y"` elaborates to `spread({ dir: "x" })`), so we
investigated both sides before committing.

Inside the library, `dir` already has one uniform meaning everywhere it appears (`spread`, `stack`,
`line`, `ribbon`, `connect`, `cut`, and the axis, legend, and label internals): the layout axis,
meaning the axis along which that operator's children are placed, connected, or sliced. It never
means "category axis" or "value axis". Those readings fall out of what is nested. A vertical
stacked bar chart uses `spread({ dir: "x" })` for the bars and `stack({ dir: "y" })` for the
segments, and both are correct uses of the same word. At first glance that makes a template `dir`
ambiguous, since `barChart` forwards to two operators whose dirs are perpendicular. But the
lowering is not a flat pair of operators. It is nested: the stack happens inside the spread's
cells. The outermost operator is canonical, so the template's `dir` is the outermost operator's
`dir`, and inner operators derive theirs from it (`.stack()` uses the perpendicular; today
`BarChartBuilder.stack()` computes exactly that value via `dir: this.barOrientation`,
`src/charts/bar.ts:51`).

Outside the library, the same rule turns out to be ggplot2's rule. ggplot2 defines
`orientation: "x"` as "the axis that the geom should run along", which is precisely the outermost
reading: the bars run along the category axis, and a line runs along its travel axis. seaborn 0.13
(`orient: "x"`) adopted the same letters, and CSS `flex-direction` names the same concept for
layout generally. So `dir` as "the axis the chart runs along" agrees with our own grammar and with
the two biggest statistical-plotting APIs at once. The outlier is Observable Plot, whose `barY`
letter names the quantitative channel instead, so the same letter means the opposite chart. The
shipped `orientation: "y"` followed the Plot camp, which is backwards relative to both our own
grammar and the ggplot2/seaborn convention.

Resolution:

- Rename `orientation` to `dir: "x" | "y"`, default `"x"` (vertical bars), defined as the `dir` of
  the outermost operator of the template's lowering, which is the axis the chart runs along. One
  vocabulary serves the grammar and the templates, with no flip anywhere: `barChart`'s `dir` is its
  spread's `dir`, and `lineChart`'s `dir` is its line's travel `dir`.
- The letter for the same visual flips relative to the shipped option (`orientation: "y"` becomes
  `dir: "x"`). That is safe because the option name changes along with the meaning, and there is no
  back-compat obligation. The Python mirror (`gofish.charts.bar_chart`) renames identically.
- Alternative not taken: word values, `orientation: "vertical" | "horizontal"` (matplotlib's
  `hist`, Vega-Lite's composite-mark `orient`). Words dodge the letter trap for readers coming from
  Plot, but they introduce a second orientation vocabulary at the template level, and once `dir` is
  anchored to the outermost operator the letters are unambiguous within the system and consistent
  with ggplot2 and seaborn outside it.

## Naming: the `Chart` Postfix

The name collision is systemic, not specific to one template. The `line` mark collides with line
chart, the `scatter` operator collides with scatterplot, and the `stack` operator collides with a
`.stack()` modifier. The short names belong to the grammar level, e.g. `line` names the connector
geometry and keeps its name. Templates uniformly take a `Chart` postfix: `barChart`, `lineChart`,
`areaChart`, `scatterChart`. This is already shipped (`barChart`) and already mirrored to Python
(`gofish.charts.bar_chart`). The postfix even reads well in mark position, since
`.mark(barChart(...))` literally means "each cell contains a bar chart".

## Modifiers Instead of More Chart Types

Issue #35 sketches `bar().stack()` and argues stacking should stay explicit rather than implicit.
Modifiers on the template value are how we keep the template set small: stacked, grouped, and
faceted bars are `barChart().stack(...)`, a grouping modifier, and an outer spread tier, not three
chart types.

```ts
barChart({ x: "lake", y: "count" }).stack("species");
```

There is a principled reason the modifier lives on the template rather than only on `ChartBuilder`.
The template carries its `dir`, so `.stack("species")` can default the stack direction to the
perpendicular of the template's `dir` (the value axis) and default the fill to the split field. The generic
`ChartBuilder.prototype.stack` mixin cannot know either. This also resolves the ambiguity that
stalled #290: `.stack()` on a bare `rect` is ill-defined, but on a template it is well-defined.
Normalized (percentage) stacking stays a data-side transform per the field-expression work (#709),
so there is no `.normalize()` modifier.

The `Stackable` interface from PR #70 is the right idea when read as a typeclass: it names a
capability that some templates have and others don't. A bar chart is stackable and a line chart is
not, so `.stack()` should exist exactly on the templates that implement `Stackable`, and its
absence on `lineChart` is a type error rather than a runtime error. Whether the instance is carried
by a wrapper builder like `BarChartBuilder`, by a `ChartBuilder` subclass, or by modifiers attached
to a mark value is an open question below. The one hard constraint is the nesting caveat above: the
carrier must still be something `.mark()` accepts.

## What Exists Today

- `barChart(data, { x, y, orientation, fill, mark })` in `src/charts/bar.ts` (PR #70), exported
  from `lib.ts` and mirrored to Python as `gofish.charts.bar_chart`. Docs follow-up is #704.
- It returns a `BarChartBuilder` wrapper class implementing `Stackable`, with a `.stack(field)`
  method. No story exercises `.stack()` yet. The `Stackable` typeclass stays; whether the wrapper
  class does is an open question below (as written it is not a `ChartBuilder` instance, so it
  cannot be nested via `.mark()`).
- `src/templates/` (rectTemplate, waffle, and friends) predates v3, is not exported anywhere, and
  should be deleted when this layer lands.

# Forks Not Taken

## The Road to Gantt Charts

One thing we might naturally want to try is changing the traditional encoding style:

```ts
barChart(data, { x: "x", y: "y" });
```

to

```ts
barChart(data, { x: "x", h: "y" });
```

since bars really use height to encode information. This makes switching between vertical and
horizontal bars a little harder, because we also have to switch `x` and `h` to `y` and `w`. But also
this affords a spec like:

```ts
barChart(data, { x: "x", h: "y", y: "group" });
```

And what should that mean? Maybe something like a Gantt chart, except that Gantt charts can have
multiple bars in the same group whereas a bar chart can't (except for stacking, which isn't the same
thing).

I checked ggplot2 and plotnine and actually a lot of charts do just fine with `x` and `y` without
resorting to `x` and `h`, which might be slightly higher cognitive load at this level of
abstraction. `x` and `y` act more like axes than dimensions at this level (also consistent with
ggplot2 where if you give `x` and `y`, but no marks, it will still render an empty coordinate space
of the proper size). Moreover, at a later time we can still stuff more data into each axis by giving
it an option like this: `x: { ... }`. That works well for e.g. box and whisker charts, which can
take quartile information.

It's possible we'll revisit and modify this decision later, but right now I like erring on the side
of familiarity, because (i) I don't think we should take advantage of the Gantt chart affordance and
(ii) the mid- and low-level APIs do a good job at being explicit about visual structure, so if you
really wanna be aware that a bar chart encodes data with height, then look at those abstraction
levels!

## The Road to `Auto`

Another thing I tried is the Vega-Lite approach. Suppose we don't just have encoding channels, but
we also know the types associated with those channels. Then we might ask, for example, what happens
if we have a bar chart where `x` and `y` are both continuous values? Or both discrete? Maybe we'd
get a scatterplot and a heatmap, respectively. This road leads to the `auto` mark like in Observable
Plot.

I looked back on this design option, and I realized that I'd misunderstood how Vega-Lite's bar mark
works. I thought that it made a scatterplot if you use two continuous values, but that's only if the
two values are the same field! (And in that case it still ends up stacking the y-axis...) So there
are really a lot of heuristics going on inside that bar mark. I'd like to avoid that complexity, but
I think we can still be fairly predictable in how we handle other data types. For example, we could,
like Vega-Lite when the fields are different, make a bar chart with continuous positioning on the
x-axis when both fields are continuous.

For now we will just error on data types we don't expect (or treat them as the types we _do_ expect)
and revisit this decision when we have more complex examples to look at.

## Split Names Like `barX` / `barY`

Observable Plot spells orientation into the function name (`barX`, `barY`, `lineY`). That fits
Plot, because its options are flat and orientation changes what each option means. It doesn't fit
GoFish, where the standing rule is one polymorphic function with a `dir` option (`spread({ dir })`)
rather than two parallel functions. See "One Function per Template" above.

## Generalizing Relational Fusion for Templates

An earlier draft of this note proposed generalizing the `__relationalFusable` rewrite in
`ChartBuilder.mark()` into a template expansion mechanism, so that a template would be a tagged
mark that `.mark()` rewrites into a flow plus a mark. That is unnecessary. `.mark()` already
accepts any `(d) => GoFishAST` function and any `ChartBuilder`, so templates nest with no rewrite
at all (see "Templates Nest With No New Machinery"). Fusion exists for a different reason: a
relational mark has to split its spatial anchor channels from its paint channels across two tiers.
Templates have no such split, so they don't need the tag.

# Open Questions

- How a template carries its modifiers. The `Stackable` typeclass stays either way, but the
  instance needs a home. Candidates: keep `BarChartBuilder` but make it a `ChartBuilder` subclass
  (so `instanceof` recognition in `.mark()` keeps working and nothing re-exposes the builder
  surface by hand), attach the methods to `ChartBuilder` via the existing prototype-mixin pattern
  (`builderMixins.ts`), or attach modifiers to a mark value the way `.name()`/`.label()` do.
- The series channel for `lineChart` (what Vega-Lite calls `color`/`detail` and Plot calls `z`).
  Its spelling depends on the in-flight `along`/`by` split on relational marks (#752), so it should
  wait for that to land.
- The first template set. Keep it small and narrow per "Do Less": `barChart`, `lineChart`,
  `areaChart`, `scatterChart`. Waffles, mosaics, and trees keep their own DSLs.
- Grouped (dodged) bars. Probably a `.group(field)` modifier symmetric with `.stack(field)`, but
  nobody has needed it yet.
- Python parity is nearly free when a template desugars at construction time, because the
  serialized IR is just the expansion, which is how `barChart` already crossed the bridge. Any new
  fluent surface (the `.stack()` modifier) still goes through the cross-language checklist.
