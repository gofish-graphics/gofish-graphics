# Builds ggdist.json: one entry per plotted chunk of the four ggdist 3.3.3
# vignettes. The R code comes from render-ggdist.R (verbatim vignette code); the
# GoFish specs, use-ups, fit classes and notes are written below. Run from the
# repo root, after gen-render-ggdist.py and render-ggdist.R:
#   python3 proposals/uncertainty-specs/grammar/catalog/build-ggdist.py
import json
import re
import subprocess

CAT = "proposals/uncertainty-specs/grammar/catalog"
PRETTIER = "node_modules/.bin/prettier"

# ---------------------------------------------------------------- R code
src = open(f"{CAT}/render-ggdist.R").read()
blocks = {}
for m in re.finditer(r"^# ---- (\S+)(?: \((\S+): (\S+)\))? ----\n(.*?)(?=^# ---- |^# ======== |\Z)", src, re.M | re.S):
    name, vig, label, body = m.groups()
    body = body.strip("\n")
    if vig:
        body = re.sub(r"^p <- withVisible\(\{\n", "", body)
        body = re.sub(r"\n\}\)\$value\n.*$", "", body, flags=re.S)
    blocks[name] = (vig, label, body)

chunk_meta = json.load(open("/tmp/ggdist-chunks.json"))

# data chunks each entry needs, in order (besides the vignette's setup chunk)
DEPS = {
    "slabinterval": {
        "03-06,13,14,16-22,28-29,32,38-39": ["sample_data"],
        "07,27,33,37": ["dist_data"],
        "10": ["priors"],
        "14": ["13"],
        "24-26,34": ["23"],
        "36": ["35"],
    },
    "dotsinterval": {
        "41,42": ["40"],
        "44,45": ["43"],
        "46": ["43", "45"],
        "48": ["47"],
        "51-53": ["50"],
        "55,56,65,66": ["54"],
        "58,59": ["57"],
        "61,62": ["60"],
        "68": ["67", "m_iris_v"],
    },
    "lineribbon": {
        "69-80": ["df"],
        "76-79": ["df_2groups"],
        "80": ["analytical_df"],
        "82,83": ["81"],
        "85-88": ["mtcars_boot"],
    },
    "freq-uncertainty-vis": {
        "89-94": ["data_gen", "m_ABC"],
        "95,96": ["m_mpg"],
    },
}


def expand(spec):
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += range(int(a), int(b) + 1)
        else:
            out.append(int(part))
    return out


def deps_for(num, vig):
    out = []
    for rng, ds in DEPS.get(vig, {}).items():
        if num in expand(rng):
            out += ds
    return out


def find_block(key, vig):
    if key.isdigit():
        for name in blocks:
            if name.startswith(f"{int(key):02d}-"):
                return blocks[name][2]
    for name, (v, label, body) in blocks.items():
        if name == key and v is None:
            return body
    raise KeyError(key)


def r_code(entry):
    num = int(entry["id"][:2])
    parts = ["# setup: library(dplyr); library(tidyr); library(distributional);",
             "#        library(ggdist); library(ggplot2); library(patchwork); library(broom)",
             "#        theme_set(theme_ggdist())"]
    for d in deps_for(num, entry["vignette"]):
        parts.append(f"# -- needs chunk {d} --")
        parts.append(find_block(d, entry["vignette"]))
    parts.append(f"# -- chunk {entry['label']} --")
    parts.append(blocks[entry["id"]][2])
    for extra in entry["merged"]:
        name = entry["id"] + "b"
        parts.append(f"# -- merged chunk {extra} --")
        parts.append(blocks[name][2])
    return "\n".join(parts)


# ---------------------------------------------------------------- specs
# Each entry: title, gofish (JS), uses_up, fit, verdict, note. Version 2 of
# the grammar (../theory-fragment.html). slab, interval, lineribbon and
# gradientinterval are marks defined in ordinary GoFish in section 1 of
# ../theory-fragment.html. Other names used but not defined in a spec
# (densityCurve, centralIntervals, as, withDraw, keepDeepest, INK, SLAB)
# are the prelude in ggdist-summary.md: plain JS over today's GoFish
# plus the version 2 additions. The v1 fit of each entry is in v1-fits.json.

E = {}

E[1] = dict(
    title='The slabinterval family (overview figure)',
    gofish="""
const x = dist.normal({ mean: 4, sd: 1 });
const cell = [{ mean: 4, sd: 1 }];
const dots = sample(cell, { n: 100, at: "quantiles" });
// one row per geom
spread({ dir: "y", spacing: 8 }, [
  // halfeye
  chart(cell).mark(layer([slab(x), interval(x)])),
  // eye
  chart(cell).mark(
    layer([
      slab(x, { side: "both" }),
      // gap: this should sit on the slab's zero line, but a
      // layer aligns its children's boxes, not their
      // origins
      interval(x),
    ])
  ),
  // gradientinterval: opacity from the density, scaled so
  // the peak is 1
  chart(cell).mark(
    layer([gradientinterval(x), interval(x)])
  ),
  // ccdfinterval: thickness P(X > v), from the axis start at 0
  chart(cell).mark(
    layer([
      ccdf(x, { density: { range: [0] } }),
      interval(x),
    ])
  ),
  // cdfinterval: thickness P(X <= v), up to the axis end at 8
  chart(cell).mark(
    layer([
      slab(x, {
        density: { range: [undefined, 8] },
        curve: (c) =>
          c.map((r) => ({ ...r, density: r.cdf })),
      }),
      interval(x),
    ])
  ),
  // interval
  chart(cell).mark(
    interval(x, {
      levels: [0.95, 0.8, 0.5],
      point: false,
      h: 10,
      opacity: 1 / 3,
    })
  ),
  // pointinterval
  chart(cell).mark(interval(x)),
  // slab
  chart(cell).mark(slab(x)),
  // histinterval
  layer([
    chart(histDf)
      .flow(
        partition({
          by: field("x").bin(Bin.thresholds(30)),
          dir: "x",
        })
      )
      .mark(rect({ h: field("x").count(), fill: SLAB })),
    chart(cell).mark(interval(x)),
  ]),
  // dots
  chart(dots)
    .flow(
      partition({ by: x.bin(Bin.step(0.1)), dir: "x" }), // chosen by hand; ggdist picks the width so the tallest stack fits
      stack({ dir: "y" })
    )
    .mark(circle({ r: 2 })),
  // dotsinterval
  layer([
    chart(dots)
      .flow(
        partition({ by: x.bin(Bin.step(0.1)), dir: "x" }), // chosen by hand; ggdist picks the width so the tallest stack fits
        stack({ dir: "y" })
      )
      .mark(circle({ r: 2 })),
    chart(cell).mark(interval(x)),
  ]),
]);
""",
    uses_up='mixed: ccdf and cdf rows: the CDF of the draws as thickness; gradient row: the density curve of the draws read as opacity; slab and interval rows: summaries per cell; dots rows: sample at quantiles, then partition and stack',
    fit='gofish-gap',
    verdict='ok',
    note="Every row can now be written. Version 1 could not write the gradient row, because a blend has no peak scaling. In version 2 it is the density curve of the draws divided by its peak and read as opacity, and the missing piece is that GoFish has no opacity that varies along one region, so the spec marks it as a gap. The eye row has entry 4's layout gap, and the dots rows have the dot-binning gap of entry 20.",
)

E[2] = dict(
    title='Properties of geom_slabinterval (annotated diagram)',
    gofish="""
const x = dist.normal({ mean: 4, sd: 1 });
chart([{ g: 0 }], { axes: { x: { domain: [-1, 10] } } })
  .mark(
    layer([
      slab(x, {
        fill: "gray75",
        density: { range: [0, 8] },
        stroke: "black",
        strokeWidth: 1,
      }),
      // the definition draws the point in the interval's
      // fill; ggdist draws it gray75 with a black outline
      interval(x, {
        levels: [0.6827],
        fill: "black",
        h: 3,
      }),
    ])
  )
  // the red annotations: brackets, reference lines, labels
  // and curved arrows
  .layer(
    chart(annotations).mark(
      text({
        x: "x",
        y: "y",
        text: "label",
        fill: "#d95f02",
      })
    )
  )
  .layer(chart(arrows).mark(arrow({ fill: "#d95f02" })));
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="The halfeye is the slab and interval marks of section 1. The annotation layer needs bracket-ended segments (arrowheads at 90 degrees) placed in data coordinates, which GoFish's arrow mark does not offer.",
)

E[3] = dict(
    title='stat_halfeye() (or stat_slabinterval())',
    gofish="""
chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(layer([slab("value"), interval("value")]));
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note="A half-eye is a layer of the slab and interval marks of section 1. The slab draws the density curve of each group's rows, which ggdist estimates with a kernel. The interval draws the central intervals of the rows as rects by center and size, and a circle at the median. Version 1 computed the distribution by hand in its derives.",
)

E[4] = dict(
    title='stat_slabinterval() with side = left, both, right (vertical)',
    gofish="""
spread({ dir: "x", spacing: 16 }, [
  // side start
  chart(df)
    .flow(spread({ by: "group", dir: "x" }))
    .mark(
      layer([
        slab("value", { dir: "y", side: "start" }),
        // gap: this should sit on the slab's zero line, but
        // a layer aligns its children's boxes, not their
        // origins
        interval("value", { dir: "y" }),
      ])
    ),
  // side both
  chart(df)
    .flow(spread({ by: "group", dir: "x" }))
    .mark(
      layer([
        slab("value", { dir: "y", side: "both" }),
        // gap: this should sit on the slab's zero line, but
        // a layer aligns its children's boxes, not their
        // origins
        interval("value", { dir: "y" }),
      ])
    ),
  // side end
  chart(df)
    .flow(spread({ by: "group", dir: "x" }))
    .mark(
      layer([
        slab("value", { dir: "y" }),
        interval("value", { dir: "y" }),
      ])
    ),
]);
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="Side start and both need the interval to sit on the slab's zero line, but a GoFish layer aligns its children's boxes, not their origins (elaborations.md, design question 'The line the slab sits on'). Side end works because its origin is its box edge.",
)

E[5] = dict(
    title='stat_slabinterval() with side = bottom, both, top (horizontal)',
    gofish="""
spread({ dir: "x", spacing: 16 }, [
  // side start
  chart(df)
    .flow(spread({ by: "group", dir: "y" }))
    .mark(
      layer([
        slab("value", { side: "start" }),
        // gap: this should sit on the slab's zero line, but
        // a layer aligns its children's boxes, not their
        // origins
        interval("value"),
      ])
    ),
  // side both
  chart(df)
    .flow(spread({ by: "group", dir: "y" }))
    .mark(
      layer([
        slab("value", { side: "both" }),
        // gap: this should sit on the slab's zero line, but
        // a layer aligns its children's boxes, not their
        // origins
        interval("value"),
      ])
    ),
  // side end
  chart(df)
    .flow(spread({ by: "group", dir: "y" }))
    .mark(layer([slab("value"), interval("value")])),
]);
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='The horizontal version of entry 4, with the same layout gap for side start and both.',
)

E[6] = dict(
    title="stat_eye(position = 'dodge')",
    gofish="""
chart(df)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      slab("value", {
        dir: "y",
        side: "both",
        fill: "subgroup",
      }),
      // gap: this should sit on the slab's zero line, but a
      // layer aligns its children's boxes, not their
      // origins
      interval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="Dodge is a nested spread. The eye is side both, so it has entry 4's gap: the interval must sit on the slab's center line.",
)

E[7] = dict(
    title="stat_eye(position = 'dodge') with aes(ydist = dist_normal(mean, sd))",
    gofish="""
const y = dist.normal({ mean: "mean", sd: "sd" });
chart(distDf)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      slab(y, { dir: "y", side: "both", fill: "subgroup" }),
      // gap: this should sit on the slab's zero line, but a
      // layer aligns its children's boxes, not their
      // origins
      interval(y, { dir: "y" }),
    ])
  );
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='Entry 6 with analytic normals. Same layout gap for the eye.',
)

