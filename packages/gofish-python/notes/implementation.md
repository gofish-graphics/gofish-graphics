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
        Widget[GoFishChartWidget<br/>widget.py<br/><br/>• Traitlets for sync<br/>• Derive function registry<br/>• @observe(derive_request)]
    end

    Widget -->|"Transport:<br/>• spec (JSON)<br/>• arrow_data (base64)<br/>• Derive RPC via synced traits"| JS

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

`dataframe_to_arrow(df: pd.DataFrame) -> bytes`

- Converts pandas DataFrame to Arrow IPC bytes
- Handles Int64 -> Int32 conversion (JavaScript compatibility)
- Uses streaming format for efficient serialization

`arrow_to_dataframe(arrow_bytes: bytes) -> pd.DataFrame`

- Converts Arrow IPC bytes back to pandas DataFrame
- Used for deserializing data from JavaScript (for derive RPC)

**Type Handling**

- Int64/UInt64 columns are automatically downcast to Int32/UInt32 if values fit
- Prevents JavaScript BigInt issues while preserving precision when possible
- Falls back to original type if values are too large

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

- `spec` (Dict, synced) — Chart specification JSON
- `arrow_data` (Unicode, synced) — Base64-encoded Arrow IPC bytes
- `width`, `height`, `axes`, `debug` (synced) — Render options
- `container_id` (synced) — Unique DOM element ID

Derive RPC (bidirectional via observers):

- `derive_request` (Dict, synced, JS → Python) — `{request_id, lambda_id, arrow_b64}`
- `derive_response` (Dict, synced, Python → JS) — `{request_id, result_b64}` or `{request_id, error}`

Status (JS → Python, terminal):

- `render_result` (Dict, synced) — `{value: True}` on success or `{error: str}` on failure

Python-only:

- `derive_functions` (Dict, NOT synced) — `lambda_id -> callable` registry

**Widget Initialization Flow**

1. Load pre-built widget bundle from `gofish/_static/widget.esm.js`
2. Fail fast with clear error if bundle is missing
3. Convert Arrow bytes to base64 for transport
4. Store derive functions in Python-side registry
5. Initialize AnyWidget with `_esm` code and synced traitlets

**RPC Mechanism for Derive**

We follow the Altair `JupyterChart` / Plotly `FigureWidget` pattern: synced
traitlets + observer handlers, no `experimental.invoke` and no custom messages.
This works identically in Jupyter and marimo because `experimental.invoke` is
unsupported in marimo.

```python
@traitlets.observe("derive_request")
def _on_derive_request(self, change):
    msg = change["new"]
    if not msg:
        return
    request_id = msg["request_id"]
    try:
        fn = self.derive_functions[msg["lambda_id"]]
        df = arrow_to_dataframe(base64.b64decode(msg["arrow_b64"]))
        result_df = pd.DataFrame(fn(df.to_dict("records")))
        result_b64 = base64.b64encode(dataframe_to_arrow(result_df)).decode()
        self.derive_response = {"request_id": request_id, "result_b64": result_b64}
    except Exception as exc:
        self.derive_response = {"request_id": request_id, "error": str(exc)}
```

The JS side correlates responses to requests via `request_id`. Derive ops are
sequential (one in-flight per widget), so a single trait pair is enough. The
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
import * as Arrow from "apache-arrow";
import { chart, spread, stack, ... } from "gofish-graphics";

