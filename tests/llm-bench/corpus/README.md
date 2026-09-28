# Chart-type corpus

This folder holds the list of chart types for the LLM authoring benchmark
(issue #946). It is a list of chart types and the references we will build
tasks from. It holds no tasks. Each row in `manifest.csv` is one chart type,
or a second dataset for a chart type that is already in the list.

**Licensing caveat. The Gramener repository has no license. We use it
internally only. We must ask Gramener (Pratap Vardhan) for permission before
the benchmark or any task built from these specs is published.**

## Sources

Every URL in the manifest is pinned to one commit of its repository.

| Source                              | Repository                                                                                                                                                            | Commit                                     | License                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------ |
| FT Visual Vocabulary, as Vega specs | [gramener/visual-vocabulary-vega](https://github.com/gramener/visual-vocabulary-vega/tree/7540b19537863585dc64f548ee906c4b4322f54e) `spec/`                           | `7540b19537863585dc64f548ee906c4b4322f54e` | none (internal use only) |
| FT chart categories                 | [ft-interactive/visual-vocabulary](https://github.com/ft-interactive/visual-vocabulary/blob/d65c09f1c864d71618f28e1a8b34c0478beea7b9/chartTypes.csv) `chartTypes.csv` | `d65c09f1c864d71618f28e1a8b34c0478beea7b9` | used for categories only |
| From Data to Viz (d2v)              | [holtzy/data_to_viz](https://github.com/holtzy/data_to_viz/tree/253d428fdc4dd04c20bce6c1828448f423d27c05) `graph/*.Rmd`                                               | `253d428fdc4dd04c20bce6c1828448f423d27c05` | MIT                      |
| RAWGraphs                           | [rawgraphs/rawgraphs-charts](https://github.com/rawgraphs/rawgraphs-charts/tree/dba66b4c5341344e239c9a86e4ed2f6ed7f157d2) `example/configurations/`                   | `dba66b4c5341344e239c9a86e4ed2f6ed7f157d2` | Apache-2.0               |

Two d2v pages read data from other repositories, and we pinned those too. The
ridgeline data is `zonination/perceptions` at `51207062` (MIT). The hexbin map
data is `holtzy/R-graph-gallery` at `35d47a24`.

From RAWGraphs we took only the chart types the other two sources lack, plus
five second datasets (the alt-dataset rows).

## Columns

- `id` is the chart type in kebab-case. An alt-dataset row has the id
  `<parent>--<dataset>`.
- `family` is the FT category. `family_source` is `ft` when FT gives the
  category and `inferred` when we picked the closest FT category ourselves.
- `sources` lists every source that has the chart type. `primary_source` and
  `primary_ref_url` name the one we will build from. `variant_refs` lists the
  other references, including the Gramener `-2` specs.
- `data_kind` is one of `inline` (values in the spec), `repo-file` (a file in
  the source repository), `external-url` (a file in another repository),
  `package` (a dataset from an R or Python package), `generated` (random data
  made in code) or `none`. `dataset_ref` is the pinned URL, `inline`,
  `generated` or `package:<package>/<dataset>`.
- `scope` is `core`, `stretch` or `excluded`. `split` is `tune`, `heldout` or
  `—` for excluded rows.
- `existing_tasks` lists the task files in `../tasks/` that already cover the
  chart type.

## Rules

**Deduplication.** Each chart type has one row, even when several sources have
it. We took the primary reference from Gramener first, then d2v, then
RAWGraphs, because the Gramener specs run as they are. Some charts share a name
but are different charts, so they have separate rows:

- FT `arc` (a half donut of seats) is `parliament-arc`, and the d2v arc diagram is `arc-diagram`.
- FT `contour-map` is geographic, and the d2v 2D density plot is `density-2d`.
- The d2v hexbin map is `hexbin-map`, and RAWGraphs hexagonal binning is `hexbin`.
- The FT spatial heat map is `geo-heat-map`, and the FT XY heatmap is `xy-heatmap`.

We merged these into one row:

- Each Gramener `-2` spec goes into its base row as a variant.
- Bar, column, ordered bar and ordered column are one `bar` row, because
  they differ only in direction and sort order. Paired bar and paired column
  are one `paired-bar` row. The ordered proportional symbol is part of
  `proportional-symbol`.
- The FT area chart (stacked) and the d2v area and stacked area pages are one
  `area` row.
- The FT Priestley timeline and the RAWGraphs Gantt chart are one
  `priestley-timeline` row, because both draw one bar per entity along a time
  axis. The Gantt data (several terms per politician, colored by role) is an
  alt-dataset row.

The d2v file `list_all.txt` also names spider, pie and connection, but those
pages have no Rmd file at the pinned commit. The FT rows `radar`, `pie` and
`flow-map` cover them.

**Scope.** We flag rows and do not delete them. Geographic maps are
`excluded` with the reason "geo: needs map projection + geodata", so we can add
them back later. The word cloud is also `excluded`. These rows are `stretch`
because they need a heavy layout or geometry step: `voronoi`,
`voronoi-treemap`, `network`, `edge-bundling` and `density-2d`. All other rows
are `core`.

**Split.** A chart type in scope is held out when the first byte of
`sha1(id)` is below 51, which should hold out about 20% of rows. We did not pick
any row by hand. Alt-dataset rows are always held out, because they test a
chart type we tune on with data the model has not seen. With the current ids
the hash holds out 7 of 68 chart types (10%), which is fewer than the 20% the
rule aims for. It also leaves three families with no held-out chart type:
deviation, ranking and flow. We report this and did not change the rule to fix
it.

## Counts

Chart-type rows only (80 rows). The five alt-dataset rows are all core and
held out, in ranking (2), magnitude, part-to-whole and change over time.

| Family           | Core | Stretch | Excluded | Tune | Held out |
| ---------------- | ---: | ------: | -------: | ---: | -------: |
| deviation        |    4 |       0 |        0 |    4 |        0 |
| correlation      |    8 |       1 |        0 |    8 |        1 |
| ranking          |    4 |       0 |        0 |    4 |        0 |
| distribution     |   11 |       0 |        0 |    9 |        2 |
| change over time |   11 |       0 |        0 |    9 |        2 |
| magnitude        |   10 |       0 |        1 |    9 |        1 |
| part-to-whole    |   10 |       2 |        0 |   11 |        1 |
| spatial          |    0 |       0 |       11 |    0 |        0 |
| flow             |    5 |       2 |        0 |    7 |        0 |
| total            |   63 |       5 |       12 |   61 |        7 |

The held-out chart types are `boxplot`, `violin`, `line`, `horizon`,
`proportional-symbol`, `voronoi` and `convex-hull`.

## New and existing

Existing tasks cover 14 of the 68 chart types in scope:

- `bar`
- `paired-bar`
- `stacked-column`
- `scatterplot`
- `bubble`
- `line`
- `histogram`
- `pie`
- `donut`
- `marimekko`
- `treemap`
- `waffle`
- `circle-packing`
- `ridgeline`

The other 54 chart types in scope are new. Four existing tasks match no row,
because they are custom charts: `create-bottle-fill`, `create-bottle-image`,
`create-scatter-pies` and `create-ribbon`.

## Checking the manifest

```bash
pnpm --filter @gofish/tests exec tsx llm-bench/corpus/build-manifest.ts          # check
pnpm --filter @gofish/tests exec tsx llm-bench/corpus/build-manifest.ts --write  # fill split, then check
```

The script checks that ids are unique, that enum columns hold known values,
that every URL is pinned to a commit, that the listed task files exist and that
`split` follows the rule. It prints the counts above. Run it with `--write`
after you add or rename a row.
