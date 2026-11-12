# Summarizability and partitioning

Research note for the draft "GoFish Goes to School: A Type System for Semantic
Validity", Section 5 and Section 7. It answers Josh's question: "I'm also
curious if summarizability can or should be connected to partitioning at all."

Status: research only. No API is proposed for sign-off here. Spellings marked
**(hypothetical)** do not exist in GoFish. Every other spelling is on `main`
today (commit 299783950).

## 0. Short answer

Yes, they connect, but not through the `partition` operator alone, and not
with one rule. The connection runs through the key's regions. Summarizability
says a measure on the key may be summed over a grouping when the groups are
disjoint regions that cover the parent. A partition-shaped picture says a
region of the plane is cut into disjoint pieces that cover it. A picture is
honest when the map from key regions to plane regions preserves the measure
the reader reads off the ink. There are two ways a layout can size its
pieces, and they give two dual rules:

- **Value-sized pieces** (`stack`, `treemap`, `.normalize()` spines, pie,
  mosaic, `cut`). A piece's size is the value. The rule is summarizability
  itself: the groups partition the parent key, and the sized field is
  extensive over that key, so the whole's size is the parent's total.
- **Key-sized pieces** (`partition` over bins, calendar cells, Voronoi cells,
  map regions). A piece's size is the key's own measure: days in a month,
  rating units in a bin, square kilometers in a state. Here the rule flips. A
  channel that fills the piece with ink should be **intensive with respect to
  that measure** (a density: count per rating unit, people per km²), so that
  the ink adds up to the extensive total.

So the draft's line "conditions 1 and 2 also belong on `by` and partition
operators" is half right. The conditions belong on the key (its regions do
not overlap and cover the parent), and the value-sized operators read them.
The `partition` operator, which is key-sized, needs the opposite of
extensivity on the channels that paint its cells.

Recommendation: share one concept, the regions of a key, and keep the word
`partition` on the operator. Do not add a new partition trait yet. Both rules
follow from three things the draft already has or plans: the additivity kind
of a (field, key) pair, keys whose values have a region (already the
precondition of `partition`), and units with powers (the "per" unit of #1142).
Section 6 gives the rule, the runner-up and what would change my mind.

## 1. Terms

These are defined once here and used throughout.

- **Key, key space.** The columns a table is indexed by, such as `warehouse`
  and `month`. The draft (Section 7) writes a table as a function from a typed
  key space to records.
- **Region of a key.** A piece of the key space: a set of warehouses, a time
  interval, a polygon on a map. On `main`, `partition` already requires "a key
  that has a region", such as `field("date").bin([Calendar.year,
Calendar.month])` (each value is the interval `[Feb 1, Mar 1)`) or
  `struct({ x, y }).bin(Bin.hex({ radius }))`.
- **Partition of a set.** A family of nonempty subsets that are pairwise
  **disjoint** (no element in two of them) and **complete** (every element is
  in one of them). Also called "exhaustive" or "covering".
- **Cell, cell system.** From the #48 proposal: a cell system is a set of
  regions that do not overlap and that cover a domain. A cell is a region from
  a cell system. Josh's 10-06 decision: cell is a refinement of region (like
  `HasMidpoint` refines `HasOrder`), and it should be built only when an
  example forces it.
- **Measure (finitely additive).** A function `m` from regions to amounts,
  with `m(∅) = 0` and `m(A ∪ B) = m(A) + m(B)` whenever `A` and `B` are
  disjoint. The regions must form an **algebra**: closed under union,
  intersection and complement, so that "disjoint pieces of A" makes sense.
  In measure theory a finitely additive measure is also called a _content_
  ([Wikipedia: Content (measure theory)](<https://en.wikipedia.org/wiki/Content_(measure_theory)>)).
  By induction, if `A1, ..., An` partition `A` then `m(A) = Σ m(Ai)`. That
  one line is the mathematical content of summarizability.
- **Extensive, intensive, cumulative.** The draft's three kinds, per
  (field, key). Extensive over K: the field is a measure on regions of K.
  Intensive over K: a ratio `m1 / m2` of two extensive fields, combined by a
  mean weighted by `m2`. Cumulative over K: `s(t) = m((-∞, t])`, an extensive
  measure read on growing prefixes of an ordered key. The physics and GIS
  sense is the same: Goodchild and Lam (1980) call a zone variable extensive
  when the zone's value is the sum of its subzones' values and intensive when
  it is a weighted average of them
  ([GIS&T Body of Knowledge, Areal Interpolation](https://gistbok-ltb.ucgis.org/30/concept/9234)).
- **Density (Radon–Nikodym derivative).** If `m` and `μ` are two measures on
  the same regions and `μ(A) = 0` implies `m(A) = 0`, there is a function
  `q = dm/dμ` with `m(A) = ∫_A q dμ`
  ([Wikipedia: Radon–Nikodym theorem](https://en.wikipedia.org/wiki/Radon%E2%80%93Nikodym_theorem)).
  On a discrete key the integral is a weighted sum, and `q(A) = m(A) / μ(A)`
  is exactly the draft's intensive field with weight `μ`. Count per bin width
  is a density with respect to length. Population per km² is a density with
  respect to area. Price is a density of revenue with respect to units sold.
  So "intensive" in the draft _is_ a Radon–Nikodym derivative, and its
  weighted-mean rule is the formula `q(A ∪ B) = (μ(A)q(A) + μ(B)q(B)) /
