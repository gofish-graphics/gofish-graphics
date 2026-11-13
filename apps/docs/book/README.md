# Under the Sea: How GoFish Works

This folder holds the plan for a short book about how GoFish works inside. The
chapters are published on the docs site at `/under-the-sea/`, from
`apps/docs/docs/under-the-sea/`. The briefs in `briefs/` are not
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
- Any visitor can give feedback on a paragraph. The feedback button opens a
  small box beside the paragraph. On the local dev server the feedback is saved
  straight into the brief. On the published site it opens a new GitHub issue
  with the chapter, the paragraph and the feedback filled in.
- The old internals wiki (`apps/docs/docs/internals/`) is separate. The book
  does not read it, and a chapter is never built from it.

To build or rebuild a chapter, follow the skill in
`.claude/skills/rebuild-chapter/SKILL.md`.

## Chapter frontmatter

A chapter is one file, `apps/docs/docs/under-the-sea/<slug>.md`. Its
frontmatter looks like this.

```yaml
title: How does a chart get its axes? # the question, the same as the brief's
label: Axes # one or two words, the same as the brief's
order: 1 # its place in the contents
topics: [axes, ticks, axis titles, legend, elaboration] # terms a reader might search for
reads: # repo-relative source files the chapter was written from
  - packages/gofish-graphics/src/ast/gofish.tsx
checked:
  commit: ab7d18a556f51902cdf529e459b7dd5030a514ca # full sha the chapter was checked against
  date: 2026-11-13
cover: # the figures this chapter puts on the book cover, at least one
  - figure: rewrite # the file axes.rewrite.vue beside the chapter
    rows: 2 # tile height in cells of the cover wall, 1 to 4 (default 2)
    cols: 3 # tile width in cells, 1 to 6 (default 2)
```

Do not use the key `covers`. The internals wiki uses it for something else.

The page layout prints the stamp and the title at the top of the chapter. Do
not type either one into the markdown. The chapter's markdown starts with its
first paragraph.

The `label` is a short name for the chapter, so a reader can scan the
contents. Wherever the book lists or titles a chapter, it shows the label and
then the question, e.g., "Axes: How does a chart get its axes?". This is the
contents, the Contents list at the top of each chapter, the chapter's heading,
the links to the next and previous chapters, the browser tab and the cover
tiles. The title of a feedback issue uses the question alone.

The contents and the Contents list are built from this frontmatter. Adding a
chapter file is enough to list it.

## The pages

The book's pages have no sidebar. The first page, `/under-the-sea/`, is a
book lying open. The left page is the cover and the right page is the
contents, with the two sentences from `index.md` at its foot. On a window 900
pixels wide or more, the two pages fit the window with no scrolling, and each
page is 3 by 4. When the contents are longer than the page, the list scrolls
inside the page. On a narrower window, the cover comes first and the contents
follow under it.

A chapter is one column of text. At its top is a line with the book's name,
which links back to the first page, the chapter's label, and a Contents button
that opens the list of chapters.

### The cover

The left page of the first page is the book's cover. It is a wall of tiles,
and each tile is one figure from a chapter. The title of the book is one tile
of 3 by 3 cells. Each chapter lists its tiles under `cover`, and must list at
least one.

- `figure` names a figure file beside the chapter, `<slug>.<figure>.vue`,
  whose root element has `id="fig-<figure>"`. The tile links to that id in the
  chapter, and its accessible name is the chapter's label and question.
- The tile shows the chapter's own figure component, scaled down, with the
  prop `still` set. A figure file declares `defineProps<{ still?: boolean }>()`
  and passes `still` to its `BookFigure`, `BookStepper` or `TreeStepper`
  (see "Figures" below). A still figure shows no controls, note, legend or
  caption, and a still stepper shows its last step or its `still-step`.
  Nothing inside a tile can be focused or clicked.
