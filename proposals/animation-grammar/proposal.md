# Scenes on a timeline: an animation grammar for GoFish

**Summary.**

1. Two containers with one job each. `layer([...])` holds the parts of one picture, which are all present once it is built. `timeline([...])` holds scenes, which are different pictures over time. Spatial clauses go in `layer(...).relate()`, temporal clauses go in `timeline(...).relate()`, and putting one in the other is a loud error.
2. Every scene has a real interval, the way a mark has a size. `.hold(ms)` sets how long it is on screen. `time.after(a, b, { gap })` places scenes, and `time.transition(a, b)` is a temporal relational mark that fills exactly the gap between them, the way an `arrow` spans the space between two shapes. It takes no duration.
3. A working prototype draws five hard examples in this spelling: stacked ↔ grouped bars, a diagram magic move, R2D3's segue, Periscopic's gun deaths, and a ribbon chart with particles.

**Status.** Version 2, after Josh's review on 2026-10-15. Decided in that review: the separate `timeline` container, duration-free transitions, scene intervals, the hold as a modifier, and arcs drawn with `Curve.arc()`. Five questions remain at the end.

Prototype branch: `worktree-animation-grammar-proposal` (Storybook: "Animation/Grammar Prototype/…"). It is throwaway quality, and its shortcuts are listed in the last section.

---

## Terms

- **Scene.** One whole picture that is on screen for an interval: the stacked chart, the R2D3 histogram, the year 1975.
- **Interval.** The time a scene is on screen, from its start to its end. It is the time version of a bounding box. Rhombus pict calls it a "time box".
- **Hold.** How long a scene stays on screen (`.hold(ms)`). It plays the role of pict's `sustain` and gganimate's `state_length`.
- **Transition.** The in-between frames from one scene to the next. It is a relational mark on time: it spans the gap between two scenes the way an `arrow` spans the space between two shapes.
- **Magic move.** A transition that finds the same object in both scenes and moves it. The name comes from Keynote. Rhombus pict uses `magic_move`, and Motion uses `layoutId`.
- **Identity.** What makes a mark in one scene "the same" as a mark in another.
- **Build-in.** The parts of one picture entering over time, such as bars growing in one after another. The picture is complete once the build-in ends.
- **Clause.** One entry in `.relate()`.
- **Data time** and **presentation time.** Data time is a field read on a time scale (`time.sequence({ by: "year" })`). Presentation time is order the author picks (`time.stagger`). This split was settled in #901.

## What already exists (main)

`time.sequence({ by })` (keyframes in data time), `time.transition()` (interpolate between keyframes), `time.history({ last })` (trails), `time.stagger`, `time.parallel`, the chained `.transition({ enter, update, exit })` on marks and operators, and the effects `Animation.grow/shrink/fadeIn/fadeOut/appear/wipe`. These came from #886, #892, #901 and #902. The 2026-10-04 comment on #697 proposed the time container `timeline([...]).relate(...)`. This proposal builds it.

## The model

|                        | `layer([...])`                            | `timeline([...])`                                         |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Children               | parts of one picture                      | scenes                                                    |
| At rest                | all present together                      | one scene at a time (or several, if clauses overlap them) |
| Clauses in `.relate()` | spatial: `Constraint.*`, `arrow`, `line`  | temporal: `time.after`, `time.align`, `time.transition`   |
| Time inside            | build-ins only (`.transition({ enter })`) | scene intervals                                           |

The interval rules:

- A scene's interval is from its start to its start plus its length. The length is `.hold(ms)`, or else the length of the scene's own build-in (0 for a static scene). A hold shorter than the build-in is a loud error.
- A scene is drawn only during its own interval. There is no other rule about what stays on screen.
- `time.after(a, b, { gap })` means b starts `gap` ms after a ends. `time.align({ t: "start" | "end" }, [...])` makes scenes start or end together. A scene no clause places starts at 0. Conflicting clauses and cycles are loud errors.
- `time.transition(a, b)` spans exactly from a's end to b's start, and neither scene is drawn during it. A zero gap is a cut. A transition between overlapping scenes is a loud error.

