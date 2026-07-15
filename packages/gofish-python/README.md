# gofish-python

A Python wrapper for the GoFish graphics library. Both the mid-level chart API and the
low-level mark/operator API are supported. (See [notes/design.md](notes/design.md) and
[notes/implementation.md](notes/implementation.md) for more details.)

## Installation

```bash
pip install --pre gofish-graphics
```

The latest stable release on PyPI is old and lags far behind development. These docs
describe the current dev builds, which are published on every change to `main`. You
must include the `--pre` flag, otherwise pip installs the outdated stable release.

The package is imported as `gofish`:

```python
from gofish import chart
```

See the [getting started docs](https://gofish.graphics/python/get-started) for a full
introduction.

## Usage

```python
from gofish import chart, spread, stack, rect

# Create a chart specification
data = [{"lake": "A", "species": "B", "count": 10}]
c = (
    chart(data, options={"w": 800, "h": 600})
    .flow(
        spread("lake", dir="x", spacing=64),
        stack("species", dir="y", spacing=0),
    )
    .mark(rect(h="count", fill="species"))
)

# Convert to JSON IR
ir = c.to_ir()
print(ir)
# {
#     "data": None,
#     "operators": [
#         {"type": "spread", "field": "lake", "dir": "x", "spacing": 64},
#         {"type": "stack", "field": "species", "dir": "y", "spacing": 0}
#     ],
#     "mark": {"type": "rect", "h": "count", "fill": "species"},
#     "options": {"w": 800, "h": 600}
# }
```

## IR Format

The JSON IR has the following structure:

```json
{
  "data": null,
  "operators": [
    { "type": "spread", "field": "lake", "dir": "x", "spacing": 8 },
    { "type": "derive", "lambdaId": "uuid-here" },
    { "type": "stack", "field": "species", "dir": "y" }
  ],
  "mark": { "type": "rect", "h": "count", "fill": "species" },
  "options": {}
}
```

## Development

**Note**: This package uses [uv](https://github.com/astral-sh/uv) for fast package
management and testing.

### Prerequisites

- **Python 3.10+**
- **[uv](https://github.com/astral-sh/uv)** - Fast Python package manager
- **Node.js** (for building the widget bundle)
- **pnpm** (for managing Node.js dependencies)

### Development Install

```bash
cd packages/gofish-python
uv pip install -e .
```

#### Installing Node.js Dependencies

If you need to build the widget bundle, install Node.js dependencies:

```bash
pnpm install
```

### Building the Widget Bundle

The widget bundle is a self-contained JavaScript module that includes all dependencies. Build it with:

```bash
# From the package directory
pnpm run build:widget

# Or directly with Node.js
node build-widget.mjs
```

This will:

- Bundle the TypeScript widget source (`widget-src/index.ts`)
- Include all dependencies (gofish-graphics, solid-js, apache-arrow)
- Output to `gofish/_static/widget.esm.js`

**Note**: The build process will automatically use `gofish-graphics/dist/index.js` if available, otherwise it falls back to the package import. Make sure `gofish-graphics` is built first if you're developing locally.

### Running Tests

#### Python Unit Tests

```bash
# Install with test dependencies
uv pip install -e ".[test]"

# Run all tests
uv run pytest

# Or run directly if installed
pytest

# Run specific test file
pytest tests/test_ast.py

# Run with verbose output
pytest -v
```

#### Jupyter Notebook Tests

The package includes Jupyter notebooks for interactive testing:

- `tests/test_ir.ipynb` - Tests for IR generation
- `tests/test_rendering.ipynb` - Tests for widget rendering

To run these:

```bash
# Start Jupyter
jupyter notebook

# Or use the provided script (if available)
./run_notebook.sh
```

### Development Workflow

1. **Install dependencies**:

   ```bash
   uv pip install -e ".[test]"
   pnpm install
   ```

2. **Make changes** to Python code or widget TypeScript source

3. **Build widget** (if you modified widget code):

   ```bash
   pnpm run build:widget
   ```

4. **Run tests**:

   ```bash
   pytest
   ```

5. **Test in Jupyter** (optional):
   ```bash
   jupyter notebook tests/test_rendering.ipynb
   ```