export default {
  initialize({ model }) {
    // Wire up the derive bridge: a per-widget pending map +
    // model.on("change:derive_response") listener.
    (model as any).__gofishBridge = makeDeriveBridge(model);
  },
  async render({ model, el }) {
    // 1. Deserialize Arrow data from `arrow_data` trait
    // 2. Map IR operators to GoFish operators
    // 3. Map IR mark to GoFish mark
    // 4. Render chart, then set render_result for status
  }
}
```

**Key Functions**

`arrowTableToArray(table: Arrow.Table)`

- Converts Arrow Table to array of plain objects
- Handles BigInt -> Number conversion
- Compatible with GoFish's data format expectations

`arrayToArrow(rows: object[])`

- Converts array of objects to Arrow IPC bytes
- Used for serialize data for derive RPC
- Tries multiple methods for Arrow API compatibility

`mapOperator(opSpec, bridge)`

- Maps IR operator spec to GoFish operator function
- Uses lookup table `OPERATOR_MAP` for extensibility
- Special handling for `derive` (creates an async operator that calls
  `bridge.request(lambdaId, arrowB64)`)

`mapMark(markSpec)`

- Maps IR mark spec to GoFish mark function
- Simple lookup table `MARK_MAP`

`renderChart(model, container, bridge)`

- Main rendering orchestrator
- Deserializes data and spec
- Reconstructs operator pipeline
- Calls GoFish's `chart().flow().mark()` API
- Renders to DOM container

**Derive RPC Implementation**

The derive operator in JavaScript is async and calls back to Python via the
synced trait protocol:

```typescript
derive: (opts, bridge) => {
  const lambdaId = opts.lambdaId;
  return derive(async (d) => {
    const rows = normalizeToArray(d);
    if (rows.length === 0) return Array.isArray(d) ? d : (d ?? null);
    const arrowB64 = btoa(String.fromCharCode(...arrayToArrow(rows)));
    // Bridge sets `derive_request` and resolves on `change:derive_response`
    // with a matching request_id.
    const resultB64 = await bridge.request(lambdaId, arrowB64);
    const resultBuffer = Uint8Array.from(atob(resultB64), (c) =>
      c.charCodeAt(0)
    );
    const resultArray = arrowTableToArray(Arrow.tableFromIPC(resultBuffer));
    return Array.isArray(d) ? resultArray : (resultArray[0] ?? null);
  });
};
```

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

- DataFrame -> Arrow IPC bytes via `dataframe_to_arrow()`
- Arrow bytes -> base64 string for JSON transport
- Chart spec -> JSON IR via `to_ir()`
- Derive functions collected: `{"abc123": lambda df: df.sort_values("count")}`

**3. Widget Creation (Python)**

- `GoFishChartWidget` initialized with:
  - `spec` = JSON IR
  - `arrow_data` = base64 Arrow bytes
  - `derive_functions` = {"abc123": <function>}
  - `width=800, height=600`
- Widget loads `_esm` bundle from `_static/widget.esm.js`
- Widget syncs traitlets to JavaScript

**4. Widget Render (JavaScript)**

- AnyWidget calls `initialize({ model })` once to wire up the derive bridge,
  then `render({ model, el })` to paint the chart
- Decode base64 -> Arrow bytes -> `Arrow.tableFromIPC()`
- Convert Arrow Table -> array of objects:
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
  derive(async (d) => {
    // d is current data (array of objects)
    // Serialize to Arrow, call Python, deserialize result
    return await executeDeriveViaRPC("abc123", d);
  });
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

// Serialize to Arrow
const arrowBuffer = arrayToArrow(currentData);
const arrowB64 = btoa(String.fromCharCode(...arrowBuffer));

// Set the derive_request trait; resolve when derive_response arrives
// with a matching request_id.
const resultB64 = await bridge.request("abc123", arrowB64);

// Deserialize result
const resultBuffer = Uint8Array.from(atob(resultB64), c => c.charCodeAt(0));
const resultTable = Arrow.tableFromIPC(resultBuffer);
const sortedData = arrowTableToArray(resultTable);
```

Python side (`@traitlets.observe("derive_request")`):

```python
# change.new == {"request_id": "r-0", "lambda_id": "abc123", "arrow_b64": ...}
df = arrow_to_dataframe(base64.b64decode(msg["arrow_b64"]))
fn = self.derive_functions["abc123"]  # lambda rows: sorted(rows, key=...)
result_df = pd.DataFrame(fn(df.to_dict("records")))
result_b64 = base64.b64encode(dataframe_to_arrow(result_df)).decode()
self.derive_response = {"request_id": "r-0", "result_b64": result_b64}
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
print(widget.spec)
print(len(widget.arrow_data))  # base64 length
print(widget.derive_functions.keys())
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