Identity is the key join. **A mark is matched by the rows it draws, compared by `key`.** The default key is row identity, which covers a change of encoding over the same data. An explicit `key` (a field name or a function) is needed when the rows differ, as when gapminder's years are separate scenes. `time.sequence({ by })` defaults it to the remaining split fields. Marks that draw no rows, such as the boxes of a hand-built diagram, match by their `.name()` path. That is the one branch, and it exists because those marks have no rows.

`time.sequence(opts, [children])` stays as shorthand. It equals a timeline whose children are joined by `time.after` with a transition in every gap, with an optional `hold` per child.

## The five examples

Each example is rendered from a real prototype story. The GIFs are in `img/`.

### 1. Stacked ↔ grouped bars (Heer & Robertson 2007, Bostock)

![stacked to grouped](img/e1b.gif)

```js
const stacked = () =>
  chart(seafood)
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ h: "count", fill: "species" }));
const grouped = () =>
  chart(seafood)
    .flow(
      spread({ by: "lake", dir: "x" }),
      spread({ by: "species", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "count", fill: "species" }));

timeline([
  stacked().name("stacked").hold(1800),
  grouped().name("grouped").hold(1800),
  stacked().name("back"),
]).relate(({ stacked, grouped, back }) => [
  time.after(stacked, grouped, { gap: 1000 }),
  time.transition(stacked, grouped, { ease: "cubicInOut" }),
  time.after(grouped, back, { gap: 1000 }),
  time.transition(grouped, back, { ease: "cubicInOut" }),
]);
```

```python
timeline([
    stacked().name("stacked").hold(1800),
    grouped().name("grouped").hold(1800),
    stacked().name("back"),
]).relate(lambda: [
    time.after(ref("stacked"), ref("grouped"), gap=1000),
    time.transition(ref("stacked"), ref("grouped"), ease="cubicInOut"),
    time.after(ref("grouped"), ref("back"), gap=1000),
    time.transition(ref("grouped"), ref("back"), ease="cubicInOut"),
])
```

The shorthand: `time.sequence({ duration: 4000, hold: 800, cyclic: true }, [stacked(), grouped()]).transition({ update: Animation.tween() })` (`img/e1a.gif`). Bostock's per-lake delay is the existing operator stagger, `spread({ by: "lake", dir: "x" }).transition({ update: time.stagger({ lag: 150 }) })` (`img/e1c.gif`). Heer and Robertson's two stages (x first, then y) are one extra scene in the middle (`img/e1d.gif`).

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

This example keeps the containers apart naturally: spatial `.relate()` lives inside each scene, and the time composition is outside. Nodes have no rows, so they match by `.name()`. C slides right, the new node fades in, the circle morphs into a rounded rect while its color mixes, and the label cross-fades from "8" to "new". The arrows are redrawn from the moving nodes every frame, so they stay attached.

### 3. R2D3's segue (the animation that motivated Gemini and Data Animator)

The Animated Vega-Lite paper (§6.1.1) says "the authors of Data Animator and Gemini were both motivated in part by R2D3". Gemini's running example is R2D3's homes in San Francisco and New York, staggered by elevation. The data is the real R2D3 set (492 homes, CC BY-NC-SA).

![r2d3](img/r2d3.gif)

```js
timeline([
  scatterplot().name("scatter").hold(3000),
  layer([
    histogram(),
    threshold().transition({ enter: Animation.fadeIn({ delay: 600 }) }), // a build-in inside the scene
  ])
    .name("histogram")
    .hold(3000),
  layer([split(), threshold()]).name("split").hold(3000),
  scatterplot().name("again"),
]).relate(({ scatter, histogram, split, again }) => [
  time.after(scatter, histogram, { gap: 2000 }),
  time.transition(scatter, histogram),
  time.after(histogram, split, { gap: 1400 }),
  time.transition(histogram, split),
  time.after(split, again, { gap: 1400 }),
  time.transition(split, again),
]);
// histogram()'s scatter-by-bin operator carries
// .transition({ update: time.stagger({ by: field("elevation").sort(), dwell: 0.6 }) })
```

The threshold line is a part of the histogram picture, not a scene, so it enters as a build-in. It matches by name into the split scene and stays still. The dots change parents in every scene (scatter, then bin, then pile), and the key join still matches each home.

### 4. Periscopic's U.S. Gun Deaths (2013)

