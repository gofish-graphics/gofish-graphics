---
chapter: names
question: How do names and refs find their targets?
label: Names
words: 1200
---

## Must answer

- What `.name()`, `ref`, `selectAll` and `createName` tokens each do, and the two places a name is resolved (the registry at build time, the tree walk at layout time).
- Scopes: what opens one (`chart()`, `layer([...])`, `createMark`), how a lookup widens from the nearest scope outward, where it stops, and what happens with zero, one or several matches.
- Hygiene: why a name used inside a component, or by the parts the library adds (axes, labels), cannot collide with a name the user chose. Say whether this is a guarantee of the design or only true of today's code.
- A nested, diagram-style example in the manner of Bluefish (a component used twice, each with an inner part of the same name, and a relation drawn between parts across them) worked through: which lookups succeed, which fail, and why.
- How a `ref` gets the position and size of its target, and what happens when the target is placed later.

## Figure

The nested example as a tree with its scopes drawn as nested regions. The reader picks a starting node and a name, and the figure shows the walk and what it finds. If a picker is too much, use the stepper over three fixed lookups: one that succeeds nearby, one that widens, one that stops at a component boundary.

## Notes

- 2026-11-13, Josh: "it should be updated to explain scopes (and hygiene if that's still relevant/interesting) esp. the stuff being used for the more nested, diagrammatic examples from bluefish"
