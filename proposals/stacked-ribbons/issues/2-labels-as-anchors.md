# Define boundary label strategies by rewrite into anchors

Labels: `API design`, labels

## Summary

The label proposal's `Place` family places text relative to a mark's outline. The stacked-ribbons proposal adds anchors: named intervals or points laid out along a part of a mark's boundary, `.anchor({ name, position: "x-max", slots: data().flow(...) })`. Several `Place` strategies are an anchor plus a text mark, so they could be defined by that rewrite. That gives labels and ribbon ends one shared mechanism, and settles the open question of whether anchor part names and `Place.along({ at })` should share one vocabulary.

## The rewrites

| Strategy                                             | Rewrite                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Place.along({ at, side })`                          | `.anchor({ name: ⟨fresh⟩, position: at })`, plus the text at that anchor, offset by `side` (inset, outset, on) |
| Several labels along one edge (tags, category names) | an anchor with `slots: data().flow(spread({ spacing }))`, one text per slot                                    |
| `Place.start()` / `Place.end()`                      | an anchor on a path's `start` / `end` part, once paths have parts                                              |
| `Place.around()` candidates                          | a set of point anchors, one per compass direction. The first-fit chooser stays a separate step                 |
| `Place.interior()`                                   | **does not fit**: it places inside a region, not on a boundary. It stays its own strategy                      |

## What this needs to settle

- **Part names.** Labels use `top`/`right`/`bottom`/`left` (and strings like `"outset-top"`). Anchors use axis-relative names: `x-min`, `x-max`, `y-min`, `y-max`, and the coordinate's own dimensions, so a polar rect's inner arc is `r-min`. Pick one vocabulary for both. The axis-relative one carries through coordinate transforms without a "bottom means inner arc" mapping.
- **One value or two.** Either `Place.along` becomes sugar for an anchor, or label positions accept a part name directly.
- **The `Outline` query.** The label proposal's `Outline { points, closed, parts }` is what both mechanisms read. An anchor is one more named part.

## References

- Label proposal: branch `worktree-label-proposal`, `proposals/labels/proposal.md` (`Place.along`, parts, `Outline`)
- Stacked ribbons design space, "Anchors" and "Composition all the way down": https://claude.ai/artifact/2dHLhTeiQwpdHmkDjbw6oU#composition
- Advances #47.
