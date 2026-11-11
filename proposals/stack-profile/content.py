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


TITLE = "Stacking Areas"
H1 = "Stacking areas and densities"

FULL_LINK = (
    'This page is focused on two examples, the stacked area and the croissant, the idea behind them, and the interface it leads to. Spacing moved to its own page. The full survey of eleven examples is at commit '
    '<a href="https://github.com/gofish-graphics/gofish-graphics/blob/2f3b2a4bf/proposals/stack-profile/proposal.md">2f3b2a4bf</a>. Every type on this page is in <code>proposals/stack-profile/types-sketch.ts</code>, which typechecks on its own.'
)

SUMMARY = [
    "A stacked area is the limit of stacked bars. A stack only moves each bar and never resizes one, so in the limit it moves each <b>cross-section</b> of an area (its interval at one position u on the other axis) and keeps its length. That argument fixes the rules. It is not the interface: a shape gives its cross-sections as a <b>function</b> of u, and no spec or operator sees a list of samples. Sampling happens only inside the engine, at a tolerance.",
    "An operator may use a small, closed set of operations on those functions (evaluate, add, scale, restrict, maximum and minimum, integrate), and writes back one offset function per child. A box answers with a constant function, so every node has cross-sections and nothing asks whether a child is a box. <code>crossSection</code> joins <code>geometry()</code> as one more query.",
    "A stack's <code>baseline</code> option chooses where its own 0 is: <code>Baseline.start()</code>, <code>.end()</code>, <code>.middle()</code>, <code>.wiggle()</code> or <code>.at(part, fraction)</code>. Each gives every cross-section an offset and never changes a length. <code>spread</code> should take it too, except <code>wiggle</code>. It does not replace <code>anchor</code>, which is a choice per pair of children.",
    "A density is two channels over one hidden variable t, <code>ribbon({ x: mass.support(), h: mass.density() })</code>, over a <code>Dist</code> type with typed methods. <code>partition</code> restricts the function to each cell, which draws the croissant with no grid and no <code>intersect</code>. A custom curve is a <code>reduce</code> whose result is a function value with its range.",
    "A <code>spread</code> could read the same cross-sections to place shapes by their outlines; how gaps should be measured so they look equal is designed on its own page, <a href=\"https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty\">Optical spacing</a>.",
]

SUMMARY_TITLE = "Recommendation"
SETTLED = [
    "The stacked area is spelled <code>chart(jobs).flow(stack({ by: \"series\", dir: \"y\" })).mark(ribbon({ x: \"date\", h: \"count\", fill: \"series\" }))</code>: a stack, then one ribbon per series.",
    "The thin-box limit is the argument that sets the rules, not the interface. The interface is a function of u, and sampling stays inside the engine.",
    "The stack's option is <code>baseline</code>, with values <code>Baseline.start()</code>, <code>.end()</code>, <code>.middle()</code>, <code>.at(part, fraction)</code> and <code>.wiggle()</code>. <code>Trait.diverging</code> stays the default and desugars to <code>Baseline.at</code>, and an explicit <code>baseline</code> over a diverging unit is an error.",
    "Custom methods on a field expression are two verbs: <code>.map((x, i, xs) =&gt; value, { unit })</code> for one value per row, and <code>.reduce((xs) =&gt; value, { unit })</code> for one value per group. There is one form of <code>reduce</code>.",
    "A 100% stack is <code>normalize</code> on the values followed by a plain stack: there is no divide operation.",
    "The density channel pair is spelled <code>support()</code> and <code>density()</code> (Josh is checking the name with Matt Kay, ggdist). Rejected: <code>value()</code>, which clashes with GoFish's <code>value(...)</code> constructor, and <code>points()</code> or <code>grid()</code>, which name the sampling.",
    "<code>.then</code> cannot be the custom method's name: a field expression with a <code>then</code> method would be adopted as a promise by <code>resolveValue</code>.",
    "How a bin's cells are shared stays under review, so no callback form is proposed for bins here.",
]

