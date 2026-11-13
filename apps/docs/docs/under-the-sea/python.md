---
title: How does a spec cross to Python and back?
label: Python
order: 7
topics:
  - Python
  - serialization
  - frontend IR
  - intermediate representation
  - descriptor table
  - code generation
  - deserializer
  - derive
  - bridge
  - lambda
  - Arrow
  - anywidget
  - notebook
  - display list
  - parity
reads:
  - packages/gofish-ir/src/index.ts
  - packages/gofish-ir/src/frontend/index.ts
  - packages/gofish-ir/src/frontend/schema.ts
  - packages/gofish-ir/src/frontend/descriptors.ts
  - packages/gofish-ir/src/frontend/validate.ts
  - packages/gofish-ir/src/display-list/schema.ts
  - packages/gofish-ir/src/display-list/render.ts
  - packages/gofish-python/scripts/generate.ts
  - packages/gofish-python/gofish/_generated.py
  - packages/gofish-python/gofish/ast.py
  - packages/gofish-python/gofish/widget.py
  - packages/gofish-python/gofish/arrow_utils.py
  - packages/gofish-python/widget-src/index.ts
  - packages/gofish-python/widget-src/arrowBridge.ts
  - packages/gofish-python/build-widget.mjs
  - packages/gofish-graphics/src/serialize/index.ts
  - packages/gofish-graphics/src/serialize/fromJSON.ts
  - packages/gofish-graphics/src/serialize/registry.ts
  - packages/gofish-graphics/src/serialize/toJSON.ts
  - packages/gofish-graphics/src/ast/displayList/toDisplayList.ts
  - packages/gofish-graphics/src/ast/markChannels.generated.ts
  - packages/gofish-graphics/src/ast/marks/chartBuilder.ts
  - packages/gofish-graphics/src/tests/serialize.test.ts
  - tests/harness/main.ts
  - tests/scripts/capture-python-dom.ts
  - tests/scripts/compare-python.ts
  - tests/scripts/check-python-sync.ts
  - tests/scripts/validate-python-ir.ts
  - tests/scripts/derive-server.py
  - tests/scripts/diff-utils.ts
  - tests/scripts/path-mapping.ts
  - apps/docs/docs/.vitepress/markdown-it-gofish-ref.ts
  - .github/workflows/lint-format.yml
  - .github/workflows/visual-tests.yml
checked:
  commit: d0399a928ec694750cf0832c13195a791fc129c2
  date: 2026-11-13
cover:
  - figure: crossing
    rows: 2
    cols: 3
---

<script setup>
import PythonCrossing from "./python.crossing.vue";
</script>

The Python package draws nothing. It has no layout code and no renderer, yet this line draws a bar chart in a notebook.

```python
chart(rows).flow(spread(by="category", dir="x")).mark(rect(h="value"))
```

Python writes the chain down as JSON. The browser rebuilds from it the JavaScript objects a JavaScript author would have written, and JavaScript does the rest. Three parts need more care: Python functions, keeping each construct the same in both languages, and getting the picture back to Python.

## The representations, in order

An intermediate representation (IR) is a form of the chart that one stage writes and a later stage reads.

1. **Python builder objects.** `ChartBuilder`, `Operator` and `Mark` in `gofish/ast.py`. Your calls make them, and `to_ir()` reads them.
2. **The frontend IR document.** JSON, `{irVersion: 0, ir: "gofish-frontend", root, tables}`, typed in `gofish-ir/src/frontend/schema.ts`. It is the chain as written, before layout. Python's `to_ir()` and JavaScript's `Serialize.toJSON` write it. `Serialize.buildIR` reads it, and `Frontend.validate` checks it.
3. **The shipped document.** The same, with each table as base64 Arrow, a binary column format. Python's `ir_payload` writes it, and `decodeDocument` in `widget-src/arrowBridge.ts` reads it.
4. **JavaScript builder objects.** What `buildIR` makes, and what `.render()` reads.
5. **The node tree**, which layout places ([the pipeline](/under-the-sea/pipeline)).
6. **The display list.** Positioned shapes in absolute pixels, `ir: "gofish-display-list"`, typed in `gofish-ir/src/display-list/`. `toDisplayList` writes it and `displayListToSVG` reads it. The Python path does not use it.
7. **SVG markup.** The browser draws it, and the widget sends it back to Python.

