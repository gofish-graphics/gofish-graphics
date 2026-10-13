# Time composes like space: an animation grammar for GoFish

**Summary.**

1. Give every node a lifetime, the way it has a bounding box, and let the spatial containers compose lifetimes: `layer` overlaps them, `.relate()` holds temporal clauses (`time.after`, `time.align`), and `time.transition(a, b)` is a temporal relational mark (a magic move).
2. `time.sequence` and `time.stagger` become ordinary operators that work both inside `.flow()` and over explicit children, so a sequence of two charts and a sequence of years are the same construct.
3. A working prototype draws five hard examples in this spelling: stacked ↔ grouped bars, a diagram magic move, R2D3's segue, Periscopic's gun deaths, and a ribbon chart with particles.

**Recommendation.** Approach A: no new container, temporal clauses in `.relate()`, and `time.transition` as the temporal twin of `arrow`. The runner-up is approach B, the same thing with a separate `timeline([...])` container. Seven decisions are listed at the end.

Prototype branch: `worktree-animation-grammar-proposal` (Storybook: "Animation/Grammar Prototype/…"). It is throwaway quality, and its shortcuts are listed in the last section.

---

## Terms

- **Lifetime.** The interval of time a node is on screen. It is the time version of a bounding box. Rhombus pict calls it a "time box".
- **Keyframe.** One whole state of a visualization at an instant, such as the stacked chart or the year 1975.
- **Transition.** The in-between frames from one keyframe to the next. In GoFish it is a relational mark on time: it connects two states the way an `arrow` connects two shapes.
- **Magic move.** A transition that finds the same object in both states and moves it. The name comes from Keynote. Rhombus pict uses `magic_move`, and Motion uses `layoutId`.
- **Identity.** What makes a mark in one state "the same" as a mark in another state.
- **Hold.** A finished part stays drawn (pict `sustain`, SMIL `fill="freeze"`).
- **Pad.** A part is absent outside its interval (pict `time_pad`).
- **Clause.** One entry in `.relate()`: a constraint, a drawing such as an arrow, or, in this proposal, a temporal relation.
- **Data time** and **presentation time.** Data time is a field read on a time scale (`time.sequence({ by: "year" })`). Presentation time is order the author picks (`time.stagger`). This split was settled in #901.

## What already exists (main)

`time.sequence({ by })` (keyframes in data time), `time.transition()` (interpolate between keyframes), `time.history({ last })` (trails), `time.stagger`, `time.parallel`, the chained `.transition({ enter, update, exit })` on marks and operators, and the effects `Animation.grow/shrink/fadeIn/fadeOut/appear/wipe`. These came from #886, #892, #901 and #902. The 2026-10-04 comment on #697 proposed a time container `timeline([...]).relate(...)`, which this proposal develops and then folds into `layer`.

What was missing: no way to sequence two whole visualizations, no temporal clauses, no matching for hand-built diagrams, no shape morphing, and no transition that follows a route.

## The five examples

Each example is rendered from a real prototype story. The GIFs are in `img/`.

### 1. Stacked ↔ grouped bars (Heer & Robertson 2007, Bostock)

![stacked to grouped](img/e1a.gif)

```js
const stacked = chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));
const grouped = chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x" }),
    spread({ by: "species", dir: "x", spacing: 0 })
  )
  .mark(rect({ h: "count", fill: "species" }));

time
  .sequence({ duration: 4000, cyclic: true }, [stacked, grouped])
  .transition({ update: Animation.tween({ ease: "cubicInOut" }) });
```

```python
time.sequence([stacked, grouped], duration=4000, cyclic=True).transition(
    update=Animation.tween(ease="cubicInOut")
)
```

The same animation in the relate form, with explicit holds (`img/e1b.gif`):

```js
layer([stacked.name("stacked"), grouped.name("grouped")]).relate(
  ({ stacked, grouped }) => [
    time.after(stacked, grouped, { gap: 1800 }),
    time.transition(stacked, grouped, { duration: 1000, ease: "cubicInOut" }),
  ]
);
```

```python
layer([stacked.name("stacked"), grouped.name("grouped")]).relate(lambda: [
    time.after(ref("stacked"), ref("grouped"), gap=1800),
    time.transition(ref("stacked"), ref("grouped"), duration=1000, ease="cubicInOut"),
])
```