TERMS = [
    ("Cross-section", "A shape's interval along one axis at one position u on the other axis: how far it reaches below and above its baseline there. It is two-sided, and it is a query at a point, not a sample. \"A shape's cross-sections\" means the function from u to that interval. A box's cross-section is the same at every u."),
    ("Slice", "Used only in the limit argument: one of the thin boxes a stacked bar visualization is made of."),
    ("Function value", "A value that is a function of one hidden parameter, with its range (the <code>Fn</code> type). A density's height over t is one."),
    ("Knot", "A point where a function value has a corner. A function built from rows has one knot per row, and between knots it is a straight line or its <code>curve</code>."),
    ("Baseline", "A node's own 0 point. A rect's baseline is its bottom edge, and it bubbles up: a parent with <code>alignment: \"baseline\"</code> lines up its children's 0 points. A stack's <code>baseline</code> option chooses where the stack's 0 is. In the code the model is <code>StackOrigin</code> (<code>constraints/distribute.ts</code>)."),
    ("Lowering", "The last step of rendering, which turns a laid-out node into drawing commands (paths, in pixels)."),
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
<p>Every baseline holds, and nothing in layout resizes a cross-section. A 100% stacked area is not a separate divide operation. It is <code>normalize</code>, the callback <code>(x, i, xs) =&gt; x / sum(xs)</code> with <code>xs</code> the values in one x column, which changes the values before layout, followed by a plain stack that only moves cross-sections. When the whole is a drawn shape instead of 1 (a bottle filled by share), that is a size choice for the stack's total, not a new operation.</p>"""),
        ],
    ),
    dict(
        id="interface",
        title="The interface",
        blocks=[
            ("p", """<p>This section says what a shape reports, what an operator may do with it, what the operator writes back, and how this fits the <code>geometry()</code> queries that exist today. Every type shown here is in <code>types-sketch.ts</code>, which typechecks with <code>tsc --noEmit --strict</code>.</p>
<h4>A function value</h4>
<p>A function value has its own range, so a spec never names one. It also lists its knots, which is what makes most queries exact. A function built from rows is a straight line between rows (or its <code>curve</code>), so its sum, maximum and integral come from the knots alone, with no sampling. A function with no closed form, such as a kernel density, is marked <code>\"smooth\"</code>, and a query on it runs to a tolerance.</p>"""),
            ts_block("The function value", "fn"),
            ("p", """<h4>The cross-section query</h4>
<p>A shape's cross-sections are one query: given an axis, the function from u (the position on the other axis) to the interval the shape covers there, measured from its baseline. A box answers with a constant function, the same way <code>defaultGeometry</code> falls back to the box for the other queries. So every node has cross-sections, and no operator dispatches on whether a child is a box or a ribbon.</p>"""),
            ts_block("The query, and the helper every reader calls", "cross-section"),
            ("p", """<h4>What an operator may do</h4>
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
<p><b><code>Baseline.wiggle()</code> needs more.</b> d3's wiggle chooses the baseline's slope at u from each band's thickness and its slope there, weighted by thickness. So it needs the derivative of each thickness, products of functions, and a running integral (an integral from the start up to u, which is a function, not a number). For functions built from rows these are still exact: the derivative of a straight line is a constant between knots. These three operations join the set only for wiggle, which is part of decision 5.</p>"""),
            ts_block("The operations, and what an operator writes back", "operations"),
            ts_block("A stack, written with those operations", "stack"),
            ("p", """<h4>How it relates to <code>geometry()</code></h4>
<p>Today <code>Geometry</code> is <code>HasBox &amp; HasEnclosingCircle &amp; HasOutline</code> (<code>ast/geometry/index.ts</code>). Every query except <code>box</code> is optional, each has a helper that falls back to the box, and <code>GoFishNode.geometry()</code> answers only after layout, in the node's local pixel frame. Its header comment says the form that answers while sizing is issue #967. <code>crossSection</code> joins <code>Geometry</code> as one more optional query, with the helper above. The other queries can be read from it: <code>box</code> is the cross-section's minimum and maximum, and an outline is the upper edge followed by the lower edge reversed, sampled to the outline's tolerance.</p>
<p>A stack, though, needs the function before layout, in data units. It gives the scale its own space, which is the largest total over u, and the scale must be solved before anything has pixels. The prototype shows the split: its <code>resolveUnderlyingSpace</code> uses the function in data units, and its <code>layout</code> uses it in pixels (<code>_prototypeFnCurve.tsx</code>). So the same function is asked twice: before layout, as the child's size along the stack axis (a function of u instead of one number), and after layout, as the geometry query. The form before layout is the same open problem as #967, and this page does not design it in detail (decision 13).</p>
<p><b>Does a function-valued size fit how a stack folds its children's spaces?</b> On main, PR #1268 is merged, and it names the properties traits; the trait a stack checks is <code>CanSum</code> on the units it adds. The stack's fold is <code>distributeSpaceFold</code> in <code>constraints/distribute.ts</code>: it needs every part's space to be continuous with an origin (pinned or free), unifies their units, checks with <code>Units.sum</code> that the units of the free parts can be summed, and lays the parts end to end, each part's interval about its baseline added to the running sum. A function-valued size fits that: the sum is pointwise, the unit check reads units and not values so it does not change, and the stack's space becomes the minimum of its lowest edge and the maximum of its highest edge over u, which are two queries in the set above. I have not built it, so this is a reading of the code, not a test.</p>
<h4>What changes for <code>ribbon</code></h4>
<p>On main, <code>ribbon</code> and <code>line</code> are relational marks (<code>createRelationalMark</code> in <code>ast/marks/chart.ts</code>): each builds a <code>Connect</code> node that joins consecutive marks, and in <code>.mark()</code> position it adds an invisible <code>blank()</code> per row for the connector to join. A ribbon there has no <code>x</code> channel and no shape of its own. In the proposal a ribbon is one node per series that owns its function, built from its rows (one knot per row) or given as a function value, and it answers <code>crossSection</code>, so the stack above it moves the whole band at once.</p>
<h4>Where sampling happens</h4>
<p>Only in three places, all inside the engine:</p>
<ol>
<li><b>When a mark is drawn (lowering).</b> The function is resampled adaptively, in pixels, composed with the coordinate transform, to half a pixel. The prototype does this with the existing <code>adaptive-resampling.ts</code>.</li>
<li><b>When a geometry query is asked at a tolerance.</b> This is how <code>outline(tolerance)</code> works today: \"a polyline that is never farther from the true shape than the tolerance asked for\" (<code>ast/geometry/outline.ts</code>).</li>
<li><b>When a maximum or an integral of a function with no closed form is needed</b>, such as a kernel density's peak for the scale domain, or the integral inside <code>Baseline.wiggle()</code>. For functions built from rows none is needed, since the knots give exact answers.</li>
</ol>
<p>One honest exception: the prototype's <code>dataExtent</code> finds a curve's maximum with 512 even samples plus golden-section refinement, when the mark is built, before layout. That is the one place it samples early. In the proposal it is case 3, and it runs only for a function marked <code>\"smooth\"</code>.</p>
<h4>Naming: cross-section</h4>
<p>Josh was unsure about \"profile\" for the cumulative slices, because it suggests one side only. The precedents agree with him. The recommendation is <b>cross-section</b> for the value at one u: an interval, so two-sided by construction, and a query at a point rather than a sample. The trait is <code>HasCrossSection</code>. Users never write the word in a spec.</p>
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
<p>Runners-up: \"extent\" (d3's <code>extent</code> returns <code>[min, max]</code>, but GoFish already uses it for a box's extent) and \"band\" (it clashes with a kernel's bandwidth on this same page, and with d3's band scale).</p>"""),
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
<p>So <code>baseline</code> does not replace <code>anchor</code>: one is a choice for each pair of neighbors, the other one choice for the whole. What <code>baseline</code> replaces is the internal <code>StackOrigin</code> and the <code>origin</code> field, and the implicit behavior of <code>Trait.diverging</code>, which becomes a default that desugars to <code>Baseline.at(...)</code>. One detail: <code>StackOrigin</code> has a third field, <code>mirrored</code>, which a diverging unit sets so that the parts on both sides are amounts measured away from the 0. <code>Baseline.at</code> alone sets only the 0, so whether it carries <code>mirrored</code> is decision 4.</p>
<p><b>On <code>spread</code>.</b> A stack is a spread with <code>glue</code>; they are one node, <code>Spread</code>. The recommendation is to allow <code>baseline</code> on <code>spread</code> too, with <code>start</code>, <code>end</code>, <code>middle</code> and <code>at(part, fraction)</code>. \"Which point is my 0\" is a question every operator that places children along an axis can answer, and a parent's <code>alignment: \"baseline\"</code> already reads it. <code>Baseline.wiggle()</code> stays stack-only, because it needs glued cross-sections. <code>layer</code> and <code>scatter</code> do not take it: their children are placed in one shared space, whose 0 is the space's own. This is decision 3. Two uses (proposed code, not run):</p>"""),
            ["code", "A diverging bar visualization with gaps between the bars (not run)", """chart(survey)
  .flow(
    spread({ by: "question", dir: "y" }),
    spread({ by: "response", dir: "x", spacing: 2, baseline: Baseline.at("Neutral", 0.5) }) // @hl
  )
  .mark(rect({ w: "count", fill: "response" }));""", """chart(survey).flow(
    spread(by="question", dir="y"),
    spread(by="response", dir="x", spacing=2, baseline=Baseline.at("Neutral", 0.5)),  # @hl
).mark(rect(w="count", fill="response"))"""],
            ["code", "Rows of small groups lined up on a chosen member: each patient's visits, with the treatment visit at 0 (not run)", """chart(visits)
  .flow(
    spread({ by: "patient", dir: "y" }), // alignment: "baseline" is the default
    spread({ by: "step", dir: "x", spacing: 4, baseline: Baseline.at("treatment", 0) }) // @hl
  )
  .mark(rect({ w: 12, h: 12, fill: "kind" }));""", """chart(visits).flow(
    spread(by="patient", dir="y"),  # alignment="baseline" is the default
    spread(by="step", dir="x", spacing=4, baseline=Baseline.at("treatment", 0)),  # @hl
).mark(rect(w=12, h=12, fill="kind"))"""],
            ("p", """<p><b><code>anchor</code> itself.</b> Its future is on the <a href=\"https://claude.ai/artifact/FKyrky9FQNxPkQactid7Ty\">Optical spacing</a> page, where the earlier idea was that a pitch spacing absorbs it.</p>
<p><b>The per-x spelling.</b> With today's per-x form, <code>stack({ baseline: Baseline.middle() })</code> inside each x column, plus the parent's baseline alignment, already gives the centered stack, because each column's offset depends only on that column. Only <code>wiggle</code> needs the whole series, because each offset depends on the neighbors.</p>"""),
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
            ("p", """<p><code>d</code> is an expression over a distribution. Each method makes a different kind of value. <code>d.bin(Bin.quantiles(5))</code> is a key that cuts d's axis into 5 cells. <code>d.support()</code> and <code>d.density()</code> are the position and the height of one curve over a hidden variable t: the support is t &#8614; t and the density is t &#8614; f(t). The ribbon evaluates both channels as functions of t, as a parametric curve (x(t), y(t)) does, and only lowering samples them. <code>d.median()</code> is one number per cell. <code>partition</code> on d's axis restricts the function to each cell. A cell of a Dist is the Dist over that cell with its mass, so the cells meet exactly. No <code>intersect</code>, hidden ribbon, <code>relate</code>, grid or quantile rows. The types of each method are in \"The distribution type\" below.</p>"""),
            ("p", "<h4>What the methods compute</h4><p>" + """A field expression like <code>field("mass")</code> works like polars' <code>pl.col("mass")</code>: it sees one column. Every named method on it except <code>bin</code> is one named instance of one of the two custom methods. <code>map((x, i, xs) =&gt; value)</code> is called once per row: <code>x</code> is this row's value of the field, <code>i</code> its index, and <code>xs</code> the values of that field over the rows of the current group (the rows the mark or operator reading the channel was given). <code>reduce((xs) =&gt; value)</code> is called once per group. A user can always write the custom method instead of the named one.""" + "</p>"),
            ["code", "Each method and the custom method it stands for (bins are open; see below)", """field("mass"); // a value per row
field("mass").sum(); // .reduce(sum)
field("mass").median(); // .reduce(median)
field("mass").normalize(); // .map((x, i, xs) => x / sum(xs))
field("mass").density(); // .reduce((xs) => fn(kde(xs), { over: extent(xs) }))
field("mass").support(); // field("mass").density().support()

// custom methods, used like built-in ones
const share = field("mass").map((x, i, xs) => x / max(xs), { unit: "ratio" });
const top = field("mass").reduce((xs) => max(xs), { unit: "g" });""", """field("mass")  # a value per row
field("mass").sum()  # .reduce(sum)
field("mass").median()  # .reduce(median)
field("mass").normalize()  # .map(lambda x, i, xs: x / sum(xs))
field("mass").density()  # .reduce(lambda xs: fn(kde(xs), over=extent(xs)))
field("mass").support()  # field("mass").density().support()

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
<li><b>A one-value-per-group result is known by its verb.</b> <code>reduce</code> runs once per group, so its value is the same for every row by construction, and a channel that needs one value per group (a <code>circle</code>'s <code>cx</code> in a cell) needs no check. A <code>map</code> whose result happens to be the same for every row is still checked, with the existing \"not constant across the connected group\" error.</li>
<li><b>A <code>map</code> that reads <code>xs</code> can cost O(n&sup2;).</b> <code>normalize</code> written as <code>map((x, i, xs) =&gt; x / sum(xs))</code> sums the group once per row. The engine passes the same <code>xs</code> array to every row of a group, so a memo keyed on it brings that back to O(n). A named method avoids it outright.</li>
<li><b>A custom method sees one field, so it cannot use two.</b> A mean of x weighted by w reads two fields, so it is a <code>derive</code> step, or an expression over two fields, not a custom method.</li>
<li><b>Units get simpler.</b> The custom method sees one field, so the unit it receives is known. It declares only what it returns: the same unit (<code>sum</code>, <code>median</code>), a ratio (<code>normalize</code>), a count, or a function whose values are that unit's density. Without the declaration, CanSum and the other checks cannot run, so an undeclared result is treated as a plain number that cannot be stacked.</li>
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
            ("p", """<p>Settled: a user who needs a method that is not built in writes <code>.map</code> for one value per row or <code>.reduce</code> for one value per group. Josh: \"it doesn't make sense to call a reduction/aggregation like sum/mean a map.\" This section records what each verb takes, why there is exactly one form of <code>reduce</code>, and the two words that are taken.</p>"""),
            ["code", "The two verbs", """field("mass").map((x) => x / 1000, { unit: "kg" });
field("mass").map((x, i, xs) => x / sum(xs), { unit: "ratio" });
field("mass").reduce(median, { unit: "g" }); // (xs) => value, any existing function""", """field("mass").map(lambda x, i, xs: x / 1000, unit="kg")
field("mass").map(lambda x, i, xs: x / sum(xs), unit="ratio")
field("mass").reduce(statistics.median, unit="g")"""],
            ("p", """<h4>One form of reduce</h4>
<p><code>reduce</code> takes the whole group, <code>reduce((xs) =&gt; value, { unit })</code>, and nothing else.</p>
<ul>
<li><b><code>Array.prototype.reduce</code>'s form, <code>(acc, x) =&gt; acc</code> with an initial value, is not proposed.</b> The incremental form exists where data streams or is spread over machines, so an aggregate must be built one value at a time and merged: Postgres <code>CREATE AGGREGATE</code> with a state function (<code>SFUNC</code>), Apache Beam's <code>CombineFn</code> (<code>add_input</code>, <code>merge_accumulators</code>, <code>extract_output</code>), and Spark's <code>Aggregator</code> (<code>zero</code>, <code>reduce</code>, <code>merge</code>, <code>finish</code>). Systems in our setting take the whole group: d3's <code>rollup(data, reduce, key)</code>, Observable Plot's reducers <code>(values) =&gt; value</code>, pandas' <code>groupby().agg(f)</code>, and polars' <code>map_batches(f, returns_scalar=True)</code> inside <code>group_by().agg</code>. Arquero is mixed: <code>rollup</code> takes whole-group aggregates such as <code>op.median(\"x\")</code>, but a custom one registered with <code>addAggregateFunction</code> is incremental (<code>init</code>, <code>add</code>, <code>rem</code>, <code>value</code>), because the same definition also runs over sliding windows.</li>
<li><b>A curve is not a second form.</b> It is the same <code>reduce</code>, whose result is a function value instead of a number. A bare JS function cannot be that result: it has no range, and <code>(d) =&gt; number</code> is already a legal channel value meaning a row accessor (<code>DeriveMarkProps</code> in <code>channels.ts</code>). So a custom curve returns a function value with its range, made by <code>fn(at, { over })</code> or written as a plain <code>{ at, over }</code> object. Its <code>support()</code> gives the x channel over the same range. The spelling is decision 10.</li>
<li><b>A <code>map</code> that ignores <code>x</code> and returns <code>median(xs)</code> is legal, but it is not a way to write a reduce.</b> It is called once per row. The reference will point to <code>reduce</code>.</li>
</ul>"""),
            ts_block("Their types (from the sketch)", "field"),
            ["code", "A custom curve (not run)", """const curve = field("mass").reduce(
  (xs) => fn(kde(xs), { over: extent(xs) }), // @hl
  { unit: "count per g" }
);
chart(penguins).mark(ribbon({ x: curve.support(), h: curve }));""", """curve = field("mass").reduce(
    lambda xs: fn(kde(xs), over=extent(xs)),  # @hl
    unit="count per g",
)
chart(penguins).mark(ribbon(x=curve.support(), h=curve))"""],
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
<p>Two levels. At run time, a <code>Dist</code> is what the engine asks questions of. #980's sketch has <code>DistRep</code>, which is how a Dist is held (a family with parameters, draws, a mixture, a truncation); this <code>Dist</code> is what every representation answers. It adds two things to the prototype: <code>mass</code>, so a density is mass &times; pdf and stacked densities add, and <code>restrict</code>, which is a cell of a partition. In a spec, a <code>DistExpr</code> is an expression over a Dist, as in #980, and this page adds <code>support()</code>, <code>density()</code> and <code>bin()</code> to it. <code>field(\"mass\")</code> over a group of rows is the empirical Dist of those rows, so a field expression has the same methods. Units are in the types: <code>support</code> is in the variable's unit V, <code>density</code> in mass per V, and <code>cdf</code> is a ratio (in a comment, since run-time values are plain numbers). The sketch simplifies #980's types: a unit is a plain tag, and #980's dependence parameter (whether draws are joint) is left out.</p>"""),
            ts_block("Run time, and the spec level", "dist"),
            ("p", """<p><b>A cell keeps its density.</b> <code>restrict</code> rescales the pdf by the cell's share w = cdf(max) &minus; cdf(min) and the mass by w, so mass &times; pdf is the same inside the cell as in the whole. That is what lets the croissant's cells meet exactly.</p>"""),
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
<tr><td><code>FieldExpr</code></td><td><code>FieldExpr&lt;HasRegion, Binned&gt;</code>, with <code>sort</code>, <code>reverse</code>, <code>bin</code>, <code>dropNulls</code>, <code>normalize</code>, <code>sum</code>, <code>mean</code>, <code>median</code>, <code>count</code>, <code>distinct</code> (<code>fieldExpr.ts</code>)</td><td>New methods <code>support</code>, <code>density</code>, <code>map</code> and <code>reduce</code>. The type has to know the kind of result (one value per row, one per group, or a function) so the mark types can accept or reject it, as <code>RowExpr</code>, <code>ValueExpr</code> and <code>FnExpr</code> do in the sketch</td><td>spec author</td></tr>
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
            ts_block("A custom curve, and the type error in a rect", "custom-curve"),
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
    "<b>A shape reports its cross-sections as a function.</b> At each position u along the cross axis, its cross-section is the interval it reaches below and above its baseline. A ribbon's is a function with one knot per row; a box's is constant. No spec or operator sees a list of samples.",
    "<b>A stack moves cross-sections and never resizes them.</b> It writes one offset function per child. Every <code>baseline</code> is a choice of that offset. A 100% stack is <code>normalize</code> on the values followed by a plain stack, so there is no divide operation and no exception.",
    "<b>An operator uses a closed set of operations.</b> Evaluate, add, scale, restrict, maximum and minimum, integrate (and, for <code>wiggle</code> only, the derivative, products and a running integral). It never reads a child's rows, vertices or samples.",
    "<b>Sampling is internal.</b> It happens when a mark is drawn, when a geometry query is asked at a tolerance, and when a maximum or an integral of a smooth function is needed. A function built from rows needs none of the last kind.",
    "<b>Each value is a size, not a pixel count.</b> It is a data amount times the scale factor plus fixed pixels, so a stack can still solve its scale before layout.",
    "<b>A function value carries its range and its hidden parameter.</b> <code>x: mass.support()</code> and <code>h: mass.density()</code> share one hidden variable t, whose range belongs to the value. Two function channels over different variables in one mark are an error. A bare JS function is a row accessor, never a function value.",
    "<b>One verb per kind of result.</b> <code>map</code> gives one value per row, <code>reduce</code> one value per group, and a <code>reduce</code> that returns a function value with its range gives a function value per group.",
]

