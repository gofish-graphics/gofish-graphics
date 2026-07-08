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
independent questions**, and each system bundles a fixed answer to all five:

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

## 2. Lineage: this design was promised three papers ago

The temporal reading of spatial relations is the standing future-work thread
of this research program:

- **Bluefish** (UIST 2024, §9): "common fate, where elements travel in the
  same direction are grouped together, is alignment applied to velocity...
  we could think of Bluefish's Distribute as distributing elements along a
  time axis to stagger movements in time, and a temporal Align as unifying
  the start or end of multiple animations."
- **The GoFish paper** (§8): "The Gemini grammar's concat and sync operators
  act as temporal spacing and alignment, respectively, which are the
  constituent Gestalt principles of Stack. In the CAST animation system,
  animations may be staged or nested, conveying information similar to a
  temporal Enclose. We wonder whether future animation grammars could benefit
  from a **temporal Connect** that animates an element along a path between
  two other elements."
- **Animated Vega-Lite** (§7.2.2): "Combining Gemini's segue abstractions
  with Animated Vega-Lite's scene abstractions is a promising future
  direction for expressive animation."

In-repo, #54 already proposed animation as "spreading in the time direction,"
an interpolation mark paralleling `line`/`ribbon` for the time dimension, a
"segue spec language" where interpolations are not tied 1:1 to keyframes, and
nested keyframes as nested time underlying spaces (the CAST+ aside). #211
proposed the `motion()` signal whose `.set(value, tween(ms))` drives
re-resolution over time. This document is the combination all of those asked
for.

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
costs and prerequisites (Appendix A). A complete animation grammar must
express all three; every existing system commits to one and approximates the
others.

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

Segues are _forced_ downstream: their endpoints are different specs, so there
is no shared parameter to interpolate upstream. Untrue intermediate frames
are inherent to segues, not an implementation shortcut. Reveals sidestep the
question entirely — nothing is interpolated but paint.

### 4.1 The commutativity condition

When do the two sides agree? Exactly when layout is affine in the
interpolated quantities over the transition — which the σ-affine model makes
precise. Within a σ-scope, `px(d) = pxMin + σ·(d − domainMin)`. If a
transition holds σ, the domain, and the structure fixed, then

`layout ∘ lerp = lerp ∘ layout`

and a scene-specified animation may be _lowered_ to a cheap downstream tween
with identical frames. The condition fails exactly when: the domain or σ
changes (Animated Vega-Lite's `rescale`), the structure changes (marks enter
or exit, an operator re-partitions), or the frame is non-affine (log scales,
polar and other curved coordinate transforms). Those are precisely the
transitions where "which side?" is a visible design decision — tween σ itself
(an animated axis rescale is a scene animation _of the scale_) or tween
pixels (Magic Move) — and the grammar should let the author say which.

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
| transition between two states     | a connection mark on `t` — derived geometry consuming resolved states, owning no time claim of its own                                                                 | "temporal Connect" (GoFish paper); #54's interpolation mark; Gemini steps                                                           |
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
`line` consumes resolved bboxes, owning no claim of its own. This is where
segues live in the grammar (and it cleanly hosts #54's "segue spec language"
point that interpolations need not be tied 1:1 to keyframes: a connection is
free to reference any subset of states, just as `line` references any subset
of marks).

## 6. Triggers: one substrate, three event sources

Underneath everything is the Animated Vega-Lite unification, which #671 has
already made materially true in GoFish: **animation is timer-driven
interaction.** A `timer()` is a signal; a pointer is a signal; a
data-changing `signal()` is a signal. The trigger question (question 1 of
§1) is fully orthogonal to everything above — any timing structure from §5
can be driven by a timer (autonomous playback), an input (scrubbing,
hover-to-advance), or a data write (live data). Binding the `t` axis to a
slider _is_ scrubbing; pausing is `timer.stop()`; these compose by
construction rather than by feature.

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
  destination. Enter/exit is _the non-bijective remainder of a segue
  correspondence_ — which is why lifecycle belongs to the segue/downstream
  stratum, and why no amount of scene machinery produces it.

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
object, combinator/operator dual forms where sensible):