E[8] = dict(
    title='stat_halfeye() of Beta(alpha, 10), y = alpha (continuous)',
    gofish="""
const x = dist.beta({ alpha: "alpha", beta: 10 });
chart(betas)
  .flow(scatter({ by: "alpha", y: "alpha" }))
  .mark(layer({ h: 24 }, [slab(x), interval(x)]));
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note='The halfeyes sit at a continuous y position, which scatter gives. It assumes the dist namespace has a beta family and takes a literal parameter.',
)

E[9] = dict(
    title='stat_slab() of ten Beta distributions overplotted, color = alpha',
    gofish="""
const x = dist.beta({ alpha: "alpha", beta: 10 });
chart(betas, { color: Color.gradient("viridis") })
  .flow(group({ by: "alpha" }))
  .mark(slab(x, { fill: "none", stroke: "alpha" }));
""",
    uses_up='the density curve of the draws per cell (exact on a Dist; a kernel estimate over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note="Overplotted slabs on one baseline share the size scale, which is ggdist's default normalize = 'all'.",
)

E[10] = dict(
    title='stat_halfeye() of brms priors with parse_dist() and a density subguide',
    gofish="""
// priors: one row per prior, with a Dist built from its
// text, e.g. normal(1, 0.5), gamma(2, 2), and normal(0, 1)
// truncated at 0
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(layer([slab("dist"), interval("dist")]));
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='The slabs fit if a column may hold Dist values of different families (foldDist accepts that). Missing: the subguide, a small density axis drawn inside each slab, and a truncated Dist for the half-normal prior.',
)

E[11] = dict(
    title='prior (slab) + posterior (halfeye), separate vs shared thickness scale',
    gofish="""
const post = dist.normal({ mean: 0.1, sd: 0.5 });
const prior = dist.normal({ mean: 0, sd: 1 });
// separate: each slab divided by its own peak (ggdist default)
const separate = chart([{}]).mark(
  layer([
    // the posterior slab, divided by its peak
    slab(post, { density: { normalize: "peak" } }),
    interval(post),
    // the prior slab, divided by its peak
    slab(prior, {
      fill: "none",
      density: { normalize: "peak" },
      stroke: "red",
    }),
  ])
);
// shared: one size scale for both (scale_thickness_shared)
const shared = chart([{}]).mark(
  layer([
    slab(post),
    interval(post),
    // the prior slab
    slab(prior, { fill: "none", stroke: "#e41a1c" }),
  ])
);
spread({ dir: "x", spacing: 16 }, [separate, shared]);
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note='GoFish\'s default is ggdist\'s scale_thickness_shared, because both slabs read one size scale. The separate version divides each density curve by its own peak with the slab\'s density option, which is normalize: "group" in elaborations.md.',
)

E[12] = dict(
    title='stat_halfeye() of a lognormal on scale_x_log10()',
    gofish="""
const x = dist.lognormal({
  meanlog: Math.log(10),
  sdlog: 2 * Math.log(10),
});
chart([{}], { axes: { x: { scale: "log" } } }) // no log axis today
  .mark(layer([slab(x), interval(x)]));
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='GoFish has no log scale. ggdist draws the density of log10(X), so the density curve would also need to know the axis transform. The quantiles would not, since quantiles move with a monotone transform.',
)

E[13] = dict(
    title='stat_histinterval(), vertical and horizontal',
    gofish="""
// the histogram of each group's rows, as bars
const vertical = chart(df)
  .flow(spread({ by: "group", dir: "x" }))
  .mark(
    layer([
      chart()
        .flow(
          partition({
            by: field("value").bin(Bin.thresholds(20)),
            dir: "y",
          })
        )
        .mark(
          rect({ w: field("value").count(), fill: SLAB })
        ),
      interval("value", { dir: "y" }),
    ])
  );
const horizontal = chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(
    layer([
      chart()
        .flow(
          partition({
            by: field("value").bin(Bin.thresholds(20)),
            dir: "x",
          })
        )
        .mark(
          rect({ h: field("value").count(), fill: SLAB })
        ),
      interval("value"),
    ])
  );
spread({ dir: "x", spacing: 16 }, [vertical, horizontal]);
""",
    uses_up='partition by a bin of the value and count over the rows (finite n); the interval is quantiles and the median of the draws',
    fit='fits',
    verdict='ok',
    note="A histogram per group of rows, which is the bin-and-count form of the dotplot row at finite n. GoFish's bins are the same for every group (cells over the column's domain), while ggdist picks breaks per group; both are histograms.",
)

E[14] = dict(
    title='stat_histinterval(outline_bars = FALSE / TRUE)',
    gofish="""
// outline_bars = FALSE: one stepped outline over the bar tops
const separate = chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(
    layer([
      chart()
        .flow(
          partition({
            by: field("value").bin(Bin.thresholds(20)),
            dir: "x",
          })
        )
        .mark(
          rect({
            h: field("value").count(),
            fill: SLAB,
            stroke: "none",
          })
        )
        .layer(
          line({ curve: Curve.step(), stroke: "gray45" })
        ),
      interval("value"),
    ])
  );
// outline_bars = TRUE: every bar outlined
const outlined = chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(
    layer([
      chart()
        .flow(
          partition({
            by: field("value").bin(Bin.thresholds(20)),
            dir: "x",
          })
        )
        .mark(
          rect({
            h: field("value").count(),
            fill: SLAB,
            stroke: "gray45",
          })
        ),
      interval("value"),
    ])
  );
spread({ dir: "x", spacing: 16 }, [separate, outlined]);
""",
    uses_up='partition by a bin of the value and count over the rows; the interval is quantiles and the median of the draws',
    fit='fits',
    verdict='ok',
    note='Outlining every bar is a rect stroke; the outline of the whole histogram is a stepped line through the bar tops.',
)

E[15] = dict(
    title='stat_slab() of Poisson distributions, fill = after_stat(pdf), with a line through lambda',
    gofish="""
const y = dist.poisson({ lambda: "lambda" });
layer([
  chart(sample(pois, { n: Infinity }), {
    color: Color.gradient(["#132b43", "#56b1f7"]),
  })
    .flow(
      spread({ by: "group", dir: "x" }),
      partition({ by: y.bin(Bin.step(1)), dir: "y" })
    )
    .mark(
      rect({ w: y.probability(), fill: y.probability() })
    ),
  chart(pois)
    .flow(spread({ by: "group", dir: "x" }))
    .mark(circle({ cy: "lambda", r: 3 }))
    .layer(line({ strokeWidth: 1 })),
]);
""",
    uses_up='partition by a bin of the drawn value, then the probability of each bin in each bin, n = Infinity',
    fit='fits',
    verdict='ok',
    note='A discrete slab is one bar per integer whose width is the pmf. At n = Infinity, partition groups the draws into bins and the probability of each bin uses them up, which rule 3.1 allows. Version 1 had no summary for this and needed a grid derive. The line joins plain lambda values, not draws.',
)

E[16] = dict(
    title="stat_ccdfinterval(position = 'dodge') on sample rows",
    gofish="""
// df's rows are the draws. On a sample, the cdf column of
// the curve is the sample's ECDF, so the thickness is the
// share of rows above v.
chart(df)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      // the bar starts at the axis's lower limit, 1.5, as
      // ggdist's does
      ccdf("value", {
        dir: "y",
        fill: "subgroup",
        density: { range: [1.5] },
      }),
      interval("value", { dir: "y" }),
    ])
  );
""",
    uses_up="summaries per cell: the sample's ECDF as thickness (ccdf), and quantiles and the median of the rows",
    fit='fits',
    verdict='ok',
    note="The ccdf mark of section 1: a slab whose thickness is 1 - cdf, the share of the cell's rows above v. The rows are a sample, so the cdf is the sample's ECDF, read off the curve's grid. The bar starts at the axis's lower limit (1.5), as ggdist's does, through the curve's range. The sorted dodged bars of version 1 tend to this picture as the sample grows, but at 1000 rows ggdist draws the CCDF, not the bars. No draw column is needed, since nothing places single draws.",
)

E[17] = dict(
    title="stat_ccdfinterval(position = 'dodge', justification = 1) with y from 0",
    gofish="""
// df's rows are the draws. On a sample, the cdf column of
// the curve is the sample's ECDF, so the thickness is the
// share of rows above v.
chart(df)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      // the axis starts at 0, so the bar does too
      ccdf("value", {
        dir: "y",
        fill: "subgroup",
        density: { range: [0] },
      }),
      interval("value", { dir: "y" }),
    ])
  );
""",
    uses_up="summaries per cell: the sample's ECDF as thickness (ccdf), and quantiles and the median of the rows",
    fit='fits',
    verdict='ok',
    note="As entry 16, with the axis and the bar from 0. justification = 1 puts the interval at the bar's left edge, which is the layer's alignment of the interval child.",
)

E[18] = dict(
    title="stat_gradientinterval(position = 'dodge')",
    gofish="""
chart(df)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      gradientinterval("value", {
        dir: "y",
        fill: "subgroup",
      }),
      interval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='the density curve of the draws per cell, divided by its peak and read as opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note='ggdist sets opacity from the density, rescaled so the densest point is opaque. Version 1 tried a blend and failed: a blend gives the chance of covering a pixel, which has no peak scaling. Version 2 says it is not a picture of draws at all. It is the density curve of the draws, divided by its peak in the derive, read by an ordinary opacity channel. GoFish has no opacity that varies along one region, so the spec marks it as a gap.',
)

E[19] = dict(
    title="stat_gradientinterval(position = 'dodge', fill_type = 'gradient')",
    gofish="""
chart(df)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      gradientinterval("value", {
        dir: "y",
        fill: "subgroup",
      }),
      interval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='the density curve of the draws per cell, divided by its peak and read as opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note='Entry 18 drawn with a true gradient fill instead of segments. Same spec and the same gap.',
)

E[20] = dict(
    title='stat_dots() dodged, fill and color = subgroup',
    gofish="""
chart(df)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" }),
    partition({
      by: field("value").bin(Bin.step(0.15)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "y",
    }),
    stack({ dir: "x" })
  )
  .mark(
    circle({ r: 1, fill: "subgroup", stroke: "subgroup" })
  );
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='The dotplot row of the table at finite n, with the rows as draws. GoFish has Bin.step, partition and stack, but not dot-density (Wilkinson) binning or a bin width chosen from the axis scale so the dots touch and the tallest stack fits; the author must match the bin width and r by hand.',
)

E[21] = dict(
    title='stat_dots(quantiles = 50) dodged',
    gofish="""
// stat_dots(quantiles = 50) of a sample: keep every 20th of
// each cell's 1000 ranks
chart(withDraw(df), {
  schema: { value: { draws: "draw" } },
})
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" }),
    filter(
      (d) => Math.round(d.level * 1000 + 0.5) % 20 === 10
    ),
    partition({
      by: field("value").bin(Bin.step(0.3)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "y",
    }),
    stack({ dir: "x" })
  )
  .mark(circle({ r: 3, fill: "subgroup" }));
""",
    uses_up="a filter on level keeps 50 of each cell's 1000 rows, then partition by a bin and stack (finite n)",
    fit='gofish-gap',
    verdict='ok',
    note='ggdist takes 50 quantiles of each group\'s 1000 rows. at: "quantiles" applies to a Dist cell, not to a sample, so version 2 has no step that thins a sample to n quantiles. The spec keeps every 20th rank with a filter on level, which is exact for 1000 rows but has to know the row count. It also has entry 16\'s caveats about the draw key. GoFish has Bin.step, partition and stack, but not dot-density (Wilkinson) binning or a bin width chosen from the axis scale so the dots touch and the tallest stack fits; the author must match the bin width and r by hand.',
)

E[22] = dict(
    title='stat_ccdfinterval(thickness = 1), aes(slab_alpha = after_stat(f))',
    gofish="""
// df has no draw column; withDraw adds a row index, and the
// schema declares it
chart(withDraw(df), {
  schema: { value: { draws: "draw" } },
})
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      chart()
        .flow(group({ by: "draw", blend: "mean" }))
        .mark(rect({ h: "value", fill: "subgroup" })),
      interval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='group({ by: "draw", blend: "mean" }) over the 1000 rows of each cell',
    fit='fits',
    verdict='ok',
    note="Full-width bars from 0 to each draw, averaged, have opacity P(Y > y) at height y, which is the CCDF fade of the table. It matches ggdist because the CCDF already runs from 0 to 1, so ggdist's alpha rescaling changes nothing. The same chart is also a summary: opacity 1 - cdf along the bar, from the CDF of the draws. Entry 16's caveats about the draw key apply.",
)