The AVL paper quotes Data Animator's author on this piece: "How do you have the circle appear and then drop, and then the line keeps going?" The data is 1,200 rows sampled from Periscopic's published 2013 file. The "could have lived to" ages come from an approximate life table.

![gun deaths](img/gun-deaths.gif)

Gun deaths is one picture built in, not a sequence of scenes. So it is a `layer` with build-ins, and it uses no timeline.

```js
const victims = gunDeaths2013.map((d) => ({
  ...d,
  stolen: d.potential - d.age,
}));
const years = (name) => field(name, "years");

// one arch from age 0 to the age the person could have lived to
const arch = (stroke) =>
  layer([
    stack({ dir: "x", spacing: 0 }, [
      blank({ w: 0, h: 0 }).name("birth"),
      blank({ w: years("potential"), h: 0 }),
      blank({ w: 0, h: 0 }).name("end"),
    ]),
  ]).relate(({ birth, end }) => [
    line(
      {
        stroke,
        strokeWidth: 1,
        opacity: 0.5,
        curve: Curve.arc({ height: 0.55 }),
      },
      [birth, end]
    ),
  ]);

// orange up to the age of death, grey after it
const band = (w) => rect({ y: -TALL, h: TALL, w: years(w), fill: "white" });
const life = layer([
  mask([
    stack({ dir: "x", spacing: 0 }, [
      blank({ w: years("age"), h: 0 }),
      band("stolen"),
    ]),
    arch(GREY),
  ]),
  mask([band("age"), arch(ORANGE)]),
]).transition({
  enter: Animation.wipe({
    from: "left",
    duration: "potential",
    ease: "linear",
  }),
});

const lives = (from, to, arrangement) =>
  chart(victims)
    .flow(
      filter((d) => d.i >= from && d.i < to),
      time.stagger({ by: "i", ...arrangement })
    )
    .mark(life);

layer([
  axis(),
  layer([
    lives(0, 2, { spacing: 0 }), // one life, then the next
    lives(2, 5, { lag: 720 }), // a few, overlapping
    lives(5, N, { lag: 11, ease: "quadOut" }), // the rest, faster and faster
  ]).transition({ enter: time.stagger({ spacing: 480 }) }),
]);
```

"Life, then stolen years" is no longer two parts in series. It is one left-to-right wipe over the whole arch, which crosses the age of death on its own. The three opening acts are three filtered charts. The acceleration is a named ease on the stagger instead of a formula. That ease is close to the original but not exact: start times differ by up to 19% of the span.

This rewrite hit four walls, listed under "What the prototype taught".

### 5. Ribbon chart with particles flowing along the ribbons (Meeks, "Sankey Particles")

![particles](img/particles.gif)

Each particle has two keyframes: one at the right edge of its segment in lake i, and one at the left edge of the same species in lake i + 1. A transition joins them, and its curve is the ribbon's own edge curve, so a particle on lane λ stays inside its ribbon. The ribbon is the spatial trace of the particle's motion.

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

This example has not been moved to the timeline. Each particle is an endless loop rather than a sequence of scenes. It shows that a transition's `curve` can mean two things: a smoothing of values over time, or a route between two placed boxes on screen (#950).

---

## Does every spatial construct have a temporal analog?

Mostly yes. "Exact" means the temporal construct is the spatial one with the time axis substituted, and the same solver math applies. With the timeline split, the analogs below sit in `timeline` when they relate scenes, and in build-ins when they order the parts of one picture.

