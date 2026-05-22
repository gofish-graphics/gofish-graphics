# Constraint / Relation Evaluation in `layer`

## Status

Design discussion. No decision yet. Prompted by porting Bluefish's `pulley`
example — a constraint diagram where dimension labels sit beside connector
ropes that themselves run between constraint-placed pulleys.

## The model today

GoFish splits layout into two kinds of things:

- **Relations** (`spread`, `stack`, `layer`, …) — total layout functions. Given
  a subtree of children, they _fully place_ those children and expose a
  bounding box. They compose as a tree, bottom-up.
- **Constraints** (`Constraint.align`, `Constraint.distribute`) — _partial_
  layout fragments. They place some axes of some referenced nodes; they do not
  produce a self-contained bbox. They only have meaning inside a `layer`.

`layer` is the relation that _binds_ constraints: it takes a list of children
plus a `.constrain()` list of fragments and guarantees a fully-placed result.
It does this in three fixed phases (`graphicalOperators/layer.tsx:101–168`):

1. **Lay out every child once.** Children named in _any_ constraint are
   collected into `constrainedNames` and skip baseline placement; everything
   else is baseline-placed at `(0,0)`.
2. **`applyConstraints`** — place the constrained children, in declaration
   order.
3. **Re-layout pass** — re-run `.layout()` on the _unconstrained_ children once
   more, so any internal `ref()`s observe final positions.

This split is good and worth keeping. Most things genuinely are relations;
pulling the irregular relational bits out into constraints scoped to a `layer`
is what keeps the common case clean and keeps us from having to answer "what is
the bbox of a bare `align`?" — the `layer` is the binder that answers it.

## The problem

The split assumes a layer's children are _independent of_ its constraints:
phase 1 lays out children, phase 2 resolves constraints, done. That assumption
breaks for **ref-consuming marks** — `connect` (and `arrow`). A `connect` is a
child of the layer, but its geometry is a pure function of the _resolved
positions of other nodes_ it reaches laterally via `ref()`. It is not a
function of its own subtree.

So `connect` is a third kind of thing that the taxonomy doesn't name. It is not
a relation (it places nothing) and not a constraint (it renders and has a
bbox). Call it a **derived mark**: its layout is `f(other nodes' final
positions)`.

Concretely, in the pulley:

```
circles ──(distribute / align)──▶ placed
                                    │
                            connect reads them ──▶ rope path + bbox
                                                       │
                                          distribute(rope, label) ──▶ label placed
```

This chain has depth 4. The 3-phase engine only reaches depth 3:

- A `connect` that is **unconstrained** is re-laid-out in phase 3, so it _does_
  see the phase-2 circle placements. This is the only reason connectors work at
  all today — phase 3 is load-bearing.
- A `connect` that is **referenced by a constraint** (e.g. `distribute(rope,
label)`) lands in `constrainedNames`. It then skips phase 1 baseline
  placement _and_ skips phase 3 — so it's frozen with a stale phase-1 path. And
  even if it weren't frozen, phase 2 runs the label's constraint _before_ any
  phase-3 fixup could help.

So the precise broken case is: **a constraint that references a derived mark.**
Anything past depth 3 of the dependency chain is unreachable.

`constrainedNames` also conflates two roles. `distribute(rope, label)` _reads_
`rope` (anchor) and _writes_ `label` (target), but both are dumped into the
same "frozen" set. The read/write distinction already exists implicitly at
apply time (`applyDistribute` treats the first already-placed child as the
anchor) — it's just computed too late and too coarsely.

## Is there a contortion-free expression today?

Mostly no, and it's worth being precise about why.

A derived mark reading **relation-placed** nodes is fine: if the cluster were
built with `spread`/`stack`/nested `layer`s, those run in phase 1 in child
order, so a `connect` listed _after_ the cluster sees placed nodes during its
own phase-1 layout. (This is why PythonTutor's arrows work — its heap is
`Spread`-placed.)

A derived mark reading **constraint-placed** nodes is the broken case — and
constraints are precisely the right tool for the pulley's irregular,
overlapping, 2-D cluster. Expressing that cluster with relations + spacer
`blank`s would itself be a contortion. So the pulley is squarely in the gap:
the natural tool (constraints) for the cluster is what makes the connectors —
and labels on them — unreachable.