E[23] = dict(
    title='stat_halfeye(aes(fill = after_stat(abs(x) < 1.5))) for Normal and Student t',
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      slab("dist", { fill: "gray85" }),
      // the same curve cut to |x| < 1.5, drawn on top
      slab("dist", {
        fill: "skyblue",
        curve: (c) => c.filter((r) => Math.abs(r.v) < 1.5),
      }),
      interval("dist"),
    ])
  );
""",
    uses_up='density curves of the draws per cell, the second cut to |x| < 1.5; quantiles and the median of the draws for the interval',
    fit='fits',
    verdict='ok',
    note="Coloring a slab by a predicate on x is a second slab whose curve is filtered to the region, drawn on top; both read one size scale so they line up. A partition intersected with the slab, as in the proposal's quantile-ribbon example, would also work.",
)

E[24] = dict(
    title="stat_eye(fill_type = 'gradient'), slab_alpha = f, fill = x > 1",
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      // fill = x > 1: two eyes cut at 1
      // an eye cut to x <= 1, divided by its peak; gap: an
      // opacity that varies along one region
      slab("dist", {
        side: "both",
        fill: "gray75",
        density: { normalize: "peak" },
        curve: (c) =>
          c
            .filter((r) => r.v <= 1)
            .map((r) => ({ ...r, alpha: r.density })),
        opacity: "alpha",
      }),
      // an eye cut to x > 1, divided by its peak; gap: an
      // opacity that varies along one region
      slab("dist", {
        side: "both",
        fill: "skyblue",
        density: { normalize: "peak" },
        curve: (c) =>
          c
            .filter((r) => r.v > 1)
            .map((r) => ({ ...r, alpha: r.density })),
        opacity: "alpha",
      }),
      // gap: this should sit on the slab's zero line, but a
      // layer aligns its children's boxes, not their
      // origins
      interval("dist"),
    ])
  );
""",
    uses_up='the density curve of the draws per cell, divided by its peak and read as opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note="An eye whose opacity is the density divided by its peak. Coloring by x > 1 is two eyes whose curves are filtered at 1, as in entry 23, so the predicate needs no channel. Missing: GoFish has no opacity that varies along one region, so the spec marks it as a gap, and the eye has entry 4's layout gap.",
)

E[25] = dict(
    title='stat_gradientinterval with slab_alpha = -pmax(abs(1 - 2*cdf), .95) (Correll and Gleicher)',
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      // Correll and Gleicher: opacity 1 over the central
      // 95%, fading to 0 in the tails
      // gap: an opacity that varies along one region
      slab("dist", {
        curve: (c) =>
          c.map((r) => ({
            ...r,
            density: 1,
            alpha:
              (1 -
                Math.max(Math.abs(1 - 2 * r.cdf), 0.95)) /
              0.05,
          })),
        opacity: "alpha",
      }),
      interval("dist"),
    ])
  );
""",
    uses_up='the CDF of the draws per cell, turned into opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note="The opacity is a function of the CDF that no blend makes, because a blend is linear in the distribution. Version 1 stopped there. In version 2 the CDF is a column of the density curve's rows, the function is ordinary arithmetic on it, and opacity reads the result. Dividing by 0.05 puts the plateau at 1, as ggdist's alpha scale does (ggdist keeps a floor of 0.1). GoFish has no opacity that varies along one region, so the spec marks it as a gap.",
)

E[26] = dict(
    title="stat_eye(fill_type = 'gradient') with slab_alpha = -pmax(abs(1 - 2*cdf), .95) (Helske et al.)",
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      // an eye with the fade of entry 25 as its opacity
      // gap: an opacity that varies along one region
      slab("dist", {
        side: "both",
        curve: (c) =>
          c.map((r) => ({
            ...r,
            alpha:
              (1 -
                Math.max(Math.abs(1 - 2 * r.cdf), 0.95)) /
              0.05,
          })),
        opacity: "alpha",
      }),
      // gap: this should sit on the slab's zero line, but a
      // layer aligns its children's boxes, not their
      // origins
      interval("dist"),
    ])
  );
""",
    uses_up='the density curve of the draws for the shape and their CDF for the opacity, per cell',
    fit='gofish-gap',
    verdict='ok',
    note="Entry 25's fade on an eye. Missing: GoFish has no opacity that varies along one region, so the spec marks it as a gap, and the eye has entry 4's layout gap.",
)

E[27] = dict(
    title="Tukey pencils: stat_slab(side = 'both'), thickness and fill_ramp = pmax(0, abs(1 - 2*cdf) - .95)",
    gofish="""
const y = dist.normal({ mean: "mean", sd: "sd" });
chart(distDf)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      // Tukey pencils: thickness max(0, |1 - 2 cdf| -
      // 0.95), on both sides. gap: fill_ramp by the same
      // curve
      slab(y, {
        dir: "y",
        side: "both",
        fill: "subgroup",
        curve: (c) =>
          c.map((r) => ({
            ...r,
            density: Math.max(
              0,
              Math.abs(1 - 2 * r.cdf) - 0.95
            ),
          })),
      }),
    ])
  );
""",
    uses_up='the CDF of the draws per cell, turned into thickness',
    fit='gofish-gap',
    verdict='ok',
    note='The thickness is arithmetic on the CDF column of the density curve, and side both with no interval has no alignment problem. Missing: fill_ramp, the fill lightening along the slab, which needs a fill that varies along one ribbon.',
)

E[28] = dict(
    title='stat_halfeye(aes(fill = after_stat(level)))',
    gofish="""
chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(
    layer([
      // the whole curve
      slab("value", { fill: "gray85" }),
      // the curve cut to the central 95% interval
      slab("value", {
        fill: "#c6dbef",
        curve: (c) =>
          c.filter(
            (r) => Math.abs(r.cdf - 0.5) <= 0.95 / 2
          ),
      }),
      // the curve cut to the central 66% interval
      slab("value", {
        fill: "#6baed6",
        curve: (c) =>
          c.filter(
            (r) => Math.abs(r.cdf - 0.5) <= 0.66 / 2
          ),
      }),
      interval("value"),
    ])
  );
""",
    uses_up='density curves of the draws per cell, cut to the central 95% and 66% by quantiles of the draws and drawn nested; quantiles and the median of the draws for the interval',
    fit='fits',
    verdict='ok',
    note="Each level is the density curve filtered to the central interval, where |cdf - 0.5| <= p / 2, drawn widest first. The cut falls on the curve's grid points, so its ends are as fine as the grid. Bin.quantiles cannot do it, because GoFish computes quantile cells over the whole column, not per group.",
)

E[29] = dict(
    title='stat_slab(aes(fill = after_stat(level)), .width = c(.66, .95, 1)) + stat_pointinterval()',
    gofish="""
chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(
    layer([
      // the whole curve
      slab("value", { fill: "#deebf7" }),
      // the curve cut to the central 95% interval
      slab("value", {
        fill: "#9ecae1",
        curve: (c) =>
          c.filter(
            (r) => Math.abs(r.cdf - 0.5) <= 0.95 / 2
          ),
      }),
      // the curve cut to the central 66% interval
      slab("value", {
        fill: "#3182bd",
        curve: (c) =>
          c.filter(
            (r) => Math.abs(r.cdf - 0.5) <= 0.66 / 2
          ),
      }),
      interval("value"),
    ])
  );
""",
    uses_up='density curves of the draws per cell, cut to the central 95% and 66% by quantiles of the draws and drawn nested; quantiles and the median of the draws for the interval',
    fit='fits',
    verdict='ok',
    note='Entry 28 with a 100% level in place of the gray remainder.',
)

E[30] = dict(
    title='stat_halfeye fill = level: median_qi vs mode_hdci, Beta(10, 2)',
    gofish="""
const x = dist.beta({ alpha: 10, beta: 2 });
// median_qi
const qi = chart([{}]).mark(
  layer([
    // the whole curve
    slab(x, { fill: "gray95" }),
    // the curve cut to the central 95% interval
    slab(x, {
      fill: "#deebf7",
      curve: (c) =>
        c.filter((r) => Math.abs(r.cdf - 0.5) <= 0.95 / 2),
    }),
    // the curve cut to the central 80% interval
    slab(x, {
      fill: "#9ecae1",
      curve: (c) =>
        c.filter((r) => Math.abs(r.cdf - 0.5) <= 0.8 / 2),
    }),
    // the curve cut to the central 50% interval
    slab(x, {
      fill: "#3182bd",
      curve: (c) =>
        c.filter((r) => Math.abs(r.cdf - 0.5) <= 0.5 / 2),
    }),
    interval(x, { levels: [0.95, 0.8, 0.5] }),
  ])
);
// mode_hdci
const hdci = chart([{}]).mark(
  layer([
    // gap: the mode and the highest-density interval,
    // written as the helper they would most likely be
    // the whole curve
    slab(x, { fill: "gray95" }),
    // the curve cut to the 95% highest-density interval
    slab(x, {
      fill: "#deebf7",
      curve: (c, rows) => {
        const [hdi] = highestDensityIntervals(rows, x, [
          0.95,
        ]);
        return c.filter(
          (r) => Math.abs(r.v - hdi.center) <= hdi.size / 2
        );
      },
    }),
    // the curve cut to the 80% highest-density interval
    slab(x, {
      fill: "#9ecae1",
      curve: (c, rows) => {
        const [hdi] = highestDensityIntervals(rows, x, [
          0.8,
        ]);
        return c.filter(
          (r) => Math.abs(r.v - hdi.center) <= hdi.size / 2
        );
      },
    }),
    // the curve cut to the 50% highest-density interval
    slab(x, {
      fill: "#3182bd",
      curve: (c, rows) => {
        const [hdi] = highestDensityIntervals(rows, x, [
          0.5,
        ]);
        return c.filter(
          (r) => Math.abs(r.v - hdi.center) <= hdi.size / 2
        );
      },
    }),
    interval(x, {
      levels: [0.95, 0.8, 0.5],
      intervals: highestDensityIntervals,
      point: "mode",
    }),
  ])
);
spread({ dir: "y", spacing: 16 }, [qi, hdci]);
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="The quantile-interval panel fits. The second panel needs the mode and the highest-density continuous interval. Neither is in version 2's list of summaries, so the spec writes them as the helper they would most likely be. They are general summaries, not special to draws, so this is a GoFish gap; on draws an HDI is the shortest window of levels.",
)

E[31] = dict(
    title='stat_slab + stat_spike at median and qi vs mode and hdi',
    gofish="""
const x = dist.beta({ alpha: 10, beta: 2 });
// a spike: a 1 px rect from 0 to the density at a point, so
// it shares the slab's size scale
// median and qi
const qi = chart([{}]).mark(
  layer([
    // the whole curve
    slab(x, { fill: "#deebf7" }),
    // the curve cut to the central 95% interval
    slab(x, {
      fill: "#9ecae1",
      curve: (c) =>
        c.filter((r) => Math.abs(r.cdf - 0.5) <= 0.95 / 2),
    }),
    // the curve cut to the central 50% interval
    slab(x, {
      fill: "#3182bd",
      curve: (c) =>
        c.filter((r) => Math.abs(r.cdf - 0.5) <= 0.5 / 2),
    }),
    // spikes; linetype by kind: no field mapping
    rect({ x: x.median(), w: 1, h: x.density(x.median()) }),
    rect({
      x: x.quantile(0.025),
      w: 1,
      h: x.density(x.quantile(0.025)),
    }),
    rect({
      x: x.quantile(0.975),
      w: 1,
      h: x.density(x.quantile(0.975)),
    }),
  ])
);
// mode and hdi
const hdi = chart([{}]).mark(
  layer([
    // gap: the mode and the highest-density interval,
    // written as the helper they would most likely be
    // the whole curve
    slab(x, { fill: "#deebf7" }),
    // the curve cut to the 95% highest-density interval
    slab(x, {
      fill: "#9ecae1",
      curve: (c, rows) => {
        const [hdi] = highestDensityIntervals(rows, x, [
          0.95,
        ]);
        return c.filter(
          (r) => Math.abs(r.v - hdi.center) <= hdi.size / 2
        );
      },
    }),
    // the curve cut to the 50% highest-density interval
    slab(x, {
      fill: "#3182bd",
      curve: (c, rows) => {
        const [hdi] = highestDensityIntervals(rows, x, [
          0.5,
        ]);
        return c.filter(
          (r) => Math.abs(r.v - hdi.center) <= hdi.size / 2
        );
      },
    }),
    // spikes at the mode and the ends of the 95% hdi
    rect({ x: x.mode(), w: 1, h: x.density(x.mode()) }),
    rect({
      x: x.hdi(0.95)[0],
      w: 1,
      h: x.density(x.hdi(0.95)[0]),
    }),
    rect({
      x: x.hdi(0.95)[1],
      w: 1,
      h: x.density(x.hdi(0.95)[1]),
    }),
  ])
);
spread({ dir: "y", spacing: 16 }, [qi, hdi]);
""",
    uses_up='the density curve, the median and quantiles of the draws per cell',
    fit='gofish-gap',
    verdict='ok',
    note="A spike is a 1 px rect from 0 to the density at a point, so it shares the slab's size scale. Missing: the mode and HDI summaries (entry 30), and linetype mapped from a field (strokeDasharray is a literal).",
)

E[32] = dict(
    title="stat_halfeye(position = 'dodgejust'), fill = subgroup, fill_ramp = level",
    gofish="""
chart(df)
  .flow(
    spread({ by: "group", dir: "y" }),
    spread({ by: "subgroup", dir: "y" })
  )
  .mark(
    layer([
      // gap: fill_ramp, the subgroup's color lightened by level
      // the curve cut to the central 95% interval
      slab("value", {
        fill: "subgroup",
        curve: (c) =>
          c.filter(
            (r) => Math.abs(r.cdf - 0.5) <= 0.95 / 2
          ),
      }),
      // the curve cut to the central 80% interval
      slab("value", {
        fill: "subgroup",
        curve: (c) =>
          c.filter((r) => Math.abs(r.cdf - 0.5) <= 0.8 / 2),
      }),
      // the curve cut to the central 50% interval
      slab("value", {
        fill: "subgroup",
        curve: (c) =>
          c.filter((r) => Math.abs(r.cdf - 0.5) <= 0.5 / 2),
      }),
      interval("value"),
    ])
  );
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='The geometry fits as nested slabs. Missing: fill_ramp, a color scale on subgroup lightened by a second field (level); Color.mix exists but no scale combines two fields.',
)

