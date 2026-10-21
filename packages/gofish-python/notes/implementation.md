# GoFish Python Implementation Architecture

## Overview

The gofish-python package provides a Python interface to the GoFish Graphics library, enabling users to create interactive visualizations in Jupyter notebooks using a Pythonic API. The implementation consists of three main layers:

1. **Python API Layer** - Fluent chart-building API that mirrors the JavaScript high-level API
2. **Intermediate Representation (IR)** - JSON-based specification that bridges Python and JavaScript
3. **Widget Rendering Layer** - AnyWidget-based browser rendering with bidirectional RPC

## High-Level Architecture

```mermaid
graph TB
    subgraph Python["Python Layer"]
        CB[ChartBuilder<br/>ast.py]
        Ops[Operators<br/>ast.py]
        Marks[Marks<br/>ast.py]

        CB --> IR[JSON IR + Data<br/>chart spec]
        Ops --> IR
        Marks --> IR
    end

    IR -->|"Serialization:<br/>• JSON IR (spec)<br/>• Apache Arrow (data)<br/>• base64 encoding"| Widget

    subgraph AnyWidget["AnyWidget Bridge"]
        Widget[GoFishChartWidget<br/>widget.py<br/><br/>• Traitlets for sync<br/>• Callback registry<br/>• @observe(call_request)]
    end

    Widget -->|"Transport:<br/>• doc (JSON IR, tables as base64 Arrow by id)<br/>• one bridge call via synced traits"| JS

    subgraph Browser["JavaScript Layer (Browser)"]
        JS[Widget Bundle<br/>widget.esm.js]

        subgraph Bundle["Widget Components"]
            Arrow[Arrow Decode<br/>& Encode]
            IRMap[IR Mapping<br/>to GoFish]
            Render[Render<br/>Solid.js]
        end

        subgraph Deps["Bundled Dependencies"]
            GF[gofish-graphics]
            Solid[solid-js]
            ArrowLib[apache-arrow]
        end

        JS --> Arrow
        JS --> IRMap
        JS --> Render
    end

    style Python fill:#e1f5ff
    style AnyWidget fill:#fff4e1
    style Browser fill:#f0ffe1
    style Bundle fill:#ffe1f5
    style Deps fill:#f5e1ff
```

## Component Details

### 1. Python API Layer (`gofish/ast.py`)

The Python layer provides a fluent, builder-pattern API for constructing chart specifications.

#### Key Classes

**ChartBuilder**

- Immutable builder pattern (each method returns a new instance)
- Holds data, operators, mark, and options
- Methods:
  - `flow(*operators)` - Add operators to the pipeline
  - `mark(mark)` - Set the visual encoding
  - `to_ir()` - Serialize to JSON IR
  - `render(w, h, axes, debug)` - Create and display widget

**Operator**

- Base class for all operators (spread, stack, group, scatter)
- Stores operator type and parameters
- `to_dict()` method serializes to IR format

**DeriveOperator** (special case)

- Extends Operator
- Represents a Python callable (lambda)
- Generates unique `lambda_id` (UUID) for RPC identification
- The actual function is NOT serialized (stays Python-side)

**Mark**

- Base class for all marks (rect, circle, line, area, blank)
- Stores mark type and visual encoding parameters
- `to_dict()` method serializes to IR format

#### Factory Functions

The module exports factory functions for ergonomic API:

- Operators: `spread()`, `stack()`, `derive()`, `group()`, `scatter()`
- Marks: `rect()`, `circle()`, `line()`, `area()`, `blank()`
- Chart: `chart(data, options)`

### 2. Data Marshaling (`gofish/arrow_utils.py`)

Efficient data transfer between Python and JavaScript using Apache Arrow IPC format.

**Why Apache Arrow?**

- Zero-copy deserialization in JavaScript
- Type preservation (int vs float vs string)
- 3-5x smaller than JSON for tabular data
- Efficient for large datasets (100k+ rows)

**Key Functions**

`data_to_arrow_bytes(data) -> bytes`

- Converts a list or any narwhals dataframe to Arrow IPC stream bytes
- A table is a list, so it is one Arrow column, `item`, of the items' type:
  a struct column for records (a dataframe's columns wrapped without a
  copy), a scalar column for values, a list column for groups

`arrow_to_records(arrow_bytes) -> list`

- Converts Arrow IPC bytes back to the list: column 0's values
- Used for deserializing data from JavaScript (for every bridge call)

**Type Handling**

- Every column keeps its Arrow type: int64 stays int64 (the JS decode types
  it `HasInteger` and the JS encode sends it back as int64), and
  timestamps keep their zone
