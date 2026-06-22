---
title: Composition, Not Enumeration
section: Overview
order: 25
group: Design Philosophy
status: draft
---

# Composition, Not Enumeration

The dominant story about the Grammar of Graphics is that it is a **programming
language for visualization**. Wilkinson framed it that way; ggplot2, Vega-Lite,
and Observable Plot inherited the framing. From the outside it looks plausible —
the systems are declarative, they have named primitives, they have composition
operators. The word "grammar" is in the name.

From inside PL design, this claim is much weaker than it looks. GoG-family
languages are **richly typed configuration grammars**, not programming languages
in the sense that lambda calculus is one. The difference matters: it is the
structural reason that real-world publication-quality charts — the figures in
_Science_, _Nature_, _AMS_ journals, _SOSP_ proceedings, _New York Times_
graphics — do not fit the libraries, and it is the gap GoFish is built to fix.

This essay is the longer-form companion to the [PL &
Compilers](/internals/design/principles) essay's argument about a small core. That
essay describes the architecture GoFish builds. This one describes the structural
weakness in the existing landscape that the architecture is a response to.

## The comb and the tree

Picture a comb. The teeth are slots: a **coord** tooth, a **mark/geom** tooth, a
**scale** tooth, a **facet** tooth, a **theme** tooth. Authoring a chart in
ggplot2 or Vega-Lite is the act of sliding one constructor into each tooth —
`coord_polar()` into the coord tooth, `geom_bar()` into the mark tooth,
`scale_x_log10()` into the scale tooth, and so on. The constructors are a
**closed catalog**: the language ships with a finite set of `coord_*`s,
`geom_*`s, and `scale_*`s, and you cannot author a new one in user code that
behaves like a built-in.

A few teeth — `facet`, `layer`, `concat` — are special: their slot accepts
another comb, not a constructor. That is real composition, and it is the move
that makes faceting and small-multiples work. But the recursion is **bounded**
(only those specific teeth allow it), **non-uniform** (each composing tooth
behaves differently and they do not freely interchange), and **language-author
controlled** (every depth and combination either was implemented up front or
does not work). Try arbitrary `layer`-of-`facet`-of-`layer`-of-`facet` in
Vega-Lite and you discover which combinations the implementers thought through
and which they did not.

The other crucial limitation: the comb composes **at the chart level only**.
_Marks_ do not compose with each other. There is no comb-of-marks. A bar cannot
contain a line cannot contain a chart cannot contain a bar. To compose at all
you have to bubble up to a whole chart, and even then only through the few
designated teeth.

So the comb is **fixed-shape** (teeth enumerated by the grammar designer),
**bounded-depth** (recursion only at designated teeth, only in combinations the
designer implemented), and **coarse-grained** (composition at the chart level,
not the primitive level). This is the structure the dominant story calls "a
programming language."

