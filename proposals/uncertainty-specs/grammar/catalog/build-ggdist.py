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
# the grammar (../theory-fragment.html). Names used but not defined in a spec
# (slab, pointinterval, lineribbon, as, withDraw, keepDeepest, INK, SLAB) are
# the prelude in ggdist-summary.md: plain JS over today's GoFish plus the
# version 2 additions. The v1 fit of each entry is in v1-fits.json.

E = {}

E[1] = dict(
    title='The slabinterval family (overview figure)',
    gofish="""
const x = dist.normal({ mean: 4, sd: 1 });
const cell = [{ mean: 4, sd: 1 }];
const drawn = sample(cell, { n: Infinity });
const dots = sample(cell, { n: 100, at: "quantiles" });
const row = (...charts) => layer(charts);
// one row per geom
spread({ dir: "y", spacing: 8 }, [
  row(chart(cell).mark(layer([slab(x), pointinterval(x)]))), // halfeye
  row(chart(cell).mark(layer([slab(x, { side: "both" }), pointinterval(x)]))), // eye
  // gradientinterval: opacity from the density, scaled so the peak is 1
  row(chart(cell).mark(layer([
    slab(x, { thickness: 1, opacity: x.density, normalize: "group", fill: SLAB }), // gap: opacity along one region
    pointinterval(x),
  ]))),
  // ccdfinterval: one bar per level, from the axis start to the draw
  row(
    chart(drawn).flow(spread({ by: "level", dir: "y", spacing: 0 })).mark(rect({ dims: { x: { min: 0, max: x } }, fill: SLAB })),
    chart(cell).mark(pointinterval(x)),
  ),
  // cdfinterval: one bar per level, from the draw to the axis end
  row(
    chart(drawn).flow(spread({ by: "level", dir: "y", spacing: 0 })).mark(rect({ dims: { x: { min: x, max: 8 } }, fill: SLAB })),
    chart(cell).mark(pointinterval(x)),
  ),
  row(chart(cell).mark(pointinterval(x, { levels: [0.5, 0.8, 0.95], point: false, thickness: 10, opacity: 1 / 3 }))),
  row(chart(cell).mark(pointinterval(x))),
  row(chart(cell).mark(slab(x))),
  row(
    chart(histDf).flow(partition({ by: field("x").bin(Bin.thresholds(30)), dir: "x" })).mark(rect({ h: field("x").count(), fill: SLAB })),
    chart(cell).mark(pointinterval(x)),
  ),
  row(chart(dots).flow(partition({ by: x.bin(Bin.step(0.1)), dir: "x" }), stack({ dir: "y" })).mark(circle({ r: 2 }))),
  row(
    chart(dots).flow(partition({ by: x.bin(Bin.step(0.1)), dir: "x" }), stack({ dir: "y" })).mark(circle({ r: 2 })),
    chart(cell).mark(pointinterval(x)),
  ),
]);
""",
    uses_up='mixed: ccdf and cdf rows: spread({ by: "level" }) at n = Infinity; gradient row: a density fold read as opacity; slab and interval rows: folds per cell; dots rows: sample at quantiles, then partition and stack',
    fit='gofish-gap',
    verdict='ok',
    note="Every row can now be written. Version 1 could not write the gradient row, because a blend has no peak scaling. In version 2 it is a density fold scaled to its peak and read as opacity, and the missing piece is that GoFish has no opacity that varies along one region, so the spec marks it as a gap. The eye row has entry 4's layout gap, and the dots rows have the dot-binning gap of entry 20.",
)

E[2] = dict(
    title='Properties of geom_slabinterval (annotated diagram)',
    gofish="""
const x = dist.normal({ mean: 4, sd: 1 });
chart([{ g: 0 }], { axes: { x: { domain: [-1, 10] } } })
  .mark(
    layer([
      slab(x, { fill: "gray75", stroke: "black", strokeWidth: 1, range: [0, 8] }),
      pointinterval(x, { levels: [0.6827], thickness: 3, r: 4, stroke: "black", fill: "gray75" }),
    ])
  )
  // the red annotations: brackets, reference lines, labels and curved arrows
  .layer(chart(annotations).mark(text({ x: "x", y: "y", text: "label", fill: "#d95f02" })))
  .layer(chart(arrows).mark(arrow({ fill: "#d95f02" })));
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="The halfeye itself is the elaborations.md half-eye. The annotation layer needs bracket-ended segments (arrowheads at 90 degrees) placed in data coordinates, which GoFish's arrow mark does not offer.",
)

E[3] = dict(
    title='stat_halfeye() (or stat_slabinterval())',
    gofish="""
chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(layer([slab("value"), pointinterval("value")]));
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note="This is elaborations.md's half-eye. The slab is the density fold over each group's rows, which ggdist estimates with a kernel, and the interval is the quantile and median folds. Version 1 needed derives for both.",
)

E[4] = dict(
    title='stat_slabinterval() with side = left, both, right (vertical)',
    gofish="""
const panel = (side) =>
  chart(df)
    .flow(spread({ by: "group", dir: "x" }))
    .mark(layer([slab("value", { dir: "y", side }), pointinterval("value", { dir: "y" })]));
spread({ dir: "x", spacing: 16 }, [panel("start"), panel("both"), panel("end")]);
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="Side start and both need the interval to sit on the slab's zero line, but a GoFish layer aligns its children's boxes, not their origins (elaborations.md, design question 'The line the slab sits on'). Side end works because its origin is its box edge.",
)

E[5] = dict(
    title='stat_slabinterval() with side = bottom, both, top (horizontal)',
    gofish="""
const panel = (side) =>
  chart(df)
    .flow(spread({ by: "group", dir: "y" }))
    .mark(layer([slab("value", { side }), pointinterval("value")]));
spread({ dir: "x", spacing: 16 }, [panel("start"), panel("both"), panel("end")]);
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='The horizontal version of entry 4, with the same layout gap for side start and both.',
)

E[6] = dict(
    title="stat_eye(position = 'dodge')",
    gofish="""
chart(df)
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(
    layer([
      slab("value", { dir: "y", side: "both", fill: "subgroup" }),
      pointinterval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="Dodge is a nested spread. The eye is side both, so it has entry 4's gap: the interval must sit on the slab's center line.",
)

E[7] = dict(
    title="stat_eye(position = 'dodge') with aes(ydist = dist_normal(mean, sd))",
    gofish="""
const y = dist.normal({ mean: "mean", sd: "sd" });
chart(distDf)
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(layer([slab(y, { dir: "y", side: "both", fill: "subgroup" }), pointinterval(y, { dir: "y" })]));
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
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
  .mark(layer({ h: 24 }, [slab(x), pointinterval(x)]));
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
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
    uses_up='a density fold per cell (exact on a Dist; a kernel estimate over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note="Overplotted slabs on one baseline share the size scale, which is ggdist's default normalize = 'all'.",
)