The current port's workaround is to anchor dimension labels to the _circles_
instead of the _ropes_. It reads fine but it isn't faithful, and it's a
contortion the model forced.

## How Bluefish avoids this

Bluefish has no children/constraints split. Shapes and layout operators are all
siblings in one list, evaluated in a single declaration-ordered DFS
(`layout.tsx`: `for (const childLayout of childLayouts()) childLayout(...)`).
A `Line` is just a sibling; authors place it _after_ the `Distribute`s that
position its endpoints, so by the time it runs, its inputs are resolved.
Bluefish also tracks **per-dimension ownership** (`bboxOwners`,
`mergeBBoxAndTransform` in `scenegraph.ts`) so many operators can touch one
node without conflict.

The cost is exactly what GoFish set out to avoid: the author hand-orders a flat
soup of siblings, and everything is mutually referential. We do **not** want to
go back to that authoring model. But the _engine_ idea underneath — evaluate in
dependency order — is the part worth taking.

## Design space

### O1 — Accept the limitation

Document "a constraint cannot reference a derived mark." Keep anchoring labels
to nearby shapes. Zero code. But it permanently rules out a natural class of
diagrams (labeled connectors, edge labels in node-link diagrams) and the
restriction is non-obvious to users.

### O2′ — Spec-ordered constraint list + lazy refresh (recommended lean)

The constraint list in `.constrain()` is already an ordered, author-managed
stream: `applyConstraints` runs entries in declaration order, and the
"first-already-placed child is the anchor" rule in `align`/`distribute` already
makes that order load-bearing. Today this stream just can't _observe_ a
derived mark in a fresh state. O2′ makes it observe.

#### The three kinds of layer child

A complete spec has to be explicit about what a `layer`'s children are. There
are three, and `refresh` (below) treats them differently:

- **Shapes** (`rect`, `circle`, the `PulleyCircle`/`Weight` components) —
  contribute an intrinsic _size_ from their own layout; their _position_ is
  assigned by a constraint.
- **Derived marks** (`Connect` ropes, `arrow`) — geometry is a pure function
  of the _resolved positions_ of the nodes they `ref`. They read; they place
  nothing of their own.
- **Target marks** (`text` dimension labels) — mechanically identical to
  shapes (intrinsic size, constraint-assigned position); named separately only
  to mark intent.

#### Full example — the pulley

```ts
const ROPE = { stroke: "#774e32", strokeWidth: 3 } as const;

Layer([
  // shapes — intrinsic size; position assigned by the constraint list below
  rect({ w: 9 * r, h: 20, fill: "#C9C9C9" }).name("rect"),
  PulleyCircle({ r }).name("A"),
  PulleyCircle({ r }).name("B"),
  PulleyCircle({ r }).name("C"),
  Weight({ width: 30, height: 30, label: "W1" }).name("w1"),
  Weight({ width: 85, height: 30, label: "W2" }).name("w2"),

  // derived marks — each rope's geometry is a pure function of the resolved
  // positions of the two nodes it ref()s. A single anchor (source OR target)
  // is clamped onto the other box; see "connect source/target anchors".
  Connect({ ...ROPE, target: [0.5, 0.5] }, [ref("rect"), ref("B")]).name("l0"),
  Connect({ ...ROPE, source: [0, 0.5], target: [0.5, 0.5] }, [
    ref("B"),
    ref("A"),
  ]).name("l1"),
  Connect({ ...ROPE, source: [1, 0.5], target: [0, 0.5] }, [
    ref("B"),
    ref("C"),
  ]).name("l2"),
  Connect({ ...ROPE, target: [1, 0.5] }, [ref("rect"), ref("C")]).name("l3"),
  Connect({ ...ROPE, source: [0, 0.5] }, [ref("A"), ref("w1")]).name("l4"),
  Connect({ ...ROPE, source: [1, 0.5] }, [ref("A"), ref("w2")]).name("l5"),
  Connect({ ...ROPE, source: [0.5, 0.5] }, [ref("C"), ref("w2")]).name("l6"),

  // target marks — dimension labels, positioned entirely by constraints
  text({ text: "x" }).name("t1"),
  // …t2 … t6…
]).constrain((c) => [
  // ── cluster: places the shapes ──────────────────────────────────────
  Constraint.distribute({ dir: "x", spacing: -r }, [c.A, c.B]),
  Constraint.distribute({ dir: "x", spacing: 0 }, [c.B, c.C]),
  Constraint.distribute({ dir: "y", spacing: 40 }, [c.B, c.rect]),
  // …rest of cluster + weights…

  // ── labels on ropes: read a derived mark, place a target mark ───────
  Constraint.distribute({ dir: "x", spacing: 5 }, [c.l1, c.t1]), // l1 = anchor
  Constraint.align({ y: "middle" }, [c.l1, c.t1]),
  // …t2…t6…
]);
```

