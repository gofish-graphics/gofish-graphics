# Content of the stack-profile proposal, focused on two examples. build.py
# turns it into page.html and proposal.md. Code is formatted by
# proposals/_tools/format-snippets.mjs. A line that ends in a "@hl" comment is
# a changed line: it is highlighted on the page, and the marker is removed.
#
# A section is a list of blocks:
#   ("p", html), ("figs", [(img, caption)]), ("wide", img, caption),
#   ["code", label, js, py], ["today", label, js],
#   ("item", dict(img, cap, label, js, py, today_label, today_js)).
#
# TypeScript blocks come from types-sketch.ts beside this file, which
# typechecks on its own (prettier formats it). ts_block() shows the regions
# between "// #region name" and "// #endregion" as a "raw" block, so the page
# shows exactly the types that were checked.
import html as _html
import os as _os
import re as _re

_SKETCH = open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "types-sketch.ts")).read()


def _region(name):
    m = _re.search(r"// #region " + _re.escape(name) + r"\n(.*?)// #endregion", _SKETCH, _re.S)
    if m is None:
        raise KeyError(name)
    return m.group(1).rstrip()


def ts_block(label, *names):
    code = "\n\n".join(_region(n) for n in names)
    page = f'<p class="label">{label}</p><pre class="code"><code class="language-typescript">{_html.escape(code)}</code></pre>'
    note = f"{label}:\n\n```ts\n{code}\n```"
    return ("raw", page, note)


def ts_verbatim(label, code):
    """TypeScript quoted from a file in the repo, shown as written."""
    page = f'<p class="label">{label}</p><pre class="code"><code class="language-typescript">{_html.escape(code)}</code></pre>'
    return ("raw", page, f"{label}:\n\n```ts\n{code}\n```")


def swift_verbatim(label, code):
    """Swift from another framework's docs, written out by hand in its style."""
    page = f'<p class="label">{label}</p><pre class="code"><code class="language-swift">{_html.escape(code)}</code></pre>'
    return ("raw", page, f"{label}:\n\n```swift\n{code}\n```")


TITLE = "Stacking Areas"
H1 = "Stacking areas and densities"

FULL_LINK = (
    'This page is focused on two examples, the stacked area and the croissant, the idea behind them, and the interface it leads to. Spacing moved to its own page. The full survey of eleven examples is at commit '
    '<a href="https://github.com/gofish-graphics/gofish-graphics/blob/2f3b2a4bf/proposals/stack-profile/proposal.md">2f3b2a4bf</a>. Every type on this page is in <code>proposals/stack-profile/types-sketch.ts</code>, which typechecks on its own.'
)

SUMMARY = [
    "A stacked area is the limit of stacked bars. A stack only moves each bar and never resizes one, so in the limit it moves each <b>cross-section</b> of an area (its interval at one position u on the other axis) and keeps its length. That argument fixes the rules. It is not the interface: a shape gives its cross-sections as a <b>function</b> of u, and no spec or operator sees a list of samples. Sampling happens only inside the engine, at a tolerance.",
    "Every function is one generic type, <code>Fun&lt;T&gt;</code>: a function of one parameter with its domain, its knots, and a <code>Curve</code> (linear, step, monotone or smooth) for how it runs between them. An operator may use a small, closed set of operations on those functions (map, zip, evaluate, add, scale, restrict, maximum and minimum, integrate), and writes back one offset function per child. A box answers with a constant function, so every node has cross-sections and nothing asks whether a child is a box. <code>crossSection</code> joins <code>geometry()</code> as one more query.",
    "A stack's <code>baseline</code> option chooses where its own 0 is: <code>Baseline.start()</code>, <code>.end()</code>, <code>.middle()</code>, <code>.wiggle()</code> or <code>.at(part, fraction)</code>. Each gives every cross-section an offset and never changes a length. <code>spread</code> takes it too, except <code>wiggle</code>; the strongest of four rendered examples is a Likert visualization with gaps between its segments. It does not replace <code>anchor</code>, which is a choice per pair of children.",
    "<code>StackOrigin</code>'s <code>mirrored</code> flag does not need to be stored. Whether an axis labels distances from 0 follows from the parts (every part is a nonnegative amount), so the stack can compute it, and <code>Baseline.at(part, fraction)</code> is all that <code>Trait.diverging</code> desugars to.",
    "A density is two channels of one mark read at one parameter t, <code>ribbon({ x: mass.support(), h: mass.density() })</code>, over a <code>Dist</code> type with typed methods. <code>partition</code> restricts the function to each cell, which draws the croissant with no grid and no <code>intersect</code>. A custom density is a <code>reduce</code> that returns a Dist, <code>reduce((xs) =&gt; kde(xs))</code>. Any other function is <code>fun(f, { domain })</code>, after Chebfun and Julia's <code>Fun</code>. Nothing is called <code>fn</code>.",
    "A <code>reduce</code> may return any value, and one rule, <b>lifting</b>, turns it into an expression by its shape: a number into one value per group, a function value into one function per group, and a record into one method per member. A Dist is such a record, and so are a box plot's summary numbers, <code>s.lo()</code> and <code>s.hi()</code>. A channel takes only the two leaves.",
    "Before the scale factor σ is solved, a node can report only a box. The proposal gives every geometry query a claim form, a function of σ, so a stack can claim room by its cross-sections and <code>pack</code> can fit itself to its room (#967). Each claim is a closed form where one exists. Whether sizing may also run layout, for the cases with no closed form, is open.",
    "A <code>spread</code> could read the same cross-sections to place shapes by their outlines; how gaps should be measured so they look equal is designed on its own page, <a href=\"https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty\">Optical spacing</a>.",
]

SUMMARY_TITLE = "Recommendation"
SETTLED = [
    "The stacked area is spelled <code>chart(jobs).flow(stack({ by: \"series\", dir: \"y\" })).mark(ribbon({ x: \"date\", h: \"count\", fill: \"series\" }))</code>: a stack, then one ribbon per series.",
    "The thin-box limit is the argument that sets the rules, not the interface. The interface is a function of u, and sampling stays inside the engine.",
    "The stack's option is <code>baseline</code>, with values <code>Baseline.start()</code>, <code>.end()</code>, <code>.middle()</code>, <code>.at(part, fraction)</code> and <code>.wiggle()</code>. <code>Trait.diverging</code> stays the default and desugars to <code>Baseline.at</code>, and an explicit <code>baseline</code> over a diverging unit is an error.",
    "The cross-section interface (a shape's cross-sections are a function, read with a closed set of operations) and the custom methods (<code>map</code> and one <code>reduce</code>) are the agreed direction. Details under them stay open where listed below.",
    "The value at one u is a <b>cross-section</b>, the function from u to it is \"a shape's cross-sections\", and the trait is <code>HasCrossSection</code>. Users never write the word.",
    "<code>spread</code> takes <code>baseline</code> too, with <code>Baseline.start()</code>, <code>.end()</code>, <code>.middle()</code> and <code>.at(part, fraction)</code>. <code>Baseline.wiggle()</code> stays stack-only. <code>layer</code> and <code>scatter</code> do not take it.",
    "Custom methods on a field expression are two verbs: <code>.map((x, i, xs) =&gt; value, { unit })</code> for one value per row, and <code>.reduce((xs) =&gt; value, { unit })</code> for one value per group. There is one form of <code>reduce</code>.",
    "A 100% stack is <code>normalize</code> on the values followed by a plain stack: there is no divide operation.",
    "A density is drawn by a channel pair, <code>support()</code> for the position (Josh is checking the name with Matt Kay, ggdist) and the density for the height; whether that is <code>density()</code> or <code>pdf()</code> is decision 6. Rejected for the position: <code>value()</code>, which clashes with GoFish's <code>value(...)</code> constructor, and <code>points()</code> or <code>grid()</code>, which name the sampling.",
    "<code>.then</code> cannot be the custom method's name: a field expression with a <code>then</code> method would be adopted as a promise by <code>resolveValue</code>.",
    "How a bin's cells are shared stays under review, so no callback form is proposed for bins here.",
]

TERMS = [
    ("Cross-section", "A shape's interval along one axis at one position u on the other axis: how far it reaches below and above its baseline there. It is two-sided, and it is a query at a point, not a sample. \"A shape's cross-sections\" means the function from u to that interval. A box's cross-section is the same at every u."),
    ("Slice", "Used only in the limit argument: one of the thin boxes a stacked bar visualization is made of."),
    ("Function value", "A function of one parameter t, with its domain, the interval of t it is defined over (the generic type <code>Fun&lt;T&gt;</code>). A density's height over t is one, and so is a cross-section."),
    ("Parameter of a mark", "The one variable t that a mark which draws along a path is read at. Every channel of it that holds a function is read at the same t. The user never writes t."),
    ("Knot", "A point where a function value starts a new piece. A function built from rows has one knot per row, and between knots it runs by its <code>curve</code>, one of <code>Curve.linear()</code>, <code>.step()</code>, <code>.monotone()</code> and <code>.smooth()</code>."),
    ("Baseline", "A node's own 0 point. A rect's baseline is its bottom edge, and it bubbles up: a parent with <code>alignment: \"baseline\"</code> lines up its children's 0 points. A stack's <code>baseline</code> option chooses where the stack's 0 is. In the code the model is <code>StackOrigin</code> (<code>constraints/distribute.ts</code>)."),
    ("Lowering", "The last step of rendering, which turns a laid-out node into drawing commands (paths, in pixels)."),
    ("Scale factor (σ)", "Pixels per data unit in one scope. It is solved once, from the root's claim against the canvas, before any node is laid out."),
    ("Claim", "What a node reports up the tree before σ is solved: how much room it needs, with every number a function of σ. Today a claim is a box: one <code>Extent</code> per axis (<code>ast/extent.ts</code>)."),
    ("Per-x form", "<code>scatter</code> or <code>spread</code> by x, then <code>stack</code>, which is today's spelling of a stacked area. The stack runs once in each x column and sees only that column."),
    ("Field expression", "<code>field(\"mass\")</code>, a column expression like polars' <code>pl.col(\"mass\")</code>. Bare, it is a value per row. Its methods make other kinds of value (see \"What the methods compute\")."),
]

