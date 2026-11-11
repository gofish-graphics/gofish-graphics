# Stacking areas and densities

## Recommendation

1. A stacked area is the limit of stacked bars. A stack only moves each bar and never resizes one, so in the limit it moves each **cross-section** of an area (its interval at one position u on the other axis) and keeps its length. That argument fixes the rules. It is not the interface: a shape gives its cross-sections as a **function** of u, and no spec or operator sees a list of samples. Sampling happens only inside the engine, at a tolerance.
2. An operator may use a small, closed set of operations on those functions (evaluate, add, scale, restrict, maximum and minimum, integrate), and writes back one offset function per child. A box answers with a constant function, so every node has cross-sections and nothing asks whether a child is a box. `crossSection` joins `geometry()` as one more query.
3. A stack's `baseline` option chooses where its own 0 is: `Baseline.start()`, `.end()`, `.middle()`, `.wiggle()` or `.at(part, fraction)`. Each gives every cross-section an offset and never changes a length. `spread` should take it too, except `wiggle`. It does not replace `anchor`, which is a choice per pair of children.
4. A density is two channels over one hidden variable t, `ribbon({ x: mass.support(), h: mass.density() })`, over a `Dist` type with typed methods. `partition` restricts the function to each cell, which draws the croissant with no grid and no `intersect`. A custom curve is a `reduce` whose result is a function value with its range.
5. A `spread` could read the same cross-sections to place shapes by their outlines; how gaps should be measured so they look equal is designed on its own page, [Optical spacing](https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty).

## Settled

- The stacked area is spelled `chart(jobs).flow(stack({ by: "series", dir: "y" })).mark(ribbon({ x: "date", h: "count", fill: "series" }))`: a stack, then one ribbon per series.
- The thin-box limit is the argument that sets the rules, not the interface. The interface is a function of u, and sampling stays inside the engine.
- The stack's option is `baseline`, with values `Baseline.start()`, `.end()`, `.middle()`, `.at(part, fraction)` and `.wiggle()`. `Trait.diverging` stays the default and desugars to `Baseline.at`, and an explicit `baseline` over a diverging unit is an error.
- Custom methods on a field expression are two verbs: `.map((x, i, xs) => value, { unit })` for one value per row, and `.reduce((xs) => value, { unit })` for one value per group. There is one form of `reduce`.
- A 100% stack is `normalize` on the values followed by a plain stack: there is no divide operation.
- The density channel pair is spelled `support()` and `density()` (Josh is checking the name with Matt Kay, ggdist). Rejected: `value()`, which clashes with GoFish's `value(...)` constructor, and `points()` or `grid()`, which name the sampling.
- `.then` cannot be the custom method's name: a field expression with a `then` method would be adopted as a promise by `resolveValue`.
- How a bin's cells are shared stays under review, so no callback form is proposed for bins here.