`l1` is just another named child. The only thing that makes it special is that
its `.layout()` reads `ref("B")`/`ref("A")` instead of computing geometry from
its own props — so its result is only meaningful _after_ B and A are placed.

#### The `refresh` operation

`refresh(node)` re-derives a node's geometry from current state:

1. Re-run `node._layout(...)`, producing fresh `intrinsicDims` / `renderData`.
2. Keep any `transform.translate` axis a constraint already set (constraints
   write translate via `place()`); take the rest from the new layout.

For a **derived mark** this recomputes the path/bbox against wherever its
`ref`s currently sit. For a **shape** or **target mark** it's a geometry no-op
(their size is constant) and step 2 preserves any placement — so `refresh` is
safe to call on _any_ read-child unconditionally; it only does real work for
derived marks.

#### Evaluation algorithm

`layer` resolves its body in three steps:

```
1. Lay out every child once — intrinsic size for all; derived marks get an
   initial (stale) geometry. Baseline-place children no constraint will
   position.                                          [≈ today's phase 1]

2. For each constraint C in .constrain() order:
     a. refresh(R) for each read-child R of C
     b. apply C — place C's target children relative to the fresh read-child

3. refresh(D) for every derived mark D — a final sweep so the *rendered*
   geometry reflects all placements.              [replaces today's phase 3]
```

Step 2a is the fix. When `C = distribute([l1, t1])` is reached, `refresh(l1)`
runs; because the cluster constraints earlier in the list already placed B and
A, `l1` recomputes a correct path/bbox, and `t1` is anchored to _that_.

Step 3 replaces phase 3 but is far narrower: today's phase 3 re-lays-out _every
unconstrained child_; step 3 touches _only derived marks_. For any rope already
refreshed in step 2a whose `ref`s weren't moved afterward it's a no-op; it
exists to catch ropes no constraint reads and to keep rendering correct.

#### Identifying a constraint's read-child

Step 2a needs to know which child a constraint _reads_ vs _writes_. Today
that's implicit ("anchor = first already-placed") — resolved too late to drive
a refresh, and slightly circular. O2′ assumes the anchor becomes **positional**:
`Constraint.distribute([anchor, ...targets])`, `Constraint.align([anchor,
...targets])` — element 0 is the read-child, the rest are written. Small
breaking change; in practice authors already list the anchor first.

#### Properties

- **One ordering stream, already author-curated.** The `.constrain()` list is
  the spec order; the children list stays declarative (its order is just
  z-order).
- **Author-managed, like Bluefish — but scoped.** Only the constraint list is
  order-sensitive. A mis-ordered list (label-on-rope before the cluster)
  silently produces stale output — the same failure mode Bluefish has, and one
  authors already navigate today via anchor ordering.
- **Phase 3 shrinks** to a derived-mark sweep — no more re-layout of every
  unconstrained child.
- **Small surface.** The phase-2 loop gains step 2a; `_node.ts` gains a
  `refresh` helper; `align`/`distribute` adopt a positional anchor.

#### Open questions

- _Bidirectional `distribute`._ Today `distribute` can place children on both
  sides of a mid-list anchor. A strict `[anchor, ...targets]` form distributes
  one direction; placing "before" the anchor needs negative spacing or a second
  constraint. Acceptable, but worth checking against existing uses.
- _External refs._ A child that `ref`s something _outside_ the enclosing layer
  is fine — that ancestor was placed before the layer ran; no local refresh.
