---
title: "Build-in Animations"
section: Speculative Notes
order: 62
status: speculative
---

# Build-in animations

> This is a research note. Nothing in it is built or decided. It surveys how
> other systems specify build-in animations and lays out the design space for
> GoFish, starting from one example. It builds on
> [An Animation Grammar](/internals/design/animation), which has the model
> (time as an axis, and scenes, segues and reveals) and a record of what is
> built (its Appendix B).

## The example

A build-in is an animation that brings content onto the screen. The word comes
from Keynote, where a "build in" is the effect that makes an object appear on a
slide. The first target is a bar chart where each bar grows up from its
baseline, and the bars start one after another with some overlap.

The static chart is three lines.

```ts
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }));
```

The goal is to add the build-in without changing those three lines, or at least
without making them harder to read. The note takes up these questions in order.

- How do UI frameworks, e.g., SwiftUI, specify build-ins, and how do they keep
  the animation from cluttering the content? (Sections 1.1 to 1.3.)
- How does Rhombus pict do it? (Section 1.4.)
- How do animation tools, visualization grammars and charting libraries do it?
  (Sections 1.5 to 1.8.)
- What does that suggest for GoFish? (Sections 2 to 7.)

A few terms recur.

- **Enter state.** The state a mark starts from when it appears, e.g., a bar
  with zero height at its baseline. Other systems call it the "from" state.
- **Stagger.** Starting the same animation on several items at different
  times, one after another.
- **Lag.** The time between the starts of two neighboring items.
- **Dwell.** The fraction of the total time that is spent between starts.
  Chevalier et al. (2014) use this measure. A dwell of 0 means every item
  starts together. A dwell of 1 means each item starts when the one before it
  ends.
- **Fill.** What an item shows before its own animation starts and after it
  ends.
- **Chrome.** The parts of a chart that are not data marks, e.g., axes,
  legends and titles.

## 1. What other systems do

### 1.1 SwiftUI

SwiftUI splits an animation into two parts and puts them in different places.

- The motion goes on the content, as a modifier after the view.
  `.transition(.slide)` says how a view enters and leaves.
- The trigger goes where the state changes. You wrap the change in
  `withAnimation { ... }`.

```swift
if isActive {
    MyView()
        .transition(.slide)
}
Button("Toggle") {
    withAnimation { isActive.toggle() }
}
```

SwiftUI keeps this short in four ways.

- **Defaults.** An inserted view fades in with no code, and `withAnimation`
  with no argument uses a default spring.
- **Named presets.** Each has a few parameters, e.g., `.scale(anchor: .bottom)`
  or `.move(edge: .bottom)`, and `.combined(with:)` joins two of them.
- **Extraction.** You define a custom transition once and use it by name. Since
  iOS 17 a custom `Transition` is a function of a phase (`.willAppear`,
  `.identity`, `.didDisappear`), so a grow is one line,
  `content.scaleEffect(x: 1, y: phase.isIdentity ? 1 : 0, anchor: .bottom)`.
- **Position.** Modifiers come after the content they change. You read the
  static view first, and you can delete the motion without touching it.

SwiftUI has no stagger API. The idiom is a delay computed from the index inside
the loop. Apple's Landmarks tutorial animates a bar graph this way.

```swift
extension Animation {
    static func ripple(index: Int) -> Animation {
        Animation.spring(dampingFraction: 0.5)
            .speed(2)
            .delay(0.03 * Double(index))
    }
}

ForEach(Array(data.enumerated()), id: \.offset) { index, observation in
    GraphCapsule(/* ... */)
        .animation(.ripple(index: index))
}
```

So SwiftUI keeps the motion out of the content, but the author has to put the
stagger back into the content loop as `index`. The third-party package `swiftui-stagger-animation`
adds the missing parent level. Each child gets `.stagger()`, the container gets
`.staggerContainer()`, and the container sorts the children and hands each one
its delay.

Swift Charts shows the problem more clearly. Chart marks such as `BarMark` are
not views, so they cannot take `.transition`. To build in a Swift Charts bar
chart, people animate the data. They plot `show[i] ? value : 0`, flip the flags
one by one with delays, and fix the y domain with `.chartYScale(domain:)` so the
axis does not rescale while the bars are at zero. Both the animation state and
a frozen domain end up in the chart spec. This is the clutter this note wants
to avoid, and it happens in Apple's own charting library.

### 1.2 Other UI frameworks

- **Motion (formerly Framer Motion).** Named states called variants pass down
  the tree. The parent owns the timing and the child owns the motion. The
  children never see an index.

  ```jsx
  const chart = {
    hidden: {},
    shown: { transition: { delayChildren: stagger(0.05) } },
  };
  const bar = { hidden: { scaleY: 0 }, shown: { scaleY: 1 } };
  ```

  `stagger(each, { from, ease, startDelay })` computes the delays, and `from`
  can be `"first"`, `"center"`, `"last"`, or an index.

