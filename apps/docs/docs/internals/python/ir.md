---
title: The Intermediate Representation
section: Python
order: 10
status: draft
---

# The Intermediate Representation

The Python and JavaScript APIs both serialize a chart to the same JSON
**intermediate representation (IR)**. The IR is what makes a chart render
identically regardless of which language built it.

The full design, schema, and multi-stage plans live in
[Frontend IR (Serialization)](/internals/frontend/serialization). The
canonical TypeScript types and validator ship in the
[`gofish-ir`](https://github.com/gofish-graphics/gofish-graphics/tree/main/packages/gofish-ir)
workspace package; the JS-side emitter and deserializer live in
[`packages/gofish-graphics/src/serialize/`](https://github.com/gofish-graphics/gofish-graphics/tree/main/packages/gofish-graphics/src/serialize).

## Python's role

The Python wrapper (`packages/gofish-python/gofish/ast.py`) builds a
`ChartBuilder` whose `to_ir()` / `to_dict()` methods emit the IR JSON.
Every Python class — `Mark`, `Operator`, `ChartBuilder`, `LayerBuilder`,
`ConstrainableMark`, `_RefProxy` — implements `to_dict()`. The shipped IR
matches the canonical schema (validated in CI by
`pnpm --filter @gofish/tests validate-python-ir`).

The widget bundle (`packages/gofish-python/widget-src/index.ts`) consumes
the IR via the same JS-side deserializer (`Serialize.buildChart`) that
any pure-JS consumer would use. Two bridge concerns stay in the widget:
the `DeriveBridge` (anywidget RPC for Python lambdas) and the Arrow
encoding for data transport.

## Bridge extensions

The widget IR carries a handful of fields not in the canonical schema —
they're bridge-specific:

| Sentinel            | Meaning                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `{__gofish_lambda}` | A Python callable registered on the widget side. The JS deserializer wires it to an async per-row accessor via the bridge. |
| `{__gofish_token}`  | A hygienic-name token. First sighting mints a `createName(tag)` Token; subsequent uses reuse it within one render.         |
| `__scope: true`     | The `@mark` decorator stamps this so the harness wraps the resolved node in `node.scope()`.                                |
| `__datum` / `__key` | `bind_data()` pre-binds a datum + key for Treemap-style invocation.                                                        |

Python's `datum(x)` emits the canonical `{type: "datum", datum: x}` shape
directly — no bridge sentinel needed.

These are documented as the **Python-bridge schema extension** — they
extend the canonical IR for the round-trip between Python and the widget
but aren't part of the public form Olli or other JS consumers see.

## Source

See [Frontend IR (Serialization)](/internals/frontend/serialization) for
the schema, the worked examples, and the multi-stage roadmap.