| Spatial construct             | Temporal analog                                          | Verdict                                             | Precedent                                                                       |
| ----------------------------- | -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| bounding box                  | scene interval                                           | exact                                               | pict: "a time box's duration is analogous to a bounding box's width or height"  |
| `w` / `h`                     | `.hold(ms)`                                              | exact in meaning, different in spelling (see below) | gganimate `state_length`, pict `sustain`                                        |
| fit to a size                 | fit to a total duration                                  | exact                                               | Manim `AnimationGroup`, Gemini `totalDuration`, Firefly glue                    |
| `layer`                       | `timeline` (scenes share one frame)                      | exact                                               | pict `overlay`/`concurrent`, SMIL `<par>`                                       |
| `stack`                       | one scene after another                                  | exact                                               | pict `switch`, Gemini `concat`, SMIL `<seq>`, Manim `Succession`                |
| `spread({ by })`              | `time.stagger({ by })`                                   | exact                                               | Gemini `staggering`, Canis `grouping`, GSAP/Motion `stagger`                    |
| `scatter` (position by value) | `time.sequence({ by: "year" })` on a time scale          | exact                                               | AVL `time` encoding, gganimate `transition_time`                                |
| `Constraint.align`            | `time.align({ t: "start" \| "end" })`                    | exact                                               | Allen _starts_/_finishes_, Gemini `sync` anchor                                 |
| `Constraint.distribute`       | `time.after(a, b, { gap })`                              | exact                                               | SMIL `begin="a.end+1s"`, Madeus `BEFORE`/`MEETS`                                |
| `Constraint.position`         | start at an absolute time                                | exact                                               | GSAP numeric position, Remotion `from`                                          |
| `Constraint.nest`, `enclose`  | _during_: live as long as a group                        | exact                                               | Allen _during_, Madeus `DURING`, CAST nesting                                   |
| `ref` / `selectAll`           | the same objects, with anchors on t (start, middle, end) | exact                                               | SMIL syncbase `a.end`, GSAP labels, pict `Find`                                 |
| `.name()`                     | identity of data-less marks across scenes                | exact                                               | pict identity, Figma layer names, CSS `view-transition-name`, Motion `layoutId` |
| `arrow`, `line({ along })`    | `time.transition(a, b)`; its length is the gap           | exact                                               | pict `magic_move`, Remotion `TransitionSeries.Transition`, GoFish paper §8      |
| connector `curve`             | the path through the in-between frames                   | exact for smoothing, partial for routes             | AE motion paths, SMIL `animateMotion`                                           |
| `ribbon`                      | split and merge transitions (1:n, n:1)                   | partial                                             | Data Animator, flubber `separate`/`combine`                                     |
| coordinate transform          | time warp: easing, acceleration, `cyclic`                | partial (must stay monotone)                        | pict `bend`, AE time remapping                                                  |
| scale                         | time scale, `timer()`                                    | exact (on main)                                     | AVL `time.scale`                                                                |
| axis                          | scrubber with scene ticks                                | exact in the model, unbuilt                         | player UIs                                                                      |
| clip, `mask`                  | `time.history({ last })` window                          | exact (on main)                                     | gganimate `shadow_wake`                                                         |
| `filter`                      | filter by data time                                      | exact (on main)                                     | AVL predicate                                                                   |
| `label`                       | captions that ride a mark's lifetime                     | partial (#887, #920)                                | Canis                                                                           |
| z-order                       | none: paint order does not change with time              | none                                                |                                                                                 |
| `Overlap.separate()`          | none: "no overlap in time" is just `stack`               | none                                                |                                                                                 |

**Why the hold is a modifier and not an option like `w`.** A mark's `w` and `h` are options because a mark's shape is its own business. A chart or a layer has no size option either: its size comes from its contents, and an outer operator may fit it. A scene's hold is closer to that. Its intrinsic length is its build-in, and the timeline places it. `.hold(ms)` then says "stay longer than your contents need", which reads like `.name()`, a fact the container uses. The tension is real: the strict spatial twin would be a size claim on the scene. If more cases appear where a container must fit scenes into a total time, a fit operator on the timeline may be the better home.

**Precedent for the two-container split.** Madeus (1998) put Allen relations and spatial align in one constraint system, and found it workable. SMIL kept them apart: `<par>`/`<seq>` for time, layout regions for space. None of the five examples needed a spatial and a temporal clause in the same `.relate()`, and the linked list shows how they combine when needed: spatial clauses inside each scene, temporal clauses outside.

## Precedent

