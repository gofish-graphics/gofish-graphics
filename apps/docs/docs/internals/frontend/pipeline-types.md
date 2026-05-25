---
title: Pipeline Types
section: Frontend
order: 15
status: draft
---

# The Types Behind `chart().flow().mark()`

The fluent frontend hides a small amount of type structure that is worth
spelling out: the pipeline `chart(data).flow(op1, op2, ..., opn).mark(mark)`
is a typed dataflow whose operators are written in **continuation-passing
style**. This essay describes those types in isolation from the syntax that
calls them. (See [Pipeline Syntax](/internals/frontend/pipeline-syntax) for
the surface story.)

This is the formal underbelly of the [thesis-style categorical
reading](/internals/design/principles#more-pl-ideas) the PL essay flags as
future work.

## Two type aliases

```ts
type Mark<T> = (d: T) => GoFishNode;
type Operator<T, U> = (cont: Mark<U>) => Mark<T>;
```

- A **mark** turns a datum into a node.
- An **operator** turns a mark-given-a-`U` into a mark-given-a-`T`. It is a
  function from a continuation to a continuation.

A pipeline `chart(data).flow(op1, op2, ..., opn).mark(mark)` corresponds to
the dataflow

```
data -> op1 -> op2 -> ... -> opn -> mark
```

with the types

```ts
data: T_in
op1: Operator<T_in, T_1>
op2: Operator<T_1, T_2>
...
opn: Operator<T_n-1, T_n>
mark: Mark<T_n>
```

## Why the type variables are reversed

It is reasonable to read `Operator<T, U>` and ask why `T` is on the left and
`U` on the right when the data flows _from_ `T` _to_ `U`. The answer is the
**continuation**.

Expand `Operator` all the way (the two `≡` lines are successive rewrites of
the same type):

```text
Operator<T, U>
  ≡ (cont: Mark<U>) => Mark<T>
  ≡ (cont: (d: U) => GoFishNode) => (d: T) => GoFishNode
```

Reorder the arguments and you get:

```text
(d: T) => (cont: (d: U) => GoFishNode) => GoFishNode
```

Read in English: _give me a `T`, and give me a way to turn a `U` into a
`GoFishNode`, and I will give you a `GoFishNode`_. Every operator is written
in **continuation-passing style**, where the return type is always
`GoFishNode`. The CPS framing is what makes the seemingly-backwards
type signature actually right. (There is a monad here — operators compose —
but the framing is loose; see _Notes_ below.)

## Two worked examples

**Mark.** A bare `rect` is a `Mark<T[]>`:

```ts
rect(opts) := (data: T[]) => Rect(elaborateOpts(opts, data))
```

That is, given an array of data and some user-supplied options, produce a
`Rect` whose props are filled in by elaborating the options against the data
(field-name → numeric, etc.).

**Operator.** A bare `spread` is an `Operator<T[], T[]>`:

```ts
spread(field, opts) := (mark: Mark<T[]>) =>
  (data: T[]) =>
    Spread(For(groupBy(data, field), mark))
```

Given a continuation `mark` and the upstream data, group the data by `field`,
apply `mark` to each group, and arrange the resulting children with `Spread`.

## `derive`: lifting an ordinary function

There is a second way to make an `Operator`: lift a plain function. That is
what `derive` does.

```ts
derive: <T, U>(fn: (d: T) => U) => Operator<T, U>;
```

Following the types pins down the implementation:

```ts
derive(fn) := (mark: Mark<U>) =>
  (d: T) => mark(fn(d))
```

A `derive` operator does no layout of its own; it transforms the data and
hands the result to its continuation. This is the way arbitrary
data-pipeline steps (sorting, normalizing, repeating, computing rolling
windows) enter the frontend without growing the core.

## `lift`: from a relation to an operator

A general layout combinator has the shape:

```ts
Layout: (children: GoFishNode[]) => GoFishNode;
```

`Spread`, `Stack`, `Layer`, `Frame` all fit this pattern. There is a
systematic way to turn a layout combinator into an operator:

```ts
lift: (rel: (children: GoFishNode[]) => GoFishNode) => Operator<T[], T[]>

lift(rel) := (mark: Mark<T[]>) =>
  (data: T[]) =>
    rel(For(groupBy(data, field), mark))
```

This is the spine of [`createOperator`](/internals/frontend/operator-factory)
— the factory does this lift, plus the channel handling and split-policy
configuration.

## Why this matters

Three reasons the formal sketch is worth keeping:

1. **It explains the shape of the frontend.** Once you see that operators
   are CPS-transformed marks, the otherwise-mysterious choice that operators
   take their continuation as their first argument stops being mysterious.
2. **It pins down what `derive` _is_.** `derive(fn)` is the lift of an
   ordinary function into the `Operator` family — the bridge from arbitrary
   data transforms into the typed pipeline.
3. **It points at the categorical reading.** The CPS structure suggests a
   monad; the dataflow suggests an arrow. The user-facing frontend does
   not require any of this to use, but if you are designing new operators
   the algebra is worth knowing about.

## Notes

- The CPS framing _does_ admit a monad, but monads have rules that fit
  uncomfortably with the way operators interact with the runtime (e.g.
  reactivity and key tracking). The frontend keeps the CPS shape and does
  not commit to a monad interface.
- The current implementation also threads keys/ids through the pipeline so
  downstream layout passes can re-identify nodes. The type aliases above
  elide that detail — see
  [`createOperator`](/internals/frontend/operator-factory) for what actually
  ships.
- The categorical reading (Mark as a traversal, Operator as an arrow) is
  flagged as future work in the [PL
  essay](/internals/design/principles#more-pl-ideas).
