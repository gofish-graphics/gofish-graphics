# The essence of GoFish

**Status:** running design note (2026-07-16). This is a record of the architecture as we
currently understand it, not a frozen specification. It is expected to change as the automatic
axis-label choice experiment, richer silhouettes, and algorithm-node work produce evidence.

Companion notes:

- [Composition, Not
  Enumeration](../../apps/docs/docs/internals/design/composition-not-enumeration.md)
  explains why GoFish wants a recursive language rather than a catalog of chart forms.
- [A Synthesis of UI, Diagram, and Chart
  Layout](../../apps/docs/docs/internals/design/layout-synthesis.md)
  develops the current bbox/claim/constraint model.
- [Modular Layout Algorithms](./modular-layout-algorithms.md) separates layout spec, policy,
  and schedule.
- [The Silhouette Interface](./silhouette-interface.md) generalizes the boundary summary passed
  between composed layouts.
- [Automatic Axis Label Angle](./automatic-axis-label-angle.md) is the first deliberately narrow
  experiment with alternatives measured before placement.

## 1. The question

GoFish has often described its layout core concretely:

- a recursive tree of marks and operators;
- one `UnderlyingSpace` per axis;
- monotone size claims, usually affine in a scale factor σ;
- per-axis bbox ledgers;
- max-plus folds for extents;
- difference constraints for placement;
- one inversion per scale scope.

That description has been productive because it names the actual implementation. It is becoming
too specific to name the system's essence. Paragraph wrapping needs a last-row summary and a set
of alternatives. Tidy trees need contours. Tables need column vectors. A treemap may synthesize
an operator plan. An automatic axis label angle carries three frame claims and selects one plan.
None of those naturally reduces to “propagate one bbox,” yet all feel like GoFish rather than
foreign features bolted onto it.

The question is therefore:

> What remains invariant when the propagated data structure, claim algebra, and local solver are
> allowed to vary?

## 2. Current answer, compressed

GoFish is a **compositional visual compiler whose layout phase is cooperation among scoped
abstract domains**.

A subtree does not immediately produce pixels. It synthesizes a lawful abstract description of
its possible layouts. Its parent supplies inherited context—a budget, scale environment,
coordinate frame, or policy input. At a scope boundary, a domain-specific resolver combines the
two, selects or solves a plan, and projects the result into the smaller interface understood by
the surrounding system. A deterministic realization pass commits the selected plan once.

In one line:

> Children describe possibilities; parents provide context; scopes resolve a plan; the kernel
> realizes its certificate.

The bbox-plus-affine engine is one particularly useful layout theory in this architecture, not
the definition of the architecture.

## 3. The shift: from universal data structure to universal protocol

The early unification question was “what is the one representation every layout can use?”
Bboxes, linear constraints, and monotone claims were candidates for that universal
representation. The newer answer is that there probably is no single maximally useful
representation.

A bbox forgets exactly the information wrapping and contour composition need. A contour is too
expensive and too specialized to attach to every bar and text node. A Pareto frontier is wasted
overhead in a deterministic stack. A general nonlinear constraint system could encode many of
these cases, but it would discard the predictable schedule, diagnostics, and complexity that the
restricted domains currently buy.

The universal object is therefore not a carrier such as `BBox`. It is a protocol with places for
different carriers:

```text
elaborate
→ synthesize an abstract measurement
→ combine measurements with domain-specific joins
→ meet inherited context at a scope
→ solve/filter/rank alternatives
→ select a plan
→ project to the parent boundary
→ realize the selected plan deterministically
```

This is a shift from **data-structure universalism** to **architectural universalism**. GoFish
does not require every graphic to speak the same internal geometry at every point. It requires
each local geometry to participate in the same staged composition discipline.

## 4. The two things being generalized

Two independent structures have sometimes both been called “the layout IR.” They should remain
separate.

### 4.1 The visual language

The frontend's generative core is the recursive type:

```text
Node = Mark(...) | Operator(..., children: Node[])
```

This is the lambda-calculus/relational-algebra side of the ambition. A combinator consumes visual
nodes and produces a visual node, so composition is closed and unbounded. New chart families can
be libraries expressed in the language rather than new top-level grammar slots or runtime forks.

The visual language answers:

- what is being composed;
- which data and semantic measures it denotes;
- where scopes and coordinate boundaries occur;
- which local layout theory an operator requests.

### 4.2 The interpretation domains

The layout interpreter is generic over the abstract information used to interpret those nodes.
Different scopes may use different domains:

- intervals and bboxes;
- monotone σ-claims;
- paragraph summaries;
- vectors of track widths;
- contours;
- finite frontiers of alternatives;
- a foreign algorithm's plan and certificate.

