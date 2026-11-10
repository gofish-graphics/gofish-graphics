# Content of the stack-profile proposal. build.py turns it into page.html and
# proposal.md. Code is formatted by proposals/_tools/format-snippets.mjs.
# A line that ends in a "@hl" comment is a changed line: it is highlighted on
# the page, and the marker is removed.

TITLE = "Stack Profiles"

SUMMARY = [
    "Stacked areas, streamgraphs, stacked densities, croissants, ridgelines, sankey strands and anchor slots all read one thing from a shape: how thick it is at each position along the other axis. Call it the shape's <b>profile</b>. A box is the profile that does not change.",
    "With profiles, <code>stack</code> stays one local operator. It reads each child's profile, adds them, and places each child on the boundary below it. <code>spread</code> can read the same profile to space shapes by their outlines (<code>spacing: Spacing.contour(4)</code>), <code>partition</code> cuts a profile's domain into cells, and a divide is a stack whose whole is given.",
    "A density is a profile given by a function: <code>ribbon({ h: mass.density() })</code> needs no rows, no grid and no <code>x</code>. The renderer samples a profile when it draws it, so no spec names a grid.",
]

RECOMMENDATION = (
    "<b>Recommendation: Approach A, profiles.</b> Add one geometry type, the profile, that every node can report "
    "(a box reports a constant one). Keep one flow <code>stack</code> that adds profiles. Its "
    "<code>baseline</code> option chooses where the stack's own 0 is (<code>Baseline.start()</code>, "
    "<code>Baseline.middle()</code>, <code>Baseline.wiggle()</code>), and a parent's <code>alignment</code> "
    "lines up those 0 points. <code>spread</code>'s <code>spacing</code> takes a number or a "
    "<code>Spacing</code> strategy (box, pitch, contour, optical), which replaces its <code>anchor</code> option. "
    "<code>partition</code> on a profile restricts it to cells, which draws the croissant with no "
    "<code>intersect</code>. A density is a curve over its own field, so a ribbon takes it with no <code>x</code>. "
    "A ribbon chart, whose order changes at each x, stays the per-x spelling it is today. "
    "<b>Runner-up: B, per-x core.</b> It is today's engine with fixes and costs least, but it keeps "
    "two concepts of thickness and answers locality by never letting a stack see a ribbon."
)

RULES = [
    "<b>A profile is an extent that varies along the other axis.</b> For an axis d (the stacking axis) and the cross axis u, a profile is a domain of u and, at each u in it, a descent and an ascent around the node's baseline. A box is the constant profile over its cross extent.",
    "<b>Each value is a size, not a pixel count.</b> It is a data amount times the scale factor plus fixed pixels (a stroke, a fixed-size rect), so a stack can still solve its scale before layout.",
    "<b>Readers differ only in how they combine profiles.</b> <code>stack</code> adds them at each u. <code>spread</code> with contour spacing takes the largest overlap. A divide adds them and rescales to a given whole. <code>partition</code> restricts the domain to cells. An anchor's slot flow runs along a part whose length is a profile's edge.",
    "<b>Local means two things.</b> An operator reads only its children's summaries (a box or a profile), never their rows or vertices, and it writes only each child's frame. A profile stack's frame for a child is the boundary curve below it. When every part is a box, that curve is flat and the frame is today's translate.",
    "<b>Only amounts stack.</b> A part of a profile stack must have a thickness along u. A line, a circle, text or an image has none, so it is an error in a profile stack, and the error names the fix.",
    "<b>Profiles live in the layer's unbent space.</b> Polar, <code>Coord.along(spine)</code> and other coordinate transforms bend the result afterwards, so a radial stacked area and strands along a sankey link are plain stacks.",
    "<b>A profile may be a function.</b> <code>mass.density()</code> is a profile with no rows. The renderer samples it when it draws it. No spec names a grid, and <code>repeat</code> stays discrete.",
]

TERMS = [
    ("Profile", "The thickness of a shape along one axis (d) as a function of position along the other (u): at each u, how far the shape reaches below and above its baseline (its descent and ascent, the font-metric words GoFish already uses). Precedents: a tidy tree's contour, a skyline in computational geometry, and the calculus region between two graphs, {(u, v): lo(u) &le; v &le; hi(u)}."),
    ("Index", "The cross-axis position u that a profile is a function of. Two profiles can be added at each u only if their indexes are positions on one shared scale."),
    ("Hull", "The box around a profile: from its lowest point to its highest. A parent that reads only boxes sees the hull."),
    ("Baseline", "A node's own 0 point. Today a rect's baseline is its bottom edge, and it bubbles up: a parent with <code>alignment: \"baseline\"</code> lines up its children's 0 points. A stack's <code>baseline</code> option chooses where the stack's 0 is. In the code it is <code>StackOrigin</code> (<code>constraints/distribute.ts</code>)."),
    ("Frame", "Where an operator puts a child's local 0. Today it is a point (a translate). In a profile stack it is the boundary curve below the child."),
    ("Glue", "Neighboring parts share one boundary, so no gap or overlap opens between them. The equations are g_i(u) &minus; g_(i&minus;1)(u) = f_i(u)."),
    ("Given whole", "A total that the spec fixes before the parts are known: 100%, a bottle's outline, a link's width. A stack with a given whole is a divide."),
    ("Per-x form", "<code>spread</code> or <code>scatter</code> by x, then <code>stack</code>. The stack runs once in each x slice and sees only that slice."),
    ("Field expression", "<code>field(\"mass\")</code>: a column expression, like polars' <code>pl.col(\"mass\")</code>. Bare, it is a value per row. Its methods make other kinds of value (see \"What the methods compute\")."),
    ("CanSum", "The trait that says a unit's values add up. A stack checks it."),
]

# ---------------------------------------------------------------------------
# Examples. Each one: id, title, imgs [(file, caption)], render ("today",
# "emulated" or "today, wrong"), text, A (js, py), today (js) and its label,
# B and C (js, py), verdicts per approach.

