---
title: Spaces
section: Design Evolution
order: 20
status: stable
handwritten: true
---

# Spaces

::: info Moved from the GitHub wiki
This page is the _Spaces_ page of the project's GitHub wiki (last edited
November 2025), moved here verbatim. It was written before underlying space was
built. What has changed:

- Underlying space is no longer built during scale resolution. It has its own
  bottom-up pass, `resolveUnderlyingSpace()`, followed by a second walk,
  `resolveExtent()`, for size claims; scales are solved later, per σ-scope,
  during layout. See [Underlying Space](/internals/core/underlying-space) and
  [Pass 6](/internals/layout/passes#pass-6-underlying-space-resolution).
- The planned bidirectional resolution did not ship. Resolution is bottom-up,
  and the top-down passes that follow it (axis ownership, embedding) read its
  result. See [Why an explicit
  IR](/internals/core/underlying-space#why-an-explicit-ir).
- A scale is now one affine map per σ-scope, `px(d) = σ·d + originPx`. See [The
  one equation](/internals/core/underlying-space#the-one-equation-and-three-roles-for-one-unknown).
- Embedding is decided. The `resolveEmbedding` pass sets each dimension's
  `embedded` flag (point, line, or area): a dimension embeds when its size is a
  data value or unsized and, inside a coordinate transform, its size's measure
  matches its position measure. `emX`/`emY` set it explicitly. See [Pass
  8.5](/internals/layout/passes#pass-8-5-embedding-resolution). Measure-free
  embedding is still open (#618).

:::

There are three important spaces in GoFish. Any value in the system (theoretically) belongs to one and only one of these spaces: data, underlying, and display.

Data space is just any data in a dataset that someone is passing around. This data then gets elaborated and underlying space is constructed.

Underlying space is kept track as an explicit internal data structure that represents the types and domains of every subspace of the graphic. This is constructed during scale resolution and is used to determine what kinds of axes and legends to draw by default.

Finally, values are rendered to display space after being modified by coordinate transforms.

A couple interesting things here. One is that layout happens in both underlying and display space. In underlying space, layouts need to tell the system how to resolve their child spaces in the underlying space structure. In display space they actually place stuff, which can then be modified by a parent coordinate transform.

The other interesting thing is that shape dimensions can be embedded in underlying space, which affects how they are transformed by a coordinate transform. This is motivated by the fact that a shape can sometimes be 0D, 1D, or 2D depending on its situation. (0D) In a scatter chart, the dots should only be repositioned, not warped, by a coordinate transformation. (1D) In a lollipop chart, they should be rotated and repositioned but not warped. (2D) In a rose chart, they should be warped completely by the space.

Whether or not a dimension gets embedded seems to depend on if that dimension is embedded into underlying space or seen as an aesthetic value. We are still figuring out how to make this process of embedding intuitive and predictable for end-users.

## Underlying Space

Underlying Space is a generalization of scales. Scales are basically mappings from underlying space to display space.

After looking at how Observable Plot and the Atom grammar do scale inference, we realized that it looks a heck of a lot like a type inference/resolution algorithm. The user can specify domains, ranges, and scale types. But marks, encoding channels, and data types constrain what scales are allowable.

Of course, these existing systems weren’t designed for recursive operators or with an eye towards how type inference works, so they feel a bit ad hoc. I think we can do better.

Our approach will be to take inspiration from bidirectional typing, propagating “scale” (really “underlying space”) information locally from all sources of constraints. This should hopefully lead to a more structured and more powerful resolution algorithm while maintaining good performance.