Bostock's per-lake delay needed no new code: `spread({ by: "lake", dir: "x" }).transition({ update: time.stagger({ lag: 150 }) })` (`img/e1c.gif`). Heer and Robertson's two-stage version (x first, then y) is a sequence with one extra keyframe in the middle (`img/e1d.gif`, `img/e1d-filmstrip.png`). Gemini² calls this keyframe insertion.

### 2. Magic move on a hand-built diagram (linked-list insertion)

![linked list](img/e2.gif)

```js
const node = (id, label, { box = false, fill = BLUE } = {}) =>
  layer([
    (box
      ? rect({ w: 64, h: 44, rx: 10, ry: 10, fill })
      : circle({ r: 24, fill })
    ).name("shape"),
    text({ text: label, fill: "white", fontSize: 16 }).name("label"),
  ])
    .relate(({ shape, label }) => [
      Constraint.align({ x: "middle", y: "middle" }, [shape, label]),
    ])
    .name(id);

const list = (nodes, ids) =>
  layer(nodes).relate((env) => {
    const ns = ids.map((id) => env[id]);
    return [
      Constraint.distribute({ dir: "x", spacing: 56 }, ns),
      Constraint.align({ y: "middle" }, ns),
      ...ns.slice(1).map((n, i) => arrow({ stroke: "#555" }, [ns[i], n])),
    ];
  });

time
  .sequence({ duration: 6000, cyclic: true }, [s1, s2, s3]) // s1..s3 built with list(...)
  .transition({ update: Animation.tween({ ease: "cubicInOut" }) });
```

Nodes match by `.name()`. C slides right, the new node fades in, the circle morphs into a rounded rect while its color mixes, and the label cross-fades from "8" to "new". The arrows are redrawn from the moving nodes every frame, so they stay attached. Keynote cannot do this, because it interpolates the arrow as its own shape.

### 3. R2D3's segue (the animation that motivated Gemini and Data Animator)

The Animated Vega-Lite paper (§6.1.1) says "the authors of Data Animator and Gemini were both motivated in part by R2D3". Gemini's running example is R2D3's homes in San Francisco and New York, staggered by elevation. The data is the real R2D3 set (492 homes, CC BY-NC-SA).

![r2d3](img/r2d3.gif)

```js
const scatterplot = () =>
  chart(homes, { color })
    .flow(scatter({ by: "id", x: "price_per_sqft", y: meters("elevation") }))
    .mark(circle({ r: 2, fill: "city" }));
const histogram = () =>
  chart(homes, { color })
    .flow(
      scatter({ by: "bin", y: meters("binMid") }).transition({
        update: time.stagger({ by: field("elevation").sort(), dwell: 0.6 }),
      }),
      stack({ by: "id", dir: "x", spacing: 0.6 })
    )
    .mark(circle({ r: 2, fill: "city" }));

layer([
  scatterplot().name("scatter"),
  histogram().name("histogram"),
  threshold().name("line"),
  split().name("split"),
]).relate(({ scatter, histogram, line, split }) => [
  time.after(scatter, histogram, { gap: 3000 }),
  time.transition(scatter, histogram, { duration: 2000 }),
  time.after(histogram, line, { gap: 600 }), // the line comes in after the dots settle
  time.after(line, split, { gap: 2200 }),
  time.transition(histogram, split, { duration: 1400 }),
]);
```

The relate form reads better here. It names each beat and says "the line comes in 600 ms after the dots settle" directly. The sequence form had to repeat a keyframe to get a hold (`img/r2d3-filmstrip.png`).

### 4. Periscopic's U.S. Gun Deaths (2013)

The AVL paper quotes Data Animator's author on this piece: "How do you have the circle appear and then drop, and then the line keeps going? I have no clue how to do that". It names Gemini's `concat` and `sync` (series-parallel composition) as the missing piece. The data is 1,200 rows sampled from Periscopic's published 2013 file. The "could have lived to" ages come from an approximate life table.

![gun deaths](img/gun-deaths.gif)

```js
const victim = (d) => {
  const { life, stolen } = split(arcOf(d), paramAt(arcOf(d), d.age)); // de Casteljau at x = age
  const s = d.age / d.potential;
  return layer([
    bezier({ points: life, stroke: ORANGE })
      .name("life")
      .transition({
        enter: Animation.draw({ duration: s * drawTime(d.i), ease: "linear" }),
      }),
    bezier({ points: stolen, stroke: GREY })
      .name("stolen")
      .transition({
        enter: Animation.draw({
          duration: (1 - s) * drawTime(d.i),
          ease: "linear",
        }),
      }),
  ]).relate(({ life, stolen }) => [time.after(life, stolen)]); // proposed; the prototype uses
  // .transition({ enter: time.stagger({ spacing: 0 }) })
};

chart(victims)
  .flow(time.stagger({ by: "act", spacing: 480 }))
  .mark((rows) => time.stagger(acts[rows[0].act], rows.map(victim)));
// acts: lives 0-1 one after another, lives 2-4 at a 720 ms lag,
// then lag: (w) => (2500 / N) * 32 / Math.log(w + 15), so the arcs come faster and faster
```