EXAMPLES = [
    dict(
        id="uneven",
        title="Stacked area, series measured at different x",
        imgs=[
            ("uneven-profile.png", "Proposed result (emulated: each series read as a linear function, added at every x)."),
            ("uneven-today.png", "Today's per-x spelling on the same rows: it stacks only rows that share an exact x, with no warning."),
        ],
        text="Maps is measured every 1, Sports every 1.5, Games at 15 jittered x. Each ribbon's profile is its own curve through its own rows, so the stack adds functions and needs no common sample points. Outside a series' own x range its thickness is 0 (ggplot2's rule).",
        A_js="""chart(sampled)
  .flow(stack({ by: "series", dir: "y" })) // @hl
  .mark(ribbon({ x: "x", h: "y", fill: "series" })); // @hl""",
        A_py="""chart(sampled).flow(stack(by="series", dir="y")).mark(  # @hl
    ribbon(x="x", h="y", fill="series")  # @hl
)""",
        today_label="Today (runs, draws the sawtooth above)",
        today_js="""chart(sampled)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "series", dir: "y" })) // @hl
  .mark(ribbon({ h: "y", fill: "series" })); // @hl""",
        B_js="""chart(sampled)
  .flow(
    derive(align({ x: "x", by: "series" })), // resample at the union of all x
    scatter({ by: "x", x: "x" }),
    stack({ by: "series", dir: "y" })
  )
  .mark(ribbon({ h: "y", fill: "series" }));""",
        B_py="""chart(sampled).flow(
    derive(align(x="x", by="series")),
    scatter(by="x", x="x"),
    stack(by="series", dir="y"),
).mark(ribbon(h="y", fill="series"))""",
        C_js="""chart(sampled).mark(
  ribbon({ x: "x", h: "y", fill: "series" }).cut({ by: "series", dir: "y" })
);""",
        C_py="""chart(sampled).mark(ribbon(x="x", h="y", fill="series").cut(by="series", dir="y"))""",
        verdict=dict(A="works", B="works, with a visible resample step", C="works, cut densifies"),
    ),
    dict(
        id="streamgraph",
        title="Streamgraph with a wiggle baseline",
        imgs=[("stream-wiggle.png", "Weighted wiggle, the d3 and Plot default (emulated: the baseline is computed in derive).")],
        text="The baseline is a profile too: g_0(u), chosen to flatten the boundaries. It needs every series over all x, which the whole-series stack sees. <code>baseline</code> sets the stack's <code>StackOrigin</code>; the next card shows how it meets a parent's <code>alignment</code>.",
        A_js="""chart(topics)
  .flow(stack({ by: "topic", dir: "y", baseline: Baseline.wiggle() })) // @hl
  .mark(ribbon({ x: "x", h: "value", fill: "topic" }));""",
        A_py="""chart(topics).flow(stack(by="topic", dir="y", baseline=Baseline.wiggle())).mark(  # @hl
    ribbon(x="x", h="value", fill="topic")
)""",
        today_label="Today (wiggle computed by hand, about 20 lines)",
        today_js="""chart(topics)
  .flow(
    derive((rows) => stackRows(rows, { offset: "wiggle" })), // @hl
    scatter({ by: "x", x: "x" }),
    scatter({ by: "topic", yMin: "y0", yMax: "y1" }) // @hl
  )
  .mark(ribbon({ fill: "topic" }));""",
        B_js="""chart(topics)
  .flow(
    scatter({ by: "x", x: "x", alignment: Align.wiggle() }),
    stack({ by: "topic", dir: "y" })
  )
  .mark(ribbon({ h: "value", fill: "topic" }));""",
        B_py="""chart(topics).flow(
    scatter(by="x", x="x", alignment=Align.wiggle()),
    stack(by="topic", dir="y"),
).mark(ribbon(h="value", fill="topic"))""",
        C_js="""chart(topics).mark(
  ribbon({ x: "x", h: "value", fill: "topic" }).cut({
    by: "topic",
    dir: "y",
    baseline: Baseline.wiggle(),
  })
);""",
        C_py="""chart(topics).mark(
    ribbon(x="x", h="value", fill="topic").cut(by="topic", dir="y", baseline=Baseline.wiggle())
)""",
        verdict=dict(A="works", B="works, baseline on the outer scatter", C="works, but the user writes a total"),
    ),
    dict(
        id="density",
        title="Stacked density curves",
        imgs=[
            ("density-stacked.png", "Stacked group densities, each with area equal to its group's count (emulated: KDE grid computed in derive)."),
            ("density-conditional.png", "The same with the whole given as 1 at every x: the conditional density, a divide."),
        ],
        text="<code>mass.density()</code> is a curve over mass, one per species. Its area is the count of rows it is made from, so the stack adds up to the density of all penguins. The ribbon takes no <code>x</code>: a density carries its own axis, the one that shows mass. Giving the whole (<code>size: normalize</code>) turns the stack into a divide.",
        A_js="""const mass = field("mass");
chart(penguins)
  .flow(stack({ by: "species", dir: "y" }))
  .mark(ribbon({ h: mass.density(), fill: "species" })); // @hl""",
        A_py="""mass = field("mass")
chart(penguins).flow(stack(by="species", dir="y")).mark(
    ribbon(h=mass.density(), fill="species")  # @hl
)""",
        today_label="Today (KDE grid and stack computed by hand)",
        today_js="""chart(samples)
  .flow(
    derive((rows) => stackRows(densityRows(rows), { offset: "zero" })), // @hl
    scatter({ by: "x", x: "x" }),
    scatter({ by: "c", yMin: "y0", yMax: "y1" }) // @hl
  )
  .mark(ribbon({ fill: "c" }));""",
        B_js="""const mass = field("mass");
chart(penguins)
  .flow(
    sweep({ v: mass.range() }),
    scatter({ by: "v", x: "v" }),
    stack({ by: "species", dir: "y" })
  )
  .mark(ribbon({ h: mass.density("v"), fill: "species" }));""",
        B_py="""mass = field("mass")
chart(penguins).flow(
    sweep(v=mass.range()),
    scatter(by="v", x="v"),
    stack(by="species", dir="y"),
).mark(ribbon(h=mass.density("v"), fill="species"))""",
        C_js="""const mass = field("mass");
chart(penguins).mark(
  ribbon({ h: mass.density(), fill: "species" }).cut({ by: "species", dir: "y" })
);""",
        C_py="""mass = field("mass")
chart(penguins).mark(ribbon(h=mass.density(), fill="species").cut(by="species", dir="y"))""",
        verdict=dict(A="works, no rows", B="works, needs sweep rows", C="works, cut must find each group's share"),
    ),
    dict(
        id="ridgeline",
        title="Ridgeline (a spread, not a stack)",
        imgs=[
            ("ridgeline.png", "A fixed pitch between baselines: ridges overlap, as most ridgelines do (today's spread, densities computed in derive)."),
            ("ridge-sum.png", "For contrast, the same ridges stacked: a stacked density, a different chart."),
        ],
        text="Ridges are separate spaces, since their areas do not add, so a ridgeline is a <code>spread</code>. Today the pitch is set by two options, <code>anchor: \"baseline\"</code> and <code>spacing: 70</code>. In A, how the gap is measured is the value of <code>spacing</code>: a pitch between baselines here, or a contour or optical gap (see the next card).",
        A_js="""const high = field("high");
chart(weather)
  .flow(spread({ by: "month", dir: "y", spacing: Spacing.pitch(70, { at: "baseline" }) })) // @hl
  .mark(ribbon({ h: high.density(), fill: "month" })); // @hl""",
        A_py="""high = field("high")
chart(weather).flow(
    spread(by="month", dir="y", spacing=Spacing.pitch(70, at="baseline"))  # @hl
).mark(ribbon(h=high.density(), fill="month"))  # @hl""",
        today_label="Today (densities computed by hand)",
        today_js="""chart(samples)
  .flow(
    derive((rows) => densityRows(rows, { weighted: false })), // @hl
    spread({ by: "c", dir: "y", anchor: "baseline", spacing: 70 }), // @hl
    scatter({ by: "x", x: "x" }) // @hl
  )
  .mark(ribbon({ h: "y", fill: "c", opacity: 0.85 }));""",
        B_js="""const high = field("high");
chart(weather)
  .flow(
    spread({ by: "month", dir: "y", spacing: Spacing.pitch(70, { at: "baseline" }) }),
    sweep({ v: high.range() }),
    scatter({ by: "v", x: "v" })
  )
  .mark(ribbon({ h: high.density("v"), fill: "month" }));""",
        B_py="""high = field("high")
chart(weather).flow(
    spread(by="month", dir="y", spacing=Spacing.pitch(70, at="baseline")),
    sweep(v=high.range()),
    scatter(by="v", x="v"),
).mark(ribbon(h=high.density("v"), fill="month"))""",
        C_js=None,
        C_py=None,
        verdict=dict(A="works", B="works, with sweep rows", C="same as A: nothing is divided"),
    ),
    dict(
        id="ribbon-chart",
        title="Ribbon chart: the order changes at each x",
        imgs=[
            ("ribbon-per-lake.png", "The ribbon chart: at each lake the bars are sorted by count, and each species' ribbon joins its bars, crossing the others where the ranking changes (today, the gallery story)."),
            ("ribbon-by-total.png", "A profile stack sorted by each species' total: one order for every lake, so no ribbon crosses. A stacked area, not a ribbon chart (emulated with a total column)."),
        ],
        text="A ribbon chart (a Power BI chart type) sorts the bars at each x by value, so the order of the series changes from x to x, and joins each series across x with a ribbon that crosses the others. The way to write it is the per-x spelling below, which is today's gallery code, unchanged: the bars are spread by lake and stacked by count in each lake, and a layer draws a ribbon through each species' bars. Each lake is its own stack, so each lake has its own order. The ribbons are connectors between bars, not bands with a thickness at every x. A profile stack is different: its children are whole series, and it orders them the way any operator orders its children, by a key with one value per child. So <code>sort(\"count\")</code> there sorts by each series' total and gives one order for all x, the second render. Both are legal, and nothing needs an error. <b>Known gap.</b> One order per stack rules out a ribbon chart over series measured at different x, with the order changing at each x. Two ways out: resample the series onto shared x positions first (the union of their x values) and use the per-x spelling, or let a profile stack swap two profiles where they cross, which breaks one order per stack and so stays parked.",
        A_label="What you write (today's code, unchanged)",
        A_js="""chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x", spacing: 64 }),
    stack({ by: field("species").sort("count"), dir: "y" })
  )
  .mark(rect({ h: "count", fill: "species" }))
  .layer(ribbon({ opacity: 0.8 }));""",
        A_py="""chart(seafood).flow(
    spread(by="lake", dir="x", spacing=64),
    stack(by=field("species").sort("count"), dir="y"),
).mark(rect(h="count", fill="species")).layer(ribbon(opacity=0.8))""",
        today_label="The second render: a profile stack sorted by total (A)",
        today_js="""chart(seafood)
  .flow(stack({ by: field("species").sort("count"), dir: "y" })) // @hl
  .mark(ribbon({ x: "lake", h: "count", fill: "species" })); // @hl""",
        B_js=None,
        B_py=None,
        C_js="""// No spelling: crossings are not a division of one shape.""",
        C_py="""# No spelling: crossings are not a division of one shape.""",
        verdict=dict(A="per-x spelling (no change)", B="per-x spelling (no change)", C="can't: crossings are not a division"),
    ),
    dict(
        id="croissant",
        title="Croissant: a density cut into equal-probability slices",
        imgs=[("croissant-main.png", "Today's gallery story <code>Forward Syntax/Croissant</code>: hand-made grid, quantile rows, partition and intersect.")],
        text="<code>d</code> is a field expression over a distribution. Each method makes a different kind of value: <code>d.bin(Bin.quantiles(5))</code> is a key that cuts d's axis into 5 cells, <code>d.density()</code> is a curve over d's own axis, and <code>d.median()</code> is one number per cell. The ribbon takes the curve with no <code>x</code>, because a density carries its axis. <code>partition</code> on that axis restricts the curve to each cell. A cell of a Dist is the Dist over that cell with its mass, so the slices meet exactly. No <code>intersect</code>, hidden ribbon, <code>relate</code>, grid or quantile rows. The next card gives the formula and the callback behind each method.",
        A_js="""const params = [{ mean: 0, sd: 1 }];
const d = dist.normal({ mean: "mean", sd: "sd" });
chart(params)
  .flow(partition({ by: d.bin(Bin.quantiles(5)), dir: "x" })) // @hl
  .mark(
    layer([
      ribbon({ h: d.density(), inset: 3, fill: PAPER_FILL, stroke: PAPER_STROKE }), // @hl
      circle({ cx: d.median(), cy: 6, r: 3, fill: PAPER_STROKE }),
    ])
  );""",
        A_py="""params = [{"mean": 0, "sd": 1}]
d = dist.normal(mean="mean", sd="sd")
chart(params).flow(partition(by=d.bin(Bin.quantiles(5)), dir="x")).mark(  # @hl
    layer(
        [
            ribbon(h=d.density(), inset=3, fill=PAPER_FILL, stroke=PAPER_STROKE),  # @hl
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
        B_js="""const params = [{ mean: 0, sd: 1 }];
const d = dist.normal({ mean: "mean", sd: "sd" });
chart(params)
  .flow(
    sweep({ v: d.range() }),
    partition({ by: d.bin(Bin.quantiles(5)), dir: "x" }),
    scatter({ by: "v", x: "v" })
  )
  .mark(ribbon({ h: d.density("v"), inset: 3, fill: PAPER_FILL }));""",
        B_py="""params = [{"mean": 0, "sd": 1}]
d = dist.normal(mean="mean", sd="sd")
chart(params).flow(
    sweep(v=d.range()),
    partition(by=d.bin(Bin.quantiles(5)), dir="x"),
    scatter(by="v", x="v"),
).mark(ribbon(h=d.density("v"), inset=3, fill=PAPER_FILL))""",
        C_js="""const params = [{ mean: 0, sd: 1 }];
const d = dist.normal({ mean: "mean", sd: "sd" });
chart(params).mark(
  ribbon({ h: d.density(), fill: PAPER_FILL }).cut({ by: d.bin(Bin.quantiles(5)), dir: "x", spacing: 6 })
);""",
        C_py="""params = [{"mean": 0, "sd": 1}]
d = dist.normal(mean="mean", sd="sd")
chart(params).mark(
    ribbon(h=d.density(), fill=PAPER_FILL).cut(by=d.bin(Bin.quantiles(5)), dir="x", spacing=6)
)""",
        verdict=dict(A="works, partition restricts the profile", B="works, but each cell's rows must share boundary points", C="works, as a second cut mode (cells)"),
    ),
    dict(
        id="sankey",
        title="Sankey: strands stacked along a link's normal, ends stacked in anchors",
        imgs=[
            ("sankey-strands-normal.png", "Strands of 12, 24 and 12 px stacked along the link's normal: each keeps its width (emulated)."),
            ("sankey-strands-vertical.png", "The same strands stacked vertically: they thin where the link is steep."),
            ("sankey-energy.png", "The energy sankey with ends stacked in anchors (emulated anchors, from the stacked ribbons page)."),
        ],
        text="Inside <code>Coord.along(link)</code>, x is distance along the link and y is distance along its normal, so a plain profile stack draws strands that keep their width. At a node the link leaves horizontally, the normal is vertical, and the strand stack meets the anchor's slot stack exactly. Slots are a flow along a part, so they are the same stack in a one-dimensional space.",
        A_js="""// strands along one link
layer({ coord: Coord.along(link) }, [ // @hl
  chart(strands)
    .flow(stack({ by: "strand", dir: "y", baseline: Baseline.center() }))
    .mark(ribbon({ x: "s", h: "width", fill: "strand" })),
]);

// ends on the nodes (the agreed anchor spelling, unchanged)
rect({ w: 12, h: "value" })
  .anchor({
    name: "out",
    position: "x-max",
    slots: data(links, { on: "source" }).flow(stack({ by: "target", size: "value" })), // @hl
  })
  .name("nodes");""",
        A_py="""layer(
    [
        chart(strands)
        .flow(stack(by="strand", dir="y", baseline=Baseline.center()))
        .mark(ribbon(x="s", h="width", fill="strand"))
    ],
    coord=Coord.along(link),  # @hl
)

rect(w=12, h="value").anchor(
    name="out",
    position="x-max",
    slots=data(links, on="source").flow(stack(by="target", size="value")),  # @hl
).name("nodes")""",
        today_label="Today",
        today_js="""// No spelling: strands along a normal are drawn as hand-computed polygons.
// d3-sankey draws each strand as its own stroke on its own centerline.""",
        B_js="""layer({ coord: Coord.along(link) }, [
  chart(strands)
    .flow(
      scatter({ by: "s", x: "s", alignment: "middle" }),
      stack({ by: "strand", dir: "y" })
    )
    .mark(ribbon({ h: "width", fill: "strand" })),
]);""",
        B_py="""layer(
    [
        chart(strands)
        .flow(scatter(by="s", x="s", alignment="middle"), stack(by="strand", dir="y"))
        .mark(ribbon(h="width", fill="strand"))
    ],
    coord=Coord.along(link),
)""",
        C_js="""ref("link").cut({ by: "strand", size: "width", dir: "across" });""",
        C_py="""ref("link").cut(by="strand", size="width", dir="across")""",
        verdict=dict(A="works with Coord.along", B="works with Coord.along", C="needs a new cut direction, \"across\""),
    ),
    dict(
        id="half-violin",
        title="Half violin with slots",
        imgs=[("half-violin.png", "Penguin body mass: the violin's flat side has one slot per mass bin, joined to a 100% bar (emulated anchors and KDE).")],
        text="The violin is a density of mass. <code>dir: \"y\"</code> says the ribbon runs along y, so the density's own axis is y and <code>w</code> is its thickness: there is no question which axis the density uses. Its <code>x-max</code> part is the flat side, whose length is the profile's domain. A <code>partition</code> slot flow cuts that domain into cells, the same partition as the croissant's, and the bar's <code>stack</code> slots divide its height by share. The KDE helper and its grid go away.",
        A_js="""const mass = field("mass");
const massBins = mass.bin(Bin.thresholds([3000, 4000, 5000, 6000]));
layer([
  spread({ dir: "x", spacing: 160 }, [
    chart(penguins).mark(
      ribbon({ w: mass.density(), dir: "y", align: "end", fill: "#c4c4c4" }) // @hl
        .anchor({ name: "out", position: "x-max", slots: data().flow(partition({ by: massBins })) })
        .name("violin")
    ),
    chart(penguins).mark(
      rect({ w: 14, h: mass.count() })
        .anchor({ name: "in", position: "x-min", slots: data().flow(stack({ by: massBins, size: mass.count() })) })
        .name("bar")
    ),
  ]),
  chart(penguins)
    .flow(group({ by: massBins }))
    .mark(ribbon({ from: "violin.out", to: "bar.in", fill: massBins, opacity: 0.55 })),
]);""",
        A_py="""mass = field("mass")
mass_bins = mass.bin(Bin.thresholds([3000, 4000, 5000, 6000]))
layer(
    [
        spread(
            [
                chart(penguins).mark(
                    ribbon(w=mass.density(), dir="y", align="end", fill="#c4c4c4")  # @hl
                    .anchor(name="out", position="x-max", slots=data().flow(partition(by=mass_bins)))
                    .name("violin")
                ),
                chart(penguins).mark(
                    rect(w=14, h=mass.count())
                    .anchor(
                        name="in",
                        position="x-min",
                        slots=data().flow(stack(by=mass_bins, size=mass.count())),
                    )
                    .name("bar")
                ),
            ],
            dir="x",
            spacing=160,
        ),
        chart(penguins)
        .flow(group(by=mass_bins))
        .mark(ribbon(from_="violin.out", to="bar.in", fill=mass_bins, opacity=0.55)),
    ]
)""",
        today_label="The stacked ribbons page's target (a KDE helper makes grid rows)",
        today_js="""chart(penguins)
  .flow(derive(kde("mass", 200)), scatter({ by: "mass", y: "mass" })) // @hl
  .mark(
    ribbon({ w: "density", dir: "y", align: "end", fill: "#c4c4c4" }) // @hl
      .anchor({ name: "out", position: "x-max", slots: data(penguins).flow(partition({ by: massBins })) })
      .name("violin")
  );
// Today the render is emulated: slots are rects with h 0 in the violin's
// chart, sizes are written in mass units, and the KDE is hand-written.""",
        B_js="""const mass = field("mass");
chart(penguins)
  .flow(sweep({ v: mass.range() }), scatter({ by: "v", y: "v" }))
  .mark(
    ribbon({ w: mass.density("v"), dir: "y", align: "end", fill: "#c4c4c4" })
      .anchor({ name: "out", position: "x-max", slots: data(penguins).flow(partition({ by: massBins })) })
      .name("violin")
  );""",
        B_py="""mass = field("mass")
chart(penguins).flow(sweep(v=mass.range()), scatter(by="v", y="v")).mark(
    ribbon(w=mass.density("v"), dir="y", align="end", fill="#c4c4c4")
    .anchor(name="out", position="x-max", slots=data(penguins).flow(partition(by=mass_bins)))
    .name("violin")
)""",
        C_js=None,
        C_py=None,
        verdict=dict(A="works, slots are cells of the profile's index", B="works, slots on sweep rows", C="same as A or B: cut plays no part in slots"),
    ),
    dict(
        id="stacked-lines",
        title="Stacked lines: stack the bands, draw their edges",
        imgs=[("stacked-lines.png", "Five series stacked, each line along the top of its band (today's render, which gives <code>line</code> an <code>h</code>; the proposed spelling draws the same picture but does not run yet).")],
        text="A line has no thickness, so it has no amount to add, and <code>line</code> has no <code>h</code>. A line inside a stack is an error: \"line has no thickness, so a stack has nothing to add. Stack ribbons and draw each band's edge with a line.\" What is stacked is the bands. The lines are drawn on each band's top edge, the band's <code>y-max</code> part. Reading that part from another chart needs a part reference, so this spelling waits on the reference model; <code>edge</code> below is a placeholder for it.",
        A_js="""chart(topics)
  .flow(stack({ by: "topic", dir: "y" }))
  .mark(ribbon({ x: "x", h: "value" }).hidden().name("bands")) // @hl
  .layer(
    chart(selectAll("bands")).mark(line({ edge: "y-max", stroke: "topic" })) // @hl
  );""",
        A_py="""chart(topics).flow(stack(by="topic", dir="y")).mark(
    ribbon(x="x", h="value").hidden().name("bands")  # @hl
).layer(chart(select_all("bands")).mark(line(edge="y-max", stroke="topic")))  # @hl""",
        today_label="Today (runs, the render above; line takes h)",
        today_js="""chart(topics)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "topic", dir: "y" }))
  .mark(
    line({
      h: "value", // @hl
      stroke: "topic",
      source: { y: "end" },
      target: { y: "end" },
    })
  );""",
        B_js="""chart(topics)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "topic", dir: "y" }))
  .mark(rect({ w: 0, h: "value" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(group({ by: "topic" }))
      .mark(line({ source: { y: "end" }, target: { y: "end" }, stroke: "topic" }))
  );""",
        B_py="""chart(topics).flow(scatter(by="x", x="x"), stack(by="topic", dir="y")).mark(
    rect(w=0, h="value").name("bars")
).layer(
    chart(select_all("bars"))
    .flow(group(by="topic"))
    .mark(line(source={"y": "end"}, target={"y": "end"}, stroke="topic"))
)""",
        C_js="""// No spelling: a divide needs a drawn total to divide.""",
        C_py="""# No spelling: a divide needs a drawn total to divide.""",
        verdict=dict(A="works, waits on part references", B="works, lines join bar tops", C="can't"),
    ),
    dict(
        id="radial",
        title="Hard example 1: radial stacked area in polar coordinates",
        imgs=[("radial-stacked-area.png", "Today's per-x form in <code>Coord.polar()</code>; it already draws (real render).")],
        text="Profiles live in the layer's unbent space, so the polar layer bends the stacked area after the stack adds it. The radii add, not the areas. For rings whose areas add, the radius axis is <code>Coord.clock({ radius: \"area\" })</code> from the scale transforms proposal.",
        A_js="""chart(topics, { coord: Coord.polar() })
  .flow(stack({ by: "topic", dir: "y" })) // @hl
  .mark(ribbon({ x: "x", h: "value", fill: "topic" })); // @hl""",
        A_py="""chart(topics, coord=Coord.polar()).flow(stack(by="topic", dir="y")).mark(  # @hl
    ribbon(x="x", h="value", fill="topic")  # @hl
)""",
        today_label="Today (runs, the render above)",
        today_js="""chart(topics, { coord: Coord.polar() })
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "topic", dir: "y" })) // @hl
  .mark(ribbon({ h: "value", fill: "topic" })); // @hl""",
        B_js="""chart(topics, { coord: Coord.polar() })
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "topic", dir: "y" }))
  .mark(ribbon({ h: "value", fill: "topic" }));""",
        B_py="""chart(topics, coord=Coord.polar()).flow(
    scatter(by="x", x="x"), stack(by="topic", dir="y")
).mark(ribbon(h="value", fill="topic"))""",
        C_js="""chart(topics, { coord: Coord.polar() }).mark(
  ribbon({ x: "x", h: "value", fill: "topic" }).cut({ by: "topic", dir: "y" })
);""",
        C_py="""chart(topics, coord=Coord.polar()).mark(
    ribbon(x="x", h="value", fill="topic").cut(by="topic", dir="y")
)""",
        verdict=dict(A="works", B="works (today)", C="works"),
    ),
    dict(
        id="fan",
        title="Hard example 2: fan chart of nested forecast intervals",
        imgs=[
            ("fan-chart.png", "Nested 50%, 80% and 95% intervals as position profiles (today, real render)."),
            ("fan-chart-as-stack.png", "The same fan as a stack of quantile gaps on a hidden base part: the axis is forced to 0, because a stack measures from its baseline (today, emulated baseline)."),
        ],
        text="An interval's ends are positions, not amounts, so a fan is a layer of profiles placed by a span, and nothing adds. It can also be written as a stack of the gaps between quantiles on a baseline that is itself a profile, but then the axis must hold the baseline's 0, so the layered form is right. The span is written <code>y: { min, max }</code>, nested as the API rules ask (#1144, nest a role instead of prefixing it). On main the nested form exists only under <code>scatter</code>'s <code>dims</code>, and the flat <code>yMin</code> and <code>yMax</code> are still the channel names, so letting <code>y</code> take <code>{ min, max }</code> belongs to that audit.",
        A_js="""chart(forecast)
  .flow(group({ by: "level" }))
  .mark(ribbon({ x: "t", y: { min: "lo", max: "hi" }, fill: "level" })) // @hl
  .layer(chart(history).mark(line({ x: "t", y: "v" }))); // @hl""",
        A_py="""chart(forecast).flow(group(by="level")).mark(
    ribbon(x="t", y={"min": "lo", "max": "hi"}, fill="level")  # @hl
).layer(chart(history).mark(line(x="t", y="v")))  # @hl""",
        today_label="Today (runs, the first render)",
        today_js="""chart(forecast)
  .flow(group({ by: "level" }), scatter({ by: "t", x: "t", yMin: "lo", yMax: "hi" })) // @hl
  .mark(ribbon({ fill: "level" }))
  .layer(
    chart(history)
      .flow(scatter({ by: "t", x: "t", y: "v" })) // @hl
      .mark(line({ stroke: "#333", strokeWidth: 2 }))
  );""",
        B_js="""chart(forecast)
  .flow(group({ by: "level" }), scatter({ by: "t", x: "t", y: { min: "lo", max: "hi" } }))
  .mark(ribbon({ fill: "level" }))
  .layer(chart(history).flow(scatter({ by: "t", x: "t", y: "v" })).mark(line()));""",
        B_py="""chart(forecast).flow(
    group(by="level"), scatter(by="t", x="t", y={"min": "lo", "max": "hi"})
).mark(ribbon(fill="level")).layer(
    chart(history).flow(scatter(by="t", x="t", y="v")).mark(line())
)""",
        C_js="""// The same as A: nothing is divided.""",
        C_py="""# The same as A: nothing is divided.""",
        verdict=dict(A="works, positions not amounts", B="works (today)", C="same as A"),
    ),
]

