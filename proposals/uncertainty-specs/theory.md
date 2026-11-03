# Theory: continuity, symmetry and types for distribution-valued data (#980)

This page is research, not a plan. It reads the ggdibbler paper (Mason, Cook, Goodwin and
VanderPlas, "A Mathematical Framework and Software Implementation for Uncertainty
Visualisation", [arXiv:2606.24217](https://arxiv.org/abs/2606.24217), June 2026) against
GoFish's type system and the proposal in `proposal.md` and `types.md`. It asks three
questions. Can the paper's continuous mapping theorem become a type rule, and how does
it relate to Kindlmann and Scheidegger's algebraic design? How does the proposal answer
each hurdle in the paper's Section 4? Can types help render blur directly instead of by
sampling? It lays out options, marks the ones that feel strongest, and ends with open
questions.

Every claim about GoFish cites a file and line. Paths are relative to the repository
root. Code paths are on this branch, which is `main` after #1237.

## Summary

- **The continuous mapping theorem (CMT) and Kindlmann and Scheidegger (K–S) are two
  halves of one idea, but not the same idea.** K–S asks that the picture respect the
  data's symmetries, as an exact equation. CMT asks that the picture respect the data's
  topology, as a limit. Both say "the visual mapping is a structure-preserving map". In
  category theory terms, K–S says the encoding is a _natural transformation_ between two
  group actions, and CMT says the _probability functor_ sends continuous maps to
  continuous maps. These two phrasings are exact. Calling CMT "the K–S square for
  distributions" is only an analogy, because CMT is a continuity property and not a
  commuting square. One square does hold exactly: the point mass is natural, so the
  uncertain plot of a certain value is the certain plot.
- **Most of GoFish's existing checks are exact K–S instances.** The `CanAdd` check, the
  unit clash, the instant-has-no-sum rule and the proposed stack-by-draw error are each a
  hallucinator ruled out for a named data symmetry. Unit inference is Kennedy's units of
  measure, so its invariance is Kennedy's free theorem. Two checks fit only loosely, and
  one does not fit at all.
- **One new rule unifies the draw checks.** A placement of draws is meaningful when it is
  a function of the distribution. That holds when the picture does not change if you
  permute the draws or repeat every draw the same number of times. Stacking by draw fails
  the second test, a mean passes it, and an additive overlay passes both. This is the
  "colimit of finite samples" construction of Fritz and Perrone.
- **Section 4's hurdles mostly fall out of GoFish.** Nested positions, per-draw
  statistics and the single surface (no `*_sample` suffix) come from GoFish's existing
  nested splits. Stacking draws, quantiles on categories and domain mismatches need the
  proposal's new rules. Three things stay open: nonlinear scales under a density, color
  mixing under overlay, and two uncertain channels that want different placements.
- **Types can make the direct blur safe.** The direct render is the limit of the sampled
  render, so its kernel is the pushforward of the distribution through the whole visual
  mapping, not through the mark alone. A type that tracks whether that path is affine,
  monotone or discontinuous decides when a closed form exists. Two concrete problems in
  the proposal came out of this analysis. The `overlay` opacity clamp stops the picture
  from converging as the number of draws grows. And the proposal's two fades for the
  uncertain timeline converge to different pictures unless the blend mode is chosen to
  match.

## Terms

- **Metric space.** A set with a distance `d(a, b)` that is zero only for equal points,
  is symmetric, and obeys the triangle inequality.
- **Continuous map.** A map that sends points that are close enough to points that are
  as close as you like. **Lipschitz with constant L** means `d(f(a), f(b)) ≤ L·d(a, b)`,
  a quantitative form of continuity.
- **Convergence in distribution.** Random values `X_n` converge to `X` when every bounded
  continuous summary of `X_n` converges to the same summary of `X`. Shrinking a normal's
  standard deviation to 0 makes it converge to its mean.
- **Continuous mapping theorem (CMT).** If `X_n` converges to `X` and `f` is continuous
  (except on a set that `X` lands in with probability 0), then `f(X_n)` converges to
  `f(X)` (Mann and Wald 1943).
- **Pushforward.** For a map `f` and a distribution `μ`, `f_*μ` is the distribution of
  `f(X)` when `X` has distribution `μ`. It is what a scale does to a distribution
  (the paper's Definition 4.1).
- **Wasserstein distance `W1`.** The least average distance you must move probability
  mass to turn one distribution into another. It makes distributions a metric space.
- **Category, functor, natural transformation.** A category has objects and arrows that
  compose. A functor maps one category to another and keeps composition. A natural
  transformation `η` between two functors `F` and `G` is a family of arrows `η_x` such
  that every square `G(f) ∘ η_x = η_y ∘ F(f)` commutes.
- **Group action and equivariance.** A group acts on a set when each group element moves
  the points, and composing elements composes moves. A map `v` is _equivariant_ when
  moving then mapping equals mapping then moving.
- **Probability monad (Giry monad).** The functor `P` that sends a space to the space of
  distributions on it and a map `f` to `f_*`, with `pure(x) = δ_x` (all mass at `x`) and
  `bind` (draw, then draw again). Giry (1982) defined it on measurable spaces. Fritz and
  Perrone (2019) defined the **Kantorovich monad** on complete metric spaces with
  Lipschitz-1 maps, using `W1`.
- **Homomorphism.** A map that keeps an operation: `e(a + b) = e(a) ⊕ e(b)`.
- **Parametricity and free theorems.** A function that is generic in a type cannot look
  inside values of that type, so it obeys laws for free (Reynolds 1983, Wadler 1989).
- **Sensitivity type.** A type that records how much a function can amplify a change in
  its input, as in Fuzz (Reed and Pierce 2010).
- **Refinement type.** A type with a logical predicate attached, such as "an affine map"
  (Liquid types: Rondon, Kawaguchi and Jhala 2008).
- **Effect system.** A type system that records what a computation does besides return a
  value, such as drawing random numbers (Lucassen and Gifford 1988).

## Which formal tool fits which question

| Question                                                  | Formal tool                                                                                          | Fit               | GoFish hook                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| Changing a column's unit must not change the picture      | Units of measure and relational parametricity (Kennedy 1997), free theorems (Wadler 1989)            | exact             | unit variables that unify, `packages/gofish-graphics/src/ast/measure.ts:9`      |
| A data symmetry must match a visual symmetry              | Equivariance as a natural transformation between group actions (Mac Lane; Aizenman et al. 2026)      | exact             | the squares in the table under Q1                                               |
| A channel needs a trait, and the encoding must keep it    | Typeclass (trait) laws and homomorphisms (Mackinlay 1986; Bartonicek et al. 2025)                    | exact for laws    | `checkSummable`, `measure.ts:142`                                               |
| Which summaries a `Dist<T>` allows                        | Stevens' permissible statistics: a summary must commute with the scale's transformation group        | exact             | rule 5, `proposal.md:1187`                                                      |
| A scale acting on a distribution                          | Functor action: pushforward                                                                          | exact             | the σ-affine map, `apps/docs/docs/internals/core/underlying-space.md:110`       |
| Visual convergence as uncertainty shrinks                 | CMT; Lipschitz maps and `W1` (Kantorovich monad; continuity analysis, Chaudhuri et al. 2010)         | exact             | a continuity class per operator (option 1B below)                               |
| How far the picture moves per unit of uncertainty         | Sensitivity types (Fuzz: Reed and Pierce 2010; DFuzz: Gaboardi et al. 2013)                          | exact, heavy      | the scale factor σ of each scope                                                |
| Statistics must run once per draw (paper Figure 6)        | Monad laws: `fmap S` then flatten, versus flatten then `S`                                           | exact             | per-leaf marks, `packages/gofish-graphics/src/ast/marks/createOperator.ts:1218` |
| A placement of draws must depend only on the distribution | Colimit of finite samples (Fritz and Perrone 2019); exchangeability                                  | exact             | rules 2 and 3, `proposal.md:1163` and `:1171`                                   |
| Shared versus independent draws                           | Markov categories (Fritz 2020); TFP's batch and event shape                                          | exact             | `HasDraws { joint }`, `types.md:138`                                            |
| `sample` makes the chart random                           | Effect systems (Lucassen and Gifford 1988); effect handlers (Plotkin and Pretnar 2009)               | exact, optional   | `sample({ seed })`, `types.md:212`                                              |
| The overlay limit is the expected image                   | Algebras of the Kantorovich monad are convex sets; the barycenter map                                | exact if additive | `overlay`, `proposal.md:385`                                                    |
| Uncertainty too small to see                              | Just noticeable difference; not a metric (paper Proposition 3.1); perceptual kernels (Demiralp 2014) | empirical         | a lint from σ·sd in pixels                                                      |
| Testing that a square commutes on real charts             | Metamorphic testing (McNutt, Kindlmann and Correll 2020)                                             | exact as a method | `pnpm capture-diff`                                                             |

## Q1. The continuous mapping theorem and algebraic visualization design

### 1.1 What the paper's theorem says, exactly

The paper writes a plot as `V = A ∘ O ∘ G ∘ S ∘ M` (Definition 3.2): scales `M`, statistic
`S`, geometry `G` (a geometry `E` after a position adjustment `P`), coordinates `O`, and
aesthetics `A`. With random cells, `S` becomes "sample `t` draws, then `S`" and `P`
becomes a within-sample adjustment followed by a between-sample one (Definitions 4.2
to 4.4). The paper then asks that `V` obey the CMT (Theorem 3.1). The metric on pictures is
pulled back through `A`, so `A` is an isometry by definition (Section 3.2.1). The real
content is that `O ∘ G ∘ S ∘ M` is continuous.

Two different convergences hide under the one name "visual convergence".

1. **Shrinking uncertainty.** As a cell's variance goes to 0, its distribution converges
   to its value, and the uncertain plot should converge to the plain plot (Section 3.3).
   This is the CMT. It needs `V` continuous at the limit point.
2. **Growing samples.** For a fixed distribution, `t` draws drawn on top of each other
   should look the same on every render once `t` is large (Section 5.3). This is a law of
   large numbers for the empirical distribution of the draws. It needs the way draws are
   placed and blended to have a limit as `t` grows.

GoFish should name and test these separately. The first constrains the visual mapping.
The second constrains `overlay`, `sample` and the axis extent, and Q3 shows that the
proposal currently fails it in two places.

### 1.2 Kindlmann and Scheidegger, and its relatives

Kindlmann and Scheidegger, "An Algebraic Process for Visualization Design", IEEE TVCG
20(12), 2014, write data `D`, representations `R`, and pictures `V`, with `r: D → R` and
`v: R → V`. Their equation (1) is a commuting square:

```
        r1        v
   D ──────▶ R ──────▶ V
   │                   │
 α │                   │ ω            v ∘ r2 ∘ α  =  ω ∘ v ∘ r1
   ▼                   ▼
   D ──────▶ R ──────▶ V
        r2        v
```

A data symmetry `α` must match a visual symmetry `ω`. Three principles follow.
**Representation Invariance**: `α = 1` must give `ω = 1`, and a failure is a
_hallucinator_. **Unambiguous Data Depiction**: `ω = 1` must give `α = 1`, and a failure
is a _confuser_. **Visual-Data Correspondence**: important `α` match obvious `ω`, and the
failures are _jumblers_ and _misleaders_.

The relatives, and how each relates:

- **Stevens (1946)**, "On the theory of scales of measurement", Science 103. A scale type
  is defined by its group of allowed transformations (permutations, monotone maps,
  affine maps, scalings). A statistic is _permissible_ when it commutes with that group.
  K–S's `α` are exactly these groups. Velleman and Wilkinson (1993, The American
  Statistician 47(1)) is the standard critique of using the four types as a fixed list,
  which matches GoFish's choice of composable traits over a fixed list
  (`apps/docs/docs/internals/design/distributions.md:45`).
- **Mackinlay (1986)**, "Automating the design of graphical presentations of relational
  information", ACM TOG 5(2). Expressiveness: the picture expresses all the facts in the
  data and only those. GoFish already cites this as its type principle
  (`apps/docs/docs/internals/design/api-design.md:72`).
- **Ziemkiewicz and Kosara (2009)**, "Embedding information visualization within visual
  representation". Readability: each visual element corresponds to a distinct data
  element.
- **Vickers, Faith and Rossiter (2013)**, "Understanding visualization: a formal approach
  using category theory and semiotics", IEEE TVCG 19(6).
- **Demiralp, Bernstein and Heer (2014)**, "Learning perceptual kernels for visualization
  design", IEEE TVCG 20(12). K–S call distance-based design "a quantitative
  specialization of our Correspondence Principle" and note that metrics cannot express
  everything, since partial orders are not symmetric. The CMT sits on this metric side.
- **McNutt and Kindlmann (2018)**, "Linting for visualization: towards a practical
  automated visualization guidance system", VisGuides workshop. A matplotlib linter whose
  rules come from algebraic design. Chen et al.'s VizLinter (IEEE TVCG 2022) is a later
  linter. Wongsuphasawat et al.'s CompassQL and Voyager (2016) encode expressiveness as
  rules for recommendation. I could not find a visualization-linting paper by Ostrander,
  so it is left out.
- **Correll, Li, Kindlmann and Scheidegger (2019)**, "Looks good to me: visualizations as
  sanity checks", IEEE TVCG 25(1). It tests whether data flaws (an `α` such as
  duplicated rows or missing values) produce visible changes (an `ω`). This is
  Unambiguity tested on people.