This is the series-parallel case. Inside one life, two parts play in series. Across lives, thousands overlap. The prototype showed two gaps. First, `.flow()` cannot give each group its own arrangement (the three opening acts), so the spec drops to `.mark(rows => …)`. Second, a "PEOPLE KILLED" counter cannot be written, because no mark can read the build clock or ask when each life ended.

### 5. Ribbon chart with particles flowing along the ribbons (Meeks, "Sankey Particles")

![particles](img/particles.gif)

Each particle has two keyframes: one at the right edge of its segment in lake i, and one at the left edge of the same species in lake i + 1. A transition joins them, and its curve is the ribbon's own edge curve. A particle on lane λ traces the curve λ of the way across the band, so it stays inside its ribbon. The ribbon is the spatial trace of the particle's motion.

```js
chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x", spacing: 56 }),
    stack({ by: field("species").sort("count"), dir: "y" })
  )
  .mark(/* each segment: rect({ … }).name("bars") plus its particle stops circle({ … }).name("stops") */)
  .layer(
    chart(selectAll("bars"))
      .flow(group({ by: "species" }))
      .mark(ribbon({ opacity: 0.5 }))
  )
  .layer(
    chart(selectAll("stops"))
      .flow(group({ by: "pid" }))
      .mark(time.transition({ along: "k", at: loop, curve: Curve.bezier() }))
  );
```

This example found three things. A transition's `curve` can mean two things: a data-space smoothing of values over time, or a screen-space route between placed boxes (#950). Matching by path fails when a mark changes parent, as a particle does when it crosses from one lake to the next. And `time.stagger` cannot give each mark a phase in a looping clock, so the prototype writes the wrap into the data.

---

## Does every spatial construct have a temporal analog?

Mostly yes. "Exact" means the temporal construct is the spatial one with the time axis substituted, and the same solver math applies.

| Spatial construct                    | Temporal analog                                          | Verdict                                         | Precedent                                                                       |
| ------------------------------------ | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| bounding box                         | lifetime                                                 | exact                                           | pict: "a time box's duration is analogous to a bounding box's width or height"  |
| `w` / `h`                            | duration                                                 | exact                                           | every system's `duration`                                                       |
| fit to a size                        | fit to a total duration                                  | exact                                           | Manim `AnimationGroup`, Gemini `totalDuration`, Firefly glue                    |
| a child that stretches to its parent | hold                                                     | exact                                           | pict `sustain`, SMIL `fill="freeze"`                                            |
| empty space, ghost                   | pad                                                      | exact                                           | pict `time_pad`, Gemini `pause`                                                 |
| `layer`                              | children share a time frame, all start at 0              | exact                                           | pict `overlay`/`concurrent`, SMIL `<par>`                                       |
| `stack`                              | one after another                                        | exact                                           | pict `switch`, Gemini `concat`, SMIL `<seq>`, Manim `Succession`                |
| `spread({ by })`                     | `time.stagger({ by })`                                   | exact                                           | Gemini `staggering`, Canis `grouping`, GSAP/Motion `stagger`                    |
| `scatter` (position by value)        | `time.sequence({ by: "year" })` on a time scale          | exact                                           | AVL `time` encoding, gganimate `transition_time`                                |
| `Constraint.align`                   | `time.align({ t: "start" \| "end" })`                    | exact                                           | Allen _starts_/_finishes_, Gemini `sync` anchor                                 |
| `Constraint.distribute`              | `time.after(a, b, { gap })`                              | exact                                           | SMIL `begin="a.end+1s"`, Madeus `BEFORE`/`MEETS`                                |
| `Constraint.position`                | start at an absolute time                                | exact                                           | GSAP numeric position, Remotion `from`                                          |
| `Constraint.nest`, `enclose`         | _during_: live as long as a group                        | exact                                           | Allen _during_, Madeus `DURING`, CAST nesting                                   |
| `ref` / `selectAll`                  | the same objects, with anchors on t (start, middle, end) | exact                                           | SMIL syncbase `a.end`, GSAP labels, pict `Find`                                 |
| `.name()`                            | identity across states                                   | exact                                           | pict identity, Figma layer names, CSS `view-transition-name`, Motion `layoutId` |
| `arrow`, `line({ along })`           | `time.transition(a, b)`                                  | exact                                           | pict `magic_move`, Remotion `TransitionSeries.Transition`, GoFish paper §8      |
| connector `curve`                    | the path through the in-between frames                   | exact for data-space curves, partial for routes | AE motion paths, SMIL `animateMotion`                                           |
| `ribbon`                             | split and merge transitions (1:n, n:1)                   | partial                                         | Data Animator, flubber `separate`/`combine`                                     |
| coordinate transform                 | time warp: easing, acceleration, `cyclic`                | partial (must stay monotone)                    | pict `bend`, AE time remapping                                                  |
| scale                                | time scale, `timer()`                                    | exact (on main)                                 | AVL `time.scale`                                                                |
| axis                                 | scrubber with keyframe ticks                             | exact in the model, unbuilt                     | player UIs                                                                      |
| clip, `intersect`                    | `time.history({ last })` window                          | exact (on main)                                 | gganimate `shadow_wake`                                                         |
| `filter`                             | filter by data time                                      | exact (on main)                                 | AVL predicate                                                                   |
| `label`                              | captions that ride a mark's lifetime                     | partial (#887, #920)                            | Canis                                                                           |
| z-order                              | none: paint order does not change with time              | none                                            |                                                                                 |
| `Overlap.separate()`                 | none: "no overlap in time" is just `stack`               | none                                            |                                                                                 |