# ---------------------------------------------------------------------------
# Precedent: one card per outside system.

PRECEDENT = [
    dict(name="ggplot2", img="prec-ggplot2-area.png", lang="r",
         code="""ggplot(sampled, aes(x, y, fill = series)) +
  geom_area()  # stat = "align", position = "stack" """,
         note="<code>stat_align</code> (the default since 3.4.0) reads every series at the union of all x by linear interpolation and pads 0 outside each series' own range, then <code>position_stack</code> adds. Same misaligned data as the first card. Real render."),
    dict(name="ggplot2, densities", img="prec-ggplot2-density.png", lang="r",
         code="""ggplot(peng, aes(v, after_stat(count), fill = species)) +
  geom_density(position = "stack")  # "fill" gives the conditional density""",
         note="Stacked densities are a position adjustment on a computed curve. <code>after_stat(count)</code> scales each group by its size. Real render."),
    dict(name="ggridges", img="prec-ggridges.png", lang="r",
         code="""ggplot(peng, aes(v, species)) +
  geom_density_ridges(scale = 1.6)""",
         note="Ridges on a categorical y with an overlap <code>scale</code>: a spread with a fixed pitch. No contour spacing. Real render."),
    dict(name="ggalluvial", img="prec-ggalluvial.png", lang="r",
         code="""ggplot(al, aes(axis1 = Class, axis2 = Sex, y = Freq)) +
  geom_alluvium(aes(fill = Survived)) +
  geom_stratum()""",
         note="Strata are stacks at each axis, and each flow's ends are slots in them. The closest precedent for anchors with stacked slots. Real render."),
    dict(name="d3-shape", img="prec-d3.png", lang="js",
         code="""d3.stack()
  .keys(keys)
  .offset(d3.stackOffsetWiggle)
  .order(d3.stackOrderInsideOut)(wide);""",
         note="Offsets (none, expand, diverging, silhouette, wiggle) and orders are functions over the whole table. Keys must share every x. Real render."),
    dict(name="Vega-Lite", img="prec-vegalite.png", lang="json",
         code="""{ "mark": "area",
  "encoding": { "y": { "field": "value", "stack": "center" } } }""",
         note="<code>stack</code> is an encoding property: zero, center, normalize. A missing x becomes 0. Real render."),
    dict(name="Observable Plot", img=None, lang="js",
         code="""Plot.areaY(data, {
  x: "x", y: "value", fill: "topic",
  offset: "wiggle", order: "inside-out",
});""",
         note="<code>stackY</code> is applied for you by <code>areaY</code>. Offset and order are options of the stack transform. No alignment of x grids."),
    dict(name="ggstream", img=None, lang="r",
         code="""ggplot(d, aes(x, value, fill = topic)) +
  geom_stream(type = "mirror")  # "ridge", "proportional" """,
         note="Snaps every series to a 1000-point grid and smooths, then stacks. The grid is hidden but fixed."),
    dict(name="matplotlib", img=None, lang="python",
         code="""ax.stackplot(x, ys, baseline="weighted_wiggle")""",
         note="One x array for all series. Baselines zero, sym, wiggle, weighted_wiggle."),
    dict(name="Mascot", img=None, lang="js",
         code="""// paraphrased from Mascot's stacked area example
let area = scene.mark("area", { x1, y1, x2, y2 });
let areas = scene.densify(area, table, { attribute: "date" });
let bands = scene.divide(areas, table, { attribute: "company", orientation: "vertical" });""",
         note="Draw the whole, densify to common vertices, divide by group at each vertex. The divide-first model of Approach C. Paraphrase, not verbatim."),
    dict(name="PiCCL", img=None, lang="js",
         code="""// paraphrased
divide(circle, "angular", { by: "category", size: "value" })""",
         note="Divides a drawn shape (a circle, a bottle) into parts by weight. A given whole."),
    dict(name="TeX and Haskell diagrams", img=None, lang="text",
         code="""\\vbox{\\hbox{A}\\hbox{B}}      % boxes report height and depth
a === b                        -- diagrams: placed by envelopes""",
         note="TeX stacks boxes that report height, depth and a baseline. Haskell diagrams places shapes by their envelope, a support function. Both read a summary richer than a box, as a profile is, and never the shape's parts."),
]

