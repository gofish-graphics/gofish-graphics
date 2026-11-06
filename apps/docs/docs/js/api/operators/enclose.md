---
order: 75
---

# enclose

Draws an outline around a set of nodes, under them. The outline is a member of
the [`Shape`](/js/api/shape) family: the padded bounding box
(`Shape.box()`, the default), the smallest ellipse around them
(`Shape.oval()`), the padded members with arc corners (`Shape.fillet()`), or a
smooth region (`Shape.blob()`, `Shape.hull()`, `Shape.spine()`). Like
[`line`](/js/api/marks/line) and [`ribbon`](/js/api/marks/ribbon), it reads
geometry from nodes that are already placed, and it has a combinator form and
a bag form. It also has a flow-step form.

::: gofish

```js
const beaks = penguins.filter((d) => d["Beak Depth (mm)"] != null);

gf.chart(beaks, { axes: true })
  .flow(gf.scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
  .mark(gf.circle({ r: 2.5, fill: "Species" }).name("points"))
  .layer(
    gf
      .chart(gf.selectAll("points"))
      .flow(gf.group({ by: "Species" }))
      .mark(
        gf.enclose({
          shape: gf.Shape.hull(),
          padding: 6,
          fill: "Species",
          fillOpacity: 0.2,
        })
      )
  )
  .render(root, { w: 420, h: 320 });
```

:::

## Signature

```ts
// Combinator form: around the given children.
enclose(options, [child1, child2, ...]);

// Bag form: around the refs a chart's data holds.
chart(selectAll(name)).mark(enclose(options));

// Flow-step form: around each group's subtree.
chart(data).flow(op1, enclose(options), op2).mark(mark);
```

In the combinator form, a fresh child (a mark or an operator) is laid out the
way [`layer`](/js/api/operators/layer) lays out its children, and the outline is
drawn around it. A `ref(...)` child, or an operand of a
[`.relate()`](/js/api/constraints/relate) callback, is enclosed where it
already is, without being moved.

In the bag form, the members are the refs of the chart's data. A
`flow(group({ by }))` before the mark draws one outline per group, and `fill`,
`stroke` or `padding` may name a field that is constant within each group.

In the flow-step form, `enclose(options)` sits between two operators in
`.flow(...)`. Each group's subtree is its one fresh child, so the operator
before it lays out the outlined group: a `pack` packs the outline, and an outer
`enclose` hugs it. The paint and `padding` are read once per group, as in the
bag form. The same call is the bag form in `.mark(...)`.

::: gofish

```js
gf.chart(seafood)
  .flow(
    gf.pack({ by: "lake", spacing: 6 }),
    gf.enclose({ shape: gf.Shape.fillet(), padding: 4, fill: "none" }),
    gf.pack({ spacing: 2 })
  )
  .mark(gf.circle({ r: 12, fill: "species" }))
  .render(root, { w: 420, h: 420 });
```

:::

```ts
// Fresh children: the box is laid out with them.
enclose(
  {
    padding: 20,
    fill: "#252150",
    stroke: "none",
    shape: Shape.box({ rx: 16 }),
  },
  [
    spread(
      { dir: "x", spacing: 50, alignment: "middle" },
      planets.map((d) => circle(d))
    ),
  ]
);

// Operands of .relate(): a set that holds a and c but not b.
layer([a, b, c]).relate(({ a, b, c }) => [
  enclose({ shape: Shape.spine(), avoiding: [b], clearance: 6, padding: 22 }, [
    a,
    c,
  ]),
]);
```

A member is read by its shape: a circle is a disc, a `line` is its segments at
its stroke width, and any other node is its bounding box. The outline paints
under the members.

`avoiding` lists the nodes the outline keeps out of, for every shape: a list
of nodes or refs, or one `selectAll(name)`. The outline is cut so that it
stays `clearance` (by default, the `padding`) from each of them. A box that
avoids nodes is drawn as its cut outline, not as a rectangle.

A fresh member with no size of its own, such as a `treemap` or a `region`,
fills the space it is given, so there is nothing to hug. Then `enclose` works
the other way round: the outline is the space itself (`Shape.box()`) or the
oval inscribed in it (`Shape.oval()`), and it hands the outline, drawn in by
`padding`, down to the member as the shape to fill. Inside a Voronoi cell of
a [`treemap`](/js/api/operators/treemap), the space is that cell, so
`Shape.box()` draws the cell and `Shape.oval()` the part of the oval inside
it. `Shape.fillet()` and `Shape.blob()` hug the members, so around a member
with no size they are an error that names `Shape.box()` and `Shape.oval()`.

```ts
// A Voronoi treemap in a circle: the treemap fills the oval.
chart(countryPopulations, { axes: false, w: 480, h: 480 })
  .flow(
    enclose({ shape: Shape.oval, fill: "none" }),
    treemap({ by: "continent", size: "pop", spacing: 5, tile: Tile.voronoi }),
    treemap({ size: "pop", spacing: 1, tile: Tile.voronoi })
  )
  .mark(region({ fill: "continent" }));
```

## Parameters

::: gofish-ref enclose
:::

`shape` takes a member of the [`Shape`](/js/api/shape) family.
