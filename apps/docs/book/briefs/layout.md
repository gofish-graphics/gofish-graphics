---
chapter: layout
question: How does every node get its size and its place?
words: 1200
---

## Must answer

- What the layout engine is given (a tree, a canvas size, data ranges) and what it produces (a box and a position for every node).
- How a size is decided: what a node with a data-driven size asks for, what a node with no size gets, how leftover room is shared, and how data units become pixels. Use plain words. If the code has its own terms for these (for example "claim" or a scale factor written as sigma), define each one at first use and say what the plain equivalent is.
- How a place is decided: who places a child, in what order, and the rule that the first placement wins.
- How constraints (`align`, `distribute`, `position`) are solved and where the solver sits in this.
- What a `ref` does during layout.
- What makes layout run more than once, if anything.

## Figure

One small nested example (a stacked bar chart inside a fixed canvas) with a stepper that shows the sizes and positions being filled in, in the order the engine fills them.

## Notes

- 2026-11-13, Josh: "a layout engine doc (related to How does every node get its size?)"
- Josh has said before that he does not hold the layout vocabulary (claim, slice, sigma) in his head. Define or avoid.