This layer answers:

- what information crosses a child boundary;
- which joins are valid;
- how inherited allocation resolves unknowns;
- when alternatives may be pruned;
- what plan is handed to realization.

The recursive visual language should remain small and uniform even as its interpretations become
generic. Otherwise “generic domains” merely recreates a federation of unrelated sub-DSLs.

## 5. A layout theory module

The following is a mathematical inventory, not a proposed TypeScript interface. For one local
layout theory `T`, identify:

```text
T = (S, Q, J, ⊑, π, R, P)
```

where:

- `S` is the **summary domain**: box, paragraph silhouette, contour, column vector, and so on;
- `Q` is the **claim language** presented to an enclosing scope: a monotone σ-function, a fixed
  extent, a cross-axis measurement function, or a finite family of claims;
- `J` is the set of **joins** the theory understands: overlay, hard sequence, soft sequence,
  contour merge, row merge, etc.;
- `⊑` is a **domination preorder** used to discard alternatives safely;
- `π` is a **projection** to a boundary theory understood by the parent;
- `R` is a **resolution strategy** that meets claims with inherited context and returns feasible
  resolved alternatives;
- `P` is the **plan/certificate language** consumed by deterministic realization.

A candidate measurement has roughly this shape:

```ts
type Candidate<S, Q, P, C> = {
  summary: S;
  claim: Q;
  plan: P;
  cost: C;
};
```

The type is intentionally schematic. Some costs are known symbolically; some are evaluated only
after a candidate receives its own solved σ. Some summaries contain claims rather than sitting
beside them. A deterministic theory has one candidate and no meaningful cost. The purpose of the
inventory is to expose the extension points and laws, not to force every theory into one object
layout.

### 5.1 Examples

| theory | summary `S` | claim `Q` | plan `P` | resolution |
| --- | --- | --- | --- | --- |
| current box layout | per-axis intervals/bbox facets | monotone extent in σ | bbox equations + placement relations | invert once, solve difference graph |
| ordinal auto-label angle | three measured box candidates | one frame claim per angle | selected angle + anchor policy | solve each claim, score collisions |
| paragraph wrap | `(rows, maxWidth, lastWidth)` frontier | width/height behavior | break positions | Pareto dynamic program |
| table | vector of column/row widths | sum of track claims | track allocation | pointwise max then sum |
| fixed-order tidy tree | left/right contour | contour extent | subtree offsets/threads | deterministic contour merge |
| treemap plan synthesis | child weights + proposed rect | fixed frame | nested partition/operator tree | selected tiling algorithm |
| heuristic packing | skyline plus search state | fixed container | placements/order certificate | heuristic search, then validation |

The table is evidence against one universal carrier and for one universal protocol.

## 6. Cooperation between theories

Generic local domains are useful only if independently authored operators can still compose.
The architecture therefore needs an explicit account of cooperation.

### 6.1 Shared facts

Specialized theories should exchange a deliberately small vocabulary of facts rather than reach
into one another's internal representations. Current candidates include:

- semantic measure and data domain;
- scope identity;
- allocated frame;
- scale map or unresolved scale claim;
- boundary box projection;
- named anchors and reference identity;
- feasibility/conflict information;
- a selected realization certificate.

These are the layout analogue of an interface theory. They are not meant to encode every local
detail. A paragraph theory need not expose its line-break dynamic program to an enclosing layer;
it exposes the selected box, relevant claims, and anchors. A contour theory need not make every
ancestor contour-aware; it projects when leaving the scope that understands contours.

### 6.2 Purification at boundaries

When a node mixes theories, elaboration should isolate theory-specific subterms and name their
shared boundary values. For example:

```text
wrap-specific subtree
  exports: selected width, height, baseline, named anchors

ordinary surrounding layer
  imports: those exported facts as box/constraint participants
```

This resembles purification in combined decision procedures: a mixed expression is decomposed
into pieces owned by specialist procedures, connected through shared variables. In GoFish the
operation is a compiler elaboration and scope boundary rather than a logical formula rewrite,
but the architectural move is the same: keep specialist internals private and make cooperation
explicit.

### 6.3 Projection is lossy on purpose

The parent generally receives less information than the child scope used internally:

```text
paragraph frontier ──select──▶ paragraph silhouette ──π──▶ box
contour + offsets  ──merge───▶ subtree contour      ──π──▶ box
tiling search      ──choose──▶ partition plan       ──π──▶ child boxes
```

