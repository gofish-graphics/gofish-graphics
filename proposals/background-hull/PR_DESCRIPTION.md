# Background and hull: an API proposal for `enclose` with `Shape.box/blob/hull/spine`

**Summary.**
This proposal turns `enclose` into one relational mark that draws an outline around a set of nodes, chosen with `shape: Shape.box() | Shape.blob() | Shape.hull() | Shape.spine()`, and deletes the `background` alias.
It is a design PR: the proposal, its surveys and pictures, and throwaway prototype stories that render the pictures. It makes no library change.
Review page: https://claude.ai/artifact/2esKYS7PvWVMdoyVny6uLP. Slider playground: https://claude.ai/artifact/AscJNscgnnnSRZReMhTetF. Both are private claude.ai artifacts.

The full text is `proposals/background-hull/proposal.md`. Every picture below is a real render of a prototype story. `Shape` does not exist yet, so those stories place their members at fixed pixel positions, compute each outline with story-local code, and draw it with `polygon`. The code beside each picture is the proposed spelling, not the story's code.

## Recommended syntax

```js
// one hull per species: group the points in a second layer
chart(penguins)
  .flow(scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
  .mark(circle({ r: 3, fill: "Species" }).name("points"))
  .layer(
    chart(selectAll("points"))
      .flow(group({ by: "Species" }))
      .mark(
        enclose({
          shape: Shape.hull(),
          padding: 6,
          fill: "Species",
          opacity: 0.2,
        })
      )
  );

// a set that contains a and c but not b (combinator form over refs)
layer([a, b, c]).relate(({ a, b, c }) => [
  enclose(
    {
      shape: Shape.spine({
        avoiding: [b],
        neck: 0.85,
        clearance: 6,
      }),
      padding: 22,
      fill: "#ff2400",
    },
    [a, c]
  ),
]);

// the component case: fresh children
enclose(
  {
    padding: 20,
    fill: "#252150",
    stroke: "none",
    shape: Shape.box({ rx: 16, ry: 16 }),
  },
  [
    spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      planets.map((d) => circle(d))
    ),
  ]
);
```

```python
(chart(penguins)
   .flow(scatter(x="Beak Length (mm)", y="Beak Depth (mm)"))
   .mark(circle(r=3, fill="Species").name("points"))
   .layer(
       chart(select_all("points"))
         .flow(group(by="Species"))
         .mark(enclose(shape=Shape.hull(), padding=6, fill="Species", opacity=0.2))))

layer([a, b, c]).relate(lambda a, b, c: [
    enclose([a, c], shape=Shape.spine(avoiding=[b], neck=0.85, clearance=6),
            padding=22, fill="#ff2400"),
])

enclose([spread([circle(**d) for d in planets], dir="x", spacing=50, alignment="middle")],
        padding=20, fill="#252150", stroke="none", shape=Shape.box(rx=16, ry=16))
```

## Presets

| Value               | Is exactly                                       | Draws                                                             |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `Shape.box(opts)`   | its own member; options `rx`, `ry`               | the padded bounding box with rounded corners; the default `shape` |
| `Shape.blob(opts)`  | the general region                               | discs, links and filled triangles, rounded                        |
| `Shape.hull(opts)`  | `Shape.blob({ convexity: 1, neck: 1, ...opts })` | the convex hull grown by `padding`, rounded                       |
| `Shape.spine(opts)` | `Shape.blob({ convexity: 0, ...opts })`          | the routed spanning tree of tubes and nothing else, rounded       |