```ts
sequence([a, b, c], { overlap: 0.1 }); // ≡ stack in t, negative spacing
parallel([a, b]); // ≡ layer in t
stagger({ by: "month", delay: 50 }); // ≡ distribute({ dir: "t", by, spacing })
keyframes("year", { key: "country" }); // ≡ spread in t (scene operator, §9.2)
```

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
a per-scope declaration, not a global mode.

### 9.3 Timing constraints (Gemini as constraints)

```ts
.constrain((c) => [
  c.align({ t: "start" }, [selectAll("bars"), ref("title")]),   // sync
  c.distribute({ dir: "t", spacing: 30 }, selectAll("bars")),   // stagger
])
```

### 9.4 Segue marks and lifecycle (downstream)

```ts
// temporal Connect: derived geometry between two named states
segue(ref("before"), ref("after"), { curve: "auto", duration: 800 })
  // lifecycle: declared once, keyed; exit retained until finished
  .mark(
    rect({ h: "value" }).transition({
      key: "id",
      enter: fadeIn(300),
      update: tween(500),
      exit: fadeOut(300),
    })
  );
```

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

Open interval-semantics question, deliberately unresolved: what is a mark
before/after its `t` interval — absent (scene default: the year's data
doesn't exist yet), frozen at its boundary pose (reveal default: the chart
is finished, just undisclosed), or clipped? Space never faces this because
space doesn't play back; it is the one genuinely new semantic knob the time
axis introduces, and probably wants a per-stratum default plus an override.

## 10. Open questions

- **Easing's home.** Easing is time-reparameterization (§4.2), so it could
  attach to the time _scale_ (warping the whole timeline), to a segue
  (per-transition), or both. Both, probably — but the composition of nested
  easings needs a rule (compose the warps? innermost wins?).
- **Data-space interpolation family.** Extend #635's family with
  `interpolate({ method })` emitting dense rows (uniform parameterization by
  default, per the metric argument in §4.2)? This is the upstream sibling of
  `curve` and the spatial shadow of scene animation. Sharper position now
  recorded on #635: when a run has a true continuous parameter (the
  connection axis), the _default_ smoothing should be parameterized by that
  variable's data values and evaluated upstream; centripetal-in-screen
  remains only for parameterless geometric curves (routing, hulls, bundles).
- **Playback semantics.** Loop, alternate, play-once; `timer()` already has
  `stop()`/`start()`. Likely properties of the `t` scale, not new constructs.
- **Coordinate transforms on `t`.** If `t` is an axis, coordinate transforms
  apply: a polar `t` axis is a clock face; a sweep animation is `t` bent
  through `polar`. Possibly a curiosity, possibly radar/clock charts for
  free.
- **The recommender layer.** Gemini, Gemini², and CAST are all
  _recommenders_ over their grammars (enumerate candidate stagings, rank by
  perceptual cost). This grammar is the search space; synthesis over it is a
  separate project (relates to the layout-synthesis thread, #610/#631).
- **Interaction composition.** Scrub-while-playing, hover-to-pause,
  brush-to-filter-mid-animation — the shared-substrate claim (§6) says these
  compose; the Meros binding algebra (#667) is where the composition rules
  would live.

## Appendix A: cost model and prerequisites (implementation, brief)

The strata land on the two regimes of #671 unevenly, which gives a natural
sequencing — this is deliberately a sketch, not a plan:

- **Reveals are nearly free today.** Paint-tier only: `live()` channels over
  a `timer()`, zero re-layout, no identity needed (nothing changes but
  paint). `.stage()` could ship on the current substrate.
- **Scenes work today, expensively.** A signal read in resolve re-runs the
  full pipeline per tick (rAF-coalesced). Correct semantics (every frame a
  true layout) at full-solve cost; incremental layout (#674) is the
  economics fix, and the σ-affine commutativity check (§4.1) is the
  semantics-preserving fast path (lower to a downstream tween when the frame
  is fixed).
- **Segues and lifecycle gate on stable identity (#673).** A correspondence
  between two solves needs keys; #673 (spec position × data key) is the
  prerequisite, already flagged in `incremental-layout.md` as "enables object
  constancy in animation." Exit retention also needs the renderer to keep
  unmatched display items alive past their solve.
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