E[33] = dict(
    title="stat_interval(aes(color = subgroup, color_ramp = after_stat(level)), position = 'dodge')",
    gofish="""
const y = dist.normal({ mean: "mean", sd: "sd" });
chart(distDf)
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" })
  )
  .mark(
    layer([
      // gap: color_ramp, the subgroup's color lightened by
      // level
      interval(y, {
        levels: [0.95, 0.8, 0.5],
        dir: "y",
        point: false,
        fill: "subgroup",
        w: 4,
      }),
    ])
  );
""",
    uses_up='quantiles and the median of the draws per cell',
    fit='gofish-gap',
    verdict='ok',
    note='Nested intervals are central intervals of the draws. Missing: color_ramp, the subgroup color lightened by level (as in entry 32).',
)

E[34] = dict(
    title='Raindrop: stat_eye with thickness = log(pdf) inside the 95% and 99% intervals',
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      // raindrop: log(pdf) inside the 99% interval
      slab("dist", {
        side: "both",
        fill: "gray85",
        curve: (c) => {
          const k = c
            .filter(
              (r) => Math.abs(r.cdf - 0.5) <= 0.99 / 2
            )
            .map((r) => ({
              ...r,
              density: Math.log(r.density),
            }));
          const lo = Math.min(...k.map((r) => r.density));
          const hi = Math.max(...k.map((r) => r.density));
          return k.map((r) => ({
            ...r,
            density: (r.density - lo) / (hi - lo),
          }));
        },
      }),
      // and inside the 95% interval
      slab("dist", {
        side: "both",
        curve: (c) => {
          const k = c
            .filter(
              (r) => Math.abs(r.cdf - 0.5) <= 0.95 / 2
            )
            .map((r) => ({
              ...r,
              density: Math.log(r.density),
            }));
          const lo = Math.min(...k.map((r) => r.density));
          const hi = Math.max(...k.map((r) => r.density));
          return k.map((r) => ({
            ...r,
            density: (r.density - lo) / (hi - lo),
          }));
        },
      }),
      // gap: this should sit on the slab's zero line, but a
      // layer aligns its children's boxes, not their
      // origins
      interval("dist"),
    ])
  );
""",
    uses_up='the density curve of the draws per cell, turned into thickness log(pdf) and cut to an interval by quantiles of the draws',
    fit='gofish-gap',
    verdict='ok',
    note="Any function of the density is arithmetic on the density curve's rows. log(pdf) shifted so the interval's edges are at 0 and its peak at 1 is what normalize = 'groups' does. The eye shape has entry 4's gap.",
)

E[35] = dict(
    title="Ridgeline: stat_slab(height = 2, color = 'black')",
    gofish="""
chart(ridgesDf)
  .flow(
    spread({
      by: "group",
      dir: "y",
      anchor: "baseline",
      spacing: 24,
    })
  )
  .mark(layer({ h: 60 }, [slab("x", { stroke: "black" })]));
""",
    uses_up='the density curve of the draws per cell (exact on a Dist; a kernel estimate over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note="Overlapping ridges are a baseline spread with a fixed pitch and slabs taller than the pitch, as in GoFish's Ridgeline Chart story.",
)

E[36] = dict(
    title='Ridgeline with fill = group, fill_ramp = abs(x), color_ramp = -dnorm(x, 0, 2)',
    gofish="""
chart(ridgesDf, { color: Color.palette("viridis") })
  .flow(
    spread({
      by: "group",
      dir: "y",
      anchor: "baseline",
      spacing: 24,
    })
  )
  .mark(
    layer({ h: 60 }, [
      // expand = TRUE: the curve runs over the x axis's
      // limits, set by hand. gap: fill_ramp and color_ramp
      // along x
      slab("x", {
        fill: "group",
        density: { range: [-6, 14] },
      }),
    ])
  )
  .layer(
    chart([{ x: 0 }]).mark(
      rect({ x: "x", w: 1, strokeDasharray: "4 3" })
    )
  );
""",
    uses_up='the density curve of the draws per cell (exact on a Dist; a kernel estimate over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='The ridges fit. Missing: a fill and an outline color that change along one ribbon (fill_ramp by |x| and color_ramp by a density), which needs a gradient along a mark.',
)

E[37] = dict(
    title='stat_dotsinterval with side = top / both / bottom per row',
    gofish="""
const x = dist.normal({ mean: "mean", sd: "sd" });
const cells = distDf.filter((d) => d.subgroup === "h");
const dots = sample(cells, { n: 100, at: "quantiles" });
spread({ dir: "y", spacing: 20 }, [
  // a
  layer([
    chart(dots.filter((d) => d.group === "a"))
      .flow(
        partition({
          by: x.bin(Bin.step(0.2)), // chosen by hand; ggdist picks the width so the tallest stack fits
          dir: "x",
          alignment: "end",
        }),
        stack({ dir: "y" })
      )
      .mark(circle({ r: 2 })),
    chart(cells.filter((d) => d.group === "a")).mark(
      interval(x)
    ),
  ]),
  // b
  layer([
    chart(dots.filter((d) => d.group === "b"))
      .flow(
        partition({
          by: x.bin(Bin.step(0.2)), // chosen by hand; ggdist picks the width so the tallest stack fits
          dir: "x",
          alignment: "middle",
        }),
        stack({ dir: "y" })
      )
      .mark(circle({ r: 2 })),
    chart(cells.filter((d) => d.group === "b")).mark(
      layer([
        // gap: this should sit on the slab's zero line, but
        // a layer aligns its children's boxes, not their
        // origins
        interval(x),
      ])
    ),
  ]),
  // c
  layer([
    chart(dots.filter((d) => d.group === "c"))
      .flow(
        partition({
          by: x.bin(Bin.step(0.2)), // chosen by hand; ggdist picks the width so the tallest stack fits
          dir: "x",
          alignment: "start",
        }),
        stack({ dir: "y" })
      )
      .mark(circle({ r: 2 })),
    chart(cells.filter((d) => d.group === "c")).mark(
      layer([
        // gap: this should sit on the slab's zero line, but
        // a layer aligns its children's boxes, not their
        // origins
        interval(x),
      ])
    ),
  ]),
]);
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is quantiles and the median of the draws on the Dist',
    fit='gofish-gap',
    verdict='ok',
    note="Quantile dots of a Dist are sample at evenly spaced levels, which version 1 needed a derive for. Side as data (one value per row) is not a channel in GoFish, so each row is its own chart. The both and bottom rows need the interval on the dots' baseline (entry 4's gap), plus the dot-binning gap of entry 20.",
)

E[38] = dict(
    title="stat_slab(side = 'left') + stat_dotsinterval(quantiles = 100) + labels, dodged",
    gofish="""
const value = field("value");
const drawn = withDraw(df);
layer([
  chart(df)
    .flow(
      spread({ by: "group", dir: "x" }),
      spread({ by: "subgroup", dir: "x" })
    )
    .mark(
      layer([
        slab("value", {
          dir: "y",
          side: "start",
          fill: "subgroup",
        }),
        // gap: this should sit on the slab's zero line, but
        // a layer aligns its children's boxes, not their
        // origins
        interval("value", { dir: "y" }),
        text({ y: value.median(), text: "label" }),
      ])
    ),
  // 100 quantile dots of each cell's 1000 rows: every 10th rank
  chart(drawn, { schema: { value: { draws: "draw" } } })
    .flow(
      spread({ by: "group", dir: "x" }),
      spread({ by: "subgroup", dir: "x" }),
      filter(
        (d) => Math.round(d.level * 1000 + 0.5) % 10 === 5
      ),
      partition({
        by: value.bin(Bin.step(0.15)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "y",
      }),
      stack({ dir: "x" })
    )
    .mark(circle({ r: 1.5, fill: "subgroup" })),
]);
""",
    uses_up='slab and label: the density curve and the median of the draws; dots: a filter on level keeps 100 of 1000 rows, then partition and stack',
    fit='gofish-gap',
    verdict='ok',
    note="A left slab and right dots share one center line, which needs the layer to align children by origin (entry 4's gap), plus the dot-binning gap. The label at the median is a text mark at the median of the draws. The dots thin a sample to 100 quantiles with a filter on level, as in entry 21.",
)

