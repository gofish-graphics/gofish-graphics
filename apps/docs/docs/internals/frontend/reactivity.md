---
title: Reactivity
section: Frontend
order: 70
status: draft
covers:
  - packages/gofish-graphics/src/interaction/index.ts
  - packages/gofish-graphics/src/interaction/types.ts
  - packages/gofish-graphics/src/interaction/live.ts
  - packages/gofish-graphics/src/interaction/inputs.ts
  - packages/gofish-graphics/src/interaction/resolveContext.ts
  - packages/gofish-graphics/src/interaction/frameScales.ts
  - packages/gofish-graphics/src/interaction/runtime.ts
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
`AmbientRegistrar`). The render terminal (`chartBuilder.ts`,
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
> module var if async marks ever make the race real.

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
   whole tree through the immutable builder and renders into the _same_
   container — hence the container-dispose hook below.
2. **Delegated event dispatch.** `attachSVG` puts one listener per event type
   (`pointermove/down/up/leave`, `wheel`) on the root `<svg>` and fans each event
   out to every registered input, with a `data-gf-id` hit-test resolving the
   display item (and thus datum) under the pointer.
3. **Hit-testing + frame publication.** `publishFrame` rebuilds an id→item map
   (uids are minted fresh each resolve) and the data↔px conversions, then
   notifies inputs.

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

A consequence worth stating: an input's data-space reads only work once the input
is **attached** to a chart, which happens when the input is `registerInput`-ed —
i.e. when it is read during that chart's resolve. An input read only from outside
code (a bare `createEffect`) never attaches, so `dataPos()`/`currentData()` return
`undefined`.

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