This page is focused on two examples, the stacked area and the croissant, the idea behind them, and the interface it leads to. Spacing moved to its own page. The full survey of eleven examples is at commit [2f3b2a4bf](https://github.com/gofish-graphics/gofish-graphics/blob/2f3b2a4bf/proposals/stack-profile/proposal.md). Every type on this page is in `proposals/stack-profile/types-sketch.ts`, which typechecks on its own.

The review page is `page.html` beside this file.

## Terms

| Term             | Meaning                                                                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-section    | A shape's interval along one axis at one position u on the other axis: how far it reaches below and above its baseline there. It is two-sided, and it is a query at a point, not a sample. "A shape's cross-sections" means the function from u to that interval. A box's cross-section is the same at every u. |
| Slice            | Used only in the limit argument: one of the thin boxes a stacked bar visualization is made of.                                                                                                                                                                                                                  |
| Function value   | A value that is a function of one hidden parameter, with its range (the `Fn` type). A density's height over t is one.                                                                                                                                                                                           |
| Knot             | A point where a function value has a corner. A function built from rows has one knot per row, and between knots it is a straight line or its `curve`.                                                                                                                                                           |
| Baseline         | A node's own 0 point. A rect's baseline is its bottom edge, and it bubbles up: a parent with `alignment: "baseline"` lines up its children's 0 points. A stack's `baseline` option chooses where the stack's 0 is. In the code the model is `StackOrigin` (`constraints/distribute.ts`).                        |
| Lowering         | The last step of rendering, which turns a laid-out node into drawing commands (paths, in pixels).                                                                                                                                                                                                               |
| Per-x form       | `scatter` or `spread` by x, then `stack`, which is today's spelling of a stacked area. The stack runs once in each x column and sees only that column.                                                                                                                                                          |
| Field expression | `field("mass")`, a column expression like polars' `pl.col("mass")`. Bare, it is a value per row. Its methods make other kinds of value (see "What the methods compute").                                                                                                                                        |

## Why stacking may reshape an area

Stacking areas changes the shape of each area, which a box cannot do. Josh's framing: "a ribbon's area is a limit of some AABBs. So if that shape change can happen with the discrete AABB union I feel like it's more acceptable and natural to have the ribbon behavior be guided by that." (An AABB is an axis-aligned bounding box, the box every GoFish node reports today.) This section uses that limit to find the rules a stack must keep. The rules then define the interface in the next section, which has no slices in it.

![Four series as stacked bars 5, 10, 20 and 60 bars wide, then the stacked area. Each bar reads its series at the bar's middle. Real renders with today's `spread` and `stack`; each panel scales to its own height.](img/limit.png)

_Four series as stacked bars 5, 10, 20 and 60 bars wide, then the stacked area. Each bar reads its series at the bar's middle. Real renders with today's `spread` and `stack`; each panel scales to its own height._

Each bar panel, which runs today:

```js
chart(rows) // one row per series per bar
  .flow(
    spread({ by: "bar", dir: "x", spacing: 0 }),
    stack({ by: "series", dir: "y" })
  )
  .mark(rect({ w: barWidth, h: "value", fill: "series" }));
```

```python
chart(rows).flow(
    spread(by="bar", dir="x", spacing=0),
    stack(by="series", dir="y"),
).mark(rect(w=bar_width, h="value", fill="series"))
```

<h4>The argument, checked step by step</h4>
<ol>
<li><b>A ribbon is the limit of a row of thin rects</b>, one per slice of x. Correct. One detail: each rect reads the series at its slice, so the limit is the series' curve through its rows. How a series is read between its rows (its <code>curve</code>) is part of the shape.</li>
<li><b>In the discrete case, stacking uses only what boxes allow.</b> Correct. Each column is an ordinary stack of rects, as in the panels above. The stack moves each rect and never changes its width or height.</li>
<li><b>One series' rects form a staircase band whose outline changes shape</b>, because each slice moves by a different amount, while no box is reshaped. Correct. In the limit the staircase becomes the stacked ribbon.</li>
<li><b>So in the limit a stack moves each cross-section and never resizes it.</b> Correct. The thickness at each x never changes, only the offset, so stacking is a translation at each u. Three invariants follow. Thickness is kept at every u, so every band keeps its area (this is Cavalieri's principle: two regions whose cross-sections have equal length at every u have equal area). The order of the bands is kept at every u. A baseline is only an offset, the same for every band at one u.</li>
<li><b>Series sampled at different x fit too.</b> Splitting a slice in two does not change the shape, so the columns can use the union of every series' breakpoints. Correct, with one condition: the new slice's height is the series' value at the new x, which comes from its curve (linear between rows, as ggplot2 reads it). Outside its own x range a series' thickness is 0. In the function form this is just evaluation: a series' cross-section can be asked at any u.</li>
<li><b>Contour spacing reads the same cross-sections.</b> The closest approach of two shapes is the smallest gap over their shared positions, a skyline. Correct, with a limit: the gap is measured along the spacing axis at each u, not as a straight-line distance. The optical spacing page shows what that does to glyphs and shapes.</li>
<li><b>A rigid shape (a circle, text, a line with no thickness) is one box that cannot be split, so it gets one translation.</b> This needs a correction. The full survey made a rigid part in a curved stack an error. The limit gives a rigid part a defined place instead: it rests on the highest point of the boundary below it across its width, as a skyline does. But then the cross-sections under it are no longer glued, and a gap opens wherever the boundary below is lower. So the argument turns the old rule into a choice, which is decision 2.</li>
</ol>
<p><b>What the argument does not say.</b> It does not say a shape is stored as slices, or that an operator should see them. The slices are the thin boxes of the argument. Shrinking them gives a function of u, and the next section makes that function the interface.</p>
<h4>How it relates to the approaches in the full survey</h4>
<p>Runner-up B, the per-x form, is this argument at a fixed dx: the slices are the rows' x positions, each column is stacked on its own, and the ribbon connects the stacked points. Approach A is the limit: a child gives its cross-sections as a function of x, so the stack does not depend on where the rows happen to be. A can ship first as B, by choosing the columns as the union of breakpoints. That is the declared shortcut in the full survey.</p>
<h4>Does every baseline only move cross-sections?</h4>
<div class="table-wrap"><table>
<tr><th>Baseline</th><th>Offset at u</th><th>Only moves cross-sections?</th></tr>
<tr><td><code>Baseline.start()</code></td><td>0</td><td>Yes</td></tr>
<tr><td><code>Baseline.middle()</code></td><td>minus half the total at u</td><td>Yes</td></tr>
<tr><td><code>Baseline.at(part, fraction)</code></td><td>minus (the start of <code>part</code> at u plus <code>fraction</code> times its thickness at u)</td><td>Yes</td></tr>
<tr><td><code>Baseline.wiggle()</code></td><td>a running sum over the positions to the left, chosen to flatten the bands (d3's <code>stackOffsetWiggle</code>)</td><td>Yes, but its value depends on dx. d3 sums over the rows' x, so finer rows give a slightly different curve. In the limit the sum is an integral, so the proposal defines wiggle on the function, not on the rows.</td></tr>
</table></div>
<p>Every baseline holds, and nothing in layout resizes a cross-section. A 100% stacked area is not a separate divide operation. It is <code>normalize</code>, the callback <code>(x, i, xs) =&gt; x / sum(xs)</code> with <code>xs</code> the values in one x column, which changes the values before layout, followed by a plain stack that only moves cross-sections. When the whole is a drawn shape instead of 1 (a bottle filled by share), that is a size choice for the stack's total, not a new operation.</p>

## The interface

This section says what a shape reports, what an operator may do with it, what the operator writes back, and how this fits the `geometry()` queries that exist today. Every type shown here is in `types-sketch.ts`, which typechecks with `tsc --noEmit --strict`.

#### A function value

A function value has its own range, so a spec never names one. It also lists its knots, which is what makes most queries exact. A function built from rows is a straight line between rows (or its `curve`), so its sum, maximum and integral come from the knots alone, with no sampling. A function with no closed form, such as a kernel density, is marked `"smooth"`, and a query on it runs to a tolerance.

The function value:

```ts
type Interval = { readonly min: number; readonly max: number };

/** A plain function value as a user writes it: no parameter yet. */
type FnInit = {
  /** The range of the parameter. It belongs to the value, so no spec names it. */
  readonly over: Interval;
  readonly at: (t: number) => number;
  /** Where `at` has a corner. Between two knots it is smooth. A function
   *  built from rows has one knot per row. */
  readonly knots?: readonly number[];
  /** How `at` runs between knots. "linear": a straight line, so sums,
   *  maxima and integrals are exact from the knots alone. "smooth": no
   *  closed form, so a maximum or an integral is found to a tolerance. */
  readonly between?: "linear" | "smooth";
};

/** A value that is a function of one hidden parameter. */
type Fn = FnInit & {
  /** Which hidden parameter this is. Two function channels of one mark
   *  must share it. The engine sets it; a user never writes it. */
  readonly param: symbol;
};
```

#### The cross-section query

A shape's cross-sections are one query: given an axis, the function from u (the position on the other axis) to the interval the shape covers there, measured from its baseline. A box answers with a constant function, the same way `defaultGeometry` falls back to the box for the other queries. So every node has cross-sections, and no operator dispatches on whether a child is a box or a ribbon.

The query, and the helper every reader calls:

```ts
type Box = { min: [number, number]; max: [number, number] };
interface HasBox {
  readonly box: Box;
}

/** The geometry query: the shape's interval along `axis` at position u on
 *  the other axis, measured from the shape's baseline. */
type CrossSection = {
  /** Where the shape exists along the cross axis. */
  readonly over: Interval;
  /** Reach below (`min`, at most 0) and above (`max`) the baseline at u. */
  readonly at: (u: number) => Interval;
  readonly knots?: readonly number[];
  readonly between?: "linear" | "smooth";
};
interface HasCrossSection {
  readonly crossSection?: (axis: 0 | 1) => CrossSection;
}

/** The helper every reader calls. A shape that does not answer is read as
 *  its box: a constant cross-section, as `defaultGeometry` falls back to
 *  the box for the other queries. So every node has one, and nothing asks
 *  "is this a box". */
const crossSection = (
  g: HasBox & HasCrossSection,
  axis: 0 | 1
): CrossSection => {
  if (g.crossSection) return g.crossSection(axis);
  const across = 1 - axis;
  const reach = { min: g.box.min[axis], max: g.box.max[axis] };
  return {
    over: { min: g.box.min[across], max: g.box.max[across] },
    at: () => reach,
    knots: [],
    between: "linear",
  };
};
```

<h4>What an operator may do</h4>
<p>An operator may use only these operations. Each one takes functions and returns a function or a number, written as composing closures, so none of them samples. The sketch file has a short implementation of each.</p>
<div class="table-wrap"><table>
<tr><th>Operation</th><th>What it gives</th><th>Exact for rows?</th></tr>
<tr><td>Evaluate at u</td><td>a thickness or an edge at one position; 0 outside the range</td><td>yes</td></tr>
<tr><td>Add two, pointwise</td><td>the stack's running sum; the knots are the union</td><td>yes, the result is still linear</td></tr>
<tr><td>Scale by a number</td><td>minus half the total for <code>Baseline.middle()</code>; minus an edge</td><td>yes</td></tr>
<tr><td>Restrict to a cell</td><td>what <code>partition</code> does</td><td>yes</td></tr>
<tr><td>Maximum and minimum over the range</td><td>the box, and the scale domain</td><td>yes: at a knot or an end</td></tr>
<tr><td>Integrate over the range</td><td>area</td><td>yes: the trapezoid rule on the knots</td></tr>
</table></div>
<p>What it writes back: one offset per child, <code>offset: (u: number) =&gt; number</code>. Today it writes one number, the translate. For a box child the function is constant, which is today's translate. What it may not do: read a child's rows, vertices or samples, or change the size of a cross-section.</p>
<p><b><code>Baseline.wiggle()</code> needs more.</b> d3's wiggle chooses the baseline's slope at u from each band's thickness and its slope there, weighted by thickness. So it needs the derivative of each thickness, products of functions, and a running integral (an integral from the start up to u, which is a function, not a number). For functions built from rows these are still exact: the derivative of a straight line is a constant between knots. These three operations join the set only for wiggle, which is part of decision 5.</p>

The operations, and what an operator writes back:

```ts
/** The one parameter of a cross-section's functions: position on the
 *  cross axis. Every child of one operator shares it. */
declare const U: unique symbol;

/** A cross-section's lower or upper edge, as a function of u. */
const edge = (cs: CrossSection, side: "min" | "max"): Fn => ({
  over: cs.over,
  at: (u) => cs.at(u)[side],
  knots: cs.knots,
  between: cs.between,
  param: U,
});

const union = (a: readonly number[] = [], b: readonly number[] = []) =>
  a
    .concat(b)
    .filter((t, i, ts) => ts.indexOf(t) === i)
    .sort((p, q) => p - q);
const hull = (a: Interval, b: Interval): Interval => ({
  min: Math.min(a.min, b.min),
  max: Math.max(a.max, b.max),
});
const inside = (f: FnInit, t: number) => t >= f.over.min && t <= f.over.max;
const sameParam = (f: Fn, g: Fn) => {
  if (f.param !== g.param)
    throw new Error("two functions of different hidden parameters");
};

/** 1. Evaluate at u. Outside its range a thickness is 0. */
const at = (f: Fn, u: number): number => (inside(f, u) ? f.at(u) : 0);

/** 2. Add two, pointwise. The knots are the union. This is the stack's
 *  running sum. */
const add = (f: Fn, g: Fn): Fn => {
  sameParam(f, g);
  return {
    over: hull(f.over, g.over),
    at: (u) => at(f, u) + at(g, u),
    knots: union(f.knots, g.knots),
    between:
      f.between === "linear" && g.between === "linear" ? "linear" : "smooth",
    param: f.param,
  };
};

/** 3. Scale by a number: "minus half the total" for Baseline.middle(). */
const scale = (f: Fn, k: number): Fn => ({ ...f, at: (u) => k * f.at(u) });

/** 4. Restrict to a cell. This is what `partition` does. */
const restrict = (f: Fn, cell: Interval): Fn => ({
  ...f,
  over: {
    min: Math.max(f.over.min, cell.min),
    max: Math.min(f.over.max, cell.max),
  },
  knots: f.knots?.filter((k) => k >= cell.min && k <= cell.max),
});

/** The points where an exact rule reads the function: its range's ends and
 *  its knots. For a "smooth" function the engine adds points until the
 *  answer is within `tolerance`; that loop is internal and is left out. */
const breakpoints = (f: Fn) =>
  union([f.over.min, f.over.max], f.knots).filter((t) => inside(f, t));

/** 5. Maximum and minimum over the range: the box, and the scale domain.
 *  Exact for "linear"; for "smooth", a search to `tolerance`. */
const maximum = (f: Fn, _tolerance = 0): number =>
  Math.max(...breakpoints(f).map(f.at));
const minimum = (f: Fn, tolerance = 0): number =>
  -maximum(scale(f, -1), tolerance);

/** 6. Integrate over the range: area, and Baseline.wiggle(). Exact for
 *  "linear" (the trapezoid rule on the knots is the integral). */
const integrate = (f: Fn, _tolerance = 0): number => {
  const ts = breakpoints(f);
  let s = 0;
  for (let i = 1; i < ts.length; i++)
    s += ((ts[i] - ts[i - 1]) * (f.at(ts[i]) + f.at(ts[i - 1]))) / 2;
  return s;
};

/** What an operator writes back for each child: one offset per child, a
 *  function of u. Today it is one number, the translate. For a box child
 *  the function is constant, which is today's translate. */
type Placement = { readonly offset: (u: number) => number };
```

A stack, written with those operations:

```ts
/** A stack, written with the operations above and nothing else. Child i's
 *  lower edge lies on child i − 1's upper edge at every u, and `baseline`
 *  turns the total into the offset of the whole. No child is resized. */
const stack = (
  children: readonly CrossSection[],
  baseline: (parts: readonly Fn[]) => Fn
): Placement[] => {
  const lower = children.map((c) => edge(c, "min"));
  const thick = children.map((c) =>
    add(edge(c, "max"), scale(edge(c, "min"), -1))
  );
  const base = baseline(thick);
  let below = scale(base, 0); // the sum of the thicknesses before child i
  return children.map((_, i) => {
    const offset = add(add(base, below), scale(lower[i], -1));
    below = add(below, thick[i]);
    return { offset: (u) => at(offset, u) };
  });
};

const total = (parts: readonly Fn[]): Fn => parts.reduce((s, f) => add(s, f));
const Baseline = {
  start: (): ((parts: readonly Fn[]) => Fn) => (parts) =>
    scale(total(parts), 0),
  middle: (): ((parts: readonly Fn[]) => Fn) => (parts) =>
    scale(total(parts), -0.5),
};

// A box child answers with a constant cross-section, so its offset is
// constant: today's translate.
const bars = [
  crossSection({ box: { min: [0, 0], max: [10, 30] } }, 1),
  crossSection({ box: { min: [0, 0], max: [10, 20] } }, 1),
];
const placed = stack(bars, Baseline.start());
const translate = placed[1].offset(5); // 30
```

<h4>How it relates to <code>geometry()</code></h4>
<p>Today <code>Geometry</code> is <code>HasBox &amp; HasEnclosingCircle &amp; HasOutline</code> (<code>ast/geometry/index.ts</code>). Every query except <code>box</code> is optional, each has a helper that falls back to the box, and <code>GoFishNode.geometry()</code> answers only after layout, in the node's local pixel frame. Its header comment says the form that answers while sizing is issue #967. <code>crossSection</code> joins <code>Geometry</code> as one more optional query, with the helper above. The other queries can be read from it: <code>box</code> is the cross-section's minimum and maximum, and an outline is the upper edge followed by the lower edge reversed, sampled to the outline's tolerance.</p>
<p>A stack, though, needs the function before layout, in data units. It gives the scale its own space, which is the largest total over u, and the scale must be solved before anything has pixels. The prototype shows the split: its <code>resolveUnderlyingSpace</code> uses the function in data units, and its <code>layout</code> uses it in pixels (<code>_prototypeFnCurve.tsx</code>). So the same function is asked twice: before layout, as the child's size along the stack axis (a function of u instead of one number), and after layout, as the geometry query. The form before layout is the same open problem as #967, and this page does not design it in detail (decision 13).</p>
<p><b>Does a function-valued size fit how a stack folds its children's spaces?</b> On main, PR #1268 is merged, and it names the properties traits; the trait a stack checks is <code>CanSum</code> on the units it adds. The stack's fold is <code>distributeSpaceFold</code> in <code>constraints/distribute.ts</code>: it needs every part's space to be continuous with an origin (pinned or free), unifies their units, checks with <code>Units.sum</code> that the units of the free parts can be summed, and lays the parts end to end, each part's interval about its baseline added to the running sum. A function-valued size fits that: the sum is pointwise, the unit check reads units and not values so it does not change, and the stack's space becomes the minimum of its lowest edge and the maximum of its highest edge over u, which are two queries in the set above. I have not built it, so this is a reading of the code, not a test.</p>
<h4>What changes for <code>ribbon</code></h4>
<p>On main, <code>ribbon</code> and <code>line</code> are relational marks (<code>createRelationalMark</code> in <code>ast/marks/chart.ts</code>): each builds a <code>Connect</code> node that joins consecutive marks, and in <code>.mark()</code> position it adds an invisible <code>blank()</code> per row for the connector to join. A ribbon there has no <code>x</code> channel and no shape of its own. In the proposal a ribbon is one node per series that owns its function, built from its rows (one knot per row) or given as a function value, and it answers <code>crossSection</code>, so the stack above it moves the whole band at once.</p>
<h4>Where sampling happens</h4>
<p>Only in three places, all inside the engine:</p>
<ol>
<li><b>When a mark is drawn (lowering).</b> The function is resampled adaptively, in pixels, composed with the coordinate transform, to half a pixel. The prototype does this with the existing <code>adaptive-resampling.ts</code>.</li>
<li><b>When a geometry query is asked at a tolerance.</b> This is how <code>outline(tolerance)</code> works today: "a polyline that is never farther from the true shape than the tolerance asked for" (<code>ast/geometry/outline.ts</code>).</li>
<li><b>When a maximum or an integral of a function with no closed form is needed</b>, such as a kernel density's peak for the scale domain, or the integral inside <code>Baseline.wiggle()</code>. For functions built from rows none is needed, since the knots give exact answers.</li>
</ol>
<p>One honest exception: the prototype's <code>dataExtent</code> finds a curve's maximum with 512 even samples plus golden-section refinement, when the mark is built, before layout. That is the one place it samples early. In the proposal it is case 3, and it runs only for a function marked <code>"smooth"</code>.</p>
<h4>Naming: cross-section</h4>
<p>Josh was unsure about "profile" for the cumulative slices, because it suggests one side only. The precedents agree with him. The recommendation is <b>cross-section</b> for the value at one u: an interval, so two-sided by construction, and a query at a point rather than a sample. The trait is <code>HasCrossSection</code>. Users never write the word in a spec.</p>
<div class="table-wrap"><table>
<tr><th>Name</th><th>Where</th><th>What it names</th><th>Sides</th></tr>
<tr><td>profile</td><td>elevation profile, lathe profile, depth profile</td><td>one curve</td><td>one, which is Josh's concern</td></tr>
<tr><td>skyline</td><td>computational geometry</td><td>the upper envelope of a set of boxes</td><td>one</td></tr>
<tr><td>contour</td><td>Reingold and Tilford's tidy trees (1981)</td><td>a left contour and a right contour, each the outermost node at each depth, compared to place subtrees</td><td>one each, used as a pair</td></tr>
<tr><td>cross-section</td><td>Cavalieri's principle</td><td>two regions whose cross-sections have equal length at every height have equal area. A stack is this exactly: it moves each cross-section and keeps its length, so every band keeps its area</td><td>two</td></tr>
<tr><td>chord</td><td>Steiner symmetrization</td><td>each chord perpendicular to a line is replaced with a chord of the same length centered on the line. This is <code>Baseline.middle()</code></td><td>two</td></tr>
<tr><td>parallel X-ray</td><td>Gardner, <i>Geometric Tomography</i></td><td>the function giving the length of every chord in one direction</td><td>thickness only, no position</td></tr>
<tr><td>tube</td><td>interval analysis (the Tubex and Codac libraries)</td><td>an interval of two functions over time, stored as a set of slices of width δ. The same split as here, between the idea and its sampled storage</td><td>two</td></tr>
<tr><td>ribbon, area</td><td>ggplot2 <code>geom_ribbon(ymin, ymax)</code>, d3 <code>area().y0().y1()</code></td><td>a band given by its two edges</td><td>two</td></tr>
<tr><td>ascent, descent</td><td>typography; GoFish's own words</td><td>reach above and below a baseline (GoFish never says height and depth for this)</td><td>two, named separately</td></tr>
</table></div>
<p>Runners-up: "extent" (d3's <code>extent</code> returns <code>[min, max]</code>, but GoFish already uses it for a box's extent) and "band" (it clashes with a kernel's bandwidth on this same page, and with d3's band scale).</p>

## 1. Stacked area, with each baseline

US unemployment by industry, monthly from 2000 to 2010, 14 industries (vega-datasets `unemployment-across-industries`, from the Bureau of Labor Statistics). The stack's `baseline` chooses where its own 0 is. Each choice is an offset at each u, so every band keeps its thickness.

![`Baseline.start()`, the default: the first industry starts at 0. Real render of today's spelling.](img/jobs-start.png)

_`Baseline.start()`, the default: the first industry starts at 0. Real render of today's spelling._

Proposed:

```js
chart(jobs)
  .flow(stack({ by: "series", dir: "y" }))
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));
```

```python
chart(jobs).flow(stack(by="series", dir="y")).mark(
    ribbon(x="date", h="count", fill="series")
)
```

Today (runs):

```js
chart(jobs)
  .flow(scatter({ by: "date", x: "date" }), stack({ by: "series", dir: "y" }))
  .mark(ribbon({ h: "count", fill: "series" }));
```

![`Baseline.middle()`: the middle of the whole is at 0 (emulated: d3's silhouette offset computed in `derive`). The y axis is dropped, because position no longer means an amount from 0.](img/jobs-middle.png)

_`Baseline.middle()`: the middle of the whole is at 0 (emulated: d3's silhouette offset computed in `derive`). The y axis is dropped, because position no longer means an amount from 0._

Proposed:

```js
chart(jobs)
  .flow(stack({ by: "series", dir: "y", baseline: Baseline.middle() }))
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));
```

```python
chart(jobs).flow(stack(by="series", dir="y", baseline=Baseline.middle())).mark(
    ribbon(x="date", h="count", fill="series")
)
```

Today (the offset computed by hand, about 20 lines):

```js
chart(jobs)
  .flow(
    derive((rows) => stackRows(rows, { offset: "silhouette" })),
    scatter({ by: "date", x: "date" }),
    scatter({ by: "series", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "series" }));
```

![`Baseline.wiggle()`: the baseline curve that flattens the bands, a streamgraph (emulated: d3's wiggle offset computed in `derive`).](img/jobs-wiggle.png)

_`Baseline.wiggle()`: the baseline curve that flattens the bands, a streamgraph (emulated: d3's wiggle offset computed in `derive`)._

Proposed:

```js
chart(jobs)
  .flow(stack({ by: "series", dir: "y", baseline: Baseline.wiggle() }))
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));
```

```python
chart(jobs).flow(stack(by="series", dir="y", baseline=Baseline.wiggle())).mark(
    ribbon(x="date", h="count", fill="series")
)
```

Today (the offset computed by hand):

```js
chart(jobs)
  .flow(
    derive((rows) => stackRows(rows, { offset: "wiggle" })),
    scatter({ by: "date", x: "date" }),
    scatter({ by: "series", yMin: "y0", yMax: "y1" })
  )
  .mark(ribbon({ fill: "series" }));
```

![`Baseline.at("Neutral", 0.5)`: a diverging stack whose 0 is the middle of the Neutral bar. Real render of today's spelling, on a small survey.](img/likert-baseline.png)

_`Baseline.at("Neutral", 0.5)`: a diverging stack whose 0 is the middle of the Neutral bar. Real render of today's spelling, on a small survey._

Proposed (Trait.diverging stays the default and desugars to this):

```js
chart(survey)
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x", baseline: Baseline.at("Neutral", 0.5) })
  )
  .mark(rect({ w: "count", fill: "response" }));
```

```python
chart(survey).flow(
    spread(by="question", dir="y"),
    stack(by="response", dir="x", baseline=Baseline.at("Neutral", 0.5)),
).mark(rect(w="count", fill="response"))
```

Today (runs; the unit's trait sets the 0):

```js
chart(survey, {
  schema: {
    response: Unit({
      domain: Domain.discrete(LEVELS),
      traits: [Trait.diverging()],
    }),
  },
})
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" })
  )
  .mark(rect({ w: "count", fill: "response" }));
```

<p>The values name a place on the stack, as <code>alignment</code>'s values do, so d3's <code>zero</code> becomes <code>start</code> and Vega-Lite's <code>center</code> becomes <code>middle</code>. <code>Baseline.end()</code> also exists, for a stack that grows the other way. An explicit <code>baseline</code> over a unit with <code>Trait.diverging</code> is an error, because the unit already fixes the 0. With <code>middle</code> and <code>wiggle</code> a position on the value axis is no longer an amount from 0, so the axis can only measure thickness, which is why streamgraphs drop it.</p>
<p><b>Precedent.</b> d3's <code>stackOffsetNone</code>, <code>Silhouette</code>, <code>Wiggle</code> and <code>Diverging</code>; Vega-Lite's <code>stack: "zero" | "center" | "normalize"</code>; matplotlib's <code>stackplot(baseline="zero" | "sym" | "wiggle" | "weighted_wiggle")</code>. Byron and Wattenberg (2008) call the bottom curve g<sub>0</sub> the baseline.</p>
<p><b>Naming.</b> <code>baseline</code> is already GoFish's word for a node's 0 point, and <code>alignment: "baseline"</code> already reads it, so one word names one thing: the stack sets its baseline, and the parent lines baselines up. <code>origin</code> is out because the origin lives on the measure type, and an option by that name would read as overriding it. <code>alignment</code> is out because it is the parent's rule for the other axis.</p>
<h4>Baseline on spread, and anchor</h4>
<p>Three options of <code>spread</code> choose a point, and each answers a different question. Today's behavior is from <code>graphicalOperators/spread.tsx</code> and <code>constraints/distribute.ts</code>.</p>
<div class="table-wrap"><table>
<tr><th>Option</th><th>Axis</th><th>What it chooses</th><th>How many choices</th><th>Today</th></tr>
<tr><td><code>alignment</code></td><td>the other axis</td><td>which point of each child lines up</td><td>one rule for all children</td><td><code>"start" | "middle" | "end" | "baseline"</code>, default <code>"baseline"</code></td></tr>
<tr><td><code>anchor</code></td><td>along the axis</td><td>which point of each child the spacing is measured between</td><td>one rule for each pair of neighbors</td><td><code>"edge"</code> (the default): a gap between facing edges. <code>"start" | "middle" | "end" | "baseline"</code>: a fixed pitch between those points. A stack ignores it: glued parts always chain head to tail</td></tr>
<tr><td><code>baseline</code> (new)</td><td>along the axis</td><td>which point of the whole result is its own 0</td><td>one for the whole</td><td>internal only: <code>StackOrigin</code> (<code>{ part, fraction, mirrored }</code>), passed as <code>origin</code> and only with <code>glue</code>. The code says "a spread packs boxes and has no origin"</td></tr>
</table></div>
<p>So <code>baseline</code> does not replace <code>anchor</code>: one is a choice for each pair of neighbors, the other one choice for the whole. What <code>baseline</code> replaces is the internal <code>StackOrigin</code> and the <code>origin</code> field, and the implicit behavior of <code>Trait.diverging</code>, which becomes a default that desugars to <code>Baseline.at(...)</code>. One detail: <code>StackOrigin</code> has a third field, <code>mirrored</code>, which a diverging unit sets so that the parts on both sides are amounts measured away from the 0. <code>Baseline.at</code> alone sets only the 0, so whether it carries <code>mirrored</code> is decision 4.</p>
<p><b>On <code>spread</code>.</b> A stack is a spread with <code>glue</code>; they are one node, <code>Spread</code>. The recommendation is to allow <code>baseline</code> on <code>spread</code> too, with <code>start</code>, <code>end</code>, <code>middle</code> and <code>at(part, fraction)</code>. "Which point is my 0" is a question every operator that places children along an axis can answer, and a parent's <code>alignment: "baseline"</code> already reads it. <code>Baseline.wiggle()</code> stays stack-only, because it needs glued cross-sections. <code>layer</code> and <code>scatter</code> do not take it: their children are placed in one shared space, whose 0 is the space's own. This is decision 3. Two uses (proposed code, not run):</p>

A diverging bar visualization with gaps between the bars (not run):

```js
chart(survey)
  .flow(
    spread({ by: "question", dir: "y" }),
    spread({
      by: "response",
      dir: "x",
      spacing: 2,
      baseline: Baseline.at("Neutral", 0.5),
    })
  )
  .mark(rect({ w: "count", fill: "response" }));
```

```python
chart(survey).flow(
    spread(by="question", dir="y"),
    spread(
        by="response", dir="x", spacing=2, baseline=Baseline.at("Neutral", 0.5)
    ),
).mark(rect(w="count", fill="response"))
```

Rows of small groups lined up on a chosen member: each patient's visits, with the treatment visit at 0 (not run):

```js
chart(visits)
  .flow(
    spread({ by: "patient", dir: "y" }), // alignment: "baseline" is the default
    spread({
      by: "step",
      dir: "x",
      spacing: 4,
      baseline: Baseline.at("treatment", 0),
    })
  )
  .mark(rect({ w: 12, h: 12, fill: "kind" }));
```

```python
chart(visits).flow(
    spread(by="patient", dir="y"),  # alignment="baseline" is the default
    spread(by="step", dir="x", spacing=4, baseline=Baseline.at("treatment", 0)),
).mark(rect(w=12, h=12, fill="kind"))
```

**`anchor` itself.** Its future is on the [Optical spacing](https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty) page, where the earlier idea was that a pitch spacing absorbs it.

**The per-x spelling.** With today's per-x form, `stack({ baseline: Baseline.middle() })` inside each x column, plus the parent's baseline alignment, already gives the centered stack, because each column's offset depends only on that column. Only `wiggle` needs the whole series, because each offset depends on the neighbors.

## 2. Croissant: a density cut into equal-probability cells

![Today's gallery story `Forward Syntax/Croissant` (real render). The proposed code draws the same picture; it does not run yet.](img/croissant-main.png)

_Today's gallery story `Forward Syntax/Croissant` (real render). The proposed code draws the same picture; it does not run yet._

Proposed:

```js
const params = [{ mean: 0, sd: 1 }];
const d = dist.normal({ mean: "mean", sd: "sd" });
chart(params)
  .flow(partition({ by: d.bin(Bin.quantiles(5)), dir: "x" }))
  .mark(
    layer([
      ribbon({
        x: d.support(),
        h: d.density(),
        inset: 3,
        fill: PAPER_FILL,
        stroke: PAPER_STROKE,
      }),
      circle({ cx: d.median(), cy: 6, r: 3, fill: PAPER_STROKE }),
    ])
  );
```

```python
params = [{"mean": 0, "sd": 1}]
d = dist.normal(mean="mean", sd="sd")
chart(params).flow(partition(by=d.bin(Bin.quantiles(5)), dir="x")).mark(
    layer(
        [
            ribbon(
                x=d.support(),
                h=d.density(),
                inset=3,
                fill=PAPER_FILL,
                stroke=PAPER_STROKE,
            ),
            circle(cx=d.median(), cy=6, r=3, fill=PAPER_STROKE),
        ]
    )
)
```

Today (stories/forwardsyntax/Croissant.stories.tsx; the sequence repeats three times in the file):

```js
const normPdf = (x, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
const gridOf = (f, lo, hi, n) =>
  Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return { x, pdf: f(x) };
  });
const croissant = (grid, { n = 10, fill = FILL, stroke = STROKE } = {}) =>
  layer([
    chart(grid)
      .flow(scatter({ x: "x" }))
      .mark(ribbon({ h: "pdf" }).name("density").hidden()),
  ]).relate(({ density }) => [
    chart(grid)
      .flow(
        derive((rows) =>
          quantileRows(rows, { x: "x", density: "pdf", n: 1000 })
        ),
        partition({ by: field("x").bin(Bin.quantiles(n)), dir: "x" })
      )
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [
            density,
            region({ inset: 3 }),
          ]),
          circle({ cx: field("x").median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);
// on [-3, 3] the missing tails move the outer cells' medians
const normalGrid = gridOf((x) => normPdf(x), -4, 4, 401);
croissant(normalGrid, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE });
```

`d` is an expression over a distribution. Each method makes a different kind of value. `d.bin(Bin.quantiles(5))` is a key that cuts d's axis into 5 cells. `d.support()` and `d.density()` are the position and the height of one curve over a hidden variable t: the support is t ↦ t and the density is t ↦ f(t). The ribbon evaluates both channels as functions of t, as a parametric curve (x(t), y(t)) does, and only lowering samples them. `d.median()` is one number per cell. `partition` on d's axis restricts the function to each cell. A cell of a Dist is the Dist over that cell with its mass, so the cells meet exactly. No `intersect`, hidden ribbon, `relate`, grid or quantile rows. The types of each method are in "The distribution type" below.

#### What the methods compute

A field expression like `field("mass")` works like polars' `pl.col("mass")`: it sees one column. Every named method on it except `bin` is one named instance of one of the two custom methods. `map((x, i, xs) => value)` is called once per row: `x` is this row's value of the field, `i` its index, and `xs` the values of that field over the rows of the current group (the rows the mark or operator reading the channel was given). `reduce((xs) => value)` is called once per group. A user can always write the custom method instead of the named one.

Each method and the custom method it stands for (bins are open; see below):

```js
field("mass"); // a value per row
field("mass").sum(); // .reduce(sum)
field("mass").median(); // .reduce(median)
field("mass").normalize(); // .map((x, i, xs) => x / sum(xs))
field("mass").density(); // .reduce((xs) => fn(kde(xs), { over: extent(xs) }))
field("mass").support(); // field("mass").density().support()

// custom methods, used like built-in ones
const share = field("mass").map((x, i, xs) => x / max(xs), { unit: "ratio" });
const top = field("mass").reduce((xs) => max(xs), { unit: "g" });
```

```python
field("mass")  # a value per row
field("mass").sum()  # .reduce(sum)
field("mass").median()  # .reduce(median)
field("mass").normalize()  # .map(lambda x, i, xs: x / sum(xs))
field("mass").density()  # .reduce(lambda xs: fn(kde(xs), over=extent(xs)))
field("mass").support()  # field("mass").density().support()

share = field("mass").map(lambda x, i, xs: x / max(xs), unit="ratio")
top = field("mass").reduce(max, unit="g")
```

<div class="table-wrap"><table class="methods">
<tr><th>Kind</th><th>Named method</th><th>Formula</th><th>Custom method</th></tr>
<tr><td>Per row</td><td><code>field("mass")</code></td><td>the row's value</td><td><code>.map((x) =&gt; x)</code>. A function accessor works today.</td></tr>
<tr><td rowspan="5">One value per group</td><td><code>.sum()</code></td><td>sum of the present values; missing values are dropped</td><td><code>.reduce(sum)</code></td></tr>
<tr><td><code>.mean()</code></td><td>sum &divide; n over the present values</td><td><code>.reduce(mean)</code></td></tr>
<tr><td><code>.median()</code></td><td>sort the present values; with h = (n &minus; 1) &times; 0.5, interpolate between the values at floor(h) and ceil(h): the type-7 quantile at 0.5, as R and numpy compute it (<code>medianOf</code>, <code>fieldExpr.ts</code>)</td><td><code>.reduce(median)</code></td></tr>
<tr><td><code>.count()</code></td><td>n</td><td><code>.reduce((xs) =&gt; xs.length)</code></td></tr>
<tr><td><code>.distinct()</code></td><td>the number of different values</td><td><code>.reduce((xs) =&gt; new Set(xs).size)</code></td></tr>
<tr><td>Per row, reading the group</td><td><code>.normalize()</code></td><td>x &divide; the group's sum</td><td><code>.map((x, i, xs) =&gt; x / sum(xs))</code></td></tr>
<tr><td rowspan="2">A function value per group</td><td><code>.density()</code></td><td>f(t) = (1 &divide; bw) &Sigma;<sub>i</sub> K((t &minus; x<sub>i</sub>) &divide; bw), K the standard normal density, bw = 0.9 &times; min(sd, IQR &divide; 1.34) &times; n<sup>&minus;1/5</sup> (Silverman's rule, R's <code>bw.nrd0</code>; <code>silvermanBandwidth</code> in <code>overlap.ts</code> computes it). The area under f is n. For a <code>Dist</code>, f is mass &times; its exact density</td><td><code>.reduce((xs) =&gt; fn(kde(xs), { over }))</code>, whose result is a function value with its range</td></tr>
<tr><td><code>.support()</code></td><td>t itself, over the range of the density. That range is open (see the decisions); the lean follows ggdist: for rows, the data's own range, with a bounded estimator; for a <code>Dist</code>, its own range, or its 0.001 to 0.999 quantiles where that range is unbounded</td><td><code>.density().support()</code>: a function value's <code>support()</code> is t &#8614; t over its own range, with the same hidden parameter</td></tr>
<tr><td>Key (bin)</td><td><code>.bin(Bin.step(500))</code>, <code>Bin.thresholds(n)</code>, <code>Bin.quantiles(n)</code></td><td>On main the cells come from the column's domain (its <code>HasDomain</code>), computed once where the data is typed, in <code>chart()</code> or the last <code>derive</code>, so every group of a split sees the same cells, empty ones included (#763; story <code>SharedBinsAcrossGroups</code>). <code>Bin.step(w)</code>: cells [k&times;w, (k+1)&times;w). <code>Bin.thresholds(n)</code>: a step from d3's <code>tickIncrement</code> over the domain, for about n cells. <code>Bin.quantiles(n)</code>: edges at the type-7 quantiles i/n of the column's values (<code>cells.ts</code>)</td><td>Open: how a bin's cells are shared is under review</td></tr>
</table></div>
<p><b>Precedent.</b> A value per group that every row of the group reads is a window function: SQL's <code>median(x) OVER (PARTITION BY g)</code>, or polars' <code>pl.col("x").median().over("g")</code>. <code>normalize</code> is SQL's <code>x / sum(x) OVER (PARTITION BY g)</code>.</p>
<p><b>Bins are the open item.</b> A bin's cells do not come from the group's <code>xs</code>: on main they come from the column's domain, fixed where the data is typed, and the empty cells and their order are kept for the axis. So a bin fits neither custom method as written. How a bin's cells are shared is under review, so this page proposes no custom form for bins.</p>
<p><b>Curves.</b> A density is drawn by two channels of one mark, <code>x: mass.support()</code> (t &#8614; t) and <code>h: mass.density()</code> (t &#8614; f(t)). The ribbon evaluates every channel that is a function of t as a function of t, as a parametric curve (x(t), y(t)) does. The range of t belongs to the value, so no spec names it. Two function channels over different hidden variables in one mark, such as <code>x: mass.support()</code> with <code>h: length.density()</code>, are an error. Precedent: the closest is ggdist (Matt Kay's R package for distributions), whose <code>stat_slabinterval</code> computes <code>x</code> or <code>y</code> (the slab's positions), <code>pdf</code>, <code>cdf</code> and <code>n</code> (<code>Inf</code> for an analytic distribution). Vega-Lite's density transform outputs two fields, <code>value</code> and <code>density</code>, and ggplot2 maps <code>after_stat(x)</code> and <code>after_stat(density)</code>.</p>
<p><b>Area.</b> The area under <code>mass.density()</code> is its row count, so stacked densities add up. ggdist users get the same curve by writing <code>aes(thickness = after_stat(pdf * n))</code>. ggdist instead scales thickness after the fact with <code>normalize</code> (<code>"all"</code>, <code>"panels"</code>, <code>"xy"</code>, <code>"groups"</code> or <code>"none"</code>); here that is the stack's or the spread's job, not the curve's.</p>
<p><b>The range of t.</b> Tools split. seaborn runs a KDE 3 bandwidths past the data (<code>cut=3</code>), and ggplot2 also extends past it. ggdist, for rows, uses <code>density_bounded()</code>, a reflection estimator, and usually trims to the data's range; for an analytic distribution it uses <code>p_limits</code>, the 0.001 and 0.999 quantiles, where the range is unbounded. This is one of the decisions.</p>
<p><b>Naming.</b> <code>support()</code> is the chosen name (Josh is checking it with Matt Kay, author of ggdist). Rejected: <code>value()</code>, which clashes with GoFish's <code>value(...)</code> constructor, and <code>points()</code> or <code>grid()</code>, which name the sampling that specs should not see.</p>
<p><b>Consequences, stated plainly.</b></p>
<ol>
<li><b>A one-value-per-group result is known by its verb.</b> <code>reduce</code> runs once per group, so its value is the same for every row by construction, and a channel that needs one value per group (a <code>circle</code>'s <code>cx</code> in a cell) needs no check. A <code>map</code> whose result happens to be the same for every row is still checked, with the existing "not constant across the connected group" error.</li>
<li><b>A <code>map</code> that reads <code>xs</code> can cost O(n&sup2;).</b> <code>normalize</code> written as <code>map((x, i, xs) =&gt; x / sum(xs))</code> sums the group once per row. The engine passes the same <code>xs</code> array to every row of a group, so a memo keyed on it brings that back to O(n). A named method avoids it outright.</li>
<li><b>A custom method sees one field, so it cannot use two.</b> A mean of x weighted by w reads two fields, so it is a <code>derive</code> step, or an expression over two fields, not a custom method.</li>
<li><b>Units get simpler.</b> The custom method sees one field, so the unit it receives is known. It declares only what it returns: the same unit (<code>sum</code>, <code>median</code>), a ratio (<code>normalize</code>), a count, or a function whose values are that unit's density. Without the declaration, CanSum and the other checks cannot run, so an undeclared result is treated as a plain number that cannot be stacked.</li>
<li><b>Serialization.</b> A named method crosses to Python as data. A Python <code>map</code> reaches JS as a batch call (<code>RESOLVE_ROWS</code>, <code>channels.ts</code>), which today returns one value per row. A Python <code>reduce</code> would be called once per group, and a Python curve needs a new kind of call (see "Where function values appear").</li>
</ol>
<p><b>Docs plan.</b> Each method's API reference entry (its descriptor <code>doc</code>) states its formula and the custom method it stands for, as in the table above. This lands with the implementation.</p>

## 2b. Custom methods: map and reduce

Settled: a user who needs a method that is not built in writes `.map` for one value per row or `.reduce` for one value per group. Josh: "it doesn't make sense to call a reduction/aggregation like sum/mean a map." This section records what each verb takes, why there is exactly one form of `reduce`, and the two words that are taken.

The two verbs:

```js
field("mass").map((x) => x / 1000, { unit: "kg" });
field("mass").map((x, i, xs) => x / sum(xs), { unit: "ratio" });
field("mass").reduce(median, { unit: "g" }); // (xs) => value, any existing function
```

```python
field("mass").map(lambda x, i, xs: x / 1000, unit="kg")
field("mass").map(lambda x, i, xs: x / sum(xs), unit="ratio")
field("mass").reduce(statistics.median, unit="g")
```

#### One form of reduce

`reduce` takes the whole group, `reduce((xs) => value, { unit })`, and nothing else.

- **`Array.prototype.reduce`'s form, `(acc, x) => acc` with an initial value, is not proposed.** The incremental form exists where data streams or is spread over machines, so an aggregate must be built one value at a time and merged: Postgres `CREATE AGGREGATE` with a state function (`SFUNC`), Apache Beam's `CombineFn` (`add_input`, `merge_accumulators`, `extract_output`), and Spark's `Aggregator` (`zero`, `reduce`, `merge`, `finish`). Systems in our setting take the whole group: d3's `rollup(data, reduce, key)`, Observable Plot's reducers `(values) => value`, pandas' `groupby().agg(f)`, and polars' `map_batches(f, returns_scalar=True)` inside `group_by().agg`. Arquero is mixed: `rollup` takes whole-group aggregates such as `op.median("x")`, but a custom one registered with `addAggregateFunction` is incremental (`init`, `add`, `rem`, `value`), because the same definition also runs over sliding windows.

- **A curve is not a second form.** It is the same `reduce`, whose result is a function value instead of a number. A bare JS function cannot be that result: it has no range, and `(d) => number` is already a legal channel value meaning a row accessor (`DeriveMarkProps` in `channels.ts`). So a custom curve returns a function value with its range, made by `fn(at, { over })` or written as a plain `{ at, over }` object. Its `support()` gives the x channel over the same range. The spelling is decision 10.

- **A `map` that ignores `x` and returns `median(xs)` is legal, but it is not a way to write a reduce.** It is called once per row. The reference will point to `reduce`.

Their types (from the sketch):

```ts
/** `field("mass")` over a group of rows is the empirical Dist of those
 *  rows, with mass in rows (a count), so a field expression has the same
 *  methods. Its own methods are the per-row and per-group ones, plus the
 *  two custom ones. */
interface FieldExpr<V extends Unit> extends RowExpr<V>, DistExpr<V, Count> {
  sum(): ValueExpr<V>;
  normalize(): RowExpr<Ratio>;
  /** One value per row. Called once per row with the row's value, its
   *  index, and the group's values. */
  map<R extends Unit>(
    f: (x: number, i: number, xs: readonly number[]) => number,
    o: { unit: R }
  ): RowExpr<R>;
  /** One value per group. Called once per group with the group's values.
   *  A result that is a function (an `FnInit`, with its range) makes a
   *  function value; a number makes one value. */
  reduce<R extends Unit>(
    f: (xs: readonly number[]) => FnInit,
    o: { unit: R }
  ): FnExpr<R>;
  reduce<R extends Unit>(
    f: (xs: readonly number[]) => number,
    o: { unit: R }
  ): ValueExpr<R>;
}

/** A typed constructor for a plain function value. A plain `{ at, over }`
 *  object is the same value. */
const fn = (
  at: (t: number) => number,
  o: { over: Interval; knots?: readonly number[] }
): FnInit => ({ at, ...o });
```

A custom curve (not run):

```js
const curve = field("mass").reduce((xs) => fn(kde(xs), { over: extent(xs) }), {
  unit: "count per g",
});
chart(penguins).mark(ribbon({ x: curve.support(), h: curve }));
```

```python
curve = field("mass").reduce(
    lambda xs: fn(kde(xs), over=extent(xs)),
    unit="count per g",
)
chart(penguins).mark(ribbon(x=curve.support(), h=curve))
```

**`.then` is out.** Any object with a `then` method is a _thenable_: `await`, `Promise.resolve`, `Promise.all` and the return of an `async` function all call it as `then(resolve, reject)`. GoFish resolves channels asynchronously. `resolveValue` in `ast/channels.ts` is an `async` function that returns a channel value that is not a plain object as it is, and it runs on every entry of a channel bag that holds a Python accessor, through `Promise.all`. So in `y: { min: field("a").then(f), max: pythonLambda }` the runtime would call `f(resolve, reject)`, and the channel would never resolve.

**The other `map` in GoFish.** `lib.ts` exports a top-level `map(data, callback)` (`ast/iterators/map.ts`): an async map over an array, a `Map` or an object that returns `Promise<R[]>`, used inside `createMark` bodies. A method `.map` on a field expression does not clash with it in JS, because one is a function and the other a method, and Python exports no `map`. Both mean "apply this to each element", so the word keeps one meaning.

**Rejected.** One `.map` with a `{ fold: true }` flag (polars' `returns_scalar`) keeps one verb but needs the flag, an O(n²) trap without it, and a check that the result is the same across the group. One `.apply((x, xs))` repeats the pandas ambiguity polars removed, and every JS function already has an `apply` method. One `.transform((xs) => column or value)` is the fastest for `normalize`, but it gives up the per-row view, and `Transform` is the name Josh endorsed for the coordinate and palette family.

<h4>Precedent</h4>
<div class="table-wrap"><table>
<tr><th>System</th><th>What the user writes</th><th>Callback gets</th><th>One call returns</th><th>Output type declared by</th></tr>
<tr><td>polars</td><td><code>map_elements(f)</code>, <code>map_batches(f)</code>, <code>rolling_map(f, n)</code>, <code>pipe(f)</code>, <code>.over("g")</code></td><td>one value; a whole Series; a window's Series; the expression</td><td>one value per row; a column, or one value with <code>returns_scalar=True</code>; one per window; an expression</td><td><code>return_dtype=</code></td></tr>
<tr><td>pandas</td><td><code>Series.map(f)</code>, <code>apply(f)</code>, <code>groupby().transform(f)</code>, <code>groupby().agg(f)</code>, <code>pipe(f)</code></td><td>one value; a row or column; a group's Series; a group's Series; the frame</td><td>one per row; varies; same length, or a scalar broadcast to the group; one per group; anything</td><td>nothing; inferred</td></tr>
<tr><td>dplyr</td><td><code>group_by(g) |&gt; mutate(y = x / sum(x))</code>, <code>summarise(m = median(x))</code>, <code>across(cols, f)</code></td><td>a vector expression over the group's columns</td><td>one per row (a length-1 result is recycled); one per group</td><td>the vector's type</td></tr>
<tr><td>SQL</td><td><code>median(x) OVER (PARTITION BY g)</code>; <code>CREATE AGGREGATE</code> (Postgres) with <code>SFUNC</code> and <code>FINALFUNC</code></td><td>an aggregate gets a state and one value at a time</td><td>one per group, or one per row with <code>OVER</code></td><td><code>STYPE</code> and the final function's type</td></tr>
<tr><td>DuckDB, Arrow</td><td><code>create_function(name, f, params, return_type)</code>; <code>pc.register_scalar_function</code>, <code>register_aggregate_function</code></td><td>a value, or an Arrow array</td><td>one per row; one per group</td><td>a declared return type</td></tr>
<tr><td>Spark, Beam</td><td><code>map</code>, <code>mapPartitions</code>; <code>pandas_udf</code> (Series to Series, or Series to scalar); <code>Aggregator</code>; Beam <code>Map</code>, <code>CombineFn</code></td><td>one record; a batch; a Series; an accumulator and one value</td><td>one per row; one per group or window</td><td>a type string or Python type hints, which also pick the kind</td></tr>
<tr><td>Ibis</td><td><code>@ibis.udf.scalar.python</code>, <code>@ibis.udf.agg.builtin</code></td><td>values or columns</td><td>one per row; one per group</td><td>type annotations; the decorator names the kind</td></tr>
<tr><td>JS arrays</td><td><code>xs.map((x, i, xs) =&gt; ...)</code>, <code>xs.reduce((acc, x) =&gt; ..., init)</code></td><td>element, index, the whole array; accumulator and element</td><td>one per element; one</td><td>none</td></tr>
<tr><td>Arquero</td><td><code>derive({ y: d =&gt; d.x / op.sum(d.x) })</code>, <code>rollup({ m: op.median("x") })</code>, <code>escape(f)</code>; <code>addAggregateFunction</code>, <code>addWindowFunction</code></td><td>a row proxy; <code>escape</code> gets a row and cannot use <code>op</code>; a registered aggregate gets a state and one value at a time</td><td>one per row (an aggregate in <code>derive</code> is computed over the group); one per group</td><td>none; the kind is declared by which register call is used</td></tr>
<tr><td>danfo.js</td><td><code>series.map(f)</code>, <code>df.apply(f, { axis })</code>, <code>groupby().agg()</code></td><td>one value; a row or column</td><td>one per row; varies; one per group</td><td>inferred</td></tr>
<tr><td>d3-array</td><td><code>d3.rollup(data, reduce, key)</code>, <code>d3.group</code>, <code>d3.bin().value(f)</code></td><td><code>reduce</code> gets the group's values; an accessor gets <code>(d, i, data)</code></td><td>one per group; one per row</td><td>none</td></tr>
<tr><td>Observable Plot</td><td>a reducer: <code>Plot.groupX({ y: (values, extent) =&gt; ... })</code> or <code>{ reduceIndex(index, values, extent) }</code>; a map: <code>Plot.mapY((values) =&gt; ...)</code>, <code>(index, values) =&gt; ...</code> or <code>{ mapIndex(index, source, target) }</code></td><td>a reducer gets the group's values and its extent; a map gets the series' values</td><td>one per group; an array of the same length (a <code>mapIndex</code> fills the output slots)</td><td>none; the transform names the kind. Checked against Plot's docs source (<code>docs/transforms/group.md</code>, <code>map.md</code>)</td></tr>
<tr><td>Vega, Vega-Lite</td><td>expression strings; <code>aggregate</code> and <code>joinaggregate</code> by op name</td><td>no callbacks</td><td>one per group; one per row (<code>joinaggregate</code>)</td><td>the op</td></tr>
<tr><td>Lodash</td><td><code>_.map</code>, <code>_.sumBy(xs, f)</code>, <code>_.meanBy</code></td><td>element, index, collection</td><td>one per element; one</td><td>none</td></tr>
<tr><td>ggplot2</td><td><code>after_stat(density)</code>; a custom <code>Stat</code> with <code>compute_group</code> or <code>compute_panel</code></td><td>the group's (or panel's) data frame</td><td>a data frame of computed rows</td><td>the columns it returns</td></tr>
<tr><td>ggdist</td><td><code>after_stat(pdf * n)</code>; <code>point_interval</code> functions</td><td>computed variables <code>x</code>, <code>pdf</code>, <code>cdf</code>, <code>n</code></td><td>one per slab position</td><td>the computed variable</td></tr>
<tr><td>Mosaic (vgplot)</td><td>aggregate expressions with chained window methods: <code>avg("foo").orderby("date").rows([3, 3])</code>, <code>median("x").partitionby("g")</code>; custom expressions through the <code>sql</code> template tag (idl.uw.edu/mosaic/sql/)</td><td>no JS callbacks; the expression becomes SQL that DuckDB runs</td><td>one per group, or one per row as a window</td><td>SQL types</td></tr>
</table></div>
<p>Systems that run user functions over groups declare the kind by a separate verb or registration call (Plot's map and reduce transforms, Arquero's aggregate and window registration, Ibis's scalar and agg decorators, Spark's pandas_udf kinds, Postgres' <code>CREATE AGGREGATE</code>, Beam's <code>Map</code> and <code>CombineFn</code>) or by a flag (polars' <code>returns_scalar</code>). polars renamed <code>apply</code> to <code>map_elements</code> and <code>map</code> to <code>map_batches</code> (0.19) because users could not tell which one got a value and which got a column.</p>

## The distribution type

#### What the prototype has

The croissant stories use a plain object, in `stories/proposals/stack-profile/croissantDist.ts`, that stands in for the Dist of issue #980. The stories draw it with `fnCurve({ f: d.pdf, range: d.range })`. Its type and constructors, as written:

croissantDist.ts (excerpt, bodies left out):

```ts
export type Dist = {
  pdf: (x: number) => number;
  cdf: (x: number) => number;
  quantile: (p: number) => number;
  /** The default range a density curve covers. */
  range: [number, number];
};

/** dist.normal: range = the 0.001 and 0.999 quantiles, as ggdist does. */
export const normal = (mean = 0, sd = 1): Dist => { ... };

/** field(x).kde({ smoothing }): Gaussian kernels, Silverman's bandwidth by
 *  default; range = data extent plus 3 bandwidths each side. */
export const kde = (values: number[], smoothing?: number): Dist => { ... };

/** Emulates binning a Dist: rows at its exact quantiles. */
export const exactQuantiles = (d: Dist, n = 2000) =>
  Array.from({ length: n }, (_, i) => ({ v: d.quantile((i + 0.5) / n) }));
```

It differs from this page in three ways. Its `kde` range is the data's extent plus 3 bandwidths on each side, as seaborn does, while the page's lean is ggdist's range trimmed to the data. Its bandwidth is `1.06 × sd × n<sup>−0.2</sup>` (the normal reference rule), while the page says Silverman's `0.9 × min(sd, IQR ÷ 1.34) × n<sup>−0.2</sup>`, which `silvermanBandwidth` computes. And its pdf has area 1, while the page proposes area n for rows. All three are prototype shortcuts; the proposal below follows the page.

#### Proposed

Two levels. At run time, a `Dist` is what the engine asks questions of. #980's sketch has `DistRep`, which is how a Dist is held (a family with parameters, draws, a mixture, a truncation); this `Dist` is what every representation answers. It adds two things to the prototype: `mass`, so a density is mass × pdf and stacked densities add, and `restrict`, which is a cell of a partition. In a spec, a `DistExpr` is an expression over a Dist, as in #980, and this page adds `support()`, `density()` and `bin()` to it. `field("mass")` over a group of rows is the empirical Dist of those rows, so a field expression has the same methods. Units are in the types: `support` is in the variable's unit V, `density` in mass per V, and `cdf` is a ratio (in a comment, since run-time values are plain numbers). The sketch simplifies #980's types: a unit is a plain tag, and #980's dependence parameter (whether draws are joint) is left out.

Run time, and the spec level:

```ts
/** A unit, as a type tag (#980's `UnitTag`, reduced to its name). */
type Unit = { readonly name: string };
type Ratio = { readonly name: "ratio" };
type Count = { readonly name: "count" };
/** Mass per unit of V: the unit of a density over a variable in V. */
type Per<M extends Unit, V extends Unit> = {
  readonly name: "per";
  readonly mass: M;
  readonly of: V;
};

/** Run time: what a Dist answers. #980's `DistRep` is how a Dist is held
 *  (a family, draws, a mixture, a truncation); this is what every
 *  representation answers. Its numbers are in the variable's unit, except
 *  where noted. */
interface Dist {
  /** The density, per unit of the variable, with area 1. */
  pdf(x: number): number;
  /** P(value ≤ x), a ratio. */
  cdf(x: number): number;
  /** The value whose cdf is p. */
  quantile(p: number): number;
  /** Where the density is drawn. */
  readonly range: Interval;
  /** 1 for a family; the row count for rows. A density is mass × pdf. */
  readonly mass: number;
  /** A cell of a partition: the same density (mass × pdf) inside the cell,
   *  0 outside. #980's "truncated" representation, with its mass kept. */
  restrict(cell: Interval): Dist;
}

/** One restriction for every Dist: the pdf is rescaled by the cell's share
 *  w, and the mass by w, so mass × pdf is unchanged inside. */
const restrictDist = (d: Dist, cell: Interval): Dist => {
  const lo = d.cdf(cell.min);
  const w = d.cdf(cell.max) - lo;
  const self: Dist = {
    pdf: (x) => (x >= cell.min && x <= cell.max ? d.pdf(x) / w : 0),
    cdf: (x) => Math.min(1, Math.max(0, (d.cdf(x) - lo) / w)),
    quantile: (p) => d.quantile(lo + p * w),
    range: {
      min: Math.max(d.range.min, cell.min),
      max: Math.min(d.range.max, cell.max),
    },
    mass: d.mass * w,
    restrict: (c) => restrictDist(self, c),
  };
  return self;
};

// Spec level. Each expression says what kind of value it makes, so a mark's
// types can accept or reject it.

/** One value per row. */
interface RowExpr<V extends Unit> {
  readonly kind: "row";
  readonly unit?: V;
}
/** One value per group (#980's `ValueExpr`). */
interface ValueExpr<V extends Unit> {
  readonly kind: "value";
  readonly unit?: V;
}
/** A function of a hidden parameter t: one function per group. */
interface FnExpr<V extends Unit> {
  readonly kind: "fn";
  readonly unit?: V;
  /** t ↦ t over this function's own range, sharing its parameter. */
  support(): FnExpr<Unit>;
}
/** A grouping key whose groups have regions (cells). */
interface KeyExpr {
  readonly kind: "key";
  readonly hasRegion: true;
}
declare const partitionBrand: unique symbol;
type Partition = { readonly [partitionBrand]: true };

/** An expression over a Dist of a variable in V, whose mass is in M. */
interface DistExpr<V extends Unit, M extends Unit = Ratio> {
  /** t ↦ t over `range`, in V. */
  support(): FnExpr<V>;
  /** t ↦ mass × pdf(t), in M per V. */
  density(): FnExpr<Per<M, V>>;
  median(): ValueExpr<V>;
  quantile(p: number): ValueExpr<V>;
  mean(): ValueExpr<V>;
  /** A grouping key with regions: cells along the Dist's axis. */
  bin(p: Partition): KeyExpr;
}

/** A parameter of a dist constructor: a number, a column name, or a value
 *  expression. */
type Param<V extends Unit> = number | string | ValueExpr<V> | RowExpr<V>;

declare const dist: {
  normal<V extends Unit>(p: { mean: Param<V>; sd: Param<V> }): DistExpr<V>;
  // lognormal, student, beta, ... as in #980
};
```

**A cell keeps its density.** `restrict` rescales the pdf by the cell's share w = cdf(max) − cdf(min) and the mass by w, so mass × pdf is the same inside the cell as in the whole. That is what lets the croissant's cells meet exactly.

The croissant, with the type of each method:

```ts
type Z = { readonly name: "z" };
const params = [{ mean: 0, sd: 1 }];
const d = dist.normal<Z>({ mean: "mean", sd: "sd" }); // DistExpr<Z>
const cells = d.bin(Bin.quantiles(5)); // KeyExpr
const x = d.support(); // FnExpr<Z>
const h = d.density(); // FnExpr<Per<Ratio, Z>>
const m = d.median(); // ValueExpr<Z>
chart(params)
  .flow(partition({ by: cells, dir: "x" }))
  .mark(layer([ribbon({ x, h, inset: 3 }), circle({ cx: m, cy: 6, r: 3 })]));
```

## Where function values appear

<p>Function values reach several parts of the API. One row per place. "Spec author" is a user writing a visualization, "operator author" is someone writing an operator, and "internal" means only the engine sees it.</p>
<div class="table-wrap"><table>
<tr><th>Place</th><th>Today</th><th>Proposed</th><th>Who sees it</th></tr>
<tr><td>Channels of <code>ribbon</code> and <code>line</code> (<code>x</code>, <code>h</code>, <code>y</code>)</td><td>A channel takes <code>number | column name | (d) =&gt; number | Value | FieldExpr</code> (<code>DeriveMarkProps</code> in <code>channels.ts</code>). <code>ribbon</code> and <code>line</code> have no <code>x</code> option: they are connectors, and their own <code>w</code> and <code>h</code> only size the hidden anchor marks</td><td>Also a function value: <code>d.support()</code>, <code>d.density()</code>, or a <code>reduce</code> that returns one. A bare JS function keeps meaning a row accessor</td><td>spec author</td></tr>
<tr><td>Other marks (<code>rect</code>, <code>circle</code>, <code>text</code>, ...)</td><td>as above</td><td>A function value in a channel is a type error, and a run-time error that names the fix. Issue #980's "a bare Dist in a rect channel means its limit" is a separate question</td><td>spec author</td></tr>
<tr><td><code>FieldExpr</code></td><td><code>FieldExpr&lt;HasRegion, Binned&gt;</code>, with <code>sort</code>, <code>reverse</code>, <code>bin</code>, <code>dropNulls</code>, <code>normalize</code>, <code>sum</code>, <code>mean</code>, <code>median</code>, <code>count</code>, <code>distinct</code> (<code>fieldExpr.ts</code>)</td><td>New methods <code>support</code>, <code>density</code>, <code>map</code> and <code>reduce</code>. The type has to know the kind of result (one value per row, one per group, or a function) so the mark types can accept or reject it, as <code>RowExpr</code>, <code>ValueExpr</code> and <code>FnExpr</code> do in the sketch</td><td>spec author</td></tr>
<tr><td><code>dist.*</code> constructors</td><td>none</td><td>New: <code>dist.normal({ mean, sd })</code> and the other #980 families</td><td>spec author</td></tr>
<tr><td><code>stack</code></td><td>reads each child's box, writes one translate per child; <code>origin</code> is internal</td><td>Reads each child's cross-sections, writes an offset function per child. New <code>baseline</code> option</td><td>spec author (<code>baseline</code>), operator author (the offsets)</td></tr>
<tr><td><code>partition</code></td><td>cuts rows into cells; the croissant clips a hidden ribbon with <code>intersect</code></td><td>Restricts function-valued children to each cell (<code>restrict</code>), which removes <code>intersect</code> and the hidden ribbon from the croissant</td><td>operator author</td></tr>
<tr><td><code>spread</code></td><td>places boxes</td><td>May read cross-sections for spacing; designed on the optical spacing page. Proposed <code>baseline</code> option</td><td>spec author, operator author</td></tr>
<tr><td>Domain inference and scales</td><td>read a data interval per child, before layout</td><td>Need the maximum and minimum of a function in data units before layout: exact for functions built from rows, to a tolerance otherwise</td><td>internal</td></tr>
<tr><td><code>geometry()</code></td><td><code>box</code>, <code>enclosingCircle</code>, <code>outline(tolerance)</code>, after layout</td><td>New query <code>crossSection</code>, with a helper that falls back to the box</td><td>operator author</td></tr>
<tr><td>Lowering</td><td>a ribbon draws a path through its anchors' points</td><td>Adaptive resampling of the function in pixels, composed with the coordinate transform, as the prototype does</td><td>internal</td></tr>
<tr><td>Serialization and Python</td><td>a field expression is data (<code>FieldOpIR</code> in <code>packages/gofish-ir/src/frontend/schema.ts</code>; no dist node). A Python accessor reaches JS as a batch call over rows (<code>RESOLVE_ROWS</code>, <code>makeLambdaAccessor</code> in <code>serialize/fromJSON.ts</code>), one value per row, and calling it per row throws. A Python <code>derive</code> gets the whole data</td><td>Named methods and <code>dist.*</code> are data: new <code>FieldOp</code>s and a dist node in the IR. A Python <code>reduce</code> needs a call per group. A Python callback that returns a curve has to stay in Python and be called with a batch of t values in each resampling round. That is new bridge work</td><td>internal (the bridge), spec author (Python)</td></tr>
<tr><td>Data rows</td><td>rows hold plain values</td><td>Rows do not hold functions. A Dist is built from columns, <code>dist.normal({ mean: "mean", sd: "sd" })</code></td><td>spec author</td></tr>
</table></div>

How a mark's types accept or reject a function value:

```ts
/** What a channel of any mark takes today (`DeriveMarkProps`), with the
 *  value-per-row and value-per-group kinds. A bare JS function keeps
 *  meaning a row accessor. */
type Channel<T> =
  | number
  | (keyof T & string)
  | ((d: T) => number)
  | RowExpr<Unit>
  | ValueExpr<Unit>;
/** `ribbon` and `line` also take a function value. */
type CurveChannel<T> = Channel<T> | FnExpr<Unit>;
```

A custom curve, and the type error in a rect:

```ts
type Grams = { readonly name: "g" };
const curve = field<Grams>("mass").reduce(
  (xs) => fn(kde(xs), { over: extent(xs) }),
  { unit: { name: "count per g" } }
); // FnExpr
ribbon({ x: curve.support(), h: curve });
const top = field<Grams>("mass").reduce((xs) => Math.max(...xs), {
  unit: { name: "g" },
}); // ValueExpr
// @ts-expect-error a function value in a rect channel is a type error
rect({ h: curve });
```

## 3. Spacing between shapes

A shape's cross-sections are also one way a `spread` could measure the shapes it places. In a ridgeline, each ridge could drop until its base would touch the ridge below, instead of starting above the previous ridge's box. How spacing should be measured so that gaps look equal, between siblings and to a container's wall, is being designed separately: see [Optical spacing](https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty).

## Rules

- **A shape reports its cross-sections as a function.** At each position u along the cross axis, its cross-section is the interval it reaches below and above its baseline. A ribbon's is a function with one knot per row; a box's is constant. No spec or operator sees a list of samples.
- **A stack moves cross-sections and never resizes them.** It writes one offset function per child. Every `baseline` is a choice of that offset. A 100% stack is `normalize` on the values followed by a plain stack, so there is no divide operation and no exception.
- **An operator uses a closed set of operations.** Evaluate, add, scale, restrict, maximum and minimum, integrate (and, for `wiggle` only, the derivative, products and a running integral). It never reads a child's rows, vertices or samples.
- **Sampling is internal.** It happens when a mark is drawn, when a geometry query is asked at a tolerance, and when a maximum or an integral of a smooth function is needed. A function built from rows needs none of the last kind.
- **Each value is a size, not a pixel count.** It is a data amount times the scale factor plus fixed pixels, so a stack can still solve its scale before layout.
- **A function value carries its range and its hidden parameter.** `x: mass.support()` and `h: mass.density()` share one hidden variable t, whose range belongs to the value. Two function channels over different variables in one mark are an error. A bare JS function is a row accessor, never a function value.
- **One verb per kind of result.** `map` gives one value per row, `reduce` one value per group, and a `reduce` that returns a function value with its range gives a function value per group.

## Open decisions

1. Call the value at one u a **cross-section**, the function "a shape's cross-sections", and the trait `HasCrossSection`? Users never write the word. Runners-up: extent, band.
2. A rigid part (a circle, text, an image, a line) in a stack of cross-sections: keep it an error that names the fix, or allow it, resting on the highest point of the boundary below it with a gap underneath?
3. Allow `baseline` on `spread` too, with `start`, `end`, `middle` and `at(part, fraction)`, and keep `wiggle` stack-only and `baseline` off `layer` and `scatter`? The lean is yes.
4. Does `Baseline.at(part, fraction)` also carry `StackOrigin`'s `mirrored` (parts on both sides read as amounts away from 0), or does only `Trait.diverging` set it?
5. `Baseline.wiggle()` is defined on the function (the limit), not on the rows, so finer rows do not change the curve? It is the one baseline that needs the derivative, products and a running integral.
6. Under `Baseline.middle()` and `Baseline.wiggle()` the value axis is dropped, since it can only measure thickness?
7. A density's area is the mass it is made from (the row count, or 1 for a Dist), so stacked densities add up to the density of all rows? The other choice is area 1 for every curve. ggdist reaches the same curve with `after_stat(pdf * n)` and rescales thickness with `normalize`; here rescaling is the parent's job.
8. The range of t: follow ggdist (rows trimmed to the data's range with a bounded estimator; a Dist over its own range, or its 0.001 to 0.999 quantiles where unbounded), or seaborn (3 bandwidths past the data)? The lean is ggdist.
9. `.map`'s callback keeps `Array.prototype.map`'s argument order, `(x, i, xs)`, with the index, rather than `(x, xs)`?
10. A custom curve: `reduce` returns a function value with its range, spelled `fn(at, { over })` or a plain `{ at, over }` object, and its `support()` gives the x channel? And how is a density's unit written (`"count per g"` above is a placeholder)?
11. An undeclared `unit` makes the result a plain number that cannot be stacked, for both verbs?
12. A cell of a Dist partition is the Dist over the cell with its mass (pdf and mass both rescaled by the cell's share), so `d.density()` in a cell is the parent's curve there?
13. The cross-sections a stack needs before layout, in data units: solve it here, as a function-valued size along the stack axis, or with #967 (geometry while sizing)?
14. Accept the per-x rewrite (B at the union of breakpoints) as a declared shortcut until the engine has cross-sections?