# ---------------------------------------------------------------------------
# Approaches.

APPROACHES = [
    dict(
        key="A",
        name="A. Profiles (recommended)",
        idea="Every node can report a profile. A box reports a constant one. <code>stack</code> adds profiles at each u and gives each child the boundary below it as its frame. <code>spread</code> with contour spacing reads the same profile. A divide is a stack with a given whole. <code>partition</code> on a profile's index restricts it. A density is a profile given by a function.",
        composes=[
            "<b>Coordinate transforms.</b> Profiles live in the layer's unbent space, so polar, <code>Coord.clock</code> and <code>Coord.along(spine)</code> bend the result after the stack. Every geometry reader already works on the unbent shape (#1342, #1298: outline readers ignore the coordinate bend), so this is the rule, not a new case. Contour spacing in the unbent space still prevents overlap on screen under any one-to-one transform. <code>Coord.along</code> is one-to-one only within its bend limit, and past it the layout raises an error.",
            "<b>Anchors.</b> A part such as <code>x-max</code> of a violin is a one-dimensional space whose index is the profile's u. A slot flow is an ordinary flow there: <code>partition</code> slots are cells of u, <code>stack</code> slots are shares of the part's length. Part names stay a separate decision.",
            "<b>Distributions (#980).</b> <code>x.density()</code> is a profile with no rows. A cell of a Dist partition is the Dist over the cell with its mass, which picks the mass reading the croissant page left open. <code>repeat</code> stays discrete.",
            "<b>Choose (silhouette note).</b> A profile is the silhouette note's contour instance. On constant profiles the profile stack equals today's box stack, which is that note's Law 2 for the degenerate case, so every existing chart is unchanged. Its domination order has no bounded width, so a <code>choose</code> over profile layouts is first fit, which is already <code>choose</code>'s default.",
            "<b>Layout engine.</b> A thickness is a size claim, a data amount times the scale factor plus pixels. The largest total over u is piecewise linear and increasing in the scale factor, the kind of claim the size pass already solves. This needs checking against the claim algebra.",
            "<b>Animation.</b> A baseline is a value of the stack, so a transition from zero to wiggle tweens the baseline. Stacked to grouped stays an animation between two specs (#831).",
        ],
        desugar="A profile stack whose parts share an order desugars into today's per-x form: read every part at the union of its breakpoints, stack each slice, connect. That rewrite is the shortcut until the engine has a profile type.",
        overlaps=[
            ("stack of profiles vs per-x stack", "Exact composition when the order is one for all u. Defined by the rewrite above."),
            ("stack vs spread with contour spacing", "Small shared kernel. Both read the profile and share the split. They differ in the combine (sum against largest overlap) and the result (one space against separate spaces). On boxes with no spacing they place shapes alike."),
            ("divide vs stack", "Same operator, a different closing condition: a given whole instead of a baseline. <code>field(f).normalize()</code> already has this type."),
            ("<code>cut</code> by weight", "Exact composition: the regions of <code>stack({ by, size })</code> intersected with the shape. So <code>cut</code> takes the operator, not a mode."),
            ("<code>cut</code> by cells, croissant", "Exact composition: <code>partition</code> regions intersected with the shape. On a profile mark, partition alone restricts the profile, which draws the same picture with no intersect."),
            ("<code>Tile.slice</code>, <code>Tile.dice</code>", "Exact: a normalized stack (#1276 proposes deleting them)."),
            ("<code>baseline</code> vs <code>Trait.diverging</code>", "One model, <code>StackOrigin</code>. The trait is a default that desugars into it."),
            ("<code>.stack()</code> mark method (#290)", "None: dropped."),
        ],
        tradeoffs=[
            "Easy: one spelling for stacked area, streamgraph, stacked density, polar and along-a-curve stacks; no rows or grids for densities; the croissant and the half violin lose their helpers.",
            "Awkward: a rigid shape (a circle, text, an image) as a part on a curved boundary has no sensible frame, so it is an error. The ribbon chart still needs the per-x form.",
            "New terms: profile, index, frame (internal); <code>Baseline</code> and <code>Spacing</code> on the surface.",
            "Cost: a new geometry type in the engine (beside box, enclosing circle and outline). Until then, the per-x rewrite is a declared shortcut.",
            "Extension: custom baselines and custom profile readers are functions over profiles, like the other strategy families (#1101).",
        ],
    ),
    dict(
        key="B",
        name="B. Per-x core (runner-up)",
        idea="The core has no profile. <code>stack</code> only ever reads boxes. Continuous charts are written in the per-x form: rows over x (from data, or from <code>sweep</code> for a density), <code>scatter</code> by x, a stack in each slice, and a ribbon threading the pieces. A data helper aligns misaligned series. The baseline is the <code>alignment</code> of the outer scatter (<code>Align.wiggle()</code>). Contour spacing is a separate pixel-outline query on <code>spread</code>.",
        composes=[
            "<b>Coordinates.</b> Works today in polar and would work in <code>Coord.along</code>.",
            "<b>Anchors.</b> Slots are flows over rows; a violin's side needs sweep rows.",
            "<b>Distributions.</b> Needs <code>sweep</code> (a continuum of rows) for every density, and on-demand slice layout that no prototype has built.",
            "<b>Choose.</b> Nothing new: only boxes.",
        ],
        desugar="It is the core. Nothing desugars into it that is not already there.",
        overlaps=[
            ("ribbon over per-x slices vs contour spacing", "Large partial overlap: two notions of a shape's thickness along x, one made of rows, one of pixel outlines."),
            ("<code>align</code> helper vs stat", "A visible resample step that names a rule users must remember, or a hidden one inside scatter, which is a heuristic."),
            ("<code>cut</code>", "Unchanged, with its modes."),
        ],
        tradeoffs=[
            "Easy: costs least; it is today's engine with a resample helper and an alignment strategy.",
            "Awkward: every continuous chart carries <code>scatter</code> by x; densities need <code>sweep</code> rows; series on different grids need a step the user must remember.",
            "Locality holds trivially: a stack never sees a ribbon. The cost is that the ribbon is never one child.",
            "New terms: <code>sweep</code>, <code>align</code>, <code>Align</code>.",
        ],
    ),
    dict(
        key="C",
        name="C. Divide a drawn whole (Mascot)",
        idea="Draw the whole first, then divide it. A stacked area is one area of the total, cut by group at each x. The croissant is the density cut along x. Sankey strands are the link cut across its width. <code>stack</code> stays for boxes.",
        composes=[
            "<b>Coordinates.</b> Cut in the unbent space, as A.",
            "<b>Anchors.</b> No role: slots are not a division of a drawn shape.",
            "<b>Distributions.</b> The density is the whole; cut needs each group's share at each x, so it reaches into the groups anyway.",
        ],
        desugar="<code>cut</code> by group is a stack of shares intersected with the total, so the divide is the stack under another name.",
        overlaps=[
            ("cut by group vs stack", "Large partial overlap: two routes to every stacked area."),
            ("cut by weight vs cut by cells", "One name over two types (shares and positions). Josh found these modes confusing."),
        ],
        tradeoffs=[
            "Easy: local by construction, since cut reads only its own mark's rows; right for shapes the spec really draws first (a bottle, a horizon chart).",
            "Awkward: the user writes a total they do not have; stacked lines and ribbon charts cannot be written; a texture per band cannot come from one source.",
            "New terms: cut modes and an \"across\" direction.",
        ],
    ),
]