Two analogs change meaning. **Fill:** in space a child is absent outside its box, but presentations need both "replace" (slides) and "keep" (builds). The spatial reading of keep is "stretch to the parent", which gives one rule: sequence-like composition pads and layer-like composition holds. **Warps must be monotone:** a coordinate transform may fold space, but time may only fold for looping (`cyclic`).

## Precedent

| System                          | What the user writes                                                                    | What the system decides                                 | Fits GoFish?                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Animated Vega-Lite              | `time: { field, key, scale, rescale }`                                                  | keyframes per value, tweening by key                    | data time, `key`, `rescale` match; no series/parallel, no segues       |
| Gemini / Gemini²                | `sync` (with `anchor`), `concat`, `staggering { by, overlap }`, steps between two specs | interpolation, recommended staging                      | `sync` = align on t, `concat` = stack on t; two states only, selectors |
| Canis / CAST                    | `grouping { groupBy, delay, sort }`, `reference: "start after previous"`                | effects on a dSVG                                       | nested grouping = nested spread on t; selector-based                   |
| Data Animator                   | storyboards of keyframe charts                                                          | matching by data scope (1:1, 1:n, n:1)                  | matching by rows is the principled `key`                               |
| Heer & Robertson 2007 / DynaVis | parallel and sequential composition, **split** by visual variable, staggering           |                                                         | staging = an inserted keyframe                                         |
| gganimate                       | `transition_states`, `enter_grow`, `shadow_wake`, `ease_aes`                            | tweening by `group`                                     | `shadow_*` = `time.history`                                            |
| d3-transition                   | `.transition().delay((d, i) => …)`, chained `.transition()`                             |                                                         | stacked-to-grouped is two chained stages                               |
| Motion                          | `animate(sequence)` with `at: "<"`, `stagger()`, `layoutId`                             | FLIP between layouts                                    | `layoutId` = name identity                                             |
| GSAP                            | `tl.to(…, "<+=0.5")`, labels, nested timelines                                          |                                                         | cursor strings instead of relations                                    |
| Rhombus pict                    | `switch`, `concurrent`, `magic_move`, `sustain`/`pad`, `Find`, `bend`                   | time boxes compose like bounding boxes                  | the closest model                                                      |
| SMIL                            | `<seq>`, `<par>`, `begin="a.end+1s"`, `fill="freeze"`                                   |                                                         | syncbase = `time.after`                                                |
| CSS View Transitions            | `view-transition-name`                                                                  | the browser moves matched boxes                         | name identity                                                          |
| Manim                           | `Succession`, `AnimationGroup(lag_ratio)`, `TransformMatchingShapes`                    | point alignment                                         | `lag_ratio` = stagger                                                  |
| Allen 1983, Madeus 1998         | 13 interval relations, with spatial align next to them                                  | constraint solve                                        | Madeus already mixed Allen clauses and spatial align in one system     |
| flubber, d3-interpolate-path    |                                                                                         | resample both paths to equal point counts, rotate start | the general morph, not built here                                      |

