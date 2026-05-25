---
title: Shapes vs Derived Marks
section: Speculative Notes
order: 40
status: speculative
---

# Shapes vs Derived Marks

Open design question: are shapes (`rect`, `ellipse`, `polygon`, `text`, ...) and
derived marks (composite marks built with `createMark`) the same kind of thing,
or different kinds of things that we happen to render through the same
pipeline?

## How we got here

In Bluefish, shapes, marks, and constraints were all the same kind of thing:
a `Component`. A `Rect`, an `Align`, and a user-defined `Bracket` glyph all
looked structurally identical to the engine. This was conceptually elegant —
one node type, one render path — but it muddied the distinction between
"primitive visual element" and "structured composite of other elements."

GoFish has moved partway toward separating them but stops short of a hard
type-level split.

## The categories today

**Shapes** (`src/ast/shapes/`) — `rect`, `ellipse`, `polygon`, `text`, `image`,
`petal`, `ref`. Each maps to a single SVG primitive (or a tiny cluster, in the
case of `image`). They are leaf nodes in the AST. Their props can be either
literals (`rect({ w: 80 })`) or data channels (`rect({ h: "value" })`) — the
channel form is what makes them work as data-bound marks in the v3 fluent API.

**Derived marks** (built with `createMark` from `withGoFish.ts`) — user-defined
composites whose body is a `Layer` of shapes plus `.constrain(...)` rules.
`PulleyCircle` and `Weight` in the
[pulley story](/js/examples/pulley) are examples: each takes a few literal
parameters (`r`, `width`, etc.) and produces a structured glyph.

## The hybrid

The hybrid is most visible in v3:

```ts
// shape used as a data-bound mark
chart(data).mark(rect({ h: "value", fill: "category" }));

// derived mark used the same way
chart(data).mark(PulleyCircle({ r: 25 }));
```

The engine treats both the same — they're both `GoFishAST` nodes with
`resolveUnderlyingSpace` and `layout`. But the shape can channel-bind its
parameters; the derived mark cannot. `PulleyCircle({ r: "value" })` doesn't
work the way `rect({ h: "value" })` does.

That's the tension. The two categories are structurally identical to the
layout engine but they expose different surface affordances to the author.

## Why this matters

- **Predictability.** A user who can write `rect({ h: "value" })` reasonably
  expects to write `PulleyCircle({ r: "value" })` too. Today it silently
  doesn't channel-resolve.
- **Composition.** If derived marks could channel-bind, they'd be true
  first-class glyphs — Bluefish-style — and the line between "shape" and
  "mark" becomes a question of whose internals are visible vs hidden, not
  whose data binding works.
- **Type system.** [#452](https://github.com/gofish-graphics/gofish-graphics/issues/452)
  (underlying space as a type system) implicitly draws a line between things
  that resolve their own underlying space (shapes, operators) and things that
  defer to children (composites). It might be worth surfacing that distinction
  explicitly at the AST level.

## What a sharper split could look like

Three rough directions:

1. **Make derived marks channel-aware.** `createMark` reads its parameters'
   types; string-valued parameters are interpreted as channel references and
   resolved against the surrounding `chart(data)` scope at construction time.
   The author writes `PulleyCircle({ r: "weight" })`; the engine resolves
   `"weight"` per row. This is the path that makes the two categories converge
   ergonomically.
2. **Keep them separate but make the boundary visible.** A composite is an
   AST subtree that the engine sees through (descendable for refs, constraints,
   z-order); a shape is opaque. The author always knows which they're using
   because the construction sites look different (`createMark` vs `rect`).
   Today's behavior, made explicit in the type signatures.
3. **Treat shapes as a special case of marks.** Roll `rect` etc. into the same
   factory shape as `createMark`'s output; the only difference is that their
   "body" is one SVG element instead of a `Layer`. Brings GoFish closer to the
   Bluefish single-node model — re-introduces the bbox-computation tension
   from [[operators-vs-constraints]].

(1) is the most user-visible change and probably the highest payoff. (3) is the
most architecturally radical and the one most likely to reawaken old pain.

## Open questions

- Should `createMark` parameters be channel-resolvable?
- Is there a meaningful difference between a shape and a single-element
  composite? If not, why are they implemented differently?
- The macro-expansion proposal in
  [#144](https://github.com/gofish-graphics/gofish-graphics/issues/144) (label
  as macro) sits in this space — it lets a mark emit _other_ AST nodes at
  construction time, which is most useful for composites. Worth thinking
  through together.
- See also [[operators-vs-constraints]] for the other side of the unification
  question.
