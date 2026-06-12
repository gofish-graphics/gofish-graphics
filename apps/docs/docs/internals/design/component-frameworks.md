---
title: UI Component Frameworks
section: Overview
order: 22
group: Design Philosophy
status: stable
---

# UI Component Frameworks

The second tradition GoFish draws on is the modern **UI component framework** —
React, SwiftUI, Jetpack Compose. GoFish takes two things from it: the **component**
as the unit of composition, and **local-propagation layout** as the way to place
components fast.

This line of thinking is worked out in detail in **Bluefish** (Pollock et al.,
[UIST 2024](https://vis.csail.mit.edu/pubs/bluefish.pdf)), a diagramming framework
built — like GoFish — on SolidJS. GoFish carries Bluefish's conclusions forward.

## Marks and operators are components

A UI component is **declarative** (you say what the interface _is_, not how to draw
it), **composable** (you nest components to build larger ones), and **extensible**
(you can write your own). GoFish's marks and graphical operators are components in
exactly this sense:

- _Declarative_ — a `rect` or a `stackX` describes a result, not a sequence of
  canvas calls.
- _Composable_ — operators nest: a `stackX` of `layer`s of `rect`s.
- _Extensible_ — new marks and operators are authored through the
  [mark](/internals/frontend/mark-factory) and [operator](/internals/frontend/operator-factory)
  factories, exactly as a UI framework lets you write custom components.

## Past the single-parent tree

A pure component tree has one limitation that matters for graphics: every element
has exactly **one parent**. That is fine for a UI, where the screen partitions
cleanly into nested regions. It is wrong for charts and diagrams, where a single
mark routinely takes part in _several_ relationships at once — it sits in a stack,
_and_ carries a label, _and_ is joined to another mark by a connector.

Bluefish's answer is to relax the component into a **relation**: a relation does not
own its children outright, and a child can be **shared** between relations through
scoped references. GoFish inherits this. Named marks, `ref`, and `selectAll` let one
mark be referenced and related from elsewhere in the specification — see
[Name Resolution & Scoping](/internals/core/names-and-scoping). A mark can be in a
stack _and_ be the endpoint of a connector, without the tree having to choose a
single parent for it.

## Linear-time layout

The most consequential borrowing is the **layout architecture**.

Modern UI toolkits — CSS, SwiftUI, Jetpack Compose — all lay out interfaces with
**tree-based local propagation**. Layout is a small, fixed number of passes over the
component tree. Each node, locally, proposes sizes to its children; the children
size themselves and report back; the parent then places them in its own coordinate
space. No node reasons about more than its immediate neighborhood, and the whole
thing runs in **time linear in the size of the tree**.

::: starfish example:internal-local-propagation hidden
:::

The alternative is a **global constraint solver** — Cassowary-style linear
programming, SMT, gradient descent. A solver is more powerful: it can satisfy
tangled simultaneous constraints that local propagation cannot. But it pays for it
three times over:

- **It is slow.** Solving every constraint at once is superlinear; local
  propagation is linear.
- **It is viscous.** A node's final position becomes a function of a large,
  non-local set of constraints, so a layout bug cannot be localized — you cannot
  point at _the_ cause.
- **It resists extension.** Every layout behavior has to be expressed in the
  solver's one constraint language; you cannot drop in an arbitrary layout
  algorithm.

GoFish takes the UI-framework side of this trade. Its
[layout pass](/internals/layout/passes) is local propagation: a handful of linear
tree traversals, each node handling only itself and its children. The result is
layout that is **fast, debuggable, and open** — any layout algorithm can be added
as a new node, because a node is just local code. (GoFish does provide a `constrain`
facility for the rare layout that genuinely needs simultaneous constraints — but as
a local, opt-in tool, never the global backbone.)

Bluefish makes the same choice and measures the payoff: its layout time "scales
linearly with the size of the scenegraph," and it is asymptotically faster than the
constraint-based implementations it is compared against.

## What GoFish inherits

From the component-framework tradition, then, GoFish gets three things: a
composition model (marks and operators as components), a way past the single-parent
tree (relations and shared references), and a layout architecture (linear-time
local propagation). What it does _not_ get from here is discipline about a growing
API surface — that is the [compiler tradition's](/internals/design/principles) job —
or judgement about what makes the finished chart _good_ — that belongs to
[graphic design](/internals/design/graphic-design).

---

_The component-framework framing draws directly on Bluefish — "Composing Diagrams
with Declarative Relations," Pollock, Mei, Huang, Evans, Jackson & Satyanarayan,
UIST 2024 — which works out the relation model and the local-propagation layout
architecture in full._
