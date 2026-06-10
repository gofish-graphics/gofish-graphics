# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Setup

**Run `pnpm install` at the start of every session.** This monorepo uses pnpm workspaces and git worktrees do not have `node_modules` pre-installed. Without it, pre-commit hooks (lint-staged, husky) and dev tooling will fail.

## Project Overview

GoFish Graphics is a TypeScript/SolidJS library for creating charts and visualizations. It uses a declarative API based on an Abstract Syntax Tree (AST) approach where visual elements are composed through functional transformations.

**This is a monorepo** with the following structure:

- `packages/gofish-graphics/` - Main TypeScript/SolidJS library
- `packages/gofish-python/` - Python bindings (in development)
- `apps/docs/` - VitePress documentation site

## Development Commands

```bash
# Install dependencies
pnpm install

# Start library development server (runs on port 3000)
pnpm dev

# Build the library
pnpm build

# Preview the library build
pnpm serve

# Run Storybook for visual development and testing
pnpm storybook

# Start documentation site development server
pnpm docs:dev

# Build documentation
pnpm docs:build

# Preview documentation build
pnpm docs:preview
```

## Architecture

### Core Concepts

The library is built around several key architectural patterns:

1. **AST-based Rendering**: Visual elements are represented as nodes in an abstract syntax tree (`src/ast/_node.ts`)
2. **Functional Composition**: Charts are built by composing shapes, transforms, and operators
3. **Three-Pass Rendering**:
   - Domain inference (what data ranges exist)
   - Layout calculation (how to fit elements)
   - Placement/rendering (final positioning and SVG generation)

### Key Directories (Main Library)

All paths are relative to `packages/gofish-graphics/`:

- `src/ast/` - Core AST implementation and rendering engine
- `src/ast/shapes/` - Basic visual elements (rect, ellipse, petal, text, ref)
- `src/ast/graphicalOperators/` - Composition operators (stack, stackX, stackY, spread, spreadX, spreadY, layer, connect, wrap, arrow, enclose, frame, position)
- `src/ast/coordinateTransforms/` - Coordinate system transformations (linear, polar, bipolar, arcLengthPolar, wavy, clock)
- `src/ast/marks/` - Higher-level fluent/builder chart API (v3)
- `src/tests/` - Example charts and visual test cases (not automated unit tests)
- `src/data/` - Sample datasets used in examples
- `src/templates/` - Reusable chart templates
- `stories/` - Storybook stories for visual development

### Main Entry Points (packages/gofish-graphics/)

- `src/lib.ts` - Main library exports (includes v1, v2, and v3 APIs)
- `src/ast/gofish.tsx` - Core rendering engine and context management
- `src/index.tsx` - Development entry point (imports and renders development examples)
- `stories/` - Storybook stories providing visual development playground

### API Versions

The library exports three API versions from `src/lib.ts`:

- **v1 (Lowercase)**: Original functional API for backwards compatibility
  - Functions: `ellipse()`, `petal()`, `text()`, `ref()`, `stackX()`, `stackY()`, `layer()`, `wrap()`, `connect()`, etc.
  - Example: `gofish(stack([rect({ w: 10, h: 20 }), ellipse({ r: 5 })]), { w: 400, h: 300 })`

- **v2 (Capitalized)**: Component-style API with capitalized function names
  - Functions: `Rect()`, `Ellipse()`, `Petal()`, `Text()`, `Stack()`, `Spread()`, `Layer()`, etc.
  - Same functionality as v1 but follows component naming conventions
  - Example: `gofish(Stack([Rect({ w: 10, h: 20 }), Ellipse({ r: 5 })]), { w: 400, h: 300 })`

- **v3 (Fluent/Builder)**: Modern fluent API using method chaining (recommended for new projects)
  - Main function: `chart(data)` returns a builder with chainable methods
  - Builder methods: `.flow()`, `.mark()`, `.render()`
  - Layer naming: call `.name("layerName")` on a mark so it can be referenced via `select("layerName")` in another chart (e.g. `rect({ h: "value" }).name("bars")`)
  - Operators (used within `.flow()`):
    - Visual layout: `spread()`, `stack()`, `scatter()`, `group()`
    - Data transformation: `derive()`. Takes a callback to do arbitrary data transforms
  - Utility functions (used within `.derive()`): Return data
    - `normalize()`, `repeat()`, etc.
  - Selection (used within `chart()`): `select()`
  - Marks (used within `.mark()`): Return visual node; support `.name("layerName")` for layer selection
    - `rect()`, `circle()`, `line()`, `area()`, `blank()`, etc.
  - Example: `chart(data).flow(spread("category", { dir: "x" })).mark(rect({ h: "value" }).name("bars")).render(container, { w: 400, h: 300 })`

### Context System

The library uses several global contexts during rendering:

- `scopeContext` - Manages variable scoping
- `scaleContext` - Handles color scales and axis scales
- `keyContext` - Tracks named elements for axis labels

### Coordinate Transforms

Key coordinate systems available:

- `linear` - Standard Cartesian coordinates
- `polar` - Polar coordinate system
- `bipolar` - Two-pole coordinate system
- `arcLengthPolar` - Arc-length based polar coordinates
- `wavy` - Wavy/curved coordinate transformations

### Build Configuration (packages/gofish-graphics/)

- Uses Vite for bundling with SolidJS plugin
- TypeScript with strict mode enabled
- Builds ES modules only (no CommonJS)
- Entry point: `src/lib.ts`
- External dependency: `solid-js` (peer dependency)
- Build output: `dist/` directory
- Configuration: `vite.config.ts`

## Development Notes

- **Update docs on user-facing API changes**: When you change a public API surface (signatures, option shapes, exported names, default behaviors) in `packages/gofish-graphics/src/`, update the corresponding page under `apps/docs/docs/js/` in the same change — signature, examples, and any equivalences tables. For Python API changes (`packages/gofish-python/`), update the mirror page under `apps/docs/docs/python/`. The docs site has one folder per language (`js/`, `python/`) with a top-level language toggle. Do not defer this to a follow-up.
- **Update the frontend IR schema when adding an IR-level construct**: Anything that crosses the Python↔JS bridge as serialized IR — a new constraint `type`, mark type, operator, or a new option/field shape — must also be added to the canonical schema in `packages/gofish-ir/src/frontend/`, which has **three encodings that must agree**: the TS type in `schema.ts`, the runtime validator in `validate.ts`, and the emitted JSON Schema in `jsonSchema.ts`. After editing, run `pnpm --filter docs sync-ir-schema` to regenerate the docs page (CI runs `check-ir-schema`). `pnpm --filter @gofish/tests validate-python-ir` validates every Python story's IR against this schema and **will fail CI** if a new construct is missing — so a new constraint type touches the JS factory, the Python wrapper, _and_ these three schema encodings.
- **Monorepo Management**: Uses pnpm workspaces
- **Visual Development**: Use Storybook (`pnpm storybook`) for interactive development and testing
- **Iterating on examples with Claude**: `pnpm capture-one "<title/story>"` renders a single
  Storybook story headlessly to `tests/tmp/iterate/<path>.png` (+ normalized DOM) so Claude can
  look at the output and fix mistakes in a feedback loop instead of editing blind. Run with no
  argument to list stories. The `/iterate-example` skill (`.claude/skills/iterate-example/`) drives
  this render → review → fix loop. Requires `dist/` to exist once
  (`pnpm --filter gofish-graphics build`); source edits are picked up live without rebuilding.
- **Local regression signal for layout changes**: `pnpm capture-diff <base-ref> [filter]`
  renders every story's normalized DOM at HEAD and at `<base-ref>` (checked out in a throwaway
  worktree) and diffs them per story — a baseline-free, platform-stable "did my change move
  anything I didn't intend?" check for an inner loop. Unlike the CI visual baselines, it works
  on Mac (it diffs normalized geometry, not pixels, so no text-metric drift) and needs no
  curation. Pass a substring to scope to one story or a group (`pnpm capture-diff main bar`).
  Exits non-zero when anything moved; report at `tests/tmp/capture-diff/report.html`.
- **Documentation**: VitePress site in `apps/docs/` with live chart examples
- **Testing**: The `src/tests/` directory contains visual chart examples for development, not automated unit tests
- **Development Server**: `pnpm dev` runs Vite dev server on port 3000
- **Key Dependencies**:
  - SolidJS for reactive rendering and JSX
  - D3-array for domain calculations and scales
  - Lodash for utility functions (groupBy, sumBy, orderBy, meanBy)
  - Chroma-js and Culori for color manipulation
  - Perfect-arrows for arrow rendering
  - Bubblesets-js for enclosure rendering

## Internal Architecture Wiki

Architecture and design documentation lives in `apps/docs/docs/internals/` — narrative
essays explaining how the library works (the layout pipeline, the coordinate system,
the type-level machinery, the Python bridge, the design philosophy). They are published
on the docs site under `/internals/`. Start at `apps/docs/docs/internals/index.md`,
which documents the authoring conventions.

**Keeping it in sync is mandatory.** Each essay's frontmatter has a `covers:` list of
the source files it documents. That list is projected into a managed `@wiki` comment at
the top of every covered source file. Therefore:

- When you edit a source file that has a `// <gofish-wiki>` / `@wiki` comment block at
  the top, **update the essay it names in the same change** — the essay and the code are
  reviewed together. This is the only thing that keeps the wiki trustworthy.
- When you add or change an essay's `covers:` list, run
  `pnpm --filter docs sync-backlinks` to regenerate the `@wiki` comments, and commit the
  result. CI runs `pnpm --filter docs check-backlinks` and fails if they have drifted.
- Never hand-edit a `// <gofish-wiki>` block — it is generated.

## Additional Resources

- **Internal architecture wiki**: `apps/docs/docs/internals/` — the consolidated home
  for architecture and design docs (see the section above). This replaced the former
  scattered repo-root `docs/` and `notes/` files.
- **Package-specific CLAUDE.md files**:
  - `apps/docs/CLAUDE.md` - Documentation site specific guidance