This loss is the tractability boundary. Rich information should travel only as far as an
operator can use it lawfully. If every detail escaped upward, every ancestor would be forced into
the most expensive domain present anywhere below it.

### 6.4 Certificates preserve a small kernel

A theory that performs search or arbitrary computation should not acquire unrestricted authority
to mutate the scene graph. It returns a plan or certificate. The realization kernel checks and
commits that certificate using ordinary ownership rules.

Examples include:

- line-break positions;
- a chosen angle and anchor policy;
- a permutation;
- a partition tree;
- contour offsets;
- fixed placements from a heuristic packer.

The trusted core can therefore remain smaller than the set of layout algorithms. This is the
same reason proof-producing solvers and compiler lowering passes are easier to compose than
arbitrary procedures sharing mutable state.

## 7. The Nelson–Oppen analogy

Nelson and Oppen's combination method addresses formulas containing terms from multiple logical
theories. Rather than build a new monolithic decision procedure for every union, it purifies the
formula into theory-specific pieces and lets specialist procedures cooperate by communicating
facts about shared variables. The original line of work is described in
[_Simplification by Cooperating Decision
Procedures_](https://doi.org/10.1145/357073.357079)
and the related congruence-closure procedure in
[_Fast Decision Procedures Based on Congruence Closure_](https://doi.org/10.1145/322186.322198).

The overlap with GoFish is architectural:

| Nelson–Oppen family | possible GoFish analogue |
| --- | --- |
| union of specialized theories | one visual tree containing several layout domains |
| purification of mixed terms | elaboration into domain-owned scopes with named boundaries |
| shared variables | boxes, anchors, measures, scales, and allocations at scope boundaries |
| theory decision procedure | domain-specific measurement/resolution strategy |
| exchange of implied equalities | exchange of shared boundary facts and conflicts |
| combined satisfiability result | one feasible selected layout plan |

The analogy suggests a direction: GoFish's extensibility may depend less on finding the final
layout algebra and more on defining a disciplined **combination protocol for layout theories**.

It also suggests that restrictions are part of the design, not inconveniences. Nelson–Oppen
combination theorems rely on conditions such as signature separation and properties of the
component theories; arbitrary procedures do not automatically combine soundly or efficiently.
Likewise, a GoFish layout theory should have explicit obligations governing projection,
monotonicity, ownership, and certificates. “Implements the interface” is weaker than “composes
lawfully.”

### 7.1 Where the analogy stops

GoFish is not an SMT solver, and treating the correspondence literally would misdesign it.

- Nelson–Oppen decides conjunctions; GoFish performs staged synthesis, allocation, selection,
  and realization.
- Logical theories communicate equalities to a fixed point; GoFish strongly prefers a statically
  ordered schedule with no general fixpoint.
- GoFish theories may share semantic operations intentionally (`+`, `max`, anchors, boxes) rather
  than having disjoint signatures.
- Layout is allowed to be underdetermined and resolved by policy or cost. Satisfiability alone is
  not a complete visual result.
- Some layout problems are NP-hard. GoFish may accept a heuristic certificate while preserving a
  deterministic checker; that is not a complete decision procedure.
- Information flow is hierarchical and scoped, not an unrestricted peer-to-peer broadcast among
  solvers.

The useful lesson is **cooperation through a small shared theory**, not the specific
Nelson–Oppen algorithm.

## 8. The universal-language ambition

GoFish's long-term ambition is sometimes described by analogy to lambda calculus or relational
algebra: not merely another chart grammar, but a small substrate in which many visualization
grammars can be expressed as libraries.

The analogy should be made precisely.

### 8.1 Lambda calculus: generative syntax

Lambda calculus is powerful not because it enumerates many program forms, but because abstraction
and application are closed and recursively composable. The corresponding GoFish bet is:

```text
visual node + visual combinator → visual node
```

Marks, operators, coordinate transforms, and derived constructs should elaborate into this
recursive shape. A unit-chart grammar, tree grammar, animation grammar, or diagram component
should be definable in user space rather than installed as another privileged chart family.

This is a claim about the **shape of the language**, not about making GoFish Turing-complete.
Indeed, unrestricted computation in the semantic core would weaken the laws that make
composition analyzable.

### 8.2 Relational algebra: closure plus laws

Relational algebra is a small closed vocabulary whose expressions denote relations again. Its
laws permit normalization, optimization, and substitution without knowing the storage strategy.
The GoFish analogue needs both parts:

- closure: operators consume and return visual nodes;
- laws: elaboration, measurement joins, projections, and plans have semantics that support
  rewriting and independent implementation.

Closure without laws produces a generic scene-graph toolkit. Laws without recursive closure
produce another fixed-shape Grammar of Graphics. The pursuit is the combination.

### 8.3 What “universal” should mean

The plausible goal is not “one solver can directly express every graphic.” It is:

> One recursive visual language and one cooperation architecture can host many restricted layout
> theories, with explicit translations and shared boundary semantics.

Universality lives at three levels:

1. **syntactic universality:** new visual constructs elaborate from the same recursive node
   language;
2. **semantic interoperability:** local layout theories can exchange shared facts and nest;
3. **implementation extensibility:** new policies and schedules can emit plans checked by the
   same realization kernel.

Failure at any level recreates the current ecosystem's parallel grammars inside one repository.

## 9. What is likely the fixed kernel

The exact boundary remains open, but the following pieces look more stable than any one layout
carrier.

### 9.1 Elaboration

High-level chart constructs become a small recursive core. Provenance is retained so errors and
readback can name the source construct. Elaborators may introduce scopes, theory-owned nodes,
shared variables, and deferred plans, but should not commit viewport geometry.

### 9.2 Semantic spaces and measures

Before geometric theories cooperate, they must agree on what quantities mean. Data domains,
ordinal keys, units of measure, and coordinate aliases are type-level facts. Two pixel extents
with incompatible semantic measures must not be silently combined merely because both are
numbers.

### 9.3 Scope scheduling

A scope is where synthesized descriptions meet inherited context and local unknowns become
resolved. The AST may be large, but the operational structure is the coarser tree of scopes.
Different theories may have different local schedules, while the nesting of scopes supplies the
global schedule.

### 9.4 Choice discipline

Hard constraints filter. Policy or cost chooses among feasible alternatives. Choice remains an
explicit construct in measurement rather than an accidental consequence of traversal order or
last-writer-wins mutation.

### 9.5 Deterministic realization and ownership

One selected plan enters realization. Geometry writes are owned, checked for conflict, and
committed once. Search, measurement, and candidate comparison remain pure with respect to node
geometry.

### 9.6 Projection and lowering

Each theory projects to shared boundary facts; the selected realized tree lowers to a backend-
independent display list. Rendering backends should not need to understand the theory that chose
the geometry.

## 10. Obligations of a cooperating layout theory

A future extension should answer these questions before it is treated as a first-class layout
theory.

### 10.1 Denotation

- What layouts does a term denote?
- Which distinctions in the summary are semantically meaningful?
- Which parts are policy rather than feasibility?

### 10.2 Composition

- What are the joins?
- Are they associative, and what is their identity?
- Is child order semantically fixed or a policy variable?
- What happens when this theory is nested under an ordinary box parent?

### 10.3 Projection

- Which facts cross the theory boundary?
- Is projection conservative for joins the parent also understands?
- Which information is deliberately forgotten, and at what scope?

### 10.4 Resolution

- Which inherited values does resolution require?
- Which unknowns are solved per candidate?
- Is resolution exact, bounded, or heuristic?
- What is the visible complexity bound or frontier-width risk?

### 10.5 Choice

- What is the domination relation?
- Are joins monotone under it, making pruning sound?
- Is the cost order total and its combination associative/monotone?
- What deterministic tie-break makes output stable?

### 10.6 Realization

- What certificate does the theory emit?
- Which existing constraints can realize it?
- What must the kernel validate before committing geometry?
- Can failures name the source operator and conflicting owners?

This checklist is the analogue of combination conditions. It is more important than whether all
implementations literally share one generic interface.

## 11. Consequences for architecture

Several design consequences follow if this account is right.

### 11.1 `BBox` becomes a boundary theory

Bboxes remain ubiquitous because raster/vector backends, hit testing, parent allocation, and
ordinary alignment need them. Their role changes from “the complete intermediate representation”
to “the common coarse projection most scopes can export.”

### 11.2 `Monotonic` is one claim language

The monotone σ-function algebra remains the ideal language for proportional sizes, scales,
padding, stacks, overlays, and grids. It need not absorb contours, line-break state, permutations,
or every cross-axis dependency. A theory may carry those internally and export a monotone claim
when crossing into a σ scope.

### 11.3 Constraints are a realization calculus

Align, distribute, position, nest, grid, and bbox equations remain a compact deterministic
calculus for realizing many selected plans. They need not be the language in which every policy
decision is expressed. “Choose an order” and “realize this order” are different jobs.

### 11.4 Algorithm nodes become theory adapters

An algorithm node is not merely an escape hatch. Properly designed, it is an adapter from a
specialized planning domain into shared claims and realization certificates. Treemap, tidy-tree,
Sankey ordering, and packing can each expose different internal strategies while presenting a
lawful face to the rest of the compiler.

### 11.5 The measurement pass becomes plural

“Measurement” no longer means only “compute one intrinsic bbox.” It means abstract evaluation
in the current theory. Its result may be one claim, a frontier, a contour, or a plan-producing
function. What unifies these is that measurement is non-committing and precedes realization.

### 11.6 Genericity should follow evidence

The automatic ordinal-label experiment should use feature-local candidate types. Wrap should use
a paragraph-specific summary. Only after two or three implementations exhibit the same
operations should the common frontier/theory interfaces be extracted. The architecture should be
generic; the first code should not be generic merely in anticipation.

## 12. What this account rejects

### 12.1 One global optimizer

Encoding all layout as simultaneous soft constraints would make theories superficially uniform
while hiding their schedules and complexity. GoFish instead combines restricted exact domains
and explicit policy, with heuristic search fenced behind certificates where necessary.

### 12.2 One maximal summary

Attaching contours, alternatives, baselines, row state, and every future fact to every node would
turn the boundary type into an ever-growing product. Scoped domains and lossy projection are the
answer to that accretion.

### 12.3 Unchecked plugin solvers

An arbitrary callback that mutates child geometry is extensible but not compositional. Extensions
should return claims, shared facts, and plans whose effects can be checked and owned.

### 12.4 A collection of sealed sub-grammars

If “generic over domains” means a switch among unrelated engines that cannot nest or exchange
facts, the universal-language goal has failed. The hard problem is combination, not registration.

### 12.5 Turing completeness as the finish line

The host language already supplies arbitrary computation. The visual core earns its value by
being more restricted: denotationally clear, optimizable, diagnosable, and closed under the
compositions visualization needs.

## 13. Open research questions

This note is intentionally a running account because the following questions are unresolved.

### 13.1 What is the shared boundary theory?

Is `{semantic space, frame claim, box, anchors, plan}` sufficient? Are baselines ordinary named
anchors? Do cross-axis dependencies need a standard representation, or should they always remain
inside a theory scope?

### 13.2 How are multiple theories present at one node?

Does each operator own exactly one theory and project before its parent sees it? Can a node carry
a product of independent theories? Is there a principled coproduct/adapter mechanism, or will
elaboration always introduce explicit nested scopes?

### 13.3 What are the combination conditions?

The silhouette laws cover associative joins, conservative projection, and monotone domination.
They may be the beginning of a broader set of sufficient conditions. We do not yet have a theorem
stating when two independently implemented GoFish layout theories compose soundly, terminate, or
preserve complexity.

### 13.4 Where does σ live in a frontier?

Automatic label angle shows that alternatives may carry different frame claims and therefore
different solved σ values. Which symbolic dominance tests are valid before σ resolution? When
must pruning wait until candidates are realized? Does a bounded-width frontier survive when its
measure components are monotone functions rather than constants?

### 13.5 What is the right certificate kernel?

Can most algorithms lower to operator trees plus current constraints? Which require direct
placement certificates? What checker is strong enough to preserve ownership and hard constraints
without reimplementing the algorithm?

### 13.6 What does completeness mean?

There are at least three possible claims:

- the visual combinators can encode a broad class of graphics;
- the cooperating-theory protocol can host the required layout domains;
- the built-in theory set covers common visualization practice without plugins.

These should not be conflated. Lambda calculus and relational algebra analogies concern the first
two, not a promise that the standard library already contains every chart.

### 13.7 Can laws support optimization?

Relational algebra's practical power comes not only from expression but from equivalence laws and
query optimization. Which GoFish rewrites are semantics-preserving across theories? Can
elaboration select representations or schedules from declared laws? Can a cost model choose
between equivalent realization plans without changing visual semantics?

## 14. Working thesis

The current working thesis is:

> A universal visualization grammar is possible not because every visualization shares one
> geometric representation, but because visual programs share a recursive composition language
> and their specialized layout theories can cooperate through scoped, lawful boundaries.

The immediate research program follows:

1. keep the recursive `Node = Mark | Operator(Node[])` language small and closed;
2. make abstract measurement distinct from mutating realization;
3. validate choice on the three-layout ordinal-axis experiment;
4. validate a genuinely richer summary on paragraph wrap or contour composition;
5. compare the two implementations and extract only the cooperation machinery they actually
   share;
6. state stronger combination laws once there is enough evidence to know what they are.

If that program succeeds, bbox constraints, pretty-printing frontiers, contours, and algorithm
nodes are not competing proposals for the core. They are cooperating theories hosted by the same
visual calculus.
