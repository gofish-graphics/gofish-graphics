---
title: "Distributions as First-Class Datatypes"
section: Speculative Notes
order: 65
status: speculative
---

# Distributions as first-class datatypes

> **Status: design exploration (2026-10-02).** Nothing here is implemented, and this note
> does not pick a design. It is the first step on uncertainty, which
> [#980](https://github.com/gofish-graphics/gofish-graphics/issues/980) collects. It builds
> on the datatype direction from
> [#773](https://github.com/gofish-graphics/gofish-graphics/issues/773), where a datatype
> says what it can do and a mark or operator says what it needs. Every syntax below is a
> sketch. Any syntax needs sign-off on real renders before we build it.

## 1. The question

GoFish has no way to show uncertain data. A cell in a table is always one number or one
category. This note asks what happens if a distribution is one more kind of value in a
cell, with its own capabilities, and how many uncertainty visualizations we get from that
type and the operators we already have.

The note uses a few terms of art. Each one is defined here once.

- **Distribution.** A rule that gives a probability to each set of possible values. We
  write `Dist<T>` for a distribution over values of type `T`.
- **Draw.** One value picked at random from a distribution. A set of draws is a sample.
- **Typeclass.** A named set of operations that a type provides, plus rules (laws) those
  operations obey. This is the style of the
  [Lean mathlib](https://leanprover-community.github.io/mathlib4_docs/) algebra
  hierarchy. A type can provide many typeclasses, and a typeclass can extend another.
  We also call a typeclass a capability.
- **Monoid.** A type with an addition that is associative and has a zero, e.g., counts.
- **Torsor.** A type of points that you can subtract to get a difference, and to which
  you can add a difference, but which has no zero of its own, e.g., dates or temperatures.
  The differences form a group, e.g., durations.
- **Module.** A type you can add and scale by real numbers, e.g., lengths.
- **Functor.** A type wrapper `F` with a `map` that turns a function `T → U` into a
  function `F<T> → F<U>`, and that keeps identity and composition.
- **Monad.** A functor with `pure` (wrap one value) and `bind` (run a step that produces
  a new wrapped value from each inner value, and flatten the result).

This note does not use the Stevens scale types. It describes data the way
[Kindlmann and Scheidegger](https://vis.cs.ucdavis.edu/vis2014papers/TVCG/papers/2181_20tvcg12-kindlmann-2346325.pdf)
(TVCG 20(12), 2014) and the Flint note ([What GoFish can learn from Flint](./flint-chart-notes.md))
do, by the operations the data supports. An axis or a layout is a picture of a datatype,
so a mark can show a value only when the picture keeps the operations the value has. This
is Mackinlay's expressiveness rule in typeclass form.

These rules were already agreed in the #773 discussion, and this note takes them as given.

- A rect length needs a vector, which is a group or a monoid of values that are zero or more.
- `stack` needs a monoid whose sum means something.
- A position needs an order and a torsor.
- A torsor has no origin, so a bar of a date or a temperature is a type error until you
  subtract a reference point.
- Units ride on the type. Celsius to Fahrenheit is an affine map on points and a linear
  map on differences.

## 2. Where GoFish is today

This section lists what exists, with file and line, and where a distribution type would
plug in.

**Values and measures.** A channel value is a raw number or string, or a `datum` wrapper
that carries the value and an optional measure
(`packages/gofish-graphics/src/ast/data.ts:122` for the wire shape,
`data.ts:139` for the class, `data.ts:203` for `value` and `datum`). A measure is a plain
string (`data.ts:11`). There are three sources of a measure. The field name is a weak
default. `field(name, measure)` is a hard annotation (`data.ts:243`). A transform such as
`bin()` tags its output array with a provenance map under a symbol. (Since #994 that map
is the `HasUnit` class of the array's column types, `schema.ts`.) `resolveMeasure` combines the three and throws on a
conflict (`packages/gofish-graphics/src/ast/channels.ts:165`).

**Field expressions.** `field(name)` returns a `FieldExpr` with a pipeline of operations.
The full list is `sort`, `reverse`, `bin`, `dropNulls`, `normalize`, `sum`, `mean`,
`count` and `distinct` (`packages/gofish-graphics/src/ast/fieldExpr.ts:34`). The IR mirrors
it as `FieldOpIR` (`packages/gofish-ir/src/frontend/schema.ts:639`).

**Channel types.** A channel is `size`, `pos`, `color`, `raw` or `dims`
(`channels.ts:37`). A size channel folds its rows with `sumBy` and a position channel
folds them with `meanBy` (`channels.ts:280` and `channels.ts:283`). This is the closest
thing GoFish has to a capability today. A size channel assumes its values add, and a
position channel assumes its values average. Both assume the values are numbers.

**How GoFish decides what a column is.** No column has a declared type. When a channel
may be discrete, `isNonNumericEntryField` reads the rows and calls a column categorical if
any value does not parse as a finite number
(`packages/gofish-graphics/src/ast/marks/createOperator.ts:818`). Every other column is a
number.

**Underlying space.** Each node computes an underlying space per axis. Its kind is
`continuous`, `ordinal` or `undefined`
(`packages/gofish-graphics/src/ast/underlyingSpace.ts:11`). A continuous space has three
cases, built by `POSITION` (`underlyingSpace.ts:170`), `SIZE` (`underlyingSpace.ts:232`)
and `DIFFERENCE` (`underlyingSpace.ts:224`). `ORDINAL` is at `underlyingSpace.ts:261`.
Positioned spaces unify per measure, and `mergeMeasures` throws when two measures differ
(`underlyingSpace.ts:301`). `stack` sums its children's widths into a position that starts
at 0 (`packages/gofish-graphics/src/ast/constraints/distribute.ts:219` to `226`). The
underlying space describes the layout space. It is not a datatype, but it is the
"picture" half of the expressiveness check.

**Frontend IR.** Chart data is inline JSON rows, an external Arrow table, a selection of
another chart's marks, or the previous tier (`DataIR`, `schema.ts:157`). A field accessor
is `{type: "field", name, measure?, ops?}` (`schema.ts:630`), and a datum is at
`schema.ts:666`. A `derive` carries measure provenance for its output columns because the
array symbol cannot cross the Python bridge (`schema.ts:196`). The IR has no column types.

**Python bridge.** Python takes rows or any dataframe that narwhals supports and converts
it to Arrow (`packages/gofish-python/gofish/arrow_utils.py:26`). `field()` and `datum()`
mirror the JS forms (`packages/gofish-python/gofish/ast.py:2651` and `ast.py:2523`).
A `derive` lambda runs in Python and the result comes back over the bridge.

**Time.** The `time` namespace (`sequence`, `history`, `transition`, `stagger`,
`parallel`) is at `packages/gofish-graphics/src/ast/marks/time.ts:627`. `time.sequence`
is a spread on the time axis, which is the direction a hypothetical outcome plot needs.

### Where a distribution type would plug in

1. **A column type.** Something has to record that a column holds `Dist<T>` and what `T`
   is. Today the only per-column record is the measure string and the provenance symbol.
   Either the measure grows into a structured type (a carrier type, a unit and a set of
   capabilities), or a second sidecar like the provenance symbol carries column types.
   (Since #994 there is one record: the unit is the `HasUnit` class of a column type.) The
   #773 work on putting the origin on the datatype needs the same record, so the two
   should share it.
2. **Channel inference.** `inferNumeric` in `channels.ts` is where a `Dist<T>` value would
   meet a channel that expects `T`. This is where a lift happens or a type error is raised.
3. **Field expressions.** Summaries of a distribution (`mean`, `quantile`, `interval`,
   `prob`) are new `FieldOp` entries in `fieldExpr.ts` and `FieldOpIR` in the IR.
4. **A draw key.** Turning distributions into draws adds a key to every group, as
   ggdibbler does. In GoFish that is a `by` key, so it goes where operators partition
   rows (`createOperator.ts`).
5. **Underlying space.** An axis over a `Dist<T>` needs a data domain. The support of a
   normal distribution is the whole real line, so the domain has to come from quantiles or
   from the draws.
6. **IR and Python.** `DataIR` and the Arrow transport need a way to carry a
   distribution cell, as parameters, as draws, or both (see section 8).

## 3. Precedent

This section surveys what other systems do. The links were checked on 2026-10-02.

**R `distributional`.** O'Hara-Wild, Kay, Hayes and Hyndman,
[distributional](https://pkg.mitchelloharawild.com/distributional/). It stores a vector of
distribution objects as a vctrs vector, so a distribution fits in one cell of a data frame.
It offers `mean`, `variance`, `median`, `density`, `cdf`, `quantile`, `generate` and
`hilo` (an interval). A distribution can be a named family with parameters, or an
empirical distribution from samples. It supports arithmetic on distributions. The
forecasting package fable stores its forecasts in this type, and ggdist reads it.

**R `posterior::rvar`.** Bürkner, Gabry, Kay and Vehtari,
[rvar](https://mc-stan.org/posterior/reference/rvar.html). An `rvar` is an array of random
variables. Its storage is an array whose first dimension indexes draws. When you do
arithmetic on two rvars, draw `i` of one meets draw `i` of the other. So if two values come
from the same model fit, their correlation survives the arithmetic. This is the main
difference from a vector of independent distribution objects.

**ggdist.** Kay, "ggdist: Visualizations of distributions and uncertainty in the grammar
of graphics", IEEE TVCG 30(1), 414 to 424, presented at VIS 2023
([project page](https://mucollective.northwestern.edu/project/2023-ggdist),
[package](https://github.com/mjskay/ggdist)). Its `stat_slabinterval` family takes
`distributional` objects or rvars and draws a slab (a density or a CDF) and an interval.
Half-eye plots, gradient intervals, CCDF bars and dot plots are all members of the family.
Its scales understand distributions, so a log scale transforms the distribution itself.

**ggdibbler.** Mason, Cook, Goodwin and VanderPlas, "A mathematical framework and software
implementation for uncertainty visualisation",
[arXiv:2606.24217](https://arxiv.org/abs/2606.24217) (June 2026). These are its main
points.

- A table whose cells are random variables is a "random matrix" (Definition 3.3). A plain
  number is a distribution with all its mass at one point (Definition 4.4).
- A plot is a continuous function from data to pictures, so the continuous mapping
  theorem applies (Theorem 3.1). As the uncertainty shrinks, the picture of the uncertain
  data should converge to the picture of the exact data. They call this visual convergence
  (Definition 3.4).
- A scale acts on a distribution by changing the variable. The probability of a set `A`
  of scaled values is the probability of the set of data values that map into `A`
  (Definition 4.1).
- Samples are the only representation they accept (sections 4.2.2 to 4.2.5). A point
  estimate shows no spread. A density does not have the same domain as the data, so it
  cannot feed the plot's statistic. Quantiles need an order, so they fail for categories,
  and they do not extend to more than one dimension.
- Each statistic runs once per draw, because the draw ID is added to the group key
  (section 4.2.5, Figure 6).
- Draws need their own position adjustment nested inside the plot's own adjustment
  (Definition 4.3, section 4.4). The four directions are x (dodge), y (stack), z
  (transparency) and time (animation). Stacking draws on the measured axis is wrong,
  because "stacking is only a viable position adjustment when the sum of the stacked
  groups holds meaning".
- HOPs, pixel maps and value-suppressing palettes are one plot with an animation, a
  subdivision (a dodge and a stack at once) or a transparency adjustment.
- The package samples 10 draws by default (the `times` argument), and it assumes that
  separate distributions are independent (section 6).

**Uncertain&lt;T&gt;.** Bornholt, Mytkowicz and McKinley, "Uncertain&lt;T&gt;: a
first-order type for uncertain data", ASPLOS 2014
([PDF](https://www.cs.utexas.edu/~bornholt/papers/uncertaint-asplos14.pdf)). It is a
generic type in C# and other languages. Arithmetic on `Uncertain<T>` values builds a lazy
Bayesian network instead of computing a number, so a value used twice stays one random
variable. A conditional such as `if (speed > 4)` becomes a hypothesis test. The runtime
draws samples until it can decide, with a stated confidence, whether the condition is more
likely true than false.

**Probability monads.** Ramsey and Pfeffer showed that distributions form a monad and
used this for the semantics of a stochastic lambda calculus
([POPL 2002](https://www.cs.tufts.edu/~nr/pubs/pmonad-abstract.html)). Erwig and
Kollmansberger built a Haskell library on the same idea
([JFP 2006](https://web.engr.oregonstate.edu/~erwig/papers/PFP_JFP06.pdf)). Lean mathlib
defines `PMF` (a probability mass function) with `PMF.pure`, `PMF.bind` and a `Monad`
instance
([Monad.lean](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Probability/ProbabilityMassFunction/Monad.html)).
For general measures it defines `map`, `join` and `bind` on `MeasureTheory.Measure`,
which is the Giry monad
([GiryMonad.lean](https://leanprover-community.github.io/mathlib4_docs/Mathlib/MeasureTheory/Measure/GiryMonad.html)).

**TensorFlow Probability and PyTorch.** Both have `Distribution` objects with two shapes
([TFP guide](https://www.tensorflow.org/probability/examples/Understanding_TensorFlow_Distributions_Shapes),
[PyTorch docs](https://pytorch.org/docs/stable/distributions.html)). The batch shape is
a set of independent distributions that need not be identical. The event shape is the
shape of one draw, and its parts may depend on each other. A call to `sample` adds a
sample shape in front. This is the same split as independent cells versus a joint
distribution over several cells.

**SciPy and ArviZ.** `scipy.stats` has frozen distributions such as `norm(loc, scale)`,
and newer random variable classes such as `scipy.stats.Normal` that support
transformations like `abs`, `exp` and `truncate`
([reference](https://docs.scipy.org/doc/scipy/reference/stats.html)).
[ArviZ](https://python.arviz.org/) stores posterior draws as xarray data with `chain` and
`draw` dimensions. Python users will hand us one of these two forms, or a NumPy array of
draws.

**Vega-Lite.** The [errorbar](https://vega.github.io/vega-lite/docs/errorbar.html) and
errorband marks compute an extent (`ci`, `stderr`, `stdev` or `iqr`) from raw rows, or
take precomputed bounds. There is no distribution type, so Vega-Lite can only show
summaries.

**No More, No Less.** Bartonicek, Urbanek and Murrell, "No more, no less than sum of its
parts: groups, monoids, and the algebra of graphics, statistics, and interaction", JCGS
2025 ([doi:10.1080/10618600.2024.2429708](https://doi.org/10.1080/10618600.2024.2429708)).
It argues that a stacked plot is valid when the statistic is a monoid, and that stacking
is the direction that works for selection. We take its examples and not its fixed list of
structures, because typeclasses can be combined and refined.

**Named techniques.** Hypothetical outcome plots (HOPs) animate draws (Hullman, Resnick
and Adar, [PLOS ONE 2015](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4646698/)).
Quantile dotplots draw a fixed number of quantiles as dots (Kay, Kola, Hullman and Munson,
[CHI 2016](https://idl.uw.edu/papers/when-ish-is-my-bus)). Value-suppressing uncertainty
palettes (VSUPs) give fewer colors to more uncertain values (Correll, Moritz and Heer,
[CHI 2018](https://tableau.com/research/publications/value-suppressing-uncertainty-palettes)).
Pixel maps split each region of a map into cells colored by draws (Lucchesi, Kuhnert and
Wikle, [Vizumap, JOSS 2021](https://joss.theoj.org/papers/10.21105/joss.02409)).

### What the precedent agrees on

| System             | Cell holds                | Dependence between cells | Representation         |
| ------------------ | ------------------------- | ------------------------ | ---------------------- |
| distributional     | one distribution object   | independent              | parameters or samples  |
| rvar               | one slot of a draws array | shared draws keep it     | draws                  |
| ggdist             | distributional or rvar    | whatever the input has   | per mark               |
| ggdibbler          | distributional            | independent              | draws only             |
| Uncertain&lt;T&gt; | a node in a lazy network  | shared nodes keep it     | draws on demand        |
| TFP, PyTorch       | an entry of a batch       | event shape keeps it     | parameters, then draws |
| Vega-Lite          | a number                  | not modeled              | summaries only         |

Two things are common to all of them. A distribution lives in a cell, and the system needs
some way to say whether two cells share draws.

## 4. The algebra

### Dist is a functor

`map(f): Dist<T> → Dist<U>` is the pushforward. The probability of a set `B` of `U`
values is the probability of the set of `T` values that `f` sends into `B`. For a sample,
`map` applies `f` to each draw. For a named family, a closed form exists for some `f`,
e.g., an affine map of a normal is a normal. Otherwise we fall back to draws.

A scale is a function from data to pixels, so a scale acts on a distribution by `map`.
This is ggdibbler's Definition 4.1 and ggdist's scale awareness. A unit change is also a
`map`. A distribution of Celsius points maps to a distribution of Fahrenheit points by the
affine map. A distribution of Celsius differences maps by the linear part only. The unit
rules from #773 carry over without change.

### Dist is a monad

`pure(x)` is the distribution with all its mass at `x`. A plain number in a cell is
`pure` of that number, which is ggdibbler's Definition 4.4. `bind(d, k)` draws `x` from
`d` and then draws from `k(x)`. A hierarchical model is a chain of `bind` calls.

The monad is what describes joint values. A pair of distributions `(Dist<A>, Dist<B>)` is not the
same as a distribution of pairs `Dist<(A, B)>`. The second can say that `A` and `B` move
together. To compute `a - b` from two uncertain cells, we need the joint. If the cells are
independent, the joint is the product of the two. If the cells come from one model fit,
the joint is in the shared draws, as in rvar and Uncertain&lt;T&gt;.

### What Dist&lt;T&gt; can do depends on T

The operations on `Dist<T>` depend on the capabilities of `T`. A mark asks for an
operation, and the operation asks for a capability of `T`.

| Operation on `Dist<T>`          | Needs from `T`                                  | Result type            |
| ------------------------------- | ----------------------------------------------- | ---------------------- |
| draw, `map`, `pure`, `bind`     | nothing beyond being a set we can sample        | `T`, `Dist<U>`         |
| support                         | a topology (for draws, the set of seen values)  | set of `T`             |
| probability of a value          | a discrete `T`                                  | number from 0 to 1     |
| density                         | a reference measure on `T` (length on numbers)  | number per unit of `T` |
| mode                            | a density or a probability of each value        | `T`                    |
| CDF, quantile, median, interval | a linear order                                  | `T`, `Interval<T>`     |
| expectation (mean)              | an affine structure, so weighted averages exist | `T`                    |
| variance, standard deviation    | a torsor whose differences have a norm          | difference type of `T` |

Two rows of this table follow from the #773 rules.

- **The mean of a torsor is a point.** You can average dates, because a weighted average
  with weights that sum to 1 is defined on a torsor. The mean of `Dist<Date>` is a date,
  and the mean of `Dist<°C>` is a temperature point with no origin. So a bar of the mean
  temperature is still a type error, for the same reason as before.
- **The spread of a torsor is a difference.** The standard deviation of `Dist<Date>` is a
  duration, and the standard deviation of `Dist<°C>` is a Celsius difference. An error
  bar's length is therefore a vector, which is what a rect length needs.

A categorical `T` has no order and no averages. `Dist<Category>` gives only the
probability of each category, the mode, draws and functions of those, such as entropy.
This matches ggdibbler's reason for rejecting quantiles.

A product type `T × U` has marginals (`map` with a projection), but no single quantile.
This matches ggdibbler's Figure 5.

### Dist&lt;T&gt; is not a T

`Dist<T>` does not inherit the capabilities of `T`.

- **It has no linear order.** One distribution is above another only in the partial
  sense of stochastic dominance. So `Dist<T>` is not a position type, and it cannot be
  placed on an axis as one point.
- **Its sum is not the sum of the values.** Two distributions over a monoid add by
  convolution only when they are independent. In general you need the joint.

The rules for marks follow from this. A mark can use a `Dist<T>` in one of the three ways
in section 5. Each way gets back to `T`, or uses a mark whose channel type is `Dist<T>`.

### Independent cells versus shared draws

There are two models of dependence.

- **Independent cells.** Each cell holds its own distribution, as in distributional and
  ggdibbler. Draw 3 of one cell has no relation to draw 3 of another cell.
- **Shared draws.** All cells come from one joint sample, as in rvar. Draw 3 of every cell
  is one outcome of the whole model.

This choice changes what some plots mean.

- **Ensemble lines.** A line that joins draw 3 in 1990 to draw 3 in 1991 is one possible
  path only if draw 3 is one outcome of the joint. With independent cells, the line jumps
  at random from year to year, and its shape says nothing about the data. So a connecting
  mark over draws needs shared draws. A connecting mark over independent cells should be a
  type error.
- **HOPs.** Frame 3 shows draw 3 of every cell. A viewer compares cells within a frame.
  This is correct when the frame is one outcome of the joint. With independent cells, it
  is correct only if the cells are truly independent.
- **Stacked totals.** Within one draw, a stack of draws from different categories has a
  meaningful total, which is one possible total. The draw is the unit of the joint.

The second point gives a rule for stacking. The draws of one cell form a sample. Folding a
sample by sum gives a number that grows with the number of draws, so it has no meaning.
Folding a sample by an average or a quantile gives an estimate that does not depend on the
sample size. So a draw key provides only the folds that do not depend on the sample size,
and `stack` needs a key whose fold is a sum. Stacking by draw is a type error. Stacking by
category inside one draw is fine.

## 5. How marks and operators use Dist&lt;T&gt;

There are three ways a chart can use a distribution. ggdibbler's paper calls the first
"uncertainty as noise" and ggdist's way "uncertainty as signal".

### (a) Lift, or uncertainty as noise

A channel that expects `T` receives `Dist<T>`. The chart draws `n` values from each cell
and runs once per draw, with the draw ID added to every group key. Each draw is a normal
chart, so the channel's own rules still apply to each draw. A rect length still needs a
vector, and a bar of a temperature is still an error.

The draws of one cell land in the same place, so they need their own placement inside the
placement the chart already has. These are the options in GoFish terms.

- **x, a dodge.** `spread({ by: "draw", dir: ... })` on an axis that is not the measured
  one. This exists.
- **z, transparency.** Draw every draw in the same place with low opacity. This needs an
  operator that puts its groups on top of each other in one slot. `scatter` already does
  this when the positions are data values. Inside a `spread` or a `stack` slot there is no
  such operator yet.
- **t, animation.** `time.sequence({ by: "draw" })`. This exists.
- **y, a stack on the measured axis.** This is a type error, by the rule in section 4.

These are the capability rules for lifting.

1. The channel's requirement on `T` applies to each draw.
2. Every statistic in the flow (a `derive`, an aggregate field op, a `bin`) runs once per
   draw.
3. The draw key provides only the folds that do not depend on sample size. An operator
   that sums over its key (`stack`, a size channel's `sumBy`) cannot use the draw key.
4. A connecting mark (`line`, `ribbon`, `time.transition`) that joins draws across cells
   needs shared draws.

### (b) Consume, or uncertainty as signal

Some marks take `Dist<T>` itself. These are the ggdist geometries. Each one needs certain
capabilities of `T`.

| Mark                | Draws                                          | Needs from `T`               |
| ------------------- | ---------------------------------------------- | ---------------------------- |
| `interval`          | one or more nested intervals at given levels   | linear order                 |
| `slab`              | the density as a filled shape along the T axis | linear order, density        |
| `gradient` interval | a bar whose opacity follows the CDF or density | linear order, CDF or density |
| quantile `dots`     | `k` quantiles as dots, binned and stacked      | linear order, quantile       |
| probability bar     | the probability of each category, stacked      | discrete `T`                 |

The axis under a signal mark is the axis of `T`. A scale acts on the distribution by `map`,
so a log scale on the axis changes the slab's shape correctly. The quantile dotplot stacks
dots, and that stack is a count of quantiles, which is a monoid. It is not a stack of
draws of one value, so it does not break the rule from section 4.

### (c) Summary with field expressions that return T

A summary turns `Dist<T>` back into `T` (or `Interval<T>`) before the channel sees it.
These would be new field ops.

- `field("y").mean()` needs an affine `T` and returns `T`.
- `field("y").quantile(0.9)` needs an ordered `T` and returns `T`.
- `field("y").interval(0.95)` needs an ordered `T` and returns `Interval<T>`. GoFish
  already has interval positions (`scatter({ yMin, yMax })` and the `dims` interval form),
  so an error bar is a summary and an existing operator.
- `field("y").sd()` returns the difference type of `T`.
- `field("y").prob()` needs a discrete `T` and returns a probability for each category.

The existing `field("y").mean()` averages over rows. A distribution summary works inside
one cell. These are two different operations, and they would need two different names, or
a rule for which one applies (see section 8).

### The errors we want

If a chart passes `Dist<T>` where `T` is needed and nothing lifts it, the error should
name the missing step. These are sketches of the text.

A distribution reaches a number channel with no lift:

```
rect: channel "h" expects a number of type Count (sales), but field "sales" holds
Dist<Count>. A distribution is not one number. Choose one of these:
  - summarize it:  rect({ h: field("sales").mean() })
  - draw it:       add sample({ n: 50 }) to the flow and place the draws
  - show it:       use interval({ y: "sales" }) or slab({ y: "sales" })
```

A stack over the draw key:

```
stack({ by: "draw", dir: "y" }): "draw" is a sample index. The draws of one value are
a sample, and their sum grows with the number of draws, so the stacked total has no
meaning. stack needs a key whose groups add up to a whole.
Place the draws with spread({ by: "draw", dir: "x" }), with time.sequence({ by: "draw" }),
or stack by a category inside each draw.
```

A quantile on an unordered type:

```
field("species").interval(0.95): an interval needs an order on the values, but
Dist<Category> (species) has none. Use field("species").prob() for the probability of
each category, or draw it with sample().
```

A bar of an uncertain torsor:

```
rect: channel "h" needs a length, but field("temp").mean() is a temperature point (°C)
with no origin. Subtract a reference first, e.g., field("temp").minus(datum(0, "°C")),
or show the value as a position with scatter({ y: field("temp").mean() }).
```

A line across independent cells:

```
line({ along: "year" }) joins draw 3 of "temp" in 1990 to draw 3 in 1991, but each
year's "temp" is an independent distribution. Draw 3 in one year has no relation to draw
3 in the next, so the line is not a possible path.
Use draws from one joint sample (see rvar()), or summarize first with
field("temp").interval(0.8) and draw a ribbon.
```

## 6. How far it gets us

This table checks twelve target visualizations. The classes are these.

- **Type alone.** The `Dist<T>` type, its summaries and the draw key are enough, with
  operators and marks GoFish has today.
- **New mark.** One new mark is needed.
- **New operator.** A new operator, placement direction or scale is needed.

| Target                                 | Mode    | Class        | GoFish pieces                                                                                                       |
| -------------------------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Error bars                             | summary | type alone   | `field(y).interval(0.95)` into `scatter({ yMin, yMax })`, thin `rect`                                               |
| Point and multi-level interval         | summary | type alone   | two intervals and a point, `.layer(...)`. An `interval` mark would be shorter                                       |
| Quantile dotplot                       | summary | type alone   | `quantiles(20)` as rows, `bin`, `stack` of `circle` (the unit violin pattern)                                       |
| Fan chart over time                    | summary | type alone   | intervals at three levels per time, `ribbon` through interval marks, layered                                        |
| Spaghetti or ensemble lines            | lift    | type alone   | `sample()`, `line({ along: "year" })` grouped by draw, low opacity. Needs shared draws                              |
| HOPs                                   | lift    | type alone   | `sample()`, `time.sequence({ by: "draw" })`                                                                         |
| ggdibbler uncertain bar chart          | lift    | type alone   | `spread` by category, `sample()`, `spread({ by: "draw" })` inside each slot                                         |
| ggdibbler uncertain stacked bar, dodge | lift    | type alone   | `spread` by x, `sample()`, `spread` by draw, `stack` by category inside each draw                                   |
| Half-eye or slab                       | signal  | new mark     | `slab` mark over the density. A density grid in `derive` and a `ribbon` can stand in for it                         |
| Gradient interval                      | signal  | new mark     | a rect whose opacity follows the CDF. GoFish has no fill gradient along a mark today                                |
| ggdibbler stacked bar, transparency    | lift    | new operator | an overlay operator (the z direction) that puts each draw's stack in the same slot                                  |
| Uncertain choropleth                   | mixed   | new operator | HOPs version is type alone. A pixel map needs a subdivide operator. A VSUP needs a scale over value and uncertainty |

Two more targets do not fit one row each.

- **Uncertain scatter.** Draws of `x` and `y` placed by `scatter` overlap on their own,
  because the positions are data values. Low opacity gives the z direction with no new operator. This
  is type alone. An error ellipse needs the covariance and a new mark.
- **Uncertain density.** A density curve per draw falls out once the draw is a group key,
  but GoFish has no density transform today. This needs a data transform, not a new mark
  or operator.

The bottom line is that 8 of the 12 targets fall out of the type alone. Two need one new
mark each (`slab` and a gradient fill). Two need a new operator or scale, and the main
missing piece is the z direction, an overlay inside a layout slot. "Type alone" here
includes the summary field ops and the `sample()` draw key, which are part of the type's
design and do not exist yet.

## 7. API sketches

These are sketches, not proposals. The examples use a table of sales estimates with a
mean and a standard error per region, and a table of model draws.

### 7.1 Declaring a distribution-valued field

**Shape A. Constructors in `derive`.** A distribution is an object in a cell, as in
distributional.

```js
import { chart, derive, normal, spread, interval } from "gofish-graphics";

chart(estimates)
  .flow(
    derive((d) => ({ ...d, sales: normal(d.mean, d.se) })),
    spread({ by: "region", dir: "x" })
  )
  .mark(interval({ y: "sales" }));
```

```python
from scipy import stats
from gofish import chart, spread, interval

estimates["sales"] = [stats.norm(m, s) for m, s in zip(estimates["mean"], estimates["se"])]

chart(estimates).flow(spread(by="region", dir="x")).mark(interval(y="sales"))
```

In Python, the bridge would have to recognize SciPy frozen distributions and encode the
known families as parameters. Unknown families would need to be sampled in Python.

**Shape B. A field annotation over existing columns.** The data stays plain. The field
expression builds the distribution where a field is used.

```js
const sales = dist.normal({ mean: "mean", sd: "se", measure: "sales ($)" });

chart(estimates)
  .flow(spread({ by: "region", dir: "x" }))
  .mark(interval({ y: sales }));
```

```python
from gofish import chart, spread, interval, dist

sales = dist.normal(mean="mean", sd="se", measure="sales ($)")
chart(estimates).flow(spread(by="region", dir="x")).mark(interval(y=sales))
```

This serializes as a field accessor with a new op, so it crosses the IR with no change to
`DataIR`. A distribution does not exist in the data, so another chart that reads this
one's marks with `selectAll` cannot see it.

**Shape C. Draws grouped into an rvar.** The data is a long table with one row per draw,
or a wide array of draws. `rvar` names the column of values and the column of draw IDs.
Every cell that shares a draw ID is one outcome of the joint.

```js
// draws: [{ year, draw, temp }, ...], one row per (year, draw)
const temp = rvar("temp", { draw: "draw", measure: "°C" });

chart(draws)
  .flow(scatter({ by: "year", x: "year" }))
  .mark(interval({ y: temp, levels: [0.5, 0.8, 0.95] }));
```

```python
import arviz as az
from gofish import chart, scatter, interval, rvar

idata = az.from_netcdf("fit.nc")
temp = rvar(idata.posterior["temp"], dims={"year": years}, measure="°C")

chart(temp.to_table()).flow(scatter(by="year", x="year")).mark(
    interval(y=temp, levels=[0.5, 0.8, 0.95])
)
```

This keeps the joint, so ensemble lines and HOPs mean what they look like. It is the form
Bayesian users already have in ArviZ and posterior.

**Shape D. Column types at the chart.** `chart(data, { types: { sales: dist.normal(...) } })`.
This puts the type next to the data instead of inside one channel. It overlaps with B, and
it is the same record #773 would need for an origin.

**Strongest.** C and B feel strongest together. C is the representation that keeps
dependence and works for every `T`, and it matches what Python scientists hold. B is the
spelling that adds nothing to the data and serializes as a field expression. A is the
most familiar to R users, but a cell that holds an object is the hardest to carry across
the Python bridge.

### 7.2 Choosing noise or signal

**Shape 1. A `sample()` operator in the flow.** `sample({ n })` turns every distribution
cell into `n` rows with a `draw` key. After it, the draw key is a normal `by` key, so the
placement is whatever operator the user writes. The stack error falls out of the `by`
capability check.

```js
// ggdibbler uncertain stacked bar, dodge version
chart(estimates)
  .flow(
    spread({ by: "region", dir: "x" }),
    sample({ n: 20 }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
    stack({ by: "product", dir: "y" })
  )
  .mark(rect({ h: sales, fill: "product" }));

// HOPs
chart(estimates)
  .flow(
    spread({ by: "region", dir: "x" }),
    sample({ n: 50 }),
    time.sequence({ by: "draw" })
  )
  .mark(rect({ h: sales }));
```

```python
chart(estimates).flow(
    spread(by="region", dir="x"),
    sample(n=20),
    spread(by="draw", dir="x", spacing=0),
    stack(by="product", dir="y"),
).mark(rect(h=sales, fill="product"))
```

**Shape 2. A draw op on the channel.** `rect({ h: field("sales").draw() })` lifts one
channel, and a default placement (a dodge on the free axis) applies unless the flow names
one. This is shorter, but the placement is hidden, and the draw key appears without the
user writing it.

**Shape 3. The mark chooses.** A mark whose channel type is `Dist<T>` (`interval`, `slab`,
`dots`) shows the distribution as signal. A mark whose channel type is `T` raises the
error in section 5 unless the flow has `sample()` or the channel has a summary. Shape 3 is
the rule for signal marks, and it combines with Shape 1 or Shape 2 for noise.

```js
// Half-eye: slab and interval on the same distribution
chart(estimates)
  .flow(spread({ by: "region", dir: "x" }))
  .mark(slab({ y: sales, side: "end" }))
  .layer(interval({ y: sales, levels: [0.66, 0.95] }));
```

```python
chart(estimates).flow(spread(by="region", dir="x")).mark(
    slab(y=sales, side="end")
).layer(interval(y=sales, levels=[0.66, 0.95]))
```

**Shape 4. A chart option.** `chart(data, { uncertainty: "noise" })`. This is one switch
for the whole chart, so it cannot mix modes, and it hides the draw placement. It is listed
for completeness.

**Strongest.** Shape 1 with Shape 3 feels strongest. The draw key is a normal `by` key,
so every placement direction is an operator the user can see, and the stacking error is the
ordinary capability check on `by`. Signal marks choose themselves by their channel type.

## 8. Open questions

1. **What crosses the Python to JS bridge, parameters or draws?** Parameters are small
   and exact, but only for known families. Draws work for every `T` and keep the joint,
   but they are large. If JS does the sampling, Python parity and the capture tests need
   the same draws on both sides, which means a shared seeded random number generator or
   sampling only in Python. Arrow can hold a struct column for parameters and a list column
   for draws, but neither is in `DataIR` today.
2. **What is the default dependence?** ggdibbler assumes independent cells, and rvar
   assumes shared draws. If a chart mixes a Shape A cell with a Shape C rvar, do we treat
   them as independent, or is that an error?
3. **How does this sit with the #773 origin work?** Both need a per-column type record
   that holds a carrier type, a unit and capabilities. Should that record exist first, with
   `Dist<T>` as one of its constructors? The measure is a plain string today
   (`data.ts:11`). A related question is whether subtracting a reference point
   (`field("temp").minus(ref)`) acts per draw, and what happens when the reference is
   uncertain too.
4. **Interaction.** No More, No Less finds that stacking is the safe direction for
   selection, and ggdibbler finds it is the unsafe direction for draws. ggdibbler's authors
   guess that this lets both live in one plot. In GoFish terms, a tier would declare its
   fold (a sum or a sample average), selection would need sum folds, and draws would need
   average folds. Is that the right rule, and does it predict where highlighting works on
   an uncertain stacked bar?
5. **The axis domain.** A normal distribution has infinite support. Which quantile range,
   or which set of draws, sets the axis extent and the nice ticks?
6. **Row folds versus cell summaries.** `field("y").mean()` already averages rows. A
   distribution mean averages inside a cell. Do these share a name with a rule, or get two
   names?
7. **Conditionals.** `filter` on an uncertain value has no single answer. Uncertain&lt;T&gt;
   turns it into a hypothesis test. Should `filter` on `Dist<T>` be an error, a test with
   a stated threshold, or a per-draw filter after `sample()`?
8. **Uncertain categories.** A `by` key that holds `Dist<Category>` puts each draw in a
   different group. This works after `sample()`. As a signal it is a probability bar. Is
   anything else needed for a color channel and its legend?
9. **The z direction.** Is an overlay inside a layout slot a new operator, a `spread`
   option, or `layer` over groups? A pixel map also needs a subdivide operator.
10. **Visual convergence as a test.** A story could render the same chart with variance
    near 0 and check that it matches the plain chart, using `capture-diff`. How many draws
    does a story need to render the same each time, and is `n` a chart option or a
    `sample()` argument only?
11. **Size.** `n` draws of every mark multiplies the SVG node count by `n`. At what size
    do we need a canvas path?
