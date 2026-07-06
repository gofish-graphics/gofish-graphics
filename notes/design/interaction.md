# Interaction: Meros semantics on the GoFish substrate

**Purpose.** Design for GoFish's interaction layer: instantiate the _semantics_ of Meros
(MX — anchors, a type-driven binding algebra, selectors, interaction scales,
instruments) on GoFish's _substrate_ (addressable scenegraph, keyed data scopes,
recorded scales, coordinate spaces, SolidJS). This file is the spec for the
`src/interaction/` prototype (milestones M1–M3) and the record of where Meros'
conceptual model has holes and how GoFish's structure repairs them.

**Status:** design settled against a source-verified read of the layout pipeline;
**M1–M6 prototyped and verified** (`src/interaction/`, stories under
`stories/interaction/`):

- M1 hover states (Tier 0); M2 draggable threshold (equate + limit,
  recorded-scale inversion round-trips within float epsilon, domain clamping);
  M3 brush (interval selectors, during/onEnd gating, DataRef mean readout).
- M4 snap-to-band brush: `SetAnchor` (keyed) + the **Match** relation
  (`by: "nearest"`, setter-wrap like Limit, gateable for onEnd-commit snaps);
  `xBands()` exposes band extents from frame items. Verified: brush edges land
  exactly on band edges — impossible to half-select a category.
- M5 multi-brush: `multi: true` = instance-creation events; selector becomes
  the compound OR over instances; Escape clears (keyboard through the same
  event path).
- M6 wheel→bins parameter binding (Tier 2): `param()` + `iscale()` +
  `wheelBind()`; the runtime's rAF-coalesced latest-wins scheduler re-runs the
  full resolve→layout→paint through the immutable builder thunk (params
  consumed inside `derive()`); `gofish()` now disposes a previous reactive
  root when re-rendering into the same container. **Perf gate: ~9 ms per full
  rebuild** on the penguins histogram — coarse Tier-2 is comfortably within
  frame budget at this scale; the geometry-reset protocol stays unbuilt until
  a real chart misses budget.

Static path regression-clean under `capture-diff` (zero drift; interactive
stories are pure additions). Unit tests: `test:interaction` (32 assertions:
algebra table incl. match + gating, iscale, inversion, DataRefs).
The binding-algebra table and the writability rule are the load-bearing
decisions — pressure-test those first.

Known prototype limitations: layerContext entries accumulate across Tier-2
re-resolves (harmless unless a re-rendered chart uses selectAll); match keys
are not yet joined against multi-instance keyed targets (nearest only);
overlay JSX recreates per instance-list change (fine at prototype scale).

## Why GoFish is a better substrate for Meros than Meros' own

Meros composes direct-manipulation techniques from components that expose **anchors**
(named projections of spatial state, typed `scalar | range | set`), bound together by a
**binding algebra** that infers a dataflow relation from the anchor-type pair alone.
This is the right decomposition — input, articulation (shapes), and semantics (data
predicates) as separable, recombinable constructs. But Meros runs it over a Vega-Lite
bridge with a hand-rolled push runtime, and the mismatch shows (see "Holes" below).
GoFish already has, natively, the four things that model needs:

1. **Addressable spatial structure.** Names, operator group keys, per-node dims, and
   underlying-space domains — anchors are _typed projections of state GoFish already
   computes_, not a parallel bookkeeping layer.
2. **Write discipline.** The write-once dimension ledger and the constraint solver give
   a formal answer to binding conflicts; Meros' paper concedes it resolves cross-tree
   conflicts "by precedence resulting in potentially invalid states."
3. **A real reactive substrate.** SolidJS signals/memos: pull-based, glitch-free,
   batched. Meros hand-rolled push propagation with no cycle detection and
   last-write-wins conflicts.
4. **Coordinate-space typing.** Data → GoFish (underlying) → screen, with scales and
   coordinate transforms at the seams. Meros carries encodings on anchors to convert
   pixel↔data ad hoc, and is Cartesian-only.

## The model

### Anchors

> **An anchor is a typed, space-tagged, read-only-by-default projection of an
> element's resolved structure.**

Types are Meros': `scalar`, `range`, `set` (+ composites `point`, `area` that decompose
into them). Every element class contributes anchors from state the pipeline already
resolves:

| element                   | anchors                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| shape mark                | `left/right/top/bottom/cx/cy`: scalar; `x/y`: range; `center`: point; `area`: 2×range |
| `spread`/`stack`          | `bands`: Set⟨range⟩ keyed by group key; `extent`: range                               |
| data scopes (`For`/group) | keyed Set⟨child anchors⟩ — keys are the data group keys                               |
| Frame / plot              | `plot.x`, `plot.y`: range (data + screen space)                                       |
| scales / axes             | `domain`: range (data space); `ticks`: Set⟨scalar⟩                                    |

**Space tagging.** Every anchor value is read in an explicit space: `data`, `gofish`
(root-local, pre-pixel — the space `bake` accumulates translates in), or `screen`
(post `toPixel`). Conversions compose the _recorded_ forward maps — per-node
`{posScales, scaleFactors, size}` captured at layout time, ancestor translates, the
enclosing coordinate transform, `session.toPixel` — and never re-derive scales.
Inside a `coord`, anchors live in **coord-local space**: the "right edge" of a
polar-warped rect is a θ-range, and its screen projection is an arc — so range anchors
inside nonlinear coords are exposed in data/coord space only; screen projections exist
for scalars/points via the forward transform. A conversion that would need a missing
inverse (e.g. `wavy`) is an **error**, not silent pixel math.

**Writability.** In GoFish _all_ mark geometry is derived: data → underlying space →
σ/posScale → layout → dims. There is no such thing as writing a laid-out rect's edge.
The writable set is exactly:

1. **instrument/input state** — the threshold's position, the brush's extent: signals
   owned by the interaction layer, rendered in an overlay;
2. **params** — signal-backed spec parameters (`maxbins`, spacing, a coord parameter);
3. **data** — writeback (`bind(drag.y, datumField("count", bar))`), which re-runs the
   pipeline. "Drag a bar" is a _data write_, which is also the semantically honest
   reading of direct manipulation.

Binding into a derived anchor is a **compile-time error**. This is the ledger's
write-once discipline extended to interaction: derived geometry has an owner (the
layout), so interaction may read it (snap targets, clamp ranges) but never race it.

### Input components