(μ(A) + μ(B))`.
- **Summarizability.** Lenz and Shoshani (SSDBM 1997) give three necessary
  conditions for a summary to be correct: disjointness, completeness, and
  type compatibility between the measure, the dimension and the aggregate
  function. Their condition 3 is where they classify measures as **flow**
  (sums along every dimension), **stock** (sums along every dimension except
  time) and **value per unit** (never sums)
  ([paper on ResearchGate](https://www.researchgate.net/publication/3711076_Summarizability_in_OLAP_and_statistical_data_bases);
  issue #1198 summarizes their Figures 7 and 8).
- **Kimball's facts.** Additive (sum along every dimension), semi-additive
  (sum along some, typically balances over everything except time),
  non-additive (ratios)
  ([Kimball Group](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/additive-semi-additive-non-additive-fact/)).
  Kimball's advice for a non-additive fact is to store its additive parts and
  divide at the end, which is the draft's weighted mean.
- **Strict and covering hierarchies.** In OLAP a dimension is a hierarchy of
  levels (day, month, year; county, state). It is **strict** when each member
  has one parent and **covering** (or onto) when every member has a parent at
  each level. Non-strict hierarchies (a product in two categories) break
  disjointness. Non-covering or ragged hierarchies (a city with no state)
  break completeness. Pedersen, Jensen and Dyreson give algorithms that
  repair such hierarchies so that pre-aggregation stays correct
  ([Information Systems 2001](<https://doi.org/10.1016/S0306-4379(01)00023-0>);
  [VLDB 1999 version](https://homes.cs.aau.dk/~csj/Papers/Files/1999_pedersenVLDB.pdf)).
  Hurtado, Gutierrez and Mendelzon reduce summarizability over heterogeneous
  hierarchies to implication of **dimension constraints**, logical statements
  about which levels a member rolls up to
  ([TODS 2005](https://doi.org/10.1145/1093382.1093388);
  [PODS 2002](https://ftp.cs.toronto.edu/pub/papers/pods02hm.pdf)).
  Horner, Song and Chen survey where sums go wrong in practice and how to
  flag semi-additive and non-additive measures
  ([DOLAP 2004](https://doi.org/10.1145/1031763.1031779)).
- **Bertin's QS and Q.** In _Semiology of Graphics_, a quantity can be shown
  as a total over a cell (QS, extensive) or as a value per unit of the cell
  (Q = QS / S, intensive). A mark whose ink spans a cell of size S must carry
  Q, or the eye reads Q × S. The scale-transforms proposal (artifact
  TduMB8U1) records this as GoFish's "unit power and embedding" rule: a
  k-dimensional embedded mark keeps a k-dimensional measure.
- **Product plots.** Wickham and Hofmann build mosaic plots, treemaps,
  stacked bars and fluctuation diagrams by recursive partitioning of a
  rectangle. Their constraints: "area must be proportional to count. This is
  the key constraint underlying all area plots", and "partitions must be
  disjoint". The construction rests on `f(x, y) = f(y | x) f(x)`: a
  conditional times a marginal
  ([TVCG 2011, PDF](https://vita.had.co.nz/papers/prodplots.pdf), Sections 3
  and 4).
- **Modifiable areal unit problem (MAUP).** Statistics computed over zones
  change when the zones are redrawn or coarsened (Openshaw 1984, CATMOG 38).
  **Areal interpolation** moves a variable from source zones to target zones
  that do not nest. Extensive variables are split by overlap area and their
  totals are kept. Intensive variables are averaged and their means are kept.
  R's `sf::st_interpolate_aw(x, to, extensive = TRUE/FALSE)` implements
  exactly this switch
  ([docs](https://search.r-project.org/CRAN/refmans/sf/html/interpolate_aw.html)),
  and its own example checks that the extensive total is preserved.
  **Dasymetric mapping** replaces the area weight with a better weight (land
  use, housing units); `st_interpolate_aw` takes `weights` only with
  `extensive = TRUE`. Mennis (2003) is a standard reference.
- **Time granularities.** Bettini, Jajodia and Wang (2000) define a
  granularity as a map from labels to non-overlapping granules of time, and
  separate "finer than" from "groups into". Weeks are not grouped into months,
  because a week can straddle two months.
- **Discrete global grid systems (DGGS).** OGC Abstract Specification Topic
  21 (ISO 19170-1) defines zones that partition the globe, with identifiers,
  quantization (point to zone) and refinement between levels. Many DGGS
  designs choose equal-area cells so that counts per cell compare as
  densities; Uber's H3 is only approximately equal-area.

## 2. The duality, stated as typing rules

### 2.1 What a partition-shaped picture claims

A partition-shaped picture cuts a whole region `W` of the plane into pieces
`P1, ..., Pn` that do not overlap and that fill `W`. Write `|P|` for the
measure the reader reads off a piece: its length in a stack, its area in a
treemap or mosaic, its angle in a pie. Because the pieces are disjoint and
fill `W`, plane geometry already guarantees `|W| = Σ |Pi|`. The picture
therefore asserts that the quantity it shows is additive over the pieces. It
is honest when there is an additive quantity in the data that it mirrors.

The pieces correspond to regions `R1, ..., Rn` of a key. The picture is a map
`Ri ↦ Pi`. The honest condition is that this map **preserves a measure**:

    |Pi| = c · m(Ri)        for one constant c and a measure m in the data,

and then, by additivity on both sides, `|W| = c · m(R1 ∪ ... ∪ Rn)`. In
algebra terms the layout is a homomorphism from the regions of the key (with
disjoint union) to the regions of the plane (with disjoint union), carrying
`m` to `|·|`. Summarizability is the statement that `m(⋃Ri)` is the right
parent aggregate. The picture inherits it.

There are two sources for `|Pi|`, and that is the whole duality.

### 2.2 Rule V: value-sized pieces

The layout makes a piece's size equal to a value read from the data:
`stack` (a part's length is `h`), `treemap` (`size`), `stack({ size:
field("count").normalize() })` (a share of the given whole), a pie (angle =
share), `cut` (weights normalized to the source shape).

    Γ ⊢ by(k) splits group G into G1..Gn        (rows of G)
    the regions measured by f on G1..Gn are disjoint     [D-things]
    G1 ∪ ... ∪ Gn = G                                    [C-rows]
    f : Extensive<k>                                     [type compatibility]
    f ≥ 0, unless the layout is a signed stack
    ─────────────────────────────────────────────────────────────
    |Pi| = f(Gi)   and   |W| = f(G), the parent total

This is Lenz and Shoshani's three conditions with the summed groups being
the layout's pieces. The draft's `stack(k) requires Extensive<k>` is this
rule. Section 3 explains the two different "disjoint" readings, which matter.

**Signed stacks.** The branch `docs-stack-signed-partition` (pushed, no PR)
adds to `internals/core/underlying-space.md`: "A stack is a signed partition
of its own sum." Each part is an oriented interval. The parts telescope to the
interval from 0 to the sum, and where a negative part steps back the overlap
cancels. A signed measure (profit, net flow) is still additive, so Rule V
holds with signed `f`. The same note says why a _given_ whole rules out
negative parts: a net of 0 cannot be scaled to fill anything. So
`.normalize()`, `treemap` and pie need `f ≥ 0`, and `stack` does not. That is
a clean statement of where the "signed-additive" role from Flint goes.

### 2.3 Rule K: key-sized pieces

The layout makes a piece's size equal to the key region's own measure `μ`:
`partition` gives each group "its cell on the shared scale", so a 29-day
February is narrower than a 31-day March, a `Bin.thresholds([18, 30, 50])`
cell for ages 30 to 50 is wider than 18 to 30, and a Voronoi cell is as big
as the territory it covers. `μ` is days, rating units, km², or the counting
measure (all cells equal, as in `table` and a calendar heat map).

Now the value is painted _across_ a piece of size `μ(Ri)`. If the chart is
read as "ink is amount" (a filled area, a region's fill), the ink of piece i
is `μ(Ri) · v_i`. For the ink to equal an extensive total `m(Ri)`, the value
must be

    v_i = m(Ri) / μ(Ri) = dm/dμ on Ri         (intensive w.r.t. μ)

Then `Σ ink = Σ ∫ (dm/dμ) dμ = m(W)`, and the homomorphism holds for the
product (extent along the key) × (value across it). If instead `v_i = m(Ri)`
is extensive, the ink is `μ · m`, which overstates large cells. That is
Bertin's QS/Q rule, the histogram rule, and the choropleth rule, all at once.

    partition(by: k) with cells Ri of measure μ
    a channel v that fills cell Ri with ink read as amount
    ────────────────────────────────────────────────
    v should be Intensive<k, weight: μ>  (unit u / unit(μ))
    otherwise: lint (not error), elaborate to v / μ(Ri) when asked

The units already decide this. A `partition` axis over `field("rating")`
takes the rating's unit (schema.md: "The cells of `field(x).bin(p)` are
amounts of `x`'s quantity"). A bar's area is then `rating × count`. For the
area to be a `count`, the height must be in `count / rating`. That is a unit
power check (scale-transforms proposal, "one Jacobian rule"), and it needs
only the "per" unit of #1142.

Why a lint and not an error. Josh's 11-11 position on densities under a log
axis was that a raw density there is legal, with a lint on filled marks only,
because lines and bar tops are read by position. The same holds here. A bar
in a `partition` is often read by its top against the y axis (Cleveland and
McGill rank position on a common scale far above area), and then its width is
"where", not "how much". So Rule K is an elaboration and a lint, scoped to
marks whose ink is read as amount: `region` fills, histograms, and any filled
mark where widths vary a lot.

### 2.4 Product of the two: mosaic, Marimekko, product plots

A mosaic sizes one axis by value and the other by a share. The story
`forwardsyntax/MosaicChart.stories.tsx` on `main`:

```js
chart(data)
  .flow(
    stack({ by: "origin", dir: "x", size: "count" }),
    stack({ by: "cylinders", dir: "y", size: field("count").normalize() })
  )
  .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }));