- `rows` and `cols` are the tile size. The wall is 6 cells across, and its
  rows stretch to fill the page. With 12 rows, a cell is about one and a half
  times as wide as it is tall. Pick the size closest to the figure's shape:
  3 rows by 3 cols for a figure 1.5 times as wide as tall, 2 by 3 for one
  about twice as wide as tall, 4 by 3 for a square one, and 3 by 6 for a wide
  two-panel figure.
  The wall packs the tiles in chapter order and fills gaps with later tiles.
  The page is filled with no gaps when the tiles add up to 63 cells (12 rows of
  6, less the title's 9) and each row of the wall is filled. More cells make
  the rows shorter. The wall is the same on a phone.
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
label: Axes
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
- `label` is one or two words that name the chapter, such as `Layout`.
  `book:check` fails when it is missing, when it is longer, or when it differs
  from the chapter's `label`.
- `words` is the word limit for the chapter's prose. `book:check` allows 10
  percent over it.
- "Must answer" is required. "Figure" and "Notes" may be empty.
- A brief may exist before its chapter. That is how a planned chapter is
  recorded.

### How notes reach a brief

Every paragraph, list item, heading and figure of a chapter has a "Feedback"
button, shown on hover and on keyboard focus. The "Give feedback on this
chapter" button at the end of the chapter is always shown. Either one opens a
small box beside its passage. In the box the reader picks one of four
reactions (Confusing, Boring, Useful, Loved it), may tick "I stopped reading
here", and may type a few words. A reaction or the tick alone is enough to
send. The box keeps an unsent draft in the browser, so closing the box or
reloading the page does not lose it. Where the feedback goes depends on where
the page is served.

- **The local dev server.** A dev-only Vite plugin,
  `docs/.vitepress/book-notes-server.ts`, serves `/__book/note`. The page asks
  it with a `GET` when it loads. When it answers, the box's button saves the
  feedback straight into the brief's `## Notes`, as
  `- <date>, <name> [<reaction>, stopped here]: "<the text>" (on "<the passage's first words>", #<anchor>)`.
  The square brackets hold the reaction and the stop mark, and are left out
  when there is neither. The quoted text is left out when the reader wrote
  none. The name is the first word of `git config user.name`. The section is
  added when the brief has none. Such a note is already in the brief, so
  nothing more needs to be done.
- **The published site.** The site is static, so the `GET` fails. The box's
  button opens a new GitHub issue in a new tab, with the chapter, the passage,
  the reaction (`Reaction: confusing`), the stop mark
  (`Stopped reading here: yes`) and the text filled in. The reader submits it
  there.

The transports are in `docs/.vitepress/theme/components/book/bookNotes.ts`.

An issue has the label `book-feedback`. Then:

- An issue that the maintainer opened is copied into the brief's Notes, with
  its date and author, and the issue is closed.
- An issue from anyone else waits for the maintainer. When the maintainer adds
  the label `book-feedback-accepted`, it is copied into the brief and closed in the
  same way.

GitHub applies the `book-feedback` label from the link only when the label
exists in the repository and the person opening the issue can set labels. For
anyone else, the issue arrives without the label, and its title still starts
with `Feedback on "`.

The reactions and the stop mark follow how beta readers are asked to react in
"Write Useful Books". Confusing, Boring and a stop matter most, because they
show where readers get lost or bored and quietly leave. Several readers who
mark the same passage outweigh one long comment. Run small rounds of three to
five readers between rebuilds, so each rebuild answers fresh feedback.

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
  See "Figures" below.
- A GoFish figure uses the usual `::: gofish` container. A `::: gofish`
  figure in the markdown cannot be a cover tile, so a chapter whose only
  figure is a GoFish chart also needs a static figure file for the cover.

### Figures

Every figure file draws inside one of three shared components in
`docs/.vitepress/theme/components/book/`, imported by the figure file. They
own the frame and the stepping, so every figure looks and steps the same way.
The figure file owns only what is drawn.

- `<BookFigure id="fig-<figure>" :still="still" :kinds="[...]">` is the
  frame of a static figure: the wide figure container, the `id` the cover
  links to, the legend and the caption. The content is the default slot and
  the caption a `<template #caption>`. `kinds` lists the palette kinds the
  figure uses (`user`, `added`, `ref`, `constraint`, `type`, `generated`),
  and the legend shows those, with the same words in every figure. Leave it
  out for no legend. A figure that is one `<svg>` gets full width; use `<div
class="fig-panels">` to put several SVG panels side by side. A figure may
  be up to 900 pixels wide. See `lowering.levels.vue` and
  `python.crossing.vue`.
- `<BookStepper id="fig-<figure>" :steps="steps" label="..." :still="still">`
  is a figure that steps. It is the same frame plus the step buttons,
  Previous and Next, "Step n of N", the note of the current step, the arrow
  keys (Home and End too), focus and the `aria` state. `steps` is a list of
  `{ label, note }`: a short button label and one sentence. The default slot
  draws the figure for the current step and receives `step` (counting from
  1), `n`, `still`, `shown(from, until?)`, true from step `from` through step
  `until`, and `stepClass(from, until?)`, the classes `is-future`, `is-past`
  and `is-new` for a piece that keeps its place at every step. Give such a
  piece the class `bs-piece` to fade it in when it appears and out when it
  goes away. Other props: `start` (the first step shown), `still-step` (the
  step a still figure shows, default the last), `kinds` (the legend), and
  `picker`, for choices that are not a sequence: the same buttons, with no
  Previous and Next and no "Step n of N"; a choice's `note` may be left out.
  See `layout.fill.vue` (pieces that appear), `labels.chooser.vue` (a
  picture drawn from each step's data) and `names.walk.vue` (a picker).
- `<TreeStepper id="fig-<figure>" :figure="data" :still="still">` is a
  `BookStepper` that steps through how a node tree grows. Put its data in a
  file beside the chapter, e.g., `axes.figure.ts`, and import it in the
  figure file. The data type is in `treeStepper.ts`. Each line of the tree
  has an `id`, a `depth`, a `text`, a `kind` (`user`, `added`, `ref`,
  `constraint` or `type`), the `step` at which it appears, for a line that
  goes away the last step it shows (`until`), and for a ref its `targets`. A
  `type` item is a note that typing writes on a node, not a node. The legend
  lists the kinds the tree uses. An optional `<svg>` inside the tag is the
  picture. Give each piece of the picture a `data-id` that matches a tree
  line; a piece may set its own `data-step` and `data-until`. Put the caption
  in a `<template #caption>` inside the tag. See `axes.rewrite.vue`.

`book:check` enforces this. Every `.vue` file in `docs/under-the-sea/`
must import `BookFigure`, `BookStepper` or `TreeStepper`, and must not
contain `<button`, `aria-pressed`, `role="group"`, a `keydown` handler,
`<input` or `<select`. Those belong to the shared stepper, so a figure that
needs a new kind of control changes `BookStepper` for every figure.

Every figure uses the same colors, set in `docs/.vitepress/theme/book.css`.

| Meaning                                                     | CSS variable       | SVG class                                         |
| ----------------------------------------------------------- | ------------------ | ------------------------------------------------- |
| A node from your code                                       | `--fig-user`       | `fig-user`, `fig-user-stroke`                     |
| A node the library adds                                     | `--fig-added`      | `fig-added`, `fig-added-stroke`, `fig-added-text` |
| A ref (always dashed)                                       | `--fig-ref`        | `fig-ref`, `fig-ref-box`, `fig-ref-path`          |
| A constraint or guide                                       | `--fig-constraint` | `fig-guide`, `fig-guide-dash`                     |
| From the descriptor table, generated from it or named in it | `--fig-generated`  | `fig-generated`                                   |

Each variable has a dark mode value too, so a figure that uses the classes
works in both modes.

Each color has one meaning across the whole book. Do not use a color for
anything but its meaning, even in one figure. When a figure needs a new
meaning, add a new variable to `book.css`, with a light and a dark value, and
a row to this table.

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
