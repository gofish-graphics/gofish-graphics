---
title: The Monotonic Module
section: Layout & Rendering
order: 61
group: Scale Resolution
status: draft
covers:
  - packages/gofish-graphics/src/util/monotonic.ts
---

# The Monotonic Module

The monotonic module is a small algebra of **monotonically increasing functions**.
It exists so the layout engine can reason about how data flows into pixels
_symbolically_ — without sampling, and often without running the function at all.

## Why GoFish needs it

A GoFish chart is, underneath, a tree of nested transformations. A bar's height is
some function of a datum; that bar sits inside a stack, which sits inside a frame, each
contributing its own scaling and offset. To lay the chart out, the engine needs to
answer questions like _"how does this subtree's size depend on the data domain?"_ and
_"is this subtree data-driven at all?"_

If every transformation were an opaque `number => number`, the only way to answer those
questions would be to **sample**: run the function at many inputs and inspect the
outputs. That is slow and imprecise. But chart transformations are overwhelmingly
_affine_ — `y = slope · x + intercept` — and affine functions compose, add, and scale
into other affine functions. The monotonic module captures exactly that structure: it
keeps the closed form whenever it can, and falls back to a numeric function only when
it must.

## The three shapes

Every monotonic value is one of three kinds. All can be _run_ forwards and _inverted_;
they differ in how much the engine knows about them.

```ts twoslash
// The shared interface — every monotonic value can do this much.
type Monotonic = {
  kind: "linear" | "piecewise" | "unknown";
  run: (x: number) => number;
  inverse: (y: number) => number | undefined;
};

// A LINEAR value additionally exposes its closed form...
interface Linear extends Monotonic {
  kind: "linear";
  slope: number;
  intercept: number;
}

// A PIECEWISE value is a convex envelope — the max of several lines...
interface Piecewise extends Monotonic {
  kind: "piecewise";
  pieces: { slope: number; intercept: number }[];
}

// ...while an UNKNOWN value is just a numeric black box.
interface Unknown extends Monotonic {
  kind: "unknown";
}
```

A `Linear` carries its `slope` and `intercept` explicitly. Running it is one multiply
and one add; inverting it is closed-form, with the single special case that a
zero-slope line has no inverse:

```ts twoslash
interface Linear {
  kind: "linear";
  slope: number;
  intercept: number;
  run: (x: number) => number;
  inverse: (y: number) => number | undefined;
}
declare function linear(slope: number, intercept: number): Linear;
// ---cut---
const f = linear(2, 1); // y = 2x + 1
f.run(3); // 7
f.inverse(7); // 3 — solved directly, no search
```

Plotted, a `Linear` is just a straight line:

::: gofish example:internal-monotonic-linear hidden
:::

A `Piecewise` carries a list of lines and represents their **upper envelope**,
`max_i(slopeᵢ · x + interceptᵢ)`. Because the lines all rise (non-negative slopes), the
envelope is a convex, increasing, bent function. `run` takes the max of the pieces;
`inverse(y)` is still closed-form — the envelope first reaches `y` at the _smallest_ σ
at which any rising piece does, `min_i (y − interceptᵢ)/slopeᵢ` (with a check that a
constant floor isn't holding the value above `y`). A `Piecewise` is normalized on
construction: dominated lines are pruned, and a lone survivor collapses back to `Linear`,
so only genuinely bent envelopes carry `kind: "piecewise"`.

An `Unknown` only has the numeric function. It can still be inverted, but inversion
falls back to numeric root-finding (`findTargetMonotonic`) — correct, because the
function is monotonic, but iterative.

## The algebra

The point of the module is that the four combinators below are **closed over the
piecewise-linear functions** (`Linear` ∪ `Piecewise`): combine PWL inputs and you get a
PWL output, in closed form. Only when an `Unknown` enters the mix does the result degrade
to `Unknown`. This is the convex piecewise-linear normal form of the (max, +) algebra —
the same algebra the layout engine composes constraints in (see
[Constraints as the core](/internals/design/constraints-as-core)).

| Combinator   | Meaning               | Stays closed-form (PWL) when… |
| ------------ | --------------------- | ----------------------------- |
| `add(...fs)` | sum of functions      | no argument is `Unknown`      |
| `smul(k, f)` | scalar multiple       | `f` is not `Unknown`          |
| `adds(f, k)` | add a constant offset | `f` is not `Unknown`          |
| `max(...fs)` | pointwise maximum     | no argument is `Unknown`      |

`max` is the structural one: the pointwise max of lines is their envelope, so it simply
**unions the pieces**. `add` stays closed because the sum of two envelopes is again an
envelope — `(max_i aᵢ) + (max_j bⱼ) = max_{i,j}(aᵢ + bⱼ)` — i.e. the pairwise sums of the
pieces. (When every argument is a single line, both fall back to the plain `Linear` fast
path; the all-linear `add` is one slope-sum and one intercept-sum.)

Because the structure is preserved, a composed claim can be **printed as the equation it
represents** — `print` renders `40σ + 16`, or `max(160σ + 16, 90)` for an envelope —
matching the forms in the [layout synthesis essay](/internals/design/layout-synthesis).

## Slope as a data-driven signal

Because a `Linear` exposes its slope, the engine gets a cheap, exact predicate for
free: **a subtree is data-driven only if its slope is non-zero.**

```ts twoslash
interface Linear {
  kind: "linear";
  slope: number;
  intercept: number;
}
interface Piecewise {
  kind: "piecewise";
  pieces: { slope: number; intercept: number }[];
}
type Monotonic = Linear | Piecewise | { kind: "unknown" };
declare const isLinear: (x: Monotonic) => x is Linear;
declare const isPiecewise: (x: Monotonic) => x is Piecewise;
// ---cut---
// A constant subtree — every slope 0 — does not depend on the data at all.
const isConstant = (x: Monotonic): boolean =>
  (isLinear(x) && x.slope === 0) ||
  (isPiecewise(x) && x.pieces.every((p) => p.slope === 0));
```

By monotonicity, slope can never decrease as contributions accumulate, so a total slope
of zero means _every_ contribution was zero. `isConstant` and `isZero` use this to
prune non-data-driven subtrees from domain inference entirely — see
[Underlying Space](/internals/core/underlying-space) and
[Layout & Render Passes](/internals/layout/passes).

## Reference

The full generated type reference for every export lives at
[Type Reference → Monotonic](/internals/api/type-aliases/Monotonic). It is produced by
TypeDoc from the source and regenerated on every docs build.
