# GoFish type system: design notes from a discussion with Josh (2026-11-13)

## How to read this

These are hypotheses from a design conversation, not decisions. Nothing here was
checked against the GoFish codebase or the existing schema design, and none of
the code was compiled. Where the current implementation disagrees, flag it
rather than forcing a fit. The "Examples to explore" section is the main ask:
each one is a test that could break the design.

## Core idea

A layout operator is a structure-preserving map from data to space, and its
type is the structure it preserves. Write the type as a nested correspondence
rather than one big `Data → Graphic` arrow, so it says which part of the data
maps to which part of the space:

    stack   : Data⟨order, +⟩ → Space⟨order ↦ position, + ↦ length⟩
    treemap : Data⟨+⟩        → Space⟨+ ↦ area⟩

- `+` means the values are additive (extensive quantities).
- Treemap neither requires nor produces an order: permuting its input gives
  "the same" graphic. Stack both requires and produces one.
- What an operator requires of its input and what it guarantees about its
  output share one structure signature, read on the data side and the space
  side. This is Mackinlay's expressiveness criterion and Kindlmann &
  Scheidegger's algebraic design process, expressed as types in a grammar.

## Who consumes the output (space) type

1. Enclosing operators, to derive their own output type (see "Composition").
2. Axes, labels and legends. An axis visualizes the output type: a length
   axis, a diverging axis, or no axis for area.
3. The reader. The space-side vocabulary (position, length, area, order) is
   the vocabulary perception research uses. Semantic validity = the types
   check; effectiveness = a ranking over output types. Cleveland–McGill alone
   does not cover structure, so the typed structure is the new contribution
   here.

## The two mismatches (where lints come from)

The output type matters most where it differs from the input structure:

- Output has MORE than the data (K–S "hallucinators"): stacking unordered data
  invents an order; a treemap produces adjacency no one asked for. Sometimes
  unavoidable, so the type should be able to mark the structure as
  `arbitrary` so axes do not present it as meaningful.
- Output has LESS than the data (K–S "confusers"): only the bottom series of a
  stack keeps a common baseline, so the upper segments are length-only, not
  position.

## Where the schema lives

Two different things, checked against each other:

- The DATA declares what it has, once per dataset:
  `month: ordered`, `sales: extensive, USD`.
- The CHART requires what it needs. This should be mostly inferred from its
  operators, not hand-written. Checking a spec without data yields a
  constrained polymorphic type.
- APPLICATION checks has ≥ needs. Extra columns are fine (row polymorphism),
  e.g. a simple bar chart applied to a wide table.

Lints fire where a coercion happens at that boundary:

- Data has order, chart takes unordered → structure dropped → warn.
- Chart needs order, data has none → error, or an explicit `arbitrary`
  coercion.

Field-agnostic chart templates are type variables over field names.

## Composition: output types derived by enclosing operators

- Mosaic = stack in x of stacks in y. `+ ↦ length` composed with `+ ↦ length`
  should yield `+ ↦ area`. The area encoding is not declared anywhere; the
  outer operator derives it from the inner type.
- GoFish's treemap does one level per call, so mosaics can be written via
  treemap. A 1D treemap would type as `+ ↦ length` with one free dimension
  (stack minus order) and need the same length-to-area rule.
- Shared axes: small multiples can share a y-axis only if the children's
  y-mappings unify (same unit, same baseline).
- Stacking requires the children's length to mean something additive, which
  is what should reject a stack of means.

## Diverging and cyclic: type classes with an associated type

These tags cannot be inferred from the spec. They are declared on the data and
select behavior, like type class instances. They are not merely defaults: each
adds structure the layout must preserve.

- Diverging = an order plus a distinguished neutral point. Preservation
  demands `neutral ↦ common baseline` (the Likert alignment). Overriding it
  should lint.
- Cyclic = a cyclic order: no min or max, only betweenness. It is NOT a
  subtype of linear order.

The instance changes what stack produces, so the class needs an associated
type (a type chosen per instance; cf. Rust associated types, Haskell type
families, a `type t` in an SML signature):

    class Ordered d where
      type Layout d
      place : [d] → Layout d

    Linear    : Layout = ⟨order ↦ position, first ↦ edge⟩
    Diverging : Layout = ⟨order ↦ position, neutral ↦ baseline⟩
    Cyclic    : Layout = ⟨cyclic ↦ angle, no ends⟩

    stack : Ordered d ⇒ Data⟨d, +⟩ → Space⟨Layout d, + ↦ length⟩

Cyclic only fits a space with an angle, so the class likely takes the
coordinate space as a second parameter (`Fits d s out`, with `out` determined
by `d` and `s`). The coordinate transform therefore has a type too:

| Data   | Space     | Result                              |
| ------ | --------- | ----------------------------------- |
| Linear | Cartesian | exact                               |
| Cyclic | Polar     | exact; ends connect                 |
| Cyclic | Cartesian | needs a cut; drops wraparound; lint |
| Linear | Polar     | invents end-to-end adjacency; lint  |

Exact instances are silent, lossy ones warn, missing ones are errors.

Conventions borrowed from other languages:

- Instance resolution is elaboration (dictionary passing), which should fit
  GoFish's elaboration architecture.
