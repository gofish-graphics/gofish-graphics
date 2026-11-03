# Rename `position()` to `translate()`: one node, one name, one form on the wire

From #1267 (how to define a shape without drawing it: `.hidden()`, and region compositing). Proposal page: https://claude.ai/artifact/Pc7MBRfGfQyTWvhFTXaH3H. Signed off 2026-11-03.

`.translate()` and `position()` build the same node, but they have two names and go on the wire in two forms. This issue proposes one operator, `translate`, with `.translate()` as its method twin.

## How it works today

- `.translate(opts)` is attached to every mark and operator in `attachModifiers` (`packages/gofish-graphics/src/ast/marks/createOperator.ts`). `translateMark` wraps the mark's node in `positionNode(opts, [node])`.
- `position(opts, children)` (`src/ast/graphicalOperators/position.tsx`) calls the same `positionNode` (`positionNode.tsx`). The node has type `"position"` and throws unless it has exactly one child.
- The node places its child at 0 if nothing placed it, then moves it by `(x, y)`. A datum offset moves the child in data. So it moves by an amount. The `position` docs say it sets the child's min-corner, which is true only when the child sits at 0.
- On the wire, `.translate` is a `translate: { x, y }` field on the mark (`MARK_BASE_FIELDS` in `packages/gofish-ir/src/frontend/descriptors.ts`, `TranslateIR` in `schema.ts`, numbers only). `serialize/fromJSON.ts` reapplies it by calling `.translate`. `position` is its own combinator node, and its `x` and `y` take a datum. So one fact has two homes in the IR, and the field cannot carry a datum offset that JS allows.

Two other names are near this one and do not change: `offset(opts, [child])` moves only the paint and keeps the reported box, and `Constraint.position` places a child elsewhere in a layer.

## Proposal

Rename `position` to `translate`. Keep `.translate()` as its method twin, which builds the same node. Put one `translate` node on the wire, and remove the `translate` field from the mark base fields.

This follows the rule in the #1267 proposal (a way to define a shape without drawing it): a chain method has a function twin only when it is sugar for an operator with one child, and both spellings build the same node.

Current:

```js
rect({ w: 20, h: 20 }).translate({ x: 10 }); // field: translate: { x: 10 }
position({ x: 10 }, [rect({ w: 20, h: 20 })]); // node: { type: "position" }
```

```python
rect(w=20, h=20).translate(x=10)
position([rect(w=20, h=20)], x=10)
```

Proposed:

```js
translate({ x: 10 }, [rect({ w: 20, h: 20 })]);
rect({ w: 20, h: 20 }).translate({ x: 10 }); // the same node
```

```python
translate([rect(w=20, h=20)], x=10)
rect(w=20, h=20).translate(x=10)  # the same node
```

## Callsites

- `position(...)`: about 12 in 4 story files (`EncloseShapes`, `EncloseMembers`, `lowlevel/OffsetRegressions`, `bluefish/Topology`), and about as many in their 4 Python parity ports.
- Docs: 12 in the JS and Python API pages (`api/shape.md` and `api/operators/position.md` in each language), and 13 in 2 internals diagrams (`internal-three-traditions-venn.ts`, `internal-local-propagation.ts`). The `operators/position.md` pages are renamed in both languages.
- `.translate(...)` calls stay as they are.
- The descriptor entry, the generated Python wrapper, the deserializer table and `TranslateIR` change together. Old IR with a `translate` field or a `position` node is not kept working.

## Notes

- This goes in its own PR, together with the `cut` argument-order fix (#1282), apart from the `.hidden()` and compositing PR.
- Related: #722 (`position()` anchors at the min-corner, which forces half-size offset math by hand).
- Old docs that describe `position` as "set the min-corner" should say "move by".