GoFish replaces the comb with a **tree**. There is one node type
([`GoFishNode`](/internals/overview/architecture#a-chart-is-a-tree)). A node is
either a mark or an operator-with-children. Every operator can take any node as
a child; every mark can in principle be a chart. The composition is recursive
**by definition**, not by enumerated cases. The teeth of the comb become the
children of an operator, and there is no longer a fixed set of them.

## Constructors in slots, not combinators

The PL-theoretic phrasing of the same point: GoG is built out of
**constructors in typed slots**, not **combinators**. A combinator is an
operation that takes things of some kind and returns things of the same kind,
so composition is closed and unbounded. `compose`, `map`, lambda, `bind` —
combinators are what give a PL its generative power. Once you have them, the
language does not need to enumerate the legal arrangements; composition
generates them.

GoG has no combinators of this shape. `coord_polar` is a _constructor_ of
coordinate transforms, not a combinator that takes a coord and returns a coord.
`facet_wrap` is a constructor of facets, not a combinator that takes a facet
and returns a facet. You cannot facet a facet. You cannot put a coord where a
mark goes. You cannot define a new `coord_*` in user code. The grammar
**enumerates** what is allowed; it does not **generate** what is allowed.

Put another way: GoG has nouns but no verbs. It has categories of thing — geom,
scale, coord, facet — but no first-class operations that take any-of-the-things
and return any-of-the-things.

The deepest version of the diagnosis is a contrast between two type-level
shapes. GoG's structure is a **record type with fixed fields**:

```
Chart = { mark, encoding, coord, scale, facet, theme }
```

Some fields contain sub-records (a facet contains a sub-`Chart`), but the
schema is finite and shaped. The structure is _prescribed_.

GoFish's structure is an **inductive (recursive sum) type**:

```
Node = Mark(...) | Operator(children: Node[])
```

The type refers to itself. The structure is _generated_. This is the same shape
distinction as **HTML vs Lisp** (fixed tag schema vs one s-expression that
contains itself), **JSON-with-schema vs s-expressions**, or **database schema vs
programming language**. Record vs inductive; catalog vs generator; **the teeth
of the comb are the fields of the record**.

## The empirical tell

There is a sharper piece of evidence than any of this analysis, hiding in plain
sight in the related-work landscape: **every chart-family extension of GoG is
its own separate compiler.**

Atom (unit charts) is a separate grammar. productplots (mosaics) is a separate
compiler. gemini and animated-Vega-Lite (animation) are separate compilers.
`ggdist` (distributions), `ggraph` (networks), `ggrepel`, `ggrastr`,
`gganimate`, `ggforce` — each is a partial fork of ggplot2's internals, not a
library written _in_ ggplot2. See [Other
Grammars](/internals/overview/other-grammars) for the full survey.

If GoG were a strong PL in the way the dominant story claims, these would be
user-space libraries — written in the grammar, distributed as packages of new
marks and operators, freely composable with each other and with the base
library. They are not. They are forks. **The fact that the extension story for
new chart families is "fork the runtime" is the most direct evidence available
that the grammar does not extend cleanly.** The Cambrian-explosion framing in
[Why GoFish](/internals/overview/why) is the symptom; the closed-catalog comb
is the disease.

A related tell: most of the programmability you _feel_ in ggplot2 belongs to
**R**, not to ggplot2. Strip away `lapply`, `purrr`, the ability to bind a
`geom_*` to a variable and `do.call` it, and what is left is a thin
configuration grammar. The host language is doing the lifting. Same for
Vega-Lite via Altair: the grammar is JSON; everything that feels like
programming is Python wrapping it. This is the visualization-tooling
equivalent of Greenspun's Tenth Rule — every sufficiently complex chart
grammar contains an ad-hoc, informally-specified implementation of half of a
host language, hidden inside the user code that builds the grammar's data
structures.

## Why this causes the publication-chart gap

The structural diagnosis ties directly to a phenomenon that anyone who reads
journals or newspapers feels: real-world publication charts — the figures in
_Science_, _Nature_, _AMS_, _SOSP_, the _NYT_ graphics desk — are markedly
more varied and more complex than what the visualization libraries support.
The standard reading is that this is a _coverage_ problem: the libraries are
missing geoms, missing chart types, missing features, and the fix is to add
more.

The structural reading is different. Publication figures are not built out of
novel marks. They are built out of bars, lines, points, areas, text — the
same primitives every library already ships. What is missing is **the
composition**. A genome-browser track-stack is a `stack` of `chart`s. An NYT
explanatory diagram is a `layer` of a `chart` with annotations. A nested
mosaic is `spread` of `spread` of `rect`s. A small-multiples-of-radial-charts
is `spread` of `coord(polar)` of `chart`. **Real charts are deep compositions
of shallow primitives** — and the comb forbids depth because its primitives
are not closed under composition. The publication-chart gap is not a missing
geom problem; it is a missing combinator problem.

This reframes the goal. Adding `geom_sankey` to ggplot2 does not solve the
deeper problem; it just installs one more tooth on a comb that will be missing
the next tooth too. The deeper fix is to swap the record for an inductive
type — to make composition the generative move, and to keep the primitives
small.

## What this is not

The argument cuts close to several things it does not actually claim, and they
are worth marking off.

**Not a claim that ggplot2 or Vega-Lite are bad.** They are extraordinary
pieces of work and they cover the cases they cover excellently. The argument is
structural: the architecture they share has a ceiling, and the ceiling is
visible from below.

**Not a claim that GoG has no recursion at all.** Facet, layer, and concat
_are_ composition, and they do real work. The claim is that the recursion is
bounded, named, and special-cased, not first-class — a comb with a few teeth
that accept sub-combs, not a tree.

**Not a claim that "more compositional" is universally better.** A more
compositional system is harder to design and to reason about. The
[Turing tar-pit](/internals/design/ui-as-charts#the-risk-the-turing-tar-pit)
discussion is exactly the warning. The bet GoFish makes is that the
compositional ceiling has more to gain than the design discipline has to give
up — but the trade is real.

## What GoFish does instead

GoFish commits to the inductive tree, and the rest of the architecture follows.
The [small typed core](/internals/design/principles#a-small-core) is the
generative substrate. The [recursive fluent
frontend](/internals/frontend/pipeline-syntax) is the surface that exposes the
tree as something a person can write. The
[mark](/internals/frontend/mark-factory) and
[operator](/internals/frontend/operator-factory) factories are the extension
mechanism that lets users author new primitives that behave like built-ins —
the move GoG-family languages cannot make. None of these would survive on a
comb. They all assume the tree.

The Grammar of Graphics opened the door. The thing on the other side is not
a richer comb — it is a different shape.

## Planned contents

- A worked example: the same publication-quality figure expressed as a GoG
  spec (where possible) and as a GoFish tree, with the composition depth
  visible side by side.
- An `internal-comb` GoFish diagram of the comb-with-some-recursive-teeth
  picture, paired with an inductive-tree picture of GoFish.
- A short table mapping each GoG composition operator (`facet`, `layer`,
  `concat`, ggplot2's `+`) to its GoFish analogue, showing which restrictions
  fall away when the structure becomes recursive.