- The JS decode turns 64-bit integers into JS numbers

### 3. Intermediate Representation (IR)

The IR is a simple, flat JSON structure that describes the chart specification.

**Format**

```json
{
  "data": null,
  "operators": [
    {
      "type": "spread",
      "field": "lake",
      "dir": "x",
      "spacing": 64
    },
    {
      "type": "derive",
      "lambdaId": "a8f3b2c1-..."
    },
    {
      "type": "stack",
      "field": "species",
      "dir": "y"
    }
  ],
  "mark": {
    "type": "rect",
    "h": "count",
    "fill": "species"
  },
  "options": {
    "w": 800,
    "h": 600
  }
}
```

**Design Choices**

1. **Data is separate** - Data is marshaled via Arrow, not included in IR
2. **Flat operator list** - Current implementation assumes linear pipeline (chart API)
3. **String-based types** - Simple and JSON-serializable
4. **Lambda IDs for derive** - Functions can't be serialized, so we use IDs for RPC

**Limitations**

- Cannot represent nested operator trees (for lower-level API and nested charts)
- No support for custom operators (no registry pattern yet)
- No schema validation (relies on JavaScript to fail gracefully)

### 4. Widget Layer (`gofish/widget.py`)

AnyWidget-based widget for rendering charts in the browser.

**GoFishChartWidget**

Inherits from `anywidget.AnyWidget` to provide seamless Jupyter integration.

**Traitlets (State Management)**

Static (Python → JS, set once in `__init__`):

- `doc` (Dict, synced) — The IR document as `ir_payload` ships it: its
  `root`, and its `tables` (the rows of every chart with rows of its own,
  wherever it sits) as base64 Arrow IPC by table id
- `width`, `height`, `axes`, `legend`, `padding`, `debug` (synced) — Render options
- `container_id` (synced) — Unique DOM element ID

The bridge's one call (bidirectional via observers), for every Python
callback the IR names (a derive operator, an accessor, a mark function):

