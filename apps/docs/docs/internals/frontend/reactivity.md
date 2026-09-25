---
title: Reactivity
section: Frontend
order: 70
status: draft
covers:
  - packages/gofish-graphics/src/interaction/index.ts
  - packages/gofish-graphics/src/interaction/types.ts
  - packages/gofish-graphics/src/interaction/live.ts
  - packages/gofish-graphics/src/interaction/liveSlots.ts
  - packages/gofish-graphics/src/interaction/inputs.ts
  - packages/gofish-graphics/src/interaction/resolveContext.ts
  - packages/gofish-graphics/src/interaction/frameScales.ts
  - packages/gofish-graphics/src/interaction/runtime.ts
  - packages/gofish-graphics/src/interaction/renderTerminal.ts
  - packages/gofish-graphics/src/interaction/widgets.ts
---

# Reactivity: signals beside a synchronous pipeline

GoFish's layout pipeline is a pure, synchronous function of a spec: resolve →
layout → lower → paint, with no notion of time and no reactive reads inside it.
Interaction — a hover recolor, a wheel that re-bins, a dragged threshold —
needs values that _change_. The reactive layer (`src/interaction/`) supplies
those changing values as SolidJS **signals** (reactive cells that notify their
readers when written) while leaving the pipeline exactly as it was.

The whole design rests on one decision: **signals live _outside_ the pipeline.**
The pipeline never reads a signal. Instead, the point where an author's spec
_reads_ a signal decides one of two execution regimes, and each regime has its
own machinery. This essay explains that split and the invariants that make it
byte-safe for non-interactive charts.

For the author-facing surface — `live()`, `pointer`, `drag`, `wheel`, `timer`,
`signal` — see the [Reactivity & Interaction](/js/reactivity) guide. This page
is the machinery.

## Two regimes, decided by read location

An author can put a reactive read in two kinds of place:

- **Inside a `live()` channel** — e.g. `fill: live((d) => d === p.datum() ? …)`.
  This is a **paint-only** patch: when the signal changes, one SVG attribute
  updates and nothing else runs. No re-resolve, no re-layout.
- **Anywhere else the spec evaluates during resolve** — a `derive()` callback, a
  layout channel like `h` or `y`, or plain data construction. This registers the
  input as a **pipeline dependency**: a change re-runs the _entire_ pipeline
  (resolve → layout → lower → paint) through a rAF-coalesced scheduler.

