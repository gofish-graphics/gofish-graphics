# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Documentation Site

- **Development server**: `pnpm docs:dev` - Starts VitePress dev server with hot reload
- **Build documentation**: `pnpm docs:build` - Builds static documentation site
- **Preview build**: `pnpm docs:preview` - Serves built documentation for testing

### Dependencies

- **Install**: `pnpm install` - Installs all dependencies

## Project Architecture

This is a documentation site for the GoFish Graphics library built with VitePress. The project combines interactive documentation with live code examples.

### Core Components

#### Documentation System

- **VitePress**: Static site generator with Vue 3 support
- **Custom markdown plugins**:
  - `gofish` containers for embedding live code examples
  - `gofish-live` containers for Sandpack-powered interactive editors
- **Example system**: Examples are **gallery-tagged Storybook stories**, scanned at
  build time by `docs/.vitepress/data/storyExamples.ts` (exposed via the
  `storyExamples.data.js` loader). There is no hand-maintained registry — the set of
  valid `example:<id>` ids is exactly the gallery story ids (`pnpm check-story-examples`).
  Per-example pages are **generated**, one per language, from this same id set:
  `js/examples/[id].paths.ts` (JS snippet) and `python/examples/[id].paths.ts`
  (Python parity port, via `docs/.vitepress/data/pythonExamples.ts` — see below).
  API pages (`js/api/**`, `python/api/**`) stay hand-written fenced code, unrelated
  to this generator.

#### Interactive Code Execution

- **GoFishVue.vue** (`components/GoFishVue.vue`): Vue component that executes GoFish code in a sandboxed environment using `new Function()`. Provides access to lodash, datasets, and the full GoFish API. Used by the inline fenced-code `::: gofish` mode and by `internal-*` wiki diagrams.
- **GoFishExample.vue** (`components/GoFishExample.vue`): client-only renderer that executes the **real Storybook story module** (SolidJS) for a gallery example. Targeted by `id` (gallery story id) or `storyId` (any story's harness id). Story `.stories.tsx` are compiled by `vite-plugin-solid` (scoped to the gofish-graphics package in `config.mts`; vue-jsx is excluded from that package so the two JSX compilers don't collide).
- **GoFishLive.tsx** (`components/GoFishLive.tsx`): Sandpack-based live code editor component for interactive examples
- **Markdown integration**: Custom markdown-it plugin (`docs/.vitepress/markdown-it-gofish.ts`) processes `::: gofish` containers

#### Data Management

- **Dataset modules**: Located in `components/data/` - TypeScript modules exporting chart datasets (titanic, penguins, streamgraph data, etc.)
- **Example data layer**: `docs/.vitepress/data/storyExamples.ts` scans gallery-tagged stories and synthesizes a standalone snippet (+ dataset) for each. The legacy `examples.data.js` registry is gone; only `internal-*` wiki diagrams (`.vitepress/examples/internal-*.ts`) are still loaded directly by the markdown plugin.
- **Python example data layer**: `docs/.vitepress/data/pythonExamples.ts` resolves each gallery example's matching `tests/python-stories/**/test_*.py` parity port (same title→path convention as `tests/scripts/path-mapping.ts`, duplicated there since it's a cross-package build-time import) and synthesizes a standalone Python snippet (+ `dataset.py`) from the `story_*` function's body. Examples with no port yet get `pythonCode: null` (the page still renders, with a "not ported" note and a link to the JS version); a port whose shape the transform can't standalone-ify falls back to showing the function verbatim. `tests/.python-sync-exempt` entries mark `renderDiverges` (the port intentionally uses a different algorithm — the live render is always the JS engine, since JS/Python serialize to the same IR).

### Key Architecture Patterns

#### Live Code Rendering

The documentation uses two approaches for interactive examples:

1. **Server-side execution**: `GoFishVue` component executes code during page load
2. **Client-side sandbox**: `GoFishLive` provides editable code playgrounds via Sandpack

#### Example Code Reuse