E[10] = dict(
    title='stat_halfeye() of brms priors with parse_dist() and a density subguide',
    gofish="""
// priors: one row per prior, with a Dist built from its text, e.g. normal(1, 0.5), gamma(2, 2), and normal(0, 1) truncated at 0
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(layer([slab("dist"), pointinterval("dist")]));
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='The slabs fit if a column may hold Dist values of different families (foldDist accepts that). Missing: the subguide, a small density axis drawn inside each slab, and a truncated Dist for the half-normal prior.',
)

E[11] = dict(
    title='prior (slab) + posterior (halfeye), separate vs shared thickness scale',
    gofish="""
const post = dist.normal({ mean: 0.1, sd: 0.5 });
const prior = dist.normal({ mean: 0, sd: 1 });
// separate: each slab scaled to its own peak (ggdist default)
const separate = chart([{}]).mark(
  layer([
    slab(post, { normalize: "group" }),
    pointinterval(post),
    slab(prior, { normalize: "group", fill: "none", stroke: "red" }),
  ])
);
// shared: one size scale for both (scale_thickness_shared)
const shared = chart([{}]).mark(
  layer([slab(post), pointinterval(post), slab(prior, { fill: "none", stroke: "#e41a1c" })])
);
spread({ dir: "x", spacing: 16 }, [separate, shared]);
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note='GoFish\'s default is ggdist\'s scale_thickness_shared, because both slabs read one size scale. The separate version divides each density curve by its own peak (normalize: "group", as in elaborations.md).',
)

E[12] = dict(
    title='stat_halfeye() of a lognormal on scale_x_log10()',
    gofish="""
const x = dist.lognormal({ meanlog: Math.log(10), sdlog: 2 * Math.log(10) });
chart([{}], { axes: { x: { scale: "log" } } }) // no log axis today
  .mark(layer([slab(x), pointinterval(x)]));
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='GoFish has no log scale. ggdist draws the density of log10(X), so the density fold would also need to know the axis transform. The quantile folds would not, since quantiles move with a monotone transform.',
)

E[13] = dict(
    title='stat_histinterval(), vertical and horizontal',
    gofish="""
const hist = (dir) =>
  chart()
    .flow(partition({ by: field("value").bin(Bin.thresholds(20)), dir }))
    .mark(rect({ [dir === "x" ? "h" : "w"]: field("value").count(), fill: SLAB }));
const vertical = chart(df)
  .flow(spread({ by: "group", dir: "x" }))
  .mark(layer([hist("y"), pointinterval("value", { dir: "y" })]));
const horizontal = chart(df)
  .flow(spread({ by: "group", dir: "y" }))
  .mark(layer([hist("x"), pointinterval("value")]));
spread({ dir: "x", spacing: 16 }, [vertical, horizontal]);
""",
    uses_up='partition by a bin of the value and count over the rows (finite n); the interval is quantile and median folds',
    fit='fits',
    verdict='ok',
    note="A histogram per group of rows, which is the bin-and-count form of the dotplot row at finite n. GoFish's bins are the same for every group (cells over the column's domain), while ggdist picks breaks per group; both are histograms.",
)

E[14] = dict(
    title='stat_histinterval(outline_bars = FALSE / TRUE)',
    gofish="""
const hist = (outline) =>
  chart(df)
    .flow(spread({ by: "group", dir: "y" }))
    .mark(
      layer([
        chart()
          .flow(partition({ by: field("value").bin(Bin.thresholds(20)), dir: "x" }))
          .mark(rect({ h: field("value").count(), fill: SLAB, stroke: outline ? "gray45" : "none" }))
          // outline_bars = FALSE: one stepped outline over the bar tops
          .layer(outline ? blank() : line({ curve: Curve.step(), stroke: "gray45" })),
        pointinterval("value"),
      ])
    );
spread({ dir: "x", spacing: 16 }, [hist(false), hist(true)]);
""",
    uses_up='partition by a bin of the value and count over the rows; the interval is quantile and median folds',
    fit='fits',
    verdict='ok',
    note='Outlining every bar is a rect stroke; the outline of the whole histogram is a stepped line through the bar tops.',
)

E[15] = dict(
    title='stat_slab() of Poisson distributions, fill = after_stat(pdf), with a line through lambda',
    gofish="""
const y = dist.poisson({ lambda: "lambda" });
layer([
  chart(sample(pois, { n: Infinity }), { color: Color.gradient(["#132b43", "#56b1f7"]) })
    .flow(spread({ by: "group", dir: "x" }), partition({ by: y.bin(Bin.step(1)), dir: "y" }))
    .mark(rect({ w: y.probability(), fill: y.probability() })),
  chart(pois)
    .flow(spread({ by: "group", dir: "x" }))
    .mark(circle({ cy: "lambda", r: 3 }))
    .layer(line({ strokeWidth: 1 })),
]);
""",
    uses_up='partition by a bin of the drawn value, then the probability-of-a-bin fold in each bin, n = Infinity',
    fit='fits',
    verdict='ok',
    note='A discrete slab is one bar per integer whose width is the pmf. At n = Infinity, partition groups the draws into bins and the probability fold uses them up, which rule 3.1 allows. Version 1 had no fold for this and needed a grid derive. The line joins plain lambda values, not draws.',
)

E[16] = dict(
    title="stat_ccdfinterval(position = 'dodge') on sample rows",
    gofish="""
// df has no draw column; withDraw adds a row index, and the schema declares it
chart(withDraw(df), { schema: { value: { draws: "draw" } } })
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(
    layer([
      chart()
        .flow(spread({ by: "level", dir: "x", spacing: 0 }))
        .mark(rect({ h: "value", fill: "subgroup" })),
      pointinterval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='spread({ by: "level" }) over the 1000 rows of each cell (finite n)',
    fit='fits',
    verdict='ok',
    note="Sorted dodged bars: at height y the number of bars taller than y is n times P(Y > y), so the outline is the CCDF. level replaces version 1's sort of the draw key. Two caveats. The data still has no draw column, so withDraw adds a row index. And level ranks a row among the rows of its cell, which here must be the rows with the same group and subgroup; version 2 does not say how a cell is found in data that arrives as draws. The bars start at 0, while ggdist's ccdf starts at the axis limit (1.5 here), so the lowest part differs.",
)

E[17] = dict(
    title="stat_ccdfinterval(position = 'dodge', justification = 1) with y from 0",
    gofish="""
// df has no draw column; withDraw adds a row index, and the schema declares it
chart(withDraw(df), { schema: { value: { draws: "draw" } } })
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(
    layer([
      chart()
        .flow(spread({ by: "level", dir: "x", spacing: 0 }))
        .mark(rect({ h: "value", fill: "subgroup" })),
      pointinterval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='spread({ by: "level" }) over the 1000 rows of each cell (finite n)',
    fit='fits',
    verdict='ok',
    note="With the axis from 0 this is exactly the sorted-bar picture. justification = 1 puts the interval at the bar's left edge, which is the layer's alignment of the interval child. The caveats of entry 16 apply.",
)

E[18] = dict(
    title="stat_gradientinterval(position = 'dodge')",
    gofish="""
const value = field("value");
chart(df)
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(
    layer([
      // gap: an opacity that varies along one region
      slab(value, { dir: "y", thickness: 1, opacity: value.density, normalize: "group", fill: "subgroup" }),
      pointinterval(value, { dir: "y" }),
    ])
  );
""",
    uses_up='a density fold per cell, scaled so its peak is 1, read as opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note='ggdist sets opacity from the density, rescaled so the densest point is opaque. Version 1 tried a blend and failed: a blend gives the chance of covering a pixel, which has no peak scaling. Version 2 says it is not a picture of draws at all. It is the density fold, scaled to its peak, read by an ordinary opacity channel. GoFish has no opacity that varies along one region, so the spec marks it as a gap.',
)

E[19] = dict(
    title="stat_gradientinterval(position = 'dodge', fill_type = 'gradient')",
    gofish="""
const value = field("value");
chart(df)
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(
    layer([
      // gap: an opacity that varies along one region
      slab(value, { dir: "y", thickness: 1, opacity: value.density, normalize: "group", fill: "subgroup" }),
      pointinterval(value, { dir: "y" }),
    ])
  );
""",
    uses_up='a density fold per cell, scaled so its peak is 1, read as opacity along the slab (the second kind of ggdist mark)',
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
    partition({ by: field("value").bin(Bin.step(0.15)), dir: "y" }),
    stack({ dir: "x" })
  )
  .mark(circle({ r: 1, fill: "subgroup", stroke: "subgroup" }));
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='The dotplot row of the table at finite n, with the rows as draws. GoFish has Bin.step, partition and stack, but not dot-density (Wilkinson) binning or a bin width chosen from the axis scale so the dots touch and the tallest stack fits; the author must match the bin width and r by hand.',
)

E[21] = dict(
    title='stat_dots(quantiles = 50) dodged',
    gofish="""
// stat_dots(quantiles = 50) of a sample: keep every 20th of each cell's 1000 ranks
chart(withDraw(df), { schema: { value: { draws: "draw" } } })
  .flow(
    spread({ by: "group", dir: "x" }),
    spread({ by: "subgroup", dir: "x" }),
    filter((d) => Math.round(d.level * 1000 + 0.5) % 20 === 10),
    partition({ by: field("value").bin(Bin.step(0.3)), dir: "y" }),
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
chart(withDraw(df), { schema: { value: { draws: "draw" } } })
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(
    layer([
      chart()
        .flow(group({ by: "draw", blend: "mean" }))
        .mark(rect({ h: "value", fill: "subgroup" })),
      pointinterval("value", { dir: "y" }),
    ])
  );
""",
    uses_up='group({ by: "draw", blend: "mean" }) over the 1000 rows of each cell',
    fit='fits',
    verdict='ok',
    note="Full-width bars from 0 to each draw, averaged, have opacity P(Y > y) at height y, which is the CCDF fade of the table. It matches ggdist because the CCDF already runs from 0 to 1, so ggdist's alpha rescaling changes nothing. The same chart is also a fold: opacity 1 - cdf along the bar. Entry 16's caveats about the draw key apply.",
)

E[23] = dict(
    title='stat_halfeye(aes(fill = after_stat(abs(x) < 1.5))) for Normal and Student t',
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      slab("dist", { fill: "gray85" }),
      slab("dist", { fill: "skyblue", range: [-1.5, 1.5] }),
      pointinterval("dist"),
    ])
  );
""",
    uses_up='density folds per cell, the second cut to |x| < 1.5; quantile and median folds for the interval',
    fit='fits',
    verdict='ok',
    note="Coloring a slab by a predicate on x is a second slab whose grid is cut to the region, drawn on top; both read one size scale so they line up. A partition intersected with the slab, as in the proposal's quantile-ribbon example, would also work.",
)

E[24] = dict(
    title="stat_eye(fill_type = 'gradient'), slab_alpha = f, fill = x > 1",
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      // fill = x > 1: two eyes cut at 1. gap: an opacity that varies along one region
      slab("dist", { side: "both", range: [-Infinity, 1], opacity: (v) => as("dist").density(v), normalize: "group", fill: "gray75" }),
      slab("dist", { side: "both", range: [1, Infinity], opacity: (v) => as("dist").density(v), normalize: "group", fill: "skyblue" }),
      pointinterval("dist"),
    ])
  );
""",
    uses_up='a density fold per cell, scaled so its peak is 1, read as opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note="An eye whose opacity is the density scaled to its peak. Coloring by x > 1 is two slabs cut at 1, as in entry 23, so the predicate needs no channel. Missing: GoFish has no opacity that varies along one region, so the spec marks it as a gap, and the eye has entry 4's layout gap.",
)

E[25] = dict(
    title='stat_gradientinterval with slab_alpha = -pmax(abs(1 - 2*cdf), .95) (Correll and Gleicher)',
    gofish="""
// Correll and Gleicher: flat over the central 95%, fading to 0 in the tails
const fade = (x) => (v) => 1 - Math.max(Math.abs(1 - 2 * as(x).cdf(v)), 0.95);
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      slab("dist", { thickness: 1, opacity: fade("dist"), normalize: "group", fill: SLAB }), // gap: opacity along one region
      pointinterval("dist"),
    ])
  );
