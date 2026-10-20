# Factor `chart()` into a space-free `data().flow()` core

Labels: `API design`, refactor

## Summary

Split the chart builder into two parts. The first is a data-flow part, `data(rows).flow(...ops)`, which turns rows into groups and leaves and knows nothing about coordinates. The second is the space that part is laid out in. `chart()` becomes "a data flow in a 2D space": scales, the coordinate transform, axes, legends and rendering. The same data flow then also works inside other spaces, starting with the 1D space along a mark's side that the stacked-ribbons anchors proposal needs (`.anchor({ slots: data(links, { on: "source" }).flow(stack({ size: "value" })) })`).

## Why

- The pipeline-types essay already describes operators as functions of data alone: `spread(by) := mark => d => Spread(map(groupBy(d, by), mark))`. Nothing in that type mentions a coordinate space.
- The implementation already splits this way inside `ChartBuilder` (`packages/gofish-graphics/src/ast/marks/chartBuilder.ts`):
  - `resolveNodes()` runs the flow and the mark.
  - `frameNodes()` wraps the result in the frame, coordinate transform and axes.
- Anchors (#47 design-space page, "Anchors") need exactly the first half: rows, a flow of ordinary operators, and leaves, laid out in a 1D space supplied by the anchor's `position`.

## Proposal

1. **Behavior-preserving refactor first.** Extract the data-flow half of `ChartBuilder`:
   - the input rows (or the inherited scope);
   - the operator list;
   - the split and continuation logic.

   Extract it into a `DataFlow` builder with `.flow(...)`. `ChartBuilder` holds a `DataFlow` plus its space options (`coord`, `axes`, `w`/`h`, legends). Every story must render identically, gated on pixel equality.

2. **Then expose `data(rows?)`** as the public form of that builder. `data()` with no argument means "the rows of my context", as `chart()` with no data does today. `data(table, { on, key? })` brings in rows of another table whose `on` column refers to the context's mark. It is the reverse of `resolve`, and both match on the node's key.

## Open questions

- **The terminal of a space-free flow.** `.mark(m)` is the terminal for charts. Inside `slots`, the leaves are implicitly anchors. Should `data(...).flow(...).mark(m)` be a general, space-free value, with charts and anchors as two hosts?
- **Names.** `ChartBuilder` already has `.name()`. If names move from marks to the constructs that introduce things, does `data(...)` carry a name too?
- **Python.** `data(links, on="source").flow(stack(size="value"))` needs a descriptor entry and the cross-language checklist.

## References

- `apps/docs/docs/internals/frontend/pipeline-types.md` (operators as CPS over data)
- Stacked ribbons design space: https://claude.ai/artifact/2dHLhTeiQwpdHmkDjbw6oU#composition
- Advances #47.
