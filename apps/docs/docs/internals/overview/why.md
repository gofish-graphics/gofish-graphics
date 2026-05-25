---
title: Why GoFish
section: Overview
order: 5
status: stable
---

# Why GoFish

There are already a lot of charting libraries. Before any essay in this wiki
explains _how_ GoFish is built, it is worth saying — in plain terms — _why
it is being built at all_.

There are five reasons, and they stack.

## 1. The Cambrian explosion of grammars

The Grammar of Graphics opened a door. Once Wilkinson's idea — _a chart is a
declarative mapping from data onto visual marks_ — landed, the
visualization-research community ran with it. ggplot2, Vega, Vega-Lite,
Observable Plot, Atom, gemini, animated-Vega-Lite, productplots, Encodable,
Mascot, PICCL, Bluefish, ggdist, ggraph, plotnine, lets-plot, ggvis,
gganimate, ggforce, ggrepel, ggrastr — dozens upon dozens of grammars and
grammar extensions, each carving out some slice of the design space the GoG
opened up. That is a sign of health. It is also a sign that the door is not
yet through. None of these systems is the language the others are extensions
_of_; they are parallel attempts.

The functional-programming community went through the same thing in the
mid-1980s, and it is the closest precedent for what GoFish is attempting.
Hudak, Hughes, Peyton Jones, and Wadler's [_A History of Haskell: Being Lazy
With Class_](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/history.pdf)
(HOPL-III, 2007) opens at a 1987 conference meeting "to discuss an
unfortunate situation in the functional programming community: there had
come into being more than a dozen non-strict, purely functional programming
languages, all similar in expressive power and semantic underpinnings."
Their phrase for it is _the Tower of Babel_: "It was clear they were all
roughly the same, bar the syntax, and we started to wonder why we didn't
have a single, common language that we could all benefit from." The reasons
they gave for unifying — "faster communication of new ideas, a stable
foundation for real applications development, and a vehicle through which
others would be encouraged to use" the paradigm — are nearly verbatim what
charting needs.

Two honest qualifications. **First**, the Haskell process was a committee
with broad community buy-in; GoFish is not. There is no Vega-Lite ↔ ggplot2 ↔
Plot ↔ Bluefish working group. If a shared substrate emerges, it will look
much more like one project being adopted than several projects merging.
**Second**, GoFish does not yet have the user base to credibly claim
"unifying the community" as a present-day selling point. The Haskell
designers had a dozen lazy-FP communities to consolidate; GoFish currently
has its authors. The Cambrian-explosion framing is honest about the
landscape, not a claim that GoFish has already filled the niche.

But the pattern is real, and the lesson — that a small set of shared
primitives is worth more than a parallel reimplementation — holds even
without the committee. GoFish is an attempt to build the substrate the
parallel attempts could share: a single small core onto which "unit chart
grammar" and "animation grammar" and "diagram grammar" and "pictorial chart
grammar" desugar, instead of each one being rewritten from scratch against a
different backend. See [Other Grammars](/internals/overview/other-grammars)
for the comparative survey.

## 2. The community is, mostly, stagnating in place

Set the research grammars aside and look at what _users_ actually reach for. A
huge fraction of charts shipped in industry — dashboards, reports, journalism,
notebooks — are still bar, line, scatter, pie. Tools optimize for them.
Libraries lead with them. Tutorials feature them. The result is a self-
reinforcing local minimum: visualizations are simple, so the tools to make
them stay simple, so what people make stays simple. The interesting charts —
nested mosaics, sankey trees, flower charts, balloon plots, ridgelines,
stringlines, custom diagrams of every kind — exist mostly as one-off papers
or hand-tuned D3 code.

There is no _technical_ reason a Datawrapper-quality bar chart and a Nadieh
Bremer-quality custom diagram should require different tools. They are made
of the same primitives. A library that took the whole range seriously would
be a useful thing to have. GoFish is trying to be that.

## 3. Building a compiler in a green field is fun, and that matters

This one is harder to defend, but it is real. The visualization-tooling space
sits at the intersection of programming-language design, UI-framework
architecture, and graphic-design craft — three deep traditions that have
mostly not been brought to bear on each other (see [Design
Philosophy](/internals/design/philosophy)). A green-field project gets to
borrow from all three at once and see what shakes out.

Compiler-style architectures — a small typed core, multi-pass lowering,
hygienic scoping — are mature in the PL world and almost unused in the
charting world. There is something to be learned _just_ from porting that
discipline over. And the work is fun in a way that matters for sustained
output: the project compounds because the people working on it actually want
to keep working on it.

## 4. _Can_ different kinds of graphics be unified into a shared language?

This is the empirical bet, and the hardest of the four to make stick with
words. It is easy to _say_ "charts and diagrams and dashboards and infographics
are all data-driven graphic design and ought to share a substrate." A lot of
people have said it. The trouble is that nobody actually knows whether it is
true until somebody builds it.