`pointer()`, `drag()`, `wheel()`, `key()` are components exposing anchors backed by
writable signals — the same interface shapes expose, which is what makes the algebra
close over inputs and shapes alike (Meros' key move, kept intact). Inputs additionally
expose **phase accessors** for temporal gating: `drag()` → `start/current/end` (points),
`span` (area), `delta` (relative scalar pair), `active` (boolean).

### The binding algebra

`bind(src, dst, opts?)` infers the relation from the type pair:

| src \ dst | scalar            | range                   | set                     |
| --------- | ----------------- | ----------------------- | ----------------------- |
| scalar    | **equate**        | error (unless `offset`) | error (unless `offset`) |
| range     | **limit** (clamp) | **limit** (∩)           | **limit** element-wise  |
| set       | **match**         | **match**               | **match**               |

- **equate** — shared value; write-through when both ends are writable state,
  directional memo otherwise.
- **limit** — clamp into the source interval. Additive: multiple limits on one target
  compose by interval intersection (the one relation with a well-defined meet).
  Implemented in the target's _setter_, preserving single-writer.
- **match** — keyed join over set entries: positional when both unkeyed and equal
  cardinality; key-join when keys exist (data-scope keys); `by: "nearest"` is an
  explicit spatial-join policy, never a silent fallback.
- **offset** — a _first-class relation_ for relative values (drag deltas, wheel ticks),
  replacing Meros' "delta mode" flag that quietly legalized Void cells of its table.

**One writer per anchor** (statically checked at `bind` time); unlimited restrictors
(limits); competing equates are an error, not a race. Closure holds trivially:
bindings only move same-typed values, so an anchor's type never changes.

**Temporal gating.** `{ when: gate }` compiles to sample-and-hold
(`createMemo(prev => gate() ? src.value() : prev)`); `onEnd` commits are falling-edge
effects (snap commit, data writeback). Feedback loops get **discrete-time semantics**:
writes happen only at event boundaries, everything between is pure memos — so
DimpVis-style loops (manipulate → filter → re-layout → re-manipulate) are well-defined,
and combinational cycles are static errors.

### Selectors, states, data references

- `selection(anchor)` derives a data predicate by anchor type — scalar → point,
  range → interval, set → region — inverting through recorded scales.
- **States** are reactive conditional channels, not a new mark concept:
  `fill: when(t.above, "#d62728").else("#ccc")`.
- **DataRefs** are memo chains — `from(data).filter(b.selector).mean("hp")` — feeding
  channels, params, or text marks; the reactive sibling of the builder's `derive()`.

### Parameter bindings and interaction scales

`param(init)` is a signal-backed value usable anywhere a spec option goes.
`iscale({domain, range, kind})` maps an input anchor onto a parameter domain
(continuous or categorical). Scroll→binning:
`bind(wheelY({ scale: iscale({ domain: [-300,300], range: [5,60] }) }), bins)`.

### Multiplication and instruments

`multi: true` instantiates instrument state per key — a map of signals — lifting every
anchor to a Set. Keys come from creation events (multi-brush) or the enclosing data
scope (spread/group keys → per-facet thresholds with no extra machinery: the same keyed
join that snaps also distributes). Instruments (`hover()`, `threshold()`, `brush()`,
later `lasso()`) are plain functions composing input + overlay shape + bindings +
selector — the custom-element philosophy; no new language construct.

### v3 surface

```ts
const t = threshold({ dim: "y", at: 40 });
chart(lakes)
  .flow(spread("lake", { dir: "x" }))
  .mark(rect({ h: "count", fill: when(t.above, "#d62728").else("#ccc") }))
  .interact(t)
  .render(el);
```

Low-level composition remains available (`bind(d.current.y, h.y)` etc.) for authoring
new instruments.

## Toward a fluent surface (A+B+C IMPLEMENTED; D deferred)

**Status: directions A, B, and C are implemented and verified** — all six
stories migrated (`stories/interaction/`), zero hoisted instruments, and the
`.interact()` clause survives only in its `.constrain()`-shaped role (C) and
for overlay readouts. The mechanism behind A is the **ambient
interactive-resolve context** (`resolveContext.ts`): the render terminal
installs the chart's runtime around resolve; live values register on read
(`wheel()` in a `derive()`), tagged selectors register at `when(...)` unwrap
(`hovered()`), interactive marks register on invocation
(`rule().drag("y").name("cut")`) — so a chart where nothing registers renders
down the static path untouched (`capture-diff`-verified). Cross-references
are NAME-DEFERRED selectors (`above("cut", of)`, `inside("b")`) resolved
against the runtime's instrument registry at patch time, which also gives
forward references for free. Known seam: the ambient context is a module
variable, so concurrent resolves interleaving at await points could
cross-register (documented in `resolveContext.ts`).

**Absorption round (post-A+B+C):** how much of the instrument layer was
accidental syntax vs the essential ownership shift? Almost all of it was
accidental. Implemented:

- **`live(...)` — the third value kind, completed.** Any color or raw channel
  of a REGULAR mark accepts a live accessor; the pipeline renders (and
  measures) its resolve-time value, and the runtime re-evaluates it in the
  Tier-0 paint patch (patches now carry text CONTENT as well as style — the
  box keeps its resolve-time measure, the inherent live-text caveat). The
  accessor receives the runtime's `refs`, so readouts reach named instruments
  without closures: `text({ x, y, text: live((refs) => …) })`. This absorbs
  `overlayText` (now deprecated) into the regular `text()` mark.
- **`rect().drawWith(drag().span())` — a brush IS a rect mark.** `.drawWith`
  is a transform modifier on the regular rect (the `.cut()` mechanism): it
  lifts the mark from LAYOUT-owned to INSTRUMENT-owned geometry — the one
  irreducible difference, per the writability rule (interactive geometry must
  not affect layout/domains). The rect's authored fill/stroke style the
  overlay; `.multi()` multiplies; `.name()` names the instrument. The brush's
  selector fields are now INFERRED from the chart's own x/y encodings
  (frame.axisFields — Meros' "selector derived from encodings"), so it needs
  no configuration at all.
- **Scheduler fix found en route:** hidden tabs throttle rAF to zero, freezing
  Tier-2 re-renders under headless drivers; `invalidate()` now falls back to a
  timeout when `document.visibilityState !== "visible"`.

**The `.interact()` residue** (the "escape hatch" question): after absorption,
five of six stories have NO `.interact()` clause at all — states and live
readouts live in value position, the threshold and brush in mark position,
params self-register on read. The single remaining use (M4) contains exactly
one `Bind.snap(...)` declaration: a cross-cutting relation between two named
things, which is precisely `.constrain()`'s shape — and nobody calls
`.constrain()` an escape hatch. The lesson: the escape-hatch smell came from
IMPERATIVE content (instrument construction, readout closures) that belonged
in value/mark position but lacked syntax; each absorption drained it. The
horizon question is whether `.interact()` and `.constrain()` eventually merge
into one relation clause (static relations solved at layout, interactive ones
at event time) — the full "bindings are constraints" thesis.

## The `.constrain()`/`.interact()` merge (explored, not yet built)

**The observation:** GoFish's constraint vocabulary already IS the binding
algebra — `align` = scalar Equate, `nest` = Limit (containment is interval
limiting), `span` = range Equate, `position` = Equate-to-literal — while
`distribute`/`grid` are SET-level relations Meros lacks, and Match/Offset are
the relations interaction adds. One vocabulary, two execution regimes, and
the regime is inferable by the algebra's own move:

> **Relation from anchor types; regime from anchor ownership.** All endpoints
> layout-owned → placement solver, once, at layout time. Any endpoint
> instrument-owned/param/data → maintained at event time via the binding
> lowering, re-established per frame. Direction at event time is FORCED by
> ownership (layout-owned = read-only = source-only; two live endpoints =
> bidirectional shared-state equate) — the structural resolution of Meros
> hole #10.

Mixed relations get two-phase semantics: initialize the instrument at first
frame; maintain instrument-ward thereafter (a threshold aligned to a bar's
top re-attaches after Tier-2 re-binning). Surface: one `.constrain()` clause
accepting the union vocabulary (Constraint.\* + snap/offset), partitioned by
ownership; `.interact()` aliases then retires.

**Constraints as techniques** (each existing constraint + one live endpoint):

- `align` → linked brushing across views (bidirectional equate, one
  declaration); benchmark lines tracking live values; with a temporal
  qualifier (`until: drag` — the one-writer rule DEMANDS it) → tear-off
  reference lines. Detachable relations as algebra, not hacks.
- `nest` → what brushes already hand-code (plot confinement), plus
  drill-down brushing (`nest(brushCoarse, brushFine)`) and per-facet handle
  confinement — Meros Fig. 7C/D as one nest inside a faceted flow.
- `distribute` → gang-dragged quantile handles; two draggable endpoints + k
  distributed rules + a param = interactive equal-width binning.
- `span` → the threshold overlay hand-codes `span({x:"all"})` today; the
  merge makes instrument ARTICULATION constraint-specified compositions of
  ordinary shapes.
- `grid` → self-arranging multi-instrument collections (query-pointer
  small multiples, Meros Fig. 1).
- `zAbove` → hover-to-front focus policies (needs a Tier-0 z patch).

Converse gift: per-frame re-establishment gives constraints a life across
Tier-2 rebuilds and ACROSS CHARTS (alignment maintained under data change) —
today's solver lives inside one layout run.

**Hard parts:** (1) `distribute`/`grid` at event time need multi-writer set
semantics (a gang = one composite anchor with a joint setter) — pointing at
the endgame of invoking the placement solver itself at event time over the
small live constraint system: one solver, two invocation times; (2) temporal
qualifiers (`until`/`while`) must enter the relation vocabulary deliberately
(the teon story, resurfacing where it belongs); (3) small paint-tier
extensions (z-order patching). Staging: accept align/nest/span/position specs
with live endpoints in the interact lowering (they map to existing
equate/limit) → unify refs → partition `.constrain()` by ownership → retire
`.interact()`.

Paper-level compression: GoFish's operators ARRANGE geometry, its constraints
RELATE geometry, and interaction is the same relations with a live endpoint —
Meros' algebra is the typing discipline of GoFish's constraint system.

The original diagnosis: the M1–M6 prototype surface was Meros idioms
transplanted — hoisted instrument variables, free-floating `bind()` calls,
`b.anchors.x` property paths — which cuts against the grain of the v3 builder
(and against the GoFish paper's own hoisting critique; `Ref`/`.name()` exists
precisely to avoid pulling nodes out of the spec). Organizing principle for
the native redesign:

> **Interaction enters the spec wherever a value already goes.** GoFish
> channels take aesthetic literals or data values (`v()`); add a third kind —
> LIVE values — and the chain never changes shape.

Directions (composable, mapped to the runtime tiers already built):

- **A. Live values** (→ Tiers 0 & 2): states in channel position
  (`fill: when(above("cut"), …)` — already true), parameter bindings in
  OPTION position (`bin("mass", { maxbins: wheel({ range: [3, 40] }) })` —
  the input component used AS the option value is the flow-native reading of
  interaction scales), DataRefs in text/data position. The builder scans the
  resolved spec for live values and stands the runtime up implicitly — no
  `.interact()` for value-level interaction, exactly as `v()` conjures scales.
- **B. Interactive marks** (→ Tier 1): manipulability as a mark modifier —
  `rule({ y: 100 }).drag("y").name("cut")`, `rect().drawWith(drag().span())`
  for a brush — declared in `.mark()`/`.layer()` like any mark. Instruments
  dissolve into named marks (regaining mark styling/labels/coords for free).
  Two consequences: **multiplication = the data scope** (a draggable rule
  inside a faceted flow yields per-facet thresholds, keys from the scope — the
  syntactic resolution of Meros hole #9), and **default clamping = scoped
  defaulting** (`drag("y")` limits to the nearest enclosing frame's domain,
  visible and overridable — the disciplined phantom edge, hole #6).
- **C. `Bind` mirrors `Constraint`** (→ the binding compiler): cross-cutting
  relations in `.interact((refs) => [Bind.snap(refs.bars.bands.x, refs.b.x),
Bind.limit(refs.plot.y, refs.cut.y)])`, exactly parallel to
  `.constrain((refs) => [Constraint.align(…)])`. `refs` exposes named layers'
  anchors plus chart chrome (`plot`, `domain`, `bands`) — which deletes the
  `xBands()` plumbing, since the chart owns its band structure. `createName()`
  Tokens give typed handles where strings are too loose.
- **D. The technique-AUTHOR api — deferred, and NOT a `chart()` mirror.** A
  `technique().flow(...)` builder is seductive symmetry but mirrors the wrong
  thing twice. (1) Wrong semantics: `.flow()` is order-sensitive; bindings
  are an unordered CONSTRAINT SET (limits meet by intersection; `limit + snap`
  must not differ from `snap + limit`) — GoFish already splits ordered
  `.flow()` from unordered `.constrain()`, and relations belong on the
  constraint side. The genuinely staged part of a technique
  (input → geometry → selector) is exactly what B's mark modifiers express.
  (2) Wrong precedent: GoFish's reuse mechanism for chart authors is plain
  functions (the paper's `Balloon`), and for library authors it is factories
  (`createMark`/`createOperator`) — so the eventual api is
  `createTechnique(...)` in the factory idiom, with `_isComponent`-style name
  scoping so internal marks (a threshold's grab band) don't leak into the
  chart's layer registry. Extract it AFTER writing the next several
  techniques (lasso, crosshair, pan/zoom, data-writeback) as plain functions
  over A–C — the paper's §7.3 lesson: distill grammar from a gallery, don't
  legislate it from four examples. Until then, a technique is a function
  returning named marks + Bind declarations + selectors — already a
  first-class value for any design-space-enumeration story (which operates on
  the algebra, not on builder syntax).
- **E. Technique verbs** (`.brush({ x: "bands" })`) only ever as documented
  sugar compiled to A–C (as `barY` is to stack+rect) — as a primary surface
  they reintroduce the fixed typology both papers argue against.

The snap-brush story as SHIPPED (the brush stays a technique-as-function per
the D discussion, declared spec-scoped in the callback; `rect().drawWith(
drag().span())` as a mark-position brush is the next B increment):

```ts
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(
    rect({
      h: "count",
      fill: when(intersectsX("b"), "#d62728").else("#6b9bd1"),
    }).name("bars")
  )
  .interact((refs) => {
    const b = brush({ name: "b", x: "x", y: "y" });
    return [b, Bind.snap(refs.bands("bars").x, b.anchors.x)];
  });
```

Open problems before committing: forward references (a channel `when` naming a
later-declared layer — same deferred-resolution discipline as
`connect()`/`selectAll`); typing the `refs` callback (shared weakness with
`.constrain()`); and wire-format design for live values (params serialize
trivially; predicate closures don't — decide the IR story up front).

## Runtime architecture

### Constraints verified against the pipeline

- **The pipeline is tree-consuming.** `place()` short-circuits on the solved ledger;
  axis/title/legend elaboration _wraps_ the tree; `resolveAliases`/`resolveEmbedding`
  mutate captured `args.dims`. ⇒ Re-layout **rebuilds through the immutable
  `ChartBuilder.resolve()` thunk**; never re-run passes on a used tree, never clone it
  (mark closures capture factory scope).
- **`node.uid` is fresh per resolve.** ⇒ Anchors/bindings address nodes by **stable
  path** (`.name()` + operator group keys) and re-attach to fresh nodes after every
  layout (`layoutFrame` publication).
- **Scales are transient layout arguments.** ⇒ `layout()` records
  `_resolvedScales = {posScales, scaleFactors, size}` per node (one-line change).
- **Coordinate transforms are forward-only.** ⇒ optional `invert` added (linear
  identity, polar analytic); absent inverse disables pointer selectors in that scope
  with an explicit error.
- **`DisplayItem` already carries `datum` and an unpopulated `id`** — the hit-testing
  hooks exist in the IR today.

### Three tiers of reactivity

Most interactions never need re-layout; the runtime is tiered so each interaction pays
only for what it moves:

- **Tier 0 — style-only (states).** The display list is stable; each painted item's
  style reads a memo `patch(item)` keyed by datum/id against the active predicates.
  Solid's fine-grained attribute updates give per-primitive granularity for free.
  Hover, brush-linked highlighting.
- **Tier 1 — overlay-only geometry (instruments).** Threshold rules and brush rects are
  instrument-owned signals painted in an overlay layer in pixel space; the chart's
  display list is untouched; clamping runs in binding setters. 60 fps with zero
  pipeline runs.
- **Tier 2 — spec changes (params, data writeback).** An rAF-coalesced, latest-wins
  scheduler re-runs `builderThunk() → resolve() → runLayout() → lower()`, swapping the
  painted list through keyed reconciliation on `(path ?? id, kind)`.

Signals **never thread into the layout passes** — the pipeline stays synchronous and
signal-free; params are tracked reads at thunk invocation. The reactive graph:

> input signals → binding memos → { T0 patches · T1 overlay · T2 params } →
> scheduler → `layoutFrame` signal → anchors re-derive → selectors/states re-evaluate.

**Escape hatch** if Tier-2 profiling fails on large charts: a geometry-reset protocol
(keep the elaborated tree; clear `_bbox`/dims/space; re-run
space→domains→embedding→layout), gated on "domains provably unchanged" because axis
elaboration is not idempotent. Fine-grained subtree re-layout is **rejected** for this
codebase: root σ binary search, shared scales, axis budgeting, and cross-child
constraints couple geometry globally.

### Events and hit-testing

Delegated listeners on the root `<svg>`; `event.target.closest('[data-gf-id]')` → the
current frame's node map → `{node, datum, anchors}`. The browser does path-accurate hit
testing (polar wedges included). Region containment is tested in data space via
predicates, not pixels. A transparent plot-area rect in the overlay captures background
drags for brushes.

### Module map

`packages/gofish-graphics/src/interaction/` behind a `gofish-graphics/interact` subpath
export (zero-cost for static users): `anchors.ts`, `resolvedScales.ts`, `params.ts`,
`inputs.ts`, `bindings.ts`, `selectors.ts`, `states.ts`, `instruments/{hover,threshold,brush}.ts`,
`runtime.ts`, `overlay.ts`. Additive touches to `_node.ts` (record scales),
`gofish.tsx` (factor render; `gofishInteractive`), shape `lower` bodies + `paintSVG.tsx`
(populate `id`; `data-gf-id`; optional per-item style patch; keyed reconciliation),
`chartBuilder.ts` (`.interact()`), `coord.tsx` (+`invert`), and later an optional
`path?: string` on `BaseDisplayItem` in gofish-ir.

## Holes in Meros' conceptual model (and how this design repairs them)

Documented from a close read of the MX paper (VIS'26 sub 2082) _and_ its
implementation — several holes are visible only in the gap between the two.

1. **No conflict-resolution semantics.** Bindings are called "additive constraints,"
   but only `limit` has a well-defined meet (interval ∩). Competing equates are
   last-write-wins in the implementation; the paper concedes cross-tree bindings yield
   "potentially invalid states." _Repair:_ one writer per anchor, statically checked;
   unlimited restrictors; residual conflicts are compile errors. The write-once ledger
   is the model.
2. **No account of feedback cycles.** Propagation is tree-structured; DimpVis-style
   loops are acknowledged as out of scope; the implementation has no cycle detection
   and would loop. _Repair:_ discrete-time semantics — explicit state (signals) vs.
   derived (memos); cycles through an event boundary are well-defined; combinational
   cycles are static errors.
3. **The algebra is unstable between paper and implementation.** Paper:
   equate/limit/match/**void**, with scalar→range = Void. Implementation:
   equate/**place**/clamp/limit — no match in the base table, and `place` (center a
   scalar in a range) directly contradicts the paper's Void. "Delta mode" is a flag
   that flips Void cells to valid. _Repair:_ derive the algebra from explicit
   projections/embeddings between structure types, with `offset` as a first-class
   relation rather than a mode bit.
4. **Set semantics are underspecified.** Sourced/unsourced modes plus cardinality
   heuristics silently switch positional vs. nearest matching; the implementation has
   five match policies (nearest/index/key/all/overlap) with unclear defaults; behavior
   changes when cardinalities drift. _Repair:_ sets are **keyed collections**; match is
   a relational join with keys from data scopes (For/spread provide them); `nearest` is
   an explicit spatial-join policy, never a fallback.
5. **Temporal structure is load-bearing but unmodeled.** The implementation's "teons"
   (onStart/during/onEnd gates) carry brush lifecycle and instance creation, yet the
   paper's algebra is purely spatial. _Repair:_ a first-class event algebra for gating
   (cf. Vega event streams). Research direction: _temporal Gestalt operators_ — the
   interaction-side sibling of the GoFish paper's §9 speculation.
6. **Elaboration ("phantom edges") breaks locality.** The compiler fills unspecified
   anchor values from "the nearest compatible component" — hidden defaulting that
   contradicts the paper's own closure/locality claims. _Repair:_ scoped defaulting
   through the spec tree, like scale resolution: defaults come from the nearest
   enclosing frame and are visible in the structure.
7. **No story for layout-computed geometry.** Meros anchors project _parametric_ shape
   state (a rect is a settable x1x2y1y2). In any laid-out chart, positions are
   _outputs_ — writing them is an inverse-layout problem the model never poses.
   _Repair:_ manipulability typing — writable = {instrument state, params, data};
   derived geometry is read-only; "drag a bar" is a data write.
8. **Anchors conflate coordinate spaces.** Encodings ride on anchors for ad-hoc
   pixel↔data conversion; non-Cartesian coordinates are out of scope. _Repair:_
   space-tagged anchors (data/gofish/screen) with conversions through recorded scales
   and invertible coord transforms; nonlinear-coord range anchors live in coord space
   where they remain meaningful.
9. **`multi` propagation is fuzzy.** "Propagates to child components" — but
   shared-vs-per-instance bindings, partial multiplication, and instance lifecycle are
   unspecified. _Repair:_ multiplication = keyed data scope, the same construct as
   static repetition; instance create/destroy are events in the temporal algebra (#5).
10. **Directionality is implicit.** `bind:` is parent/child syntax but relations are
    source→target; which side drives is convention, and bidirectional manipulation
    (drag the derived mean-line to move the brush?) is unaddressed. _Repair:_ explicit
    direction in the binding form; bidirectionality only via invertible relations
    (equate, offset), statically checked.

## Milestones

- **M1 — hover highlight** (Tier 0): `id` through lower→paint, event delegation,
  `pointer()`, `when()` states, runtime skeleton + stable-path re-binding.
- **M2 — draggable threshold** (Tier 1 + algebra core): `drag()`, overlay, writable
  anchors, equate + limit, `screenToData` inversion, keyed paint diffing.
- **M3 — brush** (the Meros walkthrough on GoFish): `brush()` on plot anchors, interval
  selector, linked highlighting, `during` vs `onEnd` gating, `brush.data.mean()` → text
  readout.
- Later: M4 snap-to-band (match over spread bands); M5 multi-brush; M6 wheel→maxbins
  (Tier 2 scheduler + the perf gate that decides whether the geometry-reset protocol
  gets built); polar `invert`.

**Verification:** per-milestone Storybook story (+ Playwright interaction);
`pnpm capture-diff <base>` must show zero drift on all existing stories; unit tests for
the algebra table, `screenToData` round-trips (nicing, shared-measure recentering,
y-flip, gutters are the risk), and limit composition.
