# How to name and scope

When you build composable components — a `stackSlot` that itself contains a `box` and a `value` text; a `heapObject` that contains many `elmTuple`s — the names you give to inner nodes have to _not_ collide across instances. gofish has two complementary mechanisms for this:

1. **Strings** are **layer-local**. Use them for constraint callbacks.
2. **`createName(tag)`** tokens are **externally addressable**. Use them for cross-component references.

## Strings: layer-local names

`.name("x")` on a child of a `Layer` makes `x` available inside that layer's `.constrain()` callback, and to a local `ref("x")` lookup. Strings never cross component boundaries, never register globally, and never show up as path segments.

```ts
Layer([
  rect({ w: 200, h: 150, fill: "#eee" }).name("bg"),
  text({ text: "Title" }).name("label"),
]).constrain(({ bg, label }) => [
  Constraint.align({ x: "middle", y: "end" }, [label, bg]),
]);
```

This is the workhorse mechanism. Reach for strings first; strings are simpler and enforce composition by default.

## createName

```ts
import { createName } from "gofish-graphics";

const myName = createName("tag");
```

`createName(tag)` returns a `Token` — a unique JS value carrying a string tag. Each call produces a fresh token; two `createName("value")` calls from two component instances are _different_ tokens even though they share the tag. That's what makes this hygienic.

When you attach a token to a node with `.name(token)`:

- The node registers **globally** in the token context, so `ref(token)` looks it up from anywhere.
- The node registers in the **nearest enclosing scope root**'s scope map under the token's tag, so a path like `ref(parentToken).tag` can find it.
- The tag still works as a constraint-callback key inside the enclosing Layer.

```ts
const valueName = createName("value");

Layer([
  rect({ w: 40, h: 40 }).name("box"),
  text({ text: "5" }).name(valueName),
]).constrain(({ box, value }) => [
  Constraint.align({ x: "middle", y: "middle" }, [box, value]),
]);
```

## Scope roots with createMark

A _scope root_ is a node whose tagged descendants form a named scope. Every mark built with `createMark` is automatically a scope root — `createMark` calls `.scope()` on its output. Built-in marks (`rect`, `text`, …) are leaves so the scope is inert there; user-defined component-style marks (no `channels` arg, just a `(props) => Node` function) get hygienic naming for free:

```ts
import { createMark, createName } from "gofish-graphics";

export const stackSlot = createMark(({ variable, value }: StackSlotProps) => {
  const boxTag = createName("box");
  const valueTag = createName("value");
  return Spread({ dir: "x", spacing: 5 }, [
    text({ text: variable }).name("variable"),
    Layer([
      rect({ w: 40, h: 40 }).name(boxTag),
      text({ text: value }).name(valueTag),
    ]).constrain(({ box, value }) => [
      Constraint.align({ x: "middle", y: "middle" }, [box, value]),
    ]),
  ]);
});
```

- The mark's output (the `Spread` here) is the scope root.
- `valueTag` and `boxTag` are Tokens: they register in `stackSlot`'s scope under tags `"value"` and `"box"`.
- `"variable"` (the left-side text) is a plain string: layer-local only, not path-addressable from outside.

You can also call `.scope()` directly on any node if you're working without `createMark`:

```ts
return Spread(...).scope();
```

## Paths

Arrows and cross-component refs use **paths** to descend through scopes. `ref(token)` returns a chainable proxy:

```ts
ref(parentToken).tag1[i].tag2;
```

- The token is the root (global lookup).
- Property access (`.tag1`) walks the current scope map by tag.
- Index access (`[i]`) picks the positional child.
- For variadic dynamic segments, use `.path(...)`: `ref(token).path(...arr).next`.
- An equivalent array form is also accepted: `ref([token, "tag1", i, "tag2"])`.

Because scopes are per-instance, you can have many stackSlots with inner tag `"value"` and there's no ambiguity — the path always names the specific instance before descending.

### Example: arrows between composed components

```ts
const globalFrameName = createName("globalFrame");
const heapName = createName("heap");

Layer([
  Spread({ dir: "x", spacing: 100 }, [
    globalFrame({ stack }).name(globalFrameName),
    heap({ heap, heapArrangement }).name(heapName),
  ]),
  Arrow({ stroke: "#1A5683" }, [
    // "value" text of the 0th stack slot inside globalFrame's "variables"
    ref(globalFrameName).variables[0].value,
    // "elm-0" of the heap cell at row 0, col 0
    ref(heapName)[0][0].elmTuples[0],
  ]),
]);
```

## Decision table

| I want to…                                                   | Use                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Reference a sibling by name in a Layer's `.constrain()`      | `.name("x")` string                                    |
| Reference a sibling with `ref("x")` inside the same Layer    | `.name("x")` string                                    |
| Make an inner node reachable from outside the component      | `createName("tag")` + `.name(token)`                   |
| Give a component instance a global handle the caller can use | Caller calls `createName("foo")`, then `.name(handle)` |
| Reach deep into another component                            | Path: `ref(token).tag[i]...` (or `ref([token, ...])`)  |
| Avoid dynamic string suffixes like `item-${i}`               | Use integer positional indices in the path             |

## Gotchas

- **Strings are not path-addressable.** If you want a name to appear in a `ref(token).…` path, use `createName`.
- **Scopes are per-node, not per-file.** Every `createMark` invocation produces a fresh scope at runtime, so each component instance has its own.
- **The first path segment must be a Token.** Paths don't start from strings because strings have no global identity.
- **Reserved names.** A handful of property names (`name`, `type`, `parent`, `dims`, `path`, `then`, `toString`, `constructor`, …) pass through to the underlying `GoFishRef` instead of becoming path segments. Use `ref(token).path("name")` or the array form to reach a child whose tag collides with one of these.
