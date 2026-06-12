---
title: Re-unifying Operators and Constraints
section: Speculative Notes
order: 30
status: speculative
---

# Re-unifying Operators and Constraints

Open design question: should the layout operators (`spread`, `stack`, `layer`,
`connect`, ...) and the constraint primitives (`Constraint.align`,
`Constraint.distribute`, `Constraint.zAbove` / `zBelow`) sit on the same axis,
or are they two different things that happen to live near each other?

## How we got here

Bluefish unified the two. `Align` was simultaneously an operator (a node in the
component tree that took children) and a relation (the layout engine treated it
as a constraint to satisfy). `Stack` was both a visual container and a
distribution rule. This felt elegant on the surface — one concept, one node
type — but in practice it was awkward for two reasons:

1. **Code organization.** A single component had to be both a layout container
   (with its own bbox semantics) and a constraint (with relational placement
   semantics). The code split poorly along either axis.
2. **Bbox computation.** Once an `Align` is also a container, the bbox question
   gets messy: do you ask the container for its bbox, or do you derive it from
   the children once the constraint is satisfied? Both answers needed special
   cases.

GoFish split them apart. Operators (`graphicalOperators/`) are visual layout
containers — they own a bbox, expose `intrinsicDims`, and render. Constraints
(`constraints/`) are declarative placement relations — they touch
`Placeable.place(...)` and nothing else.

## Where the overlap still lives

The split is clean structurally but the conceptual surface still overlaps in
two specific places.

**`spread` / `stack` vs `Constraint.distribute`.** `spread` is a layout
operator; `Constraint.distribute` is the constraint primitive. The
[constrain docs](/js/api/constraints/constrain) explicitly note that they are
the same operation expressed at two levels:

| Spread                                                     | Constraint equivalent                                   |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `Spread({ dir: "y", alignment: "start" }, items)`          | `align({ x: "start" })` + `distribute({ dir: "y" })`    |
| `Spread({ dir: "x", spacing: 60, mode: "center" }, items)` | `distribute({ dir: "x", spacing: 60, mode: "center" })` |

**`graphicalOperators/alignment.ts` vs `constraints/align.ts`.** Two parallel
implementations of "align children on an axis." The operator form is used
inside `layer` and `Porter-Duff`'s underlying-space resolution
(`unionChildSpaces`); the constraint form is what users write in
`.constrain((c) => …)`. They consume different inputs (`Size<UnderlyingSpace>`
vs `Placeable`) but the _idea_ is the same: take a list, pick an anchor,
move the rest into alignment.

**`scatter` / `position` vs `Constraint.position`.** `Constraint.position`
(`constraints/position.ts`) places a child at an `x`/`y` coordinate that is
either a literal pixel or a `datum` — the same literal-or-datum convention the
`scatter` and `position` operators use, mapping a datum to a pixel via
`posScales[axis](getValue(v))`. Crucially, the constraint participates in
**underlying-space resolution**: a `Layer` folds the _datum_ coordinates of its
`position` constraints into a POSITION domain on that axis
(`collectPositionDomains` → `unionChildSpaces`), then builds the scale over its
own pixel size at layout time. So a `position` constraint carries a _fragment_
of the space-resolution pass, not just a placement — which is the missing piece
for expressing a data-positioned operator (`scatter`) as a union of
constraints. (The `Layer` deliberately does **not** forward that scale to its
non-data children, so SIZE content laid out alongside data-positioned marks is
left to its own alignment.)

## What a re-unification could look like

Two shapes worth considering:

1. **Operators-on-top-of-constraints (status quo, but cleaner).** Operators
   compile to constraints at construction time and disappear as a separate
   concept. `spread({ dir: "y" }, items)` becomes shorthand for
   `Layer(items).constrain((c) => [align({...}), distribute({...})])`. The
   surface API keeps both forms (one composable, one declarative) but only
   one machinery exists below.
2. **One node type with two facets.** Each AST node carries both a "layout
   role" (where do I sit in my parent's bbox?) and a "relation role" (what
   relations do I establish among my children?). This is closer to Bluefish's
   model but with the role separation kept _inside_ one type rather than
   distributed across many.

Option 1 is incremental — most of it already exists (`spread` is built on
`distribute` internally). The remaining work is the two parallel
align implementations.

Option 2 is the more radical re-unification and the one that re-runs into
the bbox-computation tension that drove GoFish to split them in the first
place. Probably not the right move unless something else (e.g. a new
serialization phase from #457 / [Splitting elaboration](https://github.com/gofish-graphics/gofish-graphics/issues/457))
forces a redesign.

## Open questions

- Should the `alignment.ts` operator and `constraints/align.ts` consolidate
  into one implementation (with the operator becoming a thin wrapper)?
- What about z-order? `Constraint.zAbove` / `zBelow` (the new addition in
  [#451](https://github.com/gofish-graphics/gofish-graphics/issues/451)) are
  _only_ constraints — there's no `zOrder` operator. Is that asymmetric or
  natural? Z-order constraints don't carry a bbox, so they have no natural
  operator form. Maybe that's the principle: anything with no bbox is a
  constraint; anything that places into a bbox is an operator.
- Is `connect` really a layout operator, or is it a constraint that happens to
  also render a line? It has a bbox, but its bbox is _derived_ from its
  references rather than holding its own space. Sits awkwardly between the
  two camps.
- See also [[shapes-vs-marks]] for the related question on the mark side.
