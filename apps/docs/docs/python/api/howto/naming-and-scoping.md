# How to name and scope

When you build composable components — a `stack_slot` that itself contains a
`box` and a `value` text; a `heap_object` that contains many `elm_tuple`s — the
names you give to inner nodes have to _not_ collide across instances. GoFish has
two complementary mechanisms for this:

1. **Strings** are **layer-local**. Use them for constraint callbacks.
2. **`createName(tag)`** tokens are **externally addressable**. Use them for
   cross-component references.

## Strings: layer-local names

`.name("x")` on a child of a [`layer`](/python/api/constraints/constrain) makes
`x` available inside that layer's `.constrain()` callback. Strings never cross
component boundaries, never register globally, and never show up as path
segments.

```python
from gofish import layer, rect, text, Constraint

layer([
    rect(w=200, h=150, fill="#eee").name("bg"),
    text(text="Title").name("label"),
]).constrain(lambda bg, label: [
    Constraint.align([label, bg], x="middle", y="end"),
])
```

This is the workhorse mechanism. Reach for strings first; strings are simpler and
enforce composition by default.

## createName

```python
from gofish import createName

my_name = createName("tag")
```

`createName(tag)` returns a `Token` — a unique value carrying a string tag. Each
call produces a fresh token; two `createName("value")` calls from two component
instances are _different_ tokens even though they share the tag. That's what
makes this hygienic.

When you attach a token to a node with `.name(token)`:

- The node registers **globally** in the token context, so `ref(token)` looks it
  up from anywhere.
- The node registers in the **nearest enclosing scope root**'s scope map under
  the token's tag, so a path like `ref(parent_token).tag` can find it.
- The tag still works as a constraint-callback key inside the enclosing layer.

```python
from gofish import layer, rect, text, createName, Constraint

value_name = createName("value")

layer([
    rect(w=40, h=40).name("box"),
    text(text="5").name(value_name),
]).constrain(lambda box, value: [
    Constraint.align([box, value], x="middle", y="middle"),
])
```

## Scope roots with @mark {#scope-roots-with-mark}

A _scope root_ is a node whose tagged descendants form a named scope. Every
component built with the `@mark` decorator is automatically a scope root — `@mark`
flags its output as a scope boundary. Built-in marks (`rect`, `text`, …) are
leaves so the scope is inert there; user-defined component-style marks (a
`(**props) -> Mark` function) get hygienic naming for free:

```python
from gofish import mark, layer, spread, rect, text, createName, Constraint

@mark
def stack_slot(variable, value):
    box_tag = createName("box")
    value_tag = createName("value")
    return spread([
        text(text=variable).name("variable"),
        layer([
            rect(w=40, h=40).name(box_tag),
            text(text=value).name(value_tag),
        ]).constrain(lambda box, value: [
            Constraint.align([box, value], x="middle", y="middle"),
        ]),
    ], dir="x", spacing=5)
```

- The component's output (the `spread` here) is the scope root.
- `value_tag` and `box_tag` are Tokens: they register in `stack_slot`'s scope
  under tags `"value"` and `"box"`.
- `"variable"` (the left-side text) is a plain string: layer-local only, not
  path-addressable from outside.

The decorator is imported as `mark` (`from gofish import mark`) and applied as
`@mark`; it is the Python mirror of JS `createMark`.

## Paths

Arrows and cross-component refs use **paths** to descend through scopes.
`ref(token)` returns a chainable proxy:

```python
ref(parent_token).tag1[i].tag2
```

- The token is the root (global lookup).
- Attribute access (`.tag1`) walks the current scope map by tag.
- Index access (`[i]`) picks the positional child.
- For variadic dynamic segments, use `.path(...)`:
  `ref(token).path(*segs).next`.

Because scopes are per-instance, you can have many `stack_slot`s with inner tag
`"value"` and there's no ambiguity — the path always names the specific instance
before descending.

### Example: arrows between composed components

```python
from gofish import layer, spread, arrow, ref, createName

global_frame_name = createName("global_frame")
heap_name = createName("heap")

layer([
    spread([
        global_frame(stack=stack).name(global_frame_name),
        heap(heap=heap, heap_arrangement=heap_arrangement).name(heap_name),
    ], dir="x", spacing=100),
    arrow([
        # "value" text of the 0th stack slot inside global_frame's "variables"
        ref(global_frame_name).variables[0].value,
        # "elm-0" of the heap cell at row 0, col 0
        ref(heap_name)[0][0].elm_tuples[0],
    ], stroke="#1A5683"),
])
```

## Decision table

| I want to…                                                   | Use                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Reference a sibling by name in a layer's `.constrain()`      | `.name("x")` string                                    |
| Make an inner node reachable from outside the component      | `createName("tag")` + `.name(token)`                   |
| Give a component instance a global handle the caller can use | Caller calls `createName("foo")`, then `.name(handle)` |
| Reach deep into another component                            | Path: `ref(token).tag[i]...`                           |
| Avoid dynamic string suffixes like `f"item-{i}"`             | Use integer positional indices in the path             |

## Gotchas

- **Strings are not path-addressable.** If you want a name to appear in a
  `ref(token)....` path, use `createName`.
- **Scopes are per-node, not per-file.** Every `@mark` invocation produces a
  fresh scope at runtime, so each component instance has its own.
- **The first path segment must be a Token.** Paths don't start from strings
  because strings have no global identity.
- **Reserved names.** A handful of attribute names (`name`, `label`, `render`,
  `to_dict`, `to_ir`, `constrain`, `multiplicity`, and any leading-underscore
  name) pass through to the underlying ref proxy instead of becoming path
  segments. Use `ref(token).path("name")` to reach a child whose tag collides
  with one of these.
