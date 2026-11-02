# `cut`: options first, the source as its one child

`cut(source, opts)` takes its subject first, unlike every other operator, which takes `op(opts, children)`. Its method form `.cut(opts)` also builds a different thing from the function. This issue proposes `cut(opts, [source])`, and asks whether the function and the method should become one construct.

## How it works today

- `cut(source, opts)` (`packages/gofish-graphics/src/ast/graphicalOperators/cut.tsx`, line 196) is a plain function. It probes the source once, resolves `size` into pixel extents, and returns a list of N slice promises, N being `size.length`. Each slice is `mask([sliceRect, offset(source)])`, so the source is copied once per slice and never placed itself.
- `.cut(opts)` (`attachCut` in the same file, on `rect` and `image`) builds an expand mark with `createMark`. Its `size` may be a field name (a weight per row) or left out (equal slices, N from the rows).
- `cutMark(opts)` builds the same expand mark for the IR deserializer and is exported from `lib.ts`.
- So `.cut(opts)` is not sugar for `cut(source, opts)`: the method builds a mark bound to data, and the function returns a fixed list.

## Proposal

Step 1: options first, the source as the one child, in JS and Python.

Current:

```js
stack({ dir: "y" }, cut(image({ href, w: 193, h: 600 }), { dir: "y", size }));
```

```python
stack([cut(image(href=href, w=193, h=600), dir="y", size=size)], dir="y")
```

Proposed:

```js
stack({ dir: "y" }, cut({ dir: "y", size }, [image({ href, w: 193, h: 600 })]));
```

```python
stack([cut([image(href=href, w=193, h=600)], dir="y", size=size)], dir="y")
```

The method form does not change:

```js
chart(rows)
  .flow(stack({ dir: "y" }))
  .mark(image({ href, w: 193, h: 600 }).cut({ dir: "y", size: "amount" }));
```

Step 2, a question: make `cut(opts, [source])` build the same expand mark as `.cut(opts)`. The method would then be a true twin, by the rule in the #1267 proposal (a way to define a shape without drawing it): a chain method has a function twin only when both build the same node. `cutMark` would leave the public surface. This needs a check that every combinator takes an expand mark's N nodes in place, as `serialize/fromJSON.ts` already does for a `cut` child.

## Callsites

- The function: 3 in `stories/forwardsyntax/Cut.stories.tsx`, 3 in `tests/python-stories/forward-syntax/test_cut.py`, 9 in `docs/js/api/operators/cut.md` and 8 in `docs/python/api/operators/cut.md` (counting the signature lines), and 2 in `docs/internals/core/underlying-space.md`.
- The Python definition in `gofish/ast.py`, the descriptor and the deserializer change with it.
- `.cut(...)` calls (7 in stories, 7 in Python ports, 2 in tests) stay as they are.

## Notes

- This goes in one PR with the `position` to `translate` rename, apart from the `.hidden()` PR.
- If region compositing is split as the #1267 proposal suggests, each slice becomes `clip({ to: sliceRect }, [offset(source)])`. That does not change `cut`'s spelling.