| System                          | What the user writes                                                                    | What the system decides                | Fits GoFish?                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Animated Vega-Lite              | `time: { field, key, scale, rescale }`                                                  | keyframes per value, tweening by key   | data time, `key`, `rescale` match; no series/parallel, no segues       |
| Gemini / Gemini²                | `sync` (with `anchor`), `concat`, `staggering { by, overlap }`, steps between two specs | interpolation, recommended staging     | `sync` = align on t, `concat` = stack on t; two states only, selectors |
| Canis / CAST                    | `grouping { groupBy, delay, sort }`, `reference: "start after previous"`                | effects on a dSVG                      | nested grouping = nested spread on t; selector-based                   |
| Data Animator                   | storyboards of keyframe charts                                                          | matching by data scope (1:1, 1:n, n:1) | matching by rows is the key join                                       |
| Heer & Robertson 2007 / DynaVis | parallel and sequential composition, split by visual variable, staggering               |                                        | staging = an inserted scene                                            |
| gganimate                       | `transition_states(state_length, transition_length)`, `enter_grow`, `shadow_wake`       | tweening by `group`                    | `state_length` = hold, `transition_length` = gap                       |
| d3-transition                   | `.transition().delay((d, i) => …)`, chained `.transition()`                             |                                        | stacked-to-grouped is two chained stages                               |
| Motion                          | `animate(sequence)` with `at: "<"`, `stagger()`, `layoutId`                             | FLIP between layouts                   | `layoutId` = name identity                                             |
| GSAP                            | `tl.to(…, "<+=0.5")`, labels, nested timelines                                          |                                        | cursor strings instead of relations                                    |
| Rhombus pict                    | `switch`, `concurrent`, `magic_move`, `sustain`/`pad`, `Find`, `bend`                   | time boxes compose like bounding boxes | the closest model                                                      |
| SMIL                            | `<seq>`, `<par>`, `begin="a.end+1s"`, `dur`, `fill="freeze"`                            |                                        | syncbase = `time.after`, `dur` = hold                                  |
| CSS View Transitions            | `view-transition-name`                                                                  | the browser moves matched boxes        | name identity                                                          |
| Remotion                        | `<Series>`, `<Sequence durationInFrames>`, `<TransitionSeries.Transition>`              |                                        | a transition is an element between two sequences                       |
| Manim                           | `Succession`, `AnimationGroup(lag_ratio)`, `TransformMatchingShapes`                    | point alignment                        | `lag_ratio` = stagger                                                  |
| Allen 1983, Madeus 1998         | 13 interval relations, spatial align beside them                                        | constraint solve                       | Madeus mixed the two kinds of clause in one system                     |
| flubber, d3-interpolate-path    |                                                                                         | resample paths to equal point counts   | the general morph, not built here                                      |

## Approaches considered

### B. A separate `timeline` (chosen 2026-10-15)

Described above. It keeps the two kinds of clause apart, and it keeps `layer` meaning "all present together". Build-ins do not break that: they reveal a picture whose parts are all present once it is built.

### A. Time composes inside `layer` (version 1's pick)

`layer` was the time container and `.relate()` took both kinds of clause. It was rejected for two reasons. First, R2D3's scenes are never on screen together, which contradicts what `layer` means. Second, it needed a hidden rule: a child stayed drawn unless a transition "consumed" it, so `time.after` meant "replace" in one place and "add" in another. Scene intervals remove that rule.

### C. States and magic move only (Keynote, pict `switch`, CSS view transitions)

Only `time.sequence({ … }, [states])` with inferred matching. It survives as the shorthand. It cannot express a build-in inside a scene or scenes of different lengths.

### D. One schedule object (Gemini, GSAP, Motion `animate(sequence)`)

```js
schedule(chart)
  .add(selectAll("bars"), Animation.grow(), { at: 0 })
  .add(ref("note"), Animation.fadeIn(), { at: ">+200" });
```

The foil. It restates the structure in selectors and strings and has no data-driven keyframes. animation.md §9.1 already rejected a separate animation sub-language.

## What the prototype taught