The split is not configured; it _falls out_ of where the read happens. That is
deliberate — it means the same authoring surface can later grow finer-grained
incremental layout without an API change (see [Incremental
outlook](#incremental-outlook)).

## The ambient resolve context

The builder cannot tell whether a chart is interactive by inspecting the method
chain: `live()` is just a channel value, and a library input read inside a
`derive()` closure surfaces only when that closure _runs_. So the render
terminal installs an **ambient context** around resolve and lets inputs announce
themselves on read.

`resolveContext.ts` holds a single module-level variable (the current
`AmbientRegistrar`). The **render terminal** (`renderTerminal.ts`,
`renderWithInteraction`) wraps resolution in `withInteractiveResolve(runtime,
fn)`, which sets the variable for the duration of the resolve and restores it
after. Every library input's accessor, when read, does:

```ts
const reg = ambientRegistrar();
if (!reg) return; // read outside a resolve — just a plain read
reg.registerInput(this); // wire this input into event dispatch (idempotent)
if (!inLiveEval()) this.usedInSpec = true; // a spec read → pipeline dependency
```

Two flags carry the whole mechanism:

- **`usedInSpec`** — set when the input is read _outside_ a `live()` channel.
  The runtime resets it on every input at the start of each resolve
  (`beginResolve`), so it always reflects reads in the _current_ resolve: an
  input read in resolve _N_ but not _N+1_ stops invalidating.
- **`inLiveEval`** — a depth counter set while a `live()` channel is being
  evaluated _at resolve time_. Reads under it wire event dispatch but do **not**
  mark `usedInSpec`, because a live channel re-runs at paint, not at resolve.

When a signal is written (pointer move, wheel tick, `signal.set`), the input asks
the runtime to `invalidate()` **only if `usedInSpec` is true**. A purely-`live()`
input never invalidates; its changes are picked up by Solid at paint. If nothing
registers during a resolve, the runtime reports `hasWork() === false` and the
chart renders down the static path untouched — no `data-gf-id`, output identical
to a non-interactive build.

> **Concurrency caveat.** The ambient context is a module variable, so two
> charts resolving _concurrently_ (interleaving at `await` points — e.g. a Python
> `derive` RPC) could cross-register. Registration sites are synchronous
> spec-evaluation code in practice; a scoped-storage mechanism can replace the
> module var if async marks ever make the race real. Paint is the exception
> that showed up: a live slot re-runs on a clock tick, and the tick can land
> while another chart's resolve is suspended at an `await`. So every slot
> `setLiveSlots` stores reads under `runInLiveEval`, and a paint read never
> becomes a pipeline dependency of whatever chart is resolving. (It can still
> register the input with that chart's runtime, which only wires events.)

## One terminal, three callers — including components

`renderWithInteraction` (in `renderTerminal.ts`) is the single place a resolve is
run under the ambient context. It is regime- and pipeline-agnostic: given a
`resolveForRender` thunk that yields a `{ node, options }` pair and a container,
it creates a fresh `InteractionRuntime`, calls `beginResolve()`, evaluates the
thunk under `withInteractiveResolve`, threads `options.interaction = runtime`
**iff** `hasWork()`, and wires `setRerender` to re-invoke the whole resolve into
the same container. It hands each resolve a `RenderPass` that says whether this
is the chart's first render or a re-render, and lets the resolve register a
cleanup that runs before the next render. The chart pipeline uses it to play the
build-in on the first render only and to stop that render's build clock (a
declared shortcut, #914). Three callers share it:

- `ChartBuilder.render` and `LayerBuilder.render` — the v3 chart pipeline. Both
  get `render` from the shared terminal registry (`marks/terminals.ts`) with
  `renderWithInteraction` as their render strategy, and their one shared
  `resolveForRender` runs domain inference + layout over the builder's spec.
- the low-level `gofish()` terminal (`gofish.tsx`) when handed a **component
  thunk** — `gofish(container, opts, () => node)`, a raw shape/operator
  composition with no `chart()` builder and no data binding.

The component case is what proves the reactive layer is not tied to the chart
pipeline. Paint reactivity already is: a `live()` channel bakes its per-item
thunk at lower time and `paintSVG` calls it regardless of any runtime, so a plain
`gofish(container, opts, node)` over a raw node patches `live()` fills with **no
runtime at all** (no `data-gf-id`, no listeners — Solid tracks the thunk's reads
directly at paint). The **pipeline** tier and **event inputs** are what need the
runtime, and both are unlocked by the _thunk_: a raw node is built once and cannot
re-evaluate its spec, so a `signal()`/`wheel()` read outside `live()` needs a
thunk the scheduler can re-invoke, and a `pointer()` read inside `live()` needs
the runtime installed for `data-gf-id` hit-testing (its resolve-time evaluation
registers the input under the ambient context, flipping `hasWork()` true). The
thunk plays exactly the role the chart builder's immutable rebuild plays.

`renderTerminal.ts` lives in the interaction layer (not `marks/chartBuilder.ts`)
so `gofish.tsx` can reach it without importing the chart-builder module — the
dependency runs one-way (`gofish.tsx` → `interaction/`), never into `marks/`. The
only node coupling is the `.render(container, options)` call, kept as a type-only
import.

## The paint mechanism: thunks in a display-item side table

A `live()` value is a plain callback tagged with a brand symbol
(`live.ts`). It is evaluated **once at resolve** — untracked, under `inLiveEval`
— to produce the value the pipeline measures and lays out with (a live text's
box is sized from this snapshot; a live color's scale/legend inference sees it).
The channel loop (`withGoFish.ts`, and `chart.ts`'s `circle`) carries the raw
`live()` callback forward on the node as `__gfLive`, keyed by channel name.

At **lower** time (`_node.ts`, `INTERNAL_lower`) each live channel is bound to
its node's datum and baked into a per-item thunk record stored in a
module-level `WeakMap` keyed by the display item (`liveSlots.ts`):

```ts
slots[channel] = () => accessor(datum); // datum-bound, evaluated later
setLiveSlots(item, slots);
```

The thunks live in a side table, **not on the item**, on purpose: display items
flow into serialization and normalized-DOM captures, and the `gofish-ir`
display-list types must stay pure serializable data — no function values.

`paintSVG` (`paintSVG.tsx`) looks each item up in the side table. If a slot
exists, it _calls the thunk in JSX attribute position_:

```ts
<rect … fill={live.fill()} />    // Solid tracks the signal read here
```

Because the call happens inside a Solid JSX accessor, Solid tracks whatever
signals the thunk reads and, on change, patches **only that attribute** — no
re-lower, no re-layout. A `"text"` slot is special-cased to override text
_content_ (the box keeps its resolve-time measure). String/headless backends
(`displayListToSVG`) snapshot a live value by calling the thunk once, untracked.

A slot named after one of the item's own **geometry** fields (`x`, `y`, `w`,
`h`, `cx`, `cy`, `rx`, `ry`, `d`) overrides that field instead of a style key,
through the same call-in-attribute-position path. Geometry is live for the same
reason paint is — the value is a paint-time fact while the box it sits in is a
layout-time one — and it carries the same obligation that live text does: the
mark claims at layout the room it will use over every value the signal can take,
because nothing above it is laid out again. The two known limits are also the
paint channels': a serialized display list and the frame the runtime publishes
for hit-testing both carry the resolve-time value, so a moving item's recorded
box is where it started.

The runtime keeps **no** paint role at all. Paint reactivity is entirely between
the side table, `paintSVG`, and Solid.

## The runtime: scheduler, dispatch, hit-test

`InteractionRuntime` (`runtime.ts`) has exactly three jobs and never touches the
layout pipeline:

1. **rAF-coalesced re-render scheduler.** `invalidate()` schedules one re-render
   per animation frame; while one is running, further invalidations set a
   `dirty` flag so the latest state wins and a single follow-up run picks it up.
   In a hidden tab (where browsers throttle rAF to zero) it falls back to a
   timeout so headless drivers and backgrounded views don't freeze. The
   re-render thunk (`setRerender`, wired by the render terminal) rebuilds the
   whole tree — through the immutable builder for a chart, or by re-invoking the
   component thunk for a low-level `gofish(container, opts, () => node)` — and
   renders into the _same_ container — hence the container-dispose hook below.
2. **Delegated event dispatch.** `attachSVG` puts one listener per event type
   (`pointermove/down/up/leave`, `wheel`) on the root `<svg>` and fans each event
   out to every registered input, with a `data-gf-id` hit-test resolving the
   display item (and thus datum) under the pointer.
3. **Hit-testing + frame publication.** `publishFrame` rebuilds an id→item map
   and an id→box map (uids are minted fresh each resolve) and the data↔px
   conversions, then notifies inputs.

There is **no** caching, no partial layout: any pipeline-dependency change re-runs
everything. That is the point of v1 — correctness first, with the read-location
split positioned so incremental layout can slot in later.

## Recorded scales → frame conversions

Inputs that speak in data coordinates (`pointer().dataPos()`,
`drag().currentData()`) need to invert the chart's positional mapping. They do
**not** re-derive scales. `render()` (`gofish.tsx`) records the root position
scales (data → gofish-space) and `toPixel` (gofish-space → screen px) onto the
published `InteractionFrame`. `frameScales.ts` composes those _recorded_ forward
maps into `dataToPx` per axis, and — because every leg is affine — obtains
`pxToData` by **sampling two points** (`invertAffine`), never by re-running scale
inference. This is the recorded-scale invariant: the interaction layer only ever
_reads off_ what layout already computed.

The same principle covers geometry. `nodeBox(uid)` answers "where did
layout put that node?" by reading the box the frame already carries for it:
`publishFrame` records one box per node uid during the same walk that builds the
hit-test map, folding in any enclosing `group` transform (display items are
absolute pixels except inside a group, whose children are in its local space).
Primitives that carry no box of their own — a `path` (an SVG `d` string) and a
`text` (an anchor plus a string) — are left out rather than guessed at. The
alternative was reading a rendered element's screen CTM back out of the DOM,
which would let paint inform layout; this reads off the same recorded frame the
conversions do, which does not.

A consequence worth stating: an input's data-space reads only work once the input
is **attached** to a chart, which happens when the input is `registerInput`-ed —
i.e. when it is read during that chart's resolve. An input read only from outside
code (a bare `createEffect`) never attaches, so `dataPos()`/`currentData()` return
`undefined`.

## The timer is a scale, not a tick counter

`timer()` is the odd input: nothing outside it writes it, so it is the one input
that drives itself. Its model is a **scale from a data domain onto wall-clock
time, used in the inverse direction**:

```
t() = scale(domain → [0, duration]).invert(elapsed)
```

Three consequences fall out of that, all of them in `inputs.ts`:

- **Elapsed is measured, not counted.** `base` holds elapsed as of the last
  pause or seek and `since` the `performance.now()` reading when the clock last
  started, so pause, resume and `.set(v)` are exact and a slow frame loses
  nothing. The `setInterval` period is a module constant (`SAMPLE_MS`, 16 ms) and
  deliberately not an option: it only decides how often the clock is SAMPLED, and
  a caller who wants coarser updates says so with a coarser `step`. "Is the clock
  running" is one signal (`playing`), read through `untrack` internally so the
  lazy start on first read does not make a spec depend on the play state.
- **The signal holds the emitted domain value, not elapsed.** A sample that
  lands on the same value writes nothing, so a quantized clock invalidates once
  per step rather than once per frame. A 365-day year over ten seconds costs 365
  pipeline re-runs, not 600.
- **`.set(v)` is the same scale forward.** Seeking is `elapsed := scale(v)`, and
  it deliberately leaves the playing state alone: whether a scrub pauses the
  clock is the widget's decision, not the clock's.
- **Play state is a readable, so it invalidates like one.** `isPlaying()` is
  tracked at its read location like every other accessor, so `play()`, `pause()`
  and the self-pause that ends a non-looping sweep all write it through one
  helper that invalidates the specs reading it — and only on an actual
  transition. A spec whose caption says "pause" therefore refreshes on a
  `play()` from anywhere, not only on the click that happened to invalidate it
  for another reason.

A **quantized** domain — the band form (`domain: values[]`), or `[lo, hi]` with a
`step` — is the same equation with a band scale, and one number decides it: the
count of slots the loop covers (`values.length`, or `⌊(hi − lo)/step⌋ + 1`). Slot
`k` owns `[k·duration/N, (k+1)·duration/N)` of the period, so `invert` is
`⌊frac · N⌋` and `scale(v)` is the START of `v`'s slot. Two properties follow, and
both are the reason the mapping is written this way: the N slots tile the loop
evenly, so the LAST value is emitted like any other; and `set(v)` then a read
gives back exactly `v`. Spreading the slots over `[lo, hi]` instead — the
arithmetic this used to do — gives the last slot zero width, because `elapsed` is
folded into `[0, duration)` by the loop: `hi` was never reached, and `set(hi)`
read back as `lo`.

A **continuous** domain with no `step` keeps that fold as its meaning: `lo` and
`hi` are the same instant of a looping sweep, as 0° and 360° are the same angle,
so `hi` is approached at the instant before the wrap and not emitted. An author
who needs the high end as a value of its own gives the domain a `step`.

With no domain the scale is the identity onto `[0, duration]`, which is the plain
elapsed-milliseconds clock every other library exposes — the degenerate case, not
a separate mode.

Because it is a scale, a timer also exposes its range, `duration`, beside its
`domain`. A reader that needs to turn a stretch of the domain into time reads
them together: a staggered update inside a `time.sequence` gives its lag in
milliseconds, and fits it to the milliseconds between two keyframes
(`TimeTier.msPerUnit`, `src/animation/updateStagger.ts`).

## Controls are marks, not nodes

`widgets.ts` builds `slider` and `button` out of the same three pieces every
other spec uses: shapes, operators, and an input read during resolve. Three
constraints decide their shape, and all three are consequences of the
architecture above rather than widget-specific choices.

**A control is a mark.** The layout pipeline is tree-consuming: lay a node out
twice and the second pass finds every operand already placed, so it keeps the
first placement. A control's geometry depends on `value()`, so it must be rebuilt
per resolve — and a mark _is_ a deferred node constructor, re-invoked by whatever
operator holds it. So `slider(...)` returns a mark. Its `drag()`/`click()` input
and its write effect, by contrast, are created **once**, when the widget is made:
recreating them per resolve would grow the runtime's input list without bound and
drop a drag that is in flight. This is exactly the split every interactive story
already follows by hand — inputs outside the spec, reads inside it — packaged so
a caller cannot get it wrong. It also means the widget must be constructed
outside the render thunk, and that the thunk form of the terminal is mandatory
for a composition whose root is not a `chart()`.

**Hit-testing is by uid, not by geometry.** `DragOptions.hitTest` takes the hit
as well as the point, so a widget can accept exactly the drags that start on the
nodes it drew: it records the uids of its own two nodes on each build and matches
`hit.id` against them. The widget still computes no layout of its own — it asks by
identity, and the surrounding operators stay in charge of placement. Both controls
are the same three-part scaffold (`control` in `widgets.ts`): an input that only
accepts its own hits, ONE write effect created once, and a mark that rebuilds the
picture per resolve, so each widget contributes only geometry and a write.

**The pixel→domain map is absolute, through the frame.** The slider maps
`current.x` onto the fraction of the handle's travel it fell at, so a press on the
bare track lands the handle under the pointer and the handle then follows it. It
gets the track's on-screen box from `nodeBox(track.uid)` — the frame's own
record of where layout put that node, read off exactly as the conversions are.
The earlier design mapped `delta.x` from the press instead, because that box was
not reachable without a screen-CTM read back out of the DOM; recording boxes at
publish time removed the reason for the indirection, and with it the "clicking the
bare track does nothing" caveat. The handle's travel is still inset by the handle
radius (`w - 2r`), which keeps the handle on the track and the control's bbox
independent of the value, and the mapping uses that same travel so the handle's
center coincides with the pointer.

**Wrap is a cycle length, not a flag on the clamp.** With `wrap`, the raw
(unclamped) fraction is mapped and the quantized value folded modulo the cycle.
The cycle is `span` for a continuous domain — `hi` and `lo` are one point, as for
an angle — and `span + step` for a quantized one, because a quantized domain has
`span/step + 1` distinct slots and a cycle over them is that many steps long. Get
this wrong (fold a quantized domain modulo `span`) and the top value becomes
unreachable, identified with the bottom one.

**The readout's stability comes from its anchor, not from measurement.** The
value is a `text` node one gap right of the track, `textAnchor: "end"` at a fixed
x — and for text, `x` is the _anchor_, so the node's box runs leftward from it.
The widget is therefore the same width whatever the label says, and a value change
never jostles its siblings. The reserved slot width is a crude glyph-width
estimate over the two end labels; it decides only how close a long readout comes
to the track, and real measurement still happens where it belongs, inside the text
node at layout.

`click()` is the third pointer-shaped input, and it exists because a click is
neither a pointer state nor a drag: it is the pair press-then-release on one
target. It arms on pointerdown and commits on pointerup, accepting the release by
the same test the press passed (`hitTest` when given, otherwise "the same node"),
which is what lets a two-node control — a box plus its caption — read as one
target. It keeps a COUNT, not a table of click rows, so a button is "fire when the
count grows" rather than a callback registration. Treating an input as a dataset
(so a click history could itself be charted) is the real design for that, tracked
as #830.

The one thing not yet expressible declaratively is the **write**: the scaffold
runs each widget's Solid `createEffect` inside one `createRoot`, the same wiring
`DraggableThreshold` does by hand, and hands the disposer back on the mark as
`dispose()` rather than dropping it. Keeping it inside the widget means no spec
ever sees it; the principled replacement is a single declarative write primitive,
designed under #830.

## Animation: containment, twice

The `time` namespace is where the paint regime earns its keep, and both of its
constructs are worth reading as small cases of the incremental engine below
rather than as special rules. Neither reads the clock during resolve. Each reads
it once through `readLive` — to build the clock (a sequence's is lazy, because
its domain comes from the data) and to register it for events — and then per
frame, in paint position.

**`time.transition()`** (`tween.tsx`) consumes a run of already-placed keyframes
and paints the one mark the run passes through at the playhead. Two facts, two
tiers: which keyframes there are and where layout put them is decided at
resolve; which point of that run is showing is read at paint, inside live
geometry slots, so a tick patches four attributes of one item. The slots come
from one helper in `liveSlots.ts`, `setLiveItems`, which the build-in's paint
rule (`src/animation/paint.ts`) shares: it rebuilds the moving items at most
once per distinct playhead value, and each slot reads its own field off them.
What licenses the split is subtree containment. The node makes no size claim of
its own and contributes no domain values, so no value it produces can be seen
above it; and
it has no children to place, so "lay this subtree out again" IS "recompute this
one display item" — which is exactly what a paint-time thunk does. Containment
asks for one thing in exchange, and the node pays it: its layout box is the
whole trajectory, the union of the keyframes' placed boxes, not the box it
occupies at the current playhead. That is the same box a `line` through the same
keyframes claims.

**`time.sequence()`** is the same argument one step up. Its hold looks like a
change of structure — a different keyframe group draws — but every group is laid
out either way, and has to be: that is what makes the axes hold still. So the
clock decides nothing but which already-placed group is PAINTED, and the hold is
a live opacity installed on each group's subtree
(`GoFishNode.INTERNAL_visibleWhile`), with the band rule (`[t_i, t_{i+1})`,
unchanged) evaluated inside the thunk. A jump costs one opacity write per
keyframe item; the chart is laid out once however long it plays.

The two compose with nothing to coordinate, and that is the test of the rule
rather than a happy accident. A transition takes its keyframes over by emitting
nothing at all for them, and a node with no items has nothing to patch, so the
sequence's visibility thunks simply find nothing to act on. Neither construct
has to know the other is there.

The price is the live channels' standing one: what the display list carries, and
therefore what serialization and the runtime's hit-test frame see, is the value
lowered at resolve. A keyframe hidden at paint is still in the frame, so it
still answers to a pointer, and a headless `toDisplayList` shows every keyframe
with the held one at its own opacity and the rest at 0.

## Incremental outlook

This design is a step toward incremental layout, not a dead end. What survives a
future incremental engine: the **read-location dependency registration** (the key
refines from "input → chart" to "input → σ-scope", the affine-carrier-per-axis
scope being the natural measure/arrange invalidation unit), the
invalidate/coalesce scheduler shell, the recorded scales, and paint-level
reactivity (the leaf tier of any incremental engine). What gets **replaced**: the
body of the re-render thunk — "rebuild everything through the builder" — which
becomes "re-run only the dirty scopes". The ambient-context flags and the
thunk-in-side-table paint path are stable regardless of which direction the
pipeline's incrementality takes (Solid-izing nodes as memos vs. salsa-style scope
memoization over the functional pipeline).

## This layer is JS-only

The reactive layer does not cross the Python↔JS IR bridge: `live()` callbacks and
input signals are JavaScript closures that cannot be serialized through the
`derive` RPC. The interaction stories are marked
[parity-exempt](/internals/python/parity). Everything here is available only from
the JavaScript API.