DECISIONS = [
    "Call the value at one u a <b>cross-section</b>, the function \"a shape's cross-sections\", and the trait <code>HasCrossSection</code>? Users never write the word. Runners-up: extent, band.",
    "A rigid part (a circle, text, an image, a line) in a stack of cross-sections: keep it an error that names the fix, or allow it, resting on the highest point of the boundary below it with a gap underneath?",
    "Allow <code>baseline</code> on <code>spread</code> too, with <code>start</code>, <code>end</code>, <code>middle</code> and <code>at(part, fraction)</code>, and keep <code>wiggle</code> stack-only and <code>baseline</code> off <code>layer</code> and <code>scatter</code>? The lean is yes.",
    "Does <code>Baseline.at(part, fraction)</code> also carry <code>StackOrigin</code>'s <code>mirrored</code> (parts on both sides read as amounts away from 0), or does only <code>Trait.diverging</code> set it?",
    "<code>Baseline.wiggle()</code> is defined on the function (the limit), not on the rows, so finer rows do not change the curve? It is the one baseline that needs the derivative, products and a running integral.",
    "Under <code>Baseline.middle()</code> and <code>Baseline.wiggle()</code> the value axis is dropped, since it can only measure thickness?",
    "A density's area is the mass it is made from (the row count, or 1 for a Dist), so stacked densities add up to the density of all rows? The other choice is area 1 for every curve. ggdist reaches the same curve with <code>after_stat(pdf * n)</code> and rescales thickness with <code>normalize</code>; here rescaling is the parent's job.",
    "The range of t: follow ggdist (rows trimmed to the data's range with a bounded estimator; a Dist over its own range, or its 0.001 to 0.999 quantiles where unbounded), or seaborn (3 bandwidths past the data)? The lean is ggdist.",
    "<code>.map</code>'s callback keeps <code>Array.prototype.map</code>'s argument order, <code>(x, i, xs)</code>, with the index, rather than <code>(x, xs)</code>?",
    "A custom curve: <code>reduce</code> returns a function value with its range, spelled <code>fn(at, { over })</code> or a plain <code>{ at, over }</code> object, and its <code>support()</code> gives the x channel? And how is a density's unit written (<code>\"count per g\"</code> above is a placeholder)?",
    "An undeclared <code>unit</code> makes the result a plain number that cannot be stacked, for both verbs?",
    "A cell of a Dist partition is the Dist over the cell with its mass (pdf and mass both rescaled by the cell's share), so <code>d.density()</code> in a cell is the parent's curve there?",
    "The cross-sections a stack needs before layout, in data units: solve it here, as a function-valued size along the stack axis, or with #967 (geometry while sizing)?",
    "Accept the per-x rewrite (B at the union of breakpoints) as a declared shortcut until the engine has cross-sections?",
]