E[39] = dict(
    title='stat_slab(alpha = .3) overplotted + stat_pointinterval with position_dodgejust',
    gofish="""
layer([
  chart(df)
    // one slab per group, overplotted
    .flow(group({ by: "group" }))
    .mark(slab("value", { fill: "group", opacity: 0.3 })),
  chart(df)
    .flow(
      spread({
        by: "group",
        dir: "y",
        spacing: 4,
      }).translate({ y: -12 })
    )
    .mark(interval("value", { fill: "group" })),
]);
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="The overlaid slabs fit. The dodged intervals sit just below the shared baseline, which is the raincloud placement elaborations.md could not express (a layer aligns boxes, not the slab's zero line).",
)

E[40] = dict(
    title='Properties of geom_dotsinterval (annotated diagram)',
    gofish="""
const x = dist.normal({ mean: 4, sd: 1.2 });
const cell = [{}];
layer([
  chart(sample(cell, { n: 100, at: "quantiles" }))
    .flow(
      partition({ by: x.bin(Bin.step(0.25)), dir: "x" }), // chosen by hand; ggdist picks the width so the tallest stack fits
      stack({ dir: "y" })
    )
    .mark(
      circle({ r: 3, fill: "gray75", stroke: "gray50" })
    ),
  chart(cell).mark(
    layer([
      // gap: a square point shape
      interval(x, { levels: [0.6827], h: 5 }),
    ])
  ),
])
  .layer(
    chart(annotations).mark(
      text({
        x: "x",
        y: "y",
        text: "label",
        fill: "#d95f02",
      })
    )
  )
  .layer(chart(arrows).mark(arrow({ fill: "#d95f02" })));
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is quantiles and the median of the draws',
    fit='gofish-gap',
    verdict='ok',
    note='Quantile dots plus an interval. Missing: the dot-binning gap of entry 20, bracket-ended annotation segments (entry 2), and a square point shape.',
)

