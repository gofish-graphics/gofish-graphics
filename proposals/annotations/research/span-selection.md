# Selecting parts of a mark: spans of text and beyond

**Question.** Example 5 writes `Var(X) = E[(X − μ)²]` as six separately placed text
tokens, so that each term can be named and annotated. Josh's feedback: select spans of
one text instead, ideally with a model that works beyond text. This note surveys how
other systems select part of a text (and part of a shape), records what GoFish has
today, compares three spellings, and reports a prototype that draws the formula as one
`text` mark with selected parts.

**Recommendation.** A ref method pair, `ref("eq").part(selector)` (singular, one or
error) and `ref("eq").parts(selector)` (plural, an array of refs that is ordinary chart
data). A part is an interval of a parameter the mark already has: its characters for a
text, its length for a path, its data domain for a line, a stored name for an outline
edge. Annotation stays approach C from the proposal: selection + subject + `.label()`.
The selection is now a list of part refs.

```js
layer([
  text({
    text: "Var(X) = E[(X − μ)²]",
    fontSize: 32,
    fontFamily: "Georgia, serif",
  }).name("eq"),
  chart(
    ref("eq").parts({
      variance: "Var(X)",
      mean: /E(?=\[)/,
      deviation: "(X − μ)²",
    })
  )
    .flow(group({ by: "part" }))
    .mark(
      enclose({
        shape: Shape.bracket({ side: "bottom" }),
        stroke: "part",
      }).label((d) => NOTES[project(d, "part")], {
        position: Place.around({ directions: ["s"], offset: 28 }),
        leader: {},
      })
    ),
]);
```

Conventions: **Verified** means I read the primary source in this session.
**Unverified** means memory or a secondary summary.

---

## 1. Precedent

### 1.1 Table

