---
title: "What GoFish Can Learn from Flint"
section: Speculative Notes
order: 63
status: speculative
---

# What GoFish can learn from Flint

**Reading guide.** Microsoft released [Flint](https://microsoft.github.io/flint-chart/)
([repo](https://github.com/microsoft/flint-chart)), "a visualization language that lets AI
agents reliably create expressive, good-looking charts from simple, human-editable chart
specs." This note is a survey of what is in it and which ideas are candidates for GoFish. It
is a design-space document, not a plan. Sections 2 and 3 cover the two headline systems, the
semantic type system and the automatic sizing rules. Section 4 asks which of those rules
survive translation into GoFish and which dissolve. Section 5 lists the rest of the system.
Section 6 collects open questions.

The short version:

- Flint's type system is already modular under the hood. The 46 named types are a
  vocabulary for annotators; the machinery is a flat record of five orthogonal traits per
  type, and the trait that decides sum vs. mean (`aggRole`) lines up almost exactly with
  GoFish's channel types and default aggregators. The traits are worth taking. The name
  catalog is optional surface.
- The layout rules are one closed-form pattern (pressure = demand / supply, stretch =
  min(β, pressure^α)) instantiated four times for four geometries. It is cheap to run.
  Most of its chart-type dispatch exists because Flint has no structural representation of
  a chart, so it hand-annotates facts that GoFish already represents (channel types,
  discrete vs. continuous space, measured content size). The one genuinely new capability
  is that Flint sizes the canvas from the content, where GoFish takes `w`/`h` as given.
- The repo contains no evidence that the pressure models produce better output than
  simpler heuristics. There are no comparisons, no baselines, and no perceptual tests of
  the model itself. The only study-backed piece is banking to 45°.

Sources: `docs/design-semantics.md`, `docs/design-stretch-model.md`, and
`docs/architecture.md` in the Flint repo, plus the implementation in
`packages/flint-js/src/core/` (`type-registry.ts`, `field-semantics.ts`, `decisions.ts`,
`compute-layout.ts`). Code-level claims below were checked against the source, not just the
docs; the docs run slightly ahead of the code in a few places, noted where relevant.

## 1 What Flint is

Flint is a compiler, not a renderer. The input is a small JSON spec:

```json
{
  "data": { "values": [{ "quarter": "Q1", "revenue": 1200 }] },
  "semantic_types": { "quarter": "Quarter", "revenue": "Revenue" },
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": { "x": { "field": "quarter" }, "y": { "field": "revenue" } },
    "baseSize": { "width": 480, "height": 320 }
  }
}
```

Four stages turn this into a native Vega-Lite, ECharts, or Chart.js spec: resolve field
semantics from the type annotations, resolve per-channel semantics, compute layout (the
sizing models in section 3), and instantiate a chart template. `chartType` must match one of
roughly 40 registered template names (Bar Chart, Bump Chart, Waterfall, Treemap, ...). Flint
is a closed catalog of chart types, not a grammar. That framing explains most of its design.
Because a template is an opaque skeleton of a native backend spec, every structural fact
about the chart (is the x axis banded, does the mark encode by length or position, how many
series are there) has to be declared on the template or recovered from the data, rather than
read off the chart's own structure.

The "AI era" pitch is mostly about closing the surface. An agent emits a ten-line spec over
closed vocabularies (chart type names, semantic type names, a fixed channel list), so whole
classes of errors cannot be written down at all. There is no repair loop because there is
little to repair. Section 5 returns to this.

## 2 The semantic type system

### 2.1 How it actually works

The docs present a three-tier hierarchy of named types: 6 families (T0: Temporal, Measure,
Discrete, Geographic, Categorical, Identifier), 17 categories (T1: Amount, Physical,
Proportion, SignedMeasure, DateGranule, ...), and 46 specific types (T2: Revenue, Price,
Temperature, Month, Rank, Sentiment, ...). Each T2 belongs to exactly one T1, each T1 to
exactly one T0. The tiers exist to manage annotation cost. An LLM can annotate a field
at any tier and the compiler degrades gracefully, so T0 is a 6-word vocabulary for cheap
bulk annotation and T2 is the full vocabulary for fields that drive the chart.

The tiers are the surface. The machinery is a single flat registry
(`core/type-registry.ts`): every type name maps to one record with five orthogonal trait
dimensions plus a zero-baseline classification:

| Trait          | Values                                                                | What reads it                                                                    |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `visEncodings` | preference-ordered subset of quantitative, ordinal, nominal, temporal | axis/scale type; ambiguous types (Score) disambiguate by data cardinality        |
| `aggRole`      | `additive`, `intensive`, `signed-additive`, `dimension`, `identifier` | default aggregate (sum / mean / none) and stackability                           |
| `domainShape`  | `open`, `bounded`, `fixed`, `cyclic`                                  | domain clamping, exact ticks, nice rounding, wrap-around                         |
| `diverging`    | `none`, `conditional`, `inherent`                                     | sequential vs. diverging palette and midpoint                                    |
| `formatClass`  | `currency`, `percent`, `unit-suffix`, `integer`, `decimal`, `plain`   | axis and tooltip formatting                                                      |
| `zeroBaseline` | `meaningful`, `arbitrary`, `contextual`, `none`                       | whether the axis must include zero (resolved jointly with the mark, section 3.4) |

Everything else is derived. The "measure types" set is literally a filter of the registry on
`aggRole ∈ {additive, intensive, signed-additive}`. Well-known orderings (month names, days
of week, compass points) live in hardcoded label sequences that are fuzzily matched against
the data. Units and currencies are not in the registry at all; they are per-field
annotations (`{ semanticType: "Revenue", unit: "EUR" }`), with lookup tables mapping unit
strings to format prefixes and diverging midpoints (°C → 0, °F → 32).

Three design decisions stand out:

- **A type exists only if it changes compilation.** The contributor doc requires that a new
  type "changes compilation behavior compared with its T1 parent," and there is a table of
  dropped types (Distance, Rate, Ratio, SKU, Email, ...) each pointing at the surviving type
  that compiles identically. `Revenue` and `Price` both survive because they differ in
  exactly one trait: `Revenue` is `additive` (a total, so sum it) and `Price` is `intensive`
  (a rate, so average it). Same for `Temperature` (intensive, arbitrary zero, conditionally
  diverging) vs. `Quantity` (additive, meaningful zero, never diverging).
- **No inference from field names.** There is no `inferSemanticType`. A field either gets an
  explicit annotation (from the LLM or the user) or falls back to `Unknown`, which compiles
  as a plain nominal dimension. Only the encoding type (Q/O/N/T) is ever inferred from data.
- **Graceful fallback, never a type error.** Unknown type strings, missing annotations, and
  contradictions all degrade. The one advisory gate is `autoAggregate`: when several rows
  collide on one position, the compiler injects the trait-derived aggregate (sum for
  Revenue, mean for Temperature), and a host can turn that injection off.

Cyclic domains are the thinnest part. `domainShape: 'cyclic'` is carried by Quarter, Month,
Week, Day, Hour, and Direction, but it is a bare flag. The actual cycle length (12, 7, 24, 8) lives implicitly in the hardcoded label sequences, and the doc's promised consequences
(cyclic palettes, polar hints, no extrapolation past the cycle) are mostly aspirational; what
the flag observably does today is select canonical sort order and block "nice" domain
extension.

### 2.2 Reading it from GoFish

The mapping to things we already have is close:

- `aggRole` is the type-level version of our rule that channel types are chosen by
  aggregation semantics (size channels aggregate by sum, position channels by mean). Flint
  confirms the alignment from the other direction: its `stackable` resolver returns `'sum'`
  exactly for additive types, `'normalize'` for Percentage, and `false` for everything
  intensive. In our vocabulary, stack's size channel wants an additive measure, and an
  intensive measure in a size channel is a type mismatch. Flint silently averages instead of
  erroring; per our measures-as-types position we would rather surface the mismatch.
- `zeroBaseline` × mark is our channel-type distinction wearing an annotation. Flint has to
  tag every template with a `markCognitiveChannel` (position, length, area, color) so the
  zero decision can ask "is this a length mark?" GoFish does not need the tag: whether a
  channel is size-typed or position-typed is already in the spec. The decision table itself
  (section 3.4) is still worth reading.
- `domainShape` overlaps with intrinsic domains we already handle case by case (shares are
  0 to 1 after `normalize`, correlation is −1 to 1) and `cyclic` is the data-side twin of
  our polar coordinate transforms: a cyclic measure is one whose natural coordinate is an
  angle. Flint never actually closes that loop; we could (a Month field routed through a
  polar transform should not need the user to say the domain wraps).
- The tier hierarchy is an annotation-cost knob for LLMs, not semantics. If we ever want it,
  it is a documentation and prompt-design concern for the Python/agent surface, not a core
  concern.

So "modularize the types," the reaction Flint's site provokes, is something Flint already
did internally. The transferable design is:

1. Traits are the semantics. A registry entry is a bag of five enums, and every downstream
   decision reads one trait, never the type name. (Flint slips a few times: Rank's axis
   reversal and Percentage's normalize-stacking are keyed on the name, and those are exactly
   the entries that would need a sixth and seventh trait to stay honest.)
2. Names are presets. `Revenue` is shorthand for a trait bundle, useful because annotators
   (human or LLM) think in nouns, and legal to skip entirely.
3. A name earns its place only by compiling differently.

Options for GoFish, in increasing order of commitment:

- **Option A: adopt the traits, not the names.** Extend measures/`field()` with the two
  traits we can act on today: aggregation role (drives default aggregator, stack legality,
  and a mismatch warning) and zero baseline (drives axis zero jointly with the channel
  type). This is small and fits the existing measure system.
- **Option B: option A plus domain shape.** `bounded`/`fixed` gives intrinsic domains
  (ratings, shares, correlations) a principled home instead of per-callsite domains, and
  `cyclic` gives polar a data-side trigger. Cycle length should be a value on the trait
  (`cyclic(12)`), not a bare flag; Flint's split between the flag and the hardcoded label
  sequences is a bug we should not copy.
- **Option C: options A/B plus a named-preset vocabulary at the Python/agent surface.**
  Pure sugar over the traits, probably valuable only when we care about LLM authoring
  cost. Flint's anti-proliferation rule and its dropped-types table are the discipline to
  copy if we ever do this.
- **Format classes** (currency prefixes, unit suffixes, sign-always formats) are real user
  value but orthogonal to layout; they slot into whatever labeling/formatting story we
  pursue and need no decision now.

## 3 The layout rules

### 3.1 One pattern, four geometries

The "Auto Layout Algorithm" doc describes four models. They are one idea:

```
pressure = demand / supply          (needed space ÷ base space, both in px)
stretch  = min(β, pressure^α)       (grow the canvas, capped)
output   = clamp(base × stretch)
```

with per-geometry definitions of demand:

| Model          | Geometry       | Demand                                                       | Charts                           |
| -------------- | -------------- | ------------------------------------------------------------ | -------------------------------- |
| Elastic budget | 1D banded axis | N items × natural step (≈20 px)                              | bar, histogram, heatmap, boxplot |
| Gas pressure   | 2D point cloud | unique ~1 px positions × mark footprint σ                    | scatter, line, area              |
| Circumference  | closed loop    | N_eff items × min arc (45 px) vs. 2πr                        | pie, rose, radar, sunburst       |
| Area           | 2D filled      | N_eff × min width vs. base width, split with a bias toward x | treemap                          |

A "banded" axis is one that allocates a fixed-width slot per data position (categories on a
bar chart); a non-banded axis places marks at data-determined positions on a continuous
scale. "Gas" is only the continuous-axis case; the branding oversells how different the four
models are.

Details worth knowing before judging it:

- **Everything is closed form.** There is no solver loop anywhere. Each model is one
  algebraic formula evaluated once per axis, roughly O(N) with an O(N log N) sort in the
  banking step. The "might be expensive" worry does not survive contact with the code.
- **It sizes the canvas, not the content.** `baseSize` is a soft target and `canvasSize` is
  a hard ceiling; the model decides how far past the target to grow (default cap 1.5×)
  before compressing content and eventually truncating it. This outer-sizing question is one
  GoFish currently does not ask at all: `gofish(root, { w, h })` takes the answer as given.
- **Three regimes.** Fits (no change), elastic (grow by pressure^α), overflow (compress to
  a per-mark minimum step, then drop items beyond `floor(maxLength / minStep)` and attach a
  warning). The overflow case makes truncation a first-class, warned-about outcome instead
  of an accident.
- **Effective item count.** For value-proportional charts (pie, treemap), demand uses
  N_eff = Σvᵢ / min(vᵢ), capped at 100: how many copies of the smallest slice would fill the
  space. This is the right crowding statistic for value-proportional marks and is directly
  relevant to our mosaic work, where the smallest cell is likewise the legibility
  bottleneck.
- **Facets reuse the same formula with gentler constants.** Facet count stretches the canvas
  with α = 0.3 (vs. 0.5 for items) and per-mark minimums loosen under faceting (a bar may
  shrink to 3 px in a facet vs. 6 px standalone), justified in the doc by the claim that
  facet readers compare patterns across panels rather than reading single values. There is
  also a wrap rule that avoids a last row with exactly one panel.
- **Aspect ratio comes from a blend of two signals.** Density (the per-axis stretches the
  gas model produced) and banking (next section), combined as a 50/50 geometric mean in log
  space, then fitted back into the budget preserving the blended ratio. A separate rule caps
  bar elongation: if canvas height exceeds 10× the band step, shrink the height toward
  10 × step by the same log-space blend.

### 3.2 The study-backed part: banking to 45°

The "line slope thing" is banking to 45°, from Cleveland (_Visualizing Data_, 1993): a line
chart reads best when the median absolute slope of its segments is near 45°, so the aspect
ratio should be chosen to make that happen. Flint implements the multiscale variant from
Heer & Agrawala, "Multi-Scale Banking to 45°" (InfoVis 2006): smooth each series with box
filters at window sizes 2^k, take the median absolute slope at each scale in
domain-normalized coordinates, combine the per-scale medians by geometric mean, clamp to
[0.5, 3.0]. Connected marks get a landscape floor (never below 1:1, because typical time
series have a gentle-slope majority that would otherwise vote for portrait). Scatter plots
use a dampened standard-deviation ratio instead. Banking is skipped when data covers less
than 20% of either domain, since slopes from a small cluster are noise.

Two properties make this the most portable rule in the repo: it needs only data (slopes are
computed in normalized coordinates, no pixels), and it is the only rule with actual
perceptual research behind it. The only other citation in the entire layout system is
Cleveland & McGill (1984), used once, to justify letting continuous axes stretch less than
banded ones (position encodings survive compression better than length encodings).

### 3.3 The evidence question

The user-facing claim is that these models keep charts readable as data grows. The repo
contains worked numeric examples showing the formulas are self-consistent, interactive
playground demos, and gallery fixtures for eyeballing, but no comparison of the pressure
models against any simpler baseline, no before/after study, and no perceptual evaluation.
All the constants (σ = 100 for a line chart's x axis vs. 30 for scatter, β = 1.5, arc
minimum 45 px, treemap x-bias 1.5, band ratio cap 10, rotation thresholds at 10 and 16 px)
are uncited hand tuning. The doc itself flags per-mark spring stiffness as "a design
aspiration, not yet individually parameterized in the code" and the treemap model as
implemented inline in one template rather than in the shared core.

So the honest summary of the gas model is a defensible smoothing function (grow
sublinearly with crowding, cap the growth, then degrade) wrapped in physics vocabulary,
with tuned constants and no evaluation. The pattern is worth more than the parameters.

## 4 Which rules survive translation into GoFish

The instinct that some rules are "overfit to specific chart types" is correct about Flint
and mostly moot for GoFish, because the chart-type dispatch is Flint compensating for
information it never represents. Going down the worry list:

**Dispatch that dissolves structurally.** Flint's banded vs. non-banded classification is a
per-template flag plus heuristics; in GoFish it is the underlying space kind of the axis,
which we already infer (a `spread`/`stack` over a categorical field is banded; continuous
position scales are not). Flint's `markCognitiveChannel` annotation is our size/position
channel typing. Flint's per-chart σ and step constants exist because a template never
measures its content; GoFish's layout pass measures natural sizes, so demand is not a tuned
constant times a count, it is the actual measured natural extent of the content. In each
case we would implement the rule with strictly better inputs than Flint has.

**The bar-spread vs. facet-spread worry.** Flint's own answer is reassuring: facets do not
get a different mechanism, they get the same formula with a gentler exponent and looser
minimums. The distinction it keys on is not "bar chart vs. facet chart" but "is the repeated
unit a mark or a self-contained subchart," which in GoFish is a structural question about
the operator's children (does the child scope carry its own axes), not a new operator. If we
take anything here, it is one parameter that varies by child kind, not specialized
operators.

**Rules that need screen space.** Pressure is pixels over pixels, but the only pixel input
is the base size, which the user gives us anyway. Banking is fully resolution-independent.
The genuinely pixel-dependent rules are downstream cosmetics (label font size and rotation
from the resolved step size), which run after layout and are cheap. Nothing here requires
speculative screen-space measurement before layout.

**What is genuinely irreducible.** Less than it looks. The circumference model is "treat the
circumference as a bent axis," which in our terms is the elastic budget model applied in
arc-length polar coordinates; we already have that coordinate transform, so even the radial
case is plausibly the same rule behind a coord. The residue that is truly per-geometry is
small: the treemap area split and the choice of which count is the demand statistic
(items, unique positions, N_eff, leaves of the outer ring).

Ranked by how much I would take, as options rather than commitments:

1. **Elastic step sizing for banded axes, and the elongation cap.** This fills a real gap:
   GoFish currently has no answer when N × natural size exceeds the given width, and no
   opinion when 3 bars sit on a 300 px-tall canvas. In σ-model terms the axis length becomes
   a bounded monotone function of measured demand, which is exactly a "policy" in the
   spec/policy/schedule framing of the modular layout survey
   (`notes/design/modular-layout-algorithms.md`). The spec stays the same, and one small
   policy chooses the scale factor. Closed form, one exponent and one cap as parameters.
2. **Banking to 45° as an aspect-ratio policy.** Study-backed, cheap, data-only. It
   composes with the measure-driven equal-aspect rule from #582: equal aspect applies when
   x and y share a measure, banking applies when a connected mark spans unrelated measures.
   The log-space geometric-mean blend of two competing aspect signals is also a tidy
   arbitration idea on its own.
3. **The zero-baseline decision table.** Flint's `computeZeroDecision` cross-references the
   zero trait, the mark's encoding channel, and whether data sits far from zero, and
   returns not just a boolean but `forced` (structural, e.g. bar length) vs. `uncertain`
   (defensible either way, surface a toggle). We get its hardest input (length vs. position
   encoding) for free from channel types. The forced/uncertain split is a good shape for
   any defaulting we do.
4. **Overflow as a warned, ranked policy.** Flint's keep-or-drop ranking (never truncate
   connected marks, respect an explicit sort, aggregate before truncating, then first-N)
   with a warnings channel is a much better failure mode than either silent cropping or
   silent squashing. For us this is a data-side transform adjacent to `cut`/filtering, and
   contentious enough (it drops data by default) that warnings-only would be the right
   first step.
5. **N_eff = Σv / min(v) as the crowding statistic for value-proportional layouts.**
   Directly applicable to mosaic/marimekko legibility thresholds.

What I would not take: the gas-pressure constants and the series-count pressure mode (pure
tuning, and our measured demand replaces them), the per-mark stiffness table (aspirational
in Flint too), and the physics vocabulary (the mechanism is a clamped power law; calling it
pressure adds nothing we would want in our docs).

## 5 The rest of the system, briefly

Findings from the wider sweep, each one line plus why it is interesting here:

- **Reliability by closed surface.** Flint's agent story is that a small closed vocabulary
  makes most errors inexpressible, instead of validating and repairing an open grammar.
  GoFish sits at the opposite pole (an open grammar with validation). If we ever want an
  agent-facing surface, the design question is whether to expose a constrained subset
  rather than better repair.
- **A named view-transformation algebra.** Chart-to-chart edits are modeled as four
  generators over the encoding IR (transpose, permute channels, shift a channel to
  facet/color, switch to a sibling chart type), and the deduplicated orbit of a spec under
  these generators is the "alternate views" menu. Clean formalization, close to our
  categorical reading of the v3 API; worth a look for any future "suggest variants"
  feature.
- **Channel re-binding as minimum-cost assignment.** When the chart type changes, existing
  field→channel bindings are re-assigned by a small cost matrix (same role and channel: 0,
  same role different channel: 0.5, incompatible: ∞), and channels the user never bound are
  never auto-filled. A good shape for "switch operator, keep intent" interactions.
- **VLM as visual reviewer, in-repo.** A committed agent definition renders the gallery and
  asks a vision model to check a fixed defect list (blank chart, clipped marks, overlapping
  labels, broken scales), treated as review feedback rather than a gate. Same spirit as our
  `/iterate-example` loop; their fixed defect taxonomy is the part worth comparing.
- **Python port with byte-level parity.** Their Python package is a line-by-line port of the
  JS core, verified by byte-identical compiled specs on 658 of 659 gallery cases, which
  required reimplementing V8's exact date parsing in Python. A stricter analog of our
  pixel/DOM parity harness; the discipline transfers, the line-by-line porting strategy
  does not (our descriptor-table codegen is the better division of labor).
- **Two-knob sizing surface.** The entire agent-facing layout API is `baseSize` (target)
  and `canvasSize` (ceiling). Whatever we do about outer sizing, that is a good bar for
  how small the surface can be.

## 6 Open questions

1. **Where does outer sizing live in GoFish?** The pressure models answer a question our
   pipeline never asks: given content demand, how big should the chart be? Options include
   a policy layer above the σ solve that maps measured natural extent to a final `w`/`h`
   between a target and a ceiling, or treating the root dimensions as ordinary soft
   constraints. This interacts with the aspect-ratio reservations around #80 and the
   equal-aspect rule from #582.
2. **Should trait mismatches be errors?** Flint always degrades gracefully (sum an
   intensive measure and it silently averages instead). Our measures-as-types position says
   explicit annotation vs. inferred provenance disagreement is a type error. Adopting
   `aggRole` forces the choice: warn, error, or Flint-style silent correction.
3. **Is a named-type vocabulary worth having at the Python/agent boundary?** Traits are
   clearly good; names are annotator ergonomics. The cost is a catalog to curate (Flint's
   dropped-types table shows the curation is real work).
4. **Does banking belong in core or in a template/policy layer?** It is the one rule here
   that is both study-backed and data-only, but it only applies to connected marks over
   two continuous axes, which is a structural condition we can detect. Deciding where such
   conditional policies attach is the same question the modular-layout survey calls the
   policy layer, and this would be a concrete first tenant.

## Appendix: rule census

The full list of sizing/legibility rules found in Flint's layout core, classified by the
four screening questions (overlap with GoFish, research backing, specialization, inputs).
"px" means the rule needs pixel-space inputs beyond the user-given base size.

| Rule                           | Decides                            | Backed by                            | Specialized to                        | Inputs                            |
| ------------------------------ | ---------------------------------- | ------------------------------------ | ------------------------------------- | --------------------------------- |
| Banded vs. non-banded routing  | which model runs per axis          | —                                    | dissolves into space kinds            | encoding types + template flags   |
| Elastic budget (3 regimes)     | step size, axis length             | spring analogy only                  | any banded axis                       | N, base size                      |
| Item truncation + warning      | which categories survive           | —                                    | banded axes                           | N, min step                       |
| Grouped-bar unit               | group as compression unit          | —                                    | grouped bars                          | group cardinality                 |
| Per-mark step/min tables       | natural + minimum step             | —                                    | per mark type (mostly unwired)        | constants                         |
| Facet stretch α = 0.3          | canvas growth per panel count      | prose argument                       | any facet                             | F                                 |
| Facet shrink floors            | looser minimums in facets          | prose argument                       | per mark type                         | constants                         |
| Facet wrap + widow avoidance   | grid shape                         | —                                    | column facets                         | F, base size                      |
| Gas positional pressure        | continuous axis stretch            | —                                    | continuous axes                       | data, base size (~1 px bucketing) |
| Series-count pressure          | y stretch from series count        | —                                    | line/area family                      | series count                      |
| Positional ≥ series constraint | couple the two stretches           | —                                    | both-continuous charts                | above                             |
| β smaller for continuous       | stretch caps 1.5 vs. 2.0           | Cleveland & McGill 1984              | —                                     | constants                         |
| Banking AR (multiscale)        | ideal aspect ratio                 | Cleveland 1993; Heer & Agrawala 2006 | connected marks                       | data only                         |
| Scatter σ-ratio AR             | aspect for point clouds            | —                                    | scatter                               | data only                         |
| 20% coverage gate              | when banking is trusted            | —                                    | —                                     | data only                         |
| Gas × banking log blend        | final aspect ratio                 | —                                    | both-continuous charts                | above                             |
| Band elongation cap (10:1)     | shrink continuous dim              | —                                    | mixed banded/continuous               | step px                           |
| Circumference pressure         | radius                             | —                                    | radial (≈ banded in arc-length polar) | N_eff, base size                  |
| N_eff = Σv/min(v)              | crowding for proportional marks    | —                                    | pie/treemap/sunburst                  | data only                         |
| Treemap area + x-biased split  | canvas W×H                         | prose argument (horizontal labels)   | treemap                               | N_eff, base size                  |
| Label font/rotation thresholds | 0°/−45°/−90°, font size            | —                                    | banded axes                           | step px                           |
| Zero decision table            | include zero, forced vs. uncertain | —                                    | dissolves into channel types          | trait + mark + data               |
| Overflow keep-ranking          | which rows survive truncation      | —                                    | per chart family                      | data                              |

The pattern in the "backed by" column is the summary of section 3.3: two citations total,
both for aspect ratio and stretch caps, and everything else is engineering judgment.