""",
    uses_up='a cdf fold per cell, turned into opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note='The opacity is a function of the CDF that no blend makes, because a blend is linear in the distribution. Version 1 stopped there. In version 2 the CDF is a fold, the function is ordinary arithmetic on it, and opacity reads the result. normalize: "group" puts the plateau at 1, as ggdist\'s alpha scale does (ggdist keeps a floor of 0.1). GoFish has no opacity that varies along one region, so the spec marks it as a gap.',
)

E[26] = dict(
    title="stat_eye(fill_type = 'gradient') with slab_alpha = -pmax(abs(1 - 2*cdf), .95) (Helske et al.)",
    gofish="""
const fade = (x) => (v) => 1 - Math.max(Math.abs(1 - 2 * as(x).cdf(v)), 0.95);
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      slab("dist", { side: "both", opacity: fade("dist"), normalize: "group", fill: SLAB }), // gap: opacity along one region
      pointinterval("dist"),
    ])
  );
""",
    uses_up='a density fold for the shape and a cdf fold for the opacity, per cell',
    fit='gofish-gap',
    verdict='ok',
    note="Entry 25's fade on an eye. Missing: GoFish has no opacity that varies along one region, so the spec marks it as a gap, and the eye has entry 4's layout gap.",
)

E[27] = dict(
    title="Tukey pencils: stat_slab(side = 'both'), thickness and fill_ramp = pmax(0, abs(1 - 2*cdf) - .95)",
    gofish="""
const y = dist.normal({ mean: "mean", sd: "sd" });
chart(distDf)
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(
    slab(y, {
      dir: "y",
      side: "both",
      fill: "subgroup", // + fill_ramp by the same curve
      thickness: (v) => Math.max(0, Math.abs(1 - 2 * y.cdf(v)) - 0.95),
    })
  );
""",
    uses_up='a cdf fold per cell, turned into thickness',
    fit='gofish-gap',
    verdict='ok',
    note='The thickness is arithmetic on the cdf fold, and side both with no interval has no alignment problem. Missing: fill_ramp, the fill lightening along the slab, which needs a fill that varies along one ribbon.',
)

E[28] = dict(
    title='stat_halfeye(aes(fill = after_stat(level)))',
    gofish="""
chart(df, { color: Color.palette(["#c6dbef", "#6baed6"]) })
  .flow(spread({ by: "group", dir: "y" }))
  .mark(
    layer([
      slab("value", { fill: "gray85" }),
      slab("value", { fill: "level", within: 0.95 }),
      slab("value", { fill: "level", within: 0.66 }),
      pointinterval("value"),
    ])
  );
""",
    uses_up='density folds per cell, cut to the central 95% and 66% by quantile folds and drawn nested; quantile and median folds for the interval',
    fit='fits',
    verdict='ok',
    note='Each level is the slab cut to that interval, between x.quantile((1 - p) / 2) and x.quantile((1 + p) / 2), drawn widest first. Bin.quantiles cannot do it, because GoFish computes quantile cells over the whole column, not per group.',
)

E[29] = dict(
    title='stat_slab(aes(fill = after_stat(level)), .width = c(.66, .95, 1)) + stat_pointinterval()',
    gofish="""