## Approaches

All four keep the earlier decision that temporal constructs have their own `time.*` names and spatial operators never take `dir: "t"` (animation.md §9.1).

### A. Time composes like space (recommended)

`layer` is the time container, `.relate()` takes temporal clauses, `time.transition` is the temporal relational mark, and `time.sequence` / `time.stagger` are operators with a flow form and a combinator form. Chained `.transition()` stays as sugar for timing that follows the spatial nesting. All five examples above are in this spelling.

- **Desugars into:** one morph core. The prototype lowers `time.sequence` over children, `time.sequence({ by })` in a flow, and `layer().relate(time.transition)` to the same tween node. A test shows the combinator and flow forms draw the same picture for two gapminder years (difference under 1e-6).
- **Overlaps:** `time.sequence(opts, [a, b])` is exactly a chain of `time.after` clauses with pad fill. `time.stagger` is exactly `time.after` with gaps, the way `spread` is `layer` plus `distribute`. Chained `.transition()` is exactly the relate clause. `time.transition` and `line({ along })` share one degenerate case, the connected scatterplot's dot and trail, which the tower test on main already checks.
- **Trade-offs:** no new container word. Every temporal construct has a spatial twin that explains it. The cost: `layer` now also means "start together and hold", which a reader must learn. Two forms (sequence and relate) write the same timelines, like `spread` and `layer` + `distribute`.

### B. A separate `timeline([...])` container

The #697 direction. The same clauses, but `timeline([...]).relate(...)` holds them and `layer` stays spatial. In the prototype `timeline` would be exactly `layer`, so the renders are identical. That is the argument against it: it is a second name for one operator. The argument for it is readability. If Josh finds `layer` confusing in these examples, B costs one name and nothing else.

### C. States and magic move only (Keynote, pict `switch`, CSS view transitions)

Only `time.sequence({ … }, [states])` with inferred matching, and timing only from options. It covers stacked ↔ grouped, the linked list and R2D3. It cannot write gun deaths, which needs series inside parallel. C is A without `.relate()`, so it is a subset of A rather than a rival.

### D. One schedule object (Gemini, GSAP, Motion `animate(sequence)`)

```js
schedule(chart)
  .add(selectAll("bars"), Animation.grow(), { at: 0 })
  .add(ref("note"), Animation.fadeIn(), { at: ">+200" });
```

D is the foil. It restates in strings and selectors what the spatial composition already says, and it has no data-driven keyframes, which is the gap the AVL paper names. animation.md §9.1 already rejected a separate animation sub-language.

## What the prototype taught

