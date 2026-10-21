# Express axes as anchors on the plot frame's sides

Labels: `API design`, axes

## Summary

An axis is ticks and tick labels along one side of the plot frame, placed by value. In the stacked-ribbons anchors design, that is a `scatter` in the 1D space along that side:

```js
// sketch
frame.anchor({
  name: "y-ticks",
  position: "x-min",
  slots: data(ticks).flow(scatter({ by: "value" })),
});
// tick marks and labels attach to the "y-ticks" anchors
```

If axes desugar this way, axes, labels and ribbon ends all become things that attach to anchors on some mark's boundary. The principles essay names exactly this as an aspiration: axes and labels "desugar in spirit more than in implementation… The aspiration is to fold both into the same scheme." It also continues the recursive-axes direction: every node renders its space as an axis.

## Questions

- **What the frame is.** It may be the outer box from the chrome-at-chart-boundaries work (#1032), and its sides need parts.
- **Hierarchical and partitioned axes.** Nested category labels, and partitions of time, would be nested flows inside one anchor (`scatter`, then `spread` per level). Check #1115 (hierarchical, type-driven axes) and the partitioned time axis.
- **Where tick values come from.** They come from the scale's tick generator, so they are a data source the space provides, not user rows.
- **Scope.** This is a direction to check against the existing axis code, not a change to make before anchors exist.

## References

- `apps/docs/docs/internals/design/principles.md`, "Why keep the core small" (axes and labels as frontend constructs)
- `apps/docs/docs/internals/frontend/axes.md`
- #1032, #493, #1115
- Stacked ribbons design space: https://claude.ai/artifact/2dHLhTeiQwpdHmkDjbw6oU#composition