SIDE_BY_SIDE_ORDER = ["uneven", "streamgraph", "density", "ridgeline", "ribbon-chart", "croissant", "sankey", "half-violin", "stacked-lines", "radial", "fan"]

# ---------------------------------------------------------------------------

SECTIONS_PROFILE = """
<p>For a node, an axis d (the one a stack runs along) and the other axis u, the node's <b>profile</b> along d is:</p>
<ul>
<li>a <b>domain</b>, an interval of u. When u is a position scale shared with its siblings (a ribbon's <code>x</code>), the domain is in data units. Otherwise it is the node's own extent in pixels.</li>
<li>at each u in the domain, a <b>descent</b> and an <b>ascent</b>: how far the shape reaches below and above its baseline along d.</li>
<li>each descent and ascent is a <b>size</b>: a data amount times the scale factor plus fixed pixels. A ribbon's <code>h: "value"</code> gives the amount. A stroke or a fixed <code>h: 12</code> gives pixels.</li>
</ul>
<p>Facts that follow:</p>
<ul>
<li><b>A box is the degenerate case.</b> Its ascent and descent are constant over its cross extent. A rect with no <code>x</code> has no index of its own, so its constant profile covers whatever domain its siblings share.</li>
<li><b>The hull is the box.</b> The box a parent reads today is the hull of the profile: lowest point to highest point. So any parent that only reads boxes keeps working.</li>
<li><b>Two profiles combine pointwise only on a shared index.</b> Siblings in a stack must place u on one scale. A ribbon's <code>x</code> does that. Profiles with different index scales are an error that names the two scales.</li>
<li><b>A profile can come from rows or from a function.</b> From rows it is the mark's curve through them (each series is curved first, then added). From a function (<code>x.density()</code>) it is evaluated on demand. Outside its domain a part has thickness 0.</li>
<li><b>Under a coordinate transform</b> the profile stays in the layer's unbent space. Polar maps u to angle and d to radius. <code>Coord.along(spine)</code> maps u to distance along the spine and d to distance along its normal.</li>
<li><b>A node's profile is computed bottom-up</b>, like its box: a stack's profile is [g_0, g_n], a spread's is the union of its children's placed profiles.</li>
</ul>
"""

SECTIONS_READERS = """
<div class="table-wrap"><table>
<tr><th>Reader</th><th>How it combines children's profiles</th><th>Result</th><th>Check</th></tr>
<tr><td><code>stack</code></td><td>g_i(u) = g_(i&minus;1)(u) + thickness_i(u); child i's frame is the curve g_(i&minus;1)</td><td>one space, the sum</td><td>CanSum, shared index</td></tr>
<tr><td>divide: <code>stack</code> with a given whole</td><td>the same, with each part rescaled to f_i(u) / &Sigma;f(u) times W(u)</td><td>one space, shares</td><td>CanSum, total not 0</td></tr>
<tr><td><code>spread</code>, <code>spacing: Spacing.contour(n)</code></td><td>gap_i = largest over u of (top_(i&minus;1)(u) &minus; bottom_i(u)) + spacing; a rigid translate</td><td>separate spaces</td><td>none (no sum)</td></tr>
<tr><td><code>partition</code> along u</td><td>restricts a profile to each cell of its index</td><td>cells at their places</td><td>key is a cell</td></tr>
<tr><td>anchor slot flow</td><td>the same flows, in the one-dimensional space of a part</td><td>slots ribbons attach to</td><td>as the flow</td></tr>
<tr><td><code>choose</code></td><td>first fit over alternatives' hulls</td><td>one alternative</td><td>none</td></tr>
</table></div>
"""

SECTIONS_LOCALITY = """
<p>Josh's objection (croissant round 6) was that a flow <code>stack</code> which reaches into a ribbon's vertices is not local. Here is a definition that can be checked:</p>
<ol>
<li>an operator reads only its children's summaries (a box today, or a profile), never their rows or vertices;</li>
<li>it writes only each child's frame, where the child's local 0 goes.</li>
</ol>
<p>The round 6 stack broke rule 1. It split each ribbon into per-x pieces, stacked the pieces in separate slices, and joined them again, so the ribbon stopped being one child. A profile stack keeps rule 1: it asks each child for its profile, the way it asks a rect for its height, and it never sees the child's rows or vertices. Series measured at different x show the difference: there are no shared vertices to pair, and the stack still adds the curves.</p>
<p>Rule 2 is where the answer has a cost, stated plainly: a profile stack's frame for child i is not a point but the curve g_(i&minus;1)(u). The child is drawn on that curve, like a shape drawn inside a coordinate transform. That is the same kind of frame a layer gives its children under <code>Coord.along(spine)</code>, so it is not a new power, but it is more than a translate. When every part is a box the curve is flat, and the frame is today's translate.</p>
<p>Where it does not hold:</p>
<ul>
<li><b>Rigid parts on a curved boundary.</b> A line, a circle, text or an image has no amount along u, and drawing it on a curve would bend it. In a profile stack with a curved boundary such a part is a loud error that points to <code>.label()</code> or <code>scatter</code>. With all boxes there is no curve, so dot plots and stacked bars are unchanged.</li>
<li><b>Order that changes with u.</b> One stack has one order, so the ribbon chart stays the per-x form.</li>
<li><b>Sharing an index means sharing a scale.</b> That is already true of any two siblings on one axis, so it is no new reach.</li>
</ul>
"""

