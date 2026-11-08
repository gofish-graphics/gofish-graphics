# Content of the stack-profile proposal. build.py turns it into page.html and
# proposal.md. Code is formatted by proposals/_tools/format-snippets.mjs.
# A line that ends in a "@hl" comment is a changed line: it is highlighted on
# the page, and the marker is removed.

TITLE = "Stack Profiles"

SUMMARY = [
    "Stacked areas, streamgraphs, stacked densities, croissants, ridgelines, sankey strands and anchor slots all read one thing from a shape: how thick it is at each position along the other axis. Call it the shape's <b>profile</b>. A box is the profile that does not change.",
    "With profiles, <code>stack</code> stays one local operator. It reads each child's profile, adds them, and places each child on the boundary below it. <code>spread</code> reads the same profile to space shapes by their outlines, <code>partition</code> cuts a profile's domain into cells, and a divide is a stack whose whole is given. <code>cut</code> loses its modes.",
    "A density is a profile given by a function, so it needs no rows, no <code>sweep</code> and no grid. The renderer samples a profile when it draws it, so no spec names a grid.",
]

RECOMMENDATION = (
    "<b>Recommendation: Approach A, profiles.</b> Add one geometry type, the profile, that every node can report "
    "(a box reports a constant one). Keep one flow <code>stack</code> that adds profiles and takes "
    "<code>baseline</code>, with <code>StackOrigin</code> as the one model of where it starts. "
    "<code>spread</code> spaces by profiles with <code>measure: Outline.contour()</code>. "
    "<code>partition</code> on a profile restricts it to cells, which draws the croissant with no "
    "<code>intersect</code>. <code>cut</code> keeps one job, splitting a drawn shape into pieces the next "
    "operator can move, and takes its regions from a <code>stack</code> or a <code>partition</code> "
    "instead of modes. The per-x form stays for charts whose order changes at each x. "
    "<b>Runner-up: B, per-x core.</b> It is today's engine with fixes and costs least, but it keeps "
    "two concepts of thickness and answers locality by never letting a stack see a ribbon."
)

RULES = [
    "<b>A profile is an extent that varies along the other axis.</b> For an axis d (the stacking axis) and the cross axis u, a profile is a domain of u and, at each u in it, a descent and an ascent around the node's baseline. A box is the constant profile over its cross extent.",
    "<b>Each value is a size, not a pixel count.</b> It is a data amount times the scale factor plus fixed pixels (a stroke, a fixed-size rect), so a stack can still solve its scale before layout.",
    "<b>Readers differ only in how they combine profiles.</b> <code>stack</code> adds them at each u. <code>spread</code> with contour spacing takes the largest overlap. A divide adds them and rescales to a given whole. <code>partition</code> restricts the domain to cells. An anchor's slot flow runs along a part whose length is a profile's edge.",
    "<b>Local means two things.</b> An operator reads only its children's summaries (a box or a profile), never their rows or vertices, and it writes only each child's frame. A profile stack's frame for a child is the boundary curve below it. When every part is a box, that curve is flat and the frame is today's translate.",
    "<b>Profiles live in the layer's unbent space.</b> Polar, <code>Coord.along(spine)</code> and other coordinate transforms bend the result afterwards, so a radial stacked area and strands along a sankey link are plain stacks.",
    "<b>A profile may be a function.</b> <code>x.density()</code> is a profile with no rows. The renderer samples it when it draws it. No spec names a grid, and <code>repeat</code> stays discrete.",
]

