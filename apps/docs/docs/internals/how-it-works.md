---
title: How This Wiki Works
section: Overview
order: 40
status: stable
---

# How This Wiki Works

Each essay is a markdown file under `apps/docs/docs/internals/`. The docs site is the
**single source of truth** — there is no copy kept beside the code. Instead, every
essay declares the source files it documents, and that link is maintained in both
directions.

## Frontmatter

Every essay starts with frontmatter:

```yaml
---
title: The Monotonic Module # page + sidebar title
section: Core # sidebar section (see below)
order: 61 # sort order within the section/group
group: Scale Resolution # optional: file under a sidebar label
status: stable # stable | draft | speculative
covers: # source files this essay documents
  - packages/gofish-graphics/src/util/monotonic.ts
---
```

**Sections** group the sidebar. In order: `Overview`, `Frontend`, `Core`,
`Layout & Rendering`, `Python`, `Design Evolution`, `Speculative Notes`. An
essay's place in the sidebar comes entirely from its `section:` (and `group:`)
frontmatter — the directory a file happens to sit in is filesystem convenience
and need not match its section.

`Design Evolution` is the home for retrospective and design-history essays —
how the surface API arrived at its current shape, ideas that were tried and
abandoned, comparisons with prior surfaces. It is for ground that has _already
been walked_; aspirational direction goes in `Speculative Notes`.

**`group`** files an essay under an intermediate sidebar label, e.g.
`group: Scale Resolution`. Group labels are **not pages** — only leaf essays
are. Every clickable item in the sidebar is therefore a real article. Give a
group an intro essay titled `Overview` and order it first.

**Status** tells the reader how settled the content is:

- `stable` — accurate and current; trust it.
- `draft` — a real topic, not yet fully written.
- `speculative` — design exploration or direction; may never ship.

## `covers:` — the link to the code

The `covers:` list does double duty:

1. It renders as the **Source files** box at the top of the page (the links above this
   section, if any). On the web those are GitHub links; locally they are repo-relative
   paths you (or Claude) can open and edit.
2. It is projected into the source files as a managed `@wiki` back-link comment
   block, e.g.

   ```ts
   // <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
   // @wiki The Monotonic Module — /internals/core/monotonic
   // </gofish-wiki>
   ```

   So when you open `monotonic.ts`, you can see at a glance which essay describes it.
   The block is regenerated idempotently — never edit it by hand.

`covers:` is canonical. After editing it, run `pnpm --filter docs sync-backlinks` to
regenerate the `@wiki` comments. CI runs `check-backlinks` to verify the two stay in
agreement.

## Keeping essays in sync

When you change code that a `@wiki` comment points at, update the named essay in the
**same change**. The essay and the code are reviewed together. This is the only thing
that keeps the wiki trustworthy — see the sync rule in the repo `CLAUDE.md`.

## Diagrams

**Every visualization in this wiki is a GoFish figure** — the wiki dogfoods the library
it documents, charts and box-and-arrow diagrams alike. GoFish handles non-chart
diagrams too (boxes, labels, trees, flows), so there is no Mermaid or other diagramming
dependency: if GoFish can draw it, GoFish draws it.

Author the figure as a `.vitepress/examples/internal-<name>.ts` file (any
`internal-*.ts` file is auto-registered), then embed it with the `hidden` flag
so the page shows only the figure, not the GoFish code that draws it:

```md
::: starfish example:internal-<name> hidden
:::
```

Drop `hidden` only when the diagram's code is itself the thing being taught.
Hand-authored SVG is a last resort, only for the rare figure GoFish cannot express.

## Code samples

Code blocks are hand-written and tagged ` ```ts twoslash ` so they get real
type-on-hover from the TypeScript compiler at build time — a wrong type fails the
build, so samples cannot silently rot.