- Coherence: one instance per data type.
- Overrides are explicit retags visible in the spec, e.g. `asLinear(...)` to
  stack Likert data from zero (cf. Haskell's `Sum`/`Product` wrappers).
- Untagged data defaults to Linear, resolved at the chart-to-data boundary.

## Consumers must be polymorphic in the baseline

Three kinds of consumer of a stack's output:

- Doesn't care (frame, spread using only bounding boxes): fully generic in
  `Layout d`, and therefore cannot depend on the baseline.
- Needs a capability (axis, alignment across small multiples): adds its own
  constraint, e.g. `HasReference (Layout d)`, and passes it upward until the
  data type is known.
- Branches on the baseline: needs an instance per layout. Risk of n×m
  instances; mitigate with a small common interface on layouts (every layout
  exposes a reference point: edge, neutral point, or none).

## Bidirectional organization

- Synthesizes (bottom-up): data types (declared); operator output types.
- Checks (top-down): coordinate space pushed to children; a shared axis's
  expected type pushed to each child.
- They meet at instance resolution (`d` from below, `s` from above, `out`
  synthesized) and at chart-applied-to-data, which is the single place
  subsumption happens and so the single place lints fire.
- Checking siblings against the axis's type replaces finding a join of
  sibling types, and gives local errors ("this child isn't diverging").
- Tags (diverging, cyclic) are the annotations needed where neither direction
  determines the type.
- Caveat: operators are nearly all constructors, so check vs. synthesize must
  be chosen per operator argument by design; it does not fall out of
  intro/elim forms.

## Lean sketch (uncompiled)

A class is a structure, so the associated type is just a field.

```lean
class Ordered (d : Type) where
  Layout : Type
  place  : List d → Layout

structure Linear    (α : Type) where val : α
structure Diverging (α : Type) where val : α
structure Cyclic    (α : Type) where val : α

structure EdgeAligned     (α : Type) where items : List α
structure BaselineAligned (α : Type) where
  neg : List α
  pos : List α

instance : Ordered (Linear α) where
  Layout := EdgeAligned α
  place xs := ⟨xs.map (·.val)⟩

-- Neutral, splitAtNeutral, Angular, wrapAround are placeholders
instance [Neutral α] : Ordered (Diverging α) where
  Layout := BaselineAligned α
  place xs := splitAtNeutral xs

def stack [Ordered d] (xs : List d) : Ordered.Layout d :=
  Ordered.place xs

inductive Coord | cartesian | polar

class Fits (d : Type) (s : Coord) (out : outParam Type) where
  place : List d → out

instance : Fits (Cyclic α) .polar (Angular α) where
  place := wrapAround
```

- Laws can be instance fields (e.g. `mono : ∀ a b, a ≤ b → pos a ≤ pos b`),
  which makes "this operator has this type" a literal proof obligation.
- Lean has no coherence; instances can be passed explicitly.
- Exact vs. lossy is not built in; model it, e.g. with an `Exact` class that
  only lossless pairs implement.
- Suggested role: Lean for stating and checking laws, not as the surface
  design. Users write tags, never instances.

## Examples to explore (each could break the design)

1. Mosaic: does `length × length ⇒ area` derive cleanly from stack-of-stacks?
2. Mosaic via one-level treemap: same output type by a different route?
3. Squarified treemap, where the split direction alternates: does the
   composition rule still give `+ ↦ area`? (Not worked through.)
4. Stacked means: rejected by the additivity requirement?
5. Small multiples with a shared axis: do children's mappings unify?
6. Mixed siblings under one shared axis (one diverging, one linear): error, or
   a join such as "linear = diverging with its neutral point at the edge"?
   This is the most likely source of a counterexample.
7. Likert chart: tagging data diverging changes baseline and axis with no
   spec change; `asLinear` override lints.
8. Radial chart: cyclic data in polar space connects the ends; check the
   other three cells of the table produce the stated lints/errors.
9. Stacked bar, upper segments: can the type express "length only, no common
   baseline"?
10. Bar chart on a wide table: inferred requirement smaller than the data
    schema; extra columns accepted.
11. Unordered categories into stack: `arbitrary` order marked in the output
    type and respected by the axis.

## Open questions

- How much of the space type do enclosing operators really need? The three
  composition cases suggest "enough to justify it", but only those were
  examined.
- Does two-parameter resolution with an associated type stay easy under
  nesting? The hope is yes because tags are always declared, so resolution
  flows one way. Unverified.
- Does a join exist for every sibling pair that matters (example 6)?
- Per-argument check/synthesize modes for each operator.
- Cheap verification of operator types short of synthesis: metamorphic tests
  (permute input → treemap output invariant up to relabeling; scale values →
  lengths scale). Suits black-boxed algorithms.
- Does the type traversal mirror the layout pass (constraints down, sizes
  up)? Unknown for the new engine.

## References

- Mackinlay 1986, "Automating the Design of Graphical Presentations"
  (expressiveness / effectiveness).
- Kindlmann & Scheidegger 2014, "An Algebraic Process for Visualization
  Design" (hallucinators, confusers).
- Cleveland & McGill 1984, graphical perception.
