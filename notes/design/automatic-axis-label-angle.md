# Automatic axis label angle

**Status:** design note (2026-07-16). Focused first client of the choice-based layout work in
issue #486. Builds on the manual `labelAngle` implementation from #746 and the boundary-summary
model in [silhouette-interface](./silhouette-interface.md).

## 1. Decision

Add `labelAngle: "auto"` as an automatic spelling alongside the existing manual number and
per-tier array forms:

```ts
chart(data, {
  axes: { x: { labelAngle: "auto" } },
});
```

For one authored `"auto"` ordinal axis, measurement considers exactly three alternative
layouts:

1. all label tiers at 0°;
2. all label tiers at 45° clockwise on screen;
3. all label tiers at 90° clockwise on screen.

The three alternatives are created during abstract measurement, before the enclosing scale
scope resolves σ. Each alternative carries its own frame claim. The scope solver resolves each
claim independently, so alternatives may receive different σ values. The realized alternatives
are then measured for label collisions, ranked by the fixed policy in §5, and reduced to one
placement plan. Only that selected plan reaches the mutating placement pass.

The first release supports ordinal category-label axes only. Continuous and difference axes keep
their existing manual `labelAngle` behavior; requesting `"auto"` for one is an explicit unsupported
configuration error. Those axes will likely need a different candidate-generation and resolution
strategy, so this design does not prejudge it.

This feature deliberately does **not** introduce a public `choice` operator, a pluggable cost
factory, arbitrary candidate angles, label thinning, or a general-purpose frontier type in the
public API. It should, however, use internal shapes that can later be factored into those more
general mechanisms without changing the semantics specified here.

## 2. Motivation

Manual `labelAngle` solved the immediate grouped-bar-chart problem in #746, but it asks the
author to choose an angle for one render size. The right angle for ordinal category labels changes
when the same chart is shown as a full-size figure, a narrow documentation example, or a
thumbnail:

- 0° is easiest to read when labels fit;
- 45° preserves a mostly horizontal reading direction while reducing track-axis width;
- 90° is the compact fallback for very narrow slots.

The choice is geometric rather than syntactic. It depends on measured glyph boxes, category-key
anchor positions, the proposed frame, and the scale factor that each candidate frame admits.
Axis elaboration runs before those quantities are final, while placement is too late because it
must receive one committed geometry. The natural home is therefore the abstract measurement
stage between elaboration and placement, with σ resolution lifted over the alternatives.

## 3. Existing behavior that must remain unchanged

Today `AxisOptions.labelAngle` accepts:

```ts
labelAngle?: number | number[];
```

A number applies to every tier. An array is indexed from the innermost ordinal tier outward.
Angles are authored clockwise on screen. The axis elaborator converts an authored angle into a
`LabelRotation` containing:

- the frame-resolved `Text.rotate` value;
- the track-axis anchor (`"middle"` or `"baseline"`);
- the text anchor (`"start"` or `"end"`).

The conversion implements the existing hanging-point rule:

| authored angle | track anchor | text anchor |
| -------------- | ------------ | ----------- |
| 0°             | middle       | start       |
| 45°            | baseline     | start       |
| 90°            | middle       | start       |

Frame flipping may negate the value handed to `Text`, but it must not change the authored
screen-clockwise result. The auto candidates use this same conversion; they are not a second
rotation implementation.

Manual values keep exact precedence and behavior:

- `undefined` means the current unrotated behavior, not auto;
- a number remains an unconditional manual angle;
- a number array remains an unconditional per-tier specification;
- `"auto"` is the only spelling that creates alternatives.

The first release does not allow `"auto"` inside a per-tier array. A scalar `"auto"` chooses one
angle for the whole authored ordinal axis, applying it uniformly to every tier, just as a scalar
number does. This keeps the first candidate set at exactly three layouts. Per-tier independent
choice would create `3^n` combinations and should be considered only after the three-layout
version is understood.

## 4. Candidate semantics

An automatic ordinal axis contributes an axis-local measurement choice. The content subtree is
shared; the alternatives describe three ways to measure and later place labels attached to the
same category keys. They do not duplicate the chart data marks.

The implementation should start with a feature-local representation rather than a generic
framework:

```ts
type AutoLabelAngle = 0 | 45 | 90;

type AxisLabelPlan = {
  authoredAngle: AutoLabelAngle;
  rotationsByTier: LabelRotation[];
};

type AxisLabelCandidate = {
  plan: AxisLabelPlan;
  frameClaims: [
    Monotonic.Monotonic | undefined,
    Monotonic.Monotonic | undefined,
  ];
  resolve: (scales: Size<AxisScale | undefined>) => ResolvedAxisLabelCandidate;
};

type ResolvedAxisLabelCandidate = {
  plan: AxisLabelPlan;
  scales: Size<AxisScale | undefined>;
  labelBoxes: MeasuredLabelBox[][]; // tier, then label in track order
  silhouette: Box;
  score: AxisLabelScore;
};
```

These names are illustrative, not a requirement to publish a new module with exactly these
types. The important boundaries are:

- the pre-solve candidate contains a frame claim and a placement plan;
- the scale scope solves each candidate independently;
- text and collision measurement are pure and use the candidate's solved scales;
- the selected plan, not the whole frontier, crosses into placement.

The box is sufficient as this feature's silhouette. A later generic choice implementation can
replace `Box` with a type parameter satisfying the silhouette laws without changing the three
candidate semantics.

### 4.1 Domain restriction

All three alternatives must expose the same ordinal domain, measure, keys, and reference names.
They may differ only in geometric claims and the resulting scales, boxes, and placement plan. If
candidate construction ever produces different semantic domains, that is an internal error.

This restriction keeps axis choice independent of domain inference and category-key discovery.
It still permits different σ values elsewhere in the enclosing frame: the same ordinal domain
may be composed with three different geometric frame claims.

### 4.2 Alternative-specific σ

For candidate `a` on one axis, let its frame claim be `f_a(σ)` and the enclosing allocation be
`W`. Resolution computes:

```text
σ_a = inverse(f_a, W)
```

The candidate is infeasible if its required scope equation cannot be solved under the usual
scope-solver rules. Equal-measure recentering and any other scope-level post-solve adjustment
must be applied per candidate before collision measurement. There is no shared σ unless the
three frame claims happen to resolve to the same value.

Under the current axis-chrome accounting, the three label alternatives may initially have the
same frame claim and therefore the same σ. The implementation must not rely on that coincidence:
the API between measurement and the scope solver should still carry claims per candidate. A
solver unit test with candidate-dependent constant padding should demonstrate that distinct
claims produce distinct σ values and that selection retains the winning candidate's σ.

## 5. Selection policy

Selection uses one fixed lexicographic score. This is intentionally narrower than a public cost
factory:

```ts
type AxisLabelScore = readonly [
  overlapArea: number,
  collidingPairs: number,
  angleRank: 0 | 1 | 2,
  crossExtent: number,
];
```

Lower is better. `angleRank` is 0 for 0°, 1 for 45°, and 2 for 90°.

The ordering means:

1. any collision-free layout beats every colliding layout;
2. if all layouts collide, prefer the one with the least total overlap area, then the fewest
   colliding adjacent pairs;
3. among collision-free layouts, prefer the smallest rotation, preserving readability;
4. use occupied cross-axis extent only as a final geometric tie-break.

This policy always selects a candidate. Collision is not an unsatisfiable hard constraint in the
first release because all three angles can still collide for extremely dense or long labels.
Treating collision as the leading zero-or-positive cost preserves the desired hard-constraint
behavior whenever a valid candidate exists while giving a deterministic least-bad fallback.

### 5.1 Collision measurement

Measure each label as an anchor-relative rotated axis-aligned box using the same font metrics,
rotation matrix, and hanging point that `Text` placement will use. Translate those boxes to their
abstract category-key anchors for the candidate. No `GoFishNode` bbox ledger or transform may be
written during this computation.

Within each tier:

- sort labels in track order;
- compare adjacent boxes after expanding each by a small fixed clearance
  `AUTO_LABEL_GAP` (initially 2 px) on the track axis;
- count pairs whose expanded boxes have positive two-dimensional intersection;
- sum the unexpanded intersection areas for `overlapArea`.

