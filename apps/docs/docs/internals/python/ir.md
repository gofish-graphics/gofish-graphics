---
title: The Intermediate Representation
section: Python
order: 10
status: draft
---

# The Intermediate Representation

The Python and JavaScript APIs both serialize a chart to the same JSON **intermediate
representation (IR)**. The IR is what makes a chart render identically regardless of
which language built it. This essay will document the IR format and the contract both
sides honor.

## Planned contents

- The IR's shape and how it mirrors the TypeScript AST.
- `to_ir()` on the Python side — building the IR JSON from the Python AST.
- How the JS engine consumes the IR.
- Versioning the IR and keeping the two language ASTs in step.

## Source

Likely `covers:`: `packages/gofish-python/gofish/ast.py` and the JS AST under
`packages/gofish-graphics/src/ast/`. Add the `covers:` frontmatter when writing this up,
then run `pnpm --filter docs sync-backlinks`.