TERMS = [
    ("Profile", "The thickness of a shape along one axis (d) as a function of position along the other (u): at each u, how far the shape reaches below and above its baseline (its descent and ascent, the font-metric words GoFish already uses). Precedents: a tidy tree's contour, a skyline in computational geometry, and the calculus region between two graphs, {(u, v): lo(u) &le; v &le; hi(u)}."),
    ("Index", "The cross-axis position u that a profile is a function of. Two profiles can be added at each u only if their indexes are positions on one shared scale."),
    ("Hull", "The box around a profile: from its lowest point to its highest. A parent that reads only boxes sees the hull."),
    ("Frame", "Where an operator puts a child's local 0. Today it is a point (a translate). In a profile stack it is the boundary curve below the child."),
    ("Glue", "Neighboring parts share one boundary, so no gap or overlap opens between them. The equations are g_i(u) &minus; g_(i&minus;1)(u) = f_i(u)."),
    ("Baseline", "Where a stack starts, g_0(u). Zero for stacked bars, a wiggle curve for a streamgraph. In the code it is <code>StackOrigin</code> (<code>constraints/distribute.ts</code>)."),
    ("Given whole", "A total that the spec fixes before the parts are known: 100%, a bottle's outline, a link's width. A stack with a given whole is a divide."),
    ("Per-x form", "<code>scatter({ by: \"x\" })</code> then <code>stack</code>. The stack runs once in each x slice and sees only that slice."),
    ("Contour spacing", "Spacing siblings as close as their outlines allow, not their boxes (<code>measure: Outline.contour()</code> on the sankey layout page)."),
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
        text="The baseline is a profile too: g_0(u), chosen to flatten the boundaries. It needs every series over all x, which the whole-series stack sees. <code>baseline</code> sets the stack's <code>StackOrigin</code>; see the baseline section.",
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
        title="Stacked density curves (croissant style)",
        imgs=[
            ("density-stacked.png", "Stacked group densities, each scaled by its group's count (emulated: KDE grid computed in derive)."),
            ("density-conditional.png", "The same with the whole given as 1 at every x: the conditional density, a divide."),
        ],
        text="<code>mass.density()</code> is a profile given by a function of mass, one per group. The stack adds functions, so there are no rows over mass and no grid. Giving the whole (<code>.normalize()</code>) turns the stack into a divide.",
        A_js="""const mass = field("mass");
chart(penguins)
  .flow(stack({ by: "species", dir: "y" }))
  .mark(
    ribbon({ x: mass, h: mass.density().times(mass.count()), fill: "species" }) // @hl
  );""",
        A_py="""mass = field("mass")
chart(penguins).flow(stack(by="species", dir="y")).mark(
    ribbon(x=mass, h=mass.density().times(mass.count()), fill="species")  # @hl
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
  .mark(ribbon({ h: mass.density("v").times(mass.count()), fill: "species" }));""",
        B_py="""mass = field("mass")
chart(penguins).flow(
    sweep(v=mass.range()),
    scatter(by="v", x="v"),
    stack(by="species", dir="y"),
).mark(ribbon(h=mass.density("v").times(mass.count()), fill="species"))""",
        C_js="""const mass = field("mass");
chart(penguins).mark(
  ribbon({ x: mass, h: mass.density().times(mass.count()), fill: "species" }).cut({
    by: "species",
    dir: "y",
  })
);""",
        C_py="""mass = field("mass")
chart(penguins).mark(
    ribbon(x=mass, h=mass.density().times(mass.count()), fill="species").cut(
        by="species", dir="y"
    )
)""",
        verdict=dict(A="works, no rows", B="works, needs sweep rows", C="works, cut must find each group's share"),
    ),
    dict(
        id="ridgeline",
        title="Ridgeline (a spread, not a stack)",
        imgs=[
            ("ridgeline.png", "Fixed pitch: ridges overlap, as most ridgelines do (today's spread, densities computed in derive)."),
            ("ridge-contact.png", "Contour spacing: each ridge as close as its outline allows (emulated)."),
            ("ridge-sum.png", "For contrast, the same ridges stacked: a stacked density, a different chart."),
        ],
        text="Ridges are separate spaces, since their areas do not add, so a ridgeline is a <code>spread</code>. With profiles, the spread can space ridges by their outlines. It reads the same profile as a stack and combines it differently: the largest overlap, not a sum.",
        A_js="""const high = field("high");
chart(weather)
  .flow(
    spread({ by: "month", dir: "y", spacing: 4, measure: Outline.contour() }) // @hl
  )
  .mark(ribbon({ x: high, h: high.density(), fill: "month" })); // @hl""",
        A_py="""high = field("high")
chart(weather).flow(
    spread(by="month", dir="y", spacing=4, measure=Outline.contour())  # @hl
).mark(ribbon(x=high, h=high.density(), fill="month"))  # @hl""",
        today_label="Today (fixed pitch; densities computed by hand)",
        today_js="""chart(samples)
  .flow(
    derive((rows) => densityRows(rows, { weighted: false })), // @hl
    spread({ by: "c", dir: "y", anchor: "baseline", spacing: 70 }),
    scatter({ by: "x", x: "x" }) // @hl
  )
  .mark(ribbon({ h: "y", fill: "c", opacity: 0.85 }));""",
        B_js="""const high = field("high");
chart(weather)
  .flow(
    spread({ by: "month", dir: "y", spacing: 4, measure: Outline.contour() }),
    sweep({ v: high.range() }),
    scatter({ by: "v", x: "v" })
  )
  .mark(ribbon({ h: high.density("v"), fill: "month" }));""",
        B_py="""high = field("high")
chart(weather).flow(
    spread(by="month", dir="y", spacing=4, measure=Outline.contour()),
    sweep(v=high.range()),
    scatter(by="v", x="v"),
).mark(ribbon(h=high.density("v"), fill="month"))""",
        C_js="""const high = field("high");
chart(weather)
  .flow(spread({ by: "month", dir: "y", spacing: 4, measure: Outline.contour() }))
  .mark(ribbon({ x: high, h: high.density(), fill: "month" }));""",
        C_py="""high = field("high")
chart(weather).flow(
    spread(by="month", dir="y", spacing=4, measure=Outline.contour())
).mark(ribbon(x=high, h=high.density(), fill="month"))""",
        verdict=dict(A="works, same profile as the stack", B="works, contour is a second geometry query", C="works (same as A)"),
    ),
    dict(
        id="ribbon-chart",
        title="Ribbon chart: the band order changes at each x",
        imgs=[
            ("ribbon-chart.png", "Today's per-x form, unchanged in every approach: bars sorted by count at each lake, then a ribbon per species through its bars."),
            ("ribbon-chart-as-bands.png", "The same order drawn as one band per series: a band cannot jump over its neighbors, so it overlaps itself."),
        ],
        text="A profile stack has one order for all x. Here the order changes at every x, and the ribbons cross between the bars, so no division of one shape draws it. It stays the per-x form in every approach. A sort that depends on x inside a profile stack is a loud error that points here.",
        A_js="""chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x", spacing: 48 }),
    stack({ by: field("species").sort("count"), dir: "y" })
  )
  .mark(rect({ w: 24, h: "count", fill: "species" }).name("bars"))
  .layer(
    chart(selectAll("bars"))
      .flow(group({ by: "species" }))
      .mark(ribbon({ fill: "species", opacity: 0.5 }))
  );""",
        A_py="""chart(seafood).flow(
    spread(by="lake", dir="x", spacing=48),
    stack(by=field("species").sort("count"), dir="y"),
).mark(rect(w=24, h="count", fill="species").name("bars")).layer(
    chart(select_all("bars"))
    .flow(group(by="species"))
    .mark(ribbon(fill="species", opacity=0.5))
)""",
        today_label="Today (the same code; no change)",
        today_js=None,
        B_js=None,
        B_py=None,
        C_js=None,
        C_py=None,
        verdict=dict(A="per-x form (no change)", B="per-x form (no change)", C="can't: crossings are not a division"),
    ),
    dict(
        id="croissant",
        title="Croissant: a density cut into equal-probability slices",
        imgs=[("croissant-main.png", "Today's gallery story <code>Forward Syntax/Croissant</code>: hand-made grid, quantile rows, partition and intersect.")],
        text="<code>partition</code> on a profile's own index restricts the profile to each cell. A cell of a Dist is the Dist over that cell with its mass, so <code>x.density()</code> in a cell is the parent's curve there, and the slices meet exactly. No <code>intersect</code>, no hidden ribbon, no <code>relate</code>, no grid, no quantile rows.",
        A_js="""const params = [{ mean: 0, sd: 1 }];
const x = dist.normal({ mean: "mean", sd: "sd" });
chart(params)
  .flow(partition({ by: x.bin(Bin.quantiles(5)), dir: "x" })) // @hl
  .mark(
    layer([
      ribbon({ x, h: x.density(), inset: 3, fill: PAPER_FILL, stroke: PAPER_STROKE }), // @hl
      circle({ cx: x.median(), cy: 6, r: 3, fill: PAPER_STROKE }),
    ])
  );""",
        A_py="""params = [{"mean": 0, "sd": 1}]
x = dist.normal(mean="mean", sd="sd")
chart(params).flow(partition(by=x.bin(Bin.quantiles(5)), dir="x")).mark(  # @hl
    layer(
        [
            ribbon(x=x, h=x.density(), inset=3, fill=PAPER_FILL, stroke=PAPER_STROKE),  # @hl
            circle(cx=x.median(), cy=6, r=3, fill=PAPER_STROKE),
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
const x = dist.normal({ mean: "mean", sd: "sd" });
chart(params)
  .flow(
    sweep({ v: x.range() }),
    partition({ by: x.bin(Bin.quantiles(5)), dir: "x" }),
    scatter({ by: "v", x: "v" })
  )
  .mark(ribbon({ h: x.density("v"), inset: 3, fill: PAPER_FILL }));""",
        B_py="""params = [{"mean": 0, "sd": 1}]
x = dist.normal(mean="mean", sd="sd")
chart(params).flow(
    sweep(v=x.range()),
    partition(by=x.bin(Bin.quantiles(5)), dir="x"),
    scatter(by="v", x="v"),
).mark(ribbon(h=x.density("v"), inset=3, fill=PAPER_FILL))""",
        C_js="""const params = [{ mean: 0, sd: 1 }];
const x = dist.normal({ mean: "mean", sd: "sd" });
chart(params).mark(
  ribbon({ x, h: x.density(), fill: PAPER_FILL }).cut({
    by: x.bin(Bin.quantiles(5)),
    dir: "x",
    spacing: 6,
  })
);""",
        C_py="""params = [{"mean": 0, "sd": 1}]
x = dist.normal(mean="mean", sd="sd")
chart(params).mark(
    ribbon(x=x, h=x.density(), fill=PAPER_FILL).cut(
        by=x.bin(Bin.quantiles(5)), dir="x", spacing=6
    )
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
        text="The violin is a profile over mass. Its <code>x-max</code> part is the flat side, whose length is the profile's domain. A <code>partition</code> slot flow cuts that domain into cells, the same partition as the croissant's, and the bar's <code>stack</code> slots divide its height by share. The KDE helper and its grid go away.",
        A_js="""const mass = field("mass");
const massBins = mass.bin(Bin.thresholds([3000, 4000, 5000, 6000]));
layer([
  spread({ dir: "x", spacing: 160 }, [
    chart(penguins).mark(
      ribbon({ y: mass, w: mass.density(), dir: "y", align: "end", fill: "#c4c4c4" }) // @hl
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
                    ribbon(y=mass, w=mass.density(), dir="y", align="end", fill="#c4c4c4")  # @hl
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
        title="Stacked lines (no area to divide)",
        imgs=[("stacked-lines.png", "Five series stacked; each line runs along the top of its band (today, per-x form).")],
        text="What is stacked is the amount, never the stroke. A line with <code>h</code> reports the profile of its band and draws the band's top edge, which today's <code>source</code> and <code>target</code> options already say. A divide has nothing to divide here.",
        A_js="""chart(topics)
  .flow(stack({ by: "topic", dir: "y" }))
  .mark(
    line({
      x: "x", // @hl
      h: "value",
      stroke: "topic",
      source: { y: "end" },
      target: { y: "end" },
    })
  );""",
        A_py="""chart(topics).flow(stack(by="topic", dir="y")).mark(
    line(x="x", h="value", stroke="topic", source={"y": "end"}, target={"y": "end"})  # @hl
)""",
        today_label="Today (runs, the render above)",
        today_js="""chart(topics)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "topic", dir: "y" })) // @hl
  .mark(line({ h: "value", stroke: "topic", source: { y: "end" }, target: { y: "end" } }));""",
        B_js="""chart(topics)
  .flow(scatter({ by: "x", x: "x" }), stack({ by: "topic", dir: "y" }))
  .mark(line({ h: "value", stroke: "topic", source: { y: "end" }, target: { y: "end" } }));""",
        B_py="""chart(topics).flow(scatter(by="x", x="x"), stack(by="topic", dir="y")).mark(
    line(h="value", stroke="topic", source={"y": "end"}, target={"y": "end"})
)""",
        C_js="""// No spelling: a divide needs a drawn total to divide.""",
        C_py="""# No spelling: a divide needs a drawn total to divide.""",
        verdict=dict(A="works", B="works (today)", C="can't"),
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
        text="An interval's ends are positions, not amounts, so a fan is a layer of profiles placed by <code>yMin</code> and <code>yMax</code>, and nothing adds. It can also be written as a stack of the gaps between quantiles, which do add, on a baseline that is itself a profile: the lowest quantile. That second form is legal and draws the same bands, but the axis must then hold the baseline's 0, so the layered form is the right one. The test: a profile type must not force a stack where positions are meant.",
        A_js="""chart(forecast)
  .flow(group({ by: "level" }))
  .mark(ribbon({ x: "t", yMin: "lo", yMax: "hi", fill: "level" })) // @hl
  .layer(chart(history).mark(line({ x: "t", y: "v" }))); // @hl""",
        A_py="""chart(forecast).flow(group(by="level")).mark(
    ribbon(x="t", y_min="lo", y_max="hi", fill="level")  # @hl
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
  .flow(group({ by: "level" }), scatter({ by: "t", x: "t", yMin: "lo", yMax: "hi" }))
  .mark(ribbon({ fill: "level" }))
  .layer(chart(history).flow(scatter({ by: "t", x: "t", y: "v" })).mark(line()));""",
        B_py="""chart(forecast).flow(
    group(by="level"), scatter(by="t", x="t", y_min="lo", y_max="hi")
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
            "New terms: profile, index, frame (internal); <code>Baseline</code> on the surface. <code>measure: Outline.contour()</code> comes from the sankey page.",
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
<tr><td><code>spread</code>, <code>measure: Outline.contour()</code></td><td>gap_i = largest over u of (top_(i&minus;1)(u) &minus; bottom_i(u)) + spacing; a rigid translate</td><td>separate spaces</td><td>none (no sum)</td></tr>
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
<li><b>Rigid parts on a curved boundary.</b> A circle, text or an image has no amount along u, and drawing it on a curve would bend it. In a profile stack with a curved boundary such a part is a loud error that points to <code>.label()</code> or <code>scatter</code>. With all boxes there is no curve, so dot plots and stacked bars are unchanged.</li>
<li><b>Order that changes with u.</b> One stack has one order, so the ribbon chart stays the per-x form.</li>
<li><b>Sharing an index means sharing a scale.</b> That is already true of any two siblings on one axis, so it is no new reach.</li>
</ul>
"""

SECTIONS_BASELINE = """
<p>A stack's zero point already has one model in the code: <code>StackOrigin { part, fraction, mirrored }</code> (<code>constraints/distribute.ts:71</code>). Today only <code>Trait.diverging(midpoint)</code> on the <code>by</code> column's unit sets it (<code>families/trait.ts:42</code>). A separate <code>baseline</code> option would be a second channel for the same point unless the two are one. Proposed:</p>
<ul>
<li><code>StackOrigin</code> is the one model. With profiles it becomes a profile: g_0(u).</li>
<li><code>baseline</code> is how a spec writes it. <code>Baseline.zero()</code> is today's default, the first part's tail. <code>Baseline.center()</code> is the middle of the whole (<code>fraction</code> 0.5 of the whole stack). <code>Baseline.wiggle()</code> is computed from all parts over u; it has no part and fraction, which is why <code>StackOrigin</code> must become a profile.</li>
<li><code>Trait.diverging(midpoint)</code> stays a property of the data. It is the default that desugars into a <code>StackOrigin</code> at the midpoint. Meaning lives on the type, so an explicit <code>baseline</code> on a stack over a diverging unit is an error, not an override.</li>
<li><b>Which way a stack grows is the same question.</b> A stack grows from its baseline away from the measure's zero, which the layer seats at the bottom of a y-up value axis. Five stories (<code>WaffleChart</code>, <code>UnitColumnChart</code>, <code>UnitHistogram</code>, <code>TitanicFacet</code>, <code>Violin</code>) use <code>reverse</code> or <code>alignment: "end"</code> to mean bottom, because they are spreads in a free space, which runs y-down. A waffle column is a count, so in this design it is a stack and grows up from its baseline with no <code>reverse</code>. That needs stacks with spacing, which the choose proposal left open.</li>
</ul>
"""

SECTIONS_CUT = """
<p>On main, <code>cut</code> builds each slice as <code>intersect([rect.hidden(), offset(source)])</code> and only cuts an image or a rect (<code>cut.tsx</code>). The croissant does the same operation with a hidden ribbon, <code>partition</code> and <code>intersect</code>, so the divide is already on main as two paths with no shared code. <code>cut</code>'s sizes, where <code>datum(n)</code> is a share of what is left after fixed pixels, repeat <code>fr(n)</code> (#1220). And <code>cut</code>'s <code>inset</code> is a gap along <code>dir</code>, while <code>rect</code>'s and <code>region</code>'s <code>inset</code> shrink the outline.</p>
<p>With profiles, the regions come from the operators that already make them, and the modes go away (Josh's \"regions from stack/partition intersected with the shape\"):</p>
<ul>
<li>shares of a drawn shape: <code>shape.cut(stack({ by, size }))</code>;</li>
<li>cells of a drawn shape: <code>shape.cut(partition({ by }))</code>;</li>
<li>a profile mark divided in place needs no <code>cut</code>: <code>partition</code> or a divide restricts it directly (the croissant, stacked densities).</li>
</ul>
<p><code>cut</code> keeps one job no other operator does: it makes each piece a separate child, so the next operator can move it. The horizon chart moves its bands down to one baseline, and the bottle stories spread their pieces apart. The gap between pieces is the next operator's <code>spacing</code>, so <code>cut</code>'s own <code>inset</code> and its flexbox sizes go.</p>
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
    "Should a rigid part (circle, text, image) on a curved boundary be an error?",
    "One model for a stack's zero: <code>StackOrigin</code> as a profile, written <code>baseline: Baseline.*</code>, with <code>Trait.diverging</code> as a default and an explicit baseline over a diverging unit an error?",
    "<code>cut</code> takes the operator that makes its regions (<code>cut(stack(...))</code>, <code>cut(partition(...))</code>), loses its modes, flexbox sizes and <code>inset</code>, and keeps only the job of making movable pieces?",
    "A cell of a Dist partition is the Dist over the cell with its mass, so <code>x.density()</code> in a cell is the parent's curve there?",
    "Outside its own x range a part has thickness 0 (ggplot2), rather than an error?",
    "Densities as function-valued channels, so no <code>sweep</code> for any chart here, and <code>sweep</code> parked for parametric curves?",
    "Accept the per-x rewrite as a declared shortcut until the engine has a profile type?",
    "Name: \"profile\", or \"contour\", \"envelope\" (taken by <code>Coord.envelope</code>, #1284) or \"skyline\"?",
]

SYNTAX_CHANGES = [
    "<code>stack</code> of ribbons with <code>x</code>: <code>.flow(stack({ by, dir }))</code> and <code>.mark(ribbon({ x, h }))</code>, no <code>scatter</code> by x.",
    "<code>stack({ baseline: Baseline.zero() | Baseline.center() | Baseline.wiggle() })</code>.",
    "<code>spread({ measure: Outline.contour() })</code> (from the sankey layout page).",
    "<code>ribbon({ h: x.density() })</code> and <code>ribbon({ x, yMin, yMax })</code> with no rows over x.",
    "<code>shape.cut(stack(...))</code> and <code>shape.cut(partition(...))</code> replacing <code>cut</code>'s modes.",
]

BUGS = [
    "A stack of ribbons over series measured at different x stacks only rows that share an exact x, with no warning (card 1, today's render). Already listed on the stacking page as bug 1.",
    "<code>Stacking Matrix/ConditionalDensity</code> throws \"Species is not constant across the connected group\" on a fused ribbon over <code>stack({ size: normalize })</code>. Already listed as stacking bug 7.",
    "The fan chart written as a stack forces 0 into the y axis. This is right (a stack measures from its baseline) and shows why a profile baseline matters; not a bug.",
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