- **McNutt, Kindlmann and Correll (2020)**, "Surfacing visualization mirages", CHI. It uses
  metamorphic testing: perturb the data or the spec, and check the picture changes as it
  should. This is a test that a K–S square commutes.
- **Bartonicek, Urbanek and Murrell (2025)**, "No more, no less than sum of its parts",
  JCGS 34(3). A stacked plot is valid when its statistic is a monoid homomorphism.
- **Aizenman, Vejdemo-Johansson, Caswell and Grossberg (2026)**, "Mind your νs and Qs: a
  categorical framework for specifying visualization components", GUGOG-VIS workshop
  ([PDF](https://gugog-vis.github.io/2026/papers/pdf/aizenman-et-al.pdf)). Data are fiber
  bundles (a base space for connectivity and a fiber for field values), containers are
  sheaves, and an "Artist" is structure-preserving when it is a natural transformation:
  actions on data and graphic are equivariant, so changes to data and graphic commute
  (their Section 5). They split an artist into an encoder `ν` per field and a compositor
  `Q`. Their stated goal is K–S's three principles applied to library architecture rather
  than to design. Their example in Figure 5 is a Dirichlet distribution whose color map
  commutes with binning.

Aizenman et al. sit closest to this page. They say "natural transformation" where K–S
say "commuting diagram", and they apply it to components, as GoFish would. Two
differences matter for GoFish. They model connectivity (lines, surfaces) as topology on
the base space, which GoFish has as relational marks and `along`. And their fibers carry
field structure, which GoFish has as column traits. Neither paper treats distributions
as values, so the CMT is not in either.

### 1.3 Phrasing "a natural transformation between the morphisms", precisely

Josh's tentative phrasing was "some natural transformation between the morphisms, or some
equality between the typeclasses". Here are three precise versions, with a verdict on
each.

**Phrasing A: the encoding is natural with respect to the symmetries (exact).** A group
`G` is a category with one object, whose arrows are the group elements. A group acting on
a set is a functor from that category to sets. Take the group of data symmetries `G`
acting on `D`, and let it act on `V` through a matching `φ: G → G_V` that sends each `α`
to its `ω`. Then K–S's equation (1) with `r1 = r2` is exactly the naturality square, and
the encoding `v ∘ r` is the natural transformation:

```
   D ──v──▶ V
   │        │
 α │        │ φ(α) = ω         v(α · x) = φ(α) · v(x)
   ▼        ▼
   D ──v──▶ V
```

So the natural transformation is not _between_ the morphisms. The morphisms are the
symmetries `α` and `ω`, and the encoding is the transformation. When the `α` and `ω` are
invertible and the solving pairs form a group, the three principles become statements
about `φ`:

- Invariance: `φ` is a function (each `α` has one `ω`, and `1` goes to `1`).
- Unambiguity: `φ` is injective (only `α = 1` goes to `ω = 1`).
- Correspondence: `φ` is an isomorphism onto the visual symmetries a viewer reads.

GoFish example, a centered Likert stack. The data symmetry is "reverse the order of the
levels about the midpoint" (agree swaps with disagree). The visual symmetry is "reflect
the bar about the center line". A stack centered on a `HasMidpoint` column
(`packages/gofish-graphics/src/ast/graphicalOperators/spread.tsx:246` to `:275`) is
equivariant for this pair. A stack from the left edge is not: reversing the levels moves
a different segment to the baseline, and no reflection matches it.

GoFish example, a draw spread. `spread({ by: "draw", dir: "x" })` is equivariant for the
pair "permute the draws" and "permute the thin bars". It is not invariant: the picture
moves. Section 1.5 shows that this matters, and when sorting the draws fixes it.

**Phrasing B: the encoding is a homomorphism for each trait the channel needs (exact
for the algebra, with one correction).** A trait is a set of operations with laws. A
channel needs some traits, and the data type provides some. The precise statement is
not "equality between the typeclasses". It is two inclusions and a law:

- _Only the facts_ (no misleader): every trait the channel's reading implies is a trait
  the data type has. A bar length is read as a ratio, so it needs `CanAdd` and an origin.
  A temperature has neither, so a bar of temperatures is a misleader.
- _All the facts_ (no jumbler): every trait the task needs from the data is kept by the
  channel. An ordered type drawn with unordered hues loses its order.
- _The law_: for each kept trait, the encoding is a homomorphism. For `CanAdd`, that is
  `e(a + b) = e(a) ⊕ e(b)` and `e(0) = 0`.

The first two are what a type checker does: instance resolution. The third is a law that
a type checker cannot see. It is checked by construction (GoFish's stack really adds
lengths) or by property tests. Each trait also determines its group of symmetries, the
maps that keep its operations. That is the bridge between Phrasing B and Phrasing A, and it
is Stevens' idea: a trait set and its symmetry group are two descriptions of one thing.
So "equality between the typeclasses up to the encoding" is Mackinlay's expressiveness,
and it is the same as K–S Correspondence restricted to the symmetries those traits
generate.

GoFish example, stack as a monoid homomorphism. `stack` lays its parts end to end and
adds their amounts (`packages/gofish-graphics/src/ast/constraints/distribute.ts:340`
to `:361`). It is a homomorphism from the data's `(+, 0)` to the picture's
"concatenate lengths, empty length". `checkSummable` refuses the stack when the unit has
no `CanAdd` (`packages/gofish-graphics/src/ast/measure.ts:142` to `:162`), which is the
"only the facts" inclusion.

**Phrasing C: the CMT is the same square for the probability functor (partly exact,
partly analogy).** Three statements are exact.

1. _Functoriality._ The uncertain version of a visual mapping `v` is `P(v) = v_*`. Because
   `P` is a functor, `(w ∘ v)_* = w_* ∘ v_*`. So the paper's
   `V = A ∘ O ∘ G* ∘ S* ∘ M` acting on a random matrix is the pushforward through each
   stage in turn, which is the paper's "change of variable" for scales (Definition 4.1)
   applied to every stage.
2. _The point mass is natural._ `v_*(δ_x) = δ_{v(x)}`. This is a commuting square:

   ```
     D ──v──▶ V
     │        │
   δ │        │ δ          the uncertain plot of a certain value is the certain plot
     ▼        ▼
    P D ─v_*─▶ P V
   ```

   This is the paper's remark that deterministic graphics are the special case where
   every cell is degenerate (Section 4.5). In GoFish it is `pure` in the proposal: "a
   plain value is a Dist with all its mass at one point" (`proposal.md:362` to `:364`).

3. _Equivariance lifts._ If `v` is natural for a symmetry (Phrasing A), then `v_*` is
   natural for the same symmetry, because `P` maps commuting squares to commuting
   squares. So every hallucinator GoFish rules out for plain data is ruled out for
   distribution data with no extra check. The design note says this informally ("the unit
   rules from #773 carry over without change",
   `apps/docs/docs/internals/design/distributions.md:283` to `:288`). This is the reason
   it is true.

The CMT itself is not a commuting square. It says `P` sends continuous maps to maps that
are continuous for convergence in distribution. Its quantitative form is exact and
useful: if `v` is `L`-Lipschitz then `W1(v_*μ, v_*ν) ≤ L · W1(μ, ν)`. In the Kantorovich
monad this is just the statement that `P` is a functor on metric spaces with Lipschitz
maps. For a normal cell with standard deviation `s` around value `x`,
`W1(N(x, s²), δ_x) = s·√(2/π)`. So a position channel whose scope maps `σ` pixels per
data unit (`apps/docs/docs/internals/core/underlying-space.md:110` to `:115`) moves its
mark by at most `σ · s · √(2/π)` pixels on average. That is a rate of visual
convergence, and GoFish already knows `σ` after layout.

**Verdict.** Say it this way: _the encoding is a natural transformation between the
data's symmetry action and the picture's symmetry action (K–S, and Aizenman et al.'s
Artists). Its uncertain version is the pushforward, which keeps that naturality because
the probability monad is a functor, keeps the point-mass square because the unit of the
monad is natural, and keeps convergence because the functor preserves continuous maps
(Mann and Wald) and Lipschitz maps (Kantorovich)._ Phrasing A and the three numbered
statements are exact. "CMT is naturality" is an analogy.

### 1.4 Where the analogy between CMT and K–S breaks

- **A constant picture satisfies the CMT.** The CMT forbids jumps. It does not ask that
  any change be visible. A plot of only the means converges perfectly as the variance
  shrinks. The paper bans point estimates for this reason (Section 4.2.2), but that ban
  is K–S Unambiguity, not the CMT: the data symmetry "change the variance, keep the mean"
  has `ω = 1`, so it is a confuser. The paper says so in words: "Theorem 3.1 would be
  trivially fulfilled by visualisations of the mean".
- **K–S symmetries are exact and global. CMT perturbations are small and local.** A small
  perturbation is not a symmetry, and small perturbations do not form a group.
- **Discontinuity can be the point.** A hypothetical outcome plot (HOP) that sorts bars by
  each draw's value changes order when two values cross. That map is discontinuous, yet
  Hullman, Resnick and Adar (2015) show it helps people judge how reliable a ranking is.
  So "continuous" cannot be a hard rule for every channel. It is a rule for the
  channels whose reading is a magnitude.
- **The human metric is not a metric.** The paper proves that perception with a just
  noticeable difference breaks the triangle inequality (Proposition 3.1). So the CMT
  holds in pixel space, and the human side needs a separate threshold, as in Q3's
  invisibility lint.

### 1.5 Can the CMT condition be a type rule?

**Option 1A: a `Continuous` trait on each encoding.** Mark each operator and field op
with whether it is continuous from the data metric to pixels. Every map out of a discrete
space is continuous, so categorical keys pass for free. The trouble is that almost
nothing interesting is fully continuous. Bins, thresholded color palettes, collision
layouts and sorting by value all jump somewhere. A binary trait would reject them all.

**Option 1B: three continuity classes, plus a runtime check at the limit point
(strongest).** The CMT needs continuity only where the limit lands with positive
probability (Mann and Wald). So use three classes:

| Class              | Meaning                                                       | GoFish examples                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lipschitz(L)`     | continuous with a known rate                                  | a position or size channel in a σ-scope; `stack` of free parts (1 per part); `.mean()` (`1/n` per row); sorting the draws themselves by value (the sorted list is Lipschitz-1)                                                                                                                                                                        |
| `continuousExcept` | jumps only on a named thin set                                | `.bin()` and `Bin.step` (at cell edges, `packages/gofish-graphics/src/ast/fieldExpr.ts:77` to `:83`); a thresholded color palette; `sort({ by })` of category labels by a value (where two values tie, `fieldExpr.ts:64` to `:74`); `filter` on a value; `niceContinuous` (at a nice tick, `packages/gofish-graphics/src/ast/underlyingSpace.ts:360`) |
| `discontinuous`    | jumps on a set of positive size, or depends on the draw count | `Overlap.separate()` collision layout (`packages/gofish-graphics/src/families/overlap.ts:50`); `stack` by draw; an axis extent taken from the largest draw                                                                                                                                                                                            |

The static check composes classes along the flow. A `continuousExcept` step then needs a
runtime check: is the limit point on the thin set? For shrinking uncertainty the limit
is the data value, so the check is "does a value sit exactly on a bin edge or a nice
tick". This matters in practice. Rounded data often sits on bin edges, and a percentage
of exactly 100 sits on a nice tick. Then the uncertain plot does not converge: draws just
above 100 make `niceContinuous` jump the axis to 120, and the whole chart rescales.

This is Chaudhuri, Gulwani and Lublinerman's continuity analysis ("Continuity analysis
of programs", POPL 2010) applied to a chart: data types get metrics, branches are where
continuity can fail, and the checker proves continuity piece by piece.

**Option 1C: sensitivity types in the style of Fuzz.** Reed and Pierce ("Distance makes
the types grow stronger", ICFP 2010) type a function as `!k τ ⊸ σ`, meaning it amplifies
changes by at most `k`. DFuzz (Gaboardi et al., POPL 2013) lets `k` depend on sizes such as
`n`. This gives exact numbers, and one GoFish rule falls out of it: a fold over the draw
key must have sensitivity that does not grow with `n`. A mean has sensitivity `1/n` per
draw and `1` in total. A sum has `1` per draw and `n` in total, so the stacked total of `n`
draws moves `n` times as far as one draw. That is rule 3's reason
(`proposal.md:1171` to `:1176`) in sensitivity terms. The cost is high: a full
sensitivity type system is far heavier than GoFish needs. A table of constants per
operator, as in 1B's first row, gets most of the value.

**Option 1D: draws as a monad, the flow after `sample` as a Kleisli arrow.** This explains
the paper's Figure 6 exactly. `sample` lifts a table into the monad. A statistic `S` must
run inside, as `fmap S`, and only then are the draws flattened. Running `S` on the
flattened draws (`S ∘ join`) gives the paper's wrong single smooth with too-small error.
The two agree only when `S` is a homomorphism of the flattening, which for counts and sums
means the answer grows with `n`. GoFish already gets `fmap S` from its nested splits: a
mark or operator after a split runs once per leaf
(`packages/gofish-graphics/src/ast/marks/createOperator.ts:1218` and `:1284` to `:1286`).
So the draw key in a split is exactly `fmap`. The typing rule to add is "after `sample`,
the draw key must be in the split before any statistic that is not draw-invariant".

**Option 1E: sampling as an effect.** `sample` makes everything after it random. An effect
system would mark the flow as random until a seed handles the effect, the way an effect
handler interprets an effect (Plotkin and Pretnar 2009; for probability, Ścibior,
Ghahramani and Gordon, "Practical probabilistic programming with monads", Haskell
Symposium 2015). The proposal already gives `sample` a seed shared by JS and Python
(`types.md:212` to `:215`). The effect view adds one useful rule: a chart whose random
effect is not handled by a seed is not a pure function of its data, so `capture-diff`
and the parity tests must refuse it. This is cheap to add as a flag and does not need a
real effect system.

### 1.6 The placement test: is a placement of draws a function of the distribution?

This test unifies the draw rules, and it follows from Fritz and Perrone ("A probability
monad as the colimit of spaces of finite samples", TAC 34(7), 2019). They build the
space of distributions from samples of size `n`, glued along two moves: permuting a sample,
and repeating every draw the same number of times. Both moves keep the empirical
distribution. So a picture made from draws is well defined on distributions exactly when
it does not change under these two moves (in the limit, for the second).

| Placement of `n` draws                              | Permute the draws   | Repeat every draw k times            | Verdict                                   |
| --------------------------------------------------- | ------------------- | ------------------------------------ | ----------------------------------------- |
| a mean or quantile over the draws                   | same                | same                                 | a function of the distribution            |
| `overlay`, additive blend at weight `1/n`           | same                | same                                 | exactly a function of the distribution    |
| `overlay`, "over" blend at opacity `1/n`, one color | same                | same in the limit                    | converges to a fixed tone map (Q3)        |
| `overlay` with the `0.05` floor                     | same                | changes: darkens without bound       | does not converge in `n` (Q3)             |
| `spread` by draw, draws in sampled order            | slots permute       | slots split                          | a random picture whose law is fixed       |
| `spread` by draw, draws sorted by value             | same                | same in the limit (a quantile curve) | a function of the distribution            |
| `time.sequence` by draw (HOP)                       | frame order changes | duration changes                     | fixed only as "a random frame"            |
| `stack` by draw                                     | same                | total grows `k` times                | not a function of the distribution: error |
| a line joining draw `i` across independent cells    | changes             | changes                              | not a function of the distribution: error |

The last row needs one more idea. For independent cells, the law of the whole table of
draws does not change if you permute the draw index separately in each cell. For shared
(joint) draws, only permuting whole draws keeps it. A line that joins draw `i` across
cells is invariant under the second group and not the first. So rule 4
(`proposal.md:1178` to `:1185`) is the statement "a connecting mark needs the symmetry
group of the draw key to be the joint one". This is the same split as TFP's batch shape
and event shape, and Fritz's Markov categories ("A synthetic approach to Markov kernels,
conditional independence and theorems on sufficient statistics", Advances in
Mathematics 370, 2020) give the general theory of which draws are independent.

A pseudo-type rule:

```
  key k has HasDraws { joint }          fold f over k
  ─────────────────────────────────────────────────────────── (draw-fold)
  f is allowed  iff  f(permute(xs)) = f(xs)  and  f(repeat(xs, m)) = f(xs)
  sum, count, stack-by-k         →  error (grows with m)
  mean, quantile, mixture, overlay(1/n, additive)  →  ok
```

This also shows something the channel kinds already encode. A `size` channel sums, so it
keeps the "split one amount into parts" move. A `pos` channel averages, so it keeps the
"repeat every row" move (`packages/gofish-ir/src/frontend/descriptors.ts:41` to `:48`;
`packages/gofish-graphics/src/ast/channels.ts:289` to `:299`). The proposal's new `dist`
channel folds into a mixture, which also keeps "repeat every row". So the channel kinds are
grouped by which re-representations of a group of rows they ignore, and draws provide only
the `pos`-like moves.

One silent case is not caught by any of the five proposed rules. After `sample`, if a
split puts several draws in one leaf and a `pos` channel folds them, the channel takes
their mean. That is legal and it converges, but it erases the uncertainty. In K–S terms
it is a confuser. A sixth check could warn: "`circle` cy averages 20 draws of `value`; the
draws are not shown. Add `spread({ by: "draw" })` or `overlay({ by: "draw" })`, or write
`value.mean()` if a point estimate is what you want."

```js
const value = dist.normal({ mean: "mean", sd: "se" });

// Silent today: each category's leaf holds 20 draws, and cy averages them.
// The chart converges, but it shows only the means (a confuser).
chart(estimates)
  .flow(spread({ by: "category", dir: "x" }), sample({ n: 20 }))
  .mark(circle({ cy: value, r: 3 }));

// What the warning would point to: place the draws.
chart(estimates)
  .flow(
    spread({ by: "category", dir: "x" }),
    sample({ n: 20 }),
    overlay({ by: "draw" })
  )
  .mark(circle({ cy: value, r: 3 }));
```

### 1.7 Existing GoFish checks as K–S squares

For each check: the data symmetry `α`, the visual symmetry `ω`, and how well it fits.

| Check                                                                                                                                                | `α` (data)                                                                  | `ω` (picture)                                                     | Fit                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CanAdd` at a sum (`checkSummable`, `measure.ts:142`; a size channel, `channels.ts:213`; `.sum()`, `fieldExpr.ts:460`; a stack, `distribute.ts:361`) | change of origin, such as Celsius to Kelvin (`α = 1`, a new representation) | should be `1`; a stack of `n` parts moves its top by `n · 273.15` | **Exact.** Summing is equivariant under scalings but not under shifts, so a type with no origin gives a hallucinator. The error text names this case: "temperatures, prices, rates" (`measure.ts:155` to `:160`).                                                                                                         |
| Instants have no sum, but their differences do (`INSTANT` and `DURATION`, `measure.ts:73` to `:86`; the advice, `measure.ts:147` to `:153`)          | move the epoch                                                              | a bar from the epoch changes length                               | **Exact.** This is Stevens' interval scale: differences are invariant under shifts, so "subtract a reference first" removes the hallucinator.                                                                                                                                                                             |
| Two units on one axis (`MeasureClash`, `measure.ts:531`; unit inference, `measure.ts:9` to `:17`)                                                    | rescale one column's unit (USD to cents) and not the other                  | one set of marks shrinks against the other                        | **Exact, and a free theorem.** Unit variables that unify are Kennedy's units of measure ("Relational parametricity and units of measure", POPL 1997). Kennedy shows unit-generic programs are invariant under scaling each unit. Sharing an axis forces two unit variables to be equal, which is what the clash enforces. |
| One unit, two definitions (`meetUnitClasses`, `measure.ts:196` to `:217`)                                                                            | none                                                                        | none                                                              | **Does not fit.** This is coherence (one trait instance per type), a well-formedness rule about the spec, not about pictures.                                                                                                                                                                                             |
| Centered stack over `HasMidpoint` (`spread.tsx:246` to `:275`), and its nonnegative-parts error (`distribute.ts:363` to `:371`)                      | reverse the level order about the midpoint                                  | reflect about the center line                                     | **Exact for the centered layout.** The error for a negative part is closer to Phrasing B: a centered stack's sides are magnitudes, so a negative one has no reading.                                                                                                                                                      |
| Channel kinds by aggregation (`descriptors.ts:41` to `:48`)                                                                                          | split one row into parts that sum (size); repeat a row (pos)                | the mark should not change                                        | **Exact,** as Section 1.6 shows. This is the cleanest instance: each kind is defined by which re-representation of a group it ignores.                                                                                                                                                                                    |
| Proposed: stack by a draw key (rule 2, `proposal.md:1163`) and a sum over draws (rule 3, `proposal.md:1171`)                                         | repeat every draw (`n` to `2n` draws of the same distribution)              | the stack doubles                                                 | **Exact.** A hallucinator under a change of sample size. This is a firmer reason than "the sum has no meaning".                                                                                                                                                                                                           |
| Proposed: a line over independent draws (rule 4, `proposal.md:1178`)                                                                                 | permute draw ids separately in each cell                                    | the lines rewire                                                  | **Exact,** with the joint-versus-independent groups of Section 1.6.                                                                                                                                                                                                                                                       |
| Proposed: summaries need a trait of `T` (rule 5, `proposal.md:1187`; `types.md:94` to `:101`)                                                        | relabel the categories (a symmetry of a nominal type)                       | the "median category" changes                                     | **Exact.** Stevens' permissible statistics.                                                                                                                                                                                                                                                                               |
| Proposed: a Dist in a one-value channel (rule 1, `proposal.md:1154`)                                                                                 | change the spread, keep the center                                          | none, if GoFish silently took the mean                            | **Loose.** The rule prevents a confuser by refusing to pick an implicit summary. It is a type error more than a symmetry.                                                                                                                                                                                                 |
| `HasVector` for stack (research only)                                                                                                                | reorder the parts                                                           | reorder the segments, top fixed                                   | **Loose.** `HasVector` is not in the code; a search of `packages/` finds no match. It comes from the October 2026 "space as traits" research. The rule is about the net amount, which is invariant under reordering, so it fits only for the top of the stack.                                                            |
| No check today: a nominal key with an ordered placement                                                                                              | permute the categories                                                      | permute the slots                                                 | **A gap.** A `by` key without `HasOrder` (`packages/gofish-graphics/src/ast/schema.ts:89` to `:94`) gets slots in order. The picture permutes when the labels do, which is fine, but a viewer may read the order. This would be a lint, not an error.                                                                     |

One more invariance came up while checking these. GoFish fits a σ-scope to the data, so
multiplying a column by `k` should leave the geometry unchanged and only relabel ticks.
That holds for powers of ten, but `niceContinuous` rounds the domain to nice ticks
(`underlyingSpace.ts:360`), and nice ticks do not scale by arbitrary factors. A tallest
bar of 1.37 gets a domain of about 1.4, and the same bar in units three times smaller,
4.11, gets about 4.5. So changing centimeters to inches changes the empty space above the
bars. It is a small hallucinator, and it is the kind of thing metamorphic testing finds:
render a story with one column multiplied by 2.54 and run `capture-diff`.

## Q2. Section 4's hurdles and the proposal

Classes: **(a)** falls out of GoFish's semantics today, **(b)** needs a new piece already
in the proposal, **(c)** needs a change to GoFish's core semantics, **(d)** unsolved.

| Hurdle (paper section)                                                                                       | How the proposal answers it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Class                                                 |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Scales must act on distributions by change of variable** (4.1, Definition 4.1)                             | Draws are plain rows (`types.md:150` to `:151`), so each draw goes through the σ-affine map like any value (`underlying-space.md:110`). A consumed density (`slab`) under an affine scale only rescales. Under a nonlinear scale or coordinate system (`Scale.probit`, `proposal.md:457`; `Coord.polar`), the density needs the Jacobian of the map, and the proposal does not say whether `slab` draws density per data unit or per pixel.                                                                                                                      | (a) for draws; (d) for densities under nonlinear maps |
| **The axis domain of a distribution** (4.1, the scale's domain)                                              | Open decision 8 (`proposal.md:1277`). Section 1.5 adds a constraint: the extent must be a continuous summary of the distribution, such as fixed quantiles. The largest of `n` normal draws grows like `s·√(2 ln n)`, so an extent from draws never converges as `n` grows.                                                                                                                                                                                                                                                                                       | (b), with a rule the proposal lacks                   |
| **A point estimate hides the uncertainty** (4.2.2)                                                           | GoFish allows summaries on purpose, since the signal marks need them, but only when written (`value.mean()`). Rule 1 refuses a Dist in a one-value channel with no lift (`proposal.md:1154`). The silent case of Section 1.6, a `pos` fold over several draws after `sample`, is not caught.                                                                                                                                                                                                                                                                     | (b), plus the new warning of 1.6                      |
| **Probability functions change the domain** (4.2.3: a density does not live on the data's scale)             | Signal marks take the whole Dist in the new `dist` channel kind (`types.md:178` to `:189`) and draw a new axis whose unit is a density or a share (`types.md:100`). Feeding a probability into a channel of the data's unit is then a unit clash, which GoFish raises today (`measure.ts:531`). So the mismatch the paper fears is a type error. GoFish does not have to ban densities, which is why it can keep both signal and noise.                                                                                                                          | (b) `dist` channel; the clash itself is (a)           |
| **Quantiles need an order, and fail for categories** (4.2.4)                                                 | Rule 5 (`proposal.md:1187`) and the summary table (`types.md:94` to `:101`): `quantile` needs `HasOrder` or an amount; `Dist<Category>` offers `prob(level)`.                                                                                                                                                                                                                                                                                                                                                                                                    | (b)                                                   |
| **Quantiles do not extend to several dimensions** (4.2.4, Figure 5)                                          | `dist.mvnormal` is read through its marginals `p.x` and `p.y` (`proposal.md:394` to `:395`), so a joint quantile is never formed. For whole curves, `Band.depth` (`proposal.md:1016` to `:1027`) orders curves from the center outward by band depth, which is one principled multivariate order the paper does not consider. Joint quantiles for points stay out.                                                                                                                                                                                               | (b) for curves; (d) for joint regions                 |
| **Samples only, with the draw id in the group** (4.2.5, Figure 6)                                            | `sample` adds a `draw` key (`proposal.md:391` to `:392`), and draws are placed by operators split by that key. Statistics then run per leaf, because marks and later steps run once per leaf of a split (`createOperator.ts:1218`). So the per-draw grouping is GoFish's existing nested split, Option 1D's `fmap`. The bootstrap example's `derive(fitLine)` "runs once per draw" for this reason (`proposal.md:888` to `:889`). GoFish keeps signal marks too, which the paper excludes for EDA; the two coexist because the type says which one a channel is. | (a)                                                   |
| **Flatten the draw array with equal weights** (4.3)                                                          | Draws are rows, so there is nothing to flatten (`types.md:150`). Unequal weights come from the column record's `weight` (`types.md:126` to `:141`).                                                                                                                                                                                                                                                                                                                                                                                                              | (a) for rows; (b) for weights                         |
| **Nested position adjustments, within and between draws** (Definition 4.3, 4.4)                              | A flow is already a nest of operators, so `spread(region)`, `sample`, `spread(draw)`, `stack(product)` is ggdibbler's `stack_dodge` (`proposal.md:766` to `:776`). x is `spread` and t is `time.sequence`, both today. z is the new `overlay`, which shares `time.sequence`'s superimposed layout (`proposal.md:497` to `:502`). The pixel map's subdivide is a single-key `table` in flow form, a small new piece.                                                                                                                                              | (a) for x and t; (b) `overlay`, single-key `table`    |
| **No stacking draws on the measured axis** (4.4, Figure 7)                                                   | Rule 2 (`proposal.md:1163` to `:1169`) and rule 3 (`proposal.md:1171`). Section 1.6 gives the reason as a symmetry: repeating every draw doubles the stack.                                                                                                                                                                                                                                                                                                                                                                                                      | (b)                                                   |
| **The best adjustment depends on the aesthetic; color with transparency leaves the palette** (4.4, Figure 8) | No answer. `overlay` over a `fill` that reads a Dist blends palette colors into colors that are not in the legend. A type knows both facts (the channel is color, the placement is `overlay`), so a lint could suggest `table` or `spread` by draw instead. See Q3 for the exact limit color.                                                                                                                                                                                                                                                                    | (d), easy lint                                        |
| **Several uncertain channels want different adjustments** (4.4, last paragraph)                              | `sample` draws every Dist channel of a drawn row together ("any Dist read on a drawn row reads that draw", `proposal.md:391` to `:392`), so there is one draw key and one placement for all of them. Placing position draws by overlay and color draws by subdivision would need two independent draw keys, one per channel. The proposal dropped `sample`'s `as` option (`proposal.md:389` to `:390`), which is what that would need.                                                                                                                           | (c): a draw key per channel, a product of samples     |
| **The `*_sample` suffix because ggplot2 is not polymorphic** (5.1)                                           | Not a hurdle in GoFish. The same mark reads a Dist once `sample` is in the flow, so there is one surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | (a)                                                   |
| **Independent cells only; joint draws are future work** (6)                                                  | `HasDraws { joint }` and the column record `draws` key (`types.md:126` to `:141`); `dist.mvnormal` and `dist.dirichlet`. Mixing a `dist.*` cell with a joint draws column is open decision 3.                                                                                                                                                                                                                                                                                                                                                                    | (b), with decision 3 open                             |
| **How many draws** (5.3, the `times` argument)                                                               | `sample({ n })` or `sample({ coverage })`. The design note's question 10 asks for a convergence test (`distributions.md:734`). Q3 below proposes one.                                                                                                                                                                                                                                                                                                                                                                                                            | (d)                                                   |

## Q3. Emergent blur versus direct blur

### 3.1 What the limit of an overlay is

Overlay `n` draws of a mark, each at weight `1/n`, with additive blending. Each pixel's
ink is then the average over draws of "does this draw cover the pixel". As `n` grows this
converges to the expected image, `E[render(V(X))]`. For each channel kind, that
expectation has a plain form.

- **Position (blur).** A dot whose center is uncertain. Rendering a dot at `p` is its
  footprint `K` shifted to `p`. So the expected image is `K` convolved with the
  pushforward of the distribution through the position map. If the map is affine with
  `σ` pixels per unit and the cell is `N(m, s²)`, the pushforward is `N(σm + o, (σs)²)`,
  and the blur is a Gaussian of standard deviation `σ·s` pixels.
- **Size (fuzziness).** A circle whose radius `R` is uncertain. A pixel at distance `d`
  from the center is covered when `R ≥ d`. So its expected ink is `P(R ≥ d)`, the
  complement of the radius's CDF. This is not a convolution. It is a radial gradient.
- **A box end.** A bar from 0 to `H`. A pixel at height `y` is covered when `H ≥ y`, so
  the fade is `P(H ≥ y)`. A bar from `start` to `end` gives `P(start ≤ t ≤ end)`, which is
  the formula in the proposal's uncertain timeline (`proposal.md:1093` to `:1097`).
- **Color.** A fill whose value is uncertain. The expected color is the mean of the
  palette colors in the blending space, weighted by probability. It is usually not a
  palette color, which is the paper's Figure 8 problem.

This explains the paper's ggdist "cliff" (Figure 11). The blur there is attached to the
dot's raw standard error. But a dotplot's dot position comes from binning and stacking,
and the pushforward of a normal through a bin and a stack count is discrete: a dot jumps
between stacks. No smooth kernel equals that. The blur was attached to the wrong map.

Two facts follow for the proposal.

1. **The `0.05` floor breaks convergence.** With "over" compositing of one color at
   opacity `a`, a pixel covered by `k` of the draws shows `1 − (1 − a)^k`. With `a = 1/n`
   and `k = p·n` this tends to `1 − e^(−p)`, a fixed function of the coverage probability
   `p`. So the over-composited overlay converges, to a tone map of `p`. With the proposal's
   floor (`max(min, w / Σw)`, `min = 0.05`, `proposal.md:385`), any `n` above 20 uses
   `a = 0.05`, and `1 − 0.95^(p·n)` tends to 1 for every `p > 0`. Every pixel any draw
   touches goes fully dark as `n` grows. The floor exists because 8-bit alpha cannot
   hold `1/n` for large `n`, so the fix is in the renderer (accumulate coverage at higher
   precision), not a floor.
2. **The proposal's two fades converge to different pictures.** The uncertain timeline
   gives a `gradient` with opacity `P(start ≤ t ≤ end)` and a noise form of 50 overlaid
   draws (`proposal.md:1093` to `:1106`). Over-composited, the noise form tends to
   `1 − e^(−P)`, not `P`. They agree only if overlay blends additively, for example by
   accumulating coverage in an SVG mask with `plus-lighter` blending and then filling
   through the mask, or if `gradient` applies the same tone map. The note in `noise.md`
   that compositing is order-dependent (`noise.md:23` to `:25`) is true across colors.
   For one color the result depends only on the count, so this limit is well defined.

There is a clean way to say which blend is right. Fritz and Perrone show that the algebras
of the Kantorovich monad are closed convex sets with affine maps, so "take the expected
value" is exactly an algebra map. Images under additive blending form such a convex set,
so the additive overlay's limit is the algebra map applied to the pushforward. "Over"
compositing is not affine, so it is not an algebra. It still has a limit, but only after a
nonlinear tone map.

Also, `types.md:269` to `:270` says "one Dist end follows its density". By the limits above,
a box with one uncertain end fades as the complement of the CDF, not the density. The
density belongs to a different picture: a single uncertain point drawn as a band (ggdist's
gradient interval). The proposal should keep the two apart, and the channel kind decides
which one is meant: a Dist in a point's position channel gives a density band, and a Dist
in a box's end gives a CDF fade.

### 3.2 Options for direct rendering

**Option 3A: no direct form, always sample.** This is ggdibbler's choice (Section 5.3). It
is correct by construction and needs no new theory. It costs `n` times the nodes
(design note question 11, `distributions.md:738`), it is grainy at small `n`, and it
renders differently on every run unless seeded.

**Option 3B: a direct form as an optimization of `sample` plus `overlay` (strongest).** The
user writes the noise form. The meaning is the limit. When the type says a closed form
exists, the renderer replaces the draws with it, as a compiler rewrite rule replaces code
with faster code that means the same thing. The type needs four facts per channel, and
GoFish has three of them already:

| Fact                                                                            | Where it comes from                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| the source Dist and its family                                                  | the `DistAccessor` (`types.md:155` to `:169`)                                               |
| the map from the Dist to pixels: affine, monotone, continuous, or discontinuous | the σ-scope (`underlying-space.md:110`) plus Option 1B's classes for every step on the path |
| dependence between Dists that meet                                              | `HasDraws { joint }` (`types.md:138` to `:140`)                                             |
| the blend and its limit tone map                                                | the `overlay` definition                                                                    |

A pseudo-type rule:

```
  channel c reads X : Dist<T>, X = normal(m, s)       path(X → c) is affine with σ, o
  c is a point position                                overlay blend is additive
  ───────────────────────────────────────────────────────────────────────── (blur-normal)
  direct render = mark footprint ⊛ Gaussian(σ·m + o, σ·s)   (an SVG feGaussianBlur)

  c is a box end, path monotone with inverse g        ───────────── (fade-end)
  direct render = gradient with opacity 1 − F_X(g(px))

  path(X → c) contains a discontinuous step            ───────────── (no-direct)
  direct render = sample, n chosen by the convergence check
```

In the proposal's spelling, the user writes only the noise form. The first chart below
meets `blur-normal`: `cy` is a position in a σ-scope, and nothing between the Dist and
the pixels jumps. The second chart meets `no-direct`, because `Overlap.separate()` moves
each dot by where the others landed, so it is sampled.

```js
const value = dist.normal({ mean: "mean", sd: "se" });

// blur-normal: rendered as one dot per category with a Gaussian blur of σ·se px.
chart(estimates)
  .flow(
    spread({ by: "category", dir: "x" }),
    sample({ n: 200 }),
    overlay({ by: "draw" })
  )
  .mark(circle({ cy: value, r: 3 }));

// no-direct: a collision layout sits on the path, so the draws are drawn.
chart(estimates)
  .flow(
    sample({ n: 200 }),
    overlay({ by: "draw" }),
    scatter({ x: value, overlap: Overlap.separate() })
  )
  .mark(circle({ r: 3 }));
```

A concrete closed form that the rule finds: the uncertain stacked bar
(`proposal.md:778` to `:794`). Each boundary is a running sum of the parts below it. With
independent normal parts, the boundary after `k` parts is normal with mean `Σ m_i` and
variance `Σ s_i²`. If the parts are never negative, the chance that height `y` shows
color `k` is `F_{k−1}(y) − F_k(y)`, the difference of two normal CDFs. So the overlaid
stacked bar has an exact direct render as a stack of gradients. With joint draws, the
variances come from the draws instead, and the same formula holds.

What 3B cannot do: correlated (x, y) positions need a rotated kernel, which SVG blurs
cannot express without a transform; a heavy-tailed family under a log scale has no
Gaussian form; color under overlay has a closed form that is still off-palette.

**Option 3C: blur as a user aesthetic** (ggdist's `blur`). Short to write, and it is what
users ask for. The paper's cliff shows the cost: the user picks the kernel, and nothing
ties it to the map the uncertainty actually goes through. If GoFish offered it, the type
from 3B could at least check it: "`blur` on `cy` is the standard error of `value`, but `cy`
is placed by a stack of counts, so the blur does not describe where the dot could be".

**Option 3D: verified direct renders.** Keep 3B's rewrites, and test each one: render the
direct form and the sampled form at increasing `n` with a fixed seed, and check that the
image distance shrinks like `1/√n`. This is the paper's visual convergence (Definition
3.4) as a CI test, and it is design note question 10. `capture-diff` compares normalized
geometry, not pixels, so this test needs a pixel comparison, which GoFish's visual
baselines already have.

**Option 3E: an invisibility lint.** With `σ` known after layout, the pixel standard
deviation of each uncertain channel is `σ·s`. When it is below about one pixel, the
uncertainty cannot be seen, which is the paper's just noticeable difference turned into a
confuser warning: "the draws of `value` vary by 0.3 px on this axis; the uncertainty will
not show". This needs only 3B's first two facts.

The strongest combination looks like 3B with 3D as its guard and 3E as a lint. The user
writes the noise form, the system renders the limit exactly when the type proves a closed
form exists, and CI checks that the closed form really is the limit.

## Related questions Josh did not ask

1. Is "visual convergence" one property or two? It is two: shrinking uncertainty (the CMT)
   and growing samples (a law of large numbers for the overlay). They fail in different
   places.
2. Does the axis extent converge? Not if it comes from the largest draw, since that grows
   with `n`. It must come from a fixed summary such as quantiles (open decision 8).
3. Does `overlay`'s opacity rule converge as `n` grows? Not with the 0.05 floor, and the
   blend mode decides what it converges to.
4. Should a `pos` fold over several draws after `sample` warn, since it silently shows a
   point estimate?
5. Does equivariance lift from plain charts to uncertain charts for free? Yes, because the
   probability monad is a functor. Is that worth a property test per existing check?
6. Is a dodge by draw a function of the distribution? Only if the draws are sorted by value
   within the slot. Should `spread({ by: "draw" })` sort by default?
7. Should sorting categories by a sampled value (a bar order per HOP frame) be allowed?
   It is discontinuous, but the discontinuity is what shows rank uncertainty.
8. Does `filter` on a Dist break continuity? A threshold is a jump, so a per-draw filter is
   `continuousExcept` and needs the limit point off the threshold.
9. Can metamorphic tests (multiply a column by a constant, permute draws, repeat draws)
   become a standard story check under `capture-diff`?
10. Is the density of `slab` measured per data unit or per pixel under a nonlinear scale?
11. Two uncertain channels with different placements need two draw keys. Is a product of
    samples worth the complexity?
12. Selection over draws: Bartonicek et al. find stacking is the safe direction for
    selection, and draws forbid stacking. Does the replication test predict where
    highlighting works on an uncertain stacked bar?

## Open questions

1. Is Phrasing A (the encoding as a natural transformation of symmetry actions) worth
   writing into `api-design.md` as the one-line meaning of "meaning lives on the data
   type"?
2. Should continuity classes (Option 1B) live on operator descriptors, next to the channel
   kinds, so the Python side gets them for free?
3. Should the draw-fold rule of Section 1.6 replace rules 2 and 3 with one rule, "a fold
   over a draw key must ignore permutation and repetition"? That would also cover future
   folds without a new rule each.
4. Should the direct render (Option 3B) be in #980's first step, or wait until sampling is
   built and the convergence test exists?
5. Should `overlay` blend additively in a mask so that its limit is the expected image, or
   keep "over" compositing and give `gradient` the matching tone map?
6. Is the `sample` effect worth tracking as an effect, or is a "has an unseeded sample"
   flag on the chart enough?
7. How far should GoFish follow Aizenman et al.'s split into encoders and compositors? It
   matches GoFish's channels and marks, and it may give a place to hang the per-channel
   continuity class.

## Sources

- Mason, Cook, Goodwin and VanderPlas, "A Mathematical Framework and Software Implementation for Uncertainty Visualisation", [arXiv:2606.24217](https://arxiv.org/abs/2606.24217), 2026.
- Kindlmann and Scheidegger, "An Algebraic Process for Visualization Design", IEEE TVCG 20(12):2181–2190, 2014 ([PDF](https://vis.cs.ucdavis.edu/vis2014papers/TVCG/papers/2181_20tvcg12-kindlmann-2346325.pdf)).
- Aizenman, Vejdemo-Johansson, Caswell and Grossberg, "Mind Your νs and Qs: A Categorical Framework for Specifying Visualization Components", GUGOG-VIS 2026 ([PDF](https://gugog-vis.github.io/2026/papers/pdf/aizenman-et-al.pdf)).
- Mackinlay, "Automating the design of graphical presentations of relational information", ACM TOG 5(2):110–141, 1986.
- Stevens, "On the theory of scales of measurement", Science 103(2684):677–680, 1946. Velleman and Wilkinson, "Nominal, ordinal, interval, and ratio typologies are misleading", The American Statistician 47(1):65–72, 1993.
- Ziemkiewicz and Kosara, "Embedding information visualization within visual representation", in Advances in Information and Intelligent Systems, Springer, 2009.
- Vickers, Faith and Rossiter, "Understanding visualization: a formal approach using category theory and semiotics", IEEE TVCG 19(6):1048–1061, 2013.
- Demiralp, Bernstein and Heer, "Learning perceptual kernels for visualization design", IEEE TVCG 20(12), 2014.
- McNutt and Kindlmann, "Linting for visualization: towards a practical automated visualization guidance system", VisGuides workshop, 2018.
- Correll, Li, Kindlmann and Scheidegger, "Looks good to me: visualizations as sanity checks", IEEE TVCG 25(1):830–839, 2019.
- McNutt, Kindlmann and Correll, "Surfacing visualization mirages", CHI 2020 ([arXiv:2001.02316](https://arxiv.org/abs/2001.02316)).
- Chen et al., "VizLinter: a linter and fixer framework for data visualization", IEEE TVCG 28(1), 2022.
- Wongsuphasawat et al., "Voyager: exploratory analysis via faceted browsing of visualization recommendations", IEEE TVCG 22(1), 2016.
- Bartonicek, Urbanek and Murrell, "No more, no less than sum of its parts", JCGS 34(3):1063–1074, 2025.
- Hullman, Resnick and Adar, "Hypothetical outcome plots outperform error bars and violin plots for inferences about reliability of variable ordering", PLOS ONE 10(11), 2015.
- Mann and Wald, "On stochastic limit and order relationships", Annals of Mathematical Statistics 14:217–226, 1943.
- Giry, "A categorical approach to probability theory", LNM 915, 1982. Ramsey and Pfeffer, "Stochastic lambda calculus and monads of probability distributions", POPL 2002.
- Fritz and Perrone, "A probability monad as the colimit of spaces of finite samples", Theory and Applications of Categories 34(7):170–220, 2019 ([arXiv:1712.05363](https://arxiv.org/abs/1712.05363)).
- Fritz, "A synthetic approach to Markov kernels, conditional independence and theorems on sufficient statistics", Advances in Mathematics 370, 2020.
- Reynolds, "Types, abstraction and parametric polymorphism", IFIP 1983. Wadler, "Theorems for free!", FPCA 1989.
- Kennedy, "Relational parametricity and units of measure", POPL 1997 ([PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/1997/01/relationalparametricityandunitsofmeasure.pdf)).
- Reed and Pierce, "Distance makes the types grow stronger: a calculus for differential privacy", ICFP 2010. Gaboardi et al., "Linear dependent types for differential privacy", POPL 2013. Azevedo de Amorim et al., "A semantic account of metric preservation", POPL 2017.
- Chaudhuri, Gulwani and Lublinerman, "Continuity analysis of programs", POPL 2010 ([doi:10.1145/1707801.1706308](https://doi.org/10.1145/1707801.1706308)).
- Rondon, Kawaguchi and Jhala, "Liquid types", PLDI 2008.
- Lucassen and Gifford, "Polymorphic effect systems", POPL 1988. Plotkin and Pretnar, "Handlers of algebraic effects", ESOP 2009. Ścibior, Ghahramani and Gordon, "Practical probabilistic programming with monads", Haskell Symposium 2015.