Beside them sits the **descriptor table**, `descriptors.ts` in `gofish-ir`. It describes constructs, not charts: each one's wire `type` (the tag its node carries in the JSON), its kind (operator, leaf mark, combinator mark or coordinate transform), and its fields with their types, defaults and docs. The validator, the JSON Schema, the Python generator, the JavaScript channel maps, the docs options tables and the deserializer all read it.

<PythonCrossing />

## Out of Python

Python's `rect` is generated. It renames each keyword to its wire key (`stroke_width` to `strokeWidth`), drops the unset ones, and returns `Mark("rect", h="value")`. `spread` is written by hand because it has two forms: given children it is a combinator mark, and without them a flow operator. It picks the form and passes its options to the generated `_spread_opts`.

`to_ir()` calls each object's `to_dict(payload)`. The payload collects what travels beside the JSON: the tables, named `t0`, `t1` and so on in walk order, and the callbacks described below.

The figure's middle panel is what `to_ir()` prints for the chart above. The same chart written in JavaScript and passed to `Serialize.toJSON` gives the same document, apart from key order and an empty `options` that only Python writes.

## Back into JavaScript

`Serialize.renderIR` is `buildIR(doc, bridge).render(container, options)`. `buildIR` hands the root to `mapMark`. A chart node goes to `chartFromIR`, which rebuilds the operators and the mark, finds the rows its data names, and calls the real `chart(rows, options).flow(...).mark(...)`.

`rebuild(kind, type, opts)` makes each operator and mark. It looks the `type` up in the descriptor table. Five operators, `derive`, `resolve`, `filter`, `join` and `log`, have hand-written builders in `OPERATOR_BUILDERS`. Every other type calls `FACTORIES[type]`, the public factory a JavaScript author calls, with children as a second argument for a combinator.

So the result is not a copy of a JavaScript chart. It is one. `book:tree` prints the same tree for the rebuilt document and for the chart written in JavaScript.

::: rule Rebuild, do not interpret.
build(write(_spec_)) = _spec_\
<small>for any</small> _spec_ <small>with no function in it</small>

The reader calls the public factories, so a Python chart runs the code a JavaScript chart runs.
:::

## One construct, three places

- **The descriptor entry**, one call in `descriptors.ts`.
- **The Python wrapper.** `pnpm --filter gofish-python gen` writes `_generated.py` from the table. Leaf marks and the compositing marks are generated whole. A two-form construct gets a generated `_opts` function and a hand-written one in `ast.py` that picks the form. `derive`, `resolve`, `join` and `field` are hand-written. CI regenerates the file and fails on any difference, and does the same for the JavaScript channel maps in `markChannels.generated.ts`.
- **The deserializer entry**, one line in `FACTORIES`. `serialize.test.ts` fails when a descriptor has no factory or a factory no descriptor.

The validator reads the same table, so an undeclared key is an error.

::: rule One row, one of each.
_t_ ∈ table ⇔ _t_ ∈ FACTORIES ∪ OPERATOR*BUILDERS\
<small>and</small> fields(\_t*) = kwargs(py(_t_)) <small>renamed</small>

A construct the table does not list has no wire form.
:::

## Functions cross by name

A Python function cannot be written as JSON. It may appear as `derive(fn)`, as a channel accessor (`text=lambda d: ...`), or as a whole mark. Each gets a fresh lambda id, the payload records the function under it, and the JSON carries only the id. This is real `ir_payload` output for the chart with a `derive` before the `spread`:

```json
{ "type": "derive", "lambdaId": "7907c5a5-9d0b-480e-8474-9f3d76d05be3" }
```

An accessor becomes `{"__gofish_lambda": id}` and a mark function `{"type": "mark-fn", "lambdaId": id}`.

JavaScript rebuilds the `derive` with a function that calls the bridge, whose one method is `call(lambdaId, rows, refs)`. The rows go out as Arrow. Python runs the function and replies with a small document: a table of results for a derive or an accessor, or the IR of what a mark function drew, which JavaScript rebuilds like any mark. An accessor is called once per channel with all its rows. A ref, a handle to a drawn node, travels as its index and comes back as the same live ref.

A function anywhere else, such as `by=lambda r: ...`, raises a `TypeError` in Python.

::: rule Functions cross as names.
_fn_ ↦ id, <small>and later</small> call(id, _rows_) ↦ _fn_(_rows_)
:::

## Back to Python

`.render()`, which a notebook also calls to show a chart left as a cell's last value, hands the shipped document and the callbacks to `GoFishChartWidget`. It is an anywidget: a notebook widget whose front end is an ES module, here the library bundled with `widget-src/index.ts`, and whose state is synced fields. The module calls the same `Serialize.renderIR`. A bridge call sets `call_request` and Python answers in `call_response`, one call at a time, because the notebook keeps only the last of several writes in one tick. Once the `<svg>` appears, the module sends its markup in `svg_result` and the warnings in `layout_warnings`, which feed `widget.svg`, `.save("chart.svg")` and `.warnings`.

## Checking the two sides

`tests/python-stories/` holds Python ports of the Storybook stories: 466 `story_*` functions in 177 files, each file placed by its JavaScript story's title.

- `capture-python-dom.ts` runs `derive-server.py`, a Python host over HTTP, and a browser harness that renders each story through `renderIR` and the same Arrow bridge, and saves its normalized DOM.
- `compare-python.ts` compares that with the JavaScript capture of the same story at the same commit. Any difference fails.
- `check-python-sync.ts` fails when a story has no port, or its spec changes and its port does not.
- `validate-python-ir.ts` validates every story's document.

::: not-yet-true

- **No picture without a browser.** `.save()` needs a live front end to draw first, and writes only `.svg` (#577, #578).
- **The renderer does not validate.** Only tests and CI do, so a bad document fails wherever a factory trips.
- **JavaScript functions do not cross.** `toJSON` writes a JavaScript `derive(fn)` with no id, and `buildIR` throws on it.
- **Not every node is in the table.** `cut`, `offset`, `ref`, constraints and the envelope are checked by hand.
- **Exempt stories.** 47 entries in `.python-sync-exempt` skip the parity check, 30 of them for a single story export.

:::

## Where this lives in the code

::: code-map

- **Document types** gofish-ir frontend/schema.ts `FrontendIRDocument` 16
- **Descriptor table** frontend/descriptors.ts `OPERATORS` 1554, `DESCRIPTOR_TABLES` 2616
- **Validator** frontend/validate.ts `validate` 81
- **Python generator** scripts/generate.ts; gofish/\_generated.py `rect` 127
- **Python writer** gofish/ast.py `spread` 1734, `_Payload` 3911, `ir_payload` 4093, `answer` 4102
- **Widget** gofish/widget.py `GoFishChartWidget` 21; widget-src/index.ts `traitTransport` 57
- **Arrow codec** widget-src/arrowBridge.ts `decodeDocument` 28, `arrowBridge` 67
- **Reader** serialize/fromJSON.ts `mapMark` 494, `buildIR` 894
- **Factory table** serialize/registry.ts `FACTORIES` 257, `rebuild` 378, `callBridge` 189
- **Writer in JavaScript** serialize/toJSON.ts `toJSON` 225
- **Parity** tests/scripts/capture-python-dom.ts, compare-python.ts

:::
