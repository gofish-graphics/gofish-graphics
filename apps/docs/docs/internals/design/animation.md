---
title: "An Animation Grammar: Time as the Third Axis"
section: Speculative Notes
order: 62
status: speculative
---

# An animation grammar: time as the third axis

> **Status: design exploration.** Conceptual model and syntax, deliberately
> ahead of implementation (which is confined to Appendix A). Synthesizes
> issues [#54](https://github.com/gofish-graphics/gofish-graphics/issues/54) (spread in time),
> [#211](https://github.com/gofish-graphics/gofish-graphics/issues/211) (`motion()`/`tween`),
> the reactivity substrate ([#671](https://github.com/gofish-graphics/gofish-graphics/pull/671)),
> and the future-work threads of the Bluefish, Animated Vega-Lite, and GoFish
> papers, against external prior art: Gemini/Gemini², Canis/CAST/CAST+,
> D3 transitions, react/solid-transition-group, anime.js/Motion, and Manim.

## 1. The problem: good local abstractions, no global picture

Every animation system we admire feels individually right and mutually
incompatible:

- **Animated Vega-Lite** treats animation as _timer-driven interaction_ — a
  timer is just another event stream feeding the same selection machinery as
  clicks and drags — and treats _time as an encoding channel_ that generates
  keyframes from a data field.
- **Gemini** composes animated transitions between two chart specs from a
  `sync`/`concat` timeline tree, with _staggerings_ (per-mark timing offsets,
  keyed by data fields) layered on separately.
- **Canis/CAST** organize animation as a _nested keyframe tree_: a recursive
  `groupBy` partitions marks into hierarchically grouped units, with sibling
  timing set by `reference: previousStart | previousEnd` plus a delay, and
  durations optionally scaled by a data value.
- **D3** owns the _enter/update/exit_ insight but attaches transitions
  imperatively to selections after each join; **react/solid-transition-group**
  invert this into the declarative form — lifecycle behavior declared once,
  keyed off dataset changes, with exiting elements retained until their exit
  animation completes.
- **anime.js/Motion** offer proven low-level _timelines_ (position labels,
  relative offsets, `stagger()`), and Motion's `layout` prop auto-animates
  position deltas across re-renders (the FLIP family).
- **Manim** stages the _reveal_ of already-constructed, already-laid-out
  content in presentation order — `play()` calls sequence, `lag_ratio`
  staggers — with no data-driven trigger at all.

These are not competing answers to one question. They are answers to **five
largely separable questions**, and each system bundles a preferred answer to
all five:

1. **What drives time?** A timer, a user input event, or a data change.
2. **What varies?** The data, the encodings/spec, or nothing but presentation
   order.
3. **Where does interpolation happen?** Upstream of layout (interpolate
   inputs, re-solve) or downstream (solve endpoints, interpolate outputs).
4. **How is timing composed across marks?** Sequencing, synchronization,
   staggering, nesting.
5. **What happens at a data change?** Which elements enter, update, exit —
   and how.

The claim of this document: GoFish already has the machinery to answer all
five. The spatial pipeline's stratification — operators over constraints,
connections as derived geometry, components on top — **reinterprets over a
time axis**, and the reactivity substrate (#671) supplies the trigger layer.
The design is one substrate plus temporal readings of existing strata, not a
bolted-on animation subsystem.

## 2. Semantic kernel: what exists at runtime

"Time is an axis" is the algebraic model, not the runtime object model. Space
can be solved once; animation also has clocks, causality, interruption, and
state that changes while it is being observed. The surface syntax therefore
elaborates into the following small temporal IR:

| Object             | Meaning                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **clock**          | An event source that can advance a playhead: wall time, a pointer or slider, or an application signal. A clock does not own animation structure.                                               |
| **playhead**       | The current position in one timeline's local time, plus transport state (`playing`, `paused`, direction, rate). Autonomous playback binds it to a clock; scrubbing writes it directly.         |
| **state**          | An immutable animation endpoint. Upstream states contain pipeline inputs; downstream states contain resolved display values; reveal states contain paint values.                               |
| **correspondence** | Keyed matches between the elements of adjacent states, partitioned into update, enter, and exit. It is required whenever element sets can differ, whether the animation is a scene or a segue. |
| **track**          | A target plus a function from local progress to a value. A track declares its interpolation space: upstream, downstream, or paint.                                                             |
| **interval**       | A track's start, end, preferred duration, and before/after fill behavior in its parent's local time.                                                                                           |
| **clip**           | The schedulable value consumed by `sequence`, `parallel`, and `stagger`: one or more tracks with an intrinsic or preferred duration.                                                           |
| **timeline**       | A tree of clips and timing constraints. Solving it assigns intervals; an optional duration budget may rescale flexible descendants.                                                            |

This separates three quantities that are easy to conflate: **data time** (for
example the `year` field), **timeline time** (milliseconds or normalized local
progress), and **clock time** (the event source advancing playback). A scale
may map data time into timeline time; a clock only moves the playhead.

### 2.1 Duration and fill invariants

A connection owns no _spatial_ size claim, but its temporal reading is a clip
and therefore does make a preferred duration claim. Composition determines the
final interval: sequence adds extents, parallel takes their maximum, and an
explicit parent duration rescales descendants whose durations are flexible.
An explicit child duration is fixed unless the author opts it into scaling.

Every interval also declares what its target does outside the interval. The
semantic choices are **absent**, **hold the boundary value**, and **paint
hidden** (laid out but not painted or hit-tested). Defaults are stratum-specific:
scenes default to absent before an element exists, segues hold endpoint values,
and reveals are paint-hidden before reveal and hold afterward. Authors may
override both the before and after behavior.

### 2.2 Interruption and competing writers

The first write to a playhead or data source is simple; the second write while
a transition is active is where an animation system earns its semantics.
GoFish uses these defaults:

- A new keyed update **retargets from the currently rendered value**, avoiding
  a jump back to the previous endpoint.
- Enter and exit tracks already in flight finish unless the same key is matched
  again, in which case the element retargets as an update.
- A scrub write wins over an autonomous clock until playback explicitly
  resumes. At most one source owns a playhead at a time.
- Scene inputs are sampled at the playhead position. If their structure
  changes, a new correspondence is computed at that sample boundary.

Queue, jump, and blend remain useful explicit policies, but they are not the
default. Nested timelines inherit transport from their parent while retaining
local time; easing composes as track-local time warps inside any parent warp.

## 3. Three kinds of animation: scenes, segues, reveals

Animated Vega-Lite named two kinds of animation by **what varies**:

- A **scene animation** holds the encodings fixed and varies the _data_:
  Gapminder advancing through years, a bar-chart race. The spec is one chart
  with a time-varying parameter.
- A **segue animation** holds the data fixed and varies the _encodings_ (or
  more generally the spec): a pie chart morphing into a bar chart, Keynote's
  Magic Move. The endpoints are two different charts.

Manim exposes a third kind that appears nowhere in the visualization
grammars:

- A **reveal animation** varies _nothing_ about the graphic — a finished,
  fully-laid-out visualization is disclosed piece by piece in presentation
  order (slideware builds, explorable explanations, teaching sequences). Only
  paint-time properties (opacity, clip, stroke-dashoffset) are scheduled;
  layout is untouched.

The trichotomy matters because the three kinds have different semantics
(§4), different composition needs (§5), and — as it happens — different
costs and prerequisites (Appendix A). A complete animation grammar should
express all three without forcing one kind through another kind's defaults.

## 4. Where interpolation lives: upstream or downstream of layout

The deepest semantic distinction in this design is _which side of the layout
function the interpolation sits on_. Write `layout` for the whole pipeline
(resolve → domains → solve → place), and `lerp` for interpolation at
parameter `t ∈ [0, 1]`:

- **Upstream interpolation** interpolates in _input_ space and lays out
  pointwise:

  `frame(t) = layout(lerp(input₀, input₁, t))`

  Every frame is in the image of `layout`: every intermediate is a **true
  layout**, a real solution to a real spec. Scene animations naturally live
  here — a scene is a curve through one spec's parameter space.

- **Downstream interpolation** solves both endpoints and interpolates in
  _output_ space:

  `frame(t) = lerp(layout(input₀), layout(input₁), t)`

  Intermediate frames are convex combinations of layouts and generally **not
  layouts**: mid-flight, bars overlap, stacks don't sum, constraints are
  violated. Magic Move, FLIP, D3 transitions, and Gemini (which interpolates
  compiled scenegraphs) all live here.

Generic segues default downstream: their endpoints are different specs, so
there is ordinarily no shared input parameter to interpolate. A segue may run
upstream only when an author or compiler supplies an explicit parameterization
between the specs — a typed spec morph rather than a generic interpolation.
Without one, non-layout intermediate frames are inherent to the segue, not an
implementation shortcut. Reveals sidestep the question entirely — nothing is
interpolated but paint.

### 4.1 The commutativity condition

When do the two sides agree? They agree throughout a transition when the
relevant path through layout is affine in the interpolated quantities — which
the σ-affine model can often prove. Within a σ-scope,
`px(d) = pxMin + σ·(d − domainMin)`. If a transition holds σ, the domain, and
the structure fixed, and every operator on the affected path is affine, then

`layout ∘ lerp = lerp ∘ layout`

and a scene-specified animation may be _lowered_ to a cheap downstream tween
with identical frames. Changing the domain or σ, changing structure, applying
a non-affine frame (log scales, polar and other curved transforms), or crossing
a discrete branch, clamp, or measurement boundary defeats that proof. Those
are precisely the transitions where "which side?" is a visible design
decision — tween σ itself (an animated axis rescale is a scene animation _of
the scale_) or tween pixels (Magic Move) — and the grammar should let the
author say which. Equality can still occur accidentally on a particular path;
the affine test is the useful static guarantee.

Gemini²'s keyframe recommendation and Gemini's "staged" transitions are two
statements of the same repair: **factor one large spec-crossing segue into
smaller segues through real intermediate states** (rescale the axes first,
then move the marks), so each leg is closer to satisfying the commutativity
condition. Make the lie smaller by adding true points.

### 4.2 Precedent: the connection stratum already answered this once

This upstream/downstream question is not new to GoFish — it is the
`curve`-vs-`smooth` bright line from the path-shaping work (#635, #637),
transposed to time:

- **`curve`** (screen-space, shipped): a pure geometric function of resolved
  layout positions. Downstream. The curve shapes appearance; it does not
  model data.
- **`smooth`/`regress`/`loess`** (#635, data-space `derive` operators,
  designed but unbuilt): fit a model to the data and **emit new data rows**,
  which then project through the (possibly non-affine) scales individually
  and render with a plain straight connector. Upstream. Data-space
  correctness comes for free because every emitted row is a real datum.

The dividing test from #635 — _"pure geometry of computed positions" vs
"fits a model to data and emits new data"_ — transfers verbatim: a **segue is
pure geometry of computed layouts; a scene emits real intermediate states
that render individually.** The two-layer ggplot idiom (`geom_point() +
geom_smooth()`) is the spatial shadow of Gemini²'s keyframe insertion: both
densify with true points so the geometric connector between them can be dumb.

One sharp technical note that falls out of taking the analogy seriously: our
default spatial curve is _centripetal_ Catmull-Rom, whose chord-length
parameterization depends on a **metric** — distances between points. Pixel
space has a canonical metric; data space across axes with different units
does not (what is the distance between (2 years, 3 dollars) and (5 years,
1 dollar)?). So centripetal interpolation is well-defined downstream and
ill-defined upstream without an explicit normalization — a principled reason
the appearance-smoothing default lives in screen space, and why a data-space
interpolation family (an `interpolate({ method: "catmullRom" })` sibling of
`smooth` in #635's family, emitting dense rows) should default to _uniform_
parameterization, which is affine-invariant and metric-free. The temporal
reading: **easing is parameterization** — a time-reparameterization of the
interpolant, independent of which space the interpolation happens in. After
Effects' "roving keyframes" (keyframes repositioned in time for smooth
speed) are chord-length parameterization applied to the time axis.

## 5. Time is an axis: the correspondence table

Time in this design is an axis with an underlying space, exactly like `x`
and `y`: it can be continuous (a real timeline) or ordinal (a sequence of
poses/steps), it carries a scale (data time → milliseconds), and the spatial
strata reinterpret over it. This is a claim about the _model_; the surface
uses distinct temporal vocabulary (§9.1). The equations:

| Temporal concept                  | Spatial construct, read on `t`                                                                                                                                         | Prior art                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| sequence (play one after another) | `stack` in `t`                                                                                                                                                         | Gemini `concat`, Manim `Succession`, D3 `.transition().transition()`                                                                |
| parallel (play together)          | `layer` in `t`                                                                                                                                                         | Gemini `sync`, Manim one `play()` call                                                                                              |
| stagger                           | `distribute({ dir: "t", spacing })`                                                                                                                                    | Gemini `staggerings`, `stagger()` in anime.js/Motion, D3 `.delay((d,i) => …)`                                                       |
| overlap                           | negative `spacing` in `t`                                                                                                                                              | Manim `lag_ratio ∈ (0,1)`                                                                                                           |
| synchronize starts/ends           | `align({ t: "start" \| "end" })`                                                                                                                                       | Gemini `sync`; Bluefish "temporal Align"                                                                                            |
| common fate                       | `align` applied to velocity                                                                                                                                            | Bluefish §9                                                                                                                         |
| duration                          | a size claim on `t`                                                                                                                                                    | every system's `duration`                                                                                                           |
| data-driven duration              | value-proportional sizing on `t`                                                                                                                                       | Canis `{ "field": …, "minDuration": … }`                                                                                            |
| fit to a total duration           | budget inversion (`Monotonic.inverse`) on `t`                                                                                                                          | Manim `AnimationGroup` rescaling run times to fit `run_time`; Gemini `totalDuration`                                                |
| nested keyframe groups            | nested scopes — σ-scopes in `t`: only a scope root solves its local time frame, descendants inherit                                                                    | Canis recursive `grouping`; CAST's nested keyframe tree; "temporal Enclose" (GoFish paper)                                          |
| transition between two states     | a connection mark on `t` — derived geometry consuming resolved states; no spatial claim, but a preferred temporal duration                                             | "temporal Connect" (GoFish paper); #54's interpolation mark; Gemini steps                                                           |
| keyframe interpolation dispatch   | `curve: "auto"` on `t`: continuous underlying space → one spline through the whole run; discrete → pairwise eased connectors                                           | AE spatial/roving keyframes vs CSS `@keyframes`; note CSS easing functions _are_ cubic Béziers — the honest discrete-pose connector |
| the timeline UI                   | the `t` axis, rendered — recursive axes (#606) means every space renders its axis; a time axis's natural rendering is a scrubber/progress bar, with keyframes as ticks | play bars everywhere; Animated Vega-Lite binding an animated selection to a slider                                                  |

Three of these deserve emphasis:

**Timeline composition is the space-fold algebra in one dimension.**
Sequential composition sums durations; parallel composition maxes them.
That is the same max-plus algebra of `Monotonic`s that makes spatial auto-fit
work — sum along the stack axis, max across layers, closed under composition,
invertible. "Fit this animation to 3 seconds" is the same solve as "fit this
chart to 400px," and Manim ships the existence proof: `AnimationGroup`
rescales its children's run times so the group fits a requested total.

**CAST's nested keyframes are the operator tree, re-read.** Canis's
recursive `groupBy` with per-level sibling timing is literally a GoFish flow:
`previousEnd` is stack-in-`t`, `previousStart`-plus-delay is layer-in-`t`
with a stagger. We do not need a new nesting construct; the flow's existing
group nesting _is_ the keyframe tree, with scoped time resolution following
the σ-scope rule (a nested timeline solves its own local frame; children
inherit).

**Interpolation marks are connections.** #54's interpolation mark — draw the
in-between frames differently from the true keyframes — is the connection
stratum on `t`: derived geometry that consumes resolved states the way
`line` consumes resolved bboxes. It owns no spatial claim, but as a clip it
requests a temporal interval (§2.1). This is where
segues live in the grammar (and it cleanly hosts #54's "segue spec language"
point that interpolations need not be tied 1:1 to keyframes: a connection is
free to reference any subset of states, just as `line` references any subset
of marks).

## 6. Triggers: one substrate, three event sources

Underneath everything is the Animated Vega-Lite unification, which #671 has
already made materially true in GoFish: **animation and interaction share
event sources.** A `timer()` is a signal; a pointer is a signal; a
data-changing `signal()` is a signal. Any timing structure from §5 can be
driven by a timer (autonomous playback), an input (scrubbing,
hover-to-advance), or a data write (live data). Binding the playhead to a
slider is scrubbing; pausing releases the clock without destroying the
timeline. The ownership and interruption rules in §2.2 define how those
sources compose.

This is also where the interaction design thread (#667, Meros) reattaches:
interaction and animation share the substrate and differ in event source,
exactly as the papers predicted ("brushing is user-driven enclosure" is the
interaction reading of the same Gestalt correspondences).

## 7. Lifecycle: enter, update, exit

When the trigger is a data change, a new question appears that spatial
layout never faces: the two solves have different element sets. Establish a
correspondence between them (this is what stable identity, #673, provides —
keys from spec position × data key), and the correspondence has three parts:

- **update** — the matched pairs (the bijective part). Tweenable; FLIP-style
  position animation and Animated Vega-Lite's `key` both live here.
- **enter** — new elements with no source. **exit** — old elements with no
  destination. Enter/exit is _the non-bijective remainder of a state
  correspondence_. Its visual behavior is implemented by downstream or paint
  tracks even when an upstream scene change caused the correspondence.

We adopt the transition-group model, not D3's: lifecycle behavior is
**declared once on the mark, keyed off dataset changes**, rather than
imperatively re-attached after every join; exiting elements are retained
until their exit animation completes. D3's model feels reversed because the
transition is a side effect of DOM manipulation you re-perform, instead of a
property of the mark you state. Among the surveyed systems, only the
transition groups make this declarative and first-class; a visualization
grammar with native, keyed lifecycle would be genuinely differentiated.

## 8. The strata

Putting §§4–7 together, the animation surface stratifies the way the spatial
surface does — and mostly _as_ the spatial strata, temporally read:

| Stratum            | Spatial analog                         | Animation reading                                                                       | Elaborates into                                       |
| ------------------ | -------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| substrate          | signals (#671)                         | `timer()` / inputs / `signal()`; `live()` paint channels                                | — (shipped)                                           |
| timing constraints | `align` / `distribute`                 | sync starts/ends; stagger/overlap; data-driven timing offsets                           | signal reads + the `t` budget solve                   |
| timing operators   | `stack` / `layer` / `spread` / `group` | sequence, parallel, spread-in-`t` (scene keyframes from a data field), nested timelines | timing constraints (same sugar relationship as space) |
| connection marks   | `line` / `ribbon`, `ref`/`selectAll`   | segue/interpolation marks between named states; "temporal Connect"                      | derived tweens over resolved states                   |
| lifecycle          | — (new; lives at the data join)        | `enter`/`update`/`exit` declared on the mark, keyed                                     | segue correspondence + retention                      |
| component staging  | templates / builder                    | `.stage()`: presentation-order reveal of a finished layout                              | paint-tier schedules over `live()` channels           |

Reveals sit at the component/staging level and elaborate _only_ into paint —
they never touch layout, which is exactly why Manim feels like "a different
direction": it is the one stratum whose target is the paint tier alone.

## 9. Syntax sketches

Strawmen — the point is the shape of each stratum's surface, not final
names.

### 9.1 Decided: distinct temporal vocabulary over a shared axis model

Everything in §5 says the _model_ is "t is an axis." The surface
deliberately does **not** expose it as one: spatial operators do not grow a
`dir: "t"`. Reading `spread` should always mean spatial layout. The temporal
constructs get their own names, option shapes, and conventions even though
they are conceptually the same algebra — precisely the way operators,
constraints, and relational marks are one machinery exposed as three
syntactically distinct strata with different APIs. Distinct names are how
GoFish marks a stratum boundary; the equivalences table in §5
(`sequence ≡ stackₜ`, `stagger ≡ distributeₜ`, …) is the contract that keeps
the vocabulary honest.

Two rejected poles, for the record:

- **Literal reuse** (`spread("year", { dir: "t" })`): maximal unification,
  and the whole §5 table comes for free — but it muddies the spatial reading
  of the operator names, and it makes authors feel every imperfection of the
  identification (overlap is normal and desirable on `t` but a bug on `x`;
  cross-axis `alignment` has no temporal meaning; the outside-the-interval
  question of §9.5 has no spatial counterpart).
- **A separate animation sub-language** (its own spec object,
  Gemini-style): re-bundles the five questions this design just unbundled,
  and forfeits the shared algebra (auto-fit, nesting, data-driven timing)
  that a shared model inherits.

Adopted: named temporal forms that elaborate to `t`-axis constraints —
strawman vocabulary, following house option style (single `by` key, options
object, combinator/operator dual forms where sensible). Each form returns a
`Clip`, the schedulable value from §2:

```ts
sequence([titleIn, barsIn, annotationIn], { overlap: 0.1 });
parallel([axesIn, marksIn]);
stagger(barsIn, { by: "month", delay: 50 });
keyframes("year", { key: "country" });
```

The first three compose clips. `keyframes` is an operator that constructs one
clip from a data-time field; its output can be passed to the same combinators.

The names are placeholders; the principle — new temporal names, shared
underlying algebra, documented equivalences — is the decision.

### 9.2 Scene animation (upstream; time from a data field)

```ts
// one keyframe per year; key gives object constancy; continuous year
// → curve:"auto" resolves to a spline through the run (roving keyframes),
// an ordinal step field would resolve to pairwise eased tweens
chart(gapminder)
  .flow(keyframes("year", { key: "country", duration: 500 /* per step */ }))
  .mark(circle({ x: "gdpPercap", y: "lifeExp", r: "pop" }));
```

`rescale` from Animated Vega-Lite is then just: does the σ-scope of the
chart re-solve per keyframe (a scene animation of the scale) or hold fixed —
a per-scope declaration, not a global mode. `key` constructs the correspondence
between adjacent years. The data interpolator must define each field's behavior
and route missing countries through the mark's enter/exit tracks; upstream
interpolation does not remove the need for identity.

### 9.3 Timing constraints (Gemini as constraints)

```ts
.constrain((c) => [
  c.syncStart([selectAll("bars"), ref("title")]),
  c.stagger(selectAll("bars"), { by: "month", delay: 30 }),
])
```

These temporal names elaborate to the same internal constraints as
`align`-in-`t` and `distribute`-in-`t`, without exposing spatial vocabulary at
the API boundary.

### 9.4 Segue marks and lifecycle (downstream)

```ts
// temporal Connect: derived geometry between two named states
segue(ref("before"), ref("after"), { curve: "auto", duration: 800 })
  // lifecycle is declared once and inherits the segue interval
  .mark(
    rect({ h: "value" }).transition({
      key: "id",
      enter: fadeIn(),
      update: tween(),
      exit: fadeOut(),
    })
  );
```

The segue's `duration` is the clip's preferred duration. Lifecycle tracks
inherit that interval by default; a child may request its own duration, in
which case §2.1's fixed-versus-flexible budgeting rule applies. A new update
arriving during the 800 ms interval follows §2.2 and retargets from the current
rendered value.

### 9.5 Reveals (paint-only staging of a finished layout)

```ts
chart(data)
  .flow(spread("month", { dir: "x" }))
  .mark(rect({ h: "value" }).name("bars"))
  .stage((s) => [
    s.reveal(selectAll("bars"), { by: "month", overlap: 0.1 }), // LaggedStart
    s.reveal(ref("annotation"), { after: "bars" }),
  ]);
```

The interval behavior here follows §2.1: each bar is paint-hidden before its
reveal interval and holds its finished paint afterward. Paint-hidden marks do
not participate in hit-testing. This keeps the final layout fixed while
preventing undisclosed content from behaving as if it were visible.

### 9.6 First elaboration: reveal to paint patches

Reveal is the smallest end-to-end slice of the semantic kernel. The example
above elaborates in five steps:

1. Resolve and lay out the finished chart once, then resolve `ref` and
   `selectAll` against stable display-item identities.
2. Turn each `s.reveal(...)` into paint tracks whose value is a reveal mask;
   authored opacity remains separate and displayed opacity is
   `authoredOpacity × revealMask`.
3. Lower `by`, `overlap`, and `after` into interval constraints and solve the
   stage timeline.
4. Create a chart-owned playhead. A chart-owned clock advances it during
   playback; a scrubber may instead write it directly. Disposal stops the
   clock and releases the tracks.
5. On each playhead change, evaluate only active paint tracks and patch the
   display list. No layout or scale work is repeated.

The first implementation deliberately supports play, pause, seek, one
chart-owned clock, opacity reveals, sequence, and stagger. It excludes layout
tweens, arbitrary clip-path generation, nested easing, and mid-flight data
retargeting. Those exclusions keep the MVP honest without changing the IR it
elaborates into.

## 10. Open questions

- **Easing defaults.** §2 places easing on tracks and defines nested easing as
  function composition. The remaining design choice is which easing each
  stratum supplies when the author provides none, and whether a timeline-level
  warp should be exposed as ordinary syntax or only as a compiler primitive.
- **Data-space interpolation family.** Extend #635's family with
  `interpolate({ method })` emitting dense rows (uniform parameterization by
  default, per the metric argument in §4.2)? This is the upstream sibling of
  `curve` and the spatial shadow of scene animation. Sharper position now
  recorded on #635: when a run has a true continuous parameter (the
  connection axis), the _default_ smoothing should be parameterized by that
  variable's data values and evaluated upstream; centripetal-in-screen
  remains only for parameterless geometric curves (routing, hulls, bundles).
- **Transport surface.** Loop, alternate, and play-once are properties of the
  playhead transport, not of the data-time scale. The open question is how
  much transport control belongs on a chart versus an external binding.
- **Coordinate transforms on `t`.** If `t` is an axis, coordinate transforms
  apply: a polar `t` axis is a clock face; a sweep animation is `t` bent
  through `polar`. Possibly a curiosity, possibly radar/clock charts for
  free.
- **The recommender layer.** Gemini, Gemini², and CAST are all
  _recommenders_ over their grammars (enumerate candidate stagings, rank by
  perceptual cost). This grammar is the search space; synthesis over it is a
  separate project (relates to the layout-synthesis thread, #610/#631).
- **Interaction composition.** Scrub-while-playing, hover-to-pause, and
  brush-to-filter-mid-animation follow §2.2's ownership
  and retargeting defaults. The Meros binding algebra (#667) is where richer
  multi-source policies such as blend and queue would live.

## 11. Lineage: why this model fits GoFish

The temporal reading of spatial relations is the standing future-work thread
of this research program:

- **Bluefish** (UIST 2024, §9) identifies common fate with alignment applied
  to velocity, temporal distribution with staggering, and temporal alignment
  with unified animation starts or ends.
- **The GoFish paper** (§8) relates Gemini's `concat` and `sync` to temporal
  spacing and alignment, CAST's nesting to temporal enclosure, and proposes a
  temporal `Connect` that moves an element along a path between states.
- **Animated Vega-Lite** (§7.2.2) calls out the combination of Gemini's segue
  abstractions with Animated Vega-Lite's scene abstractions as future work.

In-repo, #54 proposed animation as spreading in the time direction, an
interpolation mark paralleling `line`/`ribbon`, a segue language in which
interpolations need not be tied 1:1 to keyframes, and nested keyframes as
nested underlying time spaces. #211 proposed the `motion()` signal whose
`.set(value, tween(ms))` drives re-resolution. The model in this document
combines those threads, while §2 adds the runtime semantics that the spatial
analogy alone cannot supply.

## Appendix A: cost model and prerequisites (implementation, brief)

The strata land on the two regimes of #671 unevenly, which gives a natural
sequencing — this is deliberately a sketch, not a plan:

- **Reveals are the smallest first slice, but not free.** Paint-tier updates
  can reuse `live()`-style patches with zero re-layout. `.stage()` still needs
  the temporal IR, post-layout selector resolution, reveal-mask composition,
  a chart-owned playhead and clock with disposal, and paint-hidden hit-testing
  semantics. §9.6 fixes the first slice's boundaries.
- **Scenes work today, expensively.** A signal read in resolve re-runs the
  full pipeline per tick (rAF-coalesced). Correct semantics (every frame a
  true layout) at full-solve cost; incremental layout (#674) is the
  economics fix, and the σ-affine commutativity check (§4.1) is the
  semantics-preserving fast path (lower to a downstream tween when the frame
  is fixed).
- **Structural scenes, segues, and lifecycle gate on stable identity (#673).**
  Any correspondence between states with changing element sets needs keys;
  #673 (spec position × data key) is the prerequisite, already flagged in
  `incremental-layout.md` as "enables object constancy in animation." Exit
  retention also needs the renderer to keep unmatched display items alive past
  their solve. Fixed-structure numeric scenes can run without this machinery.
- **FLIP-style updates want translation-absorbing lowering.** Whether a
  moved subtree is one `<g transform>` patch or a full repaint is the open
  display-list question in `incremental-layout.md` §3; a tweening layer
  wants the former.
- **Cross-language:** any new constructs cross the Python/IR bridge like
  everything else (descriptor table, registry, harness — the standard
  checklist).

## Sources

- In-repo: #54 (spread in time), #211 (`motion()`), #671 (reactivity
  substrate), #672/#673/#674 (capture, identity, incremental layout), #635
  (data-space smoothing), #637 (`curve` consolidation), #606 (recursive
  axes), #610/#631 (layout synthesis), #667 (Meros interaction).
- Papers: Bluefish (UIST 2024); Animated Vega-Lite (VIS 2022); the GoFish
  paper §8; Gemini (VIS 2020) and Gemini² (VIS 2021); Canis (EuroVis 2020),
  CAST (CHI 2021), CAST+.
- Systems: D3 transitions/join; react/solid-transition-group; anime.js v4;
  Motion; Manim (`AnimationGroup`/`lag_ratio`); CSS easing (`linear()`,
  cubic-bezier); After Effects roving keyframes.