- **Jetpack Compose.** A wrapper holds the content, e.g.,
  `AnimatedVisibility(enter = fadeIn() + expandVertically())`, and presets
  combine with `+`. Like SwiftUI it has no stagger, so people pass
  `delayMillis = index * k`.
- **Flutter.** The core staggered animation recipe computes `Interval`
  fractions by hand. The `flutter_animate` package adds
  `AnimateList(interval: 100.ms, effects: [...])`, which staggers a whole list
  with one setting.
- **CSS.** The animation lives in a separate stylesheet and refers to elements
  by selector. `@starting-style` gives the enter state. The new `sibling-index()`
  function gives a stagger with no extra markup, e.g.,
  `animation-delay: calc(sibling-index() * 50ms)`, and
  `animation-fill-mode: backwards` holds the enter state during the delay. The
  View Transitions API matches elements by `view-transition-name` and
  cross-fades the rest.
- **GSAP, anime.js and Motion One.** These share one stagger vocabulary. You
  give either `each` (the lag) or `amount` (the total), plus `from` (`"start"`,
  `"center"`, `"end"`, `"edges"`, `"random"`, or an index), `grid`, `axis`, and
  an `ease` that spreads out the start times.

### 1.3 Presentation tools

Keynote and PowerPoint set up a chart build-in in a panel that is separate from
the chart. You pick a named effect, e.g., Wipe, and a delivery option that says
which pieces appear one after another. The options use the chart's own
structure as names.

- Keynote has All at Once, Background First, By Series, By Set, By Element in
  Series, and By Element in Set.
- PowerPoint has As One Object, By Series, By Category, By Element in Series,
  and By Element in Category. It also has a checkbox to draw the chart
  background first.

Each build then has a Start setting (on click, with the build before it, or
after it) and a delay. The user never counts bars, and the chart holds no
animation settings. Keynote's Magic Move matches objects that appear on two
slides, and objects that appear on only one slide fade in or out. Figma Smart
Animate does the same by layer name.

### 1.4 Rhombus pict