- `call_request` (Dict, synced, JS → Python) — `{request_id, lambda_id, rows_b64}`
- `call_response` (Dict, synced, Python → JS) — `{request_id, reply}` (the
  reply's document, its tables as base64 Arrow) or `{request_id, error}`

Status (JS → Python, terminal):

- `render_result` (Dict, synced) — `{value: True}` on success or `{error: str}` on failure

Python-only:

- `callbacks` (Dict, NOT synced) — `lambda_id -> callback` registry, the
  `payload.callbacks` of the IR walk; a mark function's reply adds its own

**Widget Initialization Flow**

1. Load pre-built widget bundle from `gofish/_static/widget.esm.js`
2. Fail fast with clear error if bundle is missing
3. Sync the document `ir_payload` built (tables already base64 Arrow)
4. Store the callbacks in the Python-side registry
5. Initialize AnyWidget with `_esm` code and synced traitlets

**RPC Mechanism for Callbacks**

We follow the Altair `JupyterChart` / Plotly `FigureWidget` pattern: synced
traitlets + observer handlers, no `experimental.invoke` and no custom messages.
This works identically in Jupyter and marimo because `experimental.invoke` is
unsupported in marimo.

```python
@traitlets.observe("call_request")
def _on_call_request(self, change):
    msg = change["new"]
    if not msg:
        return
    request_id = msg["request_id"]
    try:
        # Run the callback on the decoded rows, register the callbacks its
        # reply names, and ship the reply as a document.
        reply = answer(self.callbacks, msg["lambda_id"], msg["rows_b64"])
        self.call_response = {"request_id": request_id, "reply": reply}
    except Exception as exc:
        self.call_response = {"request_id": request_id, "error": str(exc)}
```

`answer` (in `gofish/ast.py`) is the same function the parity harness's
derive server answers with. The JS side correlates responses to requests via
`request_id`. Calls are sequential (one in-flight per widget), so a single
trait pair is enough. The
fire-and-forget shape avoids the comm-during-cell-execution issue documented
in [ipywidgets#1349](https://github.com/jupyter-widgets/ipywidgets/issues/1349).

**Why AnyWidget?**

- Native Jupyter support (JupyterLab, Notebook, VSCode, Colab)
- ESM module support (modern JavaScript)
- Bidirectional communication via traitlets + commands
- No backend server required (client-side rendering)
- Active development and good documentation

### 5. JavaScript Widget Bundle (`widget-src/index.ts`)

Self-contained ESM bundle that runs in the browser.

**Architecture**

The widget is a single TypeScript module bundled with all dependencies:

```typescript
import { Serialize } from "gofish-graphics";
import { arrowBridge, decodeDocument } from "./arrowBridge";

export default {
  initialize({ model }) {
    // Wire up the bridge: the one Arrow codec over a per-widget pending
    // map + model.on("change:call_response") listener.
    (model as any).__gofishBridge = arrowBridge(traitTransport(model));
  },
  async render({ model, el }) {
    // 1. Decode the `doc` trait's tables from Arrow (decodeDocument)
    // 2. Serialize.renderIR(doc, container, renderOptions, bridge)
    // 3. Set render_result for status
  },
};
```

**Key Functions**

`decodeDocument(doc)` (`arrowBridge.ts`)

- Decodes a shipped document's base64 Arrow tables into lists
  (`arrowDecode.ts`): a table is one column of its items, so column 0 is
  the list; a struct column's fields are the records' columns, read from
  its child vectors, and carry column types (`HasCalendar` for times,
  `HasInteger` for integers); BigInt -> Number

`arrowBridge(send)` (`arrowBridge.ts`)

- The `Serialize.DeriveBridge`: one `call(lambdaId, rows)`
- Encodes the rows as base64 Arrow (`arrowTransport.ts`: one column of the
  items; a number column is Int64 when typed `HasInteger`, a timestamp
  when typed `HasCalendar`, Float64 otherwise), sends them, and decodes the
  reply document's tables
- The parity harness builds its bridge with it too, over HTTP

`traitTransport(model)` (`index.ts`)

- The widget's `send`: sets `call_request`, resolves on the matching
  `call_response`, one request in flight at a time

`renderChart(model, container, bridge)`

- Decodes the `doc` trait and calls `Serialize.renderIR`, the one IR
  renderer the parity harness uses too

**Callback Implementation**

The deserializer (`gofish-graphics/serialize`) calls the bridge wherever the
IR names a Python callback. A `derive` operator rebuilds as:

```typescript
derive: (opts, bridge) =>
  derive((d) => callForRows(bridge, opts.lambdaId, d), {
    schema: opts.schema,
  });
```

`callForRows` makes the call and reads the list the reply's root names
(`{type: "table", id}`). An accessor reads its values the same way, and a
mark function rebuilds the IR its reply's root holds.

**Error Handling**

- Try/catch around all major operations
- `renderError()` helper displays errors in the DOM
- Debug mode shows full stack traces
- Clear error messages for common issues

## Build System

### Widget Bundle Build (`build-widget.mjs`)

The widget bundle is built using esbuild at package build time.

**Build Configuration**

```javascript
{
  entryPoints: ["widget-src/index.ts"],
  bundle: true,              // Bundle all dependencies
  platform: "browser",       // Target browser environment
  target: "es2019",          // Modern JS (async/await, etc.)
  format: "esm",             // ES modules
  sourcemap: "inline",       // Include source maps for debugging
  outfile: "gofish/_static/widget.esm.js",
  external: [],              // Bundle everything (no externals)
}
```

**Dependency Resolution**

The build script uses esbuild's standard module resolution:

- Sets `absWorkingDir` to the workspace root to resolve hoisted dependencies
- Relies on the workspace link (`"gofish-graphics": "workspace:*"` in package.json)
- esbuild resolves `gofish-graphics` through normal node_modules resolution from the workspace root

**Build Trigger**

The bundle is built via:

```bash
pnpm run build:widget
# or directly:
node build-widget.mjs
```

This should be run:

- During development (after widget code changes)
- Before package distribution (in CI/CD)
- Optionally in setup.py/pyproject.toml build hooks

## Data Flow: End-to-End Example

Let's trace a complete example with a derive operator:

### Python Code

```python
import pandas as pd
from gofish import chart, spread, stack, derive, rect

data = pd.DataFrame({
    "lake": ["A", "A", "B", "B"],
    "species": ["X", "Y", "X", "Y"],
    "count": [10, 20, 15, 25]
})

chart(data) \
    .flow(
        spread("lake", dir="x", spacing=64),
        derive(lambda df: df.sort_values("count")),
        stack("species", dir="y")
    ) \
    .mark(rect(h="count", fill="species")) \
    .render(w=800, h=600)
```

### Step-by-Step Flow

**1. Chart Construction (Python)**

- `chart(data)` creates `ChartBuilder` with data reference
- `.flow(...)` adds three operators to the pipeline
- `derive(lambda ...)` creates `DeriveOperator` with unique `lambda_id="abc123"`
- `.mark(rect(...))` sets the mark
- `.render()` triggers serialization and widget creation

**2. Serialization (Python)**

- One IR walk (`ir_payload`) writes the IR and collects what ships beside
  it: each chart's rows as a table, as base64 Arrow IPC by id, and every
  callback the IR names: `{"abc123": <the derive's callback>}`

**3. Widget Creation (Python)**

- `GoFishChartWidget` initialized with:
  - `doc` = the IR document, tables as base64 Arrow by table id
  - `callbacks` = {"abc123": <the derive's callback>}
  - `width=800, height=600`
- Widget loads `_esm` bundle from `_static/widget.esm.js`
- Widget syncs traitlets to JavaScript

**4. Widget Render (JavaScript)**

- AnyWidget calls `initialize({ model })` once to wire up the bridge,
  then `render({ model, el })` to paint the chart
- Decode each table: base64 -> Arrow bytes -> `Arrow.tableFromIPC()`
- Convert the table's one column (a struct column for rows) -> array of
  objects:
  ```js
  [
    {lake: "A", species: "X", count: 10},
    {lake: "A", species: "Y", count: 20},
    ...
  ]
  ```

**5. Operator Reconstruction (JavaScript)**

- Map `spread` operator:
  ```js
  spread("lake", { dir: "x", spacing: 64 });
  ```
- Map `derive` operator:
  ```js
  derive((d) => callForRows(bridge, "abc123", d));
  ```
- Map `stack` operator:
  ```js
  stack("species", { dir: "y" });
  ```
- Map `rect` mark:
  ```js
  rect({ h: "count", fill: "species" });
  ```

**6. Chart Rendering (JavaScript)**

- Create GoFish chart:
  ```js
  chart(data).flow(spreadOp, deriveOp, stackOp).mark(rectMark);
  ```
- GoFish processes operators sequentially
- When it hits `deriveOp`, the async function executes

**7. Derive RPC (JavaScript -> Python -> JavaScript)**

JavaScript side:

```js
// Current data at this point in pipeline
const currentData = [...];  // After spread

// The bridge encodes the rows as base64 Arrow, sets the call_request trait,
// and resolves when call_response arrives with a matching request_id. The
// reply is a document: its root names the table of the rows the callback
// returned, and its tables are decoded.
const reply = await bridge.call("abc123", currentData);
const sortedData = reply.tables[reply.root.id];
```

Python side (`@traitlets.observe("call_request")`):

```python
# change.new == {"request_id": "r-0", "lambda_id": "abc123", "rows_b64": ...}
reply = answer(self.callbacks, "abc123", msg["rows_b64"])
# reply == {"irVersion": 0, "ir": "gofish-frontend",
#           "root": {"type": "table", "id": "t0"}, "tables": {"t0": <base64 Arrow>}}
self.call_response = {"request_id": "r-0", "reply": reply}
```

**8. Final Render (JavaScript)**

- Sorted data continues through pipeline
- `stack` operator positions elements
- `rect` mark creates visual encoding
- GoFish renders SVG to DOM container
- Chart appears in notebook output cell

## Testing

### Python Unit Tests (`tests/test_ast.py`)

Comprehensive pytest suite covering:

- Operator creation and serialization
- Mark creation and serialization
- ChartBuilder fluent API
- IR generation and JSON serializability
- Edge cases (missing mark, empty operators, etc.)

Run tests:

```bash
pytest tests/test_ast.py -v
```

### Jupyter Notebook Tests

Interactive testing in notebooks:

- `tests/test_ir.ipynb` - IR generation and inspection
- `tests/test_rendering.ipynb` - Widget rendering and derive RPC

Run notebooks:

```bash
jupyter notebook tests/
```

## Debugging

### Python Side

Enable debug output:

```python
widget = chart(data).mark(rect(h="y")).render(debug=True)
```

Check widget state:

```python
print(widget.doc["root"])
print(list(widget.doc.get("tables", {})))  # the table ids the IR names
print(widget.callbacks.keys())
```

### JavaScript Side

Open browser console (F12 in JupyterLab) when `debug=True`:

```
[GoFish Widget] render() called
[GoFish Widget] Container ID: gofish-chart-a1b2c3d4
[GoFish Widget] Decoding Arrow data...
[GoFish Widget] Arrow table: 1000 rows
[GoFish Widget] Converted to 1000 data objects
[GoFish Widget] Processing spec: {operators: [...], mark: {...}}
[GoFish Widget] Mapping operator: spread
[GoFish Widget] Mapping operator: derive
[GoFish Widget] Mapping mark: rect
[GoFish Widget] Building chart...
[GoFish Widget] Render options: {w: 800, h: 600, axes: false, debug: true}
[GoFish Widget] Calling node.render()...
[GoFish Widget] Chart rendered successfully!
```
