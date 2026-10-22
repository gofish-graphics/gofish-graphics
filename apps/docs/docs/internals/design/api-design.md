---
title: API Design
section: Overview
order: 26
group: Design Philosophy
status: stable
---

# API Design

This page lists the rules GoFish uses to decide what its API looks like: how
operators are factored, where meaning lives, how things are named, and how a
design gets settled. Each rule names the case that settled it. The broader
reasons sit in the other pages of this group, and this page links to them
instead of repeating them. In particular, read
[What follows from it](/internals/design/principles#what-follows-from-it) for
the small core, polymorphic operators, clean breaks and loud errors, and
[Composition, Not Enumeration](/internals/design/composition-not-enumeration)
for why GoFish composes arrangements instead of listing them.

## Operators and marks

**One concept is one operator.** When two proposed operators are one idea to
the person using them, expose one operator and put the variation in an option
or a strategy. The label design first proposed both `.label()` and a separate
`annotate()`. It kept one `label` operator, and the other placement styles
became options of it rather than a second name. Reach for a second operator
only when the two ideas do not share a mental model.

**Overlap is fine at the edges, not in the middle.** Two operators may agree on
a small, degenerate set of specs. `spread` with zero spacing, `stack`, and a
one-dimensional bin all lay cells end to end, and each still covers far more
that the others do not (#48). An operator may also be exactly a composition of
others: a two-dimensional product bin is nested one-dimensional bins, and is
defined by that rewrite. What to avoid is a large but partial overlap, where
two operators cover much of the same ground by different routes. When a
degenerate overlap exists, build it through one shared mechanism so the
operators cannot drift apart.

**A convenience is defined by what it desugars into.** Writing a construct so
that it desugars into other forms is how GoFish keeps overlapping ideas
orthogonal: the convenient form is stated as a composition of explicit forms
that the language can already express, so the overlap is a rewrite you can
read, not a second mechanism. An inferred default (a hover that targets the
mark it is written on) rewrites to the explicit form with the default filled
in. A block of overrides declared once (every channel a hovered mark changes)
rewrites to the per-channel forms. Show each convenience next to its rewrite.
If a convenience needs something no explicit form can say, add the explicit
form first; otherwise the convenience is a new capability with a friendly
name, not sugar. When the rewrite also runs backwards, so the explicit form can
be recognized and printed as the convenience, the two cannot drift, and a
serialized document can be shown in the shorter spelling.

Four conveniences GoFish has today, and how far each is a real rewrite:

- **A layer reads the previous layer's marks.** A `.layer(R)` with no data of
  its own is `.layer(chart(selectAll(name)).mark(R))`: the builder names the
  previous layer's mark if it has no name, then binds the new layer's data to
  `selectAll` of that name (`ensureNamedMark` in `chartBuilder.ts`). A
  relational mark in `.mark()` position is a blank anchor plus a layer:
  `.mark(line())` is `.mark(blank()).layer(line())`, with the blank taking the
  line's `w`, `h`, `emX` and `emY` (`tagRelationalFusable` in `chart.ts`,
  #752). Both are real rewrites.
- **Spread and stack are constraints.** `spread` elaborates to a `layer` with
  an `align` on the cross axis and a `distribute` along `dir`, and `stack` is
  `spread` with `glue` (`spread.tsx`, #547). This is a real rewrite, below the
  IR: the IR keeps `spread` and `stack`. See
  [Operators vs. Constraints](/internals/design/operators-vs-constraints).
- **A chained build-in is a selection.** A chained
  `spread(...).transition({ enter: time.stagger(...) })` means a layer over
  the spread's children,
  `.layer(chart(selectAll(...)).flow(time.stagger(...)).mark(time.transition({ enter })))`.
  This is not yet one rewrite. Each form leaves
  its own record on the tree, one walk reads both (`animation/install.ts`),
  and the build-in tower test (`pnpm test:build-in-tower`) checks that the
  two draw the same items at every playhead. See
  [Build-in Animation](/internals/design/build-in-animation).
- **Axes and labels are marks.** An axis or a `.label()` elaborates into
  ordinary `rect` and `text` shapes held in place by `align` and
  `distribute`, and layout has no axis or label code (see
  [Axes](/internals/frontend/axes) and [Labels](/internals/frontend/labels)).
  This is not yet a rewrite you can read: it runs inside layout, after
  domains are inferred, so there is no surface form to print. Domain nicing
  still reads the ticks each axis asks for (`axisDemand`), and polar axes are
  still drawn by `coord.tsx`.

**Prefer the simple general rule to a case split.** If a fix special-cases a
shape or a count (`length === 1`, the first element, a fallback value), ask
what the general operation is. Usually it has a known name in math or
programming languages. Reading one field off a group of rows used to unwrap a
one-element array. It became relational projection with a collapse when every
row agrees, the same rule SQL uses for a functional dependency, and that fixed
a nearby broken case too (see `pluck` and `project` in
[Three Surfaces](/internals/design-evolution/three-surfaces)). A unified rule
that breaks one or two old examples is better than a dispatch tree that keeps
them all; check what moved by rendering it, since an old render can be wrong.

**No rule a user has to model in their head.** Behavior does not branch on the
content of a user's names, strings or values to do the nice thing. An axis
title once left off the `(mm)` unit when every column name already ended in
it. That was removed, because predicting the title meant knowing the hidden
condition (#1126). Use one uniform rule and an explicit override instead:
declare the quantity with `Schema.unit("mm").quantity("Flipper Length")`, or
write the title.

**Inspectable by default; closures degrade gracefully.** Prefer a
representation the system can read: a field name, an expression such as
`when(field("count").sum().gt(cut))`, a named strategy. The system can then
serialize it to Python, infer whether a change only repaints, and print it
back. A closure stays available as the escape hatch for arbitrary computation,
like a function strategy beside the named ones (#1101). Using it gives up only
what the system can no longer see: a closure still renders, but it may not
cross to Python, and it is treated as a pipeline read unless marked `live()`.
What it never does is fail silently. An option that cannot take a closure
says so with an error instead of dropping it.

**Data always flows as lists.** Every step takes a list and gives back a list.
A split turns a list into a list of groups and never looks inside an item, so
an item may itself be an array. With no `by`, a split puts each item in its own
group (#998). Do not add checks or errors on the shape of an item. Grouping by
position is a key helper on `by`, not a nested array.

**Marks lay out alike.** Swapping a mark for a rect of the same width and height
gives the same layout, in either axis direction. Text follows this too: its `y`
is the top or bottom edge of its box, like a rect, and its baseline is only an
explicit anchor that alignment can ask for (#681).

**Channels are chosen by how they aggregate.** A mark option's channel kind
follows what the option means when a group has more than one row: sizes sum,
positions average, colors and raw content read the first row. Pick the kind by
meaning even when two kinds agree on the example at hand, and add a kind when
none fits. See [Mark Channel Types](/internals/frontend/channels).

## Data types

**Meaning lives on the data type.** Where a bar starts, whether an axis is
centered, and whether a value can be stacked are properties of the data, so the
data type carries them. The axis then shows that type. This follows Mackinlay's
expressiveness principle: the picture should say exactly what the data says. A
signed bar grows both ways from its measure's zero, not from an axis default of
zero with an override knob (#773). Data types declare what they can do, marks
and operators declare what they need, and a mismatch is a loud error that
names the missing capability (#984). See
[Column types](/internals/core/underlying-space#column-types-the-chart-schema).

**Units are types.** A unit of measure on a value is a type, not a preference.
When an explicit annotation and an inferred one disagree, such as a field
tagged in millimeters meeting a bin that produced counts, that is a type error,
not an override (#452). A bare field name with no annotation is a weak default
and yields to either real source. See
[Measures: units are types](/internals/core/underlying-space#measures-units-are-types).

**Capabilities get plain names.** A capability is named `Has<Thing>` for a
property and `Can<Verb>` for an operation: `HasZero`, `HasOrder`, `HasCycle`,
`CanSum`, `CanNegate`. These read at a glance for someone who is not a
mathematician. Math names like monoid or torsor appear only in the docs, as
analogies. Named types such as `Price` or `Revenue` are sugar over the
capabilities, like chart templates over operators, so design the capabilities
first.

**Add a type only where a real example forces it.** A type earns its place by
removing a special case that a real example runs into. For time and binning,
only "a key is a cell" was needed at first; region types and schema
declarations wait until an example needs them (#48).

## Naming

**Survey precedent first, and prefer a name that already exists.** Before
proposing any name, look at what other systems call the same thing, and show
that survey with the proposal.

- For data transformations, start with polars, then dplyr and tidyr, SQL and
  Vega-Lite. pandas is corroboration, not the tiebreaker. A no-argument
  `filter()` that drops nulls was rejected because `filter` takes a predicate
  everywhere; the polars name `dropNulls()` was used instead (#742).
- For layout and placement, look at Typst, SwiftUI, CSS, Apple Auto Layout,
  TikZ and design tools such as Figma. `spread`'s `mode` became `anchor` because
  Auto Layout anchors, TikZ anchors and CSS anchor positioning all use that word
  for a named point on a box (#762).
- For data types, typed precedent wins: Lean mathlib, the JS Temporal API,
  java.time, polars dtypes, and [Flint](/internals/design/flint-chart-notes).
  When a visualization library solves the same problem with a workaround, such
  as an axis "zero" toggle or a hand-computed offset, name it as a workaround
  and do not copy it.

**Use existing words, and define terms on first use.** Prefer a word with an
established outside meaning to a new coinage: "scale factor" over a symbol,
"size request" over an invented noun. Define every term of art the first time
it appears. Drop a term that is not doing work.

**Do not reuse a word that already means something in visualization.** "Facet"
already means small multiples, so the handles of a box are anchors (min,
center, max, baseline) and its extent is its size. Two-sided extent around a
baseline is `ascent` and `descent`, the font-metrics names, not height and
depth, which read as the y and z axes (#773).

**Designers' names over specialist names.** The region-compositing operators use
Figma's boolean-operation names, not the Porter-Duff names: `intersect`,
`subtract`, `exclude`, `paint` and `mask`, never `in`, `out`, `xor` or `atop`
(#196, #404). See [Region compositing](/js/api/operators/region-compositing).

**A name says the shape of its value.** A singular noun gives one thing and a
plural verb gives a collection: `ref` and `selectAll`, never `refAll` (#510).
See [Singular and plural](/js/concepts/refs-and-selection#singular-and-plural).
Name lookup follows one scoping rule; see
[Name Resolution & Scoping](/internals/core/names-and-scoping).

**One key across a family, and roles above the axis split.** Operators that
split data all use one `by` key. It takes a string for one axis and an object
for two; there is no `xBy` or `yBy`. In the same way, an option names its
semantic role first and carries its direction inside, as in a tree layout's
`parentChild: { type: "spread", dir: "y" }`, rather than splitting into `x.*`
and `y.*` options. When GoFish embeds another system's grammar, it renames that
grammar's options to GoFish's words and moves per-node styling into a mark
function (the GoTree port, #461).

**Nest a role instead of prefixing its name.** When several options share a
prefix, such as `labelAngle` and `labelAlign`, the prefix is a hierarchy
written into the names. Write it as structure instead: one option named for
the role, with its details inside, as in `label: { angle, align }`. The
grouping is then visible, the role can be passed as a whole, and a new detail
is a new key, not a new name. CSS shorthands and ggplot2's `element_text`
group settings the same way. Vega-Lite's flat `labelAngle` and `labelAlign`
are the pattern to avoid (#1133).

**Calls, methods and options say how much the parts know about each other.**
A function call joins parts that are independent, or that pass very little
between them: `chart(data)`, `field("x")`, `layer([a, b])`, and the operators
handed to `.flow(spread(...), stack(...))`. A method chain is a universal
interface that can read the caller's internal state, and even branch on it,
or turn it into a new object: `.bin(...)` reads the field's type (a time
column takes `Calendar`, a number takes `Bin`), `.format(fn)` sees fields that
depend on the partition it is called on, `.sort()` uses the type's order, and
`chart(...).flow(...).mark(...)` builds a spec step by step. An option is a
local adjective of one thing, usually specific to its kind, such as
`Calendar.month({ every: 3 })`, `Calendar.week({ start })` or
`Bin.hex({ radius })`; a few, such as `w`, `h` and `fill`, apply almost
everywhere. So `every` is an option, because it describes the month
partition and reads nothing from a parent, while `.format(fn)` is a method
(#1133).

**Strategy families are uppercase namespaces.** When an option's value is one of
several named strategies, the family is a capitalized namespace such as
`Overlap.separate` or `Curve.monotone` (#1013). A kind with no required option
is a value as it is, and calling it sets options: `Curve.monotone` is
`Curve.monotone()`, and `Calendar.month({ every: 3 })` sets the step. A kind
with a required option is a call only, as in `Bin.step(0.5)` (#1133). The
details, and why an option with one strategy has no option at all, are in
[Three Surfaces](/internals/design-evolution/three-surfaces).

**Named strategies are presets of one tunable member.** A family offers a few
named choices for the common cases, and each is an exact setting of one
general member whose options span them all. `Shape.hull()` and
`Shape.spine()` are presets of `Shape.blob()` (#1152), and `Overlap.sina()`
and `Overlap.jitter()` are presets of `Overlap.noise()`. The names keep
the common case readable, and the general member reaches the cases in
between without a near-duplicate algorithm.

**Say "visualization" unless it is a chart.** GoFish draws charts, diagrams,
simulations and teaching figures on one substrate. Prose and examples say
"visualization" unless the subject really is a statistical chart.

## The Python surface

Python is Pythonic. Children or data are the first positional argument, and
every option is a keyword argument, in both the pipeline form and the
combinator form: `spread([a, b], dir="x", spacing=0)`, never a dict of options.
Functions, methods and keyword arguments are snake_case (`select_all`,
`stroke_width`) and classes stay PascalCase. The wire format stays camelCase,
and the generated wrapper translates (#1008). See
[Generating the Python factory layer](/internals/frontend/serialization#generating-the-python-factory-layer).

Everything you can write in JavaScript can be written in Python. A story is
exempt from the Python parity check only when it is not a pure GoFish spec,
such as one that draws raw SVG or calls an outside JavaScript library. When a
pure spec uses an option Python lacks, the fix is to expose the option, not
to exempt the story (see
[Constraints as Core](/internals/design/constraints-as-core)).

The goals for Python are fixed and the mechanism is not: Python is as
expressive as JavaScript, through constructs that are simple and compose. How
a construct crosses the bridge, such as when a Python callback runs, which
values are resolved ahead of time and what each round trip carries, is an
implementation choice, judged by those goals and by staying inspectable where
it can.

## Change and dependencies

**Break cleanly.** See
[What follows from it](/internals/design/principles#what-follows-from-it). In
practice: no shims, no deprecated aliases, no options that are accepted and
ignored, and every call site in the repo migrated in the same change.

**Delete a bespoke subsystem fully.** When a privileged subsystem moves into
the general machinery, delete all of it, hard cases included, instead of
gating them to the old path. Axes became ordinary shapes for faceted charts
too, rather than keeping the old axis pipeline alive for them, and facet
alignment, which the old code needed budget machinery for, then came out of
normal layout (#490). See
[What this replaced](/internals/frontend/axes#what-this-replaced).

**Make the change easy, then make the easy change.** When load-bearing code
was not built for a change, first refactor it with the output unchanged, and
show that it is unchanged; then make the change, which is now small. Axis
elaboration first moved axis insertion into a tree-rewrite pass that drew the
same pixels, and only then replaced the bespoke axis nodes with ordinary
shapes. When a known bug in the core makes a change harder, fix it as the
first step rather than working around it and leaving the fix for later.

**Simplify when the output holds.** A simplification is welcome when the
output stays the same, or changes only because a hidden bug is fixed, as long
as it is not wrong and does not oversimplify. Every output that moves is
explained as the bug it fixes (#1015).

**Finish what a feature unlocks.** When a change makes known near-misses
reach full quality, upgrade them in the same change. The slice-and-dice
treemap examples were brought up to full fidelity with the feature that made
it possible, not left as an optional follow-up. "Out of scope" is for what a
missing capability blocks, not for what is only more work.

**A dependency must be the best at its job.** Compare against the platform
standard first, then small focused libraries, then large ones, and say why the
pick wins. Time handling uses the Temporal API and `Intl.DateTimeFormat`, not
d3-time, which cannot handle IANA time zones (#1057). A library is not chosen
because other visualization libraries use it.

## Examples

**Write the convenience wherever it works.** Stories, docs and tests use the
short form whenever it can say the spec, and keep the explicit form for what
it cannot. A line chart is `.mark(line())`, and dots joined by a line are
`.mark(circle()).layer(line())`; a `layer([...])` with `selectAll` is for
what those cannot say, such as joining the marks of another chart.

**No affordance an example does not use.** Name a mark only when a later line
selects it. `.layer()` reads the previous layer's marks without a name, so a
`.name("bars")` that nothing selects suggests a dependency that is not there.

## How a design gets decided

**Hard examples are central.** Test a design on the hardest real examples, not
just the easy ones: calendars and time, H3 hexagon grids, map regions,
published data that is already aggregated. Simple examples fit many designs.
Hard ones narrow the choice, and they often reveal the data type that makes the
special cases go away (#48).

**Show the candidates for real.** Present each candidate spelling on the real
motivating examples, rendered, not as hypothetical snippets.

**Sign off on syntax before implementing.** Agreement in a discussion is not a
decision. The exact spelling is approved first, because that is often when a
better factoring appears: a proposed `.connect(mark, { by })` became a `by` on
the relational mark plus `.layer()` scope (#748).

**Exploration gets a design-space document.** An open question ("how could we
add X?") gets a document that lays out the independent choices, several API
shapes with their trade-offs, and open questions. It does not get a single plan
or an early recommendation.