E[41] = dict(
    title='Properties of geom_dots (annotated diagram)',
    gofish="""
const x = dist.normal({ mean: 4, sd: 1.2 });
chart(sample([{}], { n: 100, at: "quantiles" }))
  .flow(
    partition({ by: x.bin(Bin.step(0.25)), dir: "x" }), // chosen by hand; ggdist picks the width so the tallest stack fits
    stack({ dir: "y" })
  )
  .mark(circle({ r: 3, fill: "gray75", stroke: "gray50" }))
  .layer(
    chart(annotations).mark(
      text({
        x: "x",
        y: "y",
        text: "label",
        fill: "#d95f02",
      })
    )
  )
  .layer(chart(arrows).mark(arrow({ fill: "#d95f02" })));
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='As entry 40 without the interval.',
)

E[42] = dict(
    title='Layout parameters for dots geoms (annotated diagram)',
    gofish="""
chart([
  { x: 0.4 },
  { x: 0.7 },
  { x: 0.7 },
  { x: 1 },
  { x: 1 },
  { x: 1 },
])
  .flow(
    partition({
      by: field("x").bin(Bin.step(0.3)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "x",
    }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 15, opacity: 0.5 }))
  .layer(
    chart(annotations).mark(
      text({ x: "x", y: "y", text: "label" })
    )
  )
  .layer(chart(brackets).mark(arrow({})));
""",
    uses_up='six plain values as finite draws: partition by a bin, then stack',
    fit='gofish-gap',
    verdict='ok',
    note='The diagram explains the automatic bin width (0.3, chosen so the tallest stack fits in the height), which GoFish cannot choose, and uses bracket annotations and coord_fixed (equal units on both axes).',
)

E[43] = dict(
    title='Horizontal geom_dots() with side = topright / both / bottomleft',
    gofish="""
const panel = (alignment) =>
  chart(xs)
    .flow(
      partition({
        by: field("x").bin(Bin.step(0.2)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "x",
        alignment,
      }),
      stack({ dir: "y" })
    )
    .mark(circle({ r: 3 }));
spread({ dir: "x", spacing: 12 }, [
  panel("end"),
  panel("middle"),
  panel("start"),
]);
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note="Side is the stack's alignment against the baseline. Missing: the dot-binning gap of entry 20.",
)

E[44] = dict(
    title='Vertical geom_dots() with side = topright / both / bottomleft',
    gofish="""
const panel = (alignment) =>
  chart(xs)
    .flow(
      partition({
        by: field("x").bin(Bin.step(0.2)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "y",
        alignment,
      }),
      stack({ dir: "x" })
    )
    .mark(circle({ r: 3 }));
spread({ dir: "x", spacing: 12 }, [
  panel("end"),
  panel("middle"),
  panel("start"),
]);
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='Entry 43 turned vertical.',
)

E[45] = dict(
    title="geom_dots() layouts bin / hex / weave / swarm with side = 'top'",
    gofish="""
spread({ dir: "y", spacing: 12 }, [
  // bin
  chart(xs)
    .flow(
      partition({
        by: field("x").bin(Bin.step(0.2)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "x",
        alignment: "end",
      }),
      stack({ dir: "y" })
    )
    .mark(circle({ r: 3 })),
  // hex and weave: no GoFish layout
  // swarm
  chart(xs)
    .flow(
      scatter({
        x: "x",
        overlap: Overlap.separate(),
        alignment: "end",
      })
    )
    .mark(circle({ r: 3 })),
]);
""",
    uses_up='the rows as finite draws, each placed by a dot layout',
    fit='gofish-gap',
    verdict='ok',
    note='Missing: the hex and weave dot layouts and dot-density binning; swarm is Overlap.separate, which exists.',
)

E[46] = dict(
    title="geom_dots() layouts bin / hex / weave / swarm with side = 'both'",
    gofish="""
spread({ dir: "y", spacing: 12 }, [
  // bin
  chart(xs)
    .flow(
      partition({
        by: field("x").bin(Bin.step(0.2)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "x",
        alignment: "middle",
      }),
      stack({ dir: "y" })
    )
    .mark(circle({ r: 3 })),
  // hex and weave: no GoFish layout
  // swarm
  chart(xs)
    .flow(scatter({ x: "x", overlap: Overlap.separate() }))
    .mark(circle({ r: 3 })),
]);
""",
    uses_up='the rows as finite draws, each placed by a dot layout',
    fit='gofish-gap',
    verdict='ok',
    note='Missing: the hex and weave dot layouts and dot-density binning; swarm is Overlap.separate, which exists.',
)

E[47] = dict(
    title="geom_dots(side = 'both') per group (binned beeswarm)",
    gofish="""
chart(abcDf)
  .flow(
    spread({ by: "abc", dir: "x" }),
    partition({
      by: field("value").bin(Bin.step(0.25)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "y",
      alignment: "middle",
    }),
    stack({ dir: "x" })
  )
  .mark(circle({ r: 2 }));
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='Missing: the dot-binning gap of entry 20.',
)

E[48] = dict(
    title="geom_dots(side = 'both', layout = 'hex')",
    gofish="""
chart(abcDf)
  .flow(
    spread({ by: "abc", dir: "x" }),
    scatter({ y: "value", overlap: Overlap.separate() })
  ) // nearest: hex has no GoFish layout
  .mark(circle({ r: 2 }));
""",
    uses_up='the rows as finite draws, each placed by a dot layout',
    fit='gofish-gap',
    verdict='ok',
    note='Hex packing (alternate rows offset by half a dot) is not a GoFish layout; Overlap.separate gives a beeswarm instead.',
)

E[49] = dict(
    title='geom_swarm() vs geom_weave()',
    gofish="""
const swarm = chart(swarmData)
  .flow(
    spread({ by: "g", dir: "x" }),
    scatter({ y: "y", overlap: Overlap.separate() })
  )
  .mark(circle({ r: 2, opacity: 0.75 }));
// weave: no GoFish layout
spread({ dir: "x", spacing: 16 }, [swarm /*, weave */]);
""",
    uses_up='the rows as finite draws, each placed by a dot layout',
    fit='gofish-gap',
    verdict='ok',
    note='The swarm panel fits as Overlap.separate. The weave panel (dots at their exact values, stacked in bins) has no GoFish layout.',
)

E[50] = dict(
    title="geom_weave(position = 'dodge'), fill = hi",
    gofish="""
chart(abccDf, { color: Color.palette("Dark2") })
  .flow(
    spread({ by: "abc", dir: "x" }),
    spread({ by: "hi", dir: "x" }),
    scatter({ y: "value", overlap: Overlap.separate() })
  ) // weave has no GoFish layout
  .mark(circle({ r: 2, fill: "hi", opacity: 0.75 }));
""",
    uses_up='the rows as finite draws, each placed by a dot layout',
    fit='gofish-gap',
    verdict='ok',
    note='Dodge is a nested spread; the weave layout is missing.',
)

E[51] = dict(
    title='geom_dots(aes(fill = hi, group = NA)): colors mixed in one stack',
    gofish="""
chart(abccDf)
  .flow(
    spread({ by: "abc", dir: "x" }),
    partition({
      by: field("value").bin(Bin.step(0.25)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "y",
    }),
    stack({ dir: "x" })
  )
  .mark(circle({ r: 2, fill: "hi" }));
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='Stacking rows of two colors in one bin is a stack over all rows of the bin. Missing: the dot-binning gap of entry 20.',
)

E[52] = dict(
    title='geom_dots(aes(fill = hi, group = NA, order = hi))',
    gofish="""
chart(abccDf)
  .flow(
    spread({ by: "abc", dir: "x" }),
    partition({
      by: field("value").bin(Bin.step(0.25)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "y",
    }),
    stack({ by: field("hi").sort(), dir: "x" })
  )
  .mark(circle({ r: 2, fill: "hi" }));
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note="The order within each stack is the stack's sorted key. Missing: the dot-binning gap of entry 20.",
)

E[53] = dict(
    title='geom_dots(aes(shape = abc, color = value))',
    gofish="""
chart(abccDf, {
  color: Color.gradient(["#132b43", "#56b1f7"]),
})
  .flow(
    spread({ by: "abc", dir: "x" }),
    partition({
      by: field("value").bin(Bin.step(0.25)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "y",
    }),
    stack({ dir: "x" })
  )
  .mark(circle({ r: 2, fill: "value" })); // shape by abc: no shape channel
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='Color by value fits. Missing: a point shape mapped from a field, and the dot-binning gap.',
)

E[54] = dict(
    title='geom_dots() on samples of 50, 200, 500, 5000 (facet_wrap)',
    gofish="""
chart(increasingSamples)
  .flow(
    table({ by: { x: "col", y: "row" } }), // facet_wrap(~ n) needs a col/row column per n
    partition({
      by: field("x").bin(Bin.step(0.1)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "x",
    }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 2 }));
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='The point of the chart is that ggdist shrinks the dots so the tallest stack fits each panel; GoFish has no dot size or bin width from the layout. Also, a wrapped facet by one key needs hand-made row and column fields (table takes two keys).',
)

E[55] = dict(
    title="geom_dots(binwidth = unit(c(1, Inf), 'mm')): a minimum bin width",
    gofish="""
chart(increasingSamples)
  .flow(
    table({ by: { x: "col", y: "row" } }), // facet_wrap(~ n) needs a col/row column per n
    partition({
      by: field("x").bin(Bin.step(0.1)), // chosen by hand; ggdist picks the width so the tallest stack fits, with a 1 mm minimum
      dir: "x",
    }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 2 }));
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note="A bin width with a minimum in millimetres lets the stacks overflow the panel. Bin.step is in data units, so a width in screen units needs the scale (entry 54's gap).",
)

E[56] = dict(
    title="geom_dots(binwidth = unit(c(1, Inf), 'mm'), overflow = 'compress')",
    gofish="""
chart(increasingSamples)
  .flow(
    table({ by: { x: "col", y: "row" } }), // facet_wrap(~ n) needs a col/row column per n
    partition({
      by: field("x").bin(Bin.step(0.1)), // chosen by hand; ggdist picks the width so the tallest stack fits, with a 1 mm minimum
      dir: "x",
    }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 2 }));
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note="overflow = 'compress' squeezes the stack spacing so overflowing stacks fit; GoFish's stack has no such option (and no spacing at all).",
)

E[57] = dict(
    title='geom_dots() on a large discrete sample',
    gofish="""
chart(abcdDf)
  .flow(spread({ by: "x", dir: "x" }), stack({ dir: "y" }))
  .mark(circle({ r: 0.6 }));
""",
    uses_up='the rows as finite draws: spread by category, then stack',
    fit='gofish-gap',
    verdict='ok',
    note="A discrete dotplot is a spread by category and a stack. ggdist picks the dot size so 600 dots fit; GoFish needs it by hand (entry 54's gap).",
)

E[58] = dict(
    title="geom_dots(layout = 'bar', aes(fill = g)) on a discrete sample",
    gofish="""
chart(abcdDf)
  .flow(
    spread({ by: "x", dir: "x" }),
    stack({ by: "g", dir: "y" })
  ) // + a grid of dots inside each bar
  .mark(circle({ r: 1, fill: "g" }));
""",
    uses_up='the rows as finite draws: spread by category, then a grid of dots',
    fit='gofish-gap',
    verdict='ok',
    note="The bar layout packs each category's dots into a grid shaped like a bar (rows of several dots). GoFish has no wrapped grid of marks inside a stack.",
)

E[59] = dict(
    title="geom_dots(smooth = smooth_discrete(kernel = 'ep'), side = 'both')",
    gofish="""
chart(abcdDf)
  .flow(
    spread({ by: "x", dir: "x" }),
    scatter({
      x: 0,
      overlap: Overlap.noise({ smoothing: 0.3 }),
    })
  )
  .mark(circle({ r: 0.6 }));
""",
    uses_up='the rows as finite draws, smoothed along the category axis',
    fit='gofish-gap',
    verdict='ok',
    note="smooth_discrete moves each discrete value by a kernel along the data axis, then bins and stacks it, so each category becomes a small density. GoFish's noise moves dots along the free axis, not the data axis, and a discrete position cannot take continuous noise.",
)

E[60] = dict(
    title="stat_dotsinterval(subguide = 'integer') of Normal, Beta and Gamma",
    gofish="""
chart(sample(distDf2, { n: 100, at: "quantiles" }))
  .flow(
    spread({ by: "distName", dir: "y" }),
    partition({
      by: as("dist").bin(Bin.step(0.02)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "x",
    }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 1.5 }))
  .layer(
    chart(distDf2)
      .flow(spread({ by: "distName", dir: "y" }))
      .mark(interval("dist"))
  );
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is quantiles and the median of the draws',
    fit='gofish-gap',
    verdict='ok',
    note='Quantile dots and intervals of three families, from a column of Dist cells. Missing: the dot-binning gap (one bin width cannot suit three different scales) and the integer subguide, a count axis inside each row.',
)

E[61] = dict(
    title="stat_dotsinterval(quantiles = 1000, point_interval = mode_hdci, layout = 'weave'), slab_fill = level",
    gofish="""
chart(sample(distDf2, { n: 1000, at: "quantiles" }), {
  color: Color.palette(["#9ecae1", "#3182bd"]),
})
  .flow(
    spread({ by: "distName", dir: "y" }),
    // the interval a dot falls in, from its level: the hdci
    // needs a helper that does not exist
    derive((rows) =>
      rows.map((r) => ({
        ...r,
        band: Math.abs(r.level - 0.5) < 0.33 ? 0.66 : 0.95,
      }))
    ),
    scatter({ x: "dist", overlap: Overlap.separate() }) // weave: no GoFish layout
  )
  .mark(circle({ r: 0.5, fill: "band" }))
  .layer(
    chart(distDf2)
      .flow(spread({ by: "distName", dir: "y" }))
      .mark(
        layer([
          // gap: the mode and the highest-density interval,
          // written as the helper they would most likely be
          interval("dist", {
            intervals: highestDensityIntervals,
            point: "mode",
          }),
        ])
      )
  );
""",
    uses_up='sample(data, { n: 1000, at: "quantiles" }), then partition by a bin and stack (finite n) by a dot layout; the interval is central intervals of the draws',
    fit='gofish-gap',
    verdict='ok',
    note='Coloring each dot by the interval it falls in reads level, which is exact for an equal-tailed interval. Missing: the weave layout, and the mode and HDCI summaries (entry 30); with an HDCI the band is not a function of level alone.',
)

E[62] = dict(
    title='stat_dotsinterval(slab_shape = 19, quantiles = 500), slab_color = after_stat(x)',
    gofish="""
chart(sample(distDf2, { n: 500, at: "quantiles" }), {
  color: Color.gradient("Blues"),
})
  .flow(
    spread({ by: "distName", dir: "y" }),
    partition({
      by: as("dist").bin(Bin.step(0.01)), // chosen by hand; ggdist picks the width so the tallest stack fits
      dir: "x",
    }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 0.7, fill: "dist" }))
  .layer(
    chart(distDf2)
      .flow(spread({ by: "distName", dir: "y" }))
      .mark(interval("dist"))
  );
""",
    uses_up='sample(data, { n: 500, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is central intervals of the draws',
    fit='gofish-gap',
    verdict='ok',
    note="Color by the dot's value: on a drawn row the Dist column reads the draw. Missing: the dot-binning gap.",
)

E[63] = dict(
    title="stat_dots(layout = 'weave'), fill = after_stat(x < 6), with a reference line",
    gofish="""
const x = dist.normal({ mean: "mean", sd: "sd" });
chart(sample(abDf, { n: 100, at: "quantiles" }))
  .flow(
    spread({ by: "ab", dir: "y" }),
    derive((rows) =>
      rows.map((r) => ({ ...r, flag: r.x < 6 }))
    ), // x < 6 on the drawn value
    scatter({ x, overlap: Overlap.separate() }) // weave: no GoFish layout
  )
  .mark(circle({ r: 2, fill: "flag" }))
  .layer(
    chart([{ x: 6 }]).mark(
      rect({ x: "x", w: 1, opacity: 0.25 })
    )
  );
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n) by a dot layout',
    fit='gofish-gap',
    verdict='ok',
    note='The predicate is a derive on the drawn rows. Missing: the weave layout.',
)

E[64] = dict(
    title="stat_slab(thickness = pdf*n) above + stat_dotsinterval(side = 'bottom') below",
    gofish="""
const value = field("value");
chart(halfeyeDotDf, { color: Color.palette("Set2") })
  .flow(spread({ by: "abc", dir: "y" }))
  .mark(
    layer([
      slab("value", {
        fill: "abc",
        curve: (c, rows) =>
          c.map((r) => ({
            ...r,
            density: r.density * rows.length,
          })),
      }),
      // dots below the line. gap: they should hang from the
      // slab's zero line
      chart()
        .flow(
          partition({
            by: value.bin(Bin.step(0.3)), // chosen by hand; ggdist picks the width so the tallest stack fits
            dir: "x",
            alignment: "start",
          }),
          stack({ dir: "y" })
        )
        .mark(circle({ r: 2, fill: "abc" })),
      interval("value"),
    ])
  );
""",
    uses_up='slab: the density curve and the count of the draws over the rows; dots: partition by a bin and stack over the rows',
    fit='gofish-gap',
    verdict='ok',
    note="Dots hanging below the line need entry 4's origin alignment. Scaling the slab's curve by the row count so it matches the dot stacks needs the slab and the stacks on one count scale, which the hand-set bin width breaks.",
)

E[65] = dict(
    title='stat_mcse_dots(quantiles = 100): Monte Carlo standard error of each quantile as blur',
    gofish="""
// Not writable. The nearest version 2 spelling,
// with two problems marked.
// missing: no constructor makes a Dist<Dist> from a sample
const boot = dist.resampled("x");
// a draw of each sample
const outer = sample(increasingSamples, { n: 200 });
// missing: this second sample also writes draw and level
const inner = sample(outer, { n: 100, at: "quantiles" });
chart(inner)
  .flow(
    table({ by: { x: "col", y: "row" } }),
    // the outer draw key, which the inner one has overwritten
    group({ by: "draw", blend: "mean" }),
    partition({ by: boot.bin(Bin.step(0.1)), dir: "x" }), // chosen by hand; ggdist picks the width so the tallest stack fits
    stack({ dir: "y" })
  )
  .mark(circle({ r: 2 }));
""",
    uses_up='(would be) the outer draws, blended, over the inner quantile dots',
    fit='does-not-fit',
    verdict='ok',
    note="ggdist blurs each dot sideways by its quantile's Monte Carlo standard error, after binning. That is the blur channel the limits tab rules out (the Figure 14b cliff), so ggdist's own picture has no draw spelling. Section 4 says the honest version needs a Dist<Dist> made from a sample by resampling, a constructor and not a step. The catalog finds two missing pieces. Version 2 names no such constructor. And two levels of draws need two draw keys, but sample always writes columns named draw and level, so the inner sample overwrites the outer one. Its picture would also fade dots across stacks rather than smear them.",
)

E[66] = dict(
    title="stat_mcse_dots(quantiles = 100, blur = 'interval')",
    gofish="""
// Not writable, for the reasons of entry 65.
// With two named draw keys it would be: per inner
// level, the 95% interval of the dot's value across
// the outer draws (quantiles per level), drawn
// as a rect through each dot.
""",
    uses_up='(would be) quantiles across the outer draws, per inner level',
    fit='does-not-fit',
    verdict='ok',
    note="Each dot's interval is the uncertainty of the quantile estimate, an outer level over the sample. In the draw model it is a pair of quantiles across the outer draws, grouped by the inner level. That needs the Dist<Dist> constructor and two draw keys, which entry 65 shows version 2 does not have.",
)

E[67] = dict(
    title='geom_dots(scale = 0.5), aes(side = Species) + scale_side_mirrored()',
    gofish="""
layer([
  chart(irisV.filter((d) => d.Species === "versicolor"))
    .flow(
      partition({
        by: field("Petal.Length").bin(Bin.step(0.1)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "x",
        alignment: "end",
      }),
      stack({ dir: "y" })
    )
    .mark(circle({ r: 2 })),
  chart(irisV.filter((d) => d.Species === "virginica"))
    .flow(
      partition({
        by: field("Petal.Length").bin(Bin.step(0.1)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "x",
        alignment: "start",
      }),
      stack({ dir: "y" })
    )
    .mark(circle({ r: 2 })),
]);
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='Side as a scale of a field is not a GoFish channel, so each species is its own chart with its own alignment. Missing: the dot-binning gap.',
)

E[68] = dict(
    title='Logit dotplot: geom_dots() with stat_lineribbon() of a transformed normal',
    gofish="""
const p = dist.transformed({
  dist: dist.normal({ mean: "fit", sd: "se.fit" }),
  f: plogis,
}); // no transformed Dist
layer([
  chart(irisV)
    .flow(
      spread({ by: "Species", dir: "y" }),
      partition({
        by: field("Petal.Length").bin(Bin.step(0.1)), // chosen by hand; ggdist picks the width so the tallest stack fits
        dir: "x",
      }),
      stack({ dir: "y" })
    )
    .mark(circle({ r: 2 })),
  chart(predictionGrid).mark(
    lineribbon(p, {
      along: "Petal.Length",
      fill: "#08306b",
      opacity: 0.25,
    })
  ),
]);
""",
    uses_up='dots: partition by a bin and stack over the rows; ribbon: quantiles and the median of the draws per x',
    fit='gofish-gap',
    verdict='ok',
    note='The ribbon is central intervals of the draws along x (quantiles pass through the monotone plogis). Missing: a transformed Dist constructor, dots stacked down from y = 1 and up from y = 0 on a continuous y axis (side mirrored by species), and the dot-binning gap.',
)

E[69] = dict(
    title='Spaghetti plot: 100 draws of a linear model',
    gofish="""
chart(
  df.filter((d) => d[".draw"] <= 100),
  { schema: { y: { draws: ".draw" } } }
)
  .flow(
    group({ by: ".draw" }),
    scatter({ by: "x", x: "x", y: "y" })
  )
  .mark(line({ opacity: 0.25 }));
""",
    uses_up='group({ by: ".draw" }), the plain overlay, over draws declared shared in the schema, 100 draws',
    fit='fits',
    verdict='ok',
    note="The draws are shared: each .draw is a whole line. The schema says so, and then rule 3.2 has nothing to warn about. This is the plain overlay row of the table, which version 1's table lacked; ggdist's alpha is 0.25, not the 1/100 a blend would give.",
)

E[70] = dict(
    title='geom_lineribbon() of median_qi(y) per x (one 95% band)',
    gofish="""
chart(df).mark(
  lineribbon("y", {
    along: "x",
    levels: [0.95],
    fill: "gray65",
  })
);
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="The band is the central interval of the draws at each x, and the line goes through the median of the draws at each x, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[71] = dict(
    title='geom_lineribbon() with .width = c(.5, .8, .95)',
    gofish="""
chart(df, {
  color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]),
}).mark(lineribbon("y", { along: "x" }));
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Three nested bands colored by level. Each band is the central interval of the draws at each x, and the line goes through the median of the draws at each x, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[72] = dict(
    title='stat_lineribbon() over the draws',
    gofish="""
chart(df, {
  color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]),
}).mark(lineribbon("y", { along: "x" }));
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note='The same picture as entry 71, computed from the draw rows.',
)

