---
title: "Operators over Placed Nodes: Labels, Connectors, and the Operand-Kind Spectrum"
section: Speculative Notes
order: 41
status: speculative
---

# Operators over placed nodes: labels, connectors, and the operand-kind spectrum

> **Status: design exploration**, tracked by
> [#707](https://github.com/gofish-graphics/gofish-graphics/issues/707). Grew out of the
> Python-parity exemption audit
> ([#703](https://github.com/gofish-graphics/gofish-graphics/pull/703)): four stories stay
> exempt because their mark-as-functions embed resolved refs (`d[0]`), and the attempt to
> give them declarative spellings surfaced a question about the language itself. Extends
> [[operators-vs-constraints]], [[constraints-as-core]], and [[shapes-vs-marks]]. Related:
> [#700](https://github.com/gofish-graphics/gofish-graphics/issues/700) (field expressions —
> label accessors contributed there),
> [#706](https://github.com/gofish-graphics/gofish-graphics/issues/706) (multi-label
> plumbing), [#591](https://github.com/gofish-graphics/gofish-graphics/issues/591) (bridge
> refs to Python — this essay proposes narrowing it),
> [#641](https://github.com/gofish-graphics/gofish-graphics/issues/641) (emphasize API),
> [#681](https://github.com/gofish-graphics/gofish-graphics/issues/681) (claim = scope =
> chrome refactor).

**Question.** In `BarWithLabels`, a bar's value label is spelled
`spread({ dir: "y" }, [d[0], text(...)])` — an operator applied to a child list containing
one ref (an already-placed node) and one fresh mark. That composition behaves like a
_derived mark_ (it reads an existing node's placement and adds geometry near it, the way
`line` and `ribbon` do), but it is built from an _operator_ (which normally owns its
children's layout), and its bounding box today is the union of both children, so the
anchor's extent is counted twice — once in its home chart, once here. Does admitting this
idiom break the operator/mark stratification, and if not, what rule keeps it standing?

**Answer, compressed.** The stratification survives if we index it by a second axis the
language already half-implements: **operand kind** — whether an arrangement's operands are
_fresh_ (owned: the arrangement decides their placement and answers for their space) or
_placed_ (borrowed: refs to nodes some other scope already placed). One more ingredient is
needed to cover connectors: some arrangements also **draw ink of their own** (a line's
path, a ribbon's quad, a label's text). Model that ink as an implicit fresh operand — the
"drawn child" — even though it is not implemented as a child. Then one combinator family
covers the whole table:

| operands             | today's name         | places whom         | reports upward (see §2)                         |
| -------------------- | -------------------- | ------------------- | ----------------------------------------------- |
| all fresh            | operator (`spread`)  | all children        | the children (correct today)                    |
| mixed refs + fresh   | _(unnamed idiom)_    | fresh children only | fresh only (today: refs too — the double-count) |
| all refs, no ink     | constraint (`align`) | pins/moves refs     | nothing (correct today)                         |
| all refs + drawn ink | connector (`line`)   | nothing — reads     | the drawn ink (correct today)                   |

Rows one, three, and four already exist and already behave correctly. `spread` elaborates
to `align + distribute` (the `Constraints.stories.tsx` equivalence stories exist to prove
`spread({alignment, spacing}) ≡ align(...) ∘ distribute(...)` — see
[[operators-vs-constraints]] for how that machinery was unified); the constraint solver
already treats a placed operand as _pinned_ — a baseline that pulls others and is excluded
from the movable set; and a connector's box is already its drawn path. The mixed row is the
only one without a name, a correct upward-reporting rule, or a serializable spelling.
Filling it in is a completion of the table, not a break in the strata. The rule that makes
every row come out right:

> **What an arrangement reports upward is what it adds to the picture: its own drawn ink
> plus its fresh operands. Refs contribute nothing — the node they point at already
> reported itself from its home scope.**

Maintainer direction recorded during review: prefer **one polymorphic combinator** over
naming the rows separately (§3.2), model connector ink as an implicit child at the level of
the semantics only (§2.1), defer the label-accessor spelling to the field-expression design
([#700](https://github.com/gofish-graphics/gofish-graphics/issues/700), §3.1), and split
the label plumbing out as
[#706](https://github.com/gofish-graphics/gofish-graphics/issues/706).

## 1. Where the language is today

Mechanics established by code reading (2026-07-08), so the design rests on what actually
happens rather than on the strata as advertised:

- **Refs are placement stand-ins, not geometry.** `GoFishRef.layout()` (`src/ast/_ref.tsx`)
  walks both parent chains to the least common ancestor and sets its own translate to
  `upwardTranslate − downwardTranslate` — exactly the offset that makes the ref coincide
  with the selected node's already-solved absolute position. It proxies the selected node's
  `intrinsicDims` verbatim and lowers to nothing. Anchoring is baked into ref layout; there
  is no separate anchoring pass. This works whenever the referencing composite lays out
  _after_ the referenced chart (sibling order inside `layer([...])` guarantees it today).
- **Refs are double-counted, in both folds.** Pre-layout, `GoFishRef.resolveUnderlyingSpace()`
  proxies the selected node's space into `distributeSpaceFold`/`alignSpaceFold` — no
  special case anywhere. Post-layout, the layer bbox union (`layer.tsx`) includes every
  child's dims, ref included. So the mixed idiom counts the anchor once where it was placed
  and again where it is borrowed.
- **Constraints don't special-case refs by type — they special-case by placement state.**
  `isInitiallyPlaced` (`placementLowering.ts`) is "does this child have a resolved position
  after its own layout," which a ref satisfies by construction. Pinned operands act as
  align baselines and are never moved; distribute skips chain relations between two
  already-placed neighbors. This machinery is fully shared with operators — it _is_ the
  fold `spread` uses via its elaboration.
- **Connectors: no advance claim, box = drawn path.** `line`/`ribbon` wrap `connect`.
  `connect.resolveUnderlyingSpace` returns `[UNDEFINED, UNDEFINED]` regardless of children,
  and its `intrinsicDims` — computed at layout time from the connected boxes — **does**
  enter the parent's post-layout union. So the connector already reports exactly its drawn
  ink upward, which is the behavior the model should predict, not a special case it must
  excuse. (The shapes-vs-derived-marks question this touches is [[shapes-vs-marks]].)
- **Labels are invisible to layout entirely.** `.label()` stashes a spec on the node;
  geometry is computed at _lowering_ time (`renderLabel.tsx`), after all layout is
  finished, from final dims, with no write-back. Consequence: a label's ink is in **no box
  anywhere** — see §2.1 for why that is the real "overflow" problem. `minSpace` is a fit
  heuristic (inside vs. outside, show vs. hide), not a space reservation. Separately,
  `resolveLabelText` reads `datum[0][field]` for grouped data — first row, never an
  aggregate — even though the mark's size channel aggregates the same group via
  `inferSize`/`sumBy`; that duplication is now
  [#700](https://github.com/gofish-graphics/gofish-graphics/issues/700)'s problem (label
  accessors as field expressions).

## 2. Semantics

Two different questions get asked of a node, at two different times, and conflating them is
what made earlier drafts of this essay confusing. Stating them separately:

**Before layout — "how much space do you want?"** The solver collects size claims from
children and divides space (the σ solve). Only things that exist before placement can
answer. A fresh data mark can. A ref must not (its node already answered at home). Derived
ink — a connector's path, a label anchored to a bar's top — **cannot**, even in principle:
its geometry is a function of the very placements this solve is about to produce. Asking it
would be circular. So:

```
claim(arrangement) = ⊔ claim(fresh data-born operands)        refs, derived ink: nothing
```

**After layout — "what box do you actually occupy?"** Each node reports its extent; parents
union child boxes; the outermost box is what a frame wraps and what the root sizes the SVG
by. Everything drawn belongs in here exactly once:

```
box(arrangement) = ink(arrangement) ∪ ⋃ box(fresh operands)   refs: nothing
```

The `ink` term is the "implicit drawn child": at the semantic level a connector is
`line[ref, ref, ink]` and the ink is a fresh operand like any other — which is why its box
is the drawn path. (Implementation keeps ink as the node's own `intrinsicDims`, as
`connect` does today; the implicit child is a modeling device, not a node.)

Checking the table's rows against the two equations: all-fresh `spread` — claims and box
are the children's, as today. Constraints — no fresh operands, no ink, so nothing either
time, as today. Connectors — nothing before (already true: `UNDEFINED`), the path after
(already true: `intrinsicDims`). The mixed row — the fresh label text claims and boxes; the
ref does neither. Only the mixed row disagrees with the current implementation, and only
about refs. Three of four rows are theorems of equations the fourth row needs anyway.

One distinction to keep sharp (it is where implementation care concentrates, §4): "refs
contribute nothing **upward**" does not mean the arrangement can't **read** them. The
internal solve of `spread([d[0], text])` still reads the ref's dims to position the text
relative to it — placement input, not claim output. The pinned-baseline machinery already
lives on exactly this side of the line.

### 2.1 What "overflow" means, concretely

Today's `.label()` computes its text at lowering time, after every box has been folded. The
label's ink is therefore in no box: not the mark's, not the chart's, not the root's. Render
`rect({h:"count"}).label("count")` at the top of a chart and the text above the tallest bar
sits _outside the box the chart reports_ — the frame doesn't wrap it, the SVG viewport
doesn't reserve room for it, and it clips at the edge or collides with whatever sits above.

Contrast the mixed-spread spelling in `BarWithLabels`: there the label text is a real node,
laid out during the label chart's layout, so the outer layer's box union includes it and
the frame accounts for it. That is the _behavioral_ reason the story is written in the
awkward idiom at all.

The fix is not a semantic dial. Under the box equation, label ink is ink: it belongs in
`box(node)` like a connector's path does. Implementation-wise that means computing label
geometry at the _end of the owning node's layout_ instead of at lowering (§4). Then outset
labels grow the reported box (frames and roots make room; nothing clips), inset and
centered labels change nothing (they lie within the shape's box already), and the bars
themselves never move — the claims equation still excludes derived ink from the solve that
places its anchors, so there is no feedback loop. Note this is exactly the connector
precedent: `connect` computes its path at layout time and it lands in the parent's union;
labels are the only drawn ink in the system that currently skips the box fold.

### 2.2 What claims are not

Claims and boxes are pixel-space size bookkeeping. They are **not** scale domains. A value
label above a bar should make the _reported box_ taller, but must never extend the
y-scale's _domain_ — the label's height is not data. The equations only touch the size
folds; domain inference is untouched.

### 2.3 Scope

The fresh operand's geometry solves in the _composite's_ scope, not the ref's home scope.
`FlowerChart` demonstrates this today: the flower opens its own `layer({ coord: polar() })`
inside the spread, warping only the petals, while the stem ref is anchored by pure
translate reconciliation. This is the right semantics (the attachment brings its own local
coordinate world; the anchor is a point of contact, not an inherited frame).

**Latent constraint to carry forward:** ref reconciliation is translate-only
(`_ref.tsx` sums `projectedTranslate` along the LCA walk, never composing scales or
coordinate warps). If the path from ref to selected node crosses a scale-changing or
nonlinear ancestor below their LCA, the anchor lands wrong. Today's stories are safe
because the LCA sits above any coord boundary. Any blessing of the mixed idiom should
either (a) check-and-error when the path crosses a non-translate boundary, or (b)
generalize reconciliation to compose the ancestors' full transforms. Same
subtree-shaped-resolution-region question as the scoped-resolution-boundaries thread; (a)
is honest and cheap, (b) is the eventual answer.

### 2.4 Paint order

Fresh ink anchored on a ref usually wants to paint above it (labels) but sometimes below
(connectors, enclosures). Today this falls out of sibling order in the outer `layer`. The
equations don't change that, but a first-class mixed-row surface should say explicitly
where its ink goes — the same altitude question the emphasize thread
([#641](https://github.com/gofish-graphics/gofish-graphics/issues/641)) is circling, and
whatever `emphasize` decides should bind here too.

## 3. Syntax

### 3.1 Label accessors → deferred to #700

An earlier draft proposed `field("count").sum()` as a label accessor here. Maintainer call:
this belongs to the field-expression design
([#700](https://github.com/gofish-graphics/gofish-graphics/issues/700) — Polars-style
pipelines on `field(...)`, `.sort()` on domains, `.normalize()` on measures). Contributed
there: labels are one more field slot accepting `string | Field`, and aggregations
(`.sum()`, `.mean()`, `.distinct()`) are pipeline stages, group-relative with the node's
datum as the default window — the same windowing story as `.normalize({over})`. That lands
`BarWithLabels` as `rect({h:"count"}).label(field("count").sum(), {position:"outset-top"})`
whenever #700 does, and retires the `resolveLabelText`-vs-`inferSize` duplication as a side
effect. Not tracked further in this essay.

### 3.2 One polymorphic combinator

Maintainer preference: **one combinator, polymorphic over operand kind** — not separate
named constructs per row. The table in the opening is then a description of
_instantiations_, and what varies per combinator is only its **operand-kind signature**:

- `spread` / `stack` (/ `scatter`?): admit every row. All-fresh is today's operator;
  all-refs is a constraint; mixed is the attachment idiom.
- `align` / `distribute`: the **refs-only surface** of the same machinery — they are
  literally what `spread` elaborates to, and their implementation is already generic over
  placement state. Under the one-combinator view they are the projections of `spread` onto
  the constraint row.
- `line` / `ribbon`: refs-plus-ink. Their signature says "operands must be placed; I add
  the drawn child myself." (Mechanically `connect` accepts fresh children too; whether that
  is meaningful or should be closed off is an open question below.)

The attractive payoff of letting `spread` occupy the constraint row explicitly:

```ts
layer([bars, labels]).constrain(({ bars, labels }) => [
  spread({ dir: "x", spacing: 12, alignment: "middle" }, [bars, labels]),
]);
```

replaces an `align` + `distribute` pair, and the eight parity-exempt
`Constraints.stories.tsx` equivalence stories stop being _demonstrations_ that
`spread ≡ align ∘ distribute` and become _definitionally_ true — the two-panel stories
could collapse to one chart each (which would also un-exempt them).

The recorded worry — "if spread is a constraint maybe the specs start to look weird" — is
real and worth naming precisely. In `.flow()` position, `spread` reads as _traverse the
data and make structure_ (an arrow on data). In `.constrain()` position it would read as
_relate things that already exist_ (an arrow on nodes). Same math, opposite reading
direction, one name. Two mitigations to weigh:

1. **The operand kind is visible at the call site.** In constrain position the children are
   named refs from the destructured scope; in flow position there are no children at all
   (data supplies them). A reader never actually faces an ambiguous instance — the
   weirdness is in the concept count, not in any concrete spec.
2. **Keep the boundary at `constrain`.** The genuinely weird spelling would be
   flow-over-a-selection — `chart(selectAll("bars")).flow(spread(...))` meaning
   "redistribute those bars." Flow implies traversal and ownership of created structure; a
   selection supplies no rows to traverse and no fresh nodes to own, and a `spread` that
   _moves_ the selected nodes is a second scope claiming placement authority over nodes
   owned elsewhere. (Selections in flow position stay what they are today: data-shaping —
   `group`, `resolve` — not placement.) Restricting the constraint instantiation to
   `.constrain()` and the mixed instantiation to explicit child lists keeps each surface
   single-reading while the semantics stay unified underneath.

**`align`/`distribute` are not retired.** Pushing on the maximalist one-name option
resolves it: align-_only_ and distribute-_only_ constraints are real (the ported
`AlignOnly`/`DistributeOnly` stories), and `spread` is inherently the composition — it
always distributes along `dir` — so expressing a lone half as a `spread` needs either an
opt-out mode or meaningful option-omission, both worse than the named halves. So: the atoms
stay public; `spread` additionally becomes legal in constrain position as the spelling for
the composed case. The only genuinely deferrable lexical question is which spelling the
docs teach for the composed case — decidable late, with real specs side by side, because
both denote the same fold.

### 3.3 The mixed row and mark-valued content (later)

`FlowerChart`'s flower is not an annotation of the stem; it is a data glyph co-located with
it (a per-group petal fan). Under the model it is an honest mixed arrangement whose fresh
operand happens to be a subchart over the group's rows. Two observations for when this is
taken up:

- The _content_ function `(rows) => layer({coord: polar()}, [stackX(..., rows.map(petal))])`
  consumes plain rows, not refs — exactly the nested-chart pattern that already crosses the
  Python derive RPC (it is how `FacetedChart` and the atom stories were ported in
  [#703](https://github.com/gofish-graphics/gofish-graphics/pull/703)). Once anchoring is
  the arrangement's job rather than `spread(..., [d[0], ...])`'s, the remaining function is
  bridgeable as-is.
- So mark-valued attachment content requires _no new bridge machinery_ — only a mixed-row
  surface whose anchor is implicit (the selected node) rather than embedded (`d[0]`). This
  is the strongest argument that
  [#591](https://github.com/gofish-graphics/gofish-graphics/issues/591)'s `{__inputRef}`
  ref-wrapping RPC is the wrong investment: in every exempt story the ref crosses the
  bridge only to serve as an anchor, and the anchor is the arrangement's business.

Simple text labels on marks are _not_ blocked on any of this: multi-label and text-style
plumbing is split out as
[#706](https://github.com/gofish-graphics/gofish-graphics/issues/706) (kills
`ImageCutWithLabels` — its four constraints are literally the positions `outset-right` and
`center`).

## 4. Implementation

Ordered by independence; each lands separately and is pixel-gated (`capture-diff`, plus the
parity suite for anything touching IR). Work items 3–5 are tracked by
[#707](https://github.com/gofish-graphics/gofish-graphics/issues/707).

1. **Label plumbing (#706, S).** Multiple labels per mark, `fontWeight`/`fontFamily`
   passthrough. Rewrites `ImageCutWithLabels` (JS re-spelling + re-baseline, then Python
   port). No semantic content.
2. **Label accessors (deferred, #700).** Lands with field expressions; rewrites
   `BarWithLabels` when it does.
3. **Stop double-counting refs (M).** Make refs contribute nothing _upward_ while staying
   readable _internally_. Two code sites: `GoFishRef.resolveUnderlyingSpace` (stop proxying
   the selected node's space into the parent-facing fold) and the layer box union (exclude
   ref dims). The care point is the internal/upward distinction from §2: the pinned-baseline
   reads and the arrangement's own positioning of fresh children relative to the ref must
   keep working — they read placement state, which remains set. Existing mixed-idiom
   stories (`FlowerChart`, `BarWithLabels` pre-rewrite, `SpeciesCountPerLake`) may shift if
   the double-counted extent was load-bearing for framing — audit with `capture-diff`,
   accept intended shifts explicitly. Also add the translate-only guard from §2.3 (error,
   don't misplace, when a ref path crosses a non-translate boundary below the LCA).
4. **Label ink joins the box (M).** Move label geometry computation from lowering
   (`renderLabel.tsx` via `INTERNAL_lower`) to the end of the owning node's layout, and
   include it in the node's reported dims. Effect: outset labels grow the reported box, so
   frames and the root reserve room and nothing clips at the SVG edge; inset/center labels
   are already inside the box and change nothing; bar placement never moves (derived ink
   still claims nothing — §2). This is the connector precedent applied to labels: `connect`
   already computes its ink at layout time and lands in the union; labels are currently the
   only drawn ink that skips it. Requires text measurement at layout time — the same
   machinery text marks already use at measure time, so mechanical, but it changes _when_
   fonts are consulted; gate on pixels.
5. **The mixed-row surface (+ mark-valued content) (L, design-first).** The declarative
   spelling of "arrange fresh content against a selection's nodes" with the anchor
   implicit, per §3.2/§3.3. Needs the
   [#641](https://github.com/gofish-graphics/gofish-graphics/issues/641) altitude answer
   for paint order and the
   [#681](https://github.com/gofish-graphics/gofish-graphics/issues/681) claim/scope
   vocabulary settled. Unblocks `FlowerChart` (and gives `LabeledChart` a home if its
   `resolve`-driven variant returns).

**What this does to #591:** items (1)–(2) un-exempt two of its four stories with no bridge
work; item (5) covers `FlowerChart` and plausibly `LabeledChart`. Recommendation: narrow
#591 to "tracking: exempt stories whose refs cross a mark-fn," point it here, and do not
build the `{__inputRef}` RPC — every known use of a bridged ref is an anchor, and anchors
are the arrangement's job.

## 5. Open questions

1. **Where may the constraint instantiation appear?** `.constrain()` only (recommended in
   §3.2), or also flow-over-selection? The latter is where specs start reading weird — and
   where placement authority gets contested.
2. **Vocabulary end-state for the composed case** — teach `spread(opts, refs)` in constrain
   position, or the `align` + `distribute` pair? Purely lexical; decidable late with real
   specs side by side. (The atoms themselves stay public either way — §3.2.)
3. **Connectors over fresh children** — `connect` mechanically accepts them today. Under
   the model that's a mixed instantiation (it would own their placement?), which is not
   what `connect` does. Decide whether to close the signature to refs-plus-ink or define
   the fresh case.
4. **Is there ink that should _not_ join the box?** Dense annotation layers might prefer to
   overflow by design. No known story needs it; leave the box rule total until evidence
   shows up (then it's a per-label option, not a semantic fork).
5. **Multi-label surface shape** — repeated `.label()` vs. labels array; interacts with IR.
   Tracked in [#706](https://github.com/gofish-graphics/gofish-graphics/issues/706).
6. **Cross-scope anchoring** — error on non-translate ref paths now (§2.3); the real fix
   composes full transforms along the LCA walk. Same machinery the
   scoped-resolution-boundaries thread needs; do they share an implementation?
