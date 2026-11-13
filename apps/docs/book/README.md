# Under the Surface: How GoFish Works

This folder holds the plan for a short book about how GoFish works inside. The
chapters are published on the docs site at `/under-the-surface/`, from
`apps/docs/docs/under-the-surface/`. The briefs in `briefs/` are not
published.

## Who reads it

- The maintainer, who needs to know how the code works today.
- Researchers and developers of other systems who want to know how GoFish
  works inside.

## The rules

- Each chapter answers one question. It is about 600 to 1,200 words, in one
  column, with one figure.
- A chapter is written from the code as it is today. It does not tell the
  history of the code.
- A chapter is never patched. When it needs to change, an agent rebuilds it
  from scratch from its brief and the code. Anything that is not in the brief
  or the code is lost at the rebuild. So a reader's note has to be copied into
  the brief, or the next rebuild will not see it.
- The brief is owned by a person. An agent may add a note to a brief, but it
  does not rewrite one.
- Each chapter shows a stamp at the top. The stamp says which commit the
  chapter was checked against, which source files it reads, whether those files
  have changed since, and how fast they are changing.
- Each chapter ends with a "Not yet true" box and a "Where this lives in the
  code" list. The box says where the code and the intended design part ways.
- Any visitor can leave a note on a paragraph. The note button opens a new
  GitHub issue with the chapter and the paragraph filled in.
- The old internals wiki (`apps/docs/docs/internals/`) is separate. The book
  does not read it, and a chapter is never built from it.

To build or rebuild a chapter, follow the skill in
`.claude/skills/rebuild-chapter/SKILL.md`.

## Chapter frontmatter

A chapter is one file, `apps/docs/docs/under-the-surface/<slug>.md`. Its
frontmatter looks like this.

```yaml
title: How does a chart get its axes? # the question, the same as the brief's
order: 1 # its place in the contents and the sidebar
topics: [axes, ticks, axis titles, legend, elaboration] # terms a reader might search for
reads: # repo-relative source files the chapter was written from
  - packages/gofish-graphics/src/ast/gofish.tsx
checked:
  commit: ab7d18a556f51902cdf529e459b7dd5030a514ca # full sha the chapter was checked against
  date: 2026-11-13
cover: # the figures this chapter puts on the book cover, at least one
  - figure: rewrite # the file axes.rewrite.vue beside the chapter
    rows: 3 # tile height in cells of the cover wall, 1 to 4 (default 2)
    cols: 4 # tile width in cells, 1 to 6 (default 2)
```

Do not use the key `covers`. The internals wiki uses it for something else.

The page layout prints the stamp and the title (the question) at the top of
the chapter. Do not type either one into the markdown. The chapter's markdown
starts with its first paragraph.

The contents page and the sidebar are built from this frontmatter. Adding a
chapter file is enough to list it.

### The cover

The top of the contents page is the book's cover. It is a wall of tiles, and
each tile is one figure from a chapter. The title of the book is one cell of
the wall. Each chapter lists its tiles under `cover`, and must list at least
one.

- `figure` names a figure file beside the chapter, `<slug>.<figure>.vue`,
  whose root element has `id="fig-<figure>"`. The tile links to that id in the
  chapter, and its accessible name is the chapter's question.
- The tile shows the chapter's own figure component, scaled down, with the
  prop `still` set. A figure file declares `defineProps<{ still?: boolean }>()`
  and passes `still` to a `TreeStepper`, or hides its caption with
  `v-if="!still"`. A still stepper shows its last step with no controls,
  legend or caption. Nothing inside a tile can be focused or clicked.
- `rows` and `cols` are the tile size. The wall has 6 columns on a wide
  screen and 2 on a phone. A cell is about 145 by 105 pixels on a wide screen,
  so pick the size closest to the figure's shape, e.g., 3 by 4 for a stepper
  and 2 by 6 for a wide two-panel figure. The wall packs the tiles in chapter
  order and fills gaps with later tiles, so a small gap can remain when the
  sizes do not add up.
- `book:check` fails when a chapter has no cover entry, when a figure file is
  missing or has no element with the matching id, or when a size is out of
  range.

## Briefs

The brief for a chapter is `briefs/<slug>.md`, with the same slug as the
chapter. It looks like this.

```markdown
---
chapter: axes
question: How does a chart get its axes?
words: 1000
---

## Must answer

- One bullet for each thing the chapter must explain.

## Figure

One paragraph that says what the one figure shows.

## Notes

- 2026-11-13, Josh: "This part lost me."
```

- `chapter` is the slug.
- `question` is the chapter's title. `book:check` fails when the two differ.
- `words` is the word limit for the chapter's prose. `book:check` allows 10
  percent over it.
- "Must answer" is required. "Figure" and "Notes" may be empty.
- A brief may exist before its chapter. That is how a planned chapter is
  recorded.

### How notes reach a brief

A note button opens an issue with the label `book-note`. Then:

- An issue that the maintainer opened is copied into the brief's Notes, with
  its date and author, and the issue is closed.
- An issue from anyone else waits for the maintainer. When the maintainer adds
  the label `book-note-accepted`, it is copied into the brief and closed in the
  same way.

GitHub applies the `book-note` label from the link only when the label exists
in the repository and the person opening the issue can set labels. For anyone
else, the issue arrives without the label, and its title still starts with
`Note on "`.

