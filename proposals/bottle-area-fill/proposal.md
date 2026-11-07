# Bottle area fill: encoding an amount as the filled area of a silhouette

**Summary.** Today the bottle chart encodes an amount as the fill's height, so 75% fills a bottle to 75% of its height, which holds 88% of its area. Filling by area means finding the level at which the filled part of the silhouette has the right share of its area, which is the inverse of the silhouette's cumulative area. That inverse is a coordinate transform: it maps the unit square onto the silhouette with constant area scaling, the same idea as `d3.scaleRadial` and the proposed `Coord.clock({ radius: "area" })`.

**Recommendation.** Add one coord, `Coord.region(ref("glass"), { y: "area" })`, that maps a layer's box onto another node's region (its alpha, as drawn) so that equal heights in the layer are equal areas in the region. The liquid stays `rect({ h: "amount" })`; stacking several liquids, waffles of equal-area cells and fill animations then work with no new mark or channel. Runner-up: a data helper `fillLevel(outline, { measure: "area" })` used in `derive`, which works for a single fill but breaks stacking.

All pictures below are real GoFish renders from `packages/gofish-graphics/stories/proposals/BottleArea.stories.tsx`. None of the proposed APIs exist yet: each render draws the result the proposal would produce with today's primitives, with the fill levels computed in JS from the bottle PNG's alpha profile. They are emulations of the output, not of the code path.

## Terminology