E[73] = dict(
    title='stat_lineribbon(.width = ppoints(50)), fill = .width (merged with the fill_ramp + rampbar version)',
    gofish="""
const levels = Array.from(
  { length: 50 },
  (_, i) => (i + 0.5) / 50
);
chart(df, { color: Color.gradient("Blues") }).mark(
  lineribbon("y", { along: "x", levels: levels })
);
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x, at 50 levels',
    fit='fits',
    verdict='ok',
    note='Fifty nested bands colored by level. The merged rampbar version maps the same level to a lightened single hue, which is a gradient color scale here; its rampbar legend is a GoFish legend detail.',
)

E[74] = dict(
    title='stat_lineribbon(.width = ppoints(50)), fill_ramp = mean density at the band edges',
    gofish="""
const levels = Array.from(
  { length: 50 },
  (_, i) => (i + 0.5) / 50
);
layer([
  // bands: one ribbon per level, colored by the density at
  // its edges
  chart(df, { color: Color.gradient(["white", "#2171b5"]) })
    .flow(
      derive((rows) => {
        // at each x and level: the central interval, and
        // the density at its two ends
        const bands = Object.values(
          Object.groupBy(rows, (r) => r.x)
        ).flatMap((step) =>
          centralIntervals(step, "y", levels).map(
            (band) => {
              const [lo, hi] = densityCurve(step, "y", {
                n: 2,
                range: [
                  band.center - band.size / 2,
                  band.center + band.size / 2,
                ],
              });
              return {
                ...band,
                edge: lo.density + hi.density,
              };
            }
          )
        );
        // ave(pdf_min + pdf_max, .width): the mean over
        // every x, per level
        const shade = (p) => {
          const edges = bands
            .filter((b) => b.level === p)
            .map((b) => b.edge);
          return (
            edges.reduce((sum, e) => sum + e, 0) /
            edges.length
          );
        };
        return bands.map((b) => ({
          ...b,
          shade: shade(b.level),
        }));
      }),
      group({ by: "level" }),
      scatter({ by: "x", x: "x" })
    )
    .mark(rect({ w: 0, cy: "center", h: "size" }))
    .layer(ribbon({ fill: "shade" })),
  // line: the median of the draws at each x
  chart(df)
    .flow(
      scatter({ by: "x", x: "x", y: field("y").median() })
    )
    .mark(line({ stroke: INK, strokeWidth: 2 })),
]);
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x, with the density of the draws at each band edge',
    fit='fits',
    verdict='ok',
    note="Coloring bands by density is the density of the draws at each band's two ends, averaged over x per level, which is a function of the distribution, not a picture of draws. The spec spells it out in one derive. Version 1 called this a blend limit and then could not use one.",
)

E[75] = dict(
    title='stat_lineribbon(.width = pnorm(seq(-2.5, 2.5, length.out = 50))), fill_ramp = density',
    gofish="""
const levels = Array.from({ length: 50 }, (_, i) =>
  normalCdf(-2.5 + (5 * i) / 49)
);
layer([
  // bands: one ribbon per level, colored by the density at
  // its edges
  chart(df, { color: Color.gradient(["white", "#2171b5"]) })
    .flow(
      derive((rows) => {
        // at each x and level: the central interval, and
        // the density at its two ends
        const bands = Object.values(
          Object.groupBy(rows, (r) => r.x)
        ).flatMap((step) =>
          centralIntervals(step, "y", levels).map(
            (band) => {
              const [lo, hi] = densityCurve(step, "y", {
                n: 2,
                range: [
                  band.center - band.size / 2,
                  band.center + band.size / 2,
                ],
              });
              return {
                ...band,
                edge: lo.density + hi.density,
              };
            }
          )
        );
        // ave(pdf_min + pdf_max, .width): the mean over
        // every x, per level
        const shade = (p) => {
          const edges = bands
            .filter((b) => b.level === p)
            .map((b) => b.edge);
          return (
            edges.reduce((sum, e) => sum + e, 0) /
            edges.length
          );
        };
        return bands.map((b) => ({
          ...b,
          shade: shade(b.level),
        }));
      }),
      group({ by: "level" }),
      scatter({ by: "x", x: "x" })
    )
    .mark(rect({ w: 0, cy: "center", h: "size" }))
    .layer(ribbon({ fill: "shade" })),
  // line: the median of the draws at each x
  chart(df)
    .flow(
      scatter({ by: "x", x: "x", y: field("y").median() })
    )
    .mark(line({ stroke: INK, strokeWidth: 2 })),
]);
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x, with the density of the draws at each band edge',
    fit='fits',
    verdict='ok',
    note='Entry 74 with levels spaced to look smooth.',
)

E[76] = dict(
    title='stat_lineribbon() of two groups, color = g, fill = level (brewer)',
    gofish="""
chart(df2groups, {
  color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]),
})
  .flow(group({ by: "g" }))
  .mark(lineribbon("y", { along: "x", stroke: "g" }));
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Two lineribbons; the median line's color is the group.",
)

E[77] = dict(
    title='stat_lineribbon(aes(fill = g), alpha = 1/4)',
    gofish="""
chart(df2groups)
  .flow(group({ by: "g" }))
  .mark(
    lineribbon("y", {
      along: "x",
      fill: "g",
      stroke: "g",
      opacity: 0.25,
    })
  );
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Nested translucent bands in the group's color.",
)

E[78] = dict(
    title='stat_lineribbon(aes(fill = g, fill_ramp = after_stat(level)))',
    gofish="""
// gap: fill_ramp, the group's color lightened by level
chart(df2groups)
  .flow(group({ by: "g" }))
  .mark(
    lineribbon("y", { along: "x", fill: "g", stroke: "g" })
  );
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='gofish-gap',
    verdict='ok',
    note="Missing: fill_ramp, the group's color lightened by level (entry 32).",
)

E[79] = dict(
    title='stat_lineribbon with order = interaction(level, group)',
    gofish="""
// ggdist draws every group's 95% band first, then 80%, then
// 50%: level outer, group inner. One lineribbon per group
// draws group by group, so the 50% band of g = a is under
// the 95% band of g = b. The definition's own flow could
// interleave them, by grouping by level before g.
// gap: fill_ramp, the group's color lightened by level
chart(df2groups)
  .flow(group({ by: "g" }))
  .mark(
    lineribbon("y", { along: "x", fill: "g", stroke: "g" })
  );
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='gofish-gap',
    verdict='ok',
    note="ggdist draws every group's widest band first. That is drawing order, which is flow order: group by level, then by g. The lineribbon mark groups by g outside the mark, so it draws one group's bands at a time; the spec says so in a comment. The definition's own flow could interleave them if it took the grouping as an option. Missing: fill_ramp as in entry 78.",
)

E[80] = dict(
    title='stat_lineribbon(aes(ydist = dist_normal(y_mean, y_sd)))',
    gofish="""
const y = dist.normal({ mean: "y_mean", sd: "y_sd" });
chart(analyticalDf, {
  color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]),
}).mark(lineribbon(y, { along: "x" }));
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note='The analytic version of entry 72.',
)

E[81] = dict(
    title='Eleven curves (draws) as lines, alpha = 0.2',
    gofish="""
chart(curves, { schema: { y: { draws: ".draw" } } })
  .flow(
    group({ by: ".draw" }),
    scatter({ by: "x", x: "x", y: "y" })
  )
  .mark(line({ opacity: 0.2 }));
""",
    uses_up='group({ by: ".draw" }), the plain overlay, over draws declared shared in the schema, 11 draws',
    fit='fits',
    verdict='ok',
    note='An overlay of whole-curve draws, as in entry 69.',
)

E[82] = dict(
    title='50% pointwise intervals with point_interval() over the curves',
    gofish="""
layer([
  chart(curves).mark(
    lineribbon("y", {
      along: "x",
      levels: [0.5],
      fill: "#3182bd",
    })
  ),
  chart(curves, { schema: { y: { draws: ".draw" } } })
    .flow(
      group({ by: ".draw" }),
      scatter({ by: "x", x: "x", y: "y" })
    )
    .mark(line({ opacity: 0.15 })),
]);
""",
    uses_up='band: quantiles and the median of the draws per cell, with one cell per x; curves: group({ by: ".draw" }), the plain overlay, over draws declared shared in the schema',
    fit='fits',
    verdict='ok',
    note="The pointwise band is narrow in the middle where the curves cross, which is the point of the next entry. The band is the central interval of the draws at each x, and the line goes through the median of the draws at each x, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[83] = dict(
    title='50% curvewise intervals with curve_interval()',
    gofish="""
// curves: one row per .draw and x, draws shared across x
const kept = (width) =>
  chart(curves, { schema: { y: { draws: ".draw" } } })
    .flow(
      // a summary per draw: the mean over x of the
      // pointwise depth min(level, 1 - level), then keep
      // the deepest share of the draws. gap: a summary
      // whose result a later filter reads; written as a
      // derive over the rows
      derive(
        keepDeepest({
          by: ".draw",
          depth: (r) => Math.min(r.level, 1 - r.level),
          share: width,
        })
      ),
      scatter({
        by: "x",
        x: "x",
        yMin: field("y").min(),
        yMax: field("y").max(),
      })
    )
    .mark(rect({ w: 0 }))
    .layer(ribbon({ fill: "#3182bd" }));
layer([
  kept(0.5),
  chart(curves, { schema: { y: { draws: ".draw" } } })
    .flow(
      group({ by: ".draw" }),
      scatter({ by: "x", x: "x", y: "y" })
    )
    .mark(line({ opacity: 0.15 })),
]);
""",
    uses_up='a summary per draw (mean depth from level), a filter on its rank, then the min and max of the draws per x',
    fit='gofish-gap',
    verdict='ok',
    note="curve_interval's default, mhd, scores each whole curve by its mean halfspace depth over x. The pointwise depth is min(level, 1 - level), so the score is a summary per draw of the level column, and the band is the min and max of the kept draws at each x. That is the 'summary per draw' row of the table, and version 1 could not write it. The missing piece is general: a summary whose result a later step reads, written here as a derive (keepDeepest is plain JavaScript over the rows). Because it is a derive, the checker cannot see that it keeps whole draws.",
)