1. **Matching by path is wrong; matching by rows is right.** R2D3's dots and the particles change parents between scenes. The key join covers every example with one rule (built in version 2).
2. **A transition's curve is either a smoothing or a route** (#950).
3. **`intersect` and `subtract` cannot clip a stroke.** They are color compositors. `subtract([arch, rect])` drew the rect minus the arch, the opposite of its doc comment ("A − B"). That looks like a library bug and needs its own issue. Gun deaths uses `mask`, a true alpha clip.
4. **A mark cannot be placed at a data x without a scale.** Gun deaths places each arch's ends as zero-size blanks in an x-stack, `potential` years apart, instead of writing `x: 0` and `x2: "potential"`. The orange band likewise needs a data-side `stolen = potential - age` column, and a pixel-tall `TALL` rect because the picture has no y scale.
5. **Every arch now has the same shape.** `Curve.arc({ height })` takes one ratio, so the original's height variation is lost. A data-driven `height` would restore it.
6. **The acceleration is approximate.** A named ease on the stagger replaces the formula, at up to 19% error in start times.
7. **Per-group arrangements and counters.** Filtered charts replace the per-group arrangement wall. A "PEOPLE KILLED" counter still needs the clock as a dataset (#830).
8. **Staggering a segue per mark** sits on the destination scene's operator ("arriving here"), which reads oddly.
9. **Scenes share scales,** so per-scene rescale is the open #854.

## Open questions for Josh

1. **Hold spelling.** `.hold(ms)` as a modifier (built), or `.duration(ms)`? Or should a timeline-level fit (`timeline([...], { total })`) come first?
2. **Explicit key.** On `time.transition` (built) and `time.sequence` (built), or also on `timeline` as a default for all its transitions?
3. **Curve versus route.** One `curve` key whose family decides, or two keys (`curve` for smoothing, `route` for paths)?
4. **Segue stagger.** Keep it on the destination operator, or move it to `time.transition(a, b, { stagger })`?
5. **Placing marks at data positions** in gun deaths (wall 4). Is `blank` in an x-stack acceptable, or should a bare mark accept `x: datum(…)` without a chart scale?

## Syntax changes to review

- New: `timeline([...]).relate(...)` with `time.after`, `time.align` and `time.transition(a, b)` as clauses.
- New: `.hold(ms)` on any mark, `layer`, `timeline` or chart.
- New: `time.sequence(opts, [children])` and `time.stagger(opts, [children])` combinator forms, and `hold` and `key` options on `time.sequence`.
- New: `delay` on every `Animation.*` effect. `Animation.wipe` from a side now works on any mark, including paths.
- New: `Curve.arc({ height })` (descriptor, schema and Python wrapper updated).
- Changed: `time.transition` takes `key` and no `duration`. It accepts a screen route (`Curve.bezier()` and the other routers) as well as data-space curves.
- Errors: a time clause in `layer(...).relate()`, a spatial clause in `timeline(...).relate()`, a hold shorter than the build-in, a transition between overlapping scenes, conflicting or cyclic time clauses.
- Python: a `time` namespace shadows the standard library's `time` module. `from gofish import time` still works, but it may deserve a note (#1022).

## Related issues

- #697 animation grammar design; the 2026-10-04 comment proposed `timeline().relate()`.
- #881 spelling of `.layer(time.transition())`; answered by the timeline clause and chained `.transition()`.
- #831 `.update` is `.connect` on time; named it `transition`.
- #54 spread in time and interpolation marks.
- #211 early `motion()` / `tween` sketch.
- #673 stable identity from spec position and data key; the key join refines it.
- #674 incremental layout; transitions here run at paint time and avoid it.
- #830 inputs are datasets; counters.
- #854 rescale per keyframe.
- #887 chrome (axes, labels) does not tween.
- #907 relational-mark z-order on the selection tier.
- #914–#921 build-in bugs.
- #950 screen-space curves vs data-space interpolation.
- #1022 a serializable form for animation (Python).
- #769 barley slope → heatmap morph, a future segue target.
- #1138 roadmap item "unified animation language".

## Prototype shortcuts (all marked `PROTOTYPE` in code)

- `time.sequence` over children is not literally lowered to `timeline`. It keeps its child-index clock and cyclic wrap, because a timeline cannot loop its last scene into its first.
- The timeline clock is separate from the build-in clock. The tween and morph take options for whether the scenes or the morph draw the keyframes.
- Only `arrow` is redrawn from moving operands. Axes and legends are not matched.
- Non-box shapes cross-fade and move rigidly. There is no general path morph (flubber-style resampling would be the follow-up).
- Wipes on paths draw under a mask rect patched each frame. A mask counts as one drawn part for build-ins.
- Gun deaths uses the `TALL` band and blanks for arch ends (walls 4 and 5). The gun-deaths filmstrip times out in `capture-one` (thousands of masks), so its frames come from a Storybook recorder.
- R2D3 has no axes (axes inside scenes do not draw), and its pile spacing is picked by eye.
- The particles bind rows to combinator children by hand and write the loop wrap into the data.
- `.layer(...)` chains (`LayerBuilder`) have no `.hold`.
- The internals wiki essays for touched source files are not updated.