SECTIONS = [
    dict(
        id="limit",
        title="Why stacking may reshape an area",
        blocks=[
            ("p", """<p>Stacking areas changes the shape of each area, which a box cannot do. Josh's framing: \"a ribbon's area is a limit of some AABBs. So if that shape change can happen with the discrete AABB union I feel like it's more acceptable and natural to have the ribbon behavior be guided by that.\" (An AABB is an axis-aligned bounding box, the box every GoFish node reports today.) This section uses that limit to find the rules a stack must keep. The rules then define the interface in the next section, which has no slices in it.</p>"""),
            ("wide", "limit.png", "Four series as stacked bars 5, 10, 20 and 60 bars wide, then the stacked area. Each bar reads its series at the bar's middle. Real renders with today's <code>spread</code> and <code>stack</code>; each panel scales to its own height."),
            ["code", "Each bar panel, which runs today", """chart(rows) // one row per series per bar
  .flow(
    spread({ by: "bar", dir: "x", spacing: 0 }),
    stack({ by: "series", dir: "y" })
  )
  .mark(rect({ w: barWidth, h: "value", fill: "series" }));""", """chart(rows).flow(
    spread(by="bar", dir="x", spacing=0),
    stack(by="series", dir="y"),
).mark(rect(w=bar_width, h="value", fill="series"))"""],
            ("p", """<h4>The argument, checked step by step</h4>
<ol>
<li><b>A ribbon is the limit of a row of thin rects</b>, one per slice of x. Correct. One detail: each rect reads the series at its slice, so the limit is the series' curve through its rows. How a series is read between its rows (its <code>curve</code>) is part of the shape.</li>
<li><b>In the discrete case, stacking uses only what boxes allow.</b> Correct. Each column is an ordinary stack of rects, as in the panels above. The stack moves each rect and never changes its width or height.</li>
<li><b>One series' rects form a staircase band whose outline changes shape</b>, because each slice moves by a different amount, while no box is reshaped. Correct. In the limit the staircase becomes the stacked ribbon.</li>
<li><b>So in the limit a stack moves each cross-section and never resizes it.</b> Correct. The thickness at each x never changes, only the offset, so stacking is a translation at each u. Three invariants follow. Thickness is kept at every u, so every band keeps its area (this is Cavalieri's principle: two regions whose cross-sections have equal length at every u have equal area). The order of the bands is kept at every u. A baseline is only an offset, the same for every band at one u.</li>
<li><b>Series sampled at different x fit too.</b> Splitting a slice in two does not change the shape, so the columns can use the union of every series' breakpoints. Correct, with one condition: the new slice's height is the series' value at the new x, which comes from its curve (linear between rows, as ggplot2 reads it). Outside its own x range a series' thickness is 0. In the function form this is just evaluation: a series' cross-section can be asked at any u.</li>
<li><b>Contour spacing reads the same cross-sections.</b> The closest approach of two shapes is the smallest gap over their shared positions, a skyline. Correct, with a limit: the gap is measured along the spacing axis at each u, not as a straight-line distance. The optical spacing page shows what that does to glyphs and shapes.</li>
<li><b>A rigid shape (a circle, text, a line with no thickness) is one box that cannot be split, so it gets one translation.</b> This needs a correction. The full survey made a rigid part in a curved stack an error. The limit gives a rigid part a defined place instead: it rests on the highest point of the boundary below it across its width, as a skyline does. But then the cross-sections under it are no longer glued, and a gap opens wherever the boundary below is lower. So the argument turns the old rule into a choice, which is decision 1.</li>
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
<p>Every baseline holds, and nothing in layout resizes a cross-section. A 100% stacked area is not a separate divide operation. It is <code>normalize</code>, the callback <code>(x, i, xs) =&gt; x / sum(xs)</code> with <code>xs</code> the values in one x column, which changes the values before layout, followed by a plain stack that only moves cross-sections. When the whole is a drawn shape instead of 1 (a bottle filled by share), that is a size choice for the stack's total, not a new operation.</p>"""),
        ],
    ),
    dict(
        id="interface",
        title="The interface",
        blocks=[
            ("p", """<p>This section says what a shape reports, what an operator may do with it, what the operator writes back, and how this fits the <code>geometry()</code> queries that exist today. Every type shown here is in <code>types-sketch.ts</code>, which typechecks with <code>tsc --noEmit --strict</code>.</p>
<h4>A function value</h4>
<p>Every function on this page is one generic type, <code>Fun&lt;T&gt;</code>: a function of one parameter, with the interval it is defined over (its <i>domain</i>), so a spec never names one. A cross-section is a <code>Fun&lt;Interval&gt;</code>, an edge, a thickness or a density is a <code>Fun&lt;number&gt;</code>, an operator's offset is a <code>Fun&lt;number&gt;</code>, and the claim in \"Geometry before layout\" is a <code>Fun&lt;Extent&gt;</code>.</p>
<p>A function also lists its knots and how it runs between them. That is the <code>Curve</code> family GoFish already has: <code>Curve.linear()</code>, <code>.step()</code>, <code>.monotone()</code> and <code>.smooth()</code> are read over the parameter of a run (<code>families/curve.ts</code>), and they are the same values a ribbon's <code>curve</code> option takes, so a ribbon's cross-sections carry the ribbon's own curve. <code>catmullRom</code> is a shape on screen and the routers (<code>bezier</code>, <code>orthogonal</code>, <code>arc</code>, <code>perfectArrows</code>) join pairs of points, so neither is allowed here. What the curve makes exact:</p>
<ul>
<li><b><code>linear</code> and <code>step</code></b>: sums, maxima and integrals come from the knots alone. A sum of two linear functions over the union of their knots is linear again, and so is a sum of two steps.</li>
<li><b><code>monotone</code> and <code>smooth</code></b>: both are cubic Hermite splines, one cubic per interval between knots (<code>src/spline.ts</code>: Steffen's cubic and the modified Akima cubic). A sum over the union of knots is still one cubic per piece, so a maximum (a root of a quadratic) and an integral have a closed form per piece. But the sum is not the curve <code>Curve.monotone</code> would draw through the summed values, because each curve's slopes come from its own values. So the engine has to keep the cubic pieces, not a curve name. Until it does, these are read to a tolerance.</li>
<li><b>No curve</b>: a function with no knots, such as a kernel density, is read to a tolerance.</li>
</ul>"""),
            ts_block("The function value", "function-value"),
            ("p", """<h4>The cross-section query</h4>
<p>A shape's cross-sections are one query: given an axis, a <code>Fun&lt;Interval&gt;</code> from u (the position on the other axis) to the interval the shape covers there, measured from its baseline. A box answers with a constant function, the same way <code>defaultGeometry</code> falls back to the box for the other queries. So every node has cross-sections, and no operator dispatches on whether a child is a box or a ribbon.</p>"""),
            ts_block("The query, and the helper every reader calls", "cross-section"),
            ("p", """<h4>What an operator may do</h4>
<p>An operator may use only these operations. Each one takes functions and returns a function or a number, written as composing closures, so none of them samples. Two are generic: <code>map</code> applies a function to every value (an edge and a thickness are <code>map</code>s of a cross-section), and <code>zip</code> combines two functions pointwise over the hull of their domains (a sum is a <code>zip</code>). The sketch file has a short implementation of each.</p>
<div class="table-wrap"><table>
<tr><th>Operation</th><th>What it gives</th><th>Exact for <code>linear</code> and <code>step</code>?</th></tr>
<tr><td><code>map</code>, <code>zip</code></td><td>an edge, a thickness, a sum, a claim's sum</td><td>yes, when the function applied is linear</td></tr>
<tr><td>Evaluate at u</td><td>a thickness or an edge at one position; 0 outside the domain</td><td>yes</td></tr>
<tr><td>Add two, pointwise</td><td>the stack's running sum; the knots are the union</td><td>yes, the curve is kept</td></tr>
<tr><td>Scale by a number</td><td>minus half the total for <code>Baseline.middle()</code>; minus an edge</td><td>yes</td></tr>
<tr><td>Restrict to a cell</td><td>what <code>partition</code> does</td><td>yes</td></tr>
<tr><td>Maximum and minimum over the domain</td><td>the box, and the scale domain</td><td>yes: at a knot or an end</td></tr>
<tr><td>Integrate over the domain</td><td>area</td><td>yes: trapezoids on the knots for <code>linear</code>; each value held to the next knot for <code>step</code></td></tr>
</table></div>
<p>What it writes back: one offset per child, a <code>Fun&lt;number&gt;</code>. Today it writes one number, the translate. For a box child the function is constant, which is today's translate. What it may not do: read a child's rows, vertices or samples, or change the size of a cross-section.</p>
<p><b><code>Baseline.wiggle()</code> needs more.</b> d3's wiggle chooses the baseline's slope at u from each band's thickness and its slope there, weighted by thickness. So it needs the derivative of each thickness, products of functions, and a running integral (an integral from the start up to u, which is a function, not a number). For functions built from rows these are still exact: the derivative of a straight line is a constant between knots. These three operations join the set only for wiggle, which is part of decision 3.</p>"""),
            ts_block("The operations, and what an operator writes back", "operations"),
            ts_block("A stack, written with those operations", "stack"),
            ("p", """<h4>How it relates to <code>geometry()</code></h4>
<p>Today <code>Geometry</code> is <code>HasBox &amp; HasEnclosingCircle &amp; HasOutline</code> (<code>ast/geometry/index.ts</code>). Every query except <code>box</code> is optional, each has a helper that falls back to the box, and <code>GoFishNode.geometry()</code> answers only after layout, in the node's local pixel frame. Its header comment says the form that answers while sizing is issue #967. <code>crossSection</code> joins <code>Geometry</code> as one more optional query, with the helper above. The other queries can be read from it: <code>box</code> is the cross-section's minimum and maximum, and an outline is the upper edge followed by the lower edge reversed, sampled to the outline's tolerance.</p>
<p>A stack, though, needs the function before layout, in data units. It gives the scale its own space, which is the largest total over u, and the scale must be solved before anything has pixels. The prototype shows the split: its <code>resolveUnderlyingSpace</code> uses the function in data units, and its <code>layout</code> uses it in pixels (<code>_prototypeFnCurve.tsx</code>). So the same function is asked twice: before σ is solved, as the child's claim along the stack axis (a function of u instead of one number), and after layout, as the geometry query. \"Geometry before layout (#967)\" below designs the claim form.</p>
<p><b>Does a function-valued size fit how a stack folds its children's spaces?</b> On main, PR #1268 is merged, and it names the properties traits; the trait a stack checks is <code>CanSum</code> on the units it adds. The stack's fold is <code>distributeSpaceFold</code> in <code>constraints/distribute.ts</code>: it needs every part's space to be continuous with an origin (pinned or free), unifies their units, checks with <code>Units.sum</code> that the units of the free parts can be summed, and lays the parts end to end, each part's interval about its baseline added to the running sum. A function-valued size fits that: the sum is pointwise, the unit check reads units and not values so it does not change, and the stack's space becomes the minimum of its lowest edge and the maximum of its highest edge over u, which are two queries in the set above. I have not built it, so this is a reading of the code, not a test.</p>
<h4>What changes for <code>ribbon</code></h4>
<p>On main, <code>ribbon</code> and <code>line</code> are relational marks (<code>createRelationalMark</code> in <code>ast/marks/chart.ts</code>): each builds a <code>Connect</code> node that joins consecutive marks, and in <code>.mark()</code> position it adds an invisible <code>blank()</code> per row for the connector to join. A ribbon there has no <code>x</code> channel and no shape of its own. In the proposal a ribbon is one node per series that owns its function, built from its rows (one knot per row) or given as a function value, and it answers <code>crossSection</code>, so the stack above it moves the whole band at once.</p>
<h4>Where sampling happens</h4>
<p>Only in three places, all inside the engine:</p>
<ol>
<li><b>When a mark is drawn (lowering).</b> The function is resampled adaptively, in pixels, composed with the coordinate transform, to half a pixel. The prototype does this with the existing <code>adaptive-resampling.ts</code>.</li>
<li><b>When a geometry query is asked at a tolerance.</b> This is how <code>outline(tolerance)</code> works today: \"a polyline that is never farther from the true shape than the tolerance asked for\" (<code>ast/geometry/outline.ts</code>).</li>
<li><b>When a maximum or an integral of a function with no closed form is needed</b>, such as a kernel density's peak for the scale domain, or the integral inside <code>Baseline.wiggle()</code>. For a <code>linear</code> or <code>step</code> function none is needed, since the knots give exact answers.</li>
</ol>
<p>One honest exception: the prototype's <code>dataExtent</code> finds a curve's maximum with 512 even samples plus golden-section refinement, when the mark is built, before layout. That is the one place it samples early. In the proposal it is case 3, and it runs only for a function with a cubic curve or none. \"Geometry before layout (#967)\" below gives it one named place.</p>
<h4>Naming: cross-section</h4>
<p>Settled: <b>cross-section</b>, and the trait <code>HasCrossSection</code>. It names an interval, so it is two-sided, where \"profile\" suggests one side. The names that were compared:</p>
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
<p>Not chosen: \"extent\" (d3's <code>extent</code> returns <code>[min, max]</code>, but GoFish already uses <code>Extent</code> for a size claim) and \"band\" (it clashes with a kernel's bandwidth on this same page, and with d3's band scale).</p>"""),
        ],
    ),
    dict(
        id="before-layout",
        title="Geometry before layout (#967)",
        blocks=[
            ("p", """<p>A stack needs its children's cross-sections before σ is solved, and <code>pack</code> needs its children's circles at the same moment (#967). This section proposes one design for both. (An AABB is an axis-aligned bounding box, the box every node reports today.)</p>
<h4>Where the gap is</h4>
<div class="table-wrap"><table>
<tr><th>Moment</th><th>What flows</th><th>What a node can know about a child</th></tr>
<tr><td>1. Before σ is solved (<code>resolveExtent</code>, a walk after the types)</td><td>Each node's claim, up the tree: one <code>Extent</code> per axis (<code>ascent</code>, <code>descent</code>, <code>width</code>), each a <code>Pwl.Value</code>, a piecewise linear function of σ (<code>ast/extent.ts</code>, <code>solver/pwl.ts</code>), or none for content that takes the room it is given. The scope fit (<code>ScopeRegistry.fit</code>, <code>solver/scopes.ts</code>) then solves σ from the root's claim against the canvas.</td><td>Its box, as functions of σ. Nothing else.</td></tr>
<tr><td>2. Inside a parent's <code>layout()</code></td><td>Down: a size, the scales, and optionally a shape (a convex ring; <code>partition</code>, <code>treemap</code> and <code>enclose</code> make one). Up: the laid-out child.</td><td>Its full <code>geometry()</code>: box, enclosing circle, outline at a tolerance. <code>pack</code> places its circles this way today.</td></tr>
<tr><td>3. Drawing (lowering)</td><td>The same laid-out tree, in pixels.</td><td>The same laid-out nodes.</td></tr>
</table></div>
<p>So moments 2 and 3 already share one laid-out tree: layout and drawing are as close as Josh guessed. The one place where a node knows only a box is moment 1, before σ. That is why <code>pack</code> cannot fit itself to its room (#967), and why a stack cannot yet be given cross-sections. The dividing line is the scale solve, not the line between layout and drawing.</p>
<h4>The proposal: a claim is geometry as a function of σ</h4>
<p>Every geometry query gets a claim form with the same name, whose numbers are functions of σ in place of pixels. After σ is solved, each claim evaluated at σ is the after-layout query for a node that is sized by its data.</p>"""),
            ts_block("The claim, and a stack's claim written with map and zip", "claim"),
            ("p", """<div class="table-wrap"><table>
<tr><th>Consumer</th><th>Claim it reads</th><th>Closed form</th></tr>
<tr><td>A stack of ribbons</td><td><code>crossSection</code></td><td>Each child's thickness at u is <code>a(u) &times; σ + b(u)</code>: a data amount times σ, plus fixed pixels. The stack's claim at u is the sum (<code>Pwl.add</code>). Its box claim is the largest total over u; for functions built from rows that is the envelope over the knots (<code>Pwl.envelope</code>), which is piecewise linear in σ, so the existing fit solves it with no change. When every part is data only it is <code>σ &times; max<sub>u</sub> &Sigma; a(u)</code>: linear, with one maximum taken in data units.</td></tr>
<tr><td><code>pack</code> (#967)</td><td><code>enclosingRadius</code></td><td>When every radius is data, the enclosing radius is <code>R(1) &times; σ</code>: one pack at σ = 1, because packing scales exactly. When every radius is in pixels, it is a constant.</td></tr>
<tr><td>A smooth function (a kernel density)</td><td><code>crossSection</code></td><td><code>σ &times; f(u)</code>, with the maximum of f found once in data units, to a tolerance. This is the sampling the prototype's <code>dataExtent</code> does, now in one named place.</td></tr>
</table></div>
<p>u is in the cross axis's data units, so a cross-section claim does not depend on the cross axis's own scale. A child whose cross extent is in pixels (a rigid part) is the rigid-part decision.</p>
<h4>Who else wants more than a box</h4>
<ul>
<li><b><code>pack</code></b> wants <code>enclosingRadius</code> at moment 1 (#967; <code>pack.tsx</code> has <code>TODO(#967)</code> and throws for a child with no pixel size). The bubble treemap (#1221) needs it too: its PR, #1226, declared #967 and #1233 as shortcuts and sizes the countries in pixels.</li>
<li><b><code>spread</code> spacing by outline</b> (the optical spacing page) would want cross-sections at moment 1, because spacing is part of a spread's claim. Not checked in code; it is still a design.</li>
<li><b><code>Overlap.separate</code> and beeswarms</b> read each child's <code>enclosingCircle</code> at moment 2, after the solve (<code>constraints/overlap.ts</code>). The scatter claims no size on its free axis, so a beeswarm takes the room its dots need and does not shrink to fit. A claim would need the swarm itself: no closed form.</li>
<li><b>Labels placed against outlines</b> read outlines at moment 2, in the <code>labelPlace</code> step, which runs last. Whether placed labels should claim room before σ: not checked.</li>
<li><b><code>enclose</code></b> claims the hull of its members' box claims grown by its padding (<code>enclose.tsx</code>), but draws around their outlines. A claim that hugs the outlines would need outline claims (see #974).</li>
<li><b>Text that wraps to a proposed width</b> would need its width before its height. GoFish text does not wrap today. Not checked further.</li>
</ul>
<h4>Should layout and sizing intertwine?</h4>
<ul>
<li><b>Keep them separate</b> (the lean, for every case that has a closed form). Claims are closed-form functions of σ, there is one solve, and then one layout. The cost: every query needs a claim form that someone derives by hand, and some queries have none.</li>
<li><b>Intertwine.</b> A claim may answer by running the subtree's layout at a trial σ and measuring it, and the solver searches for σ. This is what #967's comment planned for <code>pack</code> with mixed pixel and data radii, or with padding: bisection, at most 32 packs. That comment says <code>Monotonic</code> already has an <code>unknown</code> kind with a <code>run</code> function in <code>util/monotonic.ts</code>. That is no longer true. #1176 deleted <code>Monotonic</code> and wrote every claim as a <code>Pwl.Value</code> (commit e799b567a, which turned the unknown kind into a closure kind), and a later step removed the closures (77f80c776). Today <code>Pwl</code> has only <code>affine</code> and <code>piecewise</code>, and the fit inverts them exactly (<code>Pwl.solve</code>, <code>Pwl.fill</code>). So an opaque claim kind is new work, and it would bring back what #1176 removed on purpose. Its costs: up to N layouts of the subtree per solve; nested opaque claims multiply; and layout must be safe to run more than once, with no state carried from an earlier run.</li>
</ul>
<p><b>Josh's comparison to typing and elaboration.</b> (Elaboration is the pass that turns checked source into the explicit internal program; type checkers often do it in the same walk as checking.) The claim walk goes up the tree like inferring a type, with σ left as an unknown; the solve fixes σ; layout goes down, giving each child a size and a shape, and builds the placed tree. A closed-form claim keeps those walks apart. An opaque claim is the place where checking has to run the program to finish, which type checkers for dependent types do, and pay for.</p>
<p><b>The lean.</b> Closed forms for stacks, ribbons, densities and an all-data <code>pack</code>. Add the opaque kind only for the cases #967 lists as having no closed form, as the single declared place where sizing runs layout (decision 14). And implement <code>pack</code>'s radius claim in the same effort as cross-sections, so the claim design is tested by two consumers (decision 15; lean yes).</p>"""),
        ],
    ),
    dict(
        id="baselines",
        title="1. Stacked area, with each baseline",
        blocks=[
            ("p", "<p>US unemployment by industry, monthly from 2000 to 2010, 14 industries (vega-datasets <code>unemployment-across-industries</code>, from the Bureau of Labor Statistics). The stack's <code>baseline</code> chooses where its own 0 is. Each choice is an offset at each u, so every band keeps its thickness.</p>"),
            ("item", dict(
                img="jobs-start.png",
                cap="<code>Baseline.start()</code>, the default: the first industry starts at 0. Real render of today's spelling.",
                label="Proposed",
                js="""chart(jobs)
  .flow(stack({ by: "series", dir: "y" })) // @hl
  .mark(ribbon({ x: "date", h: "count", fill: "series" })); // @hl""",
                py="""chart(jobs).flow(stack(by="series", dir="y")).mark(  # @hl
    ribbon(x="date", h="count", fill="series")  # @hl
)""",
                today_label="Today (runs)",
                today_js="""chart(jobs)
  .flow(scatter({ by: "date", x: "date" }), stack({ by: "series", dir: "y" })) // @hl
  .mark(ribbon({ h: "count", fill: "series" }));""",
            )),
            ("item", dict(
                img="jobs-middle.png",
                cap="<code>Baseline.middle()</code>: the middle of the whole is at 0 (emulated: d3's silhouette offset computed in <code>derive</code>). The y axis is dropped, because position no longer means an amount from 0.",
                label="Proposed",
                js="""chart(jobs)
  .flow(stack({ by: "series", dir: "y", baseline: Baseline.middle() })) // @hl
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));""",
                py="""chart(jobs).flow(stack(by="series", dir="y", baseline=Baseline.middle())).mark(  # @hl
    ribbon(x="date", h="count", fill="series")
)""",
                today_label="Today (the offset computed by hand, about 20 lines)",
                today_js="""chart(jobs)
  .flow(
    derive((rows) => stackRows(rows, { offset: "silhouette" })), // @hl
    scatter({ by: "date", x: "date" }),
    scatter({ by: "series", yMin: "y0", yMax: "y1" }) // @hl
  )
  .mark(ribbon({ fill: "series" }));""",
            )),
            ("item", dict(
                img="jobs-wiggle.png",
                cap="<code>Baseline.wiggle()</code>: the baseline curve that flattens the bands, a streamgraph (emulated: d3's wiggle offset computed in <code>derive</code>).",
                label="Proposed",
                js="""chart(jobs)
  .flow(stack({ by: "series", dir: "y", baseline: Baseline.wiggle() })) // @hl
  .mark(ribbon({ x: "date", h: "count", fill: "series" }));""",
                py="""chart(jobs).flow(stack(by="series", dir="y", baseline=Baseline.wiggle())).mark(  # @hl
    ribbon(x="date", h="count", fill="series")
)""",
                today_label="Today (the offset computed by hand)",
                today_js="""chart(jobs)
  .flow(
    derive((rows) => stackRows(rows, { offset: "wiggle" })), // @hl
    scatter({ by: "date", x: "date" }),
    scatter({ by: "series", yMin: "y0", yMax: "y1" }) // @hl
  )
  .mark(ribbon({ fill: "series" }));""",
            )),
            ("item", dict(
                img="likert-baseline.png",
                cap="<code>Baseline.at(\"Neutral\", 0.5)</code>: a diverging stack whose 0 is the middle of the Neutral bar. Real render of today's spelling, on a small survey.",
                label="Proposed (Trait.diverging stays the default and desugars to this)",
                js="""chart(survey)
  .flow(
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x", baseline: Baseline.at("Neutral", 0.5) }) // @hl
  )
  .mark(rect({ w: "count", fill: "response" }));""",
                py="""chart(survey).flow(
    spread(by="question", dir="y"),
    stack(by="response", dir="x", baseline=Baseline.at("Neutral", 0.5)),  # @hl
).mark(rect(w="count", fill="response"))""",
                today_label="Today (runs; the unit's trait sets the 0)",
                today_js="""chart(survey, {
  schema: {
    response: Unit({
      domain: Domain.discrete(LEVELS),
      traits: [Trait.diverging()], // @hl
    }),
  },
})
  .flow(spread({ by: "question", dir: "y" }), stack({ by: "response", dir: "x" }))
  .mark(rect({ w: "count", fill: "response" }));""",
            )),
            ("p", """<p>The values name a place on the stack, as <code>alignment</code>'s values do, so d3's <code>zero</code> becomes <code>start</code> and Vega-Lite's <code>center</code> becomes <code>middle</code>. <code>Baseline.end()</code> also exists, for a stack that grows the other way. An explicit <code>baseline</code> over a unit with <code>Trait.diverging</code> is an error, because the unit already fixes the 0. With <code>middle</code> and <code>wiggle</code> a position on the value axis is no longer an amount from 0, so the axis can only measure thickness, which is why streamgraphs drop it.</p>
<p><b>Precedent.</b> d3's <code>stackOffsetNone</code>, <code>Silhouette</code>, <code>Wiggle</code> and <code>Diverging</code>; Vega-Lite's <code>stack: \"zero\" | \"center\" | \"normalize\"</code>; matplotlib's <code>stackplot(baseline=\"zero\" | \"sym\" | \"wiggle\" | \"weighted_wiggle\")</code>. Byron and Wattenberg (2008) call the bottom curve g<sub>0</sub> the baseline.</p>
<p><b>Naming.</b> <code>baseline</code> is already GoFish's word for a node's 0 point, and <code>alignment: \"baseline\"</code> already reads it, so one word names one thing: the stack sets its baseline, and the parent lines baselines up. <code>origin</code> is out because the origin lives on the measure type, and an option by that name would read as overriding it. <code>alignment</code> is out because it is the parent's rule for the other axis.</p>
<h4>Baseline on spread, and anchor</h4>
<p>Three options of <code>spread</code> choose a point, and each answers a different question. Today's behavior is from <code>graphicalOperators/spread.tsx</code> and <code>constraints/distribute.ts</code>.</p>
<div class="table-wrap"><table>
<tr><th>Option</th><th>Axis</th><th>What it chooses</th><th>How many choices</th><th>Today</th></tr>
<tr><td><code>alignment</code></td><td>the other axis</td><td>which point of each child lines up</td><td>one rule for all children</td><td><code>\"start\" | \"middle\" | \"end\" | \"baseline\"</code>, default <code>\"baseline\"</code></td></tr>
<tr><td><code>anchor</code></td><td>along the axis</td><td>which point of each child the spacing is measured between</td><td>one rule for each pair of neighbors</td><td><code>\"edge\"</code> (the default): a gap between facing edges. <code>\"start\" | \"middle\" | \"end\" | \"baseline\"</code>: a fixed pitch between those points. A stack ignores it: glued parts always chain head to tail</td></tr>
<tr><td><code>baseline</code> (new)</td><td>along the axis</td><td>which point of the whole result is its own 0</td><td>one for the whole</td><td>internal only: <code>StackOrigin</code> (<code>{ part, fraction, mirrored }</code>), passed as <code>origin</code> and only with <code>glue</code>. The code says \"a spread packs boxes and has no origin\"</td></tr>
</table></div>
<p>So <code>baseline</code> does not replace <code>anchor</code>: one is a choice for each pair of neighbors, the other one choice for the whole. What <code>baseline</code> replaces is the internal <code>StackOrigin</code> and the <code>origin</code> field, and the implicit behavior of <code>Trait.diverging</code>, which becomes a default that desugars to <code>Baseline.at(...)</code>.</p>
<p><b>No <code>mirrored</code> field.</b> <code>StackOrigin</code> has a third field, <code>mirrored</code>, which a diverging unit sets (<code>stackOrigin</code> in <code>ast/schema.ts</code>). It does two things today. An axis over a mirrored space labels each tick with its distance from 0 (<code>elaborateContinuousAxis</code> in <code>ast/axes/elaborate.tsx</code>), so a Likert axis reads 40 20 0 20 40. And a stack with it rejects a negative part (<code>distributeSpaceFold</code> in <code>ast/constraints/distribute.ts</code>). Both rest on one fact the stack can already see: every part is a nonnegative amount, that is, every part's descent is 0. So the field is not needed. The proposal is that the stack computes the flag from its parts instead of storing it on the origin. <code>Baseline.at(part, fraction)</code> is then exactly the two remaining fields of <code>StackOrigin</code>, and <code>Trait.diverging</code> desugars to it with nothing left over. With the 0 at the start, the distance from 0 is the value, so nothing changes for a plain stack. With <code>Baseline.end()</code> the labels read as distances too, which suits bars that grow the other way. A stack with a negative part keeps signed labels, as today.</p>
<p>Three details. A computed flag cannot reject a negative part, since a negative part only makes the labels signed. If that error should stay, it becomes a check that <code>Trait.diverging</code> makes on its parts, and it needs no flag. A union already follows the same rule: <code>overlay</code> in <code>graphicalOperators/alignment.ts</code> keeps the flag only when every child has it (<code>allMirrored</code>) and the result has a 0, so a layer of two stacks keeps distances and a layer of a stack and a signed line gets signed labels. And the code drops the flag in some places today (<code>TODO(#995)</code> in <code>underlyingSpace.ts</code>: layer axis merging, a coord's declared window, and <code>anchorAt</code>). This is a reading of the code. It has not been run.</p>
<h4>From <code>Trait.diverging</code> to <code>Baseline.at</code></h4>
<p><code>Trait.diverging(midpoint?)</code> already desugars to a part and a fraction. Its midpoint is a point along the level order, where level i spans [i, i + 1]; the default is n / 2 for n levels (<code>families/trait.ts</code>). <code>stackOrigin</code> in <code>ast/schema.ts</code> turns it into <code>{ part, fraction }</code>: inside a level, that far through the part; on a boundary, the tail of the first part laid out past it (fraction 0), or the head of the last part when every part lies before it. In general, midpoint = rank(level) + fraction.</p>
<div class="table-wrap"><table>
<tr><th>Trait</th><th>Levels</th><th>Midpoint</th><th>Baseline</th></tr>
<tr><td><code>Trait.diverging()</code></td><td>5 Likert levels</td><td>2.5</td><td><code>Baseline.at(\"Neutral\", 0.5)</code></td></tr>
<tr><td><code>Trait.diverging()</code></td><td>Male, Female</td><td>1</td><td><code>Baseline.at(\"Female\", 0)</code></td></tr>
<tr><td><code>Trait.diverging(3)</code></td><td>5 Likert levels</td><td>3</td><td><code>Baseline.at(\"Agree\", 0)</code>, the 4th level</td></tr>
</table></div>
<p>So a population pyramid with a gap and no label in it is <code>Baseline.at(\"Female\", 0)</code> on a spread. With the same <code>spacing</code> in every row, the start of Female and the middle of the gap differ by half a gap in every row alike, so the picture is the same.</p>
<p><b>A part the data lacks.</b> The trait keeps one rule that <code>Baseline.at</code> must keep too: the 0 is defined by the level order, not by the parts present, so \"a group the data lacks moves nothing\" (<code>stackOrigin</code>'s comment). <code>Baseline.at(\"Neutral\", 0.5)</code> in a row with no Neutral answers puts the 0 on the boundary where Neutral would be. That needs the column's order: its declared levels (<code>Domain.discrete</code>), which <code>stackOrigin</code> reads today, or, with none declared, the order the split puts groups in. What <code>Baseline.at</code> does when the named part is absent, and when the column has no declared order, is decision 2; the lean is to do what the trait does.</p>
<p><b>On <code>spread</code>.</b> A stack is a spread with <code>glue</code>; they are one node, <code>Spread</code>. Settled: <code>spread</code> takes <code>baseline</code> too, with <code>start</code>, <code>end</code>, <code>middle</code> and <code>at(part, fraction)</code>. A parent's <code>alignment: \"baseline\"</code> already reads a child's 0. <code>Baseline.wiggle()</code> stays stack-only, because it needs glued cross-sections. <code>layer</code> and <code>scatter</code> do not take it: their children are placed in one shared space, whose 0 is the space's own.</p>
<p>Four examples follow, strongest first, and then the gallery's population pyramid. Each image is a real render of an emulation in today's API (<code>stories/proposals/stack-profile/BaselineSpread.stories.tsx</code>). The proposed code does not run yet.</p>"""),
            ("item", dict(
                img="baseline-spread-likert-gaps.png",
                cap="Five survey questions with 200 answers each, from the gallery Likert story's made-up survey. Each row's segments have gaps between them and are centered on the middle of Neutral. Emulated: each segment's ends are computed in <code>derive</code>, with the gap in data units, so the x axis shows negative numbers on the disagree side. <b>Judgment:</b> the strongest. Where 0 falls depends on each row's data, so cutting the rows into columns cannot do it, and the only other way today is a stack with a white stroke, which fakes the gaps by eating into each bar.",
                label="Proposed",
                js="""chart(survey, { color: likertColors })
  .flow(
    spread({ by: "question", dir: "y" }),
    spread({
      by: "response",
      dir: "x",
      spacing: 3,
      baseline: Baseline.at("Neutral", 0.5), // @hl
    })
  )
  .mark(rect({ w: "count", fill: "response" }))
  .render(root, { w: 480, h: 200 });""",
                py="""chart(survey, color=likert_colors).flow(
    spread(by="question", dir="y"),
    spread(by="response", dir="x", spacing=3, baseline=Baseline.at("Neutral", 0.5)),  # @hl
).mark(rect(w="count", fill="response")).render(w=480, h=200)""",
                today_label="Today (runs; <code>fromNeutral</code> is about 20 lines of offset arithmetic)",
                today_js="""chart(survey, { w: 480, h: 200, color: LIKERT })
  .flow(
    derive(fromNeutral), // @hl
    spread({ by: "question", dir: "y", spacing: 6 }),
    scatter({ by: "response", xMin: "lo", xMax: "hi" }) // @hl
  )
  .mark(rect({ fill: "response" }));""",
            )),
            ("item", dict(
                img="baseline-spread-concordance.png",
                cap="Six hand-made sentences that contain \"spread\", each lined up on the keyword, as a concordance (a keyword-in-context listing from corpus linguistics) prints them. Emulated with three hand-built columns. <code>at</code> is each word's position counted from the keyword, so the keyword is part <code>0</code>. <b>Judgment:</b> good. The words have different widths, so no <code>derive</code> can compute the offsets, and today the data must be cut into columns by hand, which leaves the <code>chart(data)</code> flow and needs a blank placeholder when a row has nothing on one side.",
                label="Proposed",
                js="""chart(words)
  .flow(
    spread({ by: "line", dir: "y", spacing: 6 }),
    spread({ by: "at", dir: "x", spacing: 4, baseline: Baseline.at(0, 0.5) }) // @hl
  )
  .mark(text({ text: "word" }))
  .render(root, { w: 480, h: 150 });""",
                py="""chart(words).flow(
    spread(by="line", dir="y", spacing=6),
    spread(by="at", dir="x", spacing=4, baseline=Baseline.at(0, 0.5)),  # @hl
).mark(text(text="word")).render(w=480, h=150)""",
                today_label="Today (runs; <code>side</code> is a helper of about 10 lines that builds one column)",
                today_js="""spread({ dir: "x", spacing: 4 }, [
  side((w) => w.at < 0, "end"), // @hl
  side((w) => w.at === 0, "start"), // @hl
  side((w) => w.at > 0, "start"), // @hl
]).render(c, { w: 480, h: 150 });""",
            )),
            ("item", dict(
                img="baseline-spread-click-paths.png",
                cap="Six hand-made shopping sessions drawn as page chips, lined up on the start of the Cart step, like the path views in web analytics tools. Emulated with the same three columns. <b>Judgment:</b> the same structure as the concordance. With chips of one fixed width it would not need <code>baseline</code>, because a <code>scatter</code> on the step index already lines them up.",
                label="Proposed",
                js="""chart(steps)
  .flow(
    spread({ by: "session", dir: "y", spacing: 6 }),
    spread({ by: "at", dir: "x", spacing: 4, baseline: Baseline.at(0, 0) }) // @hl
  )
  .mark((d) =>
    enclose({ padding: 3, fill: pageColor(d[0].page) }, [
      text({ text: d[0].page }),
    ])
  )
  .render(root, { w: 480, h: 170 });""",
                py="""chart(steps).flow(
    spread(by="session", dir="y", spacing=6),
    spread(by="at", dir="x", spacing=4, baseline=Baseline.at(0, 0)),  # @hl
).mark(
    lambda d: enclose([text(text=d[0]["page"])], padding=3, fill=page_color(d[0]["page"]))
).render(w=480, h=170)""",
                today_label="Today (runs; <code>pathSide</code> is the same helper with chips, about 15 lines)",
                today_js="""spread({ dir: "x", spacing: 4 }, [
  pathSide((s) => s.at < 0, "end"), // @hl
  pathSide((s) => s.at === 0, "start"), // @hl
  pathSide((s) => s.at > 0, "start"), // @hl
]).render(c, { w: 480, h: 170 });""",
            )),
            ("item", dict(
                img="baseline-spread-pyramid-labels.png",
                cap="Approximate US 2020 census counts by age and sex, in millions, rounded and entered by hand. Each row is a male bar, the age label and a female bar, centered on the label. Emulated: <code>derive</code> puts the label in a gap 6 million wide. <b>Judgment:</b> a visualization people publish, but the weakest case. Every row has the same three parts, so three columns (male bars aligned to their end, labels, female bars aligned to their start) already draw it today.",
                label="Proposed",
                js="""chart(people, { color: sexColors })
  .flow(
    spread({ by: "age", dir: "y", spacing: 3, reverse: true }),
    spread({
      by: "part",
      dir: "x",
      spacing: 6,
      baseline: Baseline.at("Age", 0.5), // @hl
    })
  )
  .mark((d) =>
    d[0].part === "Age"
      ? text({ text: d[0].age })
      : rect({ w: "millions", fill: "part" })(d)
  )
  .render(root, { w: 480, h: 260 });""",
                py="""chart(people, color=sex_colors).flow(
    spread(by="age", dir="y", spacing=3, reverse=True),
    spread(by="part", dir="x", spacing=6, baseline=Baseline.at("Age", 0.5)),  # @hl
).mark(
    lambda d: (
        text(text=d[0]["age"])
        if d[0]["part"] == "Age"
        else rect(w="millions", fill="part")(d)
    )
).render(w=480, h=260)""",
                today_label="Today (runs)",
                today_js="""chart(people, { w: 480, h: 260, color: SEX })
  .flow(
    derive(aroundLabel), // @hl
    spread({ by: "age", dir: "y", spacing: 3, reverse: true }),
    scatter({ by: "part", xMin: "lo", xMax: "hi" }) // @hl
  )
  .mark((d) =>
    d[0].part === "Age"
      ? // a box as wide as the gap, the label centered in it
        spread({ dir: "y", spacing: 0, alignment: "middle" }, [
          rect({ h: 0, fill: "none" }),
          text({ text: d[0].age, fontSize: 11 }),
        ])
      : rect({ fill: d[0].part === "Male" ? "#5b8db8" : "#d9776b" })
  );""",
            )),
            ("item", dict(
                img="pyramid-diverging.png",
                cap="The gallery's <code>Population Pyramid</code> (real render of today's spelling): women and men in each age band, drawn out from a shared center. The proposed code names the same 0 with <code>Baseline.at</code> in place of the unit's trait; it does not run yet. A <code>spread</code> with <code>spacing</code> in place of the <code>stack</code> gives the same picture with a gap at the center.",
                label="Proposed",
                js="""chart(population, { color: sexColors })
  .flow(
    spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
    stack({ by: "sex", dir: "x", baseline: Baseline.at("Men", 0) }) // @hl
  )
  .mark(rect({ w: "people", fill: "sex" }));""",
                py="""chart(population, color=sex_colors).flow(
    spread(by=field("age").reverse(), dir="y", spacing=1),
    stack(by="sex", dir="x", baseline=Baseline.at("Men", 0)),  # @hl
).mark(rect(w="people", fill="sex"))""",
                today_label="Today (runs; <code>stories/forwardsyntax/Bar/Diverging.stories.tsx</code>)",
                today_js="""chart(population, {
  schema: {
    sex: Unit({
      domain: Domain.discrete(["Women", "Men"]),
      traits: [Trait.diverging()], // @hl
    }),
  },
  color: Color.palette({ Women: "#c05780", Men: "#3b75af" }),
})
  .flow(
    spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
    stack({ by: "sex", dir: "x" })
  )
  .mark(rect({ w: "people", fill: "sex" }));""",
            )),
            ("p", """<h4>What the examples showed</h4>
<ul>
<li><b>Candidates that were dropped</b>, because today's API says them as simply. Numbers lined up on the decimal point, and equations on the equals sign: every row has the same parts, so columns do it, as tables and LaTeX <code>align</code> do. A swimmer plot, and sequences lined up on a motif: the events have times or a fixed pitch, so a <code>scatter</code> with an offset does it. A parent over the middle of its children: <code>Baseline.middle()</code> gives what the parent's <code>alignment: \"middle\"</code> gives today.</li>
<li><b>Out of scope.</b> The rule of Reingold and Tilford's tidy trees, a parent midway between its first and last children's own 0 points, is not a baseline of the children's spread.</li>
</ul>
<h4>Alignment is a shorthand for a shared baseline</h4>
<p>Three rows of bars with gaps, lined up by the parent. Each image is a real render of today's code (the <code>Claim*</code> stories in the same file). Beside it is the proposed spelling of the same picture, not run: each row says where its own 0 is, and the parent keeps its default, <code>alignment: \"baseline\"</code>, and lines the 0s up.</p>"""),
            ("item", dict(
                img="alignment-sugar-start.png",
                cap="<code>alignment: \"start\"</code>. Today's default, <code>\"baseline\"</code>, renders the same geometry, because a spread's 0 is its start today, so <code>Baseline.start()</code> as the default changes nothing.",
                label="Proposed: each row sets its baseline",
                js="""chart(bars)
  .flow(
    spread({ by: "row", dir: "y", spacing: 6 }),
    spread({ by: "part", dir: "x", spacing: 4, baseline: Baseline.start() }) // @hl
  )
  .mark(rect({ w: "w", fill: "part" }));""",
                py="""chart(bars).flow(
    spread(by="row", dir="y", spacing=6),
    spread(by="part", dir="x", spacing=4, baseline=Baseline.start()),  # @hl
).mark(rect(w="w", fill="part"))""",
                today_label="Today (runs): the parent says where the rows line up",
                today_js="""chart(bars)
  .flow(
    spread({ by: "row", dir: "y", spacing: 6, alignment: "start" }), // @hl
    spread({ by: "part", dir: "x", spacing: 4 })
  )
  .mark(rect({ w: "w", fill: "part" }));""",
            )),
            ("item", dict(
                img="alignment-sugar-middle.png",
                cap="<code>alignment: \"middle\"</code>: the rows are centered.",
                label="Proposed: each row sets its baseline",
                js="""chart(bars)
  .flow(
    spread({ by: "row", dir: "y", spacing: 6 }),
    spread({ by: "part", dir: "x", spacing: 4, baseline: Baseline.middle() }) // @hl
  )
  .mark(rect({ w: "w", fill: "part" }));""",
                py="""chart(bars).flow(
    spread(by="row", dir="y", spacing=6),
    spread(by="part", dir="x", spacing=4, baseline=Baseline.middle()),  # @hl
).mark(rect(w="w", fill="part"))""",
                today_label="Today (runs): the parent says where the rows line up",
                today_js="""chart(bars)
  .flow(
    spread({ by: "row", dir: "y", spacing: 6, alignment: "middle" }), // @hl
    spread({ by: "part", dir: "x", spacing: 4 })
  )
  .mark(rect({ w: "w", fill: "part" }));""",
            )),
            ("item", dict(
                img="alignment-sugar-end.png",
                cap="<code>alignment: \"end\"</code>: the rows end together.",
                label="Proposed: each row sets its baseline",
                js="""chart(bars)
  .flow(
    spread({ by: "row", dir: "y", spacing: 6 }),
    spread({ by: "part", dir: "x", spacing: 4, baseline: Baseline.end() }) // @hl
  )
  .mark(rect({ w: "w", fill: "part" }));""",
                py="""chart(bars).flow(
    spread(by="row", dir="y", spacing=6),
    spread(by="part", dir="x", spacing=4, baseline=Baseline.end()),  # @hl
).mark(rect(w="w", fill="part"))""",
                today_label="Today (runs): the parent says where the rows line up",
                today_js="""chart(bars)
  .flow(
    spread({ by: "row", dir: "y", spacing: 6, alignment: "end" }), // @hl
    spread({ by: "part", dir: "x", spacing: 4 })
  )
  .mark(rect({ w: "w", fill: "part" }));""",
            )),
            ("p", """<p>So <code>alignment: \"start\" | \"middle\" | \"end\"</code> is a shorthand for giving every child the same baseline. <code>baseline</code> is the general form, because each row can choose a different point (the diverging bars above), and because the shared 0 is passed up to the parent, where the alignment form lines the children up but does not make that line the parent's own 0 (read from <code>constraints/align.ts</code> and <code>localAnchorPoint</code> in <code>ast/dims.ts</code>, not rendered). Nothing is proposed to change in <code>alignment</code>.</p>
<p><b><code>anchor</code> itself.</b> Its future is on the <a href=\"https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty\">Optical spacing</a> page, where the earlier idea was that a pitch spacing absorbs it.</p>
<p><b>The per-x spelling.</b> With today's per-x form, <code>stack({ baseline: Baseline.middle() })</code> inside each x column, plus the parent's baseline alignment, already gives the centered stack, because each column's offset depends only on that column. Only <code>wiggle</code> needs the whole series, because each offset depends on the neighbors.</p>"""),
            ("p", """<h4>Precedent: alignment lines in UI frameworks</h4>
<p>UI layout systems have the same idea under other names: an alignment guide, an alignment line, a baseline, a reference point. Each row was read from the current official docs (or, for TeX, from Eijkhout's <i>TeX by Topic</i>); the links are in the last column. A claim the docs did not confirm is marked \"not checked\".</p>
<div class="table-wrap"><table>
<tr><th>Framework</th><th>The line</th><th>Who declares it</th><th>Does it pass up to the parent</th><th>Source</th></tr>
<tr><td>SwiftUI</td><td>Named alignment guides: <code>.leading</code>, <code>.center</code>, <code>.trailing</code> on the horizontal axis, <code>.top</code>, <code>.bottom</code>, <code>.firstTextBaseline</code> and others on the vertical axis, or a custom one: an <code>AlignmentID</code> with <code>defaultValue(in:)</code></td><td>Every view has a default value for every guide. The stack names the guide it aligns on, <code>HStack(alignment: .firstThird)</code>, and <code>.alignmentGuide(g) { d in ... }</code> on a child overrides that child's value</td><td>Yes. A custom <code>Layout</code> that does not say otherwise \"merges the subviews' guides\", and the docs' nested example sets a guide on a <code>Text</code> inside a <code>VStack</code> that the outer <code>HStack</code> lines up. The docs do not say how the values are merged</td><td><a href="https://developer.apple.com/documentation/swiftui/alignmentid">AlignmentID</a>, <a href="https://developer.apple.com/documentation/swiftui/horizontalalignment">HorizontalAlignment</a>, <a href="https://developer.apple.com/documentation/swiftui/layout/explicitalignment(of:in:proposal:subviews:cache:)-8ofeu">Layout.explicitAlignment</a>, <a href="https://developer.apple.com/documentation/swiftui/aligning-views-across-stacks">Aligning views across stacks</a></td></tr>
<tr><td>Jetpack Compose</td><td><code>AlignmentLine</code>: <code>FirstBaseline</code> and <code>LastBaseline</code> (text provides them), or a custom <code>HorizontalAlignmentLine</code> or <code>VerticalAlignmentLine</code> with a merger</td><td>A layout reports its lines in <code>layout(width, height, alignmentLines)</code>, and a parent reads <code>placeable[line]</code>. A child of a <code>Row</code> joins with <code>Modifier.alignByBaseline()</code> or <code>alignBy(line)</code></td><td>Yes, automatically: a line \"will be automatically inherited by the layout's parent, which will offset the value by the position of the child\". Values from several children are combined by the merger (the docs' examples use min and max). A layout that sets the line itself wins</td><td><a href="https://developer.android.com/reference/kotlin/androidx/compose/ui/layout/AlignmentLine">AlignmentLine</a>, <a href="https://developer.android.com/develop/ui/compose/layouts/alignment-lines">Alignment lines</a>, <a href="https://developer.android.com/reference/kotlin/androidx/compose/foundation/layout/RowScope">RowScope</a></td></tr>
<tr><td>CSS flexbox</td><td>A first and a last baseline set</td><td>The container: <code>align-items: baseline | first baseline | last baseline</code>, or an item with <code>align-self</code></td><td>Yes. The container's first or last baseline comes from the items on its first or last line that take part in baseline alignment, or else from its first or last item. The grid rules are in CSS Grid (not checked)</td><td><a href="https://www.w3.org/TR/css-flexbox-1/#flex-baselines">CSS Flexbox 8.5</a>, <a href="https://www.w3.org/TR/css-align-3/">CSS Box Alignment</a></td></tr>
<tr><td>Flutter</td><td>A text baseline (<code>textBaseline</code> picks which one)</td><td>A render box computes its distance to the baseline in <code>computeDistanceToActualBaseline</code>. A <code>Row</code> with <code>CrossAxisAlignment.baseline</code> lines its children up on it; the <code>Baseline</code> widget puts a child's baseline at a given distance from the top</td><td>A box may defer to a child (the docs say to call <code>getDistanceToActualBaseline</code> on it). What a <code>Row</code> reports as its own baseline: not checked</td><td><a href="https://api.flutter.dev/flutter/rendering/RenderBox/computeDistanceToActualBaseline.html">computeDistanceToActualBaseline</a>, <a href="https://api.flutter.dev/flutter/rendering/CrossAxisAlignment.html">CrossAxisAlignment</a>, <a href="https://api.flutter.dev/flutter/widgets/Baseline-class.html">Baseline</a></td></tr>
<tr><td>UIKit Auto Layout</td><td>A first and a last baseline</td><td>Constraints between the baselines of any two views. A view names the subview whose baseline it uses: <code>forFirstBaselineLayout</code> (\"Override this property to return a text-based subview\")</td><td>By naming. A vertical <code>UIStackView</code> returns its first arranged view for the first baseline and its last for the last; a horizontal one returns its tallest view. If that view is a stack view, the call goes on into it</td><td><a href="https://developer.apple.com/documentation/uikit/uistackview">UIStackView</a>, <a href="https://developer.apple.com/documentation/uikit/uiview/forfirstbaselinelayout">forFirstBaselineLayout</a></td></tr>
<tr><td>Android views</td><td>The text baseline (<code>getBaseline()</code>); in <code>ConstraintLayout</code> also guidelines</td><td><code>ConstraintLayout</code>: a constraint between two widgets, <code>layout_constraintBaseline_toBaselineOf</code>. <code>LinearLayout</code>: <code>baselineAligned</code> lines its children up</td><td>By naming. A <code>LinearLayout</code> inside a baseline-aligned layout \"can specify which of its children to baseline align to\" with <code>baselineAlignedChildIndex</code></td><td><a href="https://developer.android.com/reference/android/widget/LinearLayout">LinearLayout</a>, <a href="https://developer.android.com/reference/androidx/constraintlayout/widget/ConstraintLayout">ConstraintLayout</a></td></tr>
<tr><td>TeX</td><td>One reference point per box, on its baseline, with height above and depth below</td><td>An <code>\\hbox</code> lines its parts' reference points up on its baseline; <code>\\raise</code> and <code>\\lower</code> move one part</td><td>Yes. A <code>\\vbox</code> takes the reference point of its last component, a <code>\\vtop</code> that of its first, and <code>\\vcenter</code> centers on the math axis</td><td><a href="https://ctan.org/pkg/texbytopic">TeX by Topic</a>, chapter 5 (5.1 and 5.3)</td></tr>
</table></div>
<p><b>What is the same.</b> In every row a child reports a line and the parent lines its children's lines up. In SwiftUI, Compose, CSS flexbox, UIKit stack views, <code>LinearLayout</code> and TeX the line also passes up, so a grandparent can line up on a line set deep inside. GoFish's one baseline per axis is TeX's model: one reference point per box, which the enclosing list lines up and which passes up. SwiftUI's docs give <code>.leading</code>, <code>.center</code> and <code>.trailing</code> a default value that is a point of the view's box (\"the center guide appears at half the width of the view\"), and a stack lines its children up on one guide. That is the statement above that <code>alignment</code>'s start, middle and end are a shorthand for giving every child the same baseline. The diverging bars are the standard custom-guide example. In SwiftUI the guide is set on the Neutral bar, passes up through its row, and the outer stack lines the rows up on it (written from the docs above, not run):</p>"""),
            swift_verbatim("SwiftUI: a custom guide, set on the Neutral bar of each row", """extension HorizontalAlignment {
    private enum Zero: AlignmentID {
        static func defaultValue(in d: ViewDimensions) -> CGFloat {
            d[HorizontalAlignment.leading]
        }
    }
    static let zero = HorizontalAlignment(Zero.self)
}

VStack(alignment: .zero) {
    HStack(spacing: 3) {
        Bar(disagree)
        Bar(neutral).alignmentGuide(.zero) { d in d.width / 2 }
        Bar(agree)
    }
    // ... one HStack per question
}"""),
            ["code", "The same in this proposal: the row names the part", """spread({ by: "response", dir: "x", baseline: Baseline.at("Neutral", 0.5) });""", """spread(by="response", dir="x", baseline=Baseline.at("Neutral", 0.5))"""],
            ("p", """<p><b>What differs.</b> Three things.</p>
<ul>
<li><b>Who names the point.</b> In a UI framework the child marks its own line, and the container only reads it. In this proposal the container names the part, because a GoFish row's children come from data (<code>by: \"response\"</code>), and there is no child in the spec to put a modifier on. The container naming a child has precedent too: Android's <code>LinearLayout</code> names one by index with <code>baselineAlignedChildIndex</code>, a UIKit view names a subview with <code>forFirstBaselineLayout</code> (a vertical <code>UIStackView</code> names its first arranged view), and TeX's <code>\\vtop</code> and <code>\\vbox</code> name the first and the last component.</li>
<li><b>One line per axis.</b> A GoFish node has one baseline per axis. SwiftUI and Compose have many named lines per axis, and the parent picks one by name. CSS has a first and a last baseline, and TeX has one reference point.</li>
<li><b>What the line means.</b> A UI baseline is a position in pixels. A GoFish baseline is the data 0 of a scale, which also decides the axis labels, as in the Likert axis that reads 40 20 0 20 40. Nothing in a UI framework corresponds to that, or to <code>Baseline.wiggle()</code>, whose 0 changes along the axis.</li>
</ul>
<p><b>When no child gives the line.</b> In SwiftUI a view with no explicit value for a guide uses the guide's default (\"A guide without an explicit value behaves as it would for any other view\"), which <code>defaultValue(in:)</code> computes from that view's own box; the docs' custom guide says \"Default to bottom alignment if no guides are set.\" So a SwiftUI Likert row with no Neutral bar would line up on its leading edge, not where Neutral would be. In Compose a layout whose children give no value has no line, and reading it returns <code>AlignmentLine.Unspecified</code>; when several children give one, the merger combines them. The <code>RowScope</code> reference does not say where an <code>alignBy</code> child without the line is placed. Flutter's <code>Row</code> top-aligns \"children who report no baseline\", and the <code>Baseline</code> widget uses a child's bottom. So the UI frameworks fall back to a point of the box. None of them places a missing child's line by an order of the children, as decision 2 leans to do.</p>"""),
        ],
    ),
    dict(
        id="croissant",
        title="2. Croissant: a density cut into equal-probability cells",
        blocks=[
            ("item", dict(
                img="croissant-main.png",
                cap="Today's gallery story <code>Forward Syntax/Croissant</code> (real render). The proposed code draws the same picture; it does not run yet.",
                label="Proposed",
                js="""const params = [{ mean: 0, sd: 1 }];
const d = dist.normal({ mean: "mean", sd: "sd" });
chart(params)
  .flow(partition({ by: d.bin(Bin.quantiles(5)), dir: "x" })) // @hl
  .mark(
    layer([
      ribbon({ x: d.support(), h: d.density(), inset: 3, fill: PAPER_FILL, stroke: PAPER_STROKE }), // @hl
      circle({ cx: d.median(), cy: 6, r: 3, fill: PAPER_STROKE }),
    ])
  );""",
                py="""params = [{"mean": 0, "sd": 1}]
d = dist.normal(mean="mean", sd="sd")
chart(params).flow(partition(by=d.bin(Bin.quantiles(5)), dir="x")).mark(  # @hl
    layer(
        [
            ribbon(x=d.support(), h=d.density(), inset=3, fill=PAPER_FILL, stroke=PAPER_STROKE),  # @hl
            circle(cx=d.median(), cy=6, r=3, fill=PAPER_STROKE),
        ]
    )
)""",
                today_label="Today (stories/forwardsyntax/Croissant.stories.tsx; the sequence repeats three times in the file)",
                today_js="""const normPdf = (x, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)); // @hl
const gridOf = (f, lo, hi, n) => // @hl
  Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return { x, pdf: f(x) };
  });
const croissant = (grid, { n = 10, fill = FILL, stroke = STROKE } = {}) =>
  layer([
    chart(grid)
      .flow(scatter({ x: "x" }))
      .mark(ribbon({ h: "pdf" }).name("density").hidden()), // @hl
  ]).relate(({ density }) => [ // @hl
    chart(grid)
      .flow(
        derive((rows) => quantileRows(rows, { x: "x", density: "pdf", n: 1000 })), // @hl
        partition({ by: field("x").bin(Bin.quantiles(n)), dir: "x" })
      )
      .mark(
        layer([
          intersect({ fill, stroke, strokeWidth: 2 }, [density, region({ inset: 3 })]), // @hl
          circle({ cx: field("x").median(), cy: 6, r: 3, fill: stroke }),
        ])
      ),
  ]);
// on [-3, 3] the missing tails move the outer cells' medians
const normalGrid = gridOf((x) => normPdf(x), -4, 4, 401); // @hl
croissant(normalGrid, { n: 5, fill: PAPER_FILL, stroke: PAPER_STROKE });""",
            )),
            ("p", """<p><code>d</code> is an expression over a distribution. Each method makes a different kind of value. <code>d.bin(Bin.quantiles(5))</code> is a key that cuts d's axis into 5 cells. <code>d.support()</code> and <code>d.density()</code> are the position and the height of one curve over the mark's parameter t: the support is t &#8614; t and the density is t &#8614; f(t). The ribbon evaluates both channels as functions of t, as a parametric curve (x(t), y(t)) does, and only lowering samples them. <code>d.median()</code> is one number per cell. <code>partition</code> on d's axis restricts the function to each cell. A cell of a Dist is the Dist over that cell with its mass, so the cells meet exactly. No <code>intersect</code>, hidden ribbon, <code>relate</code>, grid or quantile rows. The types of each method are in \"The distribution type\" below.</p>"""),
            ("p", """<h4>Why a mark has a parameter</h4>
<p>A ribbon or a line draws along a path, so it has one parameter t. Every channel of it that holds a function is read at the same t, and the mark draws the points it gets. The rule: those functions' domains must be equal, or it is an error. The user never writes t. Three examples (proposed code, not run):</p>"""),
            ["code", "1. A density: x is t itself and h is f(t), so the mark draws the points (t, f(t))", """ribbon({ x: d.support(), h: d.density() });""", """ribbon(x=d.support(), h=d.density())"""],
            ["code", "2. The same density sideways, for a violin: nothing in the spec says which channel is the x", """ribbon({ y: d.support(), w: d.density() });""", """ribbon(y=d.support(), w=d.density())"""],
            ["code", "3. A P-P plot (probability-probability plot: one distribution's cdf against another's): neither channel is t", """line({ x: a.cdf(), y: b.cdf() });""", """line(x=a.cdf(), y=b.cdf())"""],
            ("p", """<p>Without a shared parameter, <code>h</code> would have to be a function of the x channel. The mark would have to guess which channel that is, which example 2 shows it cannot, and example 3 could not be written at all. An earlier draft gave each function an identity, a hidden parameter symbol, and made two channels with different symbols an error. That was wrong: the P-P plot reads two different distributions at one t, and it is legitimate. Equal domains is the whole rule.</p>"""),
            ("p", "<h4>What the methods compute</h4><p>" + """A field expression like <code>field("mass")</code> works like polars' <code>pl.col("mass")</code>: it sees one column. Every named method on it except <code>bin</code> is one named instance of one of the two custom methods. <code>map((x, i, xs) =&gt; value)</code> is called once per row: <code>x</code> is this row's value of the field, <code>i</code> its index, and <code>xs</code> the values of that field over the rows of the current group (the rows the mark or operator reading the channel was given). <code>reduce((xs) =&gt; value)</code> is called once per group. A user can always write the custom method instead of the named one.""" + "</p>"),
            ["code", "Each method and the custom method it stands for (bins are open; see below)", """field("mass"); // a value per row
field("mass").sum(); // .reduce(sum)
field("mass").median(); // .reduce(median)
field("mass").normalize(); // .map((x, i, xs) => x / sum(xs))
field("mass").density(); // .reduce((xs) => kde(xs)).density()
field("mass").support(); // .reduce((xs) => kde(xs)).support()

// custom methods, used like built-in ones
const share = field("mass").map((x, i, xs) => x / max(xs), { unit: "ratio" });
const top = field("mass").reduce((xs) => max(xs), { unit: "g" });""", """field("mass")  # a value per row
field("mass").sum()  # .reduce(sum)
field("mass").median()  # .reduce(median)
field("mass").normalize()  # .map(lambda x, i, xs: x / sum(xs))
field("mass").density()  # .reduce(lambda xs: kde(xs)).density()
field("mass").support()  # .reduce(lambda xs: kde(xs)).support()

share = field("mass").map(lambda x, i, xs: x / max(xs), unit="ratio")
top = field("mass").reduce(max, unit="g")"""],
            ("p", """
<div class="table-wrap"><table class="methods">
<tr><th>Kind</th><th>Named method</th><th>Formula</th><th>Custom method</th></tr>
<tr><td>Per row</td><td><code>field("mass")</code></td><td>the row's value</td><td><code>.map((x) =&gt; x)</code>. A function accessor works today.</td></tr>
<tr><td rowspan="5">One value per group</td><td><code>.sum()</code></td><td>sum of the present values; missing values are dropped</td><td><code>.reduce(sum)</code></td></tr>
<tr><td><code>.mean()</code></td><td>sum &divide; n over the present values</td><td><code>.reduce(mean)</code></td></tr>
<tr><td><code>.median()</code></td><td>sort the present values; with h = (n &minus; 1) &times; 0.5, interpolate between the values at floor(h) and ceil(h): the type-7 quantile at 0.5, as R and numpy compute it (<code>medianOf</code>, <code>fieldExpr.ts</code>)</td><td><code>.reduce(median)</code></td></tr>
<tr><td><code>.count()</code></td><td>n</td><td><code>.reduce((xs) =&gt; xs.length)</code></td></tr>
<tr><td><code>.distinct()</code></td><td>the number of different values</td><td><code>.reduce((xs) =&gt; new Set(xs).size)</code></td></tr>
<tr><td>Per row, reading the group</td><td><code>.normalize()</code></td><td>x &divide; the group's sum</td><td><code>.map((x, i, xs) =&gt; x / sum(xs))</code></td></tr>
<tr><td rowspan="2">A function value per group</td><td><code>.density()</code></td><td>f(t) = (1 &divide; bw) &Sigma;<sub>i</sub> K((t &minus; x<sub>i</sub>) &divide; bw), K the standard normal density, bw = 0.9 &times; min(sd, IQR &divide; 1.34) &times; n<sup>&minus;1/5</sup> (Silverman's rule, R's <code>bw.nrd0</code>; <code>silvermanBandwidth</code> in <code>overlap.ts</code> computes it). The area under f is n. For a <code>Dist</code>, f is mass &times; its exact density</td><td><code>.reduce((xs) =&gt; kde(xs)).density()</code>: a <code>reduce</code> that returns a Dist is a lifted Dist (\"Lifting\")</td></tr>
<tr><td><code>.support()</code></td><td>t itself, over the domain of the density. How far that domain runs is open (see the decisions); the lean follows ggdist: for rows, the data's own range, with a bounded estimator; for a <code>Dist</code>, its own domain, or its 0.001 to 0.999 quantiles where that is unbounded</td><td><code>.reduce((xs) =&gt; kde(xs)).support()</code>: a Dist's <code>support()</code> is t &#8614; t over its own domain, with the same hidden parameter</td></tr>
<tr><td>Key (bin)</td><td><code>.bin(Bin.step(500))</code>, <code>Bin.thresholds(n)</code>, <code>Bin.quantiles(n)</code></td><td>On main the cells come from the column's domain (its <code>HasDomain</code>), computed once where the data is typed, in <code>chart()</code> or the last <code>derive</code>, so every group of a split sees the same cells, empty ones included (#763; story <code>SharedBinsAcrossGroups</code>). <code>Bin.step(w)</code>: cells [k&times;w, (k+1)&times;w). <code>Bin.thresholds(n)</code>: a step from d3's <code>tickIncrement</code> over the domain, for about n cells. <code>Bin.quantiles(n)</code>: edges at the type-7 quantiles i/n of the column's values (<code>cells.ts</code>)</td><td>Open: how a bin's cells are shared is under review</td></tr>
</table></div>
<p><b>Precedent.</b> A value per group that every row of the group reads is a window function: SQL's <code>median(x) OVER (PARTITION BY g)</code>, or polars' <code>pl.col("x").median().over("g")</code>. <code>normalize</code> is SQL's <code>x / sum(x) OVER (PARTITION BY g)</code>.</p>
<p><b>Bins are the open item.</b> A bin's cells do not come from the group's <code>xs</code>: on main they come from the column's domain, fixed where the data is typed, and the empty cells and their order are kept for the axis. So a bin fits neither custom method as written. How a bin's cells are shared is under review, so this page proposes no custom form for bins.</p>
<p><b>Curves.</b> A density is drawn by two channels of one mark, <code>x: mass.support()</code> (t &#8614; t) and <code>h: mass.density()</code> (t &#8614; f(t)). The ribbon reads every function channel at its one parameter t, as a parametric curve (x(t), y(t)) does (\"Why a mark has a parameter\" above). The domain of t belongs to the value, so no spec names it. Two function channels of one mark whose domains differ, such as <code>x: mass.support()</code> with <code>h: length.density()</code>, are an error. Precedent: the closest is ggdist (Matt Kay's R package for distributions), whose <code>stat_slabinterval</code> computes <code>x</code> or <code>y</code> (the slab's positions), <code>pdf</code>, <code>cdf</code> and <code>n</code> (<code>Inf</code> for an analytic distribution). Vega-Lite's density transform outputs two fields, <code>value</code> and <code>density</code>, and ggplot2 maps <code>after_stat(x)</code> and <code>after_stat(density)</code>.</p>
<p><b>Area.</b> The area under <code>mass.density()</code> is its row count, so stacked densities add up. ggdist users get the same curve by writing <code>aes(thickness = after_stat(pdf * n))</code>. ggdist instead scales thickness after the fact with <code>normalize</code> (<code>"all"</code>, <code>"panels"</code>, <code>"xy"</code>, <code>"groups"</code> or <code>"none"</code>); here that is the stack's or the spread's job, not the curve's.</p>
<p><b>How far t runs.</b> Tools split. seaborn runs a KDE 3 bandwidths past the data (<code>cut=3</code>), and ggplot2 also extends past it. ggdist, for rows, uses <code>density_bounded()</code>, a reflection estimator, and usually trims to the data's range; for an analytic distribution it uses <code>p_limits</code>, the 0.001 and 0.999 quantiles, where the range is unbounded. This is one of the decisions.</p>
<p><b>Naming.</b> <code>support()</code> is the chosen name (Josh is checking it with Matt Kay, author of ggdist). Rejected: <code>value()</code>, which clashes with GoFish's <code>value(...)</code> constructor, and <code>points()</code> or <code>grid()</code>, which name the sampling that specs should not see.</p>
<p><b>Consequences, stated plainly.</b></p>
<ol>
<li><b>A one-value-per-group result is known by its verb.</b> <code>reduce</code> runs once per group, so its value is the same for every row by construction, and a channel that needs one value per group (a <code>circle</code>'s <code>cx</code> in a cell) needs no check. A <code>map</code> whose result happens to be the same for every row is still checked, with the existing \"not constant across the connected group\" error.</li>
<li><b>A <code>map</code> that reads <code>xs</code> can cost O(n&sup2;).</b> <code>normalize</code> written as <code>map((x, i, xs) =&gt; x / sum(xs))</code> sums the group once per row. The engine passes the same <code>xs</code> array to every row of a group, so a memo keyed on it brings that back to O(n). A named method avoids it outright.</li>
<li><b>A custom method sees one field, so it cannot use two.</b> A mean of x weighted by w reads two fields, so it is a <code>derive</code> step, or an expression over two fields, not a custom method.</li>
<li><b>Units get simpler.</b> The custom method sees one field, so the unit it receives is known. It declares only what it returns: the same unit (<code>sum</code>, <code>median</code>), a ratio (<code>normalize</code>), a count, a function whose values are that unit's density, or a unit for each member of a record (\"Lifting\"). Without the declaration, CanSum and the other checks cannot run, so an undeclared result is treated as a plain number that cannot be stacked.</li>
<li><b>Serialization.</b> A named method crosses to Python as data. A Python <code>map</code> reaches JS as a batch call (<code>RESOLVE_ROWS</code>, <code>channels.ts</code>), which today returns one value per row. A Python <code>reduce</code> would be called once per group, and a Python curve needs a new kind of call (see \"Where function values appear\").</li>
</ol>
<p><b>Docs plan.</b> Each method's API reference entry (its descriptor <code>doc</code>) states its formula and the custom method it stands for, as in the table above. This lands with the implementation.</p>
"""),
        ],
    ),
    dict(
        id="custom-method",
        title="2b. Custom methods: map and reduce",
        blocks=[
            ("p", """<p>Settled: a user who needs a method that is not built in writes <code>.map</code> for one value per row or <code>.reduce</code> for one value per group. Josh: \"it doesn't make sense to call a reduction/aggregation like sum/mean a map.\" This section records what each verb takes, why there is exactly one form of <code>reduce</code>, how a function value is made, and the two words that are taken. What a <code>reduce</code>'s result becomes in a spec is the next section, \"Lifting\".</p>"""),
            ["code", "The two verbs", """field("mass").map((x) => x / 1000, { unit: "kg" });
field("mass").map((x, i, xs) => x / sum(xs), { unit: "ratio" });
field("mass").reduce(median, { unit: "g" }); // (xs) => value, any existing function""", """field("mass").map(lambda x, i, xs: x / 1000, unit="kg")
field("mass").map(lambda x, i, xs: x / sum(xs), unit="ratio")
field("mass").reduce(statistics.median, unit="g")"""],
            ("p", """<h4>One form of reduce</h4>
<p><code>reduce</code> takes the whole group, <code>reduce((xs) =&gt; value, { unit })</code>, and nothing else.</p>
<ul>
<li><b><code>Array.prototype.reduce</code>'s form, <code>(acc, x) =&gt; acc</code> with an initial value, is not proposed.</b> The incremental form exists where data streams or is spread over machines, so an aggregate must be built one value at a time and merged: Postgres <code>CREATE AGGREGATE</code> with a state function (<code>SFUNC</code>), Apache Beam's <code>CombineFn</code> (<code>add_input</code>, <code>merge_accumulators</code>, <code>extract_output</code>), and Spark's <code>Aggregator</code> (<code>zero</code>, <code>reduce</code>, <code>merge</code>, <code>finish</code>). Systems in our setting take the whole group: d3's <code>rollup(data, reduce, key)</code>, Observable Plot's reducers <code>(values) =&gt; value</code>, pandas' <code>groupby().agg(f)</code>, and polars' <code>map_batches(f, returns_scalar=True)</code> inside <code>group_by().agg</code>. Arquero is mixed: <code>rollup</code> takes whole-group aggregates such as <code>op.median(\"x\")</code>, but a custom one registered with <code>addAggregateFunction</code> is incremental (<code>init</code>, <code>add</code>, <code>rem</code>, <code>value</code>), because the same definition also runs over sliding windows.</li>
<li><b>A curve is not a second form.</b> It is the same <code>reduce</code>. Whatever the callback returns, a number, a function value, a Dist or a record of the user's own, is lifted by one rule, which the next section, \"Lifting\", states. A bare JS function cannot be a result: it has no domain, and <code>(d) =&gt; number</code> is already a legal channel value meaning a row accessor (<code>DeriveMarkProps</code> in <code>channels.ts</code>). The common case needs no constructor, because a density is a Dist. Any other function is made by <code>fun(f, { domain })</code>, below.</li>
<li><b>A <code>map</code> that ignores <code>x</code> and returns <code>median(xs)</code> is legal, but it is not a way to write a reduce.</b> It is called once per row. The reference will point to <code>reduce</code>.</li>
</ul>"""),
            ts_block("Their types (from the sketch)", "field"),
            ["code", "A custom density: a reduce that returns a Dist (not run)", """const d = field("mass").reduce((xs) => kde(xs), {
  unit: dist.units("g", "count"), // @hl
});
ribbon({ x: d.support(), h: d.density() });""", """d = field("mass").reduce(lambda xs: kde(xs), unit=dist.units("g", "count"))  # @hl
ribbon(x=d.support(), h=d.density())"""],
            ("p", """<p><code>kde(xs)</code> is a Dist that carries its own domain, as the distribution objects of scipy.stats, distributional and Distributions.jl do. So the custom density reads like the built-in one, and no spec names a range. A Dist's members have different units: <code>d.support()</code> is in g, and <code>d.density()</code> in count per g (<code>Per&lt;Count, Grams&gt;</code> in the sketch), because the mass of a Dist built from rows is a count. <code>dist.units(\"g\", \"count\")</code> writes that record of units from the variable's unit and the mass's. How a reduce states the units of a record is decision 17, in \"Lifting\".</p>
<h4>A function that is not a distribution</h4>
<p>A fitted trend line is a function, but not a distribution, so it has no <code>pdf</code> or <code>cdf</code>. It is made by a lowercase factory that takes the function and its domain, in the style of Chebfun and Julia's <code>Fun</code>: <code>fun(f, { domain })</code>. The example below fits a least-squares line to a scatter of car weight against fuel economy. The fit reads two fields, which a custom method cannot do, so it runs before the visualization, here with simple-statistics. The line is then one mark with two function channels read at one t, over the same domain.</p>"""),
            ["code", "A least-squares trend line over a scatter (not run)", """const { m, b } = linearRegression(cars.map((d) => [d.weight, d.mpg]));
const trend = fun((t) => m * t + b, { domain: extent(cars, (d) => d.weight) }); // @hl

layer([
  chart(cars)
    .flow(scatter({ x: "weight", y: "mpg" }))
    .mark(circle({ r: 3 })),
  line({ x: fun((t) => t, { domain: trend.domain }), y: trend }), // @hl
]).render(root, { w: 480, h: 300 });""", """weights = [d["weight"] for d in cars]
fit = linregress(weights, [d["mpg"] for d in cars])  # scipy.stats
trend = fun(lambda t: fit.slope * t + fit.intercept, domain=(min(weights), max(weights)))  # @hl

layer(
    [
        chart(cars).flow(scatter(x="weight", y="mpg")).mark(circle(r=3)),
        line(x=fun(lambda t: t, domain=trend.domain), y=trend),  # @hl
    ]
).render(w=480, h=300)"""],
            ("p", """<p><code>fun</code> makes a <code>Fun&lt;number&gt;</code>, the one generic type from \"The interface\": the function is stored as <code>at</code>, its interval as <code>domain</code>, and <code>knots</code> and <code>curve</code> are optional. A Dist's interval is its <code>support</code>, which is the density's domain, so one word names the interval of a function everywhere on this page. The x channel here is the identity over the same domain, which is all the parameter rule needs. Writing it out is long, and a <code>reduce</code> that returns a function cannot write it at all, because its domain differs per group; so a function expression has a <code>support()</code> method. That is a distribution word, so the name of this channel for a plain function is decision 11. In Python, <code>fun</code> with a lambda needs the bridge work in \"Where function values appear\".</p>
<h4>Precedent for the function value</h4>
<p>Each row was read from the system's current docs. Observable Plot has no function form (a maintainer says so in discussion 1999), and neither does plotly.</p>
<div class="table-wrap"><table>
<tr><th>System</th><th>What the user writes</th><th>The interval is called</th></tr>
<tr><td>Chebfun</td><td><code>chebfun(@(t) besselj(0,t), [0,100])</code>, <code>F.domain</code></td><td>domain</td></tr>
<tr><td>ApproxFun.jl</td><td><code>Fun(exp, -1..1)</code></td><td>positional</td></tr>
<tr><td>Mathematica</td><td><code>InterpolatingFunction</code>, <code>f[\"Domain\"]</code>; <code>ParametricPlot[{fx, fy}, {u, umin, umax}]</code></td><td>Domain</td></tr>
<tr><td>numpy</td><td><code>Polynomial(coef, domain=None, window=None)</code></td><td>domain</td></tr>
<tr><td>Interpolations.jl</td><td><code>bounds(itp)</code></td><td>domain</td></tr>
<tr><td>Mafs</td><td><code>&lt;Plot.OfX y={Math.sin} /&gt;</code>, <code>&lt;Plot.Parametric domain={[0, k]} xy={...} /&gt;</code> (its <code>t</code> prop is deprecated for <code>domain</code>)</td><td>domain</td></tr>
<tr><td>Desmos</td><td><code>parametricDomain: { min, max }</code></td><td>domain</td></tr>
<tr><td>scipy.stats</td><td><code>rv_continuous.support()</code></td><td>support</td></tr>
<tr><td>distributional (R)</td><td><code>support()</code></td><td>support</td></tr>
<tr><td>Distributions.jl</td><td><code>extrema(d)</code>, <code>pdf(d, x)</code></td><td>support</td></tr>
<tr><td>function-plot</td><td><code>{ fn: \"x^2\", range: [a, b] }</code> (parametric data use <code>x</code> and <code>y</code>)</td><td>range</td></tr>
<tr><td>SymPy</td><td><code>plot(x**2, (x, -5, 5))</code>, <code>plot_parametric</code></td><td>range</td></tr>
<tr><td>ggplot2</td><td><code>geom_function(fun = dnorm, xlim = c(-1, 1))</code></td><td>xlim</td></tr>
<tr><td>R</td><td><code>curve(expr, from, to)</code>; <code>approxfun</code> keeps its range in the closure</td><td>from, to</td></tr>
<tr><td>Manim</td><td><code>FunctionGraph(function, x_range=)</code>, <code>ParametricFunction(function, t_range=(0, 1))</code></td><td>x_range, t_range</td></tr>
<tr><td>Vega</td><td>density transform</td><td>extent</td></tr>
<tr><td>scipy</td><td><code>PPoly(c, x)</code></td><td>its breakpoints</td></tr>
<tr><td>Plots.jl</td><td><code>plot(sin, cos, tmin, tmax)</code></td><td>positional</td></tr>
</table></div>
<p>Over the 14 systems that name the interval: <code>domain</code> 6, <code>support</code> 3 (all distribution libraries), <code>range</code> 2, and <code>xlim</code>, <code>from</code>/<code>to</code>, <code>x_range</code>/<code>t_range</code> and <code>extent</code> 1 each. The function itself is mostly positional; ggplot2 calls it <code>fun</code> and Manim <code>function</code>, and only function-plot uses <code>fn</code>, as a field next to <code>range</code>. No surveyed constructor is named <code>fn</code>, and none names its interval <code>over</code>. Every system with parametric curves gives the parameter its own interval, which supports the rule that the interval belongs to the hidden parameter.</p>
<p><b>Names already taken in GoFish.</b> <code>Domain</code> is a unit's set of values (<code>Domain.discrete</code>, <code>families/domain.ts</code>, whose comment says a continuous one comes later). <code>Extent</code> is a size claim (<code>ast/extent.ts</code>). <code>Curve</code> is the family of path shapes. <code>between</code> is a row predicate.</p>"""),
            ("p", """<p><b><code>.then</code> is out.</b> Any object with a <code>then</code> method is a <i>thenable</i>: <code>await</code>, <code>Promise.resolve</code>, <code>Promise.all</code> and the return of an <code>async</code> function all call it as <code>then(resolve, reject)</code>. GoFish resolves channels asynchronously. <code>resolveValue</code> in <code>ast/channels.ts</code> is an <code>async</code> function that returns a channel value that is not a plain object as it is, and it runs on every entry of a channel bag that holds a Python accessor, through <code>Promise.all</code>. So in <code>y: { min: field(\"a\").then(f), max: pythonLambda }</code> the runtime would call <code>f(resolve, reject)</code>, and the channel would never resolve.</p>
<p><b>The other <code>map</code> in GoFish.</b> <code>lib.ts</code> exports a top-level <code>map(data, callback)</code> (<code>ast/iterators/map.ts</code>): an async map over an array, a <code>Map</code> or an object that returns <code>Promise&lt;R[]&gt;</code>, used inside <code>createMark</code> bodies. A method <code>.map</code> on a field expression does not clash with it in JS, because one is a function and the other a method, and Python exports no <code>map</code>. Both mean \"apply this to each element\", so the word keeps one meaning.</p>
<p><b>Rejected.</b> One <code>.map</code> with a <code>{ fold: true }</code> flag (polars' <code>returns_scalar</code>) keeps one verb but needs the flag, an O(n&sup2;) trap without it, and a check that the result is the same across the group. One <code>.apply((x, xs))</code> repeats the pandas ambiguity polars removed, and every JS function already has an <code>apply</code> method. One <code>.transform((xs) =&gt; column or value)</code> is the fastest for <code>normalize</code>, but it gives up the per-row view, and <code>Transform</code> is the name Josh endorsed for the coordinate and palette family.</p>"""),
            ("p", """<h4>Precedent</h4>
<div class="table-wrap"><table>
<tr><th>System</th><th>What the user writes</th><th>Callback gets</th><th>One call returns</th><th>Output type declared by</th></tr>
<tr><td>polars</td><td><code>map_elements(f)</code>, <code>map_batches(f)</code>, <code>rolling_map(f, n)</code>, <code>pipe(f)</code>, <code>.over(\"g\")</code></td><td>one value; a whole Series; a window's Series; the expression</td><td>one value per row; a column, or one value with <code>returns_scalar=True</code>; one per window; an expression</td><td><code>return_dtype=</code></td></tr>
<tr><td>pandas</td><td><code>Series.map(f)</code>, <code>apply(f)</code>, <code>groupby().transform(f)</code>, <code>groupby().agg(f)</code>, <code>pipe(f)</code></td><td>one value; a row or column; a group's Series; a group's Series; the frame</td><td>one per row; varies; same length, or a scalar broadcast to the group; one per group; anything</td><td>nothing; inferred</td></tr>
<tr><td>dplyr</td><td><code>group_by(g) |&gt; mutate(y = x / sum(x))</code>, <code>summarise(m = median(x))</code>, <code>across(cols, f)</code></td><td>a vector expression over the group's columns</td><td>one per row (a length-1 result is recycled); one per group</td><td>the vector's type</td></tr>
<tr><td>SQL</td><td><code>median(x) OVER (PARTITION BY g)</code>; <code>CREATE AGGREGATE</code> (Postgres) with <code>SFUNC</code> and <code>FINALFUNC</code></td><td>an aggregate gets a state and one value at a time</td><td>one per group, or one per row with <code>OVER</code></td><td><code>STYPE</code> and the final function's type</td></tr>
<tr><td>DuckDB, Arrow</td><td><code>create_function(name, f, params, return_type)</code>; <code>pc.register_scalar_function</code>, <code>register_aggregate_function</code></td><td>a value, or an Arrow array</td><td>one per row; one per group</td><td>a declared return type</td></tr>
<tr><td>Spark, Beam</td><td><code>map</code>, <code>mapPartitions</code>; <code>pandas_udf</code> (Series to Series, or Series to scalar); <code>Aggregator</code>; Beam <code>Map</code>, <code>CombineFn</code></td><td>one record; a batch; a Series; an accumulator and one value</td><td>one per row; one per group or window</td><td>a type string or Python type hints, which also pick the kind</td></tr>
<tr><td>Ibis</td><td><code>@ibis.udf.scalar.python</code>, <code>@ibis.udf.agg.builtin</code></td><td>values or columns</td><td>one per row; one per group</td><td>type annotations; the decorator names the kind</td></tr>
<tr><td>JS arrays</td><td><code>xs.map((x, i, xs) =&gt; ...)</code>, <code>xs.reduce((acc, x) =&gt; ..., init)</code></td><td>element, index, the whole array; accumulator and element</td><td>one per element; one</td><td>none</td></tr>
<tr><td>Arquero</td><td><code>derive({ y: d =&gt; d.x / op.sum(d.x) })</code>, <code>rollup({ m: op.median(\"x\") })</code>, <code>escape(f)</code>; <code>addAggregateFunction</code>, <code>addWindowFunction</code></td><td>a row proxy; <code>escape</code> gets a row and cannot use <code>op</code>; a registered aggregate gets a state and one value at a time</td><td>one per row (an aggregate in <code>derive</code> is computed over the group); one per group</td><td>none; the kind is declared by which register call is used</td></tr>
<tr><td>danfo.js</td><td><code>series.map(f)</code>, <code>df.apply(f, { axis })</code>, <code>groupby().agg()</code></td><td>one value; a row or column</td><td>one per row; varies; one per group</td><td>inferred</td></tr>
<tr><td>d3-array</td><td><code>d3.rollup(data, reduce, key)</code>, <code>d3.group</code>, <code>d3.bin().value(f)</code></td><td><code>reduce</code> gets the group's values; an accessor gets <code>(d, i, data)</code></td><td>one per group; one per row</td><td>none</td></tr>
<tr><td>Observable Plot</td><td>a reducer: <code>Plot.groupX({ y: (values, extent) =&gt; ... })</code> or <code>{ reduceIndex(index, values, extent) }</code>; a map: <code>Plot.mapY((values) =&gt; ...)</code>, <code>(index, values) =&gt; ...</code> or <code>{ mapIndex(index, source, target) }</code></td><td>a reducer gets the group's values and its extent; a map gets the series' values</td><td>one per group; an array of the same length (a <code>mapIndex</code> fills the output slots)</td><td>none; the transform names the kind. Checked against Plot's docs source (<code>docs/transforms/group.md</code>, <code>map.md</code>)</td></tr>
<tr><td>Vega, Vega-Lite</td><td>expression strings; <code>aggregate</code> and <code>joinaggregate</code> by op name</td><td>no callbacks</td><td>one per group; one per row (<code>joinaggregate</code>)</td><td>the op</td></tr>
<tr><td>Lodash</td><td><code>_.map</code>, <code>_.sumBy(xs, f)</code>, <code>_.meanBy</code></td><td>element, index, collection</td><td>one per element; one</td><td>none</td></tr>
<tr><td>ggplot2</td><td><code>after_stat(density)</code>; a custom <code>Stat</code> with <code>compute_group</code> or <code>compute_panel</code></td><td>the group's (or panel's) data frame</td><td>a data frame of computed rows</td><td>the columns it returns</td></tr>
<tr><td>ggdist</td><td><code>after_stat(pdf * n)</code>; <code>point_interval</code> functions</td><td>computed variables <code>x</code>, <code>pdf</code>, <code>cdf</code>, <code>n</code></td><td>one per slab position</td><td>the computed variable</td></tr>
<tr><td>Mosaic (vgplot)</td><td>aggregate expressions with chained window methods: <code>avg(\"foo\").orderby(\"date\").rows([3, 3])</code>, <code>median(\"x\").partitionby(\"g\")</code>; custom expressions through the <code>sql</code> template tag (idl.uw.edu/mosaic/sql/)</td><td>no JS callbacks; the expression becomes SQL that DuckDB runs</td><td>one per group, or one per row as a window</td><td>SQL types</td></tr>
</table></div>
<p>Systems that run user functions over groups declare the kind by a separate verb or registration call (Plot's map and reduce transforms, Arquero's aggregate and window registration, Ibis's scalar and agg decorators, Spark's pandas_udf kinds, Postgres' <code>CREATE AGGREGATE</code>, Beam's <code>Map</code> and <code>CombineFn</code>) or by a flag (polars' <code>returns_scalar</code>). polars renamed <code>apply</code> to <code>map_elements</code> and <code>map</code> to <code>map_batches</code> (0.19) because users could not tell which one got a value and which got a column.</p>"""),
        ],
    ),
    dict(
        id="lifting",
        title="Lifting",
        blocks=[
            ("p", """<p>A spec is written once, but a mark is drawn once for each group of rows. So a value in a spec stands for \"this value, computed for each group\". Such a value is an <b>expression</b>: a description of a value that the engine computes later, once per group. A named method, such as <code>field(\"mass\").median()</code>, is an expression that crosses to Python as data. <b>Lifting</b> is the rule that turns a function on one group's values, <code>(xs) =&gt; V</code>, into an expression that gives a V for every group. <code>reduce</code> applies it.</p>
<h4>The rule</h4>
<p>The rule looks only at the shape of what the callback returns. The examples are the summary numbers of a box plot and a density.</p>
<div class="table-wrap"><table>
<tr><th>The callback returns</th><th>The spec holds</th><th>Example callback</th><th>How a channel uses it</th></tr>
<tr><td>A number</td><td>A value expression: one number per group</td><td><code>(xs) =&gt; quantile(xs, 0.75)</code></td><td>Directly, in a channel that takes one value per group: <code>rect({ y2: hi })</code></td></tr>
<tr><td>A function value, <code>Fun&lt;number&gt;</code></td><td>A function expression: one function per group</td><td><code>(xs) =&gt; fun((t) =&gt; share of xs at or below t, { domain: extent(xs) })</code></td><td>Directly, in a channel of a mark that draws along a path: <code>line({ x: f.support(), y: f })</code></td></tr>
<tr><td>A method, <code>(...args) =&gt; W</code>, as a member of a record</td><td>A method with the same arguments, which returns the lift of W</td><td>A Dist's <code>quantile(p)</code></td><td>Call it, then use the result: <code>circle({ cx: d.quantile(0.9) })</code></td></tr>
<tr><td>A record</td><td>An object with one method per member, each returning the lift of that member</td><td><code>(xs) =&gt; ({ lo: quantile(xs, 0.25), mid: median(xs), hi: quantile(xs, 0.75) })</code></td><td>Through its members: <code>rect({ y: s.lo(), y2: s.hi() })</code>. The record itself is not a channel value</td></tr>
<tr><td>A record in a record</td><td>The same rule again, member by member</td><td><code>(xs) =&gt; ({ box: { lo: ..., hi: ... }, n: xs.length })</code></td><td><code>rect({ y: t.box().lo(), y2: t.box().hi() })</code></td></tr>
<tr><td>A Dist, which is a record of numbers and functions</td><td><code>d.support()</code>, <code>d.density()</code>, <code>d.median()</code>, <code>d.quantile(p)</code>, ...</td><td><code>(xs) =&gt; kde(xs)</code></td><td><code>ribbon({ x: d.support(), h: d.density() })</code></td></tr>
</table></div>
<p><b>The law.</b> Lifting a record gives a record of lifted members: an expression of <code>{ lo, hi }</code> is the same thing as <code>{ lo: an expression, hi: an expression }</code>. In types, <code>Lift&lt;{ lo: number; hi: number }&gt;</code> is <code>{ lo(): Lift&lt;number&gt;; hi(): Lift&lt;number&gt; }</code>. A channel takes only the two leaves, a number and a <code>Fun&lt;number&gt;</code>. Members are methods, not properties, so a lifted record reads like today's named methods (<code>.median()</code>), and a member with arguments, <code>quantile(p)</code>, looks the same as one without.</p>"""),
            ["code", "A box plot whose summary numbers are computed once per group (not run)", """const s = field("price").reduce(
  (xs) => ({
    lo: d3.quantile(xs, 0.25),
    mid: d3.median(xs),
    hi: d3.quantile(xs, 0.75),
  }),
  { unit: "USD" }
);

chart(sales)
  .flow(spread({ by: "region", dir: "x", spacing: 24 }))
  .mark(
    layer([
      rect({ w: 16, y: s.lo(), y2: s.hi(), fill: "region" }), // @hl
      rect({ w: 16, h: 1.5, y: s.mid(), fill: "white" }), // @hl
    ])
  );""", """s = field("price").reduce(
    lambda xs: {
        "lo": np.quantile(xs, 0.25),
        "mid": np.median(xs),
        "hi": np.quantile(xs, 0.75),
    },
    unit="USD",
)

chart(sales).flow(spread(by="region", dir="x", spacing=24)).mark(
    layer(
        [
            rect(w=16, y=s.lo(), y2=s.hi(), fill="region"),  # @hl
            rect(w=16, h=1.5, y=s.mid(), fill="white"),  # @hl
        ]
    )
)"""],
            ("p", """<p>The marks are the ones the gallery's box plot uses today (<code>stories/forwardsyntax/BoxPlot.stories.tsx</code>), where the summary numbers are columns computed before the visualization. In Python a record is a dict, and its lift has the same methods.</p>
<h4>The type</h4>
<p>One definition, by the shape of V, and one signature of <code>reduce</code>. TypeScript accepts the recursive definition as written. The second block shows the type each example gets; it typechecks with the rest of the sketch.</p>"""),
            ts_block("Lift, Units and the one signature of reduce (from the sketch)", "lift"),
            ts_block("What each example gets", "lift-examples"),
            ("p", """<h4>What is already a lifted value</h4>
<p>The named methods are instances of the same rule. Today's methods are from <code>FieldExpr</code> in <code>ast/fieldExpr.ts</code>.</p>
<div class="table-wrap"><table>
<tr><th>Spelling</th><th>Today</th><th>In terms of lifting</th></tr>
<tr><td><code>.sum()</code>, <code>.mean()</code>, <code>.median()</code>, <code>.count()</code>, <code>.distinct()</code></td><td>exist</td><td>Each is <code>reduce</code> of a function that returns a number</td></tr>
<tr><td><code>.density()</code>, <code>.support()</code></td><td>proposed on this page</td><td>Members of the lifted empirical Dist of the group, <code>reduce((xs) =&gt; kde(xs))</code></td></tr>
<tr><td><code>dist.normal({ mean: \"mean\", sd: \"sd\" })</code></td><td>proposed in #980</td><td>A lifted Dist, built for each group from the columns its parameters name</td></tr>
<tr><td><code>field(\"mass\")</code>, <code>.normalize()</code></td><td>exist</td><td>Not lifts. Each gives one value per row: bare, the row's value; <code>normalize</code> is a <code>map</code></td></tr>
<tr><td><code>.sort()</code>, <code>.reverse()</code>, <code>.dropNulls()</code>, <code>.between()</code>, <code>.bin()</code></td><td>exist</td><td>Not values. They order, filter or group the rows</td></tr>
</table></div>
<p><code>map</code> is the other verb. Its callback runs once per row and may read the group's values <code>xs</code>, so it gives one value per row, not one per group, and it is not a lift.</p>
<h4>What lifting does not cover</h4>
<ul>
<li><b><code>bin</code>.</b> It is a grouping key: it decides what the groups are, so it is not a value per group. How a bin's cells are shared is still open on this page.</li>
<li><b>A callback that needs two columns.</b> A custom method sees one field, so a mean of x weighted by w is a <code>derive</code> step, as \"What the methods compute\" says.</li>
<li><b>Arrays.</b> Open (decision 18). TypeScript maps a mapped type over an array element by element, so the sketch's types would treat a returned array as a record indexed by position (<code>r[0]()</code>), which is not proposed. The lean is to make it an error, because a list of values per group is rows, which <code>derive</code> makes.</li>
<li><b>Lifting again, or chaining.</b> A lifted value has no <code>map</code> or <code>reduce</code>, so <code>s.lo().map(...)</code> is a type error in the sketch. A value computed from <code>lo</code> and <code>hi</code> goes inside the callback, as another member.</li>
</ul>
<h4>Units</h4>
<p>A number or a function value takes the <code>unit</code> option as today: one unit. A record needs a unit for each member, so the option mirrors the record's shape (<code>Units</code> in the sketch): one unit for all members, as <code>unit: \"USD\"</code> in the box plot, or a record of units, <code>unit: { box: \"USD\", n: \"count\" }</code>. A Dist's members have units that follow from two, the variable's and the mass's: the support is in g, the density in count per g, the cdf is a ratio. <code>dist.units(\"g\", \"count\")</code> writes that record, so a Dist needs only those two. Whether the option takes this shape is decision 17.</p>
<h4>Crossing to Python</h4>
<p>A named method is data: it crosses as a <code>FieldOp</code> in the IR, and the engine computes it. A <code>reduce</code> written in Python is a callback. Today a Python accessor reaches JS as one batch call over rows (<code>RESOLVE_ROWS</code>), which returns one value per row. A Python <code>reduce</code> needs a new kind of call that returns one result per group. A record of numbers comes back as plain data, a dict as a JSON object. A returned function cannot come back: it has to stay in Python and be called with a batch of t values in each resampling round, as \"Where function values appear\" says. Both calls are new bridge work. A Dist made by a GoFish constructor can cross as data once the IR has a dist node.</p>
<h4>Precedent</h4>
<div class="table-wrap"><table>
<tr><th>System</th><th>What the user writes</th><th>What comes back</th><th>Source</th></tr>
<tr><td>polars</td><td>An expression of type <code>Struct</code>, such as <code>pl.col(\"Theatre\").value_counts()</code>; one field is read with <code>.struct.field(...)</code>, and <code>DataFrame.unnest</code> turns every field into a column</td><td>\"<code>Struct</code> is the data type that allows us to ... output multiple columns from an expression\"</td><td><a href="https://docs.pola.rs/user-guide/expressions/structs/">polars user guide, Structs</a></td></tr>
<tr><td>dplyr</td><td><code>summarise()</code> with an expression that returns \"A data frame with 1 row, to add multiple columns from a single expression\"</td><td>one column per member, one row per group</td><td><a href="https://dplyr.tidyverse.org/reference/summarise.html">summarise</a></td></tr>
<tr><td>pandas</td><td><code>groupby().apply(f)</code>, where <code>f</code> returns a named Series</td><td>one row per group, with the Series' labels as columns</td><td><a href="https://pandas.pydata.org/docs/user_guide/groupby.html">Group by, \"Returning a Series to propagate names\"</a></td></tr>
</table></div>
<p>In programming-language terms, \"a value for each group\" is a functor, a type with a map that keeps its shape, and the law above says that a function from groups to records is the same as a record of functions from groups.</p>"""),
        ],
    ),
    dict(
        id="dist",
        title="The distribution type",
        blocks=[
            ("p", """<h4>What the prototype has</h4>
<p>The croissant stories use a plain object, in <code>stories/proposals/stack-profile/croissantDist.ts</code>, that stands in for the Dist of issue #980. The stories draw it with <code>fnCurve({ f: d.pdf, range: d.range })</code>. Its type and constructors, as written:</p>"""),
            ts_verbatim("croissantDist.ts (excerpt, bodies left out)", """export type Dist = {
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
  Array.from({ length: n }, (_, i) => ({ v: d.quantile((i + 0.5) / n) }));"""),
            ("p", """<p>It differs from this page in three ways. Its <code>kde</code> range is the data's extent plus 3 bandwidths on each side, as seaborn does, while the page's lean is ggdist's range trimmed to the data. Its bandwidth is <code>1.06 &times; sd &times; n<sup>&minus;0.2</sup></code> (the normal reference rule), while the page says Silverman's <code>0.9 &times; min(sd, IQR &divide; 1.34) &times; n<sup>&minus;0.2</sup></code>, which <code>silvermanBandwidth</code> computes. And its pdf has area 1, while the page proposes area n for rows. All three are prototype shortcuts; the proposal below follows the page.</p>
<h4>Proposed</h4>
<p>Two levels, with one vocabulary. At run time, a <code>Dist</code> is what the engine asks questions of. #980's sketch has <code>DistRep</code>, which is how a Dist is held (a family with parameters, draws, a mixture, a truncation); this <code>Dist</code> is what every representation answers. Its members are <code>density</code> and <code>cdf</code> (each a <code>Fun&lt;number&gt;</code>), <code>quantile(p)</code>, <code>median</code>, <code>mean</code>, <code>support</code> and <code>mass</code>. <code>support</code> is t &#8614; t, a <code>Fun&lt;number&gt;</code> whose domain is the support interval. It adds <code>mass</code> to the prototype, so stacked densities add. A cell of a partition is <code>restrictDist</code>, a function on a Dist rather than a member: it applies operation 4, <code>restrict</code>, to each function member and scales the mass. In a spec, a <code>DistExpr</code> is an expression over a Dist, as in #980. It is not written by hand: it is the run-time <code>Dist</code> lifted by the general rule in \"Lifting\", so the two cannot drift, plus <code>bin()</code>. <code>field(\"mass\")</code> over a group of rows is the empirical Dist of those rows, so a field expression is the same lifted interface plus the row methods.</p>
<p><b>What is still specific to a Dist.</b> Two things. <code>bin</code>, a grouping key that cuts the Dist's axis into cells, with <code>restrictDist</code> giving each cell its Dist. Restricting to a cell is operation 4 on any <code>Fun</code>, so a key that cuts an axis into cells could be offered for any value that can be restricted, a <code>Fun</code> included; that is not designed here. And its units: each member's unit follows from the variable's unit V and the mass's unit M (<code>support</code> in V, <code>density</code> in M per V, <code>cdf</code> a ratio), which the record <code>DistUnits</code> states once, where a record of the user's own has to say them (decision 17).</p>
<p>The sketch simplifies #980's types: a unit is a plain tag, and #980's dependence parameter (whether draws are joint) is left out.</p>
<p><b>Why <code>density</code> and not <code>pdf</code>.</b> For rows, the density's area is the row count, so it is not a probability density; <code>pdf</code> would name something it is not. For a family the mass is 1 and the two agree. The names elsewhere:</p>
<div class="table-wrap"><table>
<tr><th>System</th><th>Density</th><th>Cumulative</th><th>Inverse</th><th>Where it is defined</th></tr>
<tr><td>scipy.stats</td><td><code>pdf</code></td><td><code>cdf</code></td><td><code>ppf</code></td><td><code>support()</code></td></tr>
<tr><td>Distributions.jl</td><td><code>pdf</code></td><td><code>cdf</code></td><td><code>quantile</code></td><td><code>support</code></td></tr>
<tr><td>distributional (R)</td><td><code>density</code></td><td><code>cdf</code></td><td><code>quantile</code></td><td><code>support</code></td></tr>
<tr><td>ggdist (computed variables)</td><td><code>pdf</code></td><td><code>cdf</code></td><td></td><td></td></tr>
</table></div>
<p>Everyone says <code>cdf</code> and <code>support</code>, and most say <code>quantile</code>, so those stay. <code>density</code> against <code>pdf</code> is decision 6, with the lean <code>density</code>.</p>"""),
            ts_block("Run time, and the spec level", "dist"),
            ("p", """<p><b>A cell keeps its density.</b> <code>restrict</code> keeps the density as it is inside the cell and sets the mass to the cell's share w = cdf(max) &minus; cdf(min) of the whole, so the density is the same inside the cell as in the whole. That is what lets the croissant's cells meet exactly.</p>"""),
            ts_block("The croissant, with the type of each method", "croissant"),
        ],
    ),
    dict(
        id="function-values",
        title="Where function values appear",
        blocks=[
            ("p", """<p>Function values reach several parts of the API. One row per place. \"Spec author\" is a user writing a visualization, \"operator author\" is someone writing an operator, and \"internal\" means only the engine sees it.</p>
<div class="table-wrap"><table>
<tr><th>Place</th><th>Today</th><th>Proposed</th><th>Who sees it</th></tr>
<tr><td>Channels of <code>ribbon</code> and <code>line</code> (<code>x</code>, <code>h</code>, <code>y</code>)</td><td>A channel takes <code>number | column name | (d) =&gt; number | Value | FieldExpr</code> (<code>DeriveMarkProps</code> in <code>channels.ts</code>). <code>ribbon</code> and <code>line</code> have no <code>x</code> option: they are connectors, and their own <code>w</code> and <code>h</code> only size the hidden anchor marks</td><td>Also a function value: <code>d.support()</code>, <code>d.density()</code>, or a <code>reduce</code> that returns one. A bare JS function keeps meaning a row accessor</td><td>spec author</td></tr>
<tr><td>Other marks (<code>rect</code>, <code>circle</code>, <code>text</code>, ...)</td><td>as above</td><td>A function value in a channel is a type error, and a run-time error that names the fix. Issue #980's \"a bare Dist in a rect channel means its limit\" is a separate question</td><td>spec author</td></tr>
<tr><td><code>FieldExpr</code></td><td><code>FieldExpr&lt;HasRegion, Binned&gt;</code>, with <code>sort</code>, <code>reverse</code>, <code>bin</code>, <code>dropNulls</code>, <code>normalize</code>, <code>sum</code>, <code>mean</code>, <code>median</code>, <code>count</code>, <code>distinct</code> (<code>fieldExpr.ts</code>)</td><td>New methods <code>support</code>, <code>density</code>, <code>map</code> and <code>reduce</code>. The type has to know the kind of result (one value per row, one per group, or a function) so the mark types can accept or reject it, as <code>RowExpr</code>, <code>ValueExpr</code>, <code>DistExpr</code> and <code>FunctionExpr</code> do in the sketch. What a <code>reduce</code> returns is lifted by its shape (\"Lifting\")</td><td>spec author</td></tr>
<tr><td><code>dist.*</code> constructors</td><td>none</td><td>New: <code>dist.normal({ mean, sd })</code> and the other #980 families</td><td>spec author</td></tr>
<tr><td><code>stack</code></td><td>reads each child's box, writes one translate per child; <code>origin</code> is internal</td><td>Reads each child's cross-sections, writes an offset function per child. New <code>baseline</code> option</td><td>spec author (<code>baseline</code>), operator author (the offsets)</td></tr>
<tr><td><code>partition</code></td><td>cuts rows into cells; the croissant clips a hidden ribbon with <code>intersect</code></td><td>Restricts function-valued children to each cell (<code>restrict</code>), which removes <code>intersect</code> and the hidden ribbon from the croissant</td><td>operator author</td></tr>
<tr><td><code>spread</code></td><td>places boxes</td><td>May read cross-sections for spacing; designed on the optical spacing page. Proposed <code>baseline</code> option</td><td>spec author, operator author</td></tr>
<tr><td>Domain inference and scales</td><td>read a data interval per child, before layout</td><td>Need the maximum and minimum of a function in data units before layout: exact for functions built from rows, to a tolerance otherwise</td><td>internal</td></tr>
<tr><td><code>geometry()</code></td><td><code>box</code>, <code>enclosingCircle</code>, <code>outline(tolerance)</code>, after layout</td><td>New query <code>crossSection</code>, with a helper that falls back to the box</td><td>operator author</td></tr>
<tr><td>Lowering</td><td>a ribbon draws a path through its anchors' points</td><td>Adaptive resampling of the function in pixels, composed with the coordinate transform, as the prototype does</td><td>internal</td></tr>
<tr><td>Serialization and Python</td><td>a field expression is data (<code>FieldOpIR</code> in <code>packages/gofish-ir/src/frontend/schema.ts</code>; no dist node). A Python accessor reaches JS as a batch call over rows (<code>RESOLVE_ROWS</code>, <code>makeLambdaAccessor</code> in <code>serialize/fromJSON.ts</code>), one value per row, and calling it per row throws. A Python <code>derive</code> gets the whole data</td><td>Named methods and <code>dist.*</code> are data: new <code>FieldOp</code>s and a dist node in the IR. A Python <code>reduce</code> needs a call per group. A Python callback that returns a curve has to stay in Python and be called with a batch of t values in each resampling round. That is new bridge work</td><td>internal (the bridge), spec author (Python)</td></tr>
<tr><td>Data rows</td><td>rows hold plain values</td><td>Rows do not hold functions. A Dist is built from columns, <code>dist.normal({ mean: \"mean\", sd: \"sd\" })</code></td><td>spec author</td></tr>
</table></div>"""),
            ts_block("How a mark's types accept or reject a function value", "channels"),
            ts_block("A reduce that returns a Dist, a number or a function value, a plain function value, and the type error in a rect", "custom-curve"),
        ],
    ),
    dict(
        id="spacing",
        title="3. Spacing between shapes",
        blocks=[
            ("p", """<p>A shape's cross-sections are also one way a <code>spread</code> could measure the shapes it places. In a ridgeline, each ridge could drop until its base would touch the ridge below, instead of starting above the previous ridge's box. How spacing should be measured so that gaps look equal, between siblings and to a container's wall, is being designed separately: see <a href=\"https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty\">Optical spacing</a>.</p>"""),
        ],
    ),
]