E[84] = dict(
    title='point_interval() vs curve_interval() on 1000 curves',
    gofish="""
// largeCurves: one row per .draw and x, draws shared across x
const kept = (width) =>
  chart(largeCurves, { schema: { y: { draws: ".draw" } } })
    .flow(
      // a summary per draw: the mean over x of the
      // pointwise depth min(level, 1 - level), then keep
      // the deepest share of the draws. gap: a summary
      // whose result a later filter reads; written as a
      // derive over the rows
      derive(
        keepDeepest({
          by: ".draw",
          depth: (r) => Math.min(r.level, 1 - r.level),
          share: width,
        })
      ),
      scatter({
        by: "x",
        x: "x",
        yMin: field("y").min(),
        yMax: field("y").max(),
      })
    )
    .mark(rect({ w: 0 }))
    .layer(ribbon({ fill: "#3182bd" }));
const pointwise = layer([
  chart([{ y: 1 }]).mark(
    rect({ y: "y", h: 1, strokeDasharray: "4 3" })
  ),
  chart(largeCurves, {
    color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]),
  }).mark(lineribbon("y", { along: "x" })),
]);
const curvewise = layer([kept(0.95), kept(0.8), kept(0.5)]);
spread({ dir: "y", spacing: 16 }, [pointwise, curvewise]);
""",
    uses_up='pointwise: quantiles and the median of the draws per cell, with one cell per x; curvewise: as entry 83',
    fit='gofish-gap',
    verdict='ok',
    note='The pointwise panel fits. The curvewise panel is entry 83 at three widths, with the same gap.',
)

E[85] = dict(
    title='mtcars bootstrap loess fits as spaghetti, with the data',
    gofish="""
layer([
  chart(
    mtcarsBoot.filter((d) => d[".draw"] < 400),
    { schema: { hp: { draws: ".draw" } } }
  )
    .flow(
      group({ by: ".draw" }),
      scatter({ by: "mpg", x: "mpg", y: "hp" })
    )
    .mark(line({ opacity: 0.1 })),
  chart(mtcars)
    .flow(scatter({ x: "mpg", y: "hp" }))
    .mark(circle({ r: 1.5 })),
]);
""",
    uses_up='group({ by: ".draw" }), the plain overlay, over draws declared shared in the schema, 400 bootstrap draws precomputed in R',
    fit='fits',
    verdict='ok',
    note='The bootstrap (resampling mtcars and refitting loess) is done in data preparation. In GoFish it would be resample plus a fit per draw; version 2 does not change that.',
)

E[86] = dict(
    title='stat_lineribbon(.width = c(.5, .7, .9)) of the bootstrap fits, with the data',
    gofish="""
layer([
  chart(mtcarsBoot, {
    color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]),
  }).mark(
    lineribbon("hp", {
      along: "mpg",
      levels: [0.9, 0.7, 0.5],
    })
  ),
  chart(mtcars)
    .flow(scatter({ x: "mpg", y: "hp" }))
    .mark(circle({ r: 1.5 })),
]);
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Pointwise bands over shared draws. Each band is the central interval of the draws at each x, and the line goes through the median of the draws at each x, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[87] = dict(
    title='curve_interval(hp, .width = c(.5, .7, .9)) of the bootstrap fits',
    gofish="""
// mtcarsBoot: one row per .draw and x, draws shared across x
const kept = (width) =>
  chart(mtcarsBoot, { schema: { hp: { draws: ".draw" } } })
    .flow(
      // a summary per draw: the mean over x of the
      // pointwise depth min(level, 1 - level), then keep
      // the deepest share of the draws. gap: a summary
      // whose result a later filter reads; written as a
      // derive over the rows
      derive(
        keepDeepest({
          by: ".draw",
          depth: (r) => Math.min(r.level, 1 - r.level),
          share: width,
        })
      ),
      scatter({
        by: "mpg",
        x: "mpg",
        yMin: field("hp").min(),
        yMax: field("hp").max(),
      })
    )
    .mark(rect({ w: 0 }))
    .layer(ribbon({ fill: "#3182bd" }));
layer([
  kept(0.9),
  kept(0.7),
  kept(0.5),
  chart(mtcars)
    .flow(scatter({ x: "mpg", y: "hp" }))
    .mark(circle({ r: 1.5 })),
]);
""",
    uses_up='as entry 83',
    fit='gofish-gap',
    verdict='ok',
    note="Curvewise intervals with the default .interval = 'mhd', at three widths. Same spelling and the same gap as entry 83.",
)

E[88] = dict(
    title="curve_interval(..., .interval = 'bd-mbd') of the bootstrap fits",
    gofish="""
// Not writable: band depth compares pairs of whole
// draws. keepDeepest's depth would have to be, for
// each draw, the share of pairs of other draws whose
// band contains it at every x. That is not a summary of
// one draw's rows, and not a function of level.
""",
    uses_up='(would be) a statistic over pairs of whole draws, a filter on its rank, then the min and max of the draws per x',
    fit='does-not-fit',
    verdict='ok',
    note="bd-mbd ranks curves by band depth: the share of pairs of other curves whose band contains a curve at every x, with modified band depth to break ties. The table's 'summary per draw' covers mhd and modified band depth, which are means over x of functions of level. Band depth itself needs every pair of draws at once, so it is not a summary per draw.",
)

E[89] = dict(
    title='The ABC data: response by condition',
    gofish="""
chart(ABC)
  .flow(
    spread({ by: "condition", dir: "y" }),
    scatter({ x: "response" })
  )
  .mark(circle({ r: 2, opacity: 0.5 }));
""",
    uses_up='no draws: plain data points',
    fit='fits',
    verdict='ok',
    note='No uncertainty is shown; it is a strip plot of the raw data.',
)

E[90] = dict(
    title='stat_halfeye() of Student t sampling distributions of lm coefficients',
    gofish="""
const x = dist.studentT({
  df: "df",
  mu: "estimate",
  sigma: "std.error",
});
chart(tidyCoefs)
  .flow(spread({ by: "term", dir: "y" }))
  .mark(layer([slab(x), interval(x)]));
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note='A half-eye of a confidence distribution, with a t family in the dist namespace.',
)

E[91] = dict(
    title='stat_halfeye(scale = .5) of fitted means, with the data as ticks below',
    gofish="""
const x = dist.studentT({
  df: "df",
  mu: ".fitted",
  sigma: ".se.fit",
});
layer([
  chart(fitted)
    .flow(spread({ by: "condition", dir: "y" }))
    .mark(layer({ h: 30 }, [slab(x), interval(x)])),
  // the data as ticks below each half-eye. gap: placed by a
  // hand offset, not from the slab's zero line
  chart(ABC)
    .flow(
      spread({ by: "condition", dir: "y" }).translate({
        y: -10,
      }),
      scatter({ x: "response" })
    )
    .mark(rect({ w: 1, h: 8 })),
]);
""",
    uses_up='summaries per cell: the density curve of the draws for the slab, and quantiles and the median of the draws for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="The data ticks sit just below each half-eye's baseline; as with the raincloud in elaborations.md, placing a second chart's rows relative to the slab's zero line is not expressible, so this relies on a hand offset that matches only if both spreads give identical rows.",
)

E[92] = dict(
    title="stat_gradientinterval(fill_type = 'gradient') of fitted means",
    gofish="""
const x = dist.studentT({
  df: "df",
  mu: ".fitted",
  sigma: ".se.fit",
});
chart(fitted)
  .flow(spread({ by: "condition", dir: "y" }))
  .mark(
    layer({ h: 30 }, [gradientinterval(x), interval(x)])
  );
""",
    uses_up='the density curve of the draws per cell, divided by its peak and read as opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note='The gradient interval of entry 18 on t distributions: the density curve of the draws divided by its peak, read as opacity. GoFish has no opacity that varies along one region, so the spec marks it as a gap.',
)

E[93] = dict(
    title='stat_ccdfinterval() of fitted means',
    gofish="""
const x = dist.studentT({
  df: "df",
  mu: ".fitted",
  sigma: ".se.fit",
});
chart(fitted)
  .flow(spread({ by: "condition", dir: "y" }))
  .mark(
    layer([
      // the bar starts at the axis's lower limit, -1.5, as
      // ggdist's does
      ccdf(x, { density: { range: [-1.5] } }),
      interval(x),
    ])
  );
""",
    uses_up='summaries per cell: the CDF of the draws as thickness (ccdf), and quantiles and the median of the draws',
    fit='fits',
    verdict='ok',
    note="The ccdf mark of section 1, which is a summary of the draws, so it is exact on a Dist. The bar must start at a fixed point at or below the support; ggdist uses the axis's lower limit, -1.5 here, which the spec sets as the curve's range. A bar from 0 would be wrong, since the distributions cross 0. Bars sorted by level tend to this picture as n grows, but a spread by level at n = Infinity is an error under rule 3.1.",
)

E[94] = dict(
    title='stat_dots(quantiles = 100) of fitted means',
    gofish="""
const x = dist.studentT({
  df: "df",
  mu: ".fitted",
  sigma: ".se.fit",
});
chart(sample(fitted, { n: 100, at: "quantiles" }))
  .flow(
    spread({ by: "condition", dir: "y" }),
    partition({ by: x.bin(Bin.step(0.05)), dir: "x" }), // chosen by hand; ggdist picks the width so the tallest stack fits
    stack({ dir: "y" })
  )
  .mark(circle({ r: 1.5 }));
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='Quantile dots of a t distribution: sample at 100 evenly spaced levels, which version 1 needed a derive for. Missing: the dot-binning gap.',
)

E[95] = dict(
    title='stat_lineribbon of a t confidence band per cyl, alpha = 1/4, with the data',
    gofish="""
const y = dist.studentT({
  df: "df",
  mu: ".fitted",
  sigma: ".se.fit",
});
layer([
  chart(fittedMpg, { color: Color.palette("Set2") })
    .flow(group({ by: "cyl" }))
    .mark(
      lineribbon(y, {
        along: "hp",
        fill: "cyl",
        stroke: "cyl",
        opacity: 0.25,
      })
    ),
  chart(mtcars)
    .flow(scatter({ x: "hp", y: "mpg" }))
    .mark(circle({ r: 1.5, fill: "cyl" })),
]);
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Three nested translucent bands per cylinder count. The fill and stroke use two palettes in ggdist (Set2 and Dark2) for one field, which GoFish's single color scale per field cannot do; a minor color difference.",
)

E[96] = dict(
    title='stat_lineribbon with fill = cyl, fill_ramp = level, with the data',
    gofish="""
const y = dist.studentT({
  df: "df",
  mu: ".fitted",
  sigma: ".se.fit",
});
// gap: fill_ramp, the cylinder count's color lightened by level
layer([
  chart(fittedMpg)
    .flow(group({ by: "cyl" }))
    .mark(
      lineribbon(y, {
        along: "hp",
        fill: "cyl",
        stroke: "cyl",
      })
    ),
  chart(mtcars)
    .flow(scatter({ x: "hp", y: "mpg" }))
    .mark(circle({ r: 1.5, fill: "cyl" })),
]);
""",
    uses_up='quantiles and the median of the draws per cell, with one cell per x',
    fit='gofish-gap',
    verdict='ok',
    note='Missing: fill_ramp (entry 32).',
)

def fmt(js):
    js = js.strip()
    if not js or all(l.strip().startswith("//") for l in js.splitlines()):
        return js
    r = subprocess.run([PRETTIER, "--parser", "babel", "--print-width", "60"], input=js, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"prettier failed:\n{js}\n{r.stderr}")
    return r.stdout.strip()


V1 = json.load(open(f"{CAT}/v1-fits.json"))
out = []
for c in chunk_meta:
    num = int(c["id"][:2])
    e = E[num]
    entry = {
        "id": f"ggdist-{c['id']}",
        "source": f"{c['vignette']} vignette, chunk {c['label']}"
        + (f" (merged with chunk {', '.join(c['merged'])})" if c["merged"] else ""),
        "title": e["title"],
        "r_code": r_code(c),
        "img": c["img"],
        "gofish": fmt(e["gofish"]),
        "uses_up": e["uses_up"],
        "fit": e["fit"],
        "verdict": e["verdict"],
        "v1_fit": V1[f"ggdist-{c['id']}"]["fit"],
        "note": e["note"],
    }
    if c["extra_imgs"]:
        entry["img_merged"] = c["extra_imgs"]
    out.append(entry)

json.dump(out, open(f"{CAT}/ggdist.json", "w"), indent=2, ensure_ascii=False)
from collections import Counter
print(len(out), Counter(e["fit"] for e in out), Counter(e["verdict"] for e in out))