A shortcut makes the same object as the general call, the way `sina()` and `jitter()` are presets of `noise()` (#1018), and any option overrides the preset.

## Parameters

| Parameter             | On           | Meaning                                                                                                                                                             | Default           |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `padding`             | `enclose`    | The bulge around each member, from the member's own outline. Exact for a member on its own.                                                                         | as today          |
| `fill`, `stroke`, ... | `enclose`    | Paint, shared by every member of the family.                                                                                                                        | as today          |
| `rx`, `ry`            | `Shape.box`  | Corner rounding, as on `rect`.                                                                                                                                      | 0                 |
| `convexity`           | `Shape.blob` | The silhouette: how much of the space between members is filled, from 0 (a spanning tree of links) to 1 (every Delaunay triangle, so the convex hull).              | 0.5               |
| `holes`               | `Shape.blob` | Whether a hole inside the silhouette that holds no avoided node stays a hole. As `allow_holes` in PostGIS and Shapely, and `isHolesAllowed` in JTS.                 | `false`           |
| `roundness`           | `Shape.blob` | How far the outline's corners are rounded, in pixels. It changes curvature only: the pieces and holes stay the same.                                                | same as `padding` |
| `neck`                | `Shape.blob` | How far the outline is pulled in between members, from 0 to 1. A lone link becomes a tube `neck` times the bulge. It changes shape only, never the pieces or holes. | 1                 |
| `avoiding`            | `Shape.blob` | Nodes to keep out. Each listed node that is not a member is avoided.                                                                                                | none              |
| `clearance`           | `Shape.blob` | Gap in pixels kept from each avoided node.                                                                                                                          | 4                 |

## Open decisions

1. Keep `enclose` as the one name and delete the `background` alias? (Alternatives: keep `background` and delete `enclose`; or rename to `hull`.)
2. Make `enclose` a relational mark now, and defer any `.background()` modifier?
3. One general member with two shortcuts: name it `blob` (or `kelp`, `bubble`), and keep the shortcut names `hull` and `spine`?
4. Option key and family `shape: Shape.*`, or `outline: Outline.*`?
5. The blob's parameters and defaults: `convexity` 0.5, `roundness` equal to `padding`, `neck` 1, `clearance` 4 px (the teal cells in section 3)?
6. `avoiding` on `Shape.blob()`, so also on both shortcuts, with "avoid each listed node that is not a member", and `Shape.hull({ avoiding })` drawing the hull with each other node inside it cut out as a round hole?
7. Draw ellipses through the #1101 custom-shape function first, and add `Shape.ellipse()` only when examples call for it?
8. Move `rx`/`ry` from `enclose` into `Shape.box({ rx, ry })`?
9. For rows that carry refs (the hyperedge example), name the ref column with a `members` option, by analogy with `line({ from, to })`? The same example also needs `resolve` to take a list of selections (dataset (d)).
10. In a chart, should a spine stay inside the plot area by rule, or should the user list the axis in `avoiding` (the trout example, History v9)?
11. Confirm `holes` (default `false`), following PostGIS, Shapely and JTS, with `convexity` as the silhouette only.
12. Keep all rounding inside `Shape.blob()` (the outline rounding of step 6), and add no `curve` key to `enclose`? (History, v4, shows why a curve through the outline cannot keep `padding` or `clearance`.)
13. Confirm: a graph's edges are enclosed as members (dataset (d)), with no separate edge parameter (History, v5). Box and hull contain line members too, since members are just shapes, and the blob reads their geometry through #974's `boundary` query.
14. Should `roundness` go past the smallest circle in the region, so a hull's corners can round more than the members' grown radius? The cost is that `padding` and `clearance` become approximate near those circles.
15. Should `Shape.spine()` keep the one default `holes: false`, so a spine over a cycle of edges is filled? (Recommended: yes. In the data, the holes a spine leaves are mostly small gaps between touching dots, five per penguin species; a ring is `Shape.spine({ holes: true })`.)
16. An open question, not a decision to make now. Members versus links: a graph edge is both a contained member and the enclosure's own link. Should segment members be drawn like links (thinned by `neck`), and should different member kinds get their own padding? Revisit once more member kinds exist (labels, areas, nested enclosures). For now each edge keeps its padding band, as a declared shortcut (History, v10).

## Pictures

### The discrete choice: box, hull, blob and spine

![penguins: box, hull, blob and spine](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/penguins-four-shapes.png)

```js
chart(penguins)
  .flow(
    group({ by: "Species" }),
    scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" })
  )
  .mark(circle({ r: 2.5, fill: "Species" }))
  .layer(enclose({ shape, padding: 6, fill: "Species", opacity: 0.15 }));
// shape: Shape.box(), Shape.hull(), Shape.blob() or Shape.spine()
```

### Dataset explorer: the U with non-members inside

Columns are `convexity` (0, 0.25, 0.5, 0.75, 1) and rows are `roundness`. Down a column the pieces and holes never change. The teal frame marks the defaults.

![U cloud: convexity by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/explore-round-u.png)

```js
enclose(
  { shape: Shape.blob({ convexity, roundness, avoiding: others }), padding: 8 },
  members
);
```

### Dataset explorer: penguins

![penguins: convexity by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/explore-round-penguins.png)

```js
.layer(enclose({ shape: Shape.blob({ convexity, roundness }), padding: 6, fill: "Species", opacity: 0.15 }))
```

### Munkres' three-point topology

The recommended spelling (`neck: 0.85`, `padding: 22`, `roundness` at its default), then the panel with `neck` across and `roundness` down. The pairs and the whole set are ellipses drawn through the custom-shape function.

![Munkres panel](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/topology-munkres-panel-smooth.png)

![Munkres panel: neck by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/explore-round-munkres.png)

```js
layer([a, b, c]).relate(({ a, b, c }) => [
  enclose({ shape: oval, padding: 30 }, [a, b, c]),
  enclose({ shape: oval, padding: 16 }, [a, b]),
  enclose({ shape: oval, padding: 16 }, [b, c]),
  enclose(
    {
      shape: Shape.spine({ avoiding: [b], neck, roundness, clearance: 6 }),
      padding: 22,
    },
    [a, c]
  ),
]);
```

### Hyperedges over a node-link graph, with the edges as members

![hyperedges with edges as members: convexity by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/explore-round-hyperedges-members.png)

```js
layer([
  graph, // nodes named "nodes" (keyed by id), edges named "edges" (keyed by id)
  chart(setMembers) // rows { set, member }: the set's nodes, then the edges among them
    .flow(
      resolve(["member"], { from: [selectAll("nodes"), selectAll("edges")] }), // new: a list
      group({ by: "set" })
    )
    .mark(
      enclose({
        members: "member", // new (decision 9): the column whose refs are the operands
        shape: Shape.spine({ avoiding: selectAll("nodes") }),
        padding: 6,
        fill: "set",
        opacity: 0.25,
      })
    ),
]);
```

### ChartAccent: Sub-Saharan Africa on fertility against life expectancy

A replica of ChartAccent's example 5 (Ren et al., PacificVis 2017), on its own sample data.

![ChartAccent replica](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/chartaccent-replica.png)

```js
chart(countries)
  .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
  .mark(circle({ area: "Population", fill: "Region" }).name("countries"))
  .layer(
    chart(selectAll("countries"))
      .flow(filter((d) => d.Region === "Sub-Saharan Africa"))
      .mark(
        enclose({
          shape: Shape.blob({ convexity: 0.25, neck: 0.6 }),
          padding: 6,
          fill: "#47b8a0",
          opacity: 0.3,
        })
      )
  );
```

### Holes on and off

Hyperedges at `convexity: 0.35` and penguins at 0.25. The default, `holes: false`, fills every hole that holds no avoided node.

![holes on and off](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-NUMBER/holes-hyperedges-penguins.png)

```js
enclose(
  {
    shape: Shape.blob({
      convexity: 0.35,
      holes: true,
      avoiding: selectAll("nodes"),
    }),
    padding: 6,
  },
  setNodesAndEdges
);
```

## Why delaunator

The prototype uses Delaunator to compute the Delaunay triangulation of a set's member points, which is the first step of the blob construction. A Delaunay triangulation connects the points into triangles so that no point lies inside the circle through any triangle's three corners. This links each point to its natural neighbors and avoids long thin triangles.

It has two uses.

- **Convexity.** The filled triangles are the Delaunay triangles whose circumradius is below the alpha that `convexity` sets. This is the definition of an alpha shape. At `convexity: 1` every triangle fills, and their union is the convex hull.
- **The spanning tree.** The Euclidean minimum spanning tree that keeps a set in one piece always lies within the Delaunay triangulation. So the tree only considers the triangulation's edges, about 3n of them, instead of all n² pairs of points. That is part of why the penguins take about 11 ms per slider step.

Delaunator is the standard library for this. It comes from Mapbox, and `d3-delaunay` is built on it. It was already in the lockfile as a transitive dependency, through `d3-delaunay`. This PR makes `delaunator` a direct devDependency of `gofish-graphics`, pinned to exactly `5.1.0`, used only by the prototype stories and the playground build. Nothing in the library's source or runtime imports it.

## What CI skips and why

- **Python parity.** The prototype stories file is listed in `tests/.python-sync-exempt`, the existing mechanism for stories with nothing for a Python story to match. These stories compute their outlines in story-local JS.
- **Gallery and docs examples.** Only stories tagged `gallery` are published to the docs. The prototype stories have no tag, so nothing reaches the docs site.
- **Lint and format.** `packages/gofish-graphics/stories/**` is already ignored by ESLint and Prettier. The playground sources under `proposals/` are linted (warnings only, for unused helpers copied from the stories) and were formatted by lint-staged.
- **Typecheck.** No tsconfig includes `stories/` or `proposals/`, so neither CI typecheck job reads them.
- **Not skipped: Visual Tests and Storybook.** The JS capture renders every story under `stories/`, and there is no existing way to leave one out. The 52 prototype stories render, so Visual Tests will report them as new stories without baselines until they are accepted on the review site. Chromatic will also publish them under "Proposals/Background Hull".

## Related issues

- Advances #717 (enclose as a relation: concave hulls for `enclose`, and Josh's one-`enclose`-with-a-`shape` sketch)
- Advances #397 (bring back a bubble-set enclosure)
- Advances #974 (a `boundary` geometry query; hull enclosures and edges as members are its first users)
- Advances #47 (stacked and divided ribbons, where a `by` option on relational marks may come back)
- Advances #877 (a `selectAll` plus `group({ by })` before a relational mark is ignored; the penguin spelling depends on its fix)
- Advances #957 (screen-space curves; whether its candidates work for closed curves such as enclosures)
- Advances #1101 (custom strategies; the ellipse is drawn through its function hatch)

## Also in this branch

A small edit to the `api-proposal` skill (`.claude/skills/api-proposal/SKILL.md`): it now asks the proposal to survey nearby GoFish API decisions for consistency. It is unrelated to this proposal's content.

## Images to upload

(For the coordinator; remove this section once the images are uploaded.) Copy these files to the `pr-assets` branch under `pr-NUMBER/`, keeping their file names:

- `proposals/background-hull/img/penguins-four-shapes.png`
- `proposals/background-hull/img/explore-round-u.png`
- `proposals/background-hull/img/explore-round-penguins.png`
- `proposals/background-hull/img/topology-munkres-panel-smooth.png`
- `proposals/background-hull/img/explore-round-munkres.png`
- `proposals/background-hull/img/explore-round-hyperedges-members.png`
- `proposals/background-hull/img/chartaccent-replica.png`
- `proposals/background-hull/img/holes-hyperedges-penguins.png`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
