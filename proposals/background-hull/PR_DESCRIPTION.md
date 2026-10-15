# Background and hull: an API proposal for `enclose` with `Shape.box/blob/hull/spine`

This proposes one relational mark, `enclose`, that outlines a set of nodes with `shape: Shape.box() | Shape.hull() | Shape.blob() | Shape.spine()`, and deletes the `background` alias.
It is a design PR: a proposal plus throwaway prototype stories that render the pictures. It makes no library change.
Private claude.ai pages: [review page](https://claude.ai/artifact/2esKYS7PvWVMdoyVny6uLP) and [slider playground](https://claude.ai/artifact/AscJNscgnnnSRZReMhTetF).

![penguins: box, hull, blob and spine](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/penguins-four-shapes-v2.png)

**Box**

```js
enclose({ shape: Shape.box(), padding: 6 }, species);
```

**Hull**

```js
enclose({ shape: Shape.hull(), padding: 6 }, species);
```

**Blob**

```js
enclose({ shape: Shape.blob({ convexity: 0.75 }), padding: 6 }, species);
```

**Spine**

```js
enclose({ shape: Shape.spine(), padding: 6 }, species);
```

The penguins sit in the usual `chart(penguins).flow(scatter(...))` chart. The enclosure is a second layer, grouped by species:

```js
chart(selectAll("points"))
  .flow(group({ by: "Species" }))
  .mark(enclose({ shape: Shape.hull(), padding: 6, fill: "Species" }));
```

Every picture is a real render of a prototype story. `Shape` does not exist yet, so the stories compute each outline in story-local code and draw it with `polygon`. The code under each picture is the proposed spelling, not the story's code. The full text is `proposals/background-hull/proposal.md`.

## Examples

### The U: non-members inside

Columns are `convexity` (0 to 1) and rows are `roundness`; the teal frame marks the defaults.

![U cloud: convexity by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/explore-round-u.png)

```js
enclose(
  { shape: Shape.blob({ convexity, roundness, avoiding: others }), padding: 8 },
  members
);
```

### Penguins

![penguins: convexity by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/explore-round-penguins.png)

```js
enclose({
  shape: Shape.blob({ convexity, roundness }),
  padding: 6,
  fill: "Species",
});
```

### Munkres' three-point topology

The {a, c} set wraps a and c and passes under b; the other three sets are ellipses.

![Munkres panel](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/topology-munkres-panel-smooth.png)

**{a, c}, avoiding b**

```js
enclose(
  {
    shape: Shape.spine({ avoiding: [b], neck: 0.85, clearance: 6 }),
    padding: 22,
  },
  [a, c]
);
```

**The whole set**

```js
enclose({ shape: oval, padding: 30 }, [a, b, c]);
```

**The pairs**

```js
enclose({ shape: oval, padding: 16 }, [a, b]);
enclose({ shape: oval, padding: 16 }, [b, c]);
```

All four sit in `layer([a, b, c]).relate(({ a, b, c }) => [ ... ])`. `oval` is a custom-shape function (#1101).

The {a, c} set again, with `neck` across and `roundness` down.

![Munkres panel: neck by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/explore-round-munkres.png)

```js
enclose(
  {
    shape: Shape.spine({ avoiding: [b], neck, roundness, clearance: 6 }),
    padding: 22,
  },
  [a, c]
);
```

### Hyperedges over a node-link graph

Each set encloses its nodes and the edges among them as members.

![hyperedges with edges as members: convexity by roundness](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/explore-round-hyperedges-members-v2.png)

**The enclosure** (`members` is new, decision 9)

```js
enclose({
  members: "member",
  shape: Shape.spine({ avoiding: selectAll("nodes") }),
  padding: 6,
  fill: "set",
});
```

**The flow before it** (`resolve` taking a list is new)

```js
chart(setMembers).flow(
  resolve(["member"], { from: [selectAll("nodes"), selectAll("edges")] }),
  group({ by: "set" })
);
```

### ChartAccent: Sub-Saharan Africa

A replica of ChartAccent's example 5 (Ren et al., PacificVis 2017), on its own sample data.

![ChartAccent replica](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/chartaccent-replica-v2.png)

```js
enclose({
  shape: Shape.blob({ convexity: 0.25, neck: 0.6 }),
  padding: 6,
  fill: "#47b8a0",
});
```

The layer filters `selectAll("countries")` to `Region === "Sub-Saharan Africa"` first.

### Holes on and off

Hyperedges at `convexity: 0.35` and penguins at 0.25.

![holes on and off](https://raw.githubusercontent.com/gofish-graphics/gofish-graphics/pr-assets/pr-1152/holes-hyperedges-penguins-v2.png)

**Off** (the default: every hole without an avoided node is filled)

```js
Shape.blob({ convexity: 0.35, avoiding: selectAll("nodes") });
```

**On**

```js
Shape.blob({ convexity: 0.35, holes: true, avoiding: selectAll("nodes") });
```

## Parameters

| Parameter        | On           | Meaning                                                               | Default   |
| ---------------- | ------------ | --------------------------------------------------------------------- | --------- |
| `padding`        | `enclose`    | Bulge around each member, from its own outline.                       | as today  |
| `fill`, `stroke` | `enclose`    | Paint, shared by every member of the family.                          | as today  |
| `rx`, `ry`       | `Shape.box`  | Corner rounding, as on `rect`.                                        | 0         |
| `convexity`      | `Shape.blob` | How much space between members fills: 0 is a spanning tree, 1 a hull. | 0.5       |
| `holes`          | `Shape.blob` | Keep holes that hold no avoided node (as `allow_holes` in PostGIS).   | `false`   |
| `roundness`      | `Shape.blob` | Corner rounding in pixels. Never changes pieces or holes.             | `padding` |
| `neck`           | `Shape.blob` | Pull-in between members, 0 to 1. Never changes pieces or holes.       | 1         |
| `avoiding`       | `Shape.blob` | Nodes to keep out. Members in the list are ignored.                   | none      |
| `clearance`      | `Shape.blob` | Gap in pixels from each avoided node.                                 | 4         |

## Presets

`Shape.hull(opts)` is `Shape.blob({ convexity: 1, neck: 1, ...opts })`. `Shape.spine(opts)` is `Shape.blob({ convexity: 0, ...opts })`.
`Shape.box({ rx, ry })` is its own member and the default. Presets work like `sina()` and `jitter()` over `noise()` (#1018): any option overrides them.

## Open decisions

1. Keep `enclose` as the one name and delete `background`? (Or keep `background`, or rename to `hull`.)
2. Make `enclose` a relational mark now, and defer a `.background()` modifier?
3. Name the general member `blob` (or `kelp`, `bubble`), with shortcuts `hull` and `spine`?
4. Spell it `shape: Shape.*` or `outline: Outline.*`?
5. Defaults: `convexity` 0.5, `roundness` = `padding`, `neck` 1, `clearance` 4 px?
6. `avoiding` on `Shape.blob()` and so on both shortcuts; `Shape.hull({ avoiding })` cuts each other node out as a round hole?
7. Draw ellipses through the #1101 custom-shape function, and add `Shape.ellipse()` only when examples call for it?
8. Move `rx`/`ry` from `enclose` into `Shape.box({ rx, ry })`?
9. Name the ref column with a `members` option, like `line({ from, to })`? The hyperedges also need `resolve` to take a list of selections.
10. In a chart, should a spine stay inside the plot area by rule, or should the user list the axis in `avoiding` (History v9)?
11. Confirm `holes` (default `false`), following PostGIS, Shapely and JTS, with `convexity` as the silhouette only.
12. Keep all rounding inside `Shape.blob()`, with no `curve` key on `enclose`? (History v4: a curve cannot keep `padding` or `clearance`.)
13. Confirm: graph edges are enclosed as members, read through #974's `boundary` query, with no separate edge parameter (History v5).
14. Let `roundness` go past the smallest circle in the region? Then `padding` and `clearance` become approximate there.
15. Decided: `Shape.spine()` keeps `holes: false`, so a spine over a cycle is filled. A ring is `Shape.spine({ holes: true })`.
16. Open question, not for now: should segment members thin like links, and get their own padding? For now each edge keeps its band, as a declared shortcut (History v10).
17. Recalibrate `convexity` to fill the smallest triangles first, up to c of the hull's area? Penguins at 0.5 go from 0 to 5 percent of the way to the hull to 25 to 40 percent. Weak spots: ChartAccent fills fast, and the U shows a sliver hole at 0.75. See `proposals/background-hull/img/convexity-calibration-old-vs-new.png`.

<details><summary>Full syntax (JS and Python)</summary>

**One hull per species (JS)**

```js
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
```

**One hull per species (Python)**

```python
(chart(penguins)
   .flow(scatter(x="Beak Length (mm)", y="Beak Depth (mm)"))
   .mark(circle(r=3, fill="Species").name("points"))
   .layer(
       chart(select_all("points"))
         .flow(group(by="Species"))
         .mark(enclose(shape=Shape.hull(), padding=6, fill="Species", opacity=0.2))))
```

**A set with a and c but not b (JS)**

```js
layer([a, b, c]).relate(({ a, b, c }) => [
  enclose(
    {
      shape: Shape.spine({ avoiding: [b], neck: 0.85, clearance: 6 }),
      padding: 22,
      fill: "#ff2400",
    },
    [a, c]
  ),
]);
```

**A set with a and c but not b (Python)**

```python
layer([a, b, c]).relate(lambda a, b, c: [
    enclose([a, c], shape=Shape.spine(avoiding=[b], neck=0.85, clearance=6),
            padding=22, fill="#ff2400"),
])
```

**Fresh children, the component case (JS)**

```js
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

**Fresh children, the component case (Python)**

```python
enclose([spread([circle(**d) for d in planets], dir="x", spacing=50, alignment="middle")],
        padding=20, fill="#252150", stroke="none", shape=Shape.box(rx=16, ry=16))
```

</details>

## Why delaunator

The prototype uses Delaunator for the Delaunay triangulation of a set's member points, the first step of the blob. It has two uses.

- **Convexity.** The filled triangles are those whose circumradius is below the alpha that `convexity` sets, which is an alpha shape. At 1 every triangle fills, giving the convex hull.
- **The spanning tree.** The minimum spanning tree always lies in the triangulation, so it checks about 3n edges instead of n² pairs. That keeps the penguins near 11 ms per slider step.

Delaunator is the standard library for this (Mapbox; `d3-delaunay` is built on it) and was already in the lockfile. This PR makes it a direct devDependency of `gofish-graphics`, pinned to `5.1.0`, used only by the prototype stories and the playground build. The library does not import it.

## What CI skips

- **Python parity.** The prototype stories file is in `tests/.python-sync-exempt`, since the outlines are story-local JS.
- **Gallery and docs.** The stories have no `gallery` tag, so nothing reaches the docs site.
- **Lint and format.** `stories/**` is already ignored. The playground under `proposals/` is linted (warnings only) and formatted.
- **Typecheck.** No tsconfig includes `stories/` or `proposals/`.
- **Not skipped: Visual Tests and Storybook.** The 52 prototype stories render, so Visual Tests reports them as new until accepted, and Chromatic publishes them under "Proposals/Background Hull".

## Related issues

- Advances #717 (concave hulls for `enclose`, and the one-`enclose`-with-a-`shape` sketch)
- Advances #397 (bring back a bubble-set enclosure)
- Advances #974 (a `boundary` geometry query; hulls and edges as members are its first users)
- Advances #47 (stacked and divided ribbons, where `by` on relational marks may return)
- Advances #957 (screen-space curves, for closed curves such as enclosures)
- Advances #1101 (custom strategies; the ellipse goes through its function hatch)
- Related: #877 (`selectAll` plus `group({ by })` before a relational mark is ignored; the penguin spelling needs its fix)

## Also in this branch

- The `api-proposal` skill now asks a proposal to survey nearby GoFish API decisions for consistency.
- `CLAUDE.md`: each example's code goes immediately under its own screenshot.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
