---
title: Piecewise-Linear Values
section: Layout & Rendering
order: 61
group: Scale Resolution
status: draft
covers:
  - packages/gofish-graphics/src/ast/solver/pwl.ts
  - packages/gofish-graphics/src/ast/solver/arith.ts
---

# Piecewise-Linear Values

A size claim says how much room a node needs on an axis, as a function of its scope's
scale factor σ (pixels per data unit). The `pwl` module is the algebra those functions
are written in. Every value is **piecewise linear in σ**: a line, or a few lines joined
end to end. The algebra is closed, so a claim composed from many children keeps its
closed form. The engine can print it as an equation and solve it for σ exactly, without
sampling.

The module is a port of the value algebra of the symbolic layout kernel prototype
(`affine.ts` and `piecewise.ts`), which #1176 is bringing into GoFish. It replaced the
older `Monotonic` module, whose piecewise case was the max of lines.

## Why GoFish needs it

A bar of value 30 claims `30σ` pixels. A spread of three such bars with 8 px between them
claims `(30 + 50 + 20)σ + 16`. A label beside a bar claims a constant. The root
solves `claim(σ) = allocated` once, and every node then reads its size off its claim at
that σ. If the claims were opaque `number => number` closures, the solve would have to
search, and nothing could tell whether a subtree depends on the data at all. With
closed forms, both questions are answered by looking at slopes.

## The values

```ts twoslash
// A line: slope·σ + intercept.
type Affine = { kind: "affine"; slope: number; intercept: number };

// A line on σ in [from, to].
type Segment = { from: number; to: number; slope: number; intercept: number };

// A function of σ ≥ 0 that is a line on each segment. The segments are in
// order, start at 0, meet end to end, and run to ∞.
type Piecewise = { kind: "piecewise"; segments: Segment[] };

// An opaque function of σ, from a probe solve (see "Closures" below).
type Closure = { kind: "closure"; run: (sigma: number) => number };

type Value = Affine | Piecewise | Closure;
```

Values are plain data, and the operations are free functions: `at(v, σ)` evaluates,
`solve(v, target)` inverts. A `Piecewise` is kept in normal form. Neighbors that are one
line are merged. A segment narrower than the rounding of its ends is merged into the one
before it, since two breakpoints a rounding apart are one breakpoint. A single line is
always an `Affine`, so the common case (bars, stacks, scatters) never builds segments.

σ ranges over σ ≥ 0. A scale factor is never negative: the direction of an axis is a
separate fact (see [Underlying Space](/internals/core/underlying-space)).

The claim of a fixed label next to two bars that grow at different rates bends where the
faster bar overtakes the label:

::: gofish example:internal-pwl-envelope hidden
:::

## The algebra

| Operation           | Meaning                              |
| ------------------- | ------------------------------------ |
| `add(...vs)`        | sum, segment by segment              |
| `addConstant(v, c)` | `v + c`                              |
| `scale(k, v)`       | `k·v`, for any sign of `k`           |
| `negate(v)`         | `−v`                                 |
| `envelope(vs)`      | upper envelope `max_i vs_i(σ)`       |
| `max(...vs)`        | `envelope` of the non-zero arguments |

Every operation maps piecewise-linear values to a piecewise-linear value. A sum or a
scaling keeps the breakpoints of its inputs. A negative scale is exact: `−max(a, b)` is
`min(−a, −b)`, a value that bends downward, and the algebra holds it as such. (The old
`Monotonic` module kept only upward bends, so `smul(−1, ·)` on a bent claim computed
`−min` instead of `−max`. Seven stories ran through that case.)

`envelope` of lines is one **monotone hull**: sorted by slope, each line enters and
leaves the upper envelope once, so one pass over a stack keeps exactly the lines that
bound it. Lines that only win at σ < 0 are dropped. Envelopes of piecewise values take
one hull per stretch between their breakpoints. `envelope` keeps zero lines and lines
of negative slope, which the lower reach of a union needs. `max` drops zero claims
first. `ZERO` is the shared claim `0σ + 0`, the default descent of an extent that sits
wholly above its baseline.

`print` renders a value as its equation: `40σ + 16`, or `max(σ + 30, 2σ)` for a value
that bends upward, matching the forms in the
[layout synthesis essay](/internals/design/layout-synthesis).

## Solving for σ

`solve(v, target)` is the frame equation `v(σ) = target`. It returns **the largest σ ≥ 0
where `v` equals the target**, or undefined when there is none or the solutions run on
to ∞ (a value flat at the target leaves σ undetermined). For a value that rises, that is
its one solution. For the max of claims that dips and then rises, it is where the value
rises through the target, which is the σ that fills the box.

