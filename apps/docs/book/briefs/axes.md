---
chapter: axes
question: How does a chart get its axes?
words: 1200
---

## Must answer

- Where the axes, ticks, titles and legend come from when the user's spec mentions none of them.
- How typing and the rewrite are connected. Typing here means working out, for each node and each direction, what kind of space it has (for example continuous with an origin, or a set of named slots), what its data range is, and which node owns each axis. Show that the kind of space decides which kind of axis is built, and that the rewrite reads the result of typing and never recomputes it.
- The order of events and why the rewrite cannot come first.
- What the rewrite adds for each kind of axis, as ordinary nodes the user could have written.
- The rules that keep the rewrite from disturbing the user's tree (wrappers are invisible, added parts use handles and not names, content is placed first).
- Leave names and refs to the names chapter, and labels to the labels chapter. One sentence and a link each.

## Figure

The tree stepper over a three-bar chart, as in the first version of this chapter, with one added step before the rewrite that shows the type of each direction written on the tree (the x direction is a set of named slots, the y direction is continuous from 0 to 7) and which node was chosen to draw each axis. Then the rings, each tied back to the type that caused it.

## Notes

- 2026-11-13, Josh: "how axes are drawn in a chart (esp how typing and elaboration are connected to each other)"
