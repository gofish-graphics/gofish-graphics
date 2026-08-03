---
name: write-mathematical-architecture
description: Write or revise rigorous, teachable explanations of mathematical and computer-science systems. Use for architecture essays, formal-semantics documentation, solver or algorithm explanations, AST/IR pipelines, invariants and theorems, interactive technical articles, and diagrams whose geometry carries semantic meaning. Especially use when readers need to connect notation and laws to concrete code ownership and execution order.
---

# Write Mathematical Architecture

Make the abstraction precise without making the reader decode it in isolation. Carry one concrete example from author-facing syntax through formal meaning, runtime ownership, and visible output.

Read [references/exposition-sources.md](references/exposition-sources.md) when choosing terminology, designing a proof presentation, or justifying an exposition pattern.

## Establish the contract

1. Identify the first-reader questions and the intended level of rigor.
2. Inspect the implementation before describing it. Distinguish **AS BUILT**, **TARGET**, and **OPEN QUESTION** whenever they differ.
3. Choose one small, labeled running example with enough structure to exercise the important behavior.
4. State what the explanation promises: operational understanding, a formal model, implementation mapping, laws, limitations, or some combination.

Do not silently formalize a known-incomplete implementation as the desired semantics. Name current bugs or missing cases separately from the proposed model.

## Build the semantic ladder

Show these levels explicitly and do not collapse them into one another:

| Level | Reader question | Required artifact |
| --- | --- | --- |
| Author syntax | What does a user write? | Minimal, language-tagged example |
| AST or ADT | What data structure represents it? | Typed definition plus representative value |
| Semantic IR | What mathematical object does it denote? | Typed objects, lowering relation, and laws |
| Runtime | Who creates, owns, and consumes it? | Pass order and implementation map |
| Rendered output | What becomes observable? | Labeled result tied back to the example |

Carry the same names through every level. If the example contains nodes `p` and `q`, preserve those labels in the AST, equations, pass trace, diagrams, and output.

Introduce the smallest useful ADT early. Pair its declaration with one actual value; a type alone does not show nesting, scope, or references.

## Define notation before explaining it

Put the mathematical type before prose. Define domains, codomains, units, scope indices, and partiality at first use. For example:

```text
ScaleFactor_S = R_{≥0} [px / u_S]
PixelExtent   = R_{≥0} [px]
R_n : ScaleFactor_S → PixelExtent
```

Then explain that `R_n(σ)` is node `n`'s requested pixel extent at scale factor `σ`. Do not make the prose carry information missing from the signature.

Use `⇀`, `Option`, or `Result` when an operation can be undefined or fail; state the condition. Annotate affine quantities dimensionally so expressions such as `aσ + b` can be checked by units.

Maintain a notation ledger near the article or in a collapsible side panel:

| Symbol | Type | Meaning | Scope | Units |
| --- | --- | --- | --- | --- |
| `σ` | `ScaleFactor_S` | scale chosen for scope `S` | scale scope `S` | `px/u_S` |
| `R_n` | `ScaleFactor_S → PixelExtent` | size request for node `n` | node `n` | output in `px` |

Define terminology at first use and use one term consistently. Prefer an established term when it matches the type and semantics; otherwise coin a descriptive compound term and explain the distinction.
Audit the ledger for symbol overload; for example, do not use `R_n` for both a size request and node `n`'s right edge.

## Map the model to the implementation

For every central concept, answer where it lives. Include an implementation map:

| Concept | Type or field | Created by | Read by | Lifetime |
| --- | --- | --- | --- | --- |
| Example concept | `Module.Type.field` | construction/lowering pass | solving/render pass | node, frame, pass, or render |

Include a computation-order diagram or trace. Show data dependencies rather than only source-call order. Say whether values are stored, derived, memoized, solved, or transient.

If a conceptual object does not exist as a first-class runtime object, say so. Point to the representation that carries the same information instead of inventing an owner.

## State laws as testable propositions

For each proposed law:

1. Define the equivalence relation: syntactic equality, normalized-IR equality, equal geometry, or observational equivalence.
2. State preconditions, including scope, coordinate, ordering, uniqueness, and failure assumptions.
3. Separate theorem, conjecture, design goal, and known counterexample.
4. Demonstrate the running example before giving the general statement.
5. Add an executable property test or a finite model check when feasible.

When laws mention nesting or reordering, account explicitly for effects such as z-order, name binding, coordinate boundaries, and scale policy.

## Make diagrams semantically truthful

Treat geometry as part of the explanation's assertion:

- Use GoFish for diagrams in this repository whenever it can express the figure. Prefer named nodes, refs, constraints, and `gf.enclose` over hand-calculated SVG geometry.
- Derive backgrounds and enclosure bounds from their actual children. Do not use a fixed ellipse or rectangle that children, labels, or error badges can escape.
- Draw an alignment only when the nodes are actually aligned by the model. Draw a reference edge from the real referenced endpoints. Never substitute a decorative bar that merely looks relational.
- Check containment, alignment, edge endpoints, label fit, clipping, and overlap in every interactive state and at representative viewport widths.
- Keep colors and contours consistent with their declared meaning. Provide a legend when color encodes scope, coordinate space, pass, or status.
- Use arrows only for a directed dependency or transformation; use containment only for actual ownership, region, or scope.

Use immediate state transitions by default. Add motion only when the interpolation itself explains a temporal or geometric process; avoid smoothing that makes the diagram lag behind its controls.

Pair an architecture-level diagram with a concrete scenegraph or pass trace when either would be ambiguous alone.

## Keep code accountable

- Give every fence its real language, such as `ts`, `tsx`, `json`, or `text`.
- Prefer valid TypeScript over pseudo-TypeScript. Compile or execute examples and doctest-like snippets when feasible.
- Label pseudocode explicitly when it omits real types or control flow.
- Keep identifiers synchronized with the implementation or mark them as conceptual aliases.
- Verify that interactive controls alter the same model described by the equations.

## Perform the first-reader audit

Before finishing, ask these questions for every important term or value:

1. What is it, and what is its type?
2. Where does it live in the AST, IR, or runtime state?
3. Who creates it, and who reads it?
4. When is it available in computation order?
5. Which scope or coordinate context owns its meaning?
6. Which laws does it obey, and under what preconditions?
7. What happens when the operation is undefined, inconsistent, or incomplete?
8. Does the diagram literally depict those answers?

Have a fresh reader trace the running example without relying on surrounding project knowledge. Revise any point where the reader must infer a missing type, owner, transition, or relationship.