| System                               | Spelling                                                                                                                                          | What the selection returns                                                                                                                    | Status     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| CSS Custom Highlight API             | `const r = new Range(); r.setStart(node, i); r.setEnd(node, j); CSS.highlights.set("hits", new Highlight(r));` then `::highlight(hits) { color }` | A style hook only. `::highlight()` takes paint properties (color, background, text-decoration). No layout and no geometry.                    | Verified   |
| DOM `Range`                          | `range.getClientRects()`, `range.getBoundingClientRect()`                                                                                         | Geometry: one rect per line fragment, or their union.                                                                                         | Unverified |
| CSS `::first-letter`, `::first-line` | `p::first-letter { font-size: 3em }`                                                                                                              | A style hook on a structural part the browser finds. No geometry.                                                                             | Unverified |
| CSS `::part(name)`                   | author writes `part="label"` inside a component, outside CSS writes `x-card::part(label)`                                                         | A style hook on a part named at authoring time.                                                                                               | Unverified |
| CSS Anchor Positioning               | `.term { anchor-name: --e }` on an inline `<span>`, `.note { position-anchor: --e; top: anchor(bottom) }`                                         | A named anchor box that other elements are placed against. The span must exist as an element.                                                 | Unverified |
| Typst show rules                     | `show "Project": smallcaps`, `show regex("\w+"): ..`, `show <intro>: ..`, `show heading.where(level: 1): ..`                                      | Each match is handed to a function that restyles or replaces it. Selection by string or regex needs no markup.                                | Verified   |
| Typst labels and introspection       | `[text] <name>`, then `query(<name>)`, `locate(...)`, `here().position()`, `measure(body)`                                                        | Geometry by query: a page position, or a measured size. The piece must be its own element to carry a label.                                   | Unverified |
| Typst `pinit` package                | `A simple #pin(1)highlighted text#pin(2).` then `#pinit-highlight(1, 2)`, `#pinit-point-from(2)[It is simple.]`, `#pinit-arrow(1, 2)`             | Pins are named points in the text flow. Each is a position `(page, x, y)`. A highlight is the box between two pins, a note points at one pin. | Verified   |
| LaTeX `\underbrace`, `\overbrace`    | `\underbrace{(X-\mu)^2}_{\text{squared distance}}`                                                                                                | Nothing to select. The brace and its note are part of the typeset formula.                                                                    | Unverified |
| LaTeX `tikzmark`                     | `\tikzmarknode{e}{E}` in the formula, then `\draw (e.south) -- ++(0,-1em) node {...};` in a `remember picture, overlay` picture                   | A TikZ node over the marked content: a box with anchors (`north`, `south`, ...).                                                              | Unverified |
| LaTeX `annotate-equations`           | `\eqnmarkbox[NavyBlue]{p1}{p}`, `\eqnmark[OliveGreen]{k2}{\kappa}`, `\annotate[yshift=3em]{above,left}{Is}{size of set ...}`                      | A colored, optionally boxed node (as tikzmark), plus a note with a bent leader at a side. Mixes with a hand `\tikzmarknode`.                  | Verified   |
| FFL (Head et al., UIST 2023)         | `$m_?$ { color: red; }`, `.subscript { color: green }`, `intersection($x_\?$, .constant)`, with `label`, `label-position`, `label-marker: extent` | A CSS rule over subexpressions picked by a LaTeX pattern with wildcards (`?`, `*`) or a class. Styles and labels; geometry stays internal.    | Verified   |
| Delta (Head lab, UIST 2026)          | labels keyed by LaTeX subexpression                                                                                                               | A subexpression as the key of a note. See `prior-work.md` 5.4.                                                                                | Partial    |
| KaTeX / MathJax                      | `\htmlId{e}{E}`, `\htmlClass{term}{E}`, `\htmlStyle{color:red}{E}`; MathJax `\cssId`, `\class`, `\style`                                          | A DOM element over the subexpression, named at authoring time. Geometry through the DOM.                                                      | Unverified |
| ProseMirror decorations              | `Decoration.inline(from, to, { class: "hit" })`                                                                                                   | A style over a character range [from, to). No geometry (the view gives `coordsAtPos`).                                                        | Unverified |
| Figma text ranges                    | `node.getRangeFills(start, end)`, `node.setRangeFills(start, end, fills)`                                                                         | Style read and written per character range.                                                                                                   | Unverified |
| SVG text                             | `<tspan fill="red">E</tspan>`; `text.getSubStringLength(i, n)`, `getExtentOfChar(i)`, `getStartPositionOfChar(i)`                                 | A tspan styles a run named at authoring time. The measuring calls give the width of a range and the box of one character.                     | Unverified |
| polars strings                       | `str.find(pattern)`, `str.extract(pattern, group)`, `str.extract_all`, `str.extract_groups`                                                       | Match positions and captured text as data. Named groups become struct fields.                                                                 | Unverified |
| SVG paths                            | `pathLength="1"` with `stroke-dasharray`, `getPointAtLength(s)`                                                                                   | A sub-span of a path drawn by dashing, or one point at a length.                                                                              | Unverified |
| TikZ paths                           | `node[pos=0.3]`, `decoration={markings, mark=between positions 0.2 and 0.4 ...}`                                                                  | A point or a stretch of a path by its fraction of length.                                                                                     | Unverified |

### 1.2 What the precedent says

- **Two ways to get a part.** Either the part is named when the text is written (`::part`,
  tspans, `\tikzmarknode`, `\htmlId`, Typst labels, `#pin`), or it is found later by a
  rule over the content (Typst `show "E"` and `show regex`, FFL patterns, CSS Highlight
  ranges, ProseMirror and Figma ranges, `::first-letter`). Josh's "avoid tokenizing" is
  the second way.