- _A read derived mark whose deps move later._ Step 3 keeps the render correct,
  but the dependent target mark was placed against the step-2 geometry. Only
  happens in a mis-ordered spec; O2 (dep order) is the hard guard if it ever
  matters.

### O2 — Dependency-ordered evaluation inside `layer` (robust variant)

Same mechanism as O2′ (refresh read-children before applying a constraint),
but the _order_ comes from a topological sort over `{children} ∪
{constraints}` rather than from the author's constraint-list ordering. Edges:
a derived-mark child depends on the nodes it `ref`s; a constraint depends on
the children it reads.

Buys robustness: the engine can't be mis-ordered, and the depth-3 ceiling
generalizes to arbitrary depth automatically. Costs more machinery — a small
dep graph per layer and cycle handling — and pays off most when constraint
lists start being _generated_ or _composed_ programmatically rather than
hand-written. For hand-written constraint lists, O2′ is the same outcome with
less code.

Treat O2 as a future upgrade path on top of O2′, not a competing direction.

### O3 — Iterate phases 2–3 to a fixpoint

Loop `{ applyConstraints; re-layout }` until stable instead of running each
once. Smaller change than O2, handles arbitrary depth. But it needs constraint
placements to be _re-settable_ (today they're "placed once"), convergence is
less obvious than an explicit order, and it does redundant work. O2's explicit
order is more predictable; prefer it unless the graph machinery proves heavy.

### O4 — Per-dimension bbox ownership

Bring back Bluefish-style `bboxOwners` + set-bbox-or-transform merge. This is
**orthogonal to the pulley bug** — that bug is ordering, not conflict. Today's
coarse per-axis `isPlacedOn` is enough for the pulley (nothing fights over a
dimension). Full ownership matters when two constraints legitimately want the
same node+axis with "first owner wins, others slide via transform" semantics.
Worth doing eventually for general relational layout; not on the critical path
here. Note that O2 _does_ need the minimal seed of it — a read vs. write
distinction per constraint.

### O5 — Eager bbox derivation

When enough of a box is known, fill in the rest (`right = left + width`,
`left = centerX - width/2`, …). Also orthogonal to the ordering bug — it
doesn't change _when_ a derived mark is evaluated. But it's a genuine cleanup:
it makes partial placements more complete, so constraints "finish" sooner and
fewer downstream reads see `undefined`. Worth adopting independently of O2.

### O6 — Unify children + constraints into one ordered authoring stream

The literal Bluefish model. Rejected: it reintroduces exactly the
hand-ordered-soup mess the split was designed to remove. O2 keeps the clean
authoring model and moves the ordering into the engine.

## On the specific questions

- **Is the model too restrictive?** The _taxonomy_ (relations / constraints /
  layer-as-binder) is sound — keep it. The _evaluation strategy_ is too
  restrictive: 3 fixed phases assume children ⊥ constraints, which derived
  marks violate. Fix the engine, not the taxonomy.
- **Do we need the double layout?** Today, yes — phase 3 is the only thing
  making connectors work. But it's a crutch for missing ordering, capped at
  depth 3. Under O2′ (or O2) it disappears: a derived mark is refreshed
  exactly when a constraint reads it, plus one cheap final sweep for derived
  marks no constraint references.
- **Bbox ownership / eager derivation?** Both are good and both are
  _orthogonal_ to this bug. Eager derivation (O5) is a low-risk cleanup worth
  doing now. Full ownership (O4) is a larger, separate effort for
  genuinely-conflicting constraints; O2 only needs its minimal read/write seed.

## Recommendation

Keep relations / constraints / `layer`-as-binder. Pursue **O2′** — refresh a
constraint's anchors before applying it, leaning on the spec-ordered
constraint list the author already curates. This is the smallest change that
fixes the broken case, deletes phase 3, and matches Bluefish's proven
author-ordered model without resurrecting Bluefish's children-and-operators-
as-siblings soup. Treat **O2** (dep-ordered) as a future robustness upgrade
that becomes worth doing if constraint lists start being generated
programmatically. Adopt **O5** (eager derivation) as independent cleanup.
Defer **O4** (full ownership) until a real conflicting-constraint case
demands it.

Suggested next step: prototype O2′ on the pulley story (anchoring labels to
ropes) and confirm phase 3 can be removed.