chart(df, { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) })
  .flow(spread({ by: "group", dir: "y" }))
  .mark(
    layer([
      slab("value", { fill: "level", within: 1 }),
      slab("value", { fill: "level", within: 0.95 }),
      slab("value", { fill: "level", within: 0.66 }),
      pointinterval("value"),
    ])
  );
""",
    uses_up='density folds per cell, cut to the central 95% and 66% by quantile folds and drawn nested; quantile and median folds for the interval',
    fit='fits',
    verdict='ok',
    note='Entry 28 with a 100% level in place of the gray remainder.',
)

E[30] = dict(
    title='stat_halfeye fill = level: median_qi vs mode_hdci, Beta(10, 2)',
    gofish="""
const x = dist.beta({ alpha: 10, beta: 2 });
const panel = (kind) =>
  chart([{}], { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) }).mark(
    layer([
      slab(x, { fill: "gray95" }),
      ...[0.95, 0.8, 0.5].map((p) => slab(x, { fill: "level", within: p, interval: kind })),
      pointinterval(x, { levels: [0.5, 0.8, 0.95], interval: kind }),
    ])
  );
spread({ dir: "y", spacing: 16 }, [panel("qi"), panel("hdci")]);
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="The quantile-interval panel fits. The second panel needs the mode and the highest-density continuous interval. Neither is in version 2's list of folds. They are general aggregates, not special to draws, so this is a GoFish gap; on draws an HDI is the shortest window of levels.",
)

E[31] = dict(
    title='stat_slab + stat_spike at median and qi vs mode and hdi',
    gofish="""
const x = dist.beta({ alpha: 10, beta: 2 });
// a spike: a 1 px rect from 0 to the density at a point
const spike = (at) => rect({ x: at, w: 1, h: x.density(at) }); // linetype by kind: no field mapping
const panel = (kind, points) =>
  chart([{}]).mark(
    layer([
      ...[1, 0.95, 0.5].map((p) => slab(x, { fill: "level", within: p, interval: kind })),
      ...points.map(spike),
    ])
  );
spread({ dir: "y", spacing: 16 }, [
  panel("qi", [x.median(), x.quantile(0.025), x.quantile(0.975)]),
  panel("hdi", [x.mode(), ...x.hdi(0.95)]), // gap: mode and HDI folds
]);
""",
    uses_up='density, median and quantile folds per cell',
    fit='gofish-gap',
    verdict='ok',
    note="A spike is a 1 px rect from 0 to the density at a point, so it shares the slab's size scale. Missing: the mode and HDI folds (entry 30), and linetype mapped from a field (strokeDasharray is a literal).",
)

E[32] = dict(
    title="stat_halfeye(position = 'dodgejust'), fill = subgroup, fill_ramp = level",
    gofish="""
chart(df)
  .flow(spread({ by: "group", dir: "y" }), spread({ by: "subgroup", dir: "y" }))
  .mark(
    layer([
      ...[0.95, 0.8, 0.5].map((p) => slab("value", { fill: "subgroup", within: p })), // + lightened by level
      pointinterval("value"),
    ])
  );
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note='The geometry fits as nested slabs. Missing: fill_ramp, a color scale on subgroup lightened by a second field (level); Color.mix exists but no scale combines two fields.',
)

E[33] = dict(
    title="stat_interval(aes(color = subgroup, color_ramp = after_stat(level)), position = 'dodge')",
    gofish="""
const y = dist.normal({ mean: "mean", sd: "sd" });
chart(distDf)
  .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
  .mark(pointinterval(y, { dir: "y", levels: [0.5, 0.8, 0.95], point: false, thickness: 4, fill: "subgroup" })); // + ramp by level
""",
    uses_up='quantile(p) and median folds per cell',
    fit='gofish-gap',
    verdict='ok',
    note='Nested intervals are quantile folds. Missing: color_ramp, the subgroup color lightened by level (as in entry 32).',
)

E[34] = dict(
    title='Raindrop: stat_eye with thickness = log(pdf) inside the 95% and 99% intervals',
    gofish="""
chart(priors)
  .flow(spread({ by: "label", dir: "y" }))
  .mark(
    layer([
      slab("dist", { side: "both", fill: "gray85", within: 0.99, normalize: "group", thickness: (v) => Math.log(as("dist").density(v)) }),
      slab("dist", { side: "both", within: 0.95, normalize: "group", thickness: (v) => Math.log(as("dist").density(v)) }),
      pointinterval("dist"),
    ])
  );
""",
    uses_up='a density fold per cell, turned into thickness log(pdf) and cut to an interval by quantile folds',
    fit='gofish-gap',
    verdict='ok',
    note="Any function of the density is arithmetic on the density fold. log(pdf) shifted to start at 0 within each interval is what normalize = 'groups' does. The eye shape has entry 4's gap.",
)

E[35] = dict(
    title="Ridgeline: stat_slab(height = 2, color = 'black')",
    gofish="""
chart(ridgesDf)
  .flow(spread({ by: "group", dir: "y", anchor: "baseline", spacing: 24 }))
  .mark(slab("x", { fill: SLAB, stroke: "black", h: 60 }));
""",
    uses_up='a density fold per cell (exact on a Dist; a kernel estimate over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note="Overlapping ridges are a baseline spread with a fixed pitch and slabs taller than the pitch, as in GoFish's Ridgeline Chart story.",
)

E[36] = dict(
    title='Ridgeline with fill = group, fill_ramp = abs(x), color_ramp = -dnorm(x, 0, 2)',
    gofish="""
chart(ridgesDf, { color: Color.palette("viridis") })
  .flow(spread({ by: "group", dir: "y", anchor: "baseline", spacing: 24 }))
  .mark(slab("x", { fill: "group", range: "unbounded", h: 60 })) // + ramp along x
  .layer(chart([{ x: 0 }]).mark(rect({ x: "x", w: 1, strokeDasharray: "4 3" })));
""",
    uses_up='a density fold per cell (exact on a Dist; a kernel estimate over the rows on a sample)',
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
const row = (g, alignment) =>
  layer([
    chart(dots.filter((d) => d.group === g))
      .flow(partition({ by: x.bin(Bin.step(0.2)), dir: "x", alignment }), stack({ dir: "y" }))
      .mark(circle({ r: 2 })),
    chart(cells.filter((d) => d.group === g)).mark(pointinterval(x)),
  ]);
spread({ dir: "y", spacing: 20 }, [row("a", "end"), row("b", "middle"), row("c", "start")]);
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is quantile and median folds on the Dist',
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
    .flow(spread({ by: "group", dir: "x" }), spread({ by: "subgroup", dir: "x" }))
    .mark(
      layer([
        slab(value, { dir: "y", side: "start", fill: "subgroup" }),
        pointinterval(value, { dir: "y" }),
        text({ y: value.median(), text: "label" }),
      ])
    ),
  // 100 quantile dots of each cell's 1000 rows: every 10th rank
  chart(drawn, { schema: { value: { draws: "draw" } } })
    .flow(
      spread({ by: "group", dir: "x" }),
      spread({ by: "subgroup", dir: "x" }),
      filter((d) => Math.round(d.level * 1000 + 0.5) % 10 === 5),
      partition({ by: value.bin(Bin.step(0.15)), dir: "y" }),
      stack({ dir: "x" })
    )
    .mark(circle({ r: 1.5, fill: "subgroup" })),
]);
""",
    uses_up='slab and label: density and median folds; dots: a filter on level keeps 100 of 1000 rows, then partition and stack',
    fit='gofish-gap',
    verdict='ok',
    note="A left slab and right dots share one center line, which needs the layer to align children by origin (entry 4's gap), plus the dot-binning gap. The label at the median is a text mark at a median fold. The dots thin a sample to 100 quantiles with a filter on level, as in entry 21.",
)