- **What a selection returns splits into style and geometry.** The CSS family
  (`::highlight`, `::part`, `::first-letter`, ProseMirror, Figma) returns a style hook.
  The drawing family (tikzmark, annotate-equations, pinit, `Range.getClientRects`, SVG
  `getExtentOfChar`) returns geometry that other ink attaches to. Annotations need
  geometry first (an underline, a box, a leader end) and style second (the term's color).
  A GoFish ref already carries geometry, so a part ref is in the drawing family.
- **Rules that select by content allow several matches.** Typst and FFL style every match.
  `Range` and pins are one each. This is GoFish's `selectAll` and `ref` split again.
- **The geometry of a text part is several boxes.** `Range.getClientRects()` returns one
  rect per line fragment. A part that wraps (or a rotated text) is not one box.
- **The math tools agree on the anatomy.** annotate-equations is `\eqnmarkbox` (color and
  box) plus `\annotate` (note, side, leader). FFL is `selector { color; label;
label-marker: extent }`. pinit is highlight plus point-from. That is selection,
  subject, note, connector: approach C.
- **Beyond text, parts are intervals of length.** SVG dashes, `getPointAtLength`, and
  TikZ `pos` and `between positions` all pick a stretch of a path by its fraction of
  length. GoFish already has this vocabulary in `Place.along({ at })`.

## 2. What GoFish has today

- **The `text` mark draws one `<text>` element with one fill.** No tspans and no rich
  text (`src/ast/shapes/text.tsx`, `lower` emits one `TextItem`).
- **It measures with canvas `measureText`**, using the same font shorthand the SVG uses
  (`estimateTextDimensions`). Width comes from `metrics.width`; ascent and descent come
  from the font box (`fontBoundingBoxAscent`), not the glyph ink. The measurement happens
  at layout time, before any DOM exists, so `getSubStringLength` is not available to
  layout. A prefix measured the same way gives a part's x interval.
- **Its geometry is its box.** An unrotated text's outline is its box with
  `bounds: true` (it stands in for the glyphs). A rotated text is its turned box.
- **Outlines already have named parts.** `boxOutline` gives every box the parts `y-min`,
  `x-max`, `y-max` and `x-min`, each an interval `[from, to]` of arc length along the
  outline (`src/ast/geometry/outline.ts`). `Place.along({ at })` takes a fraction, `"start"`,
  `"middle"`, `"end"`, or such a part name (`src/ast/labels/strategies.ts`). So "a part is
  a named interval of a parameter" already exists, for outlines.
- **Refs.** `ref(name)` is singular and fails on zero or several matches. `selectAll(name)`
  is plural and returns a plain array of refs with no methods. `ref(token)` returns a
  `RefProxy`, where any property extends the path (`ref(tok).child[2]`). Every method of
  `GoFishRef` is a reserved key that dotted access cannot reach as a child name
  (`RESERVED_KEYS` in `src/ast/shapes/ref.tsx`), so a new `part` method would make a
  child named `part` reachable only through `.path("part")`.
- **Region compositing.** `mask([A, B])` draws B only inside A's region without drawing A.
  `paint([A, B])` keeps A, but blends B with `mix-blend-mode: color`, which keeps A's
  lightness, so dark glyphs stay dark. `mask` reads A's luminance, not its alpha, so a
  dark stencil lets only a little of B through. The prototype needed a white copy of the
  text as the stencil.
- **Rules in [API Design](../../../apps/docs/docs/internals/design/api-design.md)** that
  bear on this: a name says the shape of its value (`ref` one, `selectAll` many); data
  flows as lists; a method reads its caller's state, an option is a local adjective; one
  concept is one operator; do not reuse a word that already means something; survey
  precedent first.

## 3. Candidates

All three draw the formula as one `text`. They differ in where the part is named and in
what spelling selects it. The annotation half (subject, `.label()` with `leader`) is the
proposal's approach C in every case. `Shape.bracket` is decision 9 of the proposal; until
it exists the underline is a `rect` aligned to the part (as in the prototype).

### a. A ref method: `ref(x).part(selector)` and `ref(x).parts(selector)` (recommended)

The selector is read against the mark the ref resolves to. For a text it is a string, a
regex, or a character range `[start, end]`. `part` is singular and fails unless exactly
one match; `parts` is plural and returns an array of refs, which `chart()` takes as data
like `selectAll`'s. A record of selectors names the parts, the way regex named groups and
polars `extract_groups` name captures. Each part ref's datum is
`{ part, match, start, end }`.

```js
const NOTES = {
  variance: "variance: how far X spreads",
  mean: "expected value: the average over X",
  deviation: "squared distance from the mean μ",
};
layer([
  text({
    text: "Var(X) = E[(X − μ)²]",
    fontSize: 32,
    fontFamily: "Georgia, serif",
  }).name("eq"),
  chart(
    ref("eq").parts({
      variance: "Var(X)",
      mean: /E(?=\[)/,
      deviation: "(X − μ)²",
    }),
    { color: Color.palette({ variance: RED, mean: BLUE, deviation: GREEN }) }
  )
    .flow(group({ by: "part" }))
    .mark(
      enclose({
        shape: Shape.bracket({ side: "bottom" }),
        stroke: "part",
      }).label((d) => NOTES[project(d, "part")], {
        position: Place.around({ directions: ["s"], offset: 28 }),
        leader: {},
        fill: "part",
      })
    ),
]);
```

```python
layer([
    text(text="Var(X) = E[(X − μ)²]", font_size=32, font_family="Georgia, serif").name("eq"),
    chart(
        ref("eq").parts(variance="Var(X)", mean=re.compile(r"E(?=\[)"), deviation="(X − μ)²"),
        color=Color.palette({"variance": RED, "mean": BLUE, "deviation": GREEN}),
    )
    .flow(group(by="part"))
    .mark(
        enclose(shape=Shape.bracket(side="bottom"), stroke="part")
        # a value-keyed record (#804): Python lambdas do not cross the bridge
        .label({"variance": "variance: how far X spreads",
                "mean": "expected value: the average over X",
                "deviation": "squared distance from the mean μ"},
               position=Place.around(directions=["s"], offset=28), leader={})
    ),
])
```

Singular use, a single box around one term:

```js
enclose({ shape: Shape.box(), padding: 2 }, [ref("eq").part("E")]);
ref("eq").part("X"); // error: "X" matched 2 times; use parts(/X/) or { match: "X", nth: 0 }
```

Non-text parts, same method:

```js
ref("price").part({ x: [datum("2007-11-01"), datum("2009-03-01")] }); // a line between two dates, cut exactly
ref("route").part({ at: [0.2, 0.4] }); // a stretch of a path by length (Place.along's `at`)
ref("bar").part("y-max"); // a rect's top edge in a y-up chart (an outline part, #1205)
ref("ring").part({ at: [0, 0.25] }); // a quarter arc of a circle's outline
```

```python
ref("price").part(x=[datum("2007-11-01"), datum("2009-03-01")])
ref("route").part(at=[0.2, 0.4])
ref("bar").part("y-max")
```

- **One rule:** a part is an interval of a parameter the mark already has. A text's
  parameter is its characters, a path's is its length, a line's is also its data domain,
  and an outline part is an interval stored under a name. A selector gives the interval by
  value (`[start, end]`, `{ at }`, `{ x }`), by name (`"y-max"`), or by match (a string
  or regex). Matching by content is the one kind special to text, and it is inherent to
  the domain: only text has values that a pattern can match.
- **Rules:** `part` and `parts` read the mark the ref points at (its string, its outline),
  so they are methods, not options. The singular and plural pair says the shape of its
  value, as `ref` and `selectAll` do. The plural returns a plain array, so data still
  flows as lists and every operator works on it.
- **Name:** "part" is CSS's (`::part`), GoFish's own (outline `parts`, `Place.along`'s
  part names), and plain. "span" was the first idea, but GoFish already uses it for an
  extent (`Constraint.align({ x: "span" })`, `localPlotSpan`), which API Design forbids
  reusing. "range" means a scale's output range in visualization. "slice" fits only
  character ranges.
- **Geometry:** a part ref has outlines like any node: one box per line fragment for a
  text (as `Range.getClientRects`), a sub-path for a path. `enclose`, `arrow`,
  constraints and `.label()` read it with no change.
- **Cost:** `part` and `parts` become reserved names on `RefProxy`. Selectors resolve when
  the ref is read, at layout, against the measured text.

### b. Named spans at authoring time (Typst labels, tspans, tikzmark, `\htmlId`)

The text is written as a list of runs, some named. A named run is a child, so the existing
ref path reaches it.

```js
text({
  text: [
    { text: "Var(X)", name: "variance" },
    " = ",
    { text: "E", name: "mean" },
    "[",
    { text: "(X − μ)²", name: "deviation" },
    "]",
  ],
  fontSize: 32,
}).name("eq");
// then ref("eq").variance, ref("eq").mean, ... (RefProxy path segments)
```

```python
text(text=[span("Var(X)", name="variance"), " = ", span("E", name="mean"),
           "[", span("(X − μ)²", name="deviation"), "]"], font_size=32).name("eq")
```

A markup string (`"#variance[Var(X)] = #mean[E][#deviation[(X − μ)²]]"`) is shorter but
needs escaping as soon as the formula has brackets, which this one does.

- **Easy:** styling per run is natural (each run can take `fill`, `fontWeight`), which also
  answers the proposal's decision 7 (a bold title over a body). It is how the output would
  be drawn anyway (tspans).
- **Awkward:** it is still tokenizing, by hand, inside one mark. It does not let a second
  author annotate a text they did not write. It has no non-text form: a line has no
  "runs" to name, so the general model would be a second mechanism.
- **Verdict:** worth having as rich text for styling, separately. Not the selection model.

### c. A flow step over a selection (FFL, Typst show rules)

A data step maps each text ref in a selection to its matching parts.

```js
chart(selectAll("eq"))
  .flow(parts({ variance: "Var(X)", mean: /E(?=\[)/, deviation: "(X − μ)²" }), group({ by: "part" }))
  .mark(enclose({ shape: Shape.bracket({ side: "bottom" }) }).label(...));

chart(selectAll("price")).flow(parts({ x: [datum(a), datum(b)] }));
```

```python
chart(select_all("eq")).flow(parts(variance="Var(X)", mean=re.compile(r"E(?=\[)"), ...), group(by="part"))
```

- **Easy:** it reads like FFL and Typst: a rule applied over everything the selection
  holds, so all equations named `"eq"` get the same treatment.
- **Awkward:** it is a flow step that looks inside its items (their mark kind and their
  string), which API Design's "data flows as lists" rules out for splits. It needs a
  `selectAll` and a chart even for one term of one text. And it is exactly
  `derive((refs) => refs.flatMap((r) => r.parts(sel)))` under candidate a, so it adds a
  name without adding power.
- **Verdict:** if a rule over many texts is common, it is that one-line `derive` over a.

## 4. Prototype

Files:

- `packages/gofish-graphics/stories/_proposals/annotations/textParts.ts`: a throwaway,
  story-local helper. `findPart` and `findAll` resolve a selector (string, regex, range,
  or `{ match, nth }`) to a character range, and fail when a singular selector matches
  zero or several times. `partBox` measures the prefix and the prefix plus the match with
  the `text` mark's own `estimateTextDimensions`, so the part's x interval agrees with the
  layout. `partStandIn` lays an invisible `rect` over the part, inside the text's box.
- `packages/gofish-graphics/stories/_proposals/annotations/Ex5MathSpans.stories.tsx`
  (title `Proposals/Annotations/Ex5 Math Spans`), four stories.

The Mask story, the formula as one text:

```js
const EQ = {
  text: "Var(X) = E[(X − μ)²]",
  fontSize: 32,
  fill: "#222",
  fontFamily: "Georgia, serif",
};
const terms = [
  {
    name: "v",
    part: "Var(X)",
    color: RED,
    depth: 18,
    note: ["variance:", "how far X spreads"],
  },
  {
    name: "e",
    part: /E(?=\[)/,
    color: BLUE,
    depth: 54,
    note: ["expected value:", "the average over X"],
  },
  {
    name: "d",
    part: /\(X − μ\)²/,
    color: GREEN,
    depth: 18,
    note: ["squared distance", "from the mean μ"],
  },
];
layer([
  text({ ...EQ, x: 0, y: 0 }),
  mask([
    text({ ...EQ, x: 0, y: 0, fill: "white" }), // the stencil: the glyphs
    layer(terms.map((t) => partStandIn(EQ, t.part, t.color).name(t.name))), // proposed: ref("eq").part(t.part)
  ]),
  ...terms.map((t) => rect({ h: 2, fill: t.color }).name(`${t.name}Bar`)),
  ...terms.map((t) => note(t.note, t.color).name(`${t.name}Note`)),
]).relate(annotate); // align bar to part, note under bar, arrow note -> bar (as in Ex5 A)
```

Images in `proposals/annotations/img/`:

| Image                          | Story    | What it shows                                                                                                                                                            |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ex5-math-spans-mask.png`      | Mask     | One text. Three parts picked by a substring and two regexes, colored with `mask` (text as stencil), each underlined, with a note and a leader. Matches `ex5-math-a.png`. |
| `ex5-math-spans-overlay.png`   | Overlay  | The same, colored by drawing a second text of the part's characters at the part's x. Visually the same.                                                                  |
| `ex5-math-spans-plural-x.png`  | PluralX  | Both `X`s boxed. The singular `"X"` throws ("matched 2 times"), so the plural or `{ match: "X", nth }` is needed.                                                        |
| `ex5-math-spans-line-part.png` | LinePart | A non-text part: GOOG's price line from Nov 2007 to Mar 2009 recolored, boxed, and labeled.                                                                              |

What was approximated:

1. **Selectors resolve when the spec is built, not when the ref is read.** The helper needs
   the text's options up front and makes a named stand-in per part. The real `part` would
   resolve at layout against the node.
2. **A part's x interval is `width(prefix)` to `width(prefix + match)`.** Kerning across the
   cut is ignored. At 32 px Georgia the error is under a pixel. Its y interval is the font's
   line box, not the glyph ink.
3. **Color.** The text mark has one fill. `mask` with a white copy of the text as the
   stencil gives exact per-glyph color with no second text, and it works on any mark. The
   white stencil is a workaround for `mask` reading luminance (a library wart worth an
   issue: a stencil's alpha is what a user means).
4. **Notes and leaders use the Ex5 A idiom** (`.relate` with `align`, `distribute`, `arrow`,
   hand-staggered depths), because `.label({ leader })` is not built yet.
5. **The line part is a filtered selection of the line's points**, drawn as a second
   line. It cuts at data points, not at the exact dates, and its smoothing is recomputed
   on the subset, so its ends bend slightly differently from the gray line. A real
   `part({ x })` would cut the drawn path.
6. **`.label()` on that part line fails today**: "Place.end needs an open path; connect has
   none" (and `Place.along` says it "needs an outline"). A line drawn over a selection has
   no outline for label strategies. The story labels a box around the part instead. This
   is a gap independent of the design.

## 5. Recommendation

Choose **a**: `ref(x).part(selector)` and `ref(x).parts(selector)`.

- **It removes the tokenizing.** The formula is one string; terms are found by substring,
  regex, or range, as Typst's `show "E"` and FFL's `$E$` do.
- **A name says the shape of its value.** `part` is one or an error, `parts` is a list.
  The prototype's `"X"` case shows why the singular must refuse.
- **Data flows as lists.** `parts` returns a plain array of refs, so `chart(...)`,
  `group`, `filter` and approach C's subject and `.label()` apply unchanged. No new flow
  step and no selection type.
- **Methods read caller state.** A part selector reads the mark's string or outline, which
  is the case API Design gives methods for.
- **One model beyond text.** Text characters, path length, data domain and named outline
  edges are all intervals of a parameter. The vocabulary for paths is `Place.along`'s, and
  the named edges already exist from #1205.
- **It returns geometry, which annotations need.** A style-only hook (the CSS family)
  cannot place an underline or end a leader. A ref can, and color comes from a subject
  or a composite over that same geometry.
- **Same shape in Python.** `ref("eq").parts(variance="Var(X)", mean=re.compile(...))`;
  selectors cross the bridge as strings, `{ regex, flags }`, ranges and records.

Candidate b (named runs) is worth doing later as rich text for styling, which the proposal's
decision 7 already asks about. Candidate c is a one-line `derive` over a, so it gets no
name.

## 6. Open decisions

1. `part` / `parts`, or another pair (`span`, `range`, `match`)? (`span` already means an extent in GoFish.)
2. Should `parts` take a record of named selectors (`{ variance: "Var(X)" }`), a list, or both?
3. What is a part ref's datum: `{ part, match, start, end }`, plus regex groups?
4. Should a part ref also carry the parent mark's datum, so a label can read both?
5. Does a regex cross the bridge as JS syntax, or as a subset both JS and Python `re` accept?
6. How is a part recolored: `mask` with the text as stencil (works today), a `fill` record on `text` keyed by part, or emphasis (#641)?
7. Should `mask` read its stencil's alpha instead of its luminance?
8. Should a line's part take a data interval (`{ x: [a, b] }`), a length fraction (`{ at }`), or both?
9. Is a text part's geometry its line box or its glyph ink?
10. Add named runs (candidate b) as rich text now, or with decision 7 of the proposal?
11. Should `.label()` work on a line drawn over a selection (gap 6 above)?
