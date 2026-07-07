# gofish-gotree

A declarative grammar for **tree visualizations**, embedded in
[GoFish](https://github.com/gofish-graphics/gofish-graphics). It is a port of
the **GoTree** grammar onto GoFish's layout primitives: tree layouts are
expressed as a pair of per-axis combiners (parent↔children and sibling↔sibling),
each chosen from `{align, distribute, nest}`, plus a node mark and a link style.

## Credits / prior work

This package re-implements the model from the GoTree paper. If you use it,
cite the original:

> Guozheng Li, Min Tian, Qinlong Xu, Michael J. McGuffin, and Xiaoru Yuan.
> **GoTree: A Grammar of Tree Visualizations.** In _Proceedings of the 2020 CHI
> Conference on Human Factors in Computing Systems (CHI '20)_, 1–13.
> https://doi.org/10.1145/3313831.3376297

Source, live editor (Tree Illustrator), and example gallery — maintained by the
authors at the BIT-VIS lab (the PKU URL in the paper is dead):

- Source repository: https://github.com/BIT-VIS/gotree (MIT)
- Live editor + gallery: https://bit-vis.github.io/gotree/
- Spec / tutorials: https://bit-vis.github.io/gotree/tutorials.html

The galleries under `stories/gallery/` are ports of the canonical GoTree gallery
examples; see [`GALLERY.md`](./GALLERY.md) for the combiner spec of each.

## Concept mapping (GoTree → gofish-gotree)

| GoTree spec                                       | gofish-gotree                       |
| ------------------------------------------------- | ----------------------------------- |
| `Layout.X/Y.Root` relation                        | `parentChild` combiner (per axis)   |
| `Layout.X/Y.Sibling` relation                     | `sibling` combiner (per axis)       |
| Relations `include / juxtapose / align / flatten` | `nest / distribute / align`         |
| `Element.Node`                                    | `node` (a GoFish mark factory)      |
| `Element.Link` (style)                            | `link` (`interpolation`: see below) |
| `CoordinateSystem` (cartesian/polar)              | `coord`                             |

### Link styles

GoTree's `Link` element has styles `straight`, `curve`, `curveStepBefore`,
`curveStepAfter`, `orthogonal`, and `arccurve`. Each link is **one-to-one** —
exactly one path per (parent, child) edge; GoTree never draws a shared trunk to
a group of children. The current GoFish port supports `linear` (≈ `straight`)
and `bezier` (≈ GoTree `curve`, i.e. `d3.linkVertical`); `orthogonal` and `arc`
are in progress.
