---
chapter: pipeline
question: What happens between chart(...) and the pixels on screen?
label: Pipeline
words: 1200
---

## Must answer

- What the stages are, in order, from the builder call to the drawn SVG, and what each stage takes and produces.
- Whether the stages are still steps that run once in order, or whether some run again. Say which and why.
- Where coordinate transforms (`Coord`) fit: at which stage they act, and what they change.
- When layout happens, and what has to be known before it can.
- How this compares with the seven steps of the Grammar of Graphics pipeline, in one short passage, so a reader who knows that pipeline can place GoFish against it.
- Point to the chapters that go deeper on a stage (lowering, layout, axes, labels) and do not repeat them.

## Figure

A compiler-pipeline diagram: stages as boxes left to right (or top to bottom on a phone), with the data that flows between them named on the arrows, and the stages that run more than once marked. One small running example, a three-bar chart, shown under the stages as what the tree looks like after each one.

## Notes

- 2026-11-13, Josh: "idk if our steps are steps anymore but like how do coords fit into things, when does layout happen, etc. a compiler pipeline-esque diagram could be good here"
- 2026-11-13, Josh: wants this "a la the GoG's 7 steps".