1. **Matching by path is wrong. Matching by rows is right.** The prototype first matched marks by their path from the keyframe root. That failed twice: R2D3's dots change parent (scatter → bin → pile), and particles change parent (lake A → lake B). The R2D3 agent patched it with two OR'd rules. That hides a conditional the user would have to model, so the patch should not ship. The one rule that covers every example is the AVL / D3 key join: **a mark is matched by the rows it draws, compared by `key`**. The key defaults to row identity, which covers a segue over the same data. `time.sequence({ by })` defaults it to the remaining split fields, which covers gapminder. Marks with no data are matched by their `.name()`, which covers diagrams. The last case is a domain special case (marks with no rows), not a heuristic.
2. **A transition's curve is either a value smoothing or a route.** The data-space curves (step, linear, monotone) smooth each channel over time. A ribbon's bezier is a screen route between two placed boxes, and it cannot be split per channel for arc or orthogonal routes. This is #950's split, and it applies to transitions too.
3. **The relate form is needed for holds and "after".** R2D3 and gun deaths both read better with `time.after` than with repeated keyframes or `time.stagger({ spacing: 0 })`.
4. **Staggering a segue per mark needs a home.** The prototype puts the stagger on the destination keyframe's operator ("arriving here"), which reads oddly. A `stagger` option on `time.transition` may be the right home.
5. **Per-group arrangements in a flow** (gun deaths' three acts) have no spelling. A relate clause over a selection (`time.stagger(…, selectAll("lives"))`) may cover it.
6. **The clock is not a dataset.** Counters ("PEOPLE KILLED") need marks that read the clock and the schedule. This is #830's "inputs are datasets" applied to the chart's own clock.
7. **Keyframes share scales,** so Bostock's per-state rescale is not available. This is the existing `rescale` question (#854).

## Recommendation

Approach A.

- It desugars into the core: both forms and the existing flow form lower to one morph node, and a test proves the equivalence (principles.md, "Why keep the core small").
- One concept is one operator: `layer`, `.relate()`, `time.sequence` and `time.stagger` each gain a time reading rather than a twin, and every overlap above is exact (api-design.md, "Overlap is fine at the edges").
- Few new terms. The new names are `time.after` and `time.align`, plus the `time.transition` clause. Each matches SMIL, Allen and Gemini precedent.
- The semantics live on data: identity is the key join over rows, and data time is a field on a time scale.
- The same shape works in JS and Python, with children positional and options as keyword arguments.

What would change the pick: if `layer` reads wrong to Josh in these examples, B is A with one extra name, and nothing else moves.

## Decisions for Josh

1. **Container:** reuse `layer` for time (A), or add `timeline` (B)?
2. **Fill:** in a `layer`, a finished part holds. In a `time.sequence`, each child is replaced by the next. Is that the rule?
3. **Identity:** a mark is matched by its rows, compared by `key` (default: row identity; `time.sequence({ by })` defaults to the remaining fields), and data-less marks by `.name()`. Where does an explicit `key` go: on `time.sequence`, on `time.transition`, or both?
4. **Clause names:** `time.after(a, b, { gap })`, `time.align({ t }, [...])`, `time.transition(a, b, { duration, ease, curve })`. Keep these, or use Allen's names (`meets`, `starts`, `during`)?
5. **Curve vs route:** one `curve` key whose family decides data-space or screen-space, or two keys (`curve` for smoothing, `route` for paths)?
6. **Stagger on a segue:** keep it on the destination operator (works today), or move it to `time.transition(a, b, { stagger })`?
7. **Acceleration:** `time.stagger({ lag: (i) => ms })`, `time.stagger({ ease })`, or both? Gun deaths uses the function form. GSAP and Motion have both.

## Syntax changes to review

- New: `time.sequence(opts, [children])` and `time.stagger(opts, [children])` combinator forms.
- New: `time.after`, `time.align` and `time.transition(a, b)` as clauses in `layer(...).relate(...)`.
- New: `.transition()` on `layer` (the prototype's gun-deaths spelling; superseded by `time.after` if decision 4 holds).
- New effect: `Animation.draw({ duration, ease })`, which reveals a stroke along its curve.
- Changed: `time.transition` accepts a screen route (`Curve.bezier()` and the other routers) as well as data-space curves (decision 5).
- Python: `time` as a namespace shadows the standard library's `time` module. `from gofish import time` still works, but it may deserve a note (#1022).

## Related issues

- #697 animation grammar design; the 2026-10-04 comment proposed `timeline().relate()`.
- #881 spelling of `.layer(time.transition())`; this proposal answers it with the relate clause and chained `.transition()`.
- #831 `.update` is `.connect` on time; named it `transition`.
- #54 spread in time and interpolation marks.
- #211 early `motion()` / `tween` sketch.
- #673 stable identity from spec position and data key; decision 3 refines it.
- #674 incremental layout; transitions here run at paint time and avoid it.
- #830 inputs are datasets; finding 6.
- #854 rescale per keyframe; finding 7.
- #887 chrome (axes, labels) does not tween.
- #907 relational-mark z-order on the selection tier.
- #914–#921 build-in bugs (keys across re-renders, live channels after build, labels on composites).
- #950 screen-space curves vs data-space interpolation; finding 2.
- #1022 a serializable form for animation (Python).
- #769 barley slope → heatmap morph, a future segue target.
- #1138 roadmap item "unified animation language".

## Prototype shortcuts (all marked `PROTOTYPE` in code)

- Identity: path-based, with R2D3's OR'd rule on top (to be replaced per decision 3).
- Time clauses are solved by longest path, not the spatial difference solver. `time.stagger` inside `.relate()` is not built. Time containers do not nest.
- Only arrows follow moving operands. Axes and legends are not matched and switch at the band edge. In the linked-list example, fading arrows draw with a bend.
- Non-box shapes cross-fade and move rigidly. There is no general path morph (flubber-style resampling would be the follow-up).
- `bezier` is a stand-in mark for gun deaths. `Animation.draw` re-parses the lowered path.
- The particles bind rows to combinator children by hand and write the loop wrap into the data.
- R2D3 has no axes (axes inside keyframes do not draw), and its pile spacing is picked by eye.
- The internals wiki essays for touched files were not updated.
