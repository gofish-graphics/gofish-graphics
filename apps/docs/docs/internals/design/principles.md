---
title: PL & Compilers
section: Overview
order: 21
group: Design Philosophy
status: stable
---

# Programming Languages & Compilers

## Correctness and expressiveness

Programming-language design is a constant negotiation between two goals:
**expressiveness** — letting you say as much as possible — and **correctness** —
ruling out whole classes of error. The craft is to push both at once: a good
language is maximally expressive _and_ keeps you safe in some well-defined sense.
**Rust** is the modern inspiration here: its borrow checker rules out entire
categories of memory error without surrendering the low-level control that makes a
systems language worth using — both dials turned up at once.

The crucial word is _some_. A language's notion of correctness is **internal**: a
type system guarantees a program is well-formed, not that it is a _good idea_. It
will happily let you write a slow, pointless, or ugly program — it asks only that
the program be sound on its own terms.

GoFish takes the same stance for charts. It aims to be maximally expressive — to let
you describe an enormous range of graphics — while being correct in an _internal_
sense: the chart you specify is the chart that gets laid out and rendered. **GoFish
designs for internal correctness, not external utility.** It does not decide whether
your chart is a good idea.

That is a deliberate break from much of the visualization world. Many charting
libraries design _against_ expressiveness on purpose. They encode taste — pie charts
mislead, dual-axis charts are dishonest, scatterpies are abominations — and so make
those charts hard or impossible to express. That is designing for _external
utility_: _is this chart a good idea?_ GoFish does not.

Color tells the same story. Many libraries offer only a curated set of
perceptually optimal palettes — viridis, ColorBrewer — because those are held to be
the _correct_ colors. But the perceptually optimal palette is not always the one
you want or need: brand colors, a deliberately muted or high-contrast palette,
colors matched to a printed page. Locking the palette down is one more bet on
external utility. GoFish ships the perceptually-tuned scales — and also lets you
pick whatever colors the chart actually calls for.

Why not? Because it barely works. Trying to make "bad" charts inexpressible is like
trying to design a programming language in which **bubble sort cannot be written,
because it is slow**. That is nearly impossible: bubble sort is built from the most
universal primitives there are — a loop, a comparison, a swap. To forbid it you
would have to forbid _those_, and you would no longer have a usable language. A
dual-axis chart or a scatterpie is no different: each is built from universal
graphical primitives — marks, positions, composition. Forbid those and there is no
graphical language left.

The charting world has its own bubble sorts. Three concrete examples:

- A **pie chart** is what falls out of having polar coordinates _at all_. Once a
  `coord` transform can map a stacked bar from Cartesian to polar, the pie chart
  is the same spec under a different `coord`. Forbidding the pie means forbidding
  polar — and polar is the price of rose charts, donut charts, sunbursts, clock
  faces, circular dendrograms.
- A **scatterpie** is what falls out of allowing a chart to be a mark inside
  another chart. The moment a `pie(...)` chart can be passed to `scatter(...)`'s
  `.mark(...)` slot, scatterpies exist. Forbidding the scatterpie means
  forbidding chart nesting — and nesting is the price of small multiples,
  facets, ridgelines, and almost every composite diagram.
- A **dual-axis chart** is what falls out of `layer`. Stack two charts on top of
  one another and each contributes its own y-scale. (There may be ways to
  _disallow_ this — refuse to overlay incompatible position scales, or fold them
  into a shared underlying space — but the path of least resistance from `layer`
  is dual axes.) Forbidding dual-axis means forbidding free layering, which is
  the price of error bars, annotation layers, and connected scatter plots.

In each case the "bad" chart is _not_ the special case; it is the generic case.
The expensive thing is the restriction.

At a high enough level of abstraction you _could_ pull it off. A language whose only
sorting construct is a built-in `sort` cannot express bubble sort at all. Nor can a
**predicate language** — one where you write not an algorithm but a specification
(_the result is an ordered permutation of the input_) and leave the runtime free to
satisfy it with whatever fast algorithm it likes. But both are far narrower
languages at a far higher level of abstraction. GoFish is deliberately not there: it
is an expressive substrate of graphical primitives, not a closed catalog of
approved chart types.

So GoFish chooses maximal expressiveness, with correctness defined internally. The
rest of this essay is about the machinery that makes that choice tractable — and
most of it is borrowed from compilers.

## A small core

GoFish is built like a **compiler**. A chart is a program; the renderer is a
multi-pass compiler that lowers it to SVG. The single idea that shapes GoFish's
compiler side is one it borrows directly from GHC, the Glasgow Haskell Compiler:

> **A large surface language, desugared into a small, uniform core.**

GHC's source language — Haskell — is enormous: hundreds of pages of manual, dozens
of syntactic forms, 100-plus constructors. GHC does not optimize or generate code
for _that_. It **typechecks and desugars** Haskell into **Core**, a tiny typed
intermediate language — famously about three types and fifteen constructors — and the
entire rest of the compiler works only on Core.

GHC is not unique in this. **Lean** — a dependently-typed language and proof
assistant — _elaborates_ an enormously rich surface syntax down to a tiny, trusted
**kernel**; it is the kernel, not the surface, that has the final word on whether a
term is well-formed. A large surface lowered onto a small core is a recurring
architecture worth borrowing, not a GHC quirk.