Because σ ≥ 0, a claim whose fixed parts are already larger than the target has no
solution, rather than a negative σ. The render root then falls back to `rising(v)`, the
part of the claim that grows with σ alone (`s·σ` for the slope of its last segment): the
data fills the slot as if the fixed parts took no room, and they overflow (see
[Layout and Render Passes](/internals/layout/passes)). This is what #1179 asked for, an
unsized root whose fixed parts exceed the default canvas, and it needs no case of its
own.

## The cancellation rule

Float sums leave noise. A one-value domain at y = 16 claims an ascent of `16σ + 3` and a
descent of `−16σ + 3`, but if one of them was computed as `16.000000000000004`, their
sum has a slope of 3.55e-15. Solving `3.55e-15·σ + 6 = 200` gives σ ≈ 5e16 instead of
centering the value.

So every sum applies one rule to σ's coefficient: **a sum whose terms cancel to within the
rounding error they carry is 0** (`cancel(sum, magnitude)`, with a tolerance of 16 ulps of
the sum of the terms' sizes). Then the width above is a constant, `solve` returns
undefined, and `solveScope` takes its one-value path. Every reader that asks whether a
claim depends on σ (`isConstant`, `solve`, `rising`) gets the same answer, because the
decision is made where the value is built.

The tolerance is relative to the coefficients being summed, which share a unit, so a small
but real width is kept: a one-millisecond domain on epoch timestamps
(`(1.7e12 + 1)σ − 1.7e12σ`) has slope 1. The same rule decides when two breakpoints are
one, and when `target − intercept` in `solve` is 0, so a value that reaches its target
at σ = 0 up to rounding solves 0, not a σ just below it.

## Equality

`approxEqual(a, b, tol)` decides whether two claims are the same function. Two lines
agree everywhere when they agree at σ = 0 and 1. The difference of two piecewise values
is a line between breakpoints, so they agree everywhere when they agree at 0, 1, every
breakpoint of either, and once past the last. The `BBox` ledger uses it to detect an
over-determined key now that `table`'s content-sized tracks push piecewise claims into
cells.

## Numbers and values

Some computations run both in numbers and in values. The chain fold (`chainFold` in
`constraints/distribute.ts`) lays a stack's data extent in numbers and its claim in
values. The placement solve (`constraints/placementSolver.ts`) places a layer's children
in numbers at layout, and runs in values too, where each box it places is a function of
σ that agrees with the number solve at every σ. Each is written
once over an `Arith<T>` (`solver/arith.ts`), the operations it needs on `T`: `add`,
`sub`, `scale`, `negate`, `abs`, `max` (the upper envelope) and `near`, a test that two
amounts agree within a tolerance. There are two instances. `numbers` is plain
arithmetic. `values` is this module, where `near` is `approxEqual`, so a cycle in the
placement solve closes only when its two sides agree at every σ. The `BBox` ledger holds
values, so `toValue` and `fromValue` move an amount into and out of it, and a number is
a constant there.

## Slope as a data-driven signal

A subtree is data-driven only if its claim has a non-zero slope. `isConstant(v)` is that
test: every segment's slope is 0. Because the cancellation rule zeroes slopes that are
only noise, the test is exact for claims built from the algebra.

## Closures

A `Closure` is the one value outside the algebra. `placeByClaims`
(`constraints/claimPlacement.ts`) places a layer's children by a probe solve. When every
operand placed from outside the layer is a line in σ, it reads each child's edges as an
affine form in σ and in the sides of its children's bent claims, so the result stays in
the algebra. When an operand's box bends (a stand-in or a `placedFromRefs` box), it
re-solves the placement at each σ it is read at, and that edge is a closure. Anything
combined with a closure is a closure (`add`, `envelope`, and `chainClaim` in
`constraints/distribute.ts` fall back to evaluating at each σ), and a closure is solved
by bisection. Symbolic placement in the layout kernel removes this case (#1176, step 3).

## What comes next

The kernel writes a length as `ρ·A + PWL(σ)`, where A is the allocation of the parent.
No claim has an allocation term yet: A appears only as the right-hand side of the frame
equation. The term enters with its first reader, lengths given as a share of the parent
(#1165), as a coefficient beside this value.

## Reference

The full generated type reference for every export lives at
[Type Reference](/internals/api/). It is produced by TypeDoc from the source and
regenerated on every docs build.