SECTIONS_BASELINE = """
<p>A stack's zero point already has one model in the code: <code>StackOrigin { part, fraction, mirrored }</code> (<code>constraints/distribute.ts:71</code>). Today only <code>Trait.diverging(midpoint)</code> on the <code>by</code> column's unit sets it (<code>families/trait.ts:42</code>). With profiles it becomes a profile, g_0(u), because <code>Baseline.wiggle()</code> has no part and fraction. <code>baseline</code> is how a spec writes it, and <code>Trait.diverging</code> is the default that desugars to <code>Baseline.at</code>. The card after the streamgraph shows how it meets a parent's <code>alignment</code>.</p>
"""

SECTIONS_CUT = """
<p><b>What cut is today.</b> <code>shape.cut({ dir, size, inset })</code> slices one drawn shape (an image or a rect) into strips along <code>dir</code>, one strip per row. <code>size</code> gives each strip's length: a plain number is pixels, and <code>datum(n)</code> is a relative weight, so the strips share the room left after the fixed ones, as flexbox does. <code>inset</code> trims a gap off each strip. The bottle story spreads the strips apart afterwards (<code>cut.tsx</code>, <code>stories/forwardsyntax/Cut.stories.tsx</code>).</p>
<p><b>Why it should change.</b> The croissant divides a shape too, but a different way: a hidden ribbon, <code>partition</code> and <code>intersect</code>. So main has two ways to divide a shape with no shared code. Cut's weights repeat <code>fr(n)</code>, the flexible length GoFish already has (#1220). Its <code>inset</code> means a gap between strips, while <code>rect</code>'s and <code>region</code>'s <code>inset</code> shrink the outline.</p>
<p><b>The proposal.</b> Cut stops having its own size rules. Instead it takes the operator that would divide the shape:</p>
<ul>
<li>split this bottle the way this stack divides its whole: <code>bottle.cut(stack({ by: \"category\", size: \"amount\" }))</code>;</li>
<li>split this density into these partition cells: <code>density.cut(partition({ by: d.bin(Bin.quantiles(5)) }))</code>.</li>
</ul>
<p>Cut's only remaining job is to turn the pieces into separate children, so the next operator can move them: the exploded bottle spreads them apart, a horizon chart moves its bands down to one line. When the pieces stay where they are, no cut is needed at all: <code>partition</code> or a divide restricts a profile directly, as in the croissant and the stacked densities.</p>
"""

SECTIONS_SAMPLING = """
<ul>
<li><b>No spec names a grid.</b> A profile is a function. Its curve is fixed by the mark's rows (with the mark's <code>curve</code>) or by a function such as <code>x.density()</code>.</li>
<li><b>Curve, then add.</b> Each part is curved by itself, then the stack adds functions. Today GoFish stacks points and then curves each boundary, and with the default monotone curve that can give a band a negative thickness (stacking page, 8% here).</li>
<li><b>The renderer samples when it draws.</b> A boundary is drawn through the union of the breakpoints of the parts below it, plus extra points where a curve is not linear and for function profiles. A fixed count (512) stands until screen-aware sampling, which Josh deferred.</li>
<li><b>Continuum rows are not needed for any example here.</b> Densities are function-valued channels. <code>repeat</code> stays discrete (draws, quantile levels). <code>sweep</code> stays parked for curves that are not a function of either axis, such as a spiral or a Lissajous figure.</li>
</ul>
"""

SECTIONS_IMPL = """
<ol>
<li><b>Shortcut now.</b> A <code>stack</code> whose parts are collective marks with <code>x</code> lowers to the per-x form: curve each part, read it at the union of breakpoints, compute the baseline from all parts, stack each slice, connect. This is a declared shortcut, because the stack peeks at the mark kind to know a part is a profile.</li>
<li><b>One geometry kernel.</b> The profile belongs in <code>geometry/</code> beside box, enclosing circle and outline. That module has duplicates to fold first: two <code>simplifyRing</code> functions (<code>geometry/outline.ts</code>, <code>geometry/clip.ts</code>), enclose's own point, box and hull (<code>enclose/prims.ts</code>), and three inset paths. <code>pack</code> reports its children's outlines while <code>treemap</code> reports its box (#1233), which a profile query should settle the same way for both.</li>
<li><b>One divide kernel.</b> The glue solve with a closing condition (baseline or whole) serves <code>stack</code>, <code>normalize</code>, <code>Tile.slice</code> and <code>Tile.dice</code>, and <code>cut</code>, and carries one CanSum check. Today the check is placed by hand: <code>stack</code> uses the units' sum (<code>distribute.ts:366</code>), <code>treemap</code>, the size channel and <code>.sum()</code> call <code>checkSummable</code> (#1208), and <code>cut</code> with a datum array and <code>pack</code> check nothing.</li>
<li><b>Full fix.</b> Profiles in the size and placement passes, so the stack reads them and the per-x rewrite goes away.</li>
</ol>
"""

DECISIONS = [
    "Is a profile (an extent that varies along the other axis, a box being the constant case) the one geometry concept for stack, contour spacing, divide, slots and densities?",
    "Does the two-rule definition of local (read only summaries, write only frames, where a frame may be a boundary curve) answer your locality objection?",
    "Only amounts stack: a part with no thickness along u (a line, circle, text or image) in a profile stack is an error that names the fix. For lines, the fix is a stack of ribbons with a line on each band's edge, which waits on part references.",
    "Keep the word <code>baseline</code>: the stack's option chooses its own 0 (<code>Baseline.start()</code>, <code>.end()</code>, <code>.middle()</code>, <code>.at(part, fraction)</code>, <code>.wiggle()</code>), and a parent's <code>alignment: \"baseline\"</code> lines up those 0 points. <code>StackOrigin</code> is the one model, and <code>Trait.diverging</code> is a default that desugars into <code>Baseline.at</code>?",
    "<code>spacing</code> takes a number (sugar for <code>Spacing.box(n)</code>) or a <code>Spacing</code> strategy, and <code>Spacing.pitch(n, { at })</code> replaces spread's <code>anchor</code> option?",
    "Which outline spacing ships first: <code>Spacing.contour</code> only (trees, sankey columns), or <code>Spacing.optical</code> too (ridgelines, rows of glyphs)?",
    "<code>cut</code> takes the stack or partition that divides the shape, drops its own sizes and <code>inset</code>, and only makes the pieces movable children?",
    "A density's area is the mass it is made from (the row count, or 1 for a Dist), so stacked densities add up to the density of all rows? The other choice is area 1 for every curve.",
    "One callback shape, <code>(x, xs) =&gt; result</code>, behind every field method, with <code>field(\"x\").then(fn, { unit, fold })</code> for custom methods and <code>Bin.cells(fn)</code> as the one exception, because a bin's cells and empty cells come from the whole chart?",
    "Plan, not a question: each method's API reference entry (its descriptor <code>doc</code>) states its formula and the callback it stands for. This lands with the implementation.",
    "A cell of a Dist partition is the Dist over the cell with its mass, so <code>d.density()</code> in a cell is the parent's curve there?",
    "Outside its own x range a part has thickness 0 (ggplot2), rather than an error?",
    "Accept the per-x rewrite as a declared shortcut until the engine has a profile type?",
    "Name: \"profile\", or \"contour\" or \"skyline\" (\"envelope\" is taken by <code>Coord.envelope</code>, #1284)?",
]

SYNTAX_CHANGES = [
    "<code>stack</code> of ribbons with <code>x</code>: <code>.flow(stack({ by, dir }))</code> and <code>.mark(ribbon({ x, h }))</code>, no <code>scatter</code> by x.",
    "<code>stack({ baseline: Baseline.start() | Baseline.middle() | Baseline.wiggle() | ... })</code>.",
    "<code>spread({ spacing: 4 | Spacing.box(4) | Spacing.pitch(70, { at }) | Spacing.contour(4) | Spacing.optical(...) })</code>, replacing <code>anchor</code>.",
    "<code>ribbon({ h: mass.density() })</code> with no <code>x</code>, and <code>ribbon({ x, y: { min, max } })</code>.",
    "<code>line</code> loses <code>h</code>; a stacked line chart is a stack of ribbons with a line on each band's edge.",
    "<code>shape.cut(stack(...))</code> and <code>shape.cut(partition(...))</code> replacing cut's sizes and <code>inset</code>.",
    "<code>field(\"x\").then((x, xs) =&gt; ..., { unit, fold })</code> for custom methods, and <code>Bin.cells(fn)</code> for custom bins.",
]

BUGS = [
    "A stack of ribbons over series measured at different x stacks only rows that share an exact x, with no warning (card 1, today's render). Already listed on the stacking page as bug 1.",
    "<code>Stacking Matrix/ConditionalDensity</code> throws \"Species is not constant across the connected group\" on a fused ribbon over <code>stack({ size: normalize })</code>. Already listed as stacking bug 7.",
    "With <code>alignment: \"middle\"</code> on a spread of stacks that share a value axis, the axis still draws, with meaningless labels (50, 50, 50 in the Likert render; 1, 1, 1 in the stacked areas). Repro: <code>Proposals/Stack Profile/Spacing Alignment/LikertMiddle</code> and <code>AreasMiddle</code>. Once the children's 0 points no longer line up, there is no shared value axis to draw.",
    "Today a curve is applied after stacking, so with the default monotone curve a band can get a negative thickness (stacking page).",
]