RULES = [
    "<b>A shape reports its cross-sections as a function.</b> At each position u along the cross axis, its cross-section is the interval it reaches below and above its baseline: a <code>Fun&lt;Interval&gt;</code>. A ribbon's has one knot per row and the ribbon's own curve; a box's is constant. No spec or operator sees a list of samples.",
    "<b>A stack moves cross-sections and never resizes them.</b> It writes one offset function per child. Every <code>baseline</code> is a choice of that offset. A 100% stack is <code>normalize</code> on the values followed by a plain stack, so there is no divide operation and no exception.",
    "<b>An operator uses a closed set of operations.</b> Map, zip, evaluate, add, scale, restrict, maximum and minimum, integrate (and, for <code>wiggle</code> only, the derivative, products and a running integral). It never reads a child's rows, vertices or samples.",
    "<b>Sampling is internal.</b> It happens when a mark is drawn, when a geometry query is asked at a tolerance, and when a maximum or an integral of a function with a cubic curve or none is needed. A <code>linear</code> or <code>step</code> function needs none of the last kind.",
    "<b>A claim is geometry as a function of σ.</b> Every geometry query has a claim form with the same name, whose numbers are functions of σ. Each is a closed form where one exists, so there is one solve and then one layout.",
    "<b>A function value carries its domain. A mark that draws along a path has one parameter t.</b> Every function channel of it is read at the same t, and their domains must be equal, or it is an error. A bare JS function is a row accessor, never a function value.",
    "<b>One verb per kind of result.</b> <code>map</code> gives one value per row. <code>reduce</code> gives one value per group.",
    "<b>What a reduce returns is lifted by its shape.</b> A number becomes a value expression, a function value a function expression, and a record an object with one method per member, each the lift of that member. A channel takes only a number or a function value; a record is read through its members.",
    "<b>A baseline is a part and a fraction.</b> <code>Trait.diverging</code> desugars to <code>Baseline.at(part, fraction)</code>, and whether the axis labels distances from 0 is computed from the parts, not stored.",
]