Only adjacent labels are required because axis anchors are ordered and label boxes are connected
rectangles along the track. A debug assertion may compare the result with an all-pairs sweep in
development builds while this assumption is validated.

Collision scores sum across tiers. Boxes from different tiers are not compared with one another:
the tier layout deliberately separates those rows/columns on the cross axis, and their combined
cross extent is already represented by the candidate silhouette.

## 6. Pipeline placement

The desired pass ordering is:

```text
axis ownership and ordinal key discovery
→ axis elaboration records an unresolved auto-label specification
→ underlying-space/domain resolution
→ abstract measurement creates the 0°/45°/90° candidates
→ enclosing σ-scope solves each candidate's frame claims
→ each candidate measures concrete label boxes with its own scales
→ score and select one AxisLabelPlan
→ placement applies only the selected plan
→ lowering renders the selected Text rotations
```

The essential invariant is:

> Measurement may construct, solve, and discard alternatives, but it must not commit node
> geometry. Placement sees exactly one plan and preserves the current write-once bbox-ledger
> discipline.

At the root, this requires lifting the existing single frame solve over the three candidates
before `child.layout`. Nested self-scaled/shared/constraint-budget scopes need the same behavior
at their existing scope boundary. The first implementation may use a three-element axis-specific
loop; it need not introduce a repository-wide `Frontier<T>` abstraction merely to remove three
lines of duplication.

## 7. Ordinal-axis elaboration strategy

Manual ordinal-axis elaboration already represents each category label separately from the key
node it tracks. Its alignment constraint can assign the label and key different anchors: an
oblique label uses `"baseline"` while the tracked key remains `"middle"`; 0° and 90° use
`"middle"` for both. The three auto alternatives therefore share one structural topology. They
differ only in the label rotation, text anchor, and the label side of the heterogeneous alignment
constraint.

For auto mode, ordinal-axis elaboration should retain angle-independent key metadata plus an
unresolved `AxisLabelPlan`. Measurement evaluates the three plans; the winner supplies the
concrete `rotate`, `textAnchor`, and label alignment anchor before placement. The key node and its
`"middle"` anchor never vary.

Do not duplicate the content subtree or build three concrete ordinal-axis trees and hide two
during lowering. Both approaches would make names, refs, and mutable placement state
alternative-dependent.

Reuse `resolveLabelRotation`; the table in §3 must have one source of truth for manual and
automatic ordinal angles. Continuous/difference axis elaboration is unchanged and remains
outside auto resolution.

## 8. Text measurement extraction

`Text.layout` currently performs both pure font/bbox measurement and placement-facing node
layout. Extract the pure portion so auto-axis measurement and `Text.layout` call the same helper:

```ts
type MeasuredText = {
  layout: TextLayout;
  relativeBox: RelBBox;
};

function measureText(spec: TextMeasureSpec): MeasuredText;
```

`TextMeasureSpec` contains text, font properties, text anchor, dominant baseline, and rotation.
The helper must use the existing DOM canvas metrics when available and the same SSR fallback.
It returns an anchor-relative box and performs no node writes. `Text.layout` then becomes a
consumer that converts this result into `intrinsicDims`, `transform`, and `renderData`.

This extraction is part of the feature, not a general measurement-pass rewrite. Other marks keep
their current layout implementations.

## 9. Public API and serialization

The TypeScript API becomes:

```ts
labelAngle?: number | number[] | "auto";
```

The frontend IR serializes the literal string unchanged:

```json
{ "axes": { "x": { "labelAngle": "auto" } } }
```

Python accepts the corresponding string:

```py
gf.chart(data, axes={"x": {"labelAngle": "auto"}})
```

Because this is a cross-language public option, JS serialization, Python reconstruction, API
docs, and at least one JS/Python parity story must land in the same change. Manual numeric and
array round trips remain unchanged.

Invalid strings should fail at the normal API/IR validation boundary. Do not silently interpret
unknown strings as 0°.

After underlying-space resolution identifies the owned axis kind, `"auto"` on a continuous or
difference axis must fail with a clear message such as `labelAngle: "auto" is currently supported
only for ordinal axes`. It must not silently choose 0° or enter the manual continuous-axis path.

## 10. Verification