Examples come from gallery-tagged Storybook stories. Embed one by its gallery id
(the kebab-case of the story's `gallery.title`):

```markdown
::: gofish example:bar-chart
:::
```

The `::: gofish` container has four modes:

- `example:<id>` — gallery story example. Renders the chart via `GoFishExample`
  plus a code fence of the synthesized snippet (and the dataset in a `<details>`
  when the story uses one). **An unknown `<id>` is a build-time error** — this is
  what replaced the registry as the source of truth. Add `hidden` to render the
  chart only (used by Python pages, which show hand-written `python` separately).
- `example:internal-<id>` — wiki diagram. `GoFishVue` executes the code from
  `.vitepress/examples/internal-<id>.ts` (any such file is embeddable, no
  registration). `hidden` suppresses the code fence.
- `story:<storyId>` — render-only embed of **any** story (even untagged ones) by
  its harness story id (kebab of `meta.title--ExportName`). No code fence.
- inline fenced-code — a `::: gofish` wrapping a ` ```ts ` block runs that code
  via `GoFishVue`. `hidden` renders the chart only (no visible code).

#### Coordinate System Integration

The GoFish library supports multiple coordinate systems (cartesian, polar, wavy) through the `coord` parameter in Frame components.

#### Dual-Language Docs (JavaScript + Python)

The site documents both the JavaScript and Python APIs, one folder per language:

- `docs/js/` - JavaScript documentation (the original docs)
- `docs/python/` - Python documentation
- `docs/index.md` - shared landing page at `/`

A `LanguageToggle.vue` component (`.vitepress/theme/components/`) lets readers
switch languages; it is injected via the `nav-bar-content-after` and
`sidebar-nav-before` theme slots. It navigates to the mirrored page in the other
language, falling back to that language's `get-started` page. The route manifest
it consults is collected at build time by `collectDocRoutes()` in `config.mts`
and exposed via `themeConfig.docRoutes`.

The `sidebar` in `config.mts` has one entry per language (`/js/`, `/python/`).
When editing the docs, keep the two language trees structurally parallel.

**Python chart previews:** Python and JavaScript serialize to the same
intermediate representation, so a chart renders identically regardless of
language. Hand-written **API pages** (`python/api/**`) show Python code in a
`python` fence, then render the chart with the existing JS engine via `:::
gofish example:<id> hidden` — which renders the gallery example without
showing its JS code. **Per-example pages** (`python/examples/<id>`) are
generated instead (see "Example data layer" above): the fence comes from the
gallery example's Python parity port, not a hand-written snippet.

#### Internal Architecture Wiki (`docs/internals/`)

`docs/internals/` is a third top-level docs area (beside `js/` and `python/`) holding
narrative architecture essays for contributors. It is **not** under the JS/Python
language toggle (`LanguageToggle.vue` hides itself on `/internals/` routes). See
`docs/internals/index.md` for the full authoring conventions.

- The `/internals/` sidebar is generated at build time by `collectInternalsSidebar()`
  in `config.mts` from each essay's `section` / `order` / `title` frontmatter.
- Each essay declares `covers:` (the source files it documents). `EssayMeta.vue`
  renders those as a "Source files" box (and the draft/speculative status banner); `scripts/sync-backlinks.mjs` projects them
  into managed `@wiki` comments in the source files. Run `pnpm sync-backlinks` after
  editing `covers:`; CI runs `pnpm check-backlinks`.
- Code samples use ` ```ts twoslash ` fences for compiler-checked type-on-hover.
- Every diagram is a GoFish figure embedded via `::: gofish example:internal-<id>`
  (any `.vitepress/examples/internal-*.ts` file is auto-registered) — charts and
  box-and-arrow diagrams alike. There is no Mermaid dependency; if GoFish can draw it,
  GoFish draws it.
- `docs/internals/api/` is generated by TypeDoc (`pnpm docs:types`, run automatically
  by `docs:build` / `docs:dev`) and is gitignored.

## File Structure

### Documentation (`docs/`)

- `js/` - JavaScript docs: `js/examples/`, `js/api/`, `js/guides/`, `js/theory/`
- `python/` - Python docs: `python/api/`, `python/examples/`
- `internals/` - internal architecture wiki (`internals/api/` is generated, gitignored)
- `index.md` - shared home page
- `.vitepress/config.mts` - VitePress configuration (per-language + internals sidebars)
- `.vitepress/theme/` - Custom theme components (incl. `LanguageToggle.vue`, `EssayMeta.vue`)
- `.vitepress/examples/` - `.ts` source for `internal-*.ts` wiki diagrams (the only live examples still sourced from files; chart examples come from stories)
- `.vitepress/data/` - build-time data loaders (`storyExamples.ts` + `storyExamples.data.js` for gallery examples, `pythonExamples.ts` for the Python parity ports of those same examples, `routes.data.ts`)

### Scripts (`scripts/`)

- `sync-backlinks.mjs` - projects internals essays' `covers:` into `@wiki` comments
  (`pnpm sync-backlinks` / `pnpm check-backlinks`)

### Components (`components/`)

- Vue components for rendering live examples
- `data/` - Chart datasets used in examples
- Gallery components for homepage

### Dependencies

- **Core**: `gofish-graphics` - The graphics library being documented
- **Documentation**: `vitepress`, `vitepress-plugin-sandpack`
- **Interactive features**: `sandpack-vue3`, `monaco-editor`
- **Data processing**: `lodash`, `fast-kde`, `spectral.js`