The source is the ICFP 2026 functional pearl "Animated Pictures for Slide
Presentations: From the Shallows to the Depths of a Domain-Specific Language"
by Oliver Flatt, Robert Bruce Findler and Matthew Flatt. We could not read the
paper body, because the ACM site blocks automated reads. This section is based
on the abstract, the
[Rhombus pict documentation](https://docs.racket-lang.org/rhombus-pict/animated-pict.html),
and the authors' demo code at
[oflatt/pict-demo](https://github.com/oflatt/pict-demo).

The time model has these parts.

- An animated pict is a function from time to a static pict, plus a time box.
  The docs say a time box's duration is "analogous to a bounding box's width or
  height."
- Time has two levels. One epoch is one slide advance. Inside an epoch the
  animation gets a progress value `n` from 0 to 1, which plays over the epoch's
  extent in seconds.
- Every static pict is already an animated pict with a duration of one epoch
  and an extent of 0. A static picture needs no new type and no options before
  you animate it.

The combinators work like this.

- The spatial combinators (`beside`, `stack`, `overlay`) run their arguments at
  the same time and lay out each frame. They take
  `~duration: #'pad | #'sustain`, which says what a shorter animation shows
  while a longer one is still playing. Sustain holds the last frame. Pad shows
  a ghost, which has the same bounding box and no ink. The default is sustain.
- `sequential` and `switch` put pictures one after another in time.
  `animate(fun (n): ...)` builds a picture as a function of progress. The docs
  have a growing bar of this kind, `rectangle(~height: 10 + n * 10)`.
- `magic_move(from, to)` matches the parts of two pictures by identity, which
  means the same pict value is used in both. Parts found in only one picture
  enter or exit, and one option, `~other: #'switch | #'fade`, sets what all of
  them do. The demo's whole animation is one line,
  `magic_move(schools, leaders).sustain()`.
- You derive a second keyframe from a finished picture with `replace` or
  `rebuild`, e.g., `cir_sq_tri.replace(sq, hilite(sq))`, so you never write the
  picture twice.

The abstract describes the design in two halves. You build pictures with
ordinary functions, "resembling a shallow embedding." Each pict also records
how it was built so later code can inspect it, "resembling a deep embedding."
As a result, users "can define their own animation combinators but still also
inspect, adjust, and reassemble animations."

So pict keeps animation out of the static picture by adding it from outside.
The static code gains no options, animation is a combinator applied to a
finished picture, and the correspondence between keyframes comes from identity,
so the pictures carry no keys.

Pict has no stagger primitive, so a staggered build-in has to be assembled. The
code below is our reconstruction from documented functions, and we have not run
it. Each bar waits for its delay and then grows over 0.6 seconds, and
`~epoch: #'early` lines up the start of every bar's time box.

```rhombus
fun grow(h, ~delay: d):
  switch(~join: #'splice,
         bar(h, 0).epoch_set_extent(0, d),
         animate(~extent: 0.6, fun (n): bar(h, n)))

beside(~vert: #'bottom, ~epoch: #'early,
       & for List (h: heights, i: 0..): grow(h, ~delay: i * 0.15))
```

The docs say `slide(~lead_in: #true, ...)` registers a transition from epoch
-1, and they use `time_pad(~before: -1)` to move an animation one epoch
earlier. By our reading, the two together play the build-in as the slide
arrives, so the finished picture is the resting state of the slide.

### 1.5 Manim and Motion Canvas

Manim builds the scene first and plays animations with separate calls.

```python
chart = BarChart(values)
self.add(chart)
self.play(LaggedStart(*[GrowFromEdge(bar, DOWN) for bar in chart.bars],
                      lag_ratio=0.25, run_time=2))
```

`lag_ratio` is one number that ranges from parallel to sequence.
`AnimationGroup` uses 0, `LaggedStart` uses 0.05 by default, and `Succession`
uses 1. The total run time is fixed, so each bar's own time shrinks as you add
bars. `GrowFromEdge` computes the enter state from the finished bar by scaling
it to 0 at an edge. The user has to pick the edge (`DOWN`), because the bar
does not know its baseline.

Motion Canvas writes the timeline as generator code after the scene, e.g.,
`yield* sequence(0.1, ...bars.map((b) => b.restore(0.6)))`. There the lag is
fixed, so the total grows with the number of bars. Manim fixes the total and
Motion Canvas fixes the lag. GoFish's `distribute` has the same choice between
a fixed pitch and fitting an extent.

### 1.6 Visualization grammars

| System                        | Where the animation lives                              | Enter state                                              | Stagger                                                                       |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Canis (EuroVis 2020)          | Separate JSON over finished SVGs, by CSS selector      | Named effect, e.g., `grow`, `wipe bottom`, `fade`        | `grouping: { groupBy, sort, reference, delay }`, nestable                     |
| CAST (CHI 2021), CAST+ (2025) | A GUI that edits Canis specs                           | Canis effects, default fade                              | Inferred from the encoded fields. CAST+ adds one partition over several marks |
| Gemini (VIS 2020)             | Separate spec between two full Vega specs, parts named | Derived from `enter.initial`, default opacity 0          | `staggerings` declared once and used by name, with `by`, `order`, `overlap`   |
| Animated Vega-Lite (VIS 2022) | Inside the chart, as a `time` encoding channel         | Top-level `enter` encoding, "not well-supported" (paper) | None                                                                          |
| Data Animator (CHI 2021)      | A GUI with chart boards and a timeline                 | Preset on unmatched items, default Fade In               | "Stagger by" a field                                                          |
| gganimate                     | `+` layers on an unchanged ggplot                      | `enter_grow()`, with one rule per geom                   | None. Start times per row are data (`transition_events`)                      |

Five points from these systems bear on GoFish.

- Every system except Animated Vega-Lite keeps the chart closed and attaches
  the animation from outside. Animated Vega-Lite is also the only one that
  cannot express a stagger. Its paper lists stagger as an unsupported
  "parametric transition" (section 7.2.2).
- CAST+ reports that when bars and their labels are grouped separately, the
  author has to line up two sets of delays by hand. Its fix is one shared
  partition over both mark types, with the timing nested inside. In GoFish the
  `spread` tier already is that partition, because each group owns its bar and
  its label.
- Gemini's `overlap` is hard to set. For 10 bars in 1.5 seconds, the useful
  range of stagger maps to an overlap of 0.87 to 0.98. A lag or a dwell is
  easier to set.
- gganimate's `enter_grow()` is a rule per geom. For columns it multiplies `y`
  and `ymax` by the progress. By our reading of `R/transmuters.R` it ignores
  `ymin`, so stacked segments collapse to 0 and not to their stack base.
- Gemini writes the enter state for a grow as `{"scale": "y", "value": 0}`,
  which uses the end chart's scale. A chart of zeros laid out on its own would
  have a domain of zero width.

### 1.7 Charting libraries

Most charting libraries animate the first render by default, and the entrance
depends on the mark type.

| Library                 | Bars                                               | Lines                                 | Points             | Pie                    | Default stagger      |
| ----------------------- | -------------------------------------------------- | ------------------------------------- | ------------------ | ---------------------- | -------------------- |
| ECharts                 | Grow from own base (stack start in a stack)        | Clip wipe along x, points pop in by x | Scale and fade in  | Sweep from start angle | Only the line points |
| Chart.js                | Grow from the value axis base                      | Points rise from the base             | Rise from the base | Sweep                  | None                 |
| Highcharts              | The whole series scales up from the threshold      | Clip wipe                             | Clip wipe          | Sweep                  | None. Labels wait    |
| Recharts                | Grow from stack start                              | Stroke draw                           | Animate            | Animate                | None                 |
| amCharts 5              | Off by default. When on, values grow in data space | Rise in data space                    | Off                | Not checked            | Opt-in               |
| Vega-Lite, Plot, Plotly | None                                               | None                                  | None               | None                   | None                 |

(The Highcharts line and point entries and some Recharts details were not
checked against source.)

Five points from these libraries bear on GoFish.

- Marks with a size channel grow along it from their baseline. Every library
  that animates by default does this for bars, and pies do the same thing in
  angle. Marks with only position channels scale or fade in place. Path marks
  are revealed along their ordering axis. GoFish's channel types already say
  which channel is a size and where its baseline is, so GoFish can derive this
  rule once. ECharts writes it separately in each series view.
- No library staggers bars by default. The usual spelling is a function of the
  index, e.g., ECharts' `animationDelay: (idx) => idx * 10`. amCharts has the
  one declarative form. `sequencedInterpolation: true` spreads the starts
  evenly over the duration for any number of bars.
- Every library keeps animation settings out of the encoding and out of the
  data. ECharts bar data items have no animation keys. The settings live in a
  separate namespace at the chart or series level, and they vary per item only
  through a stagger function.
- ECharts treats the first render as "every element enters". A bar that
  appears in a later update grows in with the same settings. Chart.js has no
  such rule, and its official Delay sample needs a flag to stop the stagger
  from replaying on every update.
- Libraries disagree on stacked bars, in three ways.
  - ECharts and Recharts grow each segment in place from its stack start, so
    gaps open between segments during the grow.
  - Chart.js and Victory start every segment at the axis, so segments overlap
    during the grow. D3's Stacked-to-Grouped Bars example does the same, and
    the segments slide up as they grow.
  - amCharts moves the data value from 0 and lays out again, so each segment
    rides on the one below.

The D3 examples always write the enter state by hand (`y = y(0)`,
`height = 0`) and stagger with `.delay((d, i) => i * k)`. Two of them are
useful here. The Sortable Bar Chart sorts the selection by target x before it
sets the delay, so the stagger sweeps left to right in the new order, and each
axis tick gets the same delay as its bar. The Hierarchical Bar Chart and the
Bar Chart Race take the enter state from structure. Children start as stacked
pieces of their parent bar, and new entrants start from the previous keyframe.
So the general rule is "enter from the previous state if there is one, and
from zero if there is not."

### 1.8 What perception studies say

- Heer and Robertson (2007) recommend simple staging and about one second per
  stage. For bars that enter during a filter, they considered growing from the
  baseline and chose a fade, because growth suggests a change in value that
  did not happen. In a build-in the growth shows the value, so this supports
  different defaults for the two cases.
- Chevalier, Dragicevic and Franconeri (2014) found that staggering does not
  help people track moving items, and it can hurt. Above a dwell of 0.6,
  tracking about 30 dots was "close to impossible." A build-in has no tracking
  task, so its stagger sets the pace. If a build-in has a stagger, a dwell of
  0.2 to 0.4 in a meaningful order is the range the study supports.
- Dragicevic et al. (2011) found slow-in, slow-out easing better than constant
  speed. That suggests a default ease for each item.
- Chalbi et al. (2020) found that items that grow together are seen as one
  group, as items that move together are. A stagger splits the group into
  items, so the stagger should follow the grouping you want viewers to see.

## 2. How the systems keep the spec clean

The same mechanisms appear across these systems.

1. **Defaults.** The common case needs no code. SwiftUI's fade, ECharts'
   entrance per series type, and Keynote Magic Move's fade for unmatched
   objects work this way.
2. **A separate place that refers to the content by name or selector.** CSS,
   Keynote, PowerPoint, Canis, Gemini and GSAP work this way.
3. **Animation added from outside a finished value.** Pict's combinators,
   gganimate's `+`, Manim's `self.play`, and SwiftUI's trailing modifiers work
   this way.
4. **The parent owns the timing and the child owns the motion.** Motion's
   variants, `flutter_animate`'s `AnimateList`, Keynote's delivery option and
   CAST+'s shared partition work this way.
5. **Named presets that combine.** SwiftUI has `.combined(with:)`, Compose has
   `+`, and gganimate has `enter_fade() + enter_grow()`.
6. **The trigger apart from the motion.** SwiftUI has `withAnimation` apart
   from `.transition`, and Keynote has a Start menu apart from the effect.
7. **Named, reusable values.** SwiftUI has static members such as
   `Animation.ripple(index:)`, Motion has variant objects, and Gemini has named
   staggerings.
8. **The enter state held during the delay.** CSS has
   `animation-fill-mode: backwards`, GSAP has `immediateRender`, and pict has
   ghosts.

Clutter gets into the content where one of these is missing. SwiftUI has no
parent level for stagger, so `index` goes into the loop. Swift Charts marks
cannot take a transition, so `show ? value : 0` goes into the data and the
domain is frozen by hand. Animated Vega-Lite puts time in the encoding, so a
stagger has to be computed as data.

## 3. Where a build-in sits in the GoFish model

Four points place a build-in in the model from the animation note.

**A build-in is the enter case of a transition from the empty chart.** ECharts,
Gemini, Data Animator, Keynote Magic Move and pict's `magic_move` all treat an
appearing item as an item with no match in the earlier state. On the first
render every item is unmatched, so every item enters. Issue #831 already frames
enter and exit as the unmatched ends of the transition's correspondence, and
#892 shipped a fade in place as the default enter. So a build-in needs no new
concept. It needs an empty state before the first one.

**A stagger is `distribute` on t.** The table in section 5 of the animation note
says this, and Manim's `lag_ratio` shows it in one number. A value of 0 is
`parallel` (layer on t), a value of 1 is `sequence` (stack on t), and the
values in between overlap. The choice between a fixed lag and a fixed total is
the choice `distribute` makes between a fixed pitch and fitting an extent.

**The enter state can come from channel types.** `rect` declares `h` as a size
channel (`RECT_CHANNELS` in `rect.tsx`), and a rect's baseline is its local 0
(`intrinsicDims` has `min: Math.min(0, h)`). So "collapse the size channels to
0 at the baseline" is a rule GoFish can state once for all marks. Marks with no
size channel would fade in place, which is the current default. Relational
marks such as `line` would be revealed along their `along` field.

**For a plain bar chart, the three kinds of animation draw the same frames.** A
clip wipe from the baseline (a reveal), a collapse of each bar's box (an enter
on the laid-out geometry), and a layout of the same chart with zero values (a
scene) all look the same. They differ in the cases in section 4.3.

## 4. Design axes

The axes below are independent of each other. Each lists the options and the
precedent. Where one option looks stronger, the note says so, but none is
decided.

### 4.1 Where the build-in clause lives

This is the clutter question. Options A, B, C and E leave the three static
lines as they are.

**A. A clause after the mark.**

```ts
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }))
  .transition({ enter: grow(), stagger: { lag: 60 } });
```

The clause means "animate the changes to this chart." With no `time.sequence`
in the flow, the only change is from the empty chart to this one, so every bar
enters. The same clause would animate later data changes with enter, update and
exit. The precedent is SwiftUI's trailing modifiers, gganimate's `+`, and
ECharts' separate option namespace. It is also the spelling #881 leans toward
for `.layer(time.transition())`, so the build-in and the gapminder scatter
would share one method.

**B. A stage clause that refers to parts of the chart by name.**

```ts
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }).name("bars"))
  .stage((s) => [s.reveal(selectAll("bars"), { effect: wipe(), lag: 60 })]);
```

This is the reveal sketch from section 9.5 of the animation note. The precedent
is CSS selectors, the Keynote and PowerPoint build panels, and Canis. It only
changes paint, so it never touches layout, and it can schedule chrome (axes,
title, annotations) in the same list. It costs a `.name()` on the mark, and its
grow is a wipe, as it is in Canis.

**C. A function that wraps a finished chart.**

```ts
const bars = chart(alphabet)
  .flow(spread({ by: "letter", dir: "x" }))
  .mark(rect({ h: "frequency" }));

time
  .buildIn(bars, { enter: grow(), stagger: { lag: 60 } })
  .render(el, { w: 400, h: 300 });
```

The precedent is pict's combinators and Manim's `self.play`. The chart value is
untouched, so you can render it static in one place, e.g., a paper figure, and
animated in another, e.g., a talk. It adds a new top-level entry point, and it
needs a rule for how the wrapper refers to the chart's tiers and names.

**D. The stagger on the operator and the motion on the mark.**

```ts
chart(alphabet)
  .flow(spread({ by: "letter", dir: "x", stagger: 60 }))
  .mark(rect({ h: "frequency", enter: grow() }));
```

The precedent is Motion's variants and Svelte's `in:` directive. It reads
locally, but it changes the static lines, which is what this note wants to
avoid. #881 also rejected a transition on the mark, because a transition
relates keyframes and can run between different marks.

**E. On by default.** The chart animates on first render with no clause, as
ECharts, Highcharts and Recharts do, and an option turns it off. GoFish renders
static figures for papers and exports SVG, so animating by default is a bigger
change here than in a dashboard library. If the switch is a render option, it
is not part of the IR, so Python would not see it. A middle ground is option A
with no arguments, `.transition()`, which takes every setting from defaults.

**F. Stagger as data.** Compute a time field with one row per bar per frame, and
use `time.sequence` and `time.transition` as they exist today. This is
gganimate's `transition_events` and the Animated Vega-Lite workaround. It puts
the whole animation in the data, so it belongs at the bottom of a desugaring
tower (section 5) and not in the surface.

A and B look strongest. A reuses the transition machinery and follows #881. B
covers staging of chrome and reveals that are not transitions. The two can
coexist.

### 4.2 The enter state

- **A derived default.** Size channels collapse to 0 at their baseline. Marks
  with no size channel fade in place. Relational marks are revealed along
  `along`. This is the charting libraries' rule, derived from channel types
  instead of written per mark type.
- **Named presets.** For example `grow()`, `fade()`, `scale()`, `wipe()` and
  `draw()`, with a way to combine them such as `[grow(), fade()]`. Every UI
  framework has a small set like this.
- **A mark as the enter state.** `enter: rect({ h: 0 })` means "this mark with
  these channels changed," in the end chart's scales. The precedent is ECharts'
  `enterFrom` on custom series, Chart.js `animations.y.from`, and Gemini's
  `enter.initial`. It is general, but it spells out what `grow()` would infer.
- **A function of progress.** SwiftUI's `Transition` protocol and pict's
  `animate` take a phase or a progress value and return the appearance. This is
  the most general and the least declarative.

Whether the default is fade or grow is an open choice. #892 shipped fade in
place for items that enter during a sequence, and Heer and Robertson support
fade there, because growth suggests a change in value. For a build-in, the
charting libraries all grow. One answer is to choose by the earlier state. An
item that enters from the empty chart grows, and an item that enters while
other items update fades. The other answer is one default everywhere, as in
ECharts, where a bar that appears in an update also grows.

### 4.3 What a grow computes

Each kind of animation in the animation note gives a different way to compute a
grow.

- **Paint wipe (a reveal).** Clip each bar from its baseline and leave layout
  alone.
- **Collapse of each leaf (an enter on the laid-out geometry).** Interpolate
  each bar's box from zero size at its own baseline. The tween has what this
  needs during its layout (`stands[k].transform` and each leaf's
  `_underlyingSpace`), but it does not store it yet.
- **Zero layout (a scene).** Lay out the same chart with the size values at 0,
  in the end chart's scales, and interpolate between the two layouts. A tree
  cannot be laid out twice (see [Reactivity](/internals/frontend/reactivity)),
  so the zero layout needs its own tier or its own rows.

They agree on a plain bar chart and differ in other cases.

| Case                                 | Paint wipe                                         | Collapse of each leaf                                                 | Zero layout                                |
| ------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Plain bars                           | Same                                               | Same                                                                  | Same                                       |
| Negative values                      | The wipe must follow each bar's sign               | Follows the sign of `h`                                               | Correct                                    |
| A value label above each bar         | The label is outside the bar, so no wipe covers it | The label moves with its own center, not the bar's top (next to #894) | The label rides the bar's top              |
| Stacked bars, whole stacks staggered | Each column wipes up as one piece                  | Segments grow in place and gaps open (ECharts, Recharts)              | Segments ride on the ones below (amCharts) |
| Stacked bars, segments staggered     | Each segment wipes in place                        | Each segment grows in place                                           | Needs the stack's placement on each frame  |
| Radial bars in polar coordinates     | Needs an arc-shaped clip                           | Must collapse before the coordinate transform                         | Correct                                    |

The zero layout must use the end chart's scales. Gemini writes its enter state
with the end chart's scale for this reason, and Swift Charts users freeze the
domain by hand, because a chart of zeros laid out alone has a domain of zero
width.

The zero layout can often be reduced to a cheaper tween. Moving each item in a
straight line from its place in the zero layout to its place in the final
layout gives a true layout on every frame when the items that affect each
other's positions share one progress value, e.g., the segments of one stack. It
does not when the segments of one stack are staggered, because each segment's
position depends on the heights below it. In that case segment k sits at the
base plus the sum of the current heights of the segments below it.

### 4.4 Which items stagger, and in what order

- **The default.** Stagger over the mark's keys in layout order. For the
  example that is one bar at a time from left to right. The transition already
  infers its key from the flow's tiers (#752), so this needs no new input.
- **By tier.** Name a tier of the flow by its field. In a stacked chart,
  `stagger: { by: "letter" }` would mean whole stacks, and the default would
  mean each segment. This is Keynote's By Set versus By Element in Set, and
  CAST+'s shared partition. The tier owns each bar and its label, so the label
  follows its bar with no extra timing.
- **By a field that is not a tier.** Group by another field, as Canis's
  `groupBy` and Gemini's `by` do.
- **Order.** Layout order by default. Other orders are `from: "center"` or
  `"edges"` (GSAP, Motion), order by value (Canis's `sort`), and order by
  position along an axis (GSAP's `axis`, ECharts' line points). For a `spread`,
  position order is the same as layout order. For a scatter, position order
  gives a sweep from left to right.

### 4.5 How long the stagger is

- **Lag.** A fixed time between starts, e.g., `lag: 60` in milliseconds. The
  total grows with the number of bars. Canis, Motion Canvas, D3 and GSAP's
  `each` work this way.
- **Total or dwell.** Fix the total and derive the lag, e.g., `dwell: 0.3`.
  Each bar's own time shrinks as you add bars. Manim's `lag_ratio`, Gemini's
  duration ratios, GSAP's `amount`, amCharts' sequenced mode and Chevalier's
  measure work this way.
- **Overlap.** Gemini's parameter. Section 1.6 gives the reason to avoid it.

This mirrors the fixed pitch and fit choice in `distribute`. The perception
results suggest no stagger by default in general, and a dwell of about 0.2 to
0.4 when a build-in has one. An ease that spreads out the start times (Gemini,
GSAP, Motion) can come later.

### 4.6 What each item shows before it starts and after it ends

- **Before.** The enter state, i.e., a bar of zero height, or nothing. Every
  system holds the enter state during the delay, e.g., CSS's
  `animation-fill-mode: backwards` and GSAP's `immediateRender`. Without this,
  a late bar shows at full height and then jumps to zero when its turn comes.
- **After.** The final state. This is pict's `sustain`. The connected
  scatterplot work in progress adds a `history` option to `time.sequence` for
  the same idea at the sequence level, i.e., keyframes that stay visible after
  their band. A build-in's hold should use that name and not a new one.

Current main reads a missing row at a keyframe as "absent," which is pict's pad.
A stagger written as data needs "not sampled here," which is pict's sustain.
That conflict is one more reason to keep the stagger out of the data.

### 4.7 The trigger

The default trigger for a build-in is the first render. Other triggers are
entering the viewport (Motion's `whileInView`), a click or slide step
(Keynote's Start menu, pict's epochs), and a scrubber. Section 6 of the
animation note already treats all of these as signals that drive the playhead.
The charting libraries suggest two defaults. Skip the animation when the reader
has asked for reduced motion (`prefers-reduced-motion`, as Recharts does), and
skip it above a mark count (ECharts' `animationThreshold` is 2000).

The prototype plays the build-in on a chart's first render only. When an input
changes and the chart renders again, it draws the final frame and stops the
first render's clock. This is a declared shortcut: a mark that really enters or
leaves on a re-render just appears or vanishes. The right fix is a keyed
enter/update/exit join against the previous render (#914).

### 4.8 Axes, labels and other chrome

- Keynote and PowerPoint can draw the chart background (the axes) first and
  then the data.
- Highcharts shows data labels after the marks finish.
- D3's Sortable Bar Chart gives each axis tick the same delay as its bar, so
  the tick moves with the bar.
- CAST+ nests a label and its bar in one group so they share timing.

For the target chart, the simplest rule is that axes appear at once and labels
ride their bars. A stage clause (option B) is where "axes first, then bars,
then the title" would go.

## 5. A desugaring tower for the build-in

The gapminder transition has a four-level desugaring tower. Each level writes
out more of what the level above infers, and a test asserts that all four draw
the same thing (`src/tests/gapminderTower.test.ts`). The build-in could get
the same kind of tower. The spellings at levels 0 to 2 are placeholders.

- **Level 0.** The sugar, e.g., `.transition({ enter: grow(), stagger: { lag: 60 } })`.
- **Level 1.** `.layer(time.transition(...))` with the key and the empty
  earlier state written out.
- **Level 2.** An explicit clock and an explicit start time for each key.
- **Level 3.** Dense rows. Each bar has a row at every keyframe, with value 0
  before its start, and the chart uses `time.sequence` and
  `time.transition({ curve: "linear" })` as they exist today.

Level 3 should run on current main. By our reading of the code (not yet run),
it draws an exact staggered grow at constant speed, stacks included, because
every keyframe is a true layout and each ramp is a straight line between
keyframes. It needs `curve: "linear"`, because the default Catmull-Rom curve
overshoots at the corners of each ramp, and it needs `loop: false`. It cannot
give each bar its own ease except by adding more rows. That makes it a good
reference render to check level 0 against.

## 6. What the code would need

This list comes from reading current main, after #892.

- **An empty state before the first keyframe.** `TimeTier.knots` is a list of
  times that is not tied to rows. A knot with no rows before the first one
  would put every mark in the enter branch of `lifecycle`
  (`graphicalOperators/tween.tsx:189`). The clock's domain starts at the first
  keyframe (`marks/time.ts:179`), so the clock has to start earlier. That is
  the point at which the TODO in #881 says to move the clock out of
  `time.sequence` into a scale shared by the chart.
- **A transition on a chart with no time field.** `time.transition` throws
  when the flow has no `time.sequence` and `along` and `at` are not given
  (`marks/time.ts:255`). `knotOf` needs a numeric time value on each keyframe
  (`marks/time.ts:358`). A build-in on a static chart needs a transition whose
  only earlier state is the empty chart.
- **A time warp per key.** Each key already has its own tween node, so a
  stagger can be an offset and a span on each key's progress, applied before
  `ease`. Today nothing passes a value per key into a transition's options.
- **A grow enter state.** `lifecycle` returns only a time and an opacity. The
  box `Track` (`graphicalOperators/tween.tsx:142`) stores `cx`, `cy`, `w`, `h`
  and colors, but not the leaf's origin or which axes are size axes, so
  `boxPainter` (`graphicalOperators/tween.tsx:491`) cannot draw a collapsed box
  yet. Both facts are available during the tween's layout.
- **The zero layout, if chosen.** It needs an extra tier or extra rows, as
  section 4.3 says.

## 7. Open questions

1. Is a build-in a transition (one mechanism for the first render and later
   data changes, as in ECharts), a stage reveal (a schedule over a finished
   chart, as in Keynote), or both?
2. Where does the clause live? The candidates are a method after the mark, a
   stage clause that uses names, and a function that wraps a finished chart.
3. Should the default enter be fade everywhere, grow everywhere, or depend on
   whether the earlier state is empty?
4. In a stacked bar chart, should segments grow in place (ECharts), ride on the
   ones below (amCharts), or start from the axis (Chart.js)?
5. Does a stagger name a tier, a field or an axis? Is the default "each mark in
   layout order"?
6. Is the size of a stagger given as a lag, a dwell, or either? Which is the
   default?
7. Should a build-in be off by default (as now), on by default (as in charting
   libraries), or on through `.transition()` with no arguments?
8. Where does the clock live when there is no `time.sequence`? This is the
   question #881 defers, and the build-in is the first example that needs an
   answer.
9. Animation is JavaScript only today. Should the build-in clause be part of
   the IR so Python can write it?

## Sources

UI frameworks and presentation tools:

- SwiftUI: [transition(\_:)](<https://developer.apple.com/documentation/swiftui/view/transition(_:)>),
  [withAnimation](<https://developer.apple.com/documentation/swiftui/withanimation(_:_:)>),
  [Animating views and transitions](https://developer.apple.com/tutorials/swiftui/animating-views-and-transitions)
  (the `ripple` example),
  [Explore SwiftUI animation (WWDC23)](https://developer.apple.com/videos/play/wwdc2023/10156/),
  [Swift Charts notes by Mark Volkmann](https://mvolkmann.github.io/blog/swift/SwiftCharts/),
  [swiftui-stagger-animation](https://github.com/ivan-magda/swiftui-stagger-animation).
- Motion: [animation](https://motion.dev/docs/react-animation),
  [stagger](https://motion.dev/docs/stagger).
- CSS: [sibling-index()](https://developer.mozilla.org/en-US/docs/Web/CSS/sibling-index),
  [@starting-style](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style),
  [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API).
- GSAP: [stagger](https://gsap.com/resources/getting-started/Staggers).
- Keynote: [Animate objects onto and off a slide](https://support.apple.com/guide/keynote/animate-objects-onto-and-off-a-slide-tan72234bb6/mac),
  [Change build order and timing](https://support.apple.com/guide/keynote/change-build-order-and-timing-tan3ad5f8d82/mac).
- PowerPoint: [PpChartUnitEffect](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.ppchartuniteffect).
- Figma: [Smart animate](https://help.figma.com/hc/en-us/articles/360039818874-Create-advanced-animations-with-smart-animate).

Animation as a program:

- Rhombus pict: [paper (DOI)](https://doi.org/10.1145/3828692),
  [animated picts](https://docs.racket-lang.org/rhombus-pict/animated-pict.html),
  [demo code](https://github.com/oflatt/pict-demo),
  [classic Racket slideshow](https://docs.racket-lang.org/slideshow/).
- Manim: [LaggedStart](https://docs.manim.community/en/stable/reference/manim.animation.composition.LaggedStart.html).
- Motion Canvas: [flow](https://motioncanvas.io/api/core/flow/).

Visualization grammars:

- [Canis](http://www.yunhaiwang.net/EuroVis2020/canis/paper.pdf),
  [CAST](https://www.microsoft.com/en-us/research/wp-content/uploads/2021/01/CAST-CHI2021.pdf),
  [CAST+](http://www.yunhaiwang.net/tvcg2024/castplus/).
- [Gemini](https://arxiv.org/abs/2009.01429) and its
  [wiki](https://github.com/uwdata/gemini/wiki),
  [Gemini²](https://arxiv.org/abs/2108.04385).
- [Animated Vega-Lite](https://arxiv.org/abs/2208.03869),
  [vl-animation](https://github.com/mitvis/vl-animation).
- [Data Animator](https://hdi.cs.umd.edu/papers/DataAnimator_CHI21.pdf).
- [gganimate reference](https://gganimate.com/reference/).
- [Datamations](https://seankross.com/chi-2021/pu-kross-hofman-goldstein-chi-2021.pdf).

Charting libraries:

- ECharts: [global defaults](https://github.com/apache/echarts/blob/master/src/model/globalDefault.ts),
  [BarView.ts](https://github.com/apache/echarts/blob/master/src/chart/bar/BarView.ts),
  [Bar Animation Delay example](https://echarts.apache.org/examples/en/editor.html?c=bar-animation-delay).
- amCharts: [animations](https://www.amcharts.com/docs/v5/concepts/animations/).
- D3: [Stacked-to-Grouped Bars](https://observablehq.com/@d3/stacked-to-grouped-bars),
  [Sortable Bar Chart](https://observablehq.com/@d3/sortable-bar-chart),
  [Hierarchical Bar Chart](https://observablehq.com/@d3/hierarchical-bar-chart),
  [Bar Chart Race](https://observablehq.com/@d3/bar-chart-race).

Perception:

- [Heer and Robertson 2007](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf).
- [Chevalier, Dragicevic and Franconeri 2014](http://www.cs.toronto.edu/~fchevali/fannydotnet/resources_pub/pdf/notsostaggering-infovis14.pdf).
- [Dragicevic et al. 2011](https://dl.acm.org/doi/10.1145/1978942.1979233).
- [Chalbi et al. 2020](https://arxiv.org/abs/1908.00661).
