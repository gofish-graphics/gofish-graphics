---
title: "Sketch: A Core IR and a Display List Below the Frontend IR"
section: Speculative Notes
order: 35
status: speculative
---

# Sketch: A Core IR and a Display List Below the Frontend IR

**Question.** The [Frontend IR](/internals/frontend/serialization) serializes a
GoFish spec at the _source_ level — `chart(data).flow(...).mark(...)`, before
macro expansion and elaboration. That is the right artifact for authoring,
round-tripping, and accessibility adapters. But it is the _wrong_ artifact for
an alternative renderer that wants to **draw** a GoFish chart, because it has
thrown away everything the three-pass pipeline computes: resolved scales
(domain inference), [underlying-space](/internals/core/underlying-space)
classification, and placement. A consumer is forced to re-derive all of it.

The concrete prompt was [Semiotic's GoFish IR
adapter](https://github.com/nteract/semiotic/pull/1032): `unstable_fromGofishIR`
reads our Frontend IR and re-implements a simplified allocation model to lay
charts out — faithful to the grammar, but not pixel-equal, because it is
reverse-engineering decisions GoFish already made. The interpreter is small
_because the Frontend IR pushed the elaboration complexity back onto the
consumer, who then approximates it._

**Verdict.** There are in fact _two_ distinct artifacts below the frontend, for
two different appetites — and collapsing them into one (an earlier draft of this
note tried to, via an optional baked-placement flag) was a mistake:

- **`gofish-core`** — _post-elaboration, pre-solve._ The data pipeline is
  **elaborated away**; what remains is a tree of concrete nodes, each **tagged
  with its resolved underlying space**, related by a small **constraint
  vocabulary** (the lowered operators), against a table of **resolved scales**.
  Resolution-independent. For a host that wants to _own_ layout and re-solve at
  its own viewport.
- **the display list** — _post-solve, viewport-baked._ A flat list of positioned
  primitives in absolute pixels: the output of GoFish's layout pass captured just
  before backend emission. For a host that just wants GoFish's exact picture plus
  its own interaction layer, and for retargeting GoFish onto non-SVG backends
  (Canvas, WebGPU).

Semiotic, it turns out, wants the **display list**, not the core (see
[below](#below-the-core-the-display-list-the-render-ir)). This note sketches both
and names the design seams.

It is the serialization counterpart to
[Constraints as the Core Language](/internals/design/constraints-as-core) — that
note argues the in-memory core reduces to _layers of constraints, marks, and
derived marks_; this one asks what that core looks like **on the wire**.

**Tracking.** Both tiers have standing issues. The display list is
[#75 (rendering IR)](https://github.com/gofish-graphics/gofish-graphics/issues/75),
whose internal motivation — abstract coordinate transforms and path-emission
complexity away from "just output primitives" — is the same artifact reached here
from the interop direction; it is the enabler for
[#42 (multiple rendering backends)](https://github.com/gofish-graphics/gofish-graphics/issues/42).
The core IR depends on
[#457 (split elaboration into its own phase)](https://github.com/gofish-graphics/gofish-graphics/issues/457)
and [#456 (serialization field on primitives)](https://github.com/gofish-graphics/gofish-graphics/issues/456),
following the "surface syntax / scenegraph / post-typecheck / post-elaboration"
taxonomy from [#422](https://github.com/gofish-graphics/gofish-graphics/issues/422) —
note that #422 used "scenegraph" for a _post-elaboration_ tier, the overload this
note deliberately retires (see [below](#why-not-call-it-a-scenegraph)).

## The tiers

Stacking the artifacts top to bottom. The "channel" insight — that it is two
concepts at different levels, a data **binding** vs a literal/datum **scaling
tag** — is what locates the middle cuts; the display list at the bottom has
neither, because the solve consumed everything.

| Tier                                    | Data flow                                     | Layout                                 | Channels?                          | `derive`                 |
| --------------------------------------- | --------------------------------------------- | -------------------------------------- | ---------------------------------- | ------------------------ |
| **frontend** (`gofish-frontend`, today) | sugar                                         | sugar                                  | yes — _bindings_                   | an operator              |
| **pipeline** _(hypothetical)_           | normalized `data → operators → mark-template` | unsolved                               | yes — their home                   | an operator, un-run      |
| **core** (`gofish-core`, this note)     | **elaborated away**                           | unsolved constraint graph + space tags | **no** — only literal/datum values | applied (or unbuildable) |
| **display list** (render IR)            | consumed                                      | **solved, viewport-baked**             | none — pure geometry               | applied                  |

The pipeline tier is optional and is called out here only to locate the
boundaries. Its job — channels as data **bindings**, operators as data-flow,
un-run `derive`s — is exactly what the core does _not_ carry. We would build it
only for a consumer that needs to **re-run** the pipeline (streaming, where new
data spawns new categories and the structure must re-elaborate per tick) or
that wants to own the data transform itself. The display list at the bottom is
covered in [its own section](#below-the-core-the-display-list-the-render-ir);
the middle of the note is about the core.

## What "elaborate the pipeline away" means

Two distinct collapses hide under the word "elaborate", and the core does only
the first:

- **The data pipeline** (operators replicating a mark template per datum) is
  _unrolled_. `spread("category")` over N categories becomes N concrete child
  nodes. The data has been **consumed**; each node is a concrete geometric
  thing, not a template parameterized by a field accessor.
- **The layout solve** (mapping the constraint graph to pixels at a viewport)
  is **not** done — that stays resolution-independent. The core is
  _post-pipeline, pre-solve_.

So "channels disappear" is precise only for channels-as-bindings. A `rect`
still has a width; what changes is that the width is now a concrete value, not a
`field("w")` lookup against an ambient datum that no longer exists.

## Channels: what survives, what doesn't

"Channel" conflates two things:

1. **The binding** — _where the value comes from in the data flow_:
   `field("value")`, a `mark-fn` lambda, a `derive` output. This is
   intrinsically pipeline-level; it presupposes a "current datum" and an ambient
   data context. The core has consumed the data, so there is nothing to bind
   against. **These do not survive.**
2. **The scaling tag** — _literal vs datum_: is this value already in render
   space (pixels, raw color), or is it a value in a data space that something
   must map to pixels? This is **not** a pipeline concept — it is the co-half of
   underlying space. A `datum` is precisely "a value the node's underlying space
   resolves"; a `literal` opts out of it. **This survives**, because it is
   defined by the same mechanism as the `space` tag the node already carries.

So the core has no channels-as-bindings. Visual **props** (`h`, `w`, `fill`,
`x`, …) remain — the keys are unchanged — but each holds a resolved value tagged
literal-or-datum:

```ts twoslash
type ColorOp = { op: "lighten" | "darken"; amount: number };
// ---cut---
type CoreValue =
  | { tag: "literal"; value: number | string } // render space — final px / raw color
  | {
      tag: "datum"; // data space — resolved by THIS node's space / a color scale
      value: unknown;
      offset?: number; // pixel nudge applied AFTER scaling
      colorOps?: ColorOp[]; // post-scale color transforms
    };
```

`field` and `lambda` are simply **absent** — a field access has been _applied_
(substituted to a concrete datum), not referenced. The pairing is clean:
`h: { tag: "datum", value: 30 }` together with `space.y = SIZE(monotonic)` is
the two halves of one resolution; `w: { tag: "literal", value: 5 }` bypasses the
space entirely.

## The node: every node carries its underlying space

This is the headline. `AxisSpace` is a direct serialization of `UnderlyingSpace`
from [`underlyingSpace.ts`](/internals/core/underlying-space) — the classifier a
consumer is otherwise forced to re-derive from `data[0]`:

```ts twoslash
type ColorOp = { op: "lighten" | "darken"; amount: number };
type CoreValue =
  | { tag: "literal"; value: number | string }
  | { tag: "datum"; value: unknown; offset?: number; colorOps?: ColorOp[] };
type CoordId = string;
type ScaleId = string;
type CoreConstraint = unknown;
/** Serialized form of `util/monotonic` — GoFish's piecewise size domain. */
type MonotonicSpec = unknown;
// ---cut---
type AxisSpace =
  | { kind: "size"; domain: MonotonicSpec; measure?: string; spacing?: number }
  | {
      kind: "position";
      domain: [number, number];
      measure?: string;
      coord?: CoordId;
      ordinalGroupId?: string;
    }
  | { kind: "difference"; width: number; measure?: string }
  | { kind: "ordinal"; domain?: string[] } // category keys → axis labels
  | { kind: "undefined" };

type LeafMarkType =
  | "rect"
  | "circle"
  | "line"
  | "area"
  | "ellipse"
  | "petal"
  | "text"
  | "image"
  | "polygon";

interface CoreNode {
  id: string;
  role: "mark" | "group" | "opaque"; // group = an elaborated combinator / coord scope
  mark?: LeafMarkType; // role === "mark"

  // ── resolved space per axis, read off pass 2 ──────────────────────────
  space: { x: AxisSpace; y: AxisSpace };

  props: Record<string, CoreValue>; // h / w / fill / x / … — values, not bindings
  coord?: CoordId; // polar | unit | linear | … — also a resolution scope
  children?: CoreNode[];
  constraints?: CoreConstraint[]; // lowered operators — only on groups

  datum?: Record<string, unknown>; // provenance for hit-testing (see below), not a binding
  name?: string; // .name("bars") — cross-reference target
  zOrder?: number;
}
```

`space.x` tells a consumer everything the Semiotic interpreter hand-rolls today:
`kind: "size"` → accumulate / scale against the monotonic domain; `position` →
place at a data value through the coord; `ordinal` → the host frame owns a band
scale; `difference` → a fixed pixel extent. It reads the tag instead of guessing.

> **Per-axis multi-scale.** The honest generalization
> ([#525](https://github.com/gofish-graphics/gofish-graphics/issues/525))
> is `space.x: Record<Measure, AxisSpace>` — a [measure](/internals/frontend/serialization)-keyed
> _set_ of spaces per axis, which is what retires the `childPosScales`
> workaround and makes dual-axis legible. Ship single-tag first; widen to the
> map when multi-scale lands. The core is its natural home.

## Resolved scales and channels live in one table

No "is `"x"` a field or a literal?" disambiguation against `data[0]`, and no
re-deriving the value scale as max-abs-per-field. Domain inference already
computed these in pass 1; serialize them once and reference by id:

```ts twoslash
type MonotonicSpec = unknown;
// ---cut---
type ScaleIR =
  | {
      type: "linear";
      domain: [number, number];
      range: [number, number];
      measure?: string;
    }
  | { type: "size"; domain: MonotonicSpec } // GoFish's nonlinear size scale
  | { type: "color-ordinal"; domain: string[]; range: string[] }
  | { type: "color-continuous"; domain: [number, number]; scheme: string };
```

`MonotonicSpec` is the serialized piecewise size domain GoFish already builds —
carrying it is what makes a consumer pixel-faithful rather than approximate.

## Constraints: the lowered operator vocabulary

This is the part that shrinks an interpreter. In the Frontend IR,
`spread` / `stack` / `scatter` are _operators_ a consumer must re-execute. In
the core they are **gone**, lowered to primitive geometric constraints among the
already-produced nodes (the data-flow sense of these operators was spent during
unrolling; only their _layout intent_ remains):

```ts twoslash
type NodeId = string;
type Axis = "x" | "y";
type Anchor = string;
type CoreValue =
  | { tag: "literal"; value: number | string }
  | { tag: "datum"; value: unknown };
type Style = Record<string, unknown>;
// ---cut---
type CoreConstraint =
  | { type: "align"; axis: Axis; anchor: Anchor; refs: NodeId[] }
  | {
      type: "distribute";
      axis: Axis;
      spacing: number;
      mode: "edge" | "center";
      refs: NodeId[];
    }
  | { type: "stack"; axis: Axis; refs: NodeId[] } // sizes accumulate into a position
  | { type: "place"; axis: Axis; at: CoreValue; refs: NodeId[] } // scatter → position
  | { type: "contain"; pad: { x?: number; y?: number }; refs: [NodeId, NodeId] } // nest
  | { type: "connect" | "arrow"; refs: NodeId[]; style?: Style }
  | { type: "zOrder"; order: "above" | "below"; refs: [NodeId, NodeId] };
```

Frontend `spread` → `{ distribute, align }`; `scatter` → `place`; `stack` →
`stack`. The consumer renders a fixed primitive set and never re-runs operator
semantics. This is also where `table` / `cut` / `mask` stop being
warn-and-fallback: either they lower to these primitives during elaboration, or
they are explicitly absent and the consumer _knows_ what it cannot render.

The vocabulary is intentionally the same `align` / `distribute` / `place` /
`contain` set that [Constraints as the Core
Language](/internals/design/constraints-as-core) shows can reproduce `spread`
exactly. If that in-memory unification lands, this IR is its serialization with
no impedance mismatch.

## Below the core: the display list (the render IR)

The core IR keeps layout for the host to solve. But re-solving GoFish's
constraint system faithfully is more than a host like Semiotic wants — or can
do, because GoFish's layout is **size-dependent**: it propagates a proposed size
downward, SwiftUI/Compose-style (see [Size Claims](/internals/design/size-claims)),
so there is no free re-flow. The honest artifact for a pure renderer is therefore
not the core but the **output of GoFish's own layout pass**: a flat list of
positioned primitives in absolute pixels, captured _just before_ backend
emission. Call it the **display list**. This is
[#75 (rendering IR)](https://github.com/gofish-graphics/gofish-graphics/issues/75):
that issue wants it to strip the rect's render-time special-casing and abstract
coordinate transforms away from primitive output; the interop use here wants the
same artifact crossing a process boundary. Same target, two motivations — and it
is what unlocks [#42 (Canvas / WebGL / WebGPU backends)](https://github.com/gofish-graphics/gofish-graphics/issues/42).

It is what the Semiotic interpreter already builds internally as `engine.marks`
before splitting into scene-nodes / overlays — except produced by GoFish's _real_
solver, in GoFish's process, and serialized. The adapter then collapses to a
near-trivial map (GoFish primitive → host scene node / overlay), **pixel-equal by
construction**. The grammar-coverage gap disappears: `table` / `cut` / `mask` and
free-form `.constrain` are all just geometry by this point.

```ts twoslash
type DisplayItem = {
  kind: "rect" | "point" | "area" | "path" | "text";
  // absolute pixel geometry — transforms folded in, polar already applied (a petal is a path)
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  d?: string;
  style: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
  datum?: Record<string, unknown>; // provenance → the host's hit target
  role: "node" | "overlay"; // data-bearing vs chrome — decided by GoFish, not guessed
};

interface DisplayListDocument {
  ir: "gofish-display-list";
  viewport: { w: number; h: number }; // the size this was solved at
  items: DisplayItem[];
}
```

What is gone versus the core: no constraints, no `space` tags, no scales, no
literal-vs-datum — all _consumed_ by the solve. What survives is geometry +
resolved style + datum provenance + the node/overlay role.

**Backend-agnostic by design.** Because the items are resolved primitives rather
than SVG markup, the display list is not SVG-specific — it is a target the SVG,
Canvas, and WebGPU/`wgpu` backends can each consume. Serializing it is, in effect,
factoring GoFish's own renderer out into a portable contract: today's SolidJS/SVG
emitter becomes _one_ consumer of the display list among several, and a foreign
host (Semiotic) is just another.

**It is a per-frame wire format, not a document.** Because layout is
size-dependent, the display list is parameterized by viewport:
`gofish(spec, { w, h }, data) → display list`. A resize or a data change means
**re-running the spec from scratch** at the new size and re-emitting — incremental
relayout and a portable solver are someday-work, not this. So the integration is
a **re-emit callback**, not a static doc the host holds: on resize / data-change
the host calls back into GoFish for a fresh display list. (This is exactly the
kstreams "the domain owns layout, the library renders it" pattern the Semiotic PR
endorses, with "the domain" = "re-run GoFish".) Optimize the cold path; that is
the cost of admission until incremental updates exist.

One corollary: for a **JS-origin** spec in a JS host you do not even need to
_serialize_ the display list — you call GoFish and get primitives directly. The
serialized form earns its keep at a **runtime boundary** (Python GoFish → JS
host, or any GoFish-less consumer). It can be freely lossy w.r.t. the spec
(no constraints, no spaces) precisely because nobody round-trips it.

### Why not call it a "scenegraph"

Tempting, and wrong. In graphics, a **scene graph** (OpenSceneGraph, Open
Inventor, three.js) is the _retained, hierarchical, transformable tree_ you
traverse — transforms compose downward, nodes are still abstract, layout not yet
flattened. That is an _upstream_ structure; if anything it describes GoFish's AST
or the **core IR**, which is exactly why reusing the word here invites the
overload. The graphics-canonical name for "positioned primitives, absolute
coordinates, backend-agnostic, ready to rasterize" is a **display list** — the
browser pipeline (layout tree → display list → paint; WebRender's input _is_ a
display list), Skia (`SkPicture` / `DisplayList`), Flutter (Skia display list),
and Dear ImGui (`ImDrawList`) all use it for precisely this thing. "Render IR" is
a fine informal synonym; "scenegraph" is rejected here on purpose so the next
reader does not re-propose it.

### Who owns layout: choosing between the two lower IRs

|                    | core IR                               | display list                                             |
| ------------------ | ------------------------------------- | -------------------------------------------------------- |
| cut point          | post-elaboration, pre-solve           | post-solve, pre-backend                                  |
| resolution         | independent                           | baked at one viewport                                    |
| owns layout        | the **host** (re-solves)              | **GoFish** (re-emits)                                    |
| adapter size       | an interpreter                        | a near-trivial map                                       |
| fidelity           | faithful iff host re-solves correctly | pixel-equal by construction                              |
| resize / streaming | host re-flows live                    | GoFish re-emits per frame                                |
| backends           | host's renderer                       | any (SVG / Canvas / WebGPU)                              |
| best for           | a host that wants to own layout       | a host that wants GoFish's picture + its own interaction |

Semiotic — given its scene-node / overlay contract and its own
transition / decay / SSR / a11y layer — is squarely a **display-list** consumer.
The core IR is the right target for a host that genuinely wants to _own_ layout;
that is not Semiotic.

## Where the escape hatches go

GoFish's two sanctioned non-grammar paths relocate cleanly under this split:

- **`derive`** is pure pipeline. In the core it is **already applied** to the
  data — or, if it is an un-runnable lambda, _the core cannot be produced at
  all_. That is the honest boundary: building a core IR requires a runnable
  pipeline. A consumer that wants un-run derives wants the pipeline tier.
- **`mark-fn`** is the interesting one — it generates _structure_ per datum, so
  it is not a value, it is a subtree. Two fates: the bridge runs it and its
  glyph subtree is **inlined** (fully elaborated), or it survives as an opaque
  **un-elaborated node** (`role: "opaque"`) — a structural hole, still not a
  channel.

## Provenance replaces field access

A consumer loses field accessors but gains what it actually needed from them:
each leaf node keeps its originating row as **provenance** (`CoreNode.datum`) —
attached data, not a pipeline binding. This is exactly what a host runtime's
scene-node contract wants (the datum behind the hovered / screen-reader-announced
shape), and it sits comfortably in a pipeline-free core.

## Document shape

```ts twoslash
type CoreNode = unknown;
type ScaleIR = unknown;
type ScaleId = string;
// ---cut---
interface CoreIRDocument {
  irVersion: 0;
  ir: "gofish-core"; // distinct tag from "gofish-frontend"
  $schema?: string;
  data: Record<string, unknown>[]; // resolved rows (derives applied, or lambda-marked)
  scales: Record<ScaleId, ScaleIR>; // resolved once, referenced by id
  root: CoreNode; // resolution-independent — no baked geometry (that's the display list)
}
```

## Design seams

1. **Two artifacts, not a mode bit.** An earlier draft made the core do double
   duty via an optional baked-placement annotation. Cleaner to keep them
   separate: the **core IR** is resolution-independent (pre-solve); the
   **display list** is the viewport-baked render output. Different consumers,
   different cut points — don't fold them into one document with a flag.
2. **Resolution scopes are real nodes.** A `group` carrying a `coord` is also a
   σ-scope that owns its space resolution; the tree should make those boundaries
   explicit so a consumer's bake is boundary-recursive, not root-global. (See the
   scoped-resolution thread behind the coordinate-transform work.)
3. **Measures travel as types.** Keep `measure?` on spaces and channels. A
   consumer may ignore them, but they are what lets unit-checking and multi-scale
   survive the bridge.
4. **Three encodings, as ever.** Per the repo convention, `gofish-core` needs the
   same triple as `frontend/`: TS types in `schema.ts`, runtime validator in
   `validate.ts`, emitted JSON Schema in `jsonSchema.ts`, plus a `sync-ir-schema`
   regen. Scope that cost up front.
5. **Open: how much solve is "elaboration."** GoFish's elaboration and solve are
   not cleanly separable everywhere — some sizing falls out of the constraint
   solve (an aggregated `stack` total, an auto-fit Monotonic inversion). The
   pre-solve cut may need a few "resolved during elaboration" fields that blur the
   line. Fine, but it is the seam to watch.

## Related

- [The Frontend IR](/internals/frontend/serialization) — the tier above; the
  source-level wire format this note sits below.
- [Constraints as the Core Language](/internals/design/constraints-as-core) — the
  in-memory argument that the core reduces to constraints + marks; this IR is its
  serialization.
- [Operators vs Constraints](/internals/design/operators-vs-constraints) — why the
  lowered vocabulary is `align` / `distribute` / `place` / `contain`.
- [Underlying Space](/internals/core/underlying-space) — the classifier the node
  `space` tag serializes.
- [Size Claims](/internals/design/size-claims) — the size-dependent layout that
  makes the display list a per-frame, re-emitted artifact rather than a cacheable one.
- [Rendering](/internals/core/rendering) — the two-pass lower→paint implementation
  of the display-list tier.
