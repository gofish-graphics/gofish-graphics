# Bend and envelope: warp a shape along a spine or into a region

GoFish cannot bend a shape along a path or fit a shape into a region. This issue gives that capability its own name. Until now it has sat under #75, whose title is "rendering IR".

**Status: deferred.** `notes/design/polar-coordinate-spaces.md` ("Bend / skeleton warp: explicitly deferred (maybe never)") records that this is out of scope for GoTree, and that even GoTree's arc-length midpoint case is a plain coordinate transform. This issue keeps that decision. It records the design so that the idea has a correct home when a real example needs it.

## Background

- #75 ("rendering IR") asks for generic warping of rects, paths, images and text, so that each mark does not reimplement it. It links two warp.js threads. Josh's comment there: arrows have a natural one-dimensional "spine" reading, and a two-dimensional one where you warp them like an image.
- warpjs#15 ("Using a Path as a 'skeleton' to another path (Bend path)") shows a gecko bent along a curved spine with Inkscape's Bend live path effect. It links the [Inkscape manual page](http://tavmjong.free.fr/INKSCAPE/MANUAL/html/Paths-LivePathEffects-BendTool.html) and [`lpe-bendpath.cpp`](https://gitlab.com/inkscape/inkscape/-/blob/master/src/live_effects/lpe-bendpath.cpp). J.F. Barraud's theory, quoted in the thread: reparametrize the skeleton by arc length as U(s), take its unit normal N(s), and map each point (x, y) of the shape to U(x) + y·N(x).
- warpjs#11 ("Warping arbitrary coordinates?") fits a word into an arbitrary shape, as Illustrator's Envelope Distort does. The thread points to generalized barycentric and mean value coordinates, and ends with a proof of concept for polygons.
- Other tools: Inkscape has Bend, Pattern Along Path and Envelope Deformation (four bend paths). Illustrator has Art brushes and Envelope Distort (with warp presets, with a mesh, or with a top object as the envelope). Figma has neither built in.

## Proposal

A bend is an operator on one shape, not a coordinate transform.

- A `coord` is a frame: its children are laid out in its coordinates, with scales and axes. A bend takes a shape already laid out in pixels and maps the shape's own box onto a spine, as every tool above does to one object.
- Its parameter is a placed shape. The spine is laid out in the surrounding frame, and its length sets how far the shape stretches. A `Coord.*` strategy is a fixed function.
- It changes how the child is drawn, not where it is laid out. It can share the code that `coord` uses to draw a path through a mapping (adaptive sampling, #121).

Sketch:

```js
// The gecko is the child, drawn bent. The spine is an operand, read for
// its shape only. Here it is also drawn, once, as a child of the layer.
layer([
  chart(spinePoints)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(line({ curve: Curve.natural, stroke: "green" }))
    .name("spine"),
]).relate(({ spine }) => [
  bend({ along: spine }, [
    polygon({ points: gecko, fill: "none", stroke: "black" }),
  ]),
]);
```

```js
// The usual output: the spine is not drawn. It still needs its place in
// the frame, so it is a hidden child.
chart(spinePoints)
  .flow(scatter({ x: "x", y: "y" }))
  .mark(line({ curve: Curve.natural }))
  .name("spine")
  .hidden();
```

```js
// Envelope: the child's box is mapped into the region between two curves.
layer([upper.name("upper").hidden(), lower.name("lower").hidden()]).relate(
  ({ upper, lower }) => [
    envelope({ top: upper, bottom: lower }, [
      text({ text: "WORD", fontSize: 96 }),
    ]),
  ]
);
```

Arrows take both readings from #75:

```js
// 1D: the route is the arrow's own path. Nothing is warped.
arrow({ along: route }, [a, b]);
// 2D: a wide arrow shape, bent like the gecko.
bend({ along: spine }, [polygon({ points: fatArrow, fill: "#467DA8" })]);
```

The guide follows the children and operands rule from the #1267 proposal (a way to define a shape without drawing it). The operator draws its child and never draws its operands, and no operator changes `.hidden()`. Whether the spine shows is decided where the spine is made: draw it as a child and pass a ref, or hide it.

## Open questions

- Two operators, `bend` and `envelope`, or one `warp({ to: Warp.along(spine) }, [shape])` with a `Warp` family?
- Does the shape's length stretch to the spine's length, or keep its own (Inkscape offers both)?
- Images and text: warp them as raster images, or convert text to paths first? SVG cannot warp an image directly.
- The refs above sit inside `.relate()`. Outside it, they wait on #1259 (a string ref outside `.relate()`).