RELATED = [
    ("#47", "stacked and divided ribbons (sankey strands, anchors)"),
    ("#290", "<code>.stack()</code> as a mark method (dropped)"),
    ("#809", "wiggle as a stack-level baseline (Josh's idea)"),
    ("#831", "update is connect on time (stacked to grouped is an animation)"),
    ("#980", "first-class distributions (densities as profiles)"),
    ("#1101", "custom strategies as functions"),
    ("#1208", "<code>checkSummable</code>, the shared CanSum check"),
    ("#1220", "<code>fr</code> lengths, which <code>cut</code>'s datum sizes repeat"),
    ("#1233", "pack reports outlines, treemap reports a box"),
    ("#1276", "delete <code>Tile.slice</code> and <code>Tile.dice</code>: a normalized stack"),
    ("#1284", "<code>Coord.envelope</code> (the bottle fill by area)"),
    ("#1298, #1342", "geometry readers work on the unbent shape under coordinates"),
    ("#1332", "croissant sampling"),
]

# ---------------------------------------------------------------------------
# Cards placed between the example cards: the answers that need their own
# renders. Each: id, after (the example card it follows), title, intro,
# figs [(file, caption)], codes [(label, js, py)], body (HTML).

INSERTS = [
    dict(
        id="baseline-alignment",
        after="streamgraph",
        title="Baseline and alignment: one point, two sides of a handshake",
        intro="In GoFish a node's <b>baseline</b> is its own 0 point, and it bubbles up: a rect's baseline is its bottom edge, a stack of rects has the baseline of its first part. A stack's <code>baseline</code> option is how the stack chooses where its own 0 is along its own axis. <code>alignment</code> is how a parent lines up its children on the other axis, and its value <code>\"baseline\"</code> means \"line up the children's 0 points\". So the two compose: the child says where its 0 is, and the parent decides whether to line up those points or the children's boxes. The renders show where the choice matters. Each Likert row's 0 is the middle of its Neutral bar (set by <code>Trait.diverging</code>), and the stacked areas' 0 is the bottom of each stack.",
        figs=[
            ("likert-baseline.png", "<code>alignment: \"baseline\"</code> (the default): the rows' 0 points line up, so the Neutral middles form one line and one axis measures every row (real render)."),
            ("likert-middle.png", "<code>alignment: \"middle\"</code>: the rows' boxes are centered instead, so the Neutral middles no longer line up, and no shared axis is left (real render; the axis labels are a bug)."),
            ("areas-baseline.png", "Two stacked areas spread side by side with <code>alignment: \"baseline\"</code>: both start at 0, so one value axis serves both (real render)."),
            ("areas-middle.png", "The same with <code>alignment: \"middle\"</code>: the smaller one floats to the middle of the taller one (real render; the axis labels are the same bug)."),
        ],
        codes=[
            ("The stack sets its 0; the parent lines 0 points up", """chart(survey, { schema: { response: Unit({ traits: [Trait.diverging()] }) } })
  .flow(
    spread({ by: "question", dir: "y", alignment: "baseline" }), // parent: line up 0 points
    stack({ by: "response", dir: "x" }) // child: 0 is the Neutral middle
  )
  .mark(rect({ w: "count", fill: "response" }));""", """chart(survey, schema={"response": Unit(traits=[Trait.diverging()])}).flow(
    spread(by="question", dir="y", alignment="baseline"),  # parent: line up 0 points
    stack(by="response", dir="x"),  # child: 0 is the Neutral middle
).mark(rect(w="count", fill="response"))"""),
            ("Baseline values", """stack({ by: "topic", dir: "y", baseline: Baseline.start() }); // the default: the first part starts at 0
stack({ by: "topic", dir: "y", baseline: Baseline.end() }); // the last part ends at 0: grows the other way
stack({ by: "topic", dir: "y", baseline: Baseline.middle() }); // the middle of the whole is at 0
stack({ by: "answer", dir: "x", baseline: Baseline.at("Neutral", 0.5) }); // what Trait.diverging desugars to
stack({ by: "topic", dir: "y", baseline: Baseline.wiggle() }); // a computed curve""", """stack(by="topic", dir="y", baseline=Baseline.start())
stack(by="topic", dir="y", baseline=Baseline.end())
stack(by="topic", dir="y", baseline=Baseline.middle())
stack(by="answer", dir="x", baseline=Baseline.at("Neutral", 0.5))
stack(by="topic", dir="y", baseline=Baseline.wiggle())"""),
        ],
        body="""
<p>The values name a place on the stack, like <code>alignment</code>'s values do, so <code>center</code> becomes <code>middle</code> and <code>zero</code> becomes <code>start</code>; \"zero\" named a data value, not a place. For <code>Baseline.wiggle()</code> the 0 is the 0 of the coordinates the wiggle curve is written in (d3 starts the curve at 0 at the first x).</p>
<h4>The other names, fairly</h4>
<div class="table-wrap"><table>
<tr><th>Name</th><th>For it</th><th>Against it</th></tr>
<tr><td><b><code>baseline</code></b> (proposed)</td><td>It is already GoFish's word for a node's 0 point, and <code>alignment: \"baseline\"</code> already reads it. The streamgraph literature calls g_0 the baseline (Byron and Wattenberg, 2008). One word names one thing in both places: the stack sets its baseline, the parent lines baselines up.</td><td>Readers may first take <code>baseline</code> for an alignment value; the handshake has to be explained once, as here.</td></tr>
<tr><td><code>origin</code></td><td>The code calls the model <code>StackOrigin</code>, and the option name is free.</td><td>The axes note puts the origin on the measure type: it is the identity or fixed point of the unit, as <code>Trait.diverging</code> sets it. An option named <code>origin</code> would read as overriding the measure's origin, which that note rules out. The stack does not change what 0 means for the data; it chooses where its own 0 sits among its parts.</td></tr>
<tr><td>CSS <code>justify</code> and <code>align</code></td><td>CSS splits the main axis (<code>justify-content</code>) from the cross axis (<code>align-items</code>), which is the same split as here.</td><td><code>justify-content</code> distributes items in a container's free space. A stack has no free space on its axis (its parts are glued), so there is nothing to distribute. It would add a second word for a different idea.</td></tr>
<tr><td><code>alignment</code></td><td>One word for every \"where does it sit\" question.</td><td><code>alignment</code> is the parent's rule for its children on the other axis. Giving <code>stack</code> an <code>alignment</code> for its own axis would make one option mean two axes, depending on the operator. Approach B used it only because each x slice there was a child of an outer <code>scatter</code>.</td></tr>
</table></div>
<p><b>Check against \"origin lives on the measure type\".</b> No conflict. <code>Baseline.start()</code> puts the measure's own 0 at the start of the first part, which is the bar chart's identity. <code>Trait.diverging</code> is a fixed point read from the type, so it stays the default and desugars to <code>Baseline.at</code>; an explicit <code>baseline</code> over a diverging unit is an error. With <code>Baseline.middle()</code> or <code>wiggle()</code>, positions on the value axis no longer mean amounts from 0, so the axis can only measure thickness, not position, which is why streamgraphs drop their y axis. The bug in the <code>\"middle\"</code> renders is the same fact: once 0 points stop lining up, there is no shared value axis to draw.</p>
<p><b>A unit stack that should grow up.</b> Five stories (<code>WaffleChart</code>, <code>UnitColumnChart</code>, <code>UnitHistogram</code>, <code>TitanicFacet</code>, <code>Violin</code>) use <code>reverse</code> or <code>alignment: \"end\"</code> to mean bottom, because they are spreads in a free space, which runs y-down. A waffle column is a count, so it is a stack, and a stack grows from its baseline away from the measure's 0, upward on a y-up value axis, with no <code>reverse</code>. That needs stacks with spacing, which is still open.</p>
""",
    ),
    dict(
        id="spacing",
        after="ridgeline",
        title="Spacing between outlines: box, contact or optical",
        intro="When shapes are irregular, the gap between them can be measured three ways. A <b>box gap</b> is the gap between bounding boxes (today's <code>spread</code>). A <b>contact</b> gap is the smallest distance between the facing outlines: the shapes slide together until they would touch. An <b>optical</b> gap sets the average white space between the facing outlines to a target, where each column of white counts only up to a depth, and never comes closer than contact. The renders compute the three by hand (a throwaway helper, <code>spacingModels.ts</code>) and draw the result with today's engine.",
        figs=[
            ("ridge-box.png", "Box gap: each ridge starts above the previous one's box."),
            ("ridge-contact.png", "Contact: each ridge drops until its base would touch a ridge below. Where the ridge below has a long tail, it drops far."),
            ("ridge-optical.png", "Optical (depth cap 40 px, target mean gap 32 px): ridges that sit over a high shoulder get more room, so the rhythm looks even."),
            ("glyph-box.png", "Box gap on letter-like outlines: T and A, A and V look far apart."),
            ("glyph-contact.png", "Contact: A and V touch along their slopes and T tucks over A, so the word looks uneven."),
            ("glyph-optical.png", "Optical (depth cap 30, target 14): even-looking white between every pair, which is what type spacing aims for."),
        ],
        codes=[
            ("Proposed: how the gap is measured is the value of spacing", """spread({ by: "month", dir: "y", spacing: 4 }); // sugar for Spacing.box(4)
spread({ by: "month", dir: "y", spacing: Spacing.pitch(70, { at: "baseline" }) }); // today's anchor
spread({ by: "month", dir: "y", spacing: Spacing.contour(4) });
spread({ by: "month", dir: "y", spacing: Spacing.optical({ target: 32, depth: 40 }) });""", """spread(by="month", dir="y", spacing=4)
spread(by="month", dir="y", spacing=Spacing.pitch(70, at="baseline"))
spread(by="month", dir="y", spacing=Spacing.contour(4))
spread(by="month", dir="y", spacing=Spacing.optical(target=32, depth=40))"""),
        ],
        body="""
<div class="table-wrap"><table>
<tr><th>Model</th><th>Rule</th><th>Where it is used</th></tr>
<tr><td>Box gap</td><td>gap between bounding boxes along the axis</td><td>today's <code>spread</code>; Graphviz <code>nodesep</code>; d3-sankey <code>nodePadding</code></td></tr>
<tr><td>Pitch</td><td>a fixed distance between a named point on each child</td><td>today's <code>anchor: \"baseline\"</code>; ggridges' <code>scale</code></td></tr>
<tr><td>Contact (minimum distance)</td><td>the smallest distance between facing outlines equals the gap</td><td>tidy trees (Reingold and Tilford, 1981: contours compared level by level), <code>d3.tree</code>, d3-flextree (van der Ploeg, 2014, nodes of different sizes), GoTree; skyline packing; the sankey layout page's contour spacing</td></tr>
<tr><td>Optical (equal area, depth cap)</td><td>the mean white gap between facing outlines, each column capped at a depth, equals a target; never closer than contact</td><td>type spacing: HT Letterspacer sets sidebearings from a target white <i>area</i> measured only to a <i>depth</i> inward from the outline (a percent of the x-height); Tim Ahrens (Kern On) notes that perception works in terms of average distance or white area; Adobe InDesign's optical kerning adjusts by shape but does not publish its method</td></tr>
</table></div>
<p><b>Why minimum distance looks wrong for type.</b> Two letters that touch at one point leave large open wedges of white (A and V above), while two straight stems at the same minimum distance leave none, so the eye sees uneven gaps. Type designers measure the white area instead. The depth cap stops the area from counting white deep inside an open shape (the inside of an L or a C), which would push those letters too far away. No vis tool we found spaces marks by optical area; outline spacing in vis is contact (tidy trees, d3-flextree).</p>
<p><b>For charts.</b> Contact is right where the rule is \"never overlap\" and nothing else is judged: trees and sankey node columns. Optical is right where an even rhythm is the point: a ridgeline, a row of glyphs or icons. Both read the same profile; they differ only in how they turn two profiles into one gap.</p>
<p><b>Naming.</b> <code>measure</code> is out. Spread already has an option for how spacing is measured, <code>anchor: \"edge\" | \"start\" | \"middle\" | \"end\" | \"baseline\"</code> (facing edges, or a fixed pitch between named points). Contour is another answer to the same question, so it should not be a second option. The proposal makes the answer the value of <code>spacing</code>, as a strategy family (<code>Spacing</code>, uppercase, as the API rules ask for a choice among strategies). A plain number stays as sugar for <code>Spacing.box(n)</code>, so a default is still something a user can write, and <code>percent</code> and <code>fr</code> lengths still work. <code>Spacing.pitch(70, { at: \"baseline\" })</code> takes a required length, so it is a call only. This removes spread's <code>anchor</code> option, which frees the word for the anchors design's <code>.anchor()</code>. About 28 story, test and docs files use an <code>anchor</code> value today, and each moves mechanically.</p>
""",
    ),
    dict(
        id="methods",
        after="croissant",
        title="What the methods compute",
        intro="A field expression like <code>field(\"mass\")</code> works like polars' <code>pl.col(\"mass\")</code>: it sees one column. Every named method on it is one named instance of one callback shape, <code>(x, xs) =&gt; result</code>. <code>x</code> is this row's value of the field, and <code>xs</code> is the values of that field over the rows of the current group: the rows the mark or operator reading the channel was given. A user can always write the callback instead of the method. Polars has the same two views of one column: <code>map_elements</code> gets one value, and <code>map_batches</code> gets the whole Series.",
        figs=[],
        codes=[
            ("Each method and the callback it stands for", """field("mass"); // (x) => x  (JS lets a callback drop xs)
field("mass").sum(); // (_, xs) => sum(xs)
field("mass").median(); // (_, xs) => median(xs)
field("mass").normalize(); // (x, xs) => x / sum(xs)
field("mass").density(); // (_, xs) => kde(xs), a function (t) => number
field("mass").bin(Bin.step(500)); // a partition: cells, and the cell of each x

// a custom method, used like a built-in one
const share = field("mass").then((x, xs) => x / max(xs), { unit: "ratio" });""", """field("mass")  # lambda x, xs: x
field("mass").sum()  # lambda _, xs: sum(xs)
field("mass").median()  # lambda _, xs: median(xs)
field("mass").normalize()  # lambda x, xs: x / sum(xs)
field("mass").density()  # lambda _, xs: kde(xs), a function of t
field("mass").bin(Bin.step(500))  # a partition: cells, and the cell of each x

share = field("mass").then(lambda x, xs: x / max(xs), unit="ratio")"""),
        ],
        body="""
<div class="table-wrap"><table class="methods">
<tr><th>Kind</th><th>Named method</th><th>Formula</th><th>Callback</th></tr>
<tr><td>Per row</td><td><code>field(\"mass\")</code></td><td>the row's value</td><td><code>(x) =&gt; x</code>. A function accessor works today.</td></tr>
<tr><td rowspan="5">Fold: the same value for every row of the group</td><td><code>.sum()</code></td><td>sum of the present values; missing values are dropped</td><td><code>(_, xs) =&gt; sum(xs)</code></td></tr>
<tr><td><code>.mean()</code></td><td>sum &divide; n over the present values</td><td><code>(_, xs) =&gt; mean(xs)</code></td></tr>
<tr><td><code>.median()</code></td><td>sort the present values; with h = (n &minus; 1) &times; 0.5, interpolate between the values at floor(h) and ceil(h): the type-7 quantile at 0.5, as R and numpy compute it (<code>medianOf</code>, <code>fieldExpr.ts</code>)</td><td><code>(_, xs) =&gt; median(xs)</code></td></tr>
<tr><td><code>.count()</code></td><td>n</td><td><code>(_, xs) =&gt; xs.length</code></td></tr>
<tr><td><code>.distinct()</code></td><td>the number of different values</td><td><code>(_, xs) =&gt; new Set(xs).size</code></td></tr>
<tr><td>Per row, reading the group</td><td><code>.normalize()</code></td><td>x &divide; the group's sum</td><td><code>(x, xs) =&gt; x / sum(xs)</code></td></tr>
<tr><td>Curve</td><td><code>.density()</code></td><td>f(t) = (1 &divide; bw) &Sigma;<sub>i</sub> K((t &minus; x<sub>i</sub>) &divide; bw), K the standard normal density, bw = 0.9 &times; min(sd, IQR &divide; 1.34) &times; n<sup>&minus;1/5</sup> (Silverman's rule, R's <code>bw.nrd0</code>; <code>silvermanBandwidth</code> in <code>overlap.ts</code> computes it). The area under f is n. For a <code>Dist</code>, f is its exact density, with area 1</td><td><code>(_, xs) =&gt; kde(xs)</code>, whose result is a function <code>(t) =&gt; number</code></td></tr>
<tr><td>Key (bin)</td><td><code>.bin(Bin.step(500))</code>, <code>Bin.thresholds(n)</code>, <code>Bin.quantiles(n)</code></td><td><code>Bin.step(w)</code>: cells [k&times;w, (k+1)&times;w) over the domain. <code>Bin.thresholds(n)</code>: a step from d3's <code>tickIncrement</code> for about n cells. <code>Bin.quantiles(n)</code>: edges at the type-7 quantiles i/n of the sorted values (<code>cells.ts</code>)</td><td><code>Bin.cells((all) =&gt; ({ cells, cellOf }))</code>: not the one shape; see below</td></tr>
</table></div>
<p><b>Precedent.</b> A fold that returns the same value for every row of its group is a window function: SQL's <code>median(x) OVER (PARTITION BY g)</code>, or polars' <code>pl.col(\"x\").median().over(\"g\")</code>. <code>normalize</code> fits the same shape with no change, <code>(x, xs) =&gt; x / sum(xs)</code>, as SQL's <code>x / sum(x) OVER (PARTITION BY g)</code> does.</p>
<p><b>The one place one shape is not enough: bins.</b> The key fits, <code>(x) =&gt; cellOf(x)</code>, but two things cannot come back from a callback that runs once per row. Every group must get the same cells, so the cells come from the field's values over the whole chart, not from the group's <code>xs</code>. And the empty cells and their order must be known, because the axis shows them. So a bin's explicit form is a partition computed once from all the values, <code>Bin.cells((all) =&gt; ({ cells, cellOf }))</code>, where <code>all</code> is the field's values over the chart's data.</p>
<p><b>Consequences, stated plainly.</b></p>
<ol>
<li><b>A fold cannot be told from a per-row value without running it.</b> A channel that needs one value per group (a <code>circle</code>'s <code>cx</code> in a cell) checks that the value is the same across the group, and fails with the existing \"not constant across the connected group\" error.</li>
<li><b>A fold called once per row is n calls of O(n) work, O(n&sup2;) in all.</b> A named method avoids it because the engine knows it is a fold and computes it once per group. For a callback, the engine memoizes the result per group (same <code>xs</code>, same result), or the user declares it a fold, <code>.then(fn, { fold: true })</code>, and it is called once per group.</li>
<li><b>A callback sees one field, so it cannot use two.</b> A mean of x weighted by w reads two fields, so it is a <code>derive</code> step, or an expression over two fields, not a <code>.then</code>.</li>
<li><b>Units get simpler.</b> The callback sees one field, so the unit it receives is known. It declares only what it returns: the same unit (<code>sum</code>, <code>median</code>), a ratio (<code>normalize</code>), a count, or a curve whose values are that unit's density. Without the declaration, CanSum and the other checks cannot run, so an undeclared result is treated as a plain number that cannot be stacked.</li>
<li><b>Serialization.</b> A named method crosses to Python as data. A callback written in Python reaches JS as a batch call (<code>RESOLVE_ROWS</code>, <code>channels.ts</code>), which today returns one value per row; a fold would be called per group.</li>
</ol>
<p><b>Custom methods.</b> Main has no <code>.then</code> or similar on a field expression; the closest are the <code>derive(fn)</code> flow step, which sees whole rows, and the batch accessor above. The proposal is one method, <code>field(\"x\").then((x, xs) =&gt; ..., { unit, fold })</code>, which returns a field expression, so it chains and reads like a built-in method. Polars splits the same idea into <code>map_elements</code> (one value), <code>map_batches</code> (the whole column) and <code>pipe</code> (a function from expression to expression). <code>.then</code> covers the first two with one shape. <code>pipe</code> is plain function composition in JS (<code>share(field(\"x\"))</code>), so it needs no method. A named custom method is just a function that returns <code>.then(...)</code>.</p>
<p><b>Docs plan.</b> Each method's API reference entry (its descriptor <code>doc</code>) states its formula and the callback it stands for, as in the table above. This lands with the implementation.</p>
""",
    ),
]