## The stamp

`scripts/book-stamps.mjs` works out the stamp with git. The docs build reads it
through the data loader `docs/.vitepress/data/book.data.mts`, so every build
prints a fresh stamp.

- **State.** The state is `current` when no commit since `checked.commit` has
  changed a `reads` file. It is `out-of-date` when at least one has. It is
  `unknown` when git cannot find `checked.commit`, e.g., in a shallow clone.
  An unknown state never fails a build.
- **Since.** The number of commits and changed lines (added plus deleted) in
  the `reads` files between `checked.commit` and HEAD.
- **Churn.** The number of commits and changed lines in the `reads` files in
  the 30 days before HEAD's commit date. The script uses HEAD's date rather
  than today's date, so the same commit always gives the same stamp. A shallow
  clone shows no churn.

Merge commits are not counted, because their changes are already counted in
the commits they merge.

The churn label uses these thresholds over 30 days. They are set in `CHURN`
in `scripts/book-stamps.mjs`.

- **settled.** 2 commits or fewer, and under 300 changed lines.
- **changing fast.** 10 commits or more, or 2,000 changed lines or more.
- **changing.** Anything between the two.

## Writing a chapter

A chapter has this shape.

1. A short opening that poses the question.
2. The idea, with the one figure.
3. The order of steps or the mechanism.
4. Formal rules, where they help.
5. The "Not yet true" box.
6. The "Where this lives in the code" list.

The chapter's markdown can use these pieces.

- `::: not-yet-true` makes the "Not yet true" box. It adds its own heading.
  Put a list inside it.
- `::: code-map` makes the code list. Each item starts with the "what" in
  bold, followed by the file, the symbol and the line, e.g.,
  ``- **Labels** labels/elaborate.tsx `elaborateLabels` 529``.
- `::: rule <name>` makes one formal rule. Every paragraph but the last is the
  rule, written in the text face. Write a variable in italics (`*n*`), a muted
  word in `<small>`, and a line break as a backslash at the end of a line. The
  last paragraph is one plain sentence. Rules that follow each other read as one
  block, in three columns on a wide screen and stacked on a phone.
- Each figure lives in its own file beside the chapter,
  `<slug>.<figure>.vue`, so the cover can show it too. The chapter imports it
  in a `<script setup>` block, e.g., `import AxesRewrite from
"./axes.rewrite.vue"`, and places it on its own line as `<AxesRewrite />`.
  See `axes.rewrite.vue` and `axes.names.vue`.
- `<TreeStepper :figure="data">` is a figure that steps through how a node
  tree grows. Put its data in a file beside the chapter, e.g.,
  `axes.figure.ts`, and import it in the figure file. The data type
  is in `docs/.vitepress/theme/components/book/treeStepper.ts`. Each line of
  the tree has an `id`, a `depth`, a `text`, a `kind` (`user`, `added`, `ref`
  or `constraint`), the `step` at which it appears, and for a ref its
  `targets`. An optional `<svg>` inside the tag is the picture. Give each piece
  of the picture a `data-id` that matches a tree line. Put the caption in a
  `<template #caption>` inside the tag. Keep the whole tag free of blank
  lines, or markdown will break it apart.
- A static figure is plain inline SVG inside `<figure class="book-wide">`, with
  a `<figcaption>`. It may be up to 900 pixels wide. Use `<div
class="fig-panels">` to put several SVG panels side by side.
- A GoFish figure uses the usual `::: gofish` container. A `::: gofish`
  figure in the markdown cannot be a cover tile, so a chapter whose only
  figure is a GoFish chart also needs a static figure file for the cover.

Every figure uses the same colors, set in `docs/.vitepress/theme/book.css`.

| Meaning                 | CSS variable       | SVG class                                         |
| ----------------------- | ------------------ | ------------------------------------------------- |
| A node from your code   | `--fig-user`       | `fig-user`, `fig-user-stroke`                     |
| A node the library adds | `--fig-added`      | `fig-added`, `fig-added-stroke`, `fig-added-text` |
| A ref (always dashed)   | `--fig-ref`        | `fig-ref`, `fig-ref-box`, `fig-ref-path`          |
| A constraint or guide   | `--fig-constraint` | `fig-guide`, `fig-guide-dash`                     |

Each variable has a dark mode value too, so a figure that uses the classes
works in both modes.

## Commands

Run these from the repository root.

- `pnpm --filter docs book:check` checks every chapter without git history.
  It checks that each chapter has a brief, that each `reads` file exists, that
  the frontmatter is complete, and that the prose is within the brief's word
  limit plus 10 percent. The word count leaves out the frontmatter, code
  blocks, SVG and HTML tags. CI runs this check.
- `pnpm --filter docs book:stale` prints each chapter that is out of date, one
  per line, with the number of commits and changed lines since it was checked.
- `pnpm --filter docs book:tree` prints a real node tree before and after
  `layout()` rewrites it. With no argument it prints the built-in `bars`
  example. Pass `--list` to see the built-in examples, or the path of a spec
  module of your own. Pass `--before` or `--after` for one tree, and `--full`
  to show every sibling. A spec module's default export is a chart builder, or
  a function that returns one.
- `node apps/docs/scripts/book-stamps.mjs json` prints every chapter with its
  stamp.