GoFish has the same shape:

| GHC                                           | GoFish                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Haskell — a large surface language            | The frontend — the `chart().flow().mark()` builder, plus convenience methods like `.facet()` and high-level constructs such as **axes** and **labels** |
| Typecheck + Desugar                           | [Pipeline desugaring](/internals/frontend/pipeline-syntax) — convenience methods unfold into operator applications; the builder resolves into a tree   |
| Core — a small typed IL                       | The `GoFishNode` AST — a small set of _primitive_ node kinds: basic marks and graphical operators                                                      |
| Rest of GHC — analysis, optimization, codegen | The [three render passes](/internals/overview/architecture) — domain inference, layout, placement                                                      |

Everything a reader can _write_ lives in the surface language. Everything the engine
_reasons about_ lives in the core. The two are deliberately different sizes.

## Why keep the core small

Three reasons, lifted from Simon Peyton Jones's talks on GHC — and all of them
load-bearing for GoFish:

**1. The hard passes only ever face a small language.** Domain inference, layout, and
placement are the intricate part of GoFish. A small core means each of them handles a
handful of node kinds, not the sprawling surface API. New surface sugar costs the
passes nothing — it has desugared away before they run.

**2. The core is checkable.** In GHC a checker called _Lint_ verifies that every pass
produces well-typed Core: the desugarer must emit well-typed Core, and every
optimization pass must turn well-typed Core back into well-typed Core. Lint is a
powerful internal consistency check on most of the compiler — and it is feasible only
because Core is small. The same logic holds for GoFish: a small, uniform core is
something you can write a single structural validator for and run after every pass; a
sprawling core is not. GoFish does not have that validator yet, but a small core is
exactly what keeps it within reach.

**3. The core is a sanity check on new features.** SPJ's third point: _"If you can
desugar it into Core, it must be sound; if not, think again."_ For GoFish that is a
concrete design rule. A proposed mark, operator, or piece of surface sugar earns its
place only if it desugars into the _existing_ core. If it cannot, that is not a reason
to enlarge the core — it is a signal to rethink the feature. The core grows slowly,
and on purpose.

**Axes** and **labels** are the standing example. Both are _frontend_ constructs,
not core node kinds: an axis or a label resolves into ordinary core marks — lines,
ticks, text — so neither has to widen the core. That is exactly why they sit in the
Frontend section of this wiki — [Axes](/internals/frontend/axes) and
[Labels](/internals/design/label-syntax) — and not in Core.

(A truth-in-advertising note: axes and labels desugar in spirit more than in
implementation today. The renderer special-cases their placement rather than
running them through the same desugaring path the rest of the frontend takes.
The aspiration is to fold both into the same scheme. **Treemaps** are an even
more aspirational example: a treemap algorithm fits the same shape — desugar
the user spec into nested rectangles laid out by ordinary `spread`/`stack` /
`scatter` operators — but the engine cannot do that today.)

## What follows from it

This one principle explains much of the rest of GoFish:

- **Desugaring over special-casing.** Convenience methods (`.facet()`, `.stack()`)
  are pure sugar over `.flow(...)` — see [Pipeline
  Syntax](/internals/frontend/pipeline-syntax).
- **Prefer a polymorphic operator to a family of near-duplicates.** When two
  proposed operators share most of their semantics — `stackX`/`stackY`,
  `spreadX`/`spreadY` — the cheaper move is one operator that takes the
  variation as an option (a `dir` of `"x"` vs `"y"`). The motivation is _core
  surface area_, not user ergonomics: parallel operators each have to be
  reasoned about by every pass, and each lands as a separate desugaring target.
  Folding them into one keeps the set of node kinds the passes face small,
  without committing to a single "do everything" operator. The rule is "fold
  near-duplicates," not "everything must be one operator."
- **Breaking APIs cleanly** rather than accreting compatibility shims — the surface
  is _allowed_ to churn precisely because it is only surface; the core stays
  stable.
- **Multi-pass rendering** — domain inference → layout → placement is a compiler
  pipeline over the core (see the [Architecture
  Overview](/internals/overview/architecture)).
- **Loud errors, not broken pictures.** A spec that is ill-formed should
  fail at the surface with a message that names the violated assumption —
  not render a wrong chart that the user has to reverse-engineer. The
  channel-type taxonomy is the first piece of this; [Why
  GoFish](/internals/overview/why#5-loud-errors-instead-of-broken-charts)
  motivates it.

## More PL ideas

The compiler-pipeline framing is the spine of this pillar, but not all of it. Other
programming-languages ideas thread through GoFish and deserve their own treatment:
**hygienic scoping** for [names](/internals/core/names-and-scoping), by analogy to
hygienic macros; the [monotonic algebra](/internals/core/monotonic) as a form of
abstract interpretation; and a categorical reading of the frontend. They are
flagged here and expanded elsewhere as the wiki grows.

---

_The compiler-architecture framing is adapted from Simon Peyton Jones's talks on the
design of GHC — in particular the case for a small, typed intermediate language._