```

- Width of column `a` = `m(a)`, the marginal count. Rule V over `origin`:
  count is extensive, the origins partition the cars.
- Height of segment `b` in column `a` = `s(b | a) = m(a, b) / m(a)`, the
  conditional share. Rule V again, over `cylinders` inside one origin, with a
  given whole of 1.
- Area = `m(a) · m(a, b) / m(a) = m(a, b)`, the joint count. Extensive over
  the product key `origin × cylinders`.

So the share is intensive and the area is extensive, and both are right. The
share is **extensive over `cylinders` with `origin` fixed** (shares of one
origin add to 1) and **intensive over `origin`** (to combine two origins'
shares you weight by `m(a)`). This is the draft's per-key additivity doing
real work: one field, two kinds, by key. The area works out because the width
is exactly the weight the intensive share needs. That is Wickham and
Hofmann's `f(x, y) = f(y | x) f(x)`, read as "an intensive height times its
own weight is extensive". A Marimekko chart is the same with market size in
place of count.

Typing consequence: `.normalize()` produces a field of kind
`Extensive<inner key>` and `Intensive<outer key, weight: total>`. A spine is
legal inside a group; summing shares across groups (a stack of shares over
the outer key) is the error.

## 3. Two disjointnesses and two completenesses

The draft says the cumulative case "is condition 1, not a special temporal
rule". That is a useful reading, but it uses a different disjointness from
the one Lenz and Shoshani state as condition 1, and the difference matters
for where each check lives. Issue #1198 already says this: "Their
summarizability conditions 1 and 2 ... are exactly a partition, not of the
rows (grouping always partitions the rows) but of the things counted."

**D-rows (groups of rows are disjoint).** Each row lands in at most one
group. In OLAP terms this is strictness of the hierarchy. In GoFish, `by` on
a single-valued column is disjoint by construction, and so is
`field(x).bin(p)`, because a value falls in one cell (the cell system's
point-to-cell map is a function). D-rows fails only when a row can belong to
several groups:

- a list-valued key (multi-label data: a movie with genres
  `["Comedy", "Drama"]`, a multi-select survey answer). GoFish has no
  list-valued `by` today.
- a region key whose regions overlap (service areas, metro areas, school
  districts against counties). `partition` over user-supplied shapes would
  admit this once column-of-regions schemas exist (#48 open question 5).
- a non-strict hierarchy used for nesting (a product filed under two
  categories).

**D-things (the stuff each value measures is disjoint).** The rows are
disjoint, but the underlying items they count are not. This is what fails
for a stock over time: the regions measured by `s(t1)` and `s(t2)` are the
prefixes `(-∞, t1]` and `(-∞, t2]`, which nest, so the same items are counted
in every month. Lenz and Shoshani file this under condition 3 (stock with a
temporal dimension), not condition 1. Their Example 2 (students in joint
programs counted in two departments) is the same failure along a non-time
dimension. Other real cases:

- `.distinct()` counts. schema.md on `main` says "`.count()`, `.distinct()`
  and `.normalize()` shares add up". Distinct counts are the textbook
  non-additive measure: a customer who buys in two regions is one distinct
  customer overall and one in each region. Stacking `.distinct()` by region
  overstates the total. This is a **current hole** on `main`, and it is a
  real example that forces D-things into the check.
- The fan trap of a join (#1198): `island_area` repeated on every penguin
  row.
- A daily stock summed inside a month cell:
  `partition({ by: field("date").bin([Calendar.year, Calendar.month]) })`
  with `rect({ h: field("stock").sum() })` gives item-days, not items. This is
  not a stack at all, so the check must sit on the aggregate (`.sum()`), not
  only on `stack`.

**C-rows (every row lands in a group).** True for `by` on a column: on
`main`, rows with a null key form their own `"null"` group unless the user
writes `.dropNulls()` (spread.md). `filter` and `.dropNulls()` break it on
purpose. One inconsistency: bin.md says "A row that is missing a field of the
key is dropped", so binning drops nulls silently while `by` keeps them as a
group. A partial cover is also inherent to some cell systems: US state shapes
do not cover the ocean, and #48 lists this as a domain fact, not a flaw.

**C-things (the whole means what the reader thinks).** The stack's top is
the sum of what is shown. That is always true of the picture. It is only a
problem when the chart names or normalizes the whole: a 100% stacked bar of
the top five products shows shares of the five, not of the market; a pie of
survey answers with "No answer" dropped shows shares of those who answered.

So, precisely:

| Condition | Reads                           | Fails in                                                       | Where GoFish knows it                               |
| --------- | ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| D-rows    | grouping of rows                | list-valued keys, overlapping regions, non-strict nesting      | the key (cell systems are disjoint by construction) |
| D-things  | (field, key)                    | stock over time, distinct counts, join fan-out, joint programs | the field's kind per key, or #1198's entity key     |
| C-rows    | grouping vs. its input          | `filter`, `.dropNulls()`, bin dropping nulls, partial covers   | the pipeline (data flow)                            |
| C-things  | grouping vs. the reader's whole | top-N, dropped "Other", missing categories                     | only where a whole is named or normalized           |

Cumulative is a D-things failure along its own ordered key. It is a
different disjointness from D-rows, and the draft should say so: "the
cumulative case is condition 1 read on the things counted; Lenz and Shoshani
file it under condition 3".

## 4. The examples

Each line says which rule applies, whether the chart passes, and what
decides it. GoFish spellings are from `main` unless marked.

### Value-sized (Rule V)

- **Stacked bar.** `spread({ by: "month" }), stack({ by: "warehouse" })` with
  `h: "sold"`. Passes: `sold` is extensive over warehouse, the warehouses
  partition the rows of a month. Same chart with `h: "stock"` passes too
  (stock is extensive over warehouse). Swapping to `stack({ by: "month" })`
  with stock fails D-things. This is the draft's own example.
- **100% stacked bar.** `stack({ by: "response", size:
field("count").normalize() })`. Passes inside one group. Shares are
  extensive over the inner key with a given whole of 1, so `f ≥ 0` is
  required (the signed-partition note). After a `filter` that drops some
  responses, the shares are of the shown responses (C-things).
- **Pie and donut.** Rule V with a given whole, in `Coord.polar()` /
  `Coord.clock()`. Same requirements as the 100% bar. The classic failure is
  a pie of a **multi-select** question ("Which tools do you use?"), whose
  percentages sum past 100%: D-rows fails, because each respondent is in
  several slices.
- **Treemap with nested `by`.** `treemap({ by: "continent", size: "pop" }),
treemap({ by: "region", size: "pop" })` (treemap.md). Rule V at each level:
  `pop` must be extensive over each level's key, and the nesting must be
  strict. A treemap of `gdp_per_capita` fails type compatibility: the tile
  areas add to a meaningless total. The fix is a weight: size by `gdp`, color
  by `gdp_per_capita`. Treemap also needs `f ≥ 0`; the space-traits research
  (N6YYcKQM) found that `main` drops negative values silently, which Rule V
  would turn into an error.
- **Mosaic and Marimekko.** Section 2.4. Passes; it is the case that shows
  why per-key kinds are needed.
- **Stacked area over time.** `stack` over series at each x; x is spread or
  scattered, never summed. Rule V applies only across series. Along x nothing
  is added, so stock is fine there: stacked inventory by warehouse over
  months is valid, and the area under it is item-months, a meaningful
  integral of a stock. Only the vertical sum is checked.
- **Waterfall.** The parts are signed deltas (extensive over the step key),
  placed at their prefix sums. That is a signed stack whose parts are spread
  out along x. The final "Total" bar equals the sum only if the steps are
  complete (C-rows). The running level is cumulative over the step key, so
  stacking running levels would be the stock error; plotting them as a line
  is fine.
- **Population pyramid.** A centered stack over sex with a midpoint
  (stack.md, "Centered stacks"). Counts are extensive over sex. The age axis
  is the interesting part: it belongs to Rule K, below.
- **Sankey and alluvial.** Each stage is a stack of one total, and the flows
  between stages are a joint table `m(source, target)`. Node heights are the
  marginals, so the two stacks partition one total in two ways, like a
  mosaic read twice. Requirements: flows extensive over both keys, and
  conservation (C-rows at both ends: anything that leaves the system must be
  an explicit "lost" node). An alluvial of a stock across years (party
  membership per election) is fine, because nothing is summed across years.
- **Venn, Euler, UpSet.** Sets overlap, so set sizes do not add (D-rows
  fails). The **atoms** of the diagram (the exclusive intersections) do
  partition the elements. An area-proportional Euler diagram sizes atoms,
  not sets. UpSet (Lex et al. 2014) draws exclusive intersection sizes as one
  bar chart and set sizes as a separate bar chart that is never stacked. So
  the elaboration for an overlapping grouping is "group by the membership
  combination instead".
- **Multi-label `by`.** Not in GoFish today. If it is added (`by` on a
  list-valued field, an explode or unnest step), Rule V must reject it under
  `stack`, `treemap` and `.normalize()`, and `spread` may accept it (bars
  side by side do not claim a total).
- **Top-N before a stack.** `filter` then `stack`. The stack is correct about
  what it shows. Only a named or normalized whole misleads. See Section 5.
- **Survey with missing categories or "Other".** Same as top-N. A Likert
  chart that drops "Don't know" before `.normalize()` shows shares of those
  with an opinion.

### Key-sized (Rule K)

- **Histogram, equal bins.** `partition({ by: field("rating").bin(Bin.step(0.5)),
dir: "x" })` with `rect({ h: field("rating").count() })` (gallery story
  "Rating Histogram on a Continuous Axis"). Passes: equal widths, so count
  and density differ by one constant.
- **Histogram, unequal bins.** Same chart with `Bin.quantiles(10)`. Each
  quantile bin holds about as many values as the others, so count heights
  are flat by construction and the chart shows nothing. The density
  `count / width` shows the distribution. Freedman, Pisani and Purves teach
  this as "the area of a bar is the percent" with a density scale on the y
  axis ([Wikipedia: Histogram](https://en.wikipedia.org/wiki/Histogram)).
  `Bin.thresholds([18, 30, 50])`, the example in bin.md, makes unequal age
  bins too. This is the strongest example for Rule K: elaborate `count()`
  under a `partition` with unequal cells to a density **(hypothetical:
  `field("rating").count().per("rating")`, or a `density` reading of
  `.count()`)**, or lint.
- **Census age brackets.** Pre-binned brackets of unequal width (0 to 4, 5 to
  14, 15 to 17, 18 to 19, 20, 21, 22 to 24, ..., 85 and over) are a real
  population pyramid input. With `partition` and true widths, counts make
  wide brackets look huge; per-year density is right. The open-ended "85 and
  over" bracket has no width at all, so it cannot be drawn by Rule K and
  needs an explicit choice. That is a domain special case, and it should be
  an error that asks for an upper edge.
- **Monthly totals on true month widths.** Gallery story "Monthly Sales on a
  Time Axis": `partition({ by: field("date").bin([Calendar.year,
Calendar.month]) })` with `rect({ h: field("value").sum() })`. Under the
  area reading, February has about 10% less ink than March at the same daily
  rate. Read by bar tops it is fine. This is the case that makes Rule K a
  lint, not an error: the story is a good chart. If the reader should compare
  rates, the elaboration is sales per day.
- **Choropleth.** Regions partition the map (key-sized, `μ` = area). Painting
  an extensive count ("COVID cases by state") makes large states look worse;
  painting an intensive rate is the standard advice. The gallery story "US
  Airports by Nearest Hub" paints `field("iata").count()` over Voronoi cells
  of very different sizes. That is the extensive-on-choropleth pattern, and
  also a defensible chart if the question is "how many airports does each hub
  serve". It is a second reason for Rule K to be a lint. A residual case is
  beyond types: a per-capita rate is intensive with respect to population,
  not area, so its area-weighted gestalt still over-weights large empty
  regions. The fix there is a cartogram, which turns the key-sized layout
  into a value-sized one (sized by population).
- **Hex binning.** `partition({ by: struct({ x: "lon", y: "lat" }).bin(Bin.hex({
radius })) })` with `region({ fill: field(...).count() })`. Equal cells in
  data space, so it passes. But a hex in degrees of longitude and latitude
  covers less of the Earth near the poles, so counts per hex are per square
  degree. That is why DGGS prefer equal-area cells. Under Rule K the cell's
  `μ` must be the measure the reader reads, which for `Coord.geo` is ground
  area, not degrees.
- **Calendar heat map.** `table` over day cells: equal cells (counting
  measure), so an extensive daily value as color passes.
- **Rebinning pre-aggregated data.** Weekly sales rows binned by month:
  `field("weekStart").bin([Calendar.year, Calendar.month])`. Each week falls
  in the month that holds its start (the axis docs say the same about slots),
  so a week that straddles a month boundary is counted entirely in one month.
  Weeks do not group into months (Bettini). This is the MAUP and areal
  interpolation problem in time. The extensive answer splits each week's
  sales by days in each month; the intensive answer keeps the rate. GoFish
  cannot see this unless the column is typed as week cells, which is the
  region-valued column of #48. It is the cleanest example that a cell system
  needs a "groups into" relation before coarsening can be checked, and it is
  not forced yet because no GoFish story rebins cells.

### Not partitions

- **`spread`** keeps children's spaces separate (Josh's correction: stack
  glues spaces into one, spread does not). A grouped bar claims no total, so
  Rule V never applies. That is why grouped bars of an intensive field are
  fine while stacked bars of it are not.
- **`pack`** sizes children by value but does not fill a whole: the enclosing
  circle is bigger than the sum of the children's areas. Rule V does not
  apply, and a nested pack's parent must not be read as a total.
- **`enclose`** draws outlines around groups that may overlap (bubble sets,
  `Shape.blob`). It is the one operator where overlapping groups are
  legitimate, and it claims no sizes.
- **`group`** and `layer` place nothing.

## 5. Where each condition should be checked

**On the key type.** A cell system guarantees D-rows and C-rows over its own
domain by construction. That is #48's position ("declared not checked"), and
it is right: `Bin.*` and `Calendar.*` are disjoint and covering, and a shape
file becomes a cell system by declaration. Today every key GoFish can build
is disjoint by construction (single-valued `by`, bins), so a separate
disjointness trait has nothing to reject yet. It becomes necessary when one
of these lands: list-valued `by`, user-declared region columns that may
overlap, or coarsening between cell systems.

**On `by`.** Single-valued `by` is disjoint by construction and complete
relative to the rows present (nulls form a group). Checking it is vacuous
today. Do not add a check. If list-valued keys arrive, the key's type should
record "may overlap", and Rule V operators reject it.

**On `filter`.** It breaks C-rows by design, and the stack is still correct
about what it shows. A type "partial" that makes stacks errors would be
overreach: most filters are intended. Two narrower options:

1. _Recommended, as a declared shortcut:_ record on the key a data-flow fact,
   "some groups of this key were removed upstream", and use it in exactly two
   places: `.normalize()` (lint: "shares are of the 5 products shown, not of
   all products; normalize before the filter, or keep the rest as an 'Other'
   group") and any total label. No new user-facing type. The right fix later
   is an explicit "Other" elaboration **(hypothetical:
   `filter(...).other("Other")`)** that keeps C-things while showing top-N.
2. Do nothing until a real report of a misread normalized chart comes in.

**On the field (per key).** D-things and type compatibility live here. This
is the draft's Section 5, and the existing `CanSum` check is its first
coarse version. Two concrete changes fall out:

- `.distinct()` should not have `CanSum`. That is a bug on `main` today.
- `.normalize()` should produce `Extensive<inner>` and
  `Intensive<outer, weight>`, so a stack of shares across the outer key is
  rejected.

Whether D-things is declared per key (the draft's `Cumulative<month>`) or
checked from data with an entity key (#1198 proposal B) is #1198's question.
This note does not change it, except to point out that the entity check is
the D-things check and the cell system is the D-rows check, so they are
complementary, not rivals.

**On the aggregate, not only on `stack`.** The check must sit at every place
that sums: `stack`, `treemap` `size`, size channels, `.sum()`, and the
default fold inside a `partition` cell. Elaboration: when a field is
cumulative over the key being folded, the default fold is `last` (or a time
mean), not `sum`.

## 6. One concept or two?

### Options

- **(a) One trait on the key.** "This key's values are disjoint regions that
  cover their parent" (the cell refinement), required by every
  partition-shaped operator together with extensive-over-that-key on the size
  channel.
- **(b) Keep them apart.** Summarizability stays purely on (field, key);
  graphical partition is a geometric notion with its own rules.
- **(c) Derive one from the other.** One concept, the regions of a key. The
  draft already defines `Extensive over K` as `m : Region(K) → V`. A
  partition of the key is a set of disjoint covering regions. The graphical
  rules are consequences: Rule V is summarizability with the layout's pieces
  as the groups; Rule K is the same measure read through a density.

### Recommendation: (c), with no new trait now

Share the concept, keep the word `partition` on the operator, and add no
partition trait until an example forces it.

- The concept that both sides need is already in GoFish: `partition`
  requires "a key that has a region", and the draft's extensive kind is
  defined on regions of the key. Making the type doc say "region of a key" in
  both places is the whole unification.
- Rule V is the existing `stack` requirement, generalized to every
  value-sized operator (`treemap`, `.normalize()`, pie, `cut`) with the
  `f ≥ 0` split from the signed-partition note.
- Rule K needs no partition concept at all. It falls out of units with
  powers once a partition's axis carries the key's unit and #1142 gives
  "per" units. It is the same rule as Bertin's QS/Q and the scale-transforms
  proposal's embedding rule.
- (a) is wrong as stated, because it would require _extensive_ values on the
  `partition` operator, which needs the opposite on its painted channels. It
  would also add a trait that rejects nothing today.

The word. In user-facing docs `partition` stays the name of the key-sized
operator. In the type-system paper, say "the groups partition the key" for
the summarizability condition, and call the two families "value-sized" and
"key-sized" layouts. #48's table ("who decides each region": the children's
sizes, the data's sizes plus a tiling, or a fixed map of the space) is
already this split.

### Runner-up: (b)

(b) is close to (c) in what gets built: Rule V lives on `stack` and friends,
Rule K lives in the unit-power rule. It loses the explanation. (c) shows that
the stacked bar, the 100% bar, the mosaic, the histogram and the choropleth
are one fact about measures, which is the paper's main conceptual claim
(Section 13: "how the structure of the key-value data space must line up
with the structure of graphical space"). (b) would state them as five rules.

### What would change my mind

- **Toward (a):** GoFish gains list-valued `by`, or user-declared region
  columns that may overlap, or rebinning between cell systems (the
  weeks-into-months case). Then "these regions are disjoint and cover" is a
  fact the checker needs and cannot derive, and the cell refinement from #48
  becomes a real trait (spelling **(hypothetical)**, following the naming
  rule: `HasCells`, with "groups into" for coarsening).
- **Toward (b):** if Josh decides the histogram and choropleth cases belong to
  the area channel and its lint (scale-transforms section 14), so that no
  rule in the type system mentions partitions at all. Then the connection
  stays in the paper as an explanation only.
- **Against Rule K entirely:** if Josh rules that bars in a `partition` are
  always read by their tops. Then Rule K shrinks to `region` fills only.

## 7. Error messages and elaborations

Each message names the field, the key and the fix, in the style of the
existing `CanSum` errors. All are **(hypothetical)** text.

- Stack over a cumulative key. "`stock` is cumulative over `month`: each
  month counts the items on the shelf that month, so stacking months would
  count the same items once per month. Stack by `warehouse` instead, or show
  months side by side with `spread`."
- Sum inside a time cell. "`field("stock").sum()` adds a daily stock over the
  days of each month, which gives item-days. Use `field("stock").last()` for
  end-of-month stock, or `.mean()` for the average level." (The default fold
  for a cumulative field should already be `last`.)
- Distinct counts. "`.distinct()` counts each customer once per group. A
  customer in two regions is counted twice in a stack by region. Show regions
  side by side with `spread`, or stack a `.count()` of rows instead."
- Treemap of an intensive field. "`price` is a value per unit
  (USD per item), so tile areas would add up to a meaningless total. Size the
  tiles by `revenue` and color them by `price`, or size by `sold` if the
  question is volume."
- Negative sizes under a given whole. "`profit` has negative values, and a
  treemap (or `.normalize()`, or a pie) divides a given whole, which a net of
  0 cannot fill. Use `stack`, which draws negative parts back from 0, or
  group by sign first."
- Overlapping groups. "`genres` holds several values per row, so `stack`
  would count the movie _Amélie_ in both Comedy and Romance and the stack's
  total would exceed the number of movies. Group by the combination of
  genres, or show genres side by side with `spread`." (Needs list-valued keys
  first.)
- Shares across groups. "`field("count").normalize()` gives shares within
  each `origin`; stacking them across `origin` adds shares of different
  wholes. Normalize inside the inner stack only."
- Shares after a filter (lint). "`.normalize()` divides by the 5 products the
  `filter` kept, so the shares are of those 5, not of all products. Normalize
  before filtering, or keep the rest as an 'Other' group."
- Histogram with unequal bins (lint, with elaboration). "The bins of
  `Bin.quantiles(10)` have different widths, so bar areas would show count ×
  width. Showing count per rating unit instead." Or, if elaboration is not
  wanted, the lint suggests the density spelling.
- Extensive fill over unequal cells (lint). "Each Voronoi cell is painted by
  `count()`, so big cells look big partly because they are big. To compare
  how dense the airports are, paint count per km²."
- Open-ended cell. "The cell `85+` has no upper edge, so `partition` cannot
  give it a width. Give it one with `Bin.thresholds([..., 85, 100])`, or use
  `spread`, which gives every cell the same slot."
- Pie of a multi-select question. "Respondents chose several answers each, so
  the slices sum to 173% of respondents. A pie needs one answer per
  respondent; use bars side by side."

## 8. Gaps found on `main` (unfiled)

- `.distinct()` is listed among things that "add up" (schema.md, `CanSum`
  section). Distinct counts are not additive over groups.
- Binning drops rows with a missing key field (bin.md), while `by` keeps them
  as a `"null"` group (spread.md). Completeness differs silently between the
  two.
- `treemap` drops negative sizes silently (finding of the space-traits
  research, N6YYcKQM). Rule V makes it an error.
- No check stops summing a field that is cumulative over the fold's key
  inside a `partition` cell (Section 3). This waits on #1198.

## 9. Sources

- Lenz, H.-J. and Shoshani, A. "Summarizability in OLAP and Statistical Data
  Bases." SSDBM 1997, 132 to 143.
  [ResearchGate](https://www.researchgate.net/publication/3711076_Summarizability_in_OLAP_and_statistical_data_bases).
  Shoshani's encyclopedia entry "Summarizability":
  [ResearchGate](https://www.researchgate.net/publication/313020697_Summarizability).
- Horner, J., Song, I.-Y. and Chen, P. P. "An Analysis of Additivity in OLAP
  Systems." DOLAP 2004, 83 to 91.
  [doi:10.1145/1031763.1031779](https://doi.org/10.1145/1031763.1031779).
- Hurtado, C. and Mendelzon, A. "OLAP Dimension Constraints." PODS 2002.
  [PDF](https://ftp.cs.toronto.edu/pub/papers/pods02hm.pdf). Hurtado, C.,
  Gutierrez, C. and Mendelzon, A. "Capturing Summarizability with Integrity
  Constraints in OLAP." TODS 30(3), 2005.
  [doi:10.1145/1093382.1093388](https://doi.org/10.1145/1093382.1093388).
- Pedersen, T. B., Jensen, C. S. and Dyreson, C. E. "A Foundation for
  Capturing and Querying Complex Multidimensional Data." Information Systems
  26(5), 2001.
  [doi:10.1016/S0306-4379(01)00023-0](<https://doi.org/10.1016/S0306-4379(01)00023-0>).
  Pre-aggregation for non-strict, non-covering hierarchies:
  [VLDB 1999](https://homes.cs.aau.dk/~csj/Papers/Files/1999_pedersenVLDB.pdf).
- Mazón, J.-N., Lechtenbörger, J. and Trujillo, J. "A Survey on
  Summarizability Issues in Multidimensional Modeling." Data and Knowledge
  Engineering 68(12), 2009.
- Kimball Group. "Additive, Semi-Additive, and Non-Additive Facts."
  [kimballgroup.com](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/additive-semi-additive-non-additive-fact/).
- Wickham, H. and Hofmann, H. "Product Plots." IEEE TVCG 17(12), 2011.
  [PDF](https://vita.had.co.nz/papers/prodplots.pdf).
- Bertin, J. _Semiology of Graphics_ (1967; English 1983). QS versus Q, as
  recorded in the GoFish scale-transforms proposal (artifact TduMB8U1).
- Goodchild, M. F. and Lam, N. S.-N. "Areal Interpolation: A Variant of the
  Traditional Spatial Problem." Geo-Processing 1, 1980, 297 to 312.
  Overview: [GIS&T Body of Knowledge, Areal Interpolation](https://gistbok-ltb.ucgis.org/30/concept/9234).
- Pebesma, E. et al. `sf::st_interpolate_aw`.
  [Reference](https://search.r-project.org/CRAN/refmans/sf/html/interpolate_aw.html).
- Openshaw, S. _The Modifiable Areal Unit Problem._ CATMOG 38, 1984.
- Mennis, J. "Generating Surface Models of Population Using Dasymetric
  Mapping." The Professional Geographer 55(1), 2003.
- Bettini, C., Jajodia, S. and Wang, X. S. _Time Granularities in Databases,
  Data Mining, and Temporal Reasoning._ Springer, 2000.
- OGC Abstract Specification Topic 21, Discrete Global Grid Systems
  (ISO 19170-1).
- Lex, A., Gehlenborg, N., Strobelt, H., Vuillemot, R. and Pfister, H.
  "UpSet: Visualization of Intersecting Sets." IEEE TVCG 20(12), 2014.
- Bartonicek, A., Urbanek, S. and Murrell, P. "No More, No Less than Sum of
  Its Parts." JCGS 34(3), 2025 (cited in #1198 and #984).
- Measure theory: [Content (measure theory)](<https://en.wikipedia.org/wiki/Content_(measure_theory)>),
  [Partition of a set](https://en.wikipedia.org/wiki/Partition_of_a_set),
  [Radon–Nikodym theorem](https://en.wikipedia.org/wiki/Radon%E2%80%93Nikodym_theorem),
  [Histogram](https://en.wikipedia.org/wiki/Histogram).
- GoFish: issues #48 (cells, comment of 2026-10-07), #1198 (stocks, flows,
  values per unit), #1197 (`CanAdd`), #984 (space kinds from traits);
  `apps/docs/docs/js/api/operators/partition.md`, `bin.md`, `stack.md`,
  `core/schema.md`; branch `docs-stack-signed-partition`;
  `packages/gofish-graphics/stories/forwardsyntax/Bin.stories.tsx`,
  `Partition.stories.tsx`, `MosaicChart.stories.tsx`.
