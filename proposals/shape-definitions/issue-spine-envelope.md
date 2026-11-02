# Bend and envelope: warp a shape along a spine or into a region

GoFish cannot bend a shape along a path or fit a shape into a region. This issue gives that capability its own name. Until now it has sat under #75, whose title is "rendering IR".

**Status: deferred.** `notes/design/polar-coordinate-spaces.md` ("Bend / skeleton warp: explicitly deferred (maybe never)") records that this is out of scope for GoTree, and that even GoTree's arc-length midpoint case is a plain coordinate transform. This issue keeps that decision. It records the design so that the idea has a correct home when a real example needs it.

## Background

- #75 ("rendering IR") asks for generic warping of rects, paths, images and text, so that each mark does not reimplement it. It links two warp.js threads. Josh's comment there: arrows have a natural one-dimensional "spine" reading, and a two-dimensional one where you warp them like an image.
- warpjs#15 ("Using a Path as a 'skeleton' to another path (Bend path)") shows a gecko bent along a curved spine with Inkscape's Bend live path effect. It links the [Inkscape manual page](http://tavmjong.free.fr/INKSCAPE/MANUAL/html/Paths-LivePathEffects-BendTool.html) and [`lpe-bendpath.cpp`](https://gitlab.com/inkscape/inkscape/-/blob/master/src/live_effects/lpe-bendpath.cpp). J.F. Barraud's theory, quoted in the thread: reparametrize the skeleton by arc length as U(s), take its unit normal N(s), and map each point (x, y) of the shape to U(x) + y·N(x).
- warpjs#11 ("Warping arbitrary coordinates?") fits a word into an arbitrary shape, as Illustrator's Envelope Distort does. The thread points to generalized barycentric and mean value coordinates, and ends with a proof of concept for polygons.
- Other tools: Inkscape has Bend, Pattern Along Path and Envelope Deformation (four bend paths). Illustrator has Art brushes and Envelope Distort (with warp presets, with a mesh, or with a top object as the envelope). Figma has neither built in.

## Proposal

Josh chose a coordinate transform that takes a shape as its argument: `Coord.bend({ along })` and `Coord.envelope({ top, bottom })`. It is applied the way every coord is applied today, as the `coord` option of a `layer` or a `chart`.

- The shape argument is an operand. The coord reads it and never draws it. To see the spine, draw it somewhere else and pass a ref; that other place draws it. To not see it, hide it or pass it inline.
- The guide is read in the frame the coord sits in, never in the frame the coord makes for its children. The coord's inner frame is defined by the guide, so laying the guide out inside it would be circular.
- The mapping is Barraud's: a point (x, y) of the inner frame goes to U(x) + y·N(x) on the spine. The envelope maps the inner box into the region between `top` and `bottom`.
- Drawing a path through the mapping can share the code `coord` already uses (adaptive sampling, #121).

**This keeps the deferral.** `notes/design/polar-coordinate-spaces.md` defers bend and skeleton warp, possibly forever. This issue only fixes the spelling for when a real example asks for it. Nothing here is scheduled.

Sketch:

```js
// The spine is drawn once, as a child of the outer layer. The bend reads
// it through a ref and draws only its own children.
layer([
  chart(spinePoints)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(line({ curve: Curve.natural, stroke: "green" }))
    .name("spine"),
]).relate(({ spine }) => [
  layer({ coord: Coord.bend({ along: spine }) }, [
    polygon({ points: gecko, fill: "none", stroke: "black" }),
  ]),
]);
```

```js
// The usual output: the spine is not drawn. It still needs its place in
// the outer frame, so it is a hidden child there.
chart(spinePoints)
  .flow(scatter({ x: "x", y: "y" }))
  .mark(line({ curve: Curve.natural }))
  .name("spine")
  .hidden();
```

```js
// Envelope: the children map into the region between two hidden curves.
layer([upper.name("upper").hidden(), lower.name("lower").hidden()]).relate(
  ({ upper, lower }) => [
    layer({ coord: Coord.envelope({ top: upper, bottom: lower }) }, [
      text({ text: "WORD", fontSize: 96 }),
    ]),
  ]
);
```

This follows the children and operands rule from the #1267 proposal (a way to define a shape without drawing it): an operator draws its children and never its operands, and no operator changes `.hidden()`.

## Open questions

- A ref spine drawn under one coord and read by a bend under another depends on #605. Today a ref across a coord boundary reads the target's box in that coord's own space (θ and r under polar), not its warped screen position. `src/ast/_ref.tsx` copies `selectedNode.intrinsicDims` (line 350), and `coord.tsx` computes warped boxes only for its own bounding box (lines 307 and 551). #1225 (a symbolic port for refs through affine coords) would not cover a bend, which is not affine.
- Does the shape's length stretch to the spine's length, or keep its own? Inkscape offers both.
- Images and text: warp them as raster images, or convert text to paths first? SVG cannot warp an image directly.
- Arrows (#75's 1D and 2D readings): is a 2D arrow just a wide polygon under `Coord.bend`?
- The refs above sit inside `.relate()`. Outside it, they wait on #1259 (a string ref outside `.relate()`).