A pie chart and a sankey diagram and a network graph and a custom annotated
illustration share a great deal at a high level: marks, positions, scales,
composition, layering, labels. They diverge sharply at a low level: a sankey
needs path routing, a network needs force-directed layout, an illustration
needs constraint-based snapping. The question is whether a single language
can carry the high-level commonalities cleanly _without_ collapsing into
either (a) a generic toolkit so abstract it does nothing in particular, or
(b) a federation of disjoint sub-DSLs glued together. The PL essay's [Turing
tar-pit](https://en.wikipedia.org/wiki/Turing_tarpit) warning is exactly
about this risk.

Nobody knows the answer. But you cannot find out from the outside. The
project is, in part, an honest attempt to know.

## 5. Loud errors instead of broken charts

The major declarative charting libraries — Vega-Lite, Observable Plot,
ggplot2 — bake a lot of data-type assumptions into their marks, scales, and
encodings. That is part of why they are concise. But when those assumptions
are _violated_, the chart silently breaks: the library renders _something_,
and that something is wrong in a way the user has to deduce from staring at
the output.

A Vega-Lite bar with `x: { field: "a", type: "quantitative" }` against a
field whose values are `"A"`, `"B"`, `"C"`, ... produces an axis with an
infinite extent and an empty plotting area. The console says something
about an infinite extent. It does not say _"`a` is categorical; you asked
for a quantitative scale; pick one."_

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "data": {
    "values": [
      { "a": "A", "b": 28 },
      { "a": "B", "b": 55 },
      { "a": "C", "b": 43 },
      { "a": "D", "b": 91 },
      { "a": "E", "b": 81 },
      { "a": "F", "b": 53 },
      { "a": "G", "b": 19 },
      { "a": "H", "b": 87 },
      { "a": "I", "b": 52 }
    ]
  },
  "mark": "bar",
  "encoding": {
    "x": { "field": "a", "type": "quantitative", "axis": { "labelAngle": 0 } },
    "y": { "field": "b", "type": "quantitative" }
  }
}
```

<VegaLiteEmbed
  caption='Output: an infinite-extent warning in the console and an empty plotting area.'
  :spec='{
    "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
    "data": {
      "values": [
        {"a": "A", "b": 28}, {"a": "B", "b": 55}, {"a": "C", "b": 43},
        {"a": "D", "b": 91}, {"a": "E", "b": 81}, {"a": "F", "b": 53},
        {"a": "G", "b": 19}, {"a": "H", "b": 87}, {"a": "I", "b": 52}
      ]
    },
    "mark": "bar",
    "encoding": {
      "x": {"field": "a", "type": "quantitative", "axis": {"labelAngle": 0}},
      "y": {"field": "b", "type": "quantitative"}
    }
  }'
/>

An Observable Plot `barX` with `x: "letter"` on the standard `alphabet`
dataset produces a single overlapping bar where 26 should be. `barX`
expects a quantitative x; the encoding is ordinal; no error is thrown.

```js
Plot.plot({
  marks: [
    Plot.barX(alphabet, { x: "letter", fillOpacity: 0.3, inset: 0.5 }),
    Plot.ruleX([0, 1]),
  ],
});
```

<ObservablePlotEmbed
  caption='Output: 26 bars collapse on top of each other; no error is thrown.'
  :build='(Plot, d3) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter, i) => ({letter, frequency: i + 1}));
    return Plot.plot({
      marks: [
        Plot.barX(alphabet, {x: "letter", fillOpacity: 0.3, inset: 0.5}),
        Plot.ruleX([0, 1])
      ]
    });
  }'
/>

Both libraries are powerful, both have well-thought-out scale-inference
logic, and both still fail this case. The pattern repeats across the
ecosystem: the inference is mostly silent when it succeeds, and silently
wrong when it fails. The user is expected to know enough about the
library's internal data-type model to reverse-engineer what went wrong from
the broken picture. This is the visualization-tooling equivalent of a
mid-2000s scripting language that returns `NaN` from `"5" + 3 / "tomato"`
and trusts you to notice.

It does not have to be this way. The right error from the right layer at
the right time is a solvable problem — it is what compilers _do_. GoFish
does not have a strong type system today; the frontend does not yet catch
these mistakes for you. What it _does_ have is an architecture set up to
catch them, organized around two deliberate moves:

- **Centralize the typing, don't scatter it.** Vega-Lite and Plot keep
  data-type assumptions inside each mark and each scale-inference
  routine — the rules live in many places at once, and silently disagree
  about edge cases. GoFish concentrates the type-relevant decisions
  along the single desugaring path between surface and core. There is
  one place a chart spec lands, one place a channel says what kind of
  value it expects, one place an underlying-space is resolved. Boundary
  checks at a single concentrated layer are tractable in a way that
  checks scattered across dozens of marks are not.
- **Make types explicit in the internals, not implicit.** A scale or an
  encoding kind is a real, named thing inside the engine — the
  channel taxonomy (`size`, `pos`, `color`, `raw`), the
  [underlying-space](/internals/core/underlying-space) kinds — not an
  ambient assumption inferred from data shape and recovered later from
  context. Things that are named can be checked; things that are
  implicit, by construction, cannot.

The work to come is filling in the rules — at the surface, where they can
name the violation in terms of the spec the user wrote, not at the
renderer after the chart is already broken. Loud failure is a deliberate
target, not an afterthought.

## And then: solving complex chart and diagram problems

The four motivations above are abstract. The concrete one is this: there are
real charts people want to make today that no library makes easy. Mosaics
nested inside facets. Ridgelines with annotations layered on. Custom
explanatory diagrams. Pictorial charts where the data drives the picture's
shape. Bespoke domain-specific visualizations — for biology, music, time
series, knowledge graphs — that need a few primitives the standard menus do
not offer.

GoFish exists to make those tractable. The aspirational endpoint is that a
chart you would today have to drop down to D3 to draw can be expressed in the
frontend; that a one-off domain visualization can be packaged as a custom mark
or operator and shared; and that the curated menus of bar, line, scatter, pie
sit on top of the same substrate, as one possible surface among many.

The rest of the wiki is how.
