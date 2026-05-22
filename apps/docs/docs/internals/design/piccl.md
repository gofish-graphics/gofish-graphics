---
title: PICCL
section: Speculative Notes
order: 20
status: speculative
---

# PiCCL

PiCCL is a cool paper about making pictorial charts. To adapt it to GoFish we'd need to add image
compositing operators and their constraints.

Their constraints are unidirectional. They compute a DAG and solve it, which is a nice way of
computing an ordering.

Let's take this flower chart spec and see what the syntax might look like for it in GoFish.
https://piccl.github.io/example/flowers

```ts
const petal = new PICCL.Picture({ url: "petal3.png", height: 200 })
  .mapValue("height", "OECD_index")
  .mapValue("color", "OECD_field");

const flower = PICCL.replicate(petal).circularLayout();

const stem = new PICCL.Picture({ url: "stem.png", height: 800 }).mapValue(
  "height",
  "avg"
);

const leaf = new PICCL.Picture({ url: "leaf.png", height: 100 });

const plant = PICCL.union([stem, leaf, flower])
  .pointSnap(flower, stem, {
    sourceAnchor: [0.5, 0.5],
    targetAnchor: [0.5, 1.0],
  })
  .pointSnap(stem, leaf, { sourceAnchor: [0.5, 0.0], targetAnchor: [0.4, 0.3] })
  .mapValue("x", "country");

const collection = PICCL.replicate(plant, "country");

PICCL.show([[collection, data["flower_data.csv"]]], container, { pictures });
```

```ts
chart(data["flower_data.csv"])
  .flow(scatter("country", { x: "country" }))
  .mark(
    layer([
      picture("stem.png", { h: "avg" }).as("stem"),
      picture("leaf.png", { h: 100 }).as("leaf"),
      chart({ coord: clock() })
        .flow(spread("OECD_field", { dir: "theta", mode: "center" }))
        .mark(picture("petal3.png", { h: "OECD_index", color: "OECD_field" }))
        .as("flower"),
    ]).constrain([
      pointSnap(
        from(
          "flower",
          { x: "center", y: "center" },
          to("stem", { x: "center", y: "end" })
        )
      ),
      pointSnap(
        from(
          "stem",
          { x: "center", y: "start" },
          to("leaf", {
            x: 0.4,
            y: 0.3,
          }) /* todo: look up how ui frameworks do it... */
        )
      ),
    ])
  );
```

Or a slightly more readable/refactored version where we break at chart and layer boundaries:

```ts
const flower = chart({ coord: clock() })
  .flow(spread("OECD_field", { dir: "theta", mode: "center" }))
  .mark(picture("petal3.png", { h: "OECD_index", color: "OECD_field" }));

const plant = layer([
  picture("stem.png", { h: "avg" }).as("stem"),
  picture("leaf.png", { h: 100 }).as("leaf"),
  flower.as("flower"),
]).constrain([
  pointSnap(
    from(
      "flower",
      { x: "center", y: "center" },
      to("stem", { x: "center", y: "end" })
    )
  ),
  pointSnap(
    from(
      "stem",
      { x: "center", y: "start" },
      to("leaf", {
        x: 0.4,
        y: 0.3,
      }) /* todo: look up how ui frameworks do it... */
    )
  ),
]);

chart(data["flower_data.csv"])
  .flow(scatter("country", { x: "country" }))
  .mark(plant);
```

- TODO: how do I pass data contexts through everything?
- TODO: how do I make a nice pointSnap (etc) API?
- TODO: what's the relationship between the `constrain` method and just making a new layer like with
  the ribbon?
- TODO: the use of `as` here suggests that `as` in the current examples should be placed on the
  mark, not the overall chart and that maybe every operator and mark should have an as property that
  works that way...

Semantics of point snap:

- if `from` is not placed, placed at (0, 0) in local coordinates (I guess?)
- then place `to` using the `position` operator by calculating the difference between the two anchor points

Problem! The height of the stem won't be resolved yet... how is it resolved in piccl?
I guess we can do layout given the scale factor thing (which we do right????? hmmm)

- so we can compute the height of everything or whatever given the scale and then compute the scale
  at the end
