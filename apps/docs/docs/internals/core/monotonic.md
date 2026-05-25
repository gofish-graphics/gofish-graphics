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

## The two shapes

Every monotonic value is one of two kinds. Both can be _run_ forwards and _inverted_;
they differ in how much the engine knows about them.

```ts twoslash
// The shared interface — every monotonic value can do this much.
type Monotonic = {
  kind: "linear" | "unknown";
  run: (x: number) => number;
  inverse: (y: number) => number | undefined;
};

// A LINEAR value additionally exposes its closed form...
interface Linear extends Monotonic {
  kind: "linear";
  slope: number;
  intercept: number;
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

::: starfish example:internal-monotonic-linear hidden
:::

An `Unknown` only has the numeric function. It can still be inverted, but inversion
falls back to numeric root-finding (`findTargetMonotonic`) — correct, because the
function is monotonic, but iterative.

## The algebra

The point of the module is that the four combinators below are **closed over `Linear`**:
combine linear inputs and you get a linear output, with its slope and intercept
computed directly. Only when an `Unknown` enters the mix does the result degrade to
`Unknown`.

| Combinator   | Meaning               | Stays `Linear` when…                           |
| ------------ | --------------------- | ---------------------------------------------- |
| `add(...fs)` | sum of functions      | every argument is `Linear`                     |
| `smul(k, f)` | scalar multiple       | `f` is `Linear`                                |
| `adds(f, k)` | add a constant offset | `f` is `Linear`                                |
| `max(...fs)` | pointwise maximum     | all args are `Linear` _and share an intercept_ |

`max` is the interesting one. The pointwise max of two lines is generally a bent
piecewise function — _not_ linear. But if the lines share an intercept they fan out
from a common point, so their max is just the steepest line. That is the only case
`max` can keep in closed form; otherwise it returns an `Unknown`.

## Slope as a data-driven signal

Because a `Linear` exposes its slope, the engine gets a cheap, exact predicate for
free: **a subtree is data-driven only if its slope is non-zero.**

```ts twoslash
interface Linear {
  kind: "linear";
  slope: number;
  intercept: number;
}
type Monotonic = Linear | { kind: "unknown" };
declare const isLinear: (x: Monotonic) => x is Linear;
// ---cut---
// A constant subtree — slope 0 — does not depend on the data at all.
const isConstant = (x: Monotonic): boolean => isLinear(x) && x.slope === 0;
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