- **Silhouette** (or **region**): the set of pixels a node covers, as drawn. GoFish already uses "region" for this ("Alpha is shape" in `api-design.md`; #1267, the region-compositing rework).
- **Width profile** `w(y)`: the silhouette's width at height `y`.
- **Cumulative area** `A(y)`: the area of the silhouette below height `y`, the integral of `w`.
- **Fill level**: the height at which the liquid's top sits.
- **Height encoding**: level = share of the height. This is today's story.
- **Area encoding**: level = `A⁻¹(share × A(top))`, so the filled area is the share.
- **Volume encoding**: as area encoding, but weighting each row by `w(y)²`, which treats the silhouette as a solid of revolution.
- **Equal-area map**: a map from the unit square onto a region whose area scaling is the same everywhere. Mathematicians call the triangular version below a Knothe–Rosenblatt map.

## How far apart the encodings are

For `stories/assets/wilsonblanco.png` (157 × 650 px), measured from its alpha channel:

| amount | level, height | level, area | level, volume |
| -----: | ------------: | ----------: | ------------: |
|    30% |          0.30 |        0.26 |          0.24 |
|    42% |          0.42 |        0.35 |          0.33 |
|    60% |          0.60 |        0.49 |          0.45 |
|    75% |          0.75 |        0.61 |          0.55 |
|    90% |          0.90 |        0.80 |          0.66 |

The top 30% of the height (neck and shoulder) holds 15% of the area and 7% of the volume. So height encoding overstates every amount, most near the top. For a martini glass, a cone, area grows with the square of the level: 50% by area sits at 71% of the depth.

![Height encoding (today)](img/height-today.png)
![Area encoding](img/area-fill.png)

## Prior work

| System                                                           | Model                                                                                                                                                                                               | Names                                | Fit for GoFish                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PiCCL (Shi et al., VIS 2025)                                     | Pictures whose properties are bound with `mapValue("height", field)`; the GoFish port is the bottle story (#198, #366).                                                                             | `mapValue`, `replicate`, `pointSnap` | The source of the bottle chart. Maps height, not area.                                                                                                                                                                     |
| echarts-liquidfill                                               | A value in 0..1 sets the wave's level in a `shape` (`circle`, `rect`, `path://...`). The source sets `waterLevel = radiusY - value * radiusY * 2`, a share of the box height, even inside a circle. | `shape`, `waterLevel`                | A foil: the liquid-fill gauge library uses height encoding everywhere.                                                                                                                                                     |
| Vega-Lite, Observable Plot                                       | No support. Users clip a bar to an SVG `clipPath` of the picture and set its height.                                                                                                                | `clip`                               | Height encoding by construction.                                                                                                                                                                                           |
| Figma, Illustrator                                               | Clipping mask: the bottom shape of a group clips the rest. No data.                                                                                                                                 | "Use as mask", "Clipping mask"       | Same as GoFish's `atop` / `intersect`.                                                                                                                                                                                     |
| Bertin (1967), p. 357–358                                        | For quantities, area is proportional to Q, so radius grows with √Q.                                                                                                                                 | "area = Q"                           | The principle behind `circle({ area })` (#972).                                                                                                                                                                            |
| `d3.scaleRadial` (d3-scale #90)                                  | A radius scale whose range is squared, so ring areas are linear in the data.                                                                                                                        | `scaleRadial`                        | The disk case of this proposal, along rings instead of rows.                                                                                                                                                               |
| Lambert cylindrical equal-area projection (1772)                 | `y = sin(latitude)`: the cumulative area of the sphere's bands, inverted.                                                                                                                           | "equal-area projection"              | The same trick on a sphere; cartography's word is "equal-area".                                                                                                                                                            |
| Knothe (1957), Rosenblatt (1952)                                 | Map the unit square onto a region: first by the inverse cumulative distribution of one coordinate, then the other within each slice. Area scaling is constant.                                      | "Knothe–Rosenblatt rearrangement"    | Exactly the 2D map recommended below.                                                                                                                                                                                      |
| Tank calibration ("strapping") tables                            | A table from dipstick level to volume for a tank of known shape.                                                                                                                                    | "strapping table", "tank chart"      | Real-world precedent: level and volume are different numbers, and people keep a table between them.                                                                                                                        |
| Cleveland and McGill (1984); Stevens (1957)                      | People judge position and length more accurately than area; perceived area grows roughly with area^0.7.                                                                                             |                                      | Area encoding is not automatically "more accurate". It makes the drawn amount of liquid agree with the data. Whether readers judge the level or the liquid is a question for the reader, so it is a choice, not a default. |
| Haroz, Kosara and Franconeri, "ISOTYPE Visualization" (CHI 2015) | Pictographs and repeated icons do not hurt accuracy and help memory.                                                                                                                                | isotype                              | Supports pictorial fills; the equal-area waffle below is an isotype in a silhouette.                                                                                                                                       |
| Tufte (1983), "lie factor"                                       | Scaling a picture in two dimensions for one-dimensional data inflates the effect.                                                                                                                   | lie factor                           | The reverse case here: a 1D level in a 2D container misstates the 2D amount.                                                                                                                                               |

## Related GoFish issues

- #198 PiCCL bottle graphic, and #366, the PR that added the bottle story.
- #640 Latency bottle chart: data-driven image sizing (`image({ h })`).
- #587 A fill rect with no width collapses under intrinsic sizing in the bottle story.
- #1330 The bottle chart does not render properly on mobile.
- #208, #404 The `cut` operator (slices a shape by length along `x` or `y`).
- #540 `cut` beyond `x` and `y` (angular and radial cuts).
- #1282 `cut`: options first, the source as its one child.
- #544, #1229 Croissant charts: cut data-driven area marks, painted vector intersect.
- #1267 Shape definitions: region compositing, `.hidden()`, alpha is shape.
- #365 Make Porter-Duff an option on layer instead of separate operators?
- #1209 Clipping: where content is clipped to a box, and how it relates to compositing.
- #972, #1323 `circle({ area })`: area is its own channel kind.
- #1325 Lint: warn when a circle's radius is sized by an amount.
- #1331, #1340 `polygon({ w, h, d })`: a unit-box outline stretched into its box.
- #1342 Geometry unbent under coords, all marks.
- #36, #247 PiCCL operators and PiCCL constraints.
- #739 A grid/waffle reshape primitive. #171 enclose for a nested waffle.

## Approaches

The approaches differ on one axis: where the inverse cumulative area is computed. In the data (A), in a channel of the container mark (B), in a coordinate transform (C), or by a constraint on a clipped node (D). A second, independent axis is where the silhouette comes from (a raster image's alpha, or a vector outline), and a third is which measure to equalize (length, area, volume). Those two are treated after the approaches.

### A. A data helper in `derive`

The user computes the level and draws it as today.

```js
// The data side cannot read an image, so the outline is a vector path.
const level = fillLevel(BOTTLE_D, { measure: "area" }); // share -> share of height

chart(data, { axes: false })
  .flow(
    derive((rows) =>
      rows.map((d) => ({ ...d, level: 100 * level(d.amount / 100) }))
    ),
    spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } })
  )
  .mark(/* today's mark, with "level" in place of "amount" for h and y */);
```

```python
level = fill_level(BOTTLE_D, measure="area")

chart(DATA, axes=False).flow(
    derive(lambda rows: [{**d, "level": 100 * level(d["amount"] / 100)} for d in rows]),
    spread(by="category", dir="x", spacing=20, axes={"x": False}),
).mark(BOTTLE_MARK)
```

Stacked liquids (the hard case):

```js
const level = fillLevel(BOTTLE_D, { measure: "area" });
let below = 0;
const bands = wine.map((d) => {
  const lo = level(below / 100);
  below += d.amount;
  return { ...d, h: 100 * (level(below / 100) - lo) };
});
chart(bands)
  .flow(stack({ dir: "y" }))
  .mark(rect({ h: "h", fill: "category" }));
```

- **Composes**: with everything, since it is only data. Desugars to nothing new.
- **Breaks**: units and `CanSum`. `level` is a length share, not an amount, so its unit is not the data's. In the stacked case each band's `h` depends on all bands below it, so the `h` values are not amounts, do not add up as amounts, and change when the order changes. The data type no longer says what the picture says (Mackinlay's expressiveness rule in `api-design.md`).
- **Needs a vector outline**. The data pass runs before images load, so it cannot read a PNG.
- **Cannot do** the equal-area waffle (it needs a 2D map) or a fill animation at a constant pour rate without the user recomputing levels per frame.
- **Overlap**: none. It is the escape hatch every other approach desugars into.

### B. A channel of the container mark

Like `circle({ area })`, give the container a fill channel.

```js
image({
  href: bottlePng,
  h: v(100),
  liquid: { amount: "amount", measure: "area", fill: "#00ff00" },
});
```

```python
image(href=BOTTLE_PNG, h=datum(100), liquid={"amount": "amount", "measure": "area", "fill": "#00ff00"})
```

- **The wall**: `circle({ area })` works because the area is the circle's own geometry. Here the level depends on another shape, the container. Putting the channel on the container makes the liquid a part of one mark kind (`image`), not a mark. Stacking, labeling the liquid, coloring it by a field, or putting a waffle in the bottle each need another option on the same channel.
- **Overlap**: large and partial with `atop` + `rect` (which already draw a liquid) and with `cut`. That is the sign the factoring is wrong (`api-design.md`, "Overlap is fine at the edges, not in the middle").
- Not recommended. Recorded because the analogy with `circle({ area })` is the first one that comes to mind.

### C. A coord that maps a layer onto another node's region (recommended)

`Coord.region(shape, { y })` maps its layer's box onto `shape`'s region. Height in the layer runs along the region by the chosen measure; width runs across the region at each level. With `y: "area"`, every rect in the layer has screen area proportional to its data area. The bottle stays outside the coord, so it is not warped.

**Bottle row.** The only change from today is the coord layer around the liquid, and the guide line now aligns to the liquid's top instead of reading `y: "amount"` itself.

```js
chart(data, { axes: false })
  .flow(spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } }))
  .mark(
    layer([
      atop({ blendMode: "color" }, [
        image({ href: bottlePng, h: v(100), filter: Filter.grayscale }).name(
          "glass"
        ),
        layer({ coord: Coord.region(ref("glass"), { y: "area" }) }, [
          rect({ h: "amount", fill: "#00ff00" }).name("liquid"),
        ]),
      ]).name("bottle"),
      rect({ h: 1, fill: "#666", w: 175 }).name("line"),
      text({ fontSize: 35, fill: "#666", text: (d) => `${d.amount}%` }).name(
        "label"
      ),
    ]).relate(({ line, label, bottle, liquid }) => [
      Constraint.align({ x: "start" }, [bottle, line]),
      Constraint.align({ y: "end" }, [liquid, line]),
      Constraint.distribute({ dir: "y", spacing: 0 }, [line, label]),
      Constraint.align({ x: "end" }, [label, line]),
    ])
  )
  .render(container, {});
```

```python
chart(DATA, axes=False).flow(
    spread(by="category", dir="x", spacing=20, axes={"x": False})
).mark(
    layer([
        atop([
            image(href=BOTTLE_PNG, h=datum(100), filter=Filter.grayscale).name("glass"),
            layer(
                [rect(h="amount", fill="#00ff00").name("liquid")],
                coord=Coord.region(ref("glass"), y="area"),
            ),
        ], blend_mode="color").name("bottle"),
        rect(h=1, fill="#666", w=175).name("line"),
        text(text=lambda d: f"{d['amount']}%", font_size=35, fill="#666").name("label"),
    ]).relate(lambda bottle, liquid, line, label: [
        Constraint.align([bottle, line], x="start"),
        Constraint.align([liquid, line], y="end"),
        Constraint.distribute([line, label], dir="y", spacing=0),
        Constraint.align([label, line], x="end"),
    ])
)
```

**Stacked liquids** ("What's in a bottle of wine", the data of the Cut story). The bands are a plain `stack` of amounts; the coord does the inversion once for the cumulative sums, so `CanSum` survives.

```js
atop({ blendMode: "multiply" }, [
  image({ href: bottlePng, h: 520, filter: Filter.grayscale }).name("glass"),
  chart(wine, { coord: Coord.region(ref("glass"), { y: "area" }) })
    .flow(stack({ dir: "y" }))
    .mark(rect({ h: "amount", fill: "category" })),
]).render(container, {});
```

![Stacked, height](img/stacked-height.png) ![Stacked, area](img/stacked-area.png)

**Hard example 1: martini glasses.** The container is the bowl, not the picture: the stem and foot are solid glass. So the region must be a shape the user names, here the bowl's outline (`polygon({ w, h, d })` from #1340), not the whole glass.

```js
chart(cocktails, { axes: false })
  .flow(spread({ by: "drink", dir: "x", spacing: 70 }))
  .mark(
    layer([
      polygon({
        w: 150,
        h: v(100),
        d: "M0 1 L1 1 L.5 0 Z",
        fill: "none",
        stroke: "#555",
      }).name("bowl"),
      layer({ coord: Coord.region(ref("bowl"), { y: "area" }) }, [
        rect({ h: "full", fill: "#c8d84a" }),
      ]),
      rect({ w: 3, h: 90, fill: "#555" }).name("stem"),
    ]).relate(({ bowl, stem }) => [
      Constraint.distribute({ dir: "y", spacing: 0 }, [stem, bowl]),
      Constraint.align({ x: "middle" }, [stem, bowl]),
    ])
  )
  .render(container, {});
```

![Martini, height](img/martini-height.png)
![Martini, area](img/martini-area.png)

**Hard example 2: an equal-area waffle in the bottle.** A 10 × 10 grid laid out in the coord. Every cell has the same area, so "60 of 100 cells" is 60% of the bottle. The neck cells are tall and thin. Only a 2D map can draw this; a level alone cannot.

```js
layer([
  image({ href: bottlePng, h: 520, opacity: 0.35 }).name("glass"),
  chart(cells, { coord: Coord.region(ref("glass"), { y: "area" }) })
    .flow(stack({ by: "row", dir: "y" }), stack({ by: "col", dir: "x" }))
    .mark(
      rect({ fill: (d) => (d.k < 60 ? "#2f9e44" : "#d9d9d9"), stroke: "white" })
    ),
]).render(container, {});
```

![Waffle, length](img/waffle-length.png) ![Waffle, area](img/waffle-area.png)

**The map.** For a point `(u, v)` in the unit square, take the level `y = A⁻¹(u · A_total)` and the point `v` of the way across the silhouette's width at that level. Its area scaling is `w(y) · dy/du = A_total`, a constant. Where a level crosses the silhouette more than once (two legs of a figure, a ring), `v` runs across the spans in order, left to right, and the scaling is still constant.

**How it composes.**

- _Stacking_: a plain `stack` in the coord. The data stays amounts; the coord inverts the cumulative sums. This is the "fixed by geometry" kind of nonlinearity from the scale-transforms proposal: the data stays linear in a measure (area), so `CanSum` and the origin survive.
- _Labels and guide lines_: anything that should sit at the level either lives in the coord or aligns to a node in it. `y: "amount"` outside the coord is now a different height, which is the honest answer: the outer space is in length, the inner in area.
- _Animation_: tweening `h` from 0 to the amount raises the liquid at a constant pour rate, fast in the body and slow in the neck. Height encoding rises at constant speed, which no real liquid does.
- _Glyph rule_: a circle or text placed in the coord is a glyph and is not warped (the rule from #1323). A rect's area is warped, which is the point.
- _Other coords_: a region coord inside a polar or geo layer needs coords to nest. Whether the engine composes nested coords today is unverified; that is a cost, not a design change.
- _Desugaring_: a coord is a point map, so this adds no node kind. The new part is that its parameter is another node's region, read after that node is laid out (and, for a raster, after its pixels load).

**Overlap check.**

- `atop` / `intersect` clip a liquid to the bottle. With `y: "length"`, `Coord.region` plus a full-width rect draws the same picture as today's `atop` clip: a small, exact overlap. `atop` keeps its job (paint and blending); the coord only places.
- `cut` slices a source by length along `x` or `y`. An area-measured cut would be the same slices placed in a region coord. Giving `cut` its own `measure` option would make a large partial overlap with C, so this proposal does not add one.
- `Coord.clock({ radius: "area" })` is the same kernel, the inverse cumulative measure along a sweep, swept along rings instead of rows. For a disk, `Coord.region(disk, { y: "area" })` gives horizontal slices (a round flask) and the clock gives rings (a pie). They should share one implementation.
- `circle({ area })`: no overlap. That channel sizes a mark's own glyph; this coord places marks in another shape's measure.

**Trade-offs.** Easy: every fill picture is today's code in a coord layer; stacks, waffles and animations come free. Awkward: a coord that reads a sibling is a new layout dependency (the sibling first, then the coord layer), and reading a raster's alpha at layout needs the image decoded first. New terms: one coord kind, and the word "region" reused from compositing.

### D. A clipped liquid plus a solved constraint

The liquid is the bottle intersected with a rect, and a constraint solves the rect's height so the clipped area is the share.

```js
layer([
  image({ href: bottlePng, h: v(100) }).name("glass"),
  intersect([ref("glass").hidden(), rect({ fill: "#00ff00" })]).name("liquid"),
]).relate(({ glass, liquid }) => [
  Constraint.share({ measure: "area", value: "amount", whole: 100 }, [
    liquid,
    glass,
  ]),
]);
```

```python
layer([
    image(href=BOTTLE_PNG, h=datum(100)).name("glass"),
    intersect([ref("glass").hidden(), rect(fill="#00ff00")]).name("liquid"),
]).relate(lambda glass, liquid: [
    Constraint.share([liquid, glass], measure="area", value="amount", whole=100),
])
```

- **Composes** badly with stacking: n liquids need n chained constraints, each reading the ones below. It cannot draw the waffle.
- **Overlap**: it is approach C restricted to one rect, solved by root finding instead of a closed-form inverse. That is a degenerate case of C, so it should not be its own construct.
- **New machinery**: a nonlinear constraint that reads painted area. Today's constraints are alignments and distributions.

## The other axes

### Where the silhouette comes from

| Source                                                                | How the profile is read                                                                                      | Cost                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A vector outline (`polygon({ points })`, `polygon({ d })` from #1340) | Exact, from the polygon or path.                                                                             | The user must have or draw an outline.                                                                                                    |
| A raster image's alpha                                                | Decode the image, count opaque pixels per row (what this proposal's prototype does offline, at alpha > 128). | Layout must wait for the image to load; the threshold is a choice; the Python bridge renders through JS, so it is not a separate problem. |

The martini shows that the container is often not the picture's silhouette. So the region argument must be any node the user names, and a ref is the natural spelling. A raster read is then one way a node exposes its region, not a separate option.

### Which measure

`y: "length"` reproduces today's picture, `y: "area"` fills by area, and `y: "volume"` weights each row by its width squared, as for a bottle that is a solid of revolution. The scale-transforms proposal's rule "embedding decides the invariant" says a 2D mark keeps a 2D measure, which argues for `area` and against `volume`. But a real bottle holds volume, and tank charts exist because people need it. The table at the top shows how far apart they are.

| `{ y: "length" }`         | `{ y: "area" }`        | `{ y: "volume" }`        |
| ------------------------- | ---------------------- | ------------------------ |
| ![](img/height-today.png) | ![](img/area-fill.png) | ![](img/volume-fill.png) |

### What "full" means

The coord warps its frame, the named node's box. It does not own a data domain. So the scale is shared with the siblings as today: `image({ h: v(100) })` says 100 is the bottle's full height, and the coord turns that full height into the full area. No new option is needed for the bottle row. A stacked composition that sums to 100 fills the bottle exactly.

## Recommendation

Approach C, `Coord.region(ref(name), { y: "length" | "area" })`.

- _It desugars into the core._ A coord is a point map; the liquid, stacks and waffles are existing marks and operators. Only the coord's parameter is new (`principles.md`, "Why keep the core small").
- _One concept, one operator._ Fill-by-area for one liquid, stacked liquids, equal-area waffles and area-measured cuts are one idea, a measure-preserving map onto a region. Approaches B and D each cover one case of it. Its overlaps with `atop` and `cut` are exact compositions (`api-design.md`, "Overlap is fine at the edges").
- _Meaning stays on the data._ Amounts stay amounts, so `CanSum` survives and stacks stay order-independent in their totals. This matches the "fixed by geometry" nonlinearity already decided for `circle({ area })` and `Coord.clock({ radius: "area" })`.
- _Names match precedent._ "Region" is GoFish's existing word for a node's alpha; the option spelling mirrors `Coord.clock({ radius: "area" })`; the coord names its own axis, as the clock names `radius`.
- _A default is sugar._ `y: "length"` is a writable value that reproduces today's picture; `y: "area"` is the explicit override. Neither is hidden.
- _Same shape in JS and Python._ `Coord.region(ref("glass"), y="area")`.

**Runner-up: A** (`fillLevel` in `derive`). It is cheaper and needs no layout dependency. Pick it instead if a coord that reads a sibling turns out to be too costly for the layout engine, or if single-liquid bottles are the only real use. It should exist anyway as the documented escape hatch, perhaps as a how-to rather than an export.

**What would change the pick.** If coords cannot read another node's geometry without a second layout pass, C's parameter should become a literal outline (`Coord.region(Shape.path(d))`), which loses the raster case. If Josh decides that `volume` is in scope, C still holds, but the option grows a third value and the "embedding decides the invariant" rule needs an exception for vessels.

## Decisions for Josh

1. Is filling a silhouette by area a coord (C), or a data helper (A)?
2. Name: `Coord.region`, `Coord.inside`, or `Coord.within`? ("Region" reuses the compositing word; "inside" reads best in code.)
3. Spelling of the measure: `{ y: "area" }`, mirroring `Coord.clock({ radius: "area" })`? Default `"length"`?
4. Is `y: "volume"` (solid of revolution) in scope, or only length and area?
5. May a coord's parameter be a ref to a sibling, laid out first? Or only a literal outline?
6. Should a raster image's alpha count as a region for layout (load and threshold the image), or must the user give a vector outline?
7. Should `Coord.region` and `Coord.clock({ radius: "area" })` share one documented idea now (an inverse cumulative measure along a sweep), or later?
8. `cut` stays length-only, and an area-measured cut is a cut in a region coord. Agreed?
9. Should the Bottle gallery story switch to area encoding once this exists, and should the Cut story's "by volume" comment be fixed now?

## Things found along the way

- The `Forward Syntax/Cut` story says "What's actually in a bottle of wine, by volume" but slices the bottle by height. Water and grape juice (82%) take 82% of the height, which holds about 91% of the area.
- `echarts-liquidfill` uses height encoding even in its default circle shape.
