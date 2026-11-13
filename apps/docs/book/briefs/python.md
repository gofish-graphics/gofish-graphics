---
chapter: python
question: How does a spec cross to Python and back?
label: Python
words: 1200
---

## Must answer

- The intermediate representations GoFish has, in order, with one line on each: what it is, who produces it, who reads it. Include the serialized form in `gofish-ir` and the construct descriptor table.
- What a Python call such as `chart(data).flow(spread(by="category")).mark(rect(h="value"))` becomes on the Python side, what is sent, and how the JavaScript side turns it back into the same tree a JavaScript user would have built.
- How one construct stays in step across both languages: the descriptor entry, the generated Python wrapper, the deserializer table.
- What cannot be serialized as data (a Python function passed to `derive`, for example) and how it crosses anyway.
- How the result gets back to Python (the rendered output in a notebook).
- How the two sides are checked against each other (the parity stories).

## Figure

The same small spec at each representation, left to right: Python source, the serialized form (real output, shortened), the JavaScript tree. Mark which parts are generated from the descriptor table.

## Notes

- 2026-11-13, Josh: "How does a spec cross to Python and back? relatedly what our intermediate representations are"
