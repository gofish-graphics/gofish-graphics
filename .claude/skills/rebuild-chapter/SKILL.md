---
name: rebuild-chapter
description: Build or rebuild one chapter of "Under the Surface", the book on how GoFish works inside (apps/docs/docs/under-the-surface/). Use when asked to write a new chapter from its brief, to rebuild a chapter that is out of date, or to fold reader notes into a chapter. The chapter is written from scratch from its brief and the code, never patched.
user-invocable: true
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - Grep
  - Glob
---

# Build or rebuild one chapter

A chapter of "Under the Surface" answers one question about how GoFish works
inside. It is written from its brief and from the code as it is today. A
rebuild starts from scratch. It never edits the old chapter text.

## 1. Read the rules and the brief

- Read `apps/docs/book/README.md`. It has the rules, the frontmatter, the brief
  format, the markdown pieces and the commands.
- Read the brief, `apps/docs/book/briefs/<slug>.md`. The question, the "Must
  answer" bullets, the figure and the notes in it are the whole plan. A note in
  the Notes section is something a reader said. Act on each one.
- If the brief does not exist, stop and ask for one. Do not write a brief
  yourself, except to add a reader note (see step 8).

## 2. Read the code, not the old chapter

- Do not open the old chapter text before you write, and never copy from it.
  The old chapter is the thing being replaced. You may look at its figure
  files (`<slug>.*.vue`, `<slug>.figure.ts`) only to reuse the picture
  geometry, and you must check every tree line in them against `book:tree`.
- Do not use the internals wiki (`apps/docs/docs/internals/`) as a source. It
  is often out of date. Code comments can be out of date too, so check what a
  comment says against the code below it.
- Read the files in the old chapter's `reads` list, then follow the code to
  whatever else answers the question. Keep a list of every file you read to
  write the chapter.

## 3. Run the code for anything you quote

- Any tree you show comes from `pnpm --filter docs book:tree`. Use a built-in
  example (`--list`) or write a small spec module in a temporary folder and
  pass its path. Simplify the printed tree for a figure if you must, but say in
  the caption that it is simplified.
- Any output, warning or number you quote comes from running the code. Do not
  write a tree or an output from memory.
- Check every line number in the code map against the file as it is now.

## 4. Write the chapter

Write `apps/docs/docs/under-the-surface/<slug>.md` in this shape.

1. A short opening that poses the question, usually with a small example the
   reader could write.
2. The idea, with the one figure.
3. The order of steps or the mechanism.
4. Formal rules (`::: rule`), where they help.
5. `::: not-yet-true`, the places where the code and the intended design part
   ways.
6. `## Where this lives in the code`, followed by `::: code-map`.

Do not type the title or the stamp into the markdown. The page layout prints
them from the frontmatter.

Keep the prose within the brief's `words`. `book:check` allows 10 percent over
and counts everything except frontmatter, code blocks, SVG and HTML tags.

The one figure is a `<TreeStepper>`, a static inline SVG in `<figure
class="book-wide">`, or a GoFish figure (`::: gofish`). Put a stepper or a
static figure in its own file beside the chapter, `<slug>.<figure>.vue`, with
`id="fig-<figure>"` on its root element and a `still` prop (see
`axes.rewrite.vue`), and import it into the chapter. Use the figure colors
from the README for every figure: one color for nodes from the reader's code,
one for nodes the library adds, dashed for refs, gray for constraints.

## 5. Write plainly

- Use short sentences and everyday words. Read two `handwritten: true` pages
  first (e.g., `apps/docs/docs/js/get-started.md` and a page under
  `apps/docs/docs/js/api/howto/`) and match their voice.
- Define every term of art the first time you use it, in plain words. This
  includes the project's own words, e.g., "claim", "slice", "elaboration",
  "ring" or σ (sigma). Do not use one without a definition.
- Describe the code as it is. Do not write history. Avoid "now",
  "previously", "no longer", "used to", "was changed to" and similar phrases.
- Do not put issue or pull request numbers in the running text. They may
  appear in the "Not yet true" box.
- Do not use dashes as asides. Use a period or a plain word instead.
- Do not explain by analogy. Say what the code does.

## 6. Set the frontmatter

```yaml
title: <the brief's question, exactly>
order: <the chapter's place in the book>
topics: [<terms a reader might search for>]
reads:
  - <every repo-relative source file you read to write the chapter>
checked:
  commit: <output of `git rev-parse HEAD`, the full sha>
  date: <today, YYYY-MM-DD>
cover:
  - figure: <name of a figure file <slug>.<name>.vue>
    rows: <tile height in cover cells, 1 to 4>
    cols: <tile width in cover cells, 1 to 6>
```

Every chapter must offer at least one cover figure. The cover at the top of
the contents page is built from these entries, so pick a size close to the
figure's shape (the README's "The cover" section has the cell size). A
`::: gofish` figure cannot be a cover tile. Check the cover at
`/under-the-surface/` when you look at the render in step 7.

`checked.commit` is the commit whose code you read. If you change source files
in the same branch, read them again and set the commit after those changes
land, or the chapter will show as out of date.

## 7. Check it

- Run `pnpm --filter docs book:check` and fix every problem it prints.
- Look at the rendered page once. Start the docs dev server on a free port
  (`cd apps/docs && npx vitepress dev docs --port <port>`), open
  `/under-the-surface/<slug>`, and take a screenshot at about 1200 pixels wide
  and one at 400 pixels wide. Check the stamp, the figure at its first and last
  step, and the code map. Stop the server when you are done.

## 8. How reader notes reach the brief

Readers leave notes as GitHub issues. The note button gives them the label
`book-note` and a title that starts with `Note on "`.

- An issue opened by the maintainer is copied into the brief's `## Notes` as
  `- <date>, <name>: "<the note>"`, with a link to the issue. Then the issue is
  closed with a comment that points at the brief.
- An issue from anyone else is left for the maintainer. When the maintainer
  adds the label `book-note-accepted`, copy it into the brief and close it the
  same way.
- A note changes the chapter only through the brief. After you add notes,
  rebuild the chapter from scratch with this skill.

List open notes with
`gh issue list --label book-note --state open` and
`gh issue list --search 'in:title "Note on \""' --state open`.