DECISIONS = [
    "A rigid part (a circle, text, an image, a line) in a stack of cross-sections: keep it an error that names the fix, or allow it, resting on the highest point of the boundary below it with a gap underneath?",
    "What <code>Baseline.at(part, fraction)</code> does when the named part is absent from a row, and when the column has no declared order. The lean is to do what <code>Trait.diverging</code> does: the 0 is placed by the column's order, so a missing part moves nothing. UI frameworks fall back to a point of the box when no child gives the line (SwiftUI's guide default, Flutter's top edge; Compose reports the line as unspecified), so this lean has no direct precedent there (\"Precedent: alignment lines in UI frameworks\").",
    "<code>Baseline.wiggle()</code> is defined on the function (the limit), not on the rows, so finer rows do not change the curve? It is the one baseline that needs the derivative, products and a running integral.",
    "Under <code>Baseline.middle()</code> and <code>Baseline.wiggle()</code> the value axis is dropped, since it can only measure thickness?",
    "A density's area is the mass it is made from (the row count, or 1 for a Dist), so stacked densities add up to the density of all rows? The other choice is area 1 for every curve. ggdist reaches the same curve with <code>after_stat(pdf * n)</code> and rescales thickness with <code>normalize</code>; here rescaling is the parent's job.",
    "<code>density</code> or <code>pdf</code> for the Dist member and method? The lean is <code>density</code>, because for rows its area is the row count, not 1.",
    "How far t runs for a density: follow ggdist (rows trimmed to the data's range with a bounded estimator; a Dist over its own support, or its 0.001 to 0.999 quantiles where unbounded), or seaborn (3 bandwidths past the data)? The lean is ggdist.",
    "A cell of a Dist partition is the Dist over the cell with its mass (the density unchanged inside, the mass the cell's share), so <code>d.density()</code> in a cell is the parent's curve there?",
    "<code>domain</code> or <code>range</code> for a function value's interval? <code>domain</code> has the most precedent (6 of 14), but in GoFish a unit already has a <code>Domain</code> (<code>families/domain.ts</code>: which values exist). My lean, a judgment and not a fact: they are the same concept, the set of values a variable takes, so <code>domain</code> fits, and a later <code>Domain.continuous</code> could be its value.",
    "The factory's name, <code>fun</code>? It matches ggplot2's <code>fun</code> argument and Julia's <code>Fun</code>, and the type <code>Fun&lt;T&gt;</code>. Alternatives: <code>func</code>, or <code>function</code> as Manim's argument is named (a reserved word in JS). <code>curve</code> is taken by the <code>Curve</code> family, and no surveyed system names it <code>fn</code>.",
    "What the x channel of a function that is not a distribution is called. <code>support()</code> is a distribution word. A reduce that returns a function needs a method, because its domain differs per group.",
    "<code>.map</code>'s callback keeps <code>Array.prototype.map</code>'s argument order, <code>(x, i, xs)</code>, with the index, rather than <code>(x, xs)</code>?",
    "An undeclared <code>unit</code> makes the result a plain number that cannot be stacked, for both verbs?",
    "Add an opaque claim kind (a claim that runs the subtree's layout at a trial σ) only for the cases #967 lists as having no closed form, as the single declared place where sizing runs layout? The lean is closed forms everywhere else.",
    "Implement <code>pack</code>'s radius claim in the same effort as cross-sections, so the claim design is tested by two consumers? The lean is yes.",
    "Accept the per-x rewrite (B at the union of breakpoints) as a declared shortcut until the engine has cross-sections?",
    "The <code>unit</code> option of a <code>reduce</code> mirrors the shape of what it returns: one unit for all members, or a record of units, with <code>dist.units(variable, mass)</code> writing a Dist's record from two units?",
    "A <code>reduce</code> that returns an array: an error, or a record indexed by position, as TypeScript's types would read it? The lean is an error, because a list of values per group is rows, which <code>derive</code> makes.",
]