### 10.1 Pure unit tests

Add unit tests for:

- candidate construction produces exactly `[0, 45, 90]` in that order;
- score ordering chooses 0° when all candidates fit;
- score ordering chooses 45° when 0° collides and 45°/90° fit;
- score ordering chooses 90° when it is the only collision-free candidate;
- all-colliding input chooses the minimum-overlap candidate deterministically;
- rotated measurement matches `Text.layout`'s bbox for 0°, 45°, and 90°;
- y-up/frame-flipped axes still produce the authored clockwise screen angle;
- three distinct frame claims are independently inverted and the winner retains its own σ;
- candidate evaluation leaves node bbox ledgers and transforms untouched.

The score tests should use synthetic boxes and anchors, not browser font metrics.

### 10.2 Integration and visual tests

Extend the grouped city/year axis permutation story that motivated #746 with:

- a wide render selecting 0°;
- a medium render selecting 45°;
- a narrow render selecting 90°;
- an extremely narrow render where all candidates collide, pinning the least-bad fallback;
- a two-tier ordinal axis proving scalar auto applies one shared selected angle;
- an ordinal y-axis case;
- a y-up or continuous-y frame-flip case.

Record the selected authored angle in normalized debug output or a test-only inspection hook so
tests assert the decision directly rather than inferring it only from pixels.

Run the normal verification gates:

```bash
pnpm --filter gofish-graphics typecheck
pnpm --filter gofish-graphics test
pnpm --filter @gofish/tests test:js
pnpm --filter @gofish/tests test:python
pnpm --filter docs docs:build
```

Use `pnpm capture-diff <base-ref> axes` to confirm that charts without `"auto"` are geometrically
unchanged.

## 11. Staged implementation

1. Extract pure text measurement and prove manual text/rotation output is unchanged.
2. Add the feature-local candidate and score types with synthetic-box tests.
3. Teach `AxisOptions`, frontend IR, and Python reconstruction to preserve `"auto"`.
4. Make auto axis elaboration retain a deferred label plan.
5. Lift the relevant σ-scope solve over the three candidates and select one plan before
   placement.
6. Add visual/parity stories and documentation.
7. After the implementation has shipped, evaluate whether the feature-local three-candidate
   loop should be extracted into the generic choice/silhouette machinery from #486.

Steps 1–5 should remain separable commits where practical. In particular, the text-measurement
extraction should be behavior-preserving and reviewable without the choice policy mixed in.

## 12. Deliberate non-goals and future generalization

The first version does not include:

- arbitrary angle lists;
- negative-angle candidates;
- independent per-tier auto selection;
- automatic angles for continuous or difference axes;
- label thinning or ellipsis;
- user-defined cost factories;
- contour or non-box silhouettes;
- choices whose alternatives change data domains;
- a public `choice`/`alt` operator.

The local design leaves clean future seams:

- `AxisLabelCandidate.frameClaims` can become the claim component of a generic measured
  alternative;
- `Box` can become a generic silhouette;
- `AxisLabelScore` can become one lawful cost-algebra instance;
- the three-element scope loop can become frontier resolution;
- `AxisLabelPlan` demonstrates the certificate boundary: selection emits an abstract plan and
  ordinary placement realizes it once.

Label thinning is the most likely next axis-specific extension. It should be added as additional
plans in the same measurement choice, not as a paint-time omission. Independent per-tier angles
should wait until there is evidence that the extra combinations improve real charts enough to
justify a larger frontier.

## 13. Open questions to settle during implementation

1. Do current axis-label boxes participate in the σ-producing frame claim, or do all three
   candidates initially share σ because labels are accounted as chrome overhang? Either result is
   acceptable, but the per-candidate solver interface and distinct-claim unit test are required.
2. Is adjacent-pair collision sufficient for every supported axis ordering, including reversed
   and nested ordinal axes? Keep the development all-pairs assertion until visual coverage answers
   this.
3. Should `AUTO_LABEL_GAP` remain an internal constant or eventually become an axis option? Keep
   it internal for this feature.

None of these questions changes the public semantics: three whole-axis alternatives, resolved
during measurement with candidate-specific scales, ranked by collisions first and rotation
second, with one selected plan entering placement.