E[39] = dict(
    title='stat_slab(alpha = .3) overplotted + stat_pointinterval with position_dodgejust',
    gofish="""
layer([
  chart(df).flow(group({ by: "group" })).mark(slab("value", { fill: "group", opacity: 0.3 })),
  chart(df)
    .flow(spread({ by: "group", dir: "y", spacing: 4 }).translate({ y: -12 }))
    .mark(pointinterval("value", { fill: "group" })),
]);
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
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
    .flow(partition({ by: x.bin(Bin.step(0.25)), dir: "x" }), stack({ dir: "y" }))
    .mark(circle({ r: 3, fill: "gray75", stroke: "gray50" })),
  chart(cell).mark(pointinterval(x, { levels: [0.6827], thickness: 5, shape: "square" })),
])
  .layer(chart(annotations).mark(text({ x: "x", y: "y", text: "label", fill: "#d95f02" })))
  .layer(chart(arrows).mark(arrow({ fill: "#d95f02" })));
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is quantile and median folds',
    fit='gofish-gap',
    verdict='ok',
    note='Quantile dots plus an interval. Missing: the dot-binning gap of entry 20, bracket-ended annotation segments (entry 2), and a square point shape.',
)

E[41] = dict(
    title='Properties of geom_dots (annotated diagram)',
    gofish="""
const x = dist.normal({ mean: 4, sd: 1.2 });
chart(sample([{}], { n: 100, at: "quantiles" }))
  .flow(partition({ by: x.bin(Bin.step(0.25)), dir: "x" }), stack({ dir: "y" }))
  .mark(circle({ r: 3, fill: "gray75", stroke: "gray50" }))
  .layer(chart(annotations).mark(text({ x: "x", y: "y", text: "label", fill: "#d95f02" })))
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
chart([{ x: 0.4 }, { x: 0.7 }, { x: 0.7 }, { x: 1 }, { x: 1 }, { x: 1 }])
  .flow(partition({ by: field("x").bin(Bin.step(0.3)), dir: "x" }), stack({ dir: "y" }))
  .mark(circle({ r: 15, opacity: 0.5 }))
  .layer(chart(annotations).mark(text({ x: "x", y: "y", text: "label" })))
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
  chart(xs).flow(partition({ by: field("x").bin(Bin.step(0.2)), dir: "x", alignment }), stack({ dir: "y" })).mark(circle({ r: 3 }));
spread({ dir: "x", spacing: 12 }, [panel("end"), panel("middle"), panel("start")]);
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
  chart(xs).flow(partition({ by: field("x").bin(Bin.step(0.2)), dir: "y", alignment }), stack({ dir: "x" })).mark(circle({ r: 3 }));
spread({ dir: "x", spacing: 12 }, [panel("end"), panel("middle"), panel("start")]);
""",
    uses_up='partition by a bin of the value, then stack, over the rows (each row is a draw; finite n)',
    fit='gofish-gap',
    verdict='ok',
    note='Entry 43 turned vertical.',
)

E[45] = dict(
    title="geom_dots() layouts bin / hex / weave / swarm with side = 'top'",
    gofish="""
const dots = (flow) => chart(xs).flow(...flow).mark(circle({ r: 3 }));
spread({ dir: "y", spacing: 12 }, [
  dots([partition({ by: field("x").bin(Bin.step(0.2)), dir: "x", alignment: "end" }), stack({ dir: "y" })]), // bin
  // hex and weave: no GoFish layout
  dots([scatter({ x: "x", overlap: Overlap.separate(), alignment: "end" })]), // swarm
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
const dots = (flow) => chart(xs).flow(...flow).mark(circle({ r: 3 }));
spread({ dir: "y", spacing: 12 }, [
  dots([partition({ by: field("x").bin(Bin.step(0.2)), dir: "x", alignment: "middle" }), stack({ dir: "y" })]),
  dots([scatter({ x: "x", overlap: Overlap.separate() })]),
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
  .flow(spread({ by: "abc", dir: "x" }), partition({ by: field("value").bin(Bin.step(0.25)), dir: "y", alignment: "middle" }), stack({ dir: "x" }))
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
  .flow(spread({ by: "abc", dir: "x" }), scatter({ y: "value", overlap: Overlap.separate() })) // nearest: hex has no GoFish layout
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
  .flow(spread({ by: "g", dir: "x" }), scatter({ y: "y", overlap: Overlap.separate() }))
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
  .flow(spread({ by: "abc", dir: "x" }), spread({ by: "hi", dir: "x" }), scatter({ y: "value", overlap: Overlap.separate() })) // weave has no GoFish layout
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
  .flow(spread({ by: "abc", dir: "x" }), partition({ by: field("value").bin(Bin.step(0.25)), dir: "y" }), stack({ dir: "x" }))
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
    partition({ by: field("value").bin(Bin.step(0.25)), dir: "y" }),
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
chart(abccDf, { color: Color.gradient(["#132b43", "#56b1f7"]) })
  .flow(spread({ by: "abc", dir: "x" }), partition({ by: field("value").bin(Bin.step(0.25)), dir: "y" }), stack({ dir: "x" }))
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
    partition({ by: field("x").bin(Bin.step(0.1)), dir: "x" }),
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
    partition({ by: field("x").bin(Bin.step(0.1)), dir: "x" }),
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
    partition({ by: field("x").bin(Bin.step(0.1)), dir: "x" }),
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
  .flow(spread({ by: "x", dir: "x" }), stack({ by: "g", dir: "y" })) // + a grid of dots inside each bar
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
  .flow(spread({ by: "x", dir: "x" }), scatter({ x: 0, overlap: Overlap.noise({ smoothing: 0.3 }) }))
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
    partition({ by: as("dist").bin(Bin.step(0.02)), dir: "x" }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 1.5 }))
  .layer(chart(distDf2).flow(spread({ by: "distName", dir: "y" })).mark(pointinterval("dist")));
""",
    uses_up='sample(data, { n: 100, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is quantile and median folds',
    fit='gofish-gap',
    verdict='ok',
    note='Quantile dots and intervals of three families, from a column of Dist cells. Missing: the dot-binning gap (one bin width cannot suit three different scales) and the integer subguide, a count axis inside each row.',
)

E[61] = dict(
    title="stat_dotsinterval(quantiles = 1000, point_interval = mode_hdci, layout = 'weave'), slab_fill = level",
    gofish="""
chart(sample(distDf2, { n: 1000, at: "quantiles" }), { color: Color.palette(["#9ecae1", "#3182bd"]) })
  .flow(
    spread({ by: "distName", dir: "y" }),
    // the interval a dot falls in, from its level: the hdci needs a fold that does not exist
    derive((rows) => rows.map((r) => ({ ...r, band: Math.abs(r.level - 0.5) < 0.33 ? 0.66 : 0.95 }))),
    scatter({ x: "dist", overlap: Overlap.separate() }) // weave: no GoFish layout
  )
  .mark(circle({ r: 0.5, fill: "band" }))
  .layer(chart(distDf2).flow(spread({ by: "distName", dir: "y" })).mark(pointinterval("dist", { interval: "hdci" })));
""",
    uses_up='sample(data, { n: 1000, at: "quantiles" }), then partition by a bin and stack (finite n) by a dot layout; the interval is folds',
    fit='gofish-gap',
    verdict='ok',
    note='Coloring each dot by the interval it falls in reads level, which is exact for an equal-tailed interval. Missing: the weave layout, and the mode and HDCI folds (entry 30); with an HDCI the band is not a function of level alone.',
)

E[62] = dict(
    title='stat_dotsinterval(slab_shape = 19, quantiles = 500), slab_color = after_stat(x)',
    gofish="""
chart(sample(distDf2, { n: 500, at: "quantiles" }), { color: Color.gradient("Blues") })
  .flow(
    spread({ by: "distName", dir: "y" }),
    partition({ by: as("dist").bin(Bin.step(0.01)), dir: "x" }),
    stack({ dir: "y" })
  )
  .mark(circle({ r: 0.7, fill: "dist" }))
  .layer(chart(distDf2).flow(spread({ by: "distName", dir: "y" })).mark(pointinterval("dist")));
""",
    uses_up='sample(data, { n: 500, at: "quantiles" }), then partition by a bin and stack (finite n); the interval is folds',
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
    derive((rows) => rows.map((r) => ({ ...r, flag: r.x < 6 }))), // x < 6 on the drawn value
    scatter({ x, overlap: Overlap.separate() }) // weave: no GoFish layout
  )
  .mark(circle({ r: 2, fill: "flag" }))
  .layer(chart([{ x: 6 }]).mark(rect({ x: "x", w: 1, opacity: 0.25 })));
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
      slab(value, { fill: "abc", thickness: (v) => value.density(v) * value.count() }),
      chart()
        .flow(partition({ by: value.bin(Bin.step(0.3)), dir: "x", alignment: "start" }), stack({ dir: "y" }))
        .mark(circle({ r: 2, fill: "abc" })),
      pointinterval(value),
    ])
  );
""",
    uses_up='slab: density and count folds over the rows; dots: partition by a bin and stack over the rows',
    fit='gofish-gap',
    verdict='ok',
    note="Dots hanging below the line need entry 4's origin alignment. Scaling the slab by n so it matches the dot stacks needs the slab and the stacks on one count scale, which the hand-set bin width breaks.",
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
    partition({ by: boot.bin(Bin.step(0.1)), dir: "x" }),
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
// the outer draws (quantile folds per level), drawn
// as a rect through each dot.
""",
    uses_up='(would be) quantile folds across the outer draws, per inner level',
    fit='does-not-fit',
    verdict='ok',
    note="Each dot's interval is the uncertainty of the quantile estimate, an outer level over the sample. In the draw model it is a pair of quantile folds across outer draws, grouped by the inner level. That needs the Dist<Dist> constructor and two draw keys, which entry 65 shows version 2 does not have.",
)

E[67] = dict(
    title='geom_dots(scale = 0.5), aes(side = Species) + scale_side_mirrored()',
    gofish="""
layer([
  chart(irisV.filter((d) => d.Species === "versicolor"))
    .flow(partition({ by: field("Petal.Length").bin(Bin.step(0.1)), dir: "x", alignment: "end" }), stack({ dir: "y" }))
    .mark(circle({ r: 2 })),
  chart(irisV.filter((d) => d.Species === "virginica"))
    .flow(partition({ by: field("Petal.Length").bin(Bin.step(0.1)), dir: "x", alignment: "start" }), stack({ dir: "y" }))
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
const p = dist.transformed({ dist: dist.normal({ mean: "fit", sd: "se.fit" }), f: plogis }); // no transformed Dist
layer([
  chart(irisV)
    .flow(spread({ by: "Species", dir: "y" }), partition({ by: field("Petal.Length").bin(Bin.step(0.1)), dir: "x" }), stack({ dir: "y" }))
    .mark(circle({ r: 2 })),
  chart(predictionGrid).mark(lineribbon(p, { along: "Petal.Length", levels: [0.5, 0.8, 0.95], fill: "#08306b", opacity: 0.25 })),
]);
""",
    uses_up='dots: partition by a bin and stack over the rows; ribbon: quantile and median folds per x',
    fit='gofish-gap',
    verdict='ok',
    note='The ribbon is quantile folds along x (quantiles pass through the monotone plogis). Missing: a transformed Dist constructor, dots stacked down from y = 1 and up from y = 0 on a continuous y axis (side mirrored by species), and the dot-binning gap.',
)

E[69] = dict(
    title='Spaghetti plot: 100 draws of a linear model',
    gofish="""
chart(df.filter((d) => d[".draw"] <= 100), { schema: { y: { draws: ".draw" } } })
  .flow(group({ by: ".draw" }), scatter({ by: "x", x: "x", y: "y" }))
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
chart(df).mark(lineribbon("y", { along: "x", levels: [0.95], fill: "gray65" }));
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="The band is a pair of quantile folds at each x, and the median line is a line through median folds, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[71] = dict(
    title='geom_lineribbon() with .width = c(.5, .8, .95)',
    gofish="""
chart(df, { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) }).mark(
  lineribbon("y", { along: "x", levels: [0.5, 0.8, 0.95], fill: "level" })
);
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Three nested bands colored by level. The band is a pair of quantile folds at each x, and the median line is a line through median folds, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[72] = dict(
    title='stat_lineribbon() over the draws',
    gofish="""
chart(df, { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) }).mark(
  lineribbon("y", { along: "x", levels: [0.5, 0.8, 0.95], fill: "level" })
);
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note='The same picture as entry 71, computed from the draw rows by the folds.',
)

E[73] = dict(
    title='stat_lineribbon(.width = ppoints(50)), fill = .width (merged with the fill_ramp + rampbar version)',
    gofish="""
const levels = Array.from({ length: 50 }, (_, i) => (i + 0.5) / 50);
chart(df, { color: Color.gradient("Blues") }).mark(lineribbon("y", { along: "x", levels, fill: "level" }));
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x, at 50 levels',
    fit='fits',
    verdict='ok',
    note='Fifty nested bands colored by level. The merged rampbar version maps the same level to a lightened single hue, which is a gradient color scale here; its rampbar legend is a GoFish legend detail.',
)

E[74] = dict(
    title='stat_lineribbon(.width = ppoints(50)), fill_ramp = mean density at the band edges',
    gofish="""
const levels = Array.from({ length: 50 }, (_, i) => (i + 0.5) / 50);
chart(df, { color: Color.gradient(["white", "#2171b5"]) }).mark(
  lineribbon("y", { along: "x", levels, fill: (b) => (as("y").density(b.min) + as("y").density(b.max)) / 2 })
);
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x, with the density fold at each band edge',
    fit='fits',
    verdict='ok',
    note="Coloring bands by density is the density fold read at each band's edges and averaged, which is a function of the distribution, not a picture of draws. Version 1 called this a blend limit and then could not use one.",
)

E[75] = dict(
    title='stat_lineribbon(.width = pnorm(seq(-2.5, 2.5, length.out = 50))), fill_ramp = density',
    gofish="""
const levels = Array.from({ length: 50 }, (_, i) => normalCdf(-2.5 + (5 * i) / 49));
chart(df, { color: Color.gradient(["white", "#2171b5"]) }).mark(lineribbon("y", { along: "x", levels, fill: "pdf" }));
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x, with the density fold at each band edge',
    fit='fits',
    verdict='ok',
    note='Entry 74 with levels spaced to look smooth.',
)

E[76] = dict(
    title='stat_lineribbon() of two groups, color = g, fill = level (brewer)',
    gofish="""
chart(df2groups, { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) })
  .flow(group({ by: "g" }))
  .mark(lineribbon("y", { along: "x", levels: [0.5, 0.8, 0.95], fill: "level", stroke: "g" }));
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Two lineribbons; the median line's color is the group.",
)

E[77] = dict(
    title='stat_lineribbon(aes(fill = g), alpha = 1/4)',
    gofish="""
chart(df2groups)
  .flow(group({ by: "g" }))
  .mark(lineribbon("y", { along: "x", levels: [0.5, 0.8, 0.95], fill: "g", opacity: 0.25 }));
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Nested translucent bands in the group's color.",
)

E[78] = dict(
    title='stat_lineribbon(aes(fill = g, fill_ramp = after_stat(level)))',
    gofish="""
chart(df2groups)
  .flow(group({ by: "g" }))
  .mark(lineribbon("y", { along: "x", levels: [0.5, 0.8, 0.95], fill: "g" })); // + lightened by level
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='gofish-gap',
    verdict='ok',
    note="Missing: fill_ramp, the group's color lightened by level (entry 32).",
)

E[79] = dict(
    title='stat_lineribbon with order = interaction(level, group)',
    gofish="""
chart(df2groups)
  .flow(group({ by: "level" }), group({ by: "g" })) // every group's 95% band first, then 80%, then 50%
  .mark(lineribbon("y", { along: "x", levels: [0.5, 0.8, 0.95], fill: "g" })); // + lightened by level
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='gofish-gap',
    verdict='ok',
    note="Interleaving the two groups' bands by level is drawing order, which is flow order (level outer, group inner). Here level is the band's level p, not sample's column, and the bands are made inside lineribbon, so the split by level has to come after it; today's flow cannot reorder marks made inside a helper. Missing: fill_ramp as in entry 78.",
)

E[80] = dict(
    title='stat_lineribbon(aes(ydist = dist_normal(y_mean, y_sd)))',
    gofish="""
const y = dist.normal({ mean: "y_mean", sd: "y_sd" });
chart(analyticalDf, { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) }).mark(
  lineribbon(y, { along: "x", levels: [0.5, 0.8, 0.95], fill: "level" })
);
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note='The analytic version of entry 72.',
)

E[81] = dict(
    title='Eleven curves (draws) as lines, alpha = 0.2',
    gofish="""
chart(curves, { schema: { y: { draws: ".draw" } } })
  .flow(group({ by: ".draw" }), scatter({ by: "x", x: "x", y: "y" }))
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
  chart(curves, { color: Color.palette(["#3182bd"]) }).mark(lineribbon("y", { along: "x", levels: [0.5], fill: "level" })),
  chart(curves, { schema: { y: { draws: ".draw" } } })
    .flow(group({ by: ".draw" }), scatter({ by: "x", x: "x", y: "y" }))
    .mark(line({ opacity: 0.15 })),
]);
""",
    uses_up='band: quantile(p) and median folds per cell, with one cell per x; curves: group({ by: ".draw" }), the plain overlay, over draws declared shared in the schema',
    fit='fits',
    verdict='ok',
    note="The pointwise band is narrow in the middle where the curves cross, which is the point of the next entry. The band is a pair of quantile folds at each x, and the median line is a line through median folds, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[83] = dict(
    title='50% curvewise intervals with curve_interval()',
    gofish="""
// curves: one row per .draw and x, draws shared across x
const kept = (width) =>
  chart(curves, { schema: { y: { draws: ".draw" } } })
    .flow(
      // fold per draw: the mean over x of the pointwise depth min(level, 1 - level),
      // then keep the deepest share of the draws. gap: a fold whose result a later
      // filter reads; written as a derive over the rows
      derive(keepDeepest({ by: ".draw", depth: (r) => Math.min(r.level, 1 - r.level), share: width })),
      scatter({ by: "x", x: "x", yMin: field("y").min(), yMax: field("y").max() })
    )
    .mark(rect({ w: 0 }))
    .layer(ribbon({ fill: "#3182bd" }));
layer([
  kept(0.5),
  chart(curves, { schema: { y: { draws: ".draw" } } })
    .flow(group({ by: ".draw" }), scatter({ by: "x", x: "x", y: "y" }))
    .mark(line({ opacity: 0.15 })),
]);
""",
    uses_up='a fold per draw (mean depth from level), a filter on its rank, then min and max folds per x',
    fit='gofish-gap',
    verdict='ok',
    note="curve_interval's default, mhd, scores each whole curve by its mean halfspace depth over x. The pointwise depth is min(level, 1 - level), so the score is a fold per draw of the level column, and the band is the min and max folds of the kept draws at each x. That is the 'fold per draw' row of the table, and version 1 could not write it. The missing piece is general: a fold whose result a later step reads, written here as a derive (keepDeepest is plain JavaScript over the rows). Because it is a derive, the checker cannot see that it keeps whole draws.",
)

E[84] = dict(
    title='point_interval() vs curve_interval() on 1000 curves',
    gofish="""
// largeCurves: one row per .draw and x, draws shared across x
const kept = (width) =>
  chart(largeCurves, { schema: { y: { draws: ".draw" } } })
    .flow(
      // fold per draw: the mean over x of the pointwise depth min(level, 1 - level),
      // then keep the deepest share of the draws. gap: a fold whose result a later
      // filter reads; written as a derive over the rows
      derive(keepDeepest({ by: ".draw", depth: (r) => Math.min(r.level, 1 - r.level), share: width })),
      scatter({ by: "x", x: "x", yMin: field("y").min(), yMax: field("y").max() })
    )
    .mark(rect({ w: 0 }))
    .layer(ribbon({ fill: "#3182bd" }));
const pointwise = layer([
  chart([{ y: 1 }]).mark(rect({ y: "y", h: 1, strokeDasharray: "4 3" })),
  chart(largeCurves, { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) }).mark(
    lineribbon("y", { along: "x", levels: [0.5, 0.8, 0.95], fill: "level" })
  ),
]);
const curvewise = layer([kept(0.95), kept(0.8), kept(0.5)]);
spread({ dir: "y", spacing: 16 }, [pointwise, curvewise]);
""",
    uses_up='pointwise: quantile(p) and median folds per cell, with one cell per x; curvewise: as entry 83',
    fit='gofish-gap',
    verdict='ok',
    note='The pointwise panel fits. The curvewise panel is entry 83 at three widths, with the same gap.',
)

E[85] = dict(
    title='mtcars bootstrap loess fits as spaghetti, with the data',
    gofish="""
layer([
  chart(mtcarsBoot.filter((d) => d[".draw"] < 400), { schema: { hp: { draws: ".draw" } } })
    .flow(group({ by: ".draw" }), scatter({ by: "mpg", x: "mpg", y: "hp" }))
    .mark(line({ opacity: 0.1 })),
  chart(mtcars).flow(scatter({ x: "mpg", y: "hp" })).mark(circle({ r: 1.5 })),
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
  chart(mtcarsBoot, { color: Color.palette(["#deebf7", "#9ecae1", "#3182bd"]) }).mark(
    lineribbon("hp", { along: "mpg", levels: [0.5, 0.7, 0.9], fill: "level" })
  ),
  chart(mtcars).flow(scatter({ x: "mpg", y: "hp" })).mark(circle({ r: 1.5 })),
]);
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Pointwise bands over shared draws. The band is a pair of quantile folds at each x, and the median line is a line through median folds, which rule 3.2 treats as a summary. Version 1's rule warned here.",
)

E[87] = dict(
    title='curve_interval(hp, .width = c(.5, .7, .9)) of the bootstrap fits',
    gofish="""
// mtcarsBoot: one row per .draw and x, draws shared across x
const kept = (width) =>
  chart(mtcarsBoot, { schema: { hp: { draws: ".draw" } } })
    .flow(
      // fold per draw: the mean over x of the pointwise depth min(level, 1 - level),
      // then keep the deepest share of the draws. gap: a fold whose result a later
      // filter reads; written as a derive over the rows
      derive(keepDeepest({ by: ".draw", depth: (r) => Math.min(r.level, 1 - r.level), share: width })),
      scatter({ by: "mpg", x: "mpg", yMin: field("hp").min(), yMax: field("hp").max() })
    )
    .mark(rect({ w: 0 }))
    .layer(ribbon({ fill: "#3182bd" }));
layer([
  kept(0.9),
  kept(0.7),
  kept(0.5),
  chart(mtcars).flow(scatter({ x: "mpg", y: "hp" })).mark(circle({ r: 1.5 })),
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
// band contains it at every x. That is not a fold of
// one draw's rows, and not a function of level.
""",
    uses_up='(would be) a statistic over pairs of whole draws, a filter on its rank, then min and max folds per x',
    fit='does-not-fit',
    verdict='ok',
    note="bd-mbd ranks curves by band depth: the share of pairs of other curves whose band contains a curve at every x, with modified band depth to break ties. The table's 'fold per draw' covers mhd and modified band depth, which are means over x of functions of level. Band depth itself needs every pair of draws at once, so it is not a fold per draw.",
)

E[89] = dict(
    title='The ABC data: response by condition',
    gofish="""
chart(ABC)
  .flow(spread({ by: "condition", dir: "y" }), scatter({ x: "response" }))
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
const x = dist.studentT({ df: "df", mu: "estimate", sigma: "std.error" });
chart(tidyCoefs)
  .flow(spread({ by: "term", dir: "y" }))
  .mark(layer([slab(x), pointinterval(x)]));
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='fits',
    verdict='ok',
    note='A half-eye of a confidence distribution, with a t family in the dist namespace.',
)

E[91] = dict(
    title='stat_halfeye(scale = .5) of fitted means, with the data as ticks below',
    gofish="""
const x = dist.studentT({ df: "df", mu: ".fitted", sigma: ".se.fit" });
layer([
  chart(fitted).flow(spread({ by: "condition", dir: "y" })).mark(layer({ h: 30 }, [slab(x), pointinterval(x)])),
  chart(ABC)
    .flow(spread({ by: "condition", dir: "y" }).translate({ y: -10 }), scatter({ x: "response" }))
    .mark(rect({ w: 1, h: 8 })),
]);
""",
    uses_up='folds per cell: the density fold for the slab, quantile(p) and median folds for the interval (exact on a Dist, which is n = Infinity; over the rows on a sample)',
    fit='gofish-gap',
    verdict='ok',
    note="The data ticks sit just below each half-eye's baseline; as with the raincloud in elaborations.md, placing a second chart's rows relative to the slab's zero line is not expressible, so this relies on a hand offset that matches only if both spreads give identical rows.",
)

E[92] = dict(
    title="stat_gradientinterval(fill_type = 'gradient') of fitted means",
    gofish="""
const x = dist.studentT({ df: "df", mu: ".fitted", sigma: ".se.fit" });
chart(fitted)
  .flow(spread({ by: "condition", dir: "y" }))
  .mark(
    layer([
      slab(x, { thickness: 1, h: 30, opacity: x.density, normalize: "group", fill: SLAB }), // gap: opacity along one region
      pointinterval(x),
    ])
  );
""",
    uses_up='a density fold per cell, scaled so its peak is 1, read as opacity along the slab (the second kind of ggdist mark)',
    fit='gofish-gap',
    verdict='ok',
    note='The gradient interval of entry 18 on t distributions: a density fold scaled to its peak, read as opacity. GoFish has no opacity that varies along one region, so the spec marks it as a gap.',
)

E[93] = dict(
    title='stat_ccdfinterval() of fitted means',
    gofish="""
const x = dist.studentT({ df: "df", mu: ".fitted", sigma: ".se.fit" });
layer([
  chart(sample(fitted, { n: Infinity }))
    .flow(spread({ by: "condition", dir: "y" }), spread({ by: "level", dir: "y", spacing: 0 }))
    .mark(rect({ dims: { x: { min: -1.5, max: x } }, fill: SLAB })),
  chart(fitted).flow(spread({ by: "condition", dir: "y" })).mark(pointinterval(x)),
]);
""",
    uses_up='spread({ by: "level" }), n = Infinity',
    fit='fits',
    verdict='ok',
    note="The CCDF bar is the limit of the sorted bars, and rule 3.1 allows level at n = Infinity. Each bar must run from a fixed point at or below the support to the draw; ggdist uses the axis's lower limit, -1.5 here. A bar from 0 would be wrong, since the distributions cross 0. Version 1's sort named a column that did not exist; level is a column sample writes.",
)

E[94] = dict(
    title='stat_dots(quantiles = 100) of fitted means',
    gofish="""
const x = dist.studentT({ df: "df", mu: ".fitted", sigma: ".se.fit" });
chart(sample(fitted, { n: 100, at: "quantiles" }))
  .flow(
    spread({ by: "condition", dir: "y" }),
    partition({ by: x.bin(Bin.step(0.05)), dir: "x" }),
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
const y = dist.studentT({ df: "df", mu: ".fitted", sigma: ".se.fit" });
layer([
  chart(fittedMpg, { color: Color.palette("Set2") })
    .flow(group({ by: "cyl" }))
    .mark(lineribbon(y, { along: "hp", levels: [0.5, 0.8, 0.95], fill: "cyl", stroke: "cyl", opacity: 0.25 })),
  chart(mtcars).flow(scatter({ x: "hp", y: "mpg" })).mark(circle({ r: 1.5, fill: "cyl" })),
]);
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
    fit='fits',
    verdict='ok',
    note="Three nested translucent bands per cylinder count. The fill and stroke use two palettes in ggdist (Set2 and Dark2) for one field, which GoFish's single color scale per field cannot do; a minor color difference.",
)

E[96] = dict(
    title='stat_lineribbon with fill = cyl, fill_ramp = level, with the data',
    gofish="""
const y = dist.studentT({ df: "df", mu: ".fitted", sigma: ".se.fit" });
layer([
  chart(fittedMpg).flow(group({ by: "cyl" })).mark(lineribbon(y, { along: "hp", levels: [0.5, 0.8, 0.95], fill: "cyl" })), // + lightened by level
  chart(mtcars).flow(scatter({ x: "hp", y: "mpg" })).mark(circle({ r: 1.5, fill: "cyl" })),
]);
""",
    uses_up='quantile(p) and median folds per cell, with one cell per x',
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
