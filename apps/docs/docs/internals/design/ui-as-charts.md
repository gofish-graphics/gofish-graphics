---
title: Charts Are User Interfaces
section: Overview
order: 24
group: Design Philosophy
status: stable
---

# Charts Are User Interfaces

This essay sits inside the Design Philosophy group; it is the longer-form
version of the argument the [UI Component
Frameworks](/internals/design/component-frameworks) essay opens with. The
claim is structural — _a chart is a special kind of user interface_ — and the
consequence is methodological: when GoFish has to make a design decision, the
first question is _how have UI frameworks solved this?_, not _how have
charting libraries solved this?_

This is unusual. Most charting libraries treat a chart as a fundamentally
different object from a UI — a thing in its own bucket, governed by its own
rules, with its own conventions. GoFish bets the opposite way.

## The evidence that they belong together

### Prior art keeps making the same crossover

The most successful pieces of charting machinery turn out, on inspection, to
be ports of UI machinery.

- **D3's selections** are heavily inspired by jQuery. The data-join is a
  declarative reconciliation step in the same family as a virtual-DOM diff.
- **Swift Charts** is built in SwiftUI; a chart is a tree of SwiftUI views
  laid out by the same engine that lays out the surrounding app.
- **Vega's signals** are structurally a reactive system in the same family as
  Solid, MobX, and the TC39 Signals proposal — different shape, same idea.
- **Bluefish** ([Pollock et al.](https://vis.csail.mit.edu/pubs/bluefish.pdf))
  is built in SolidJS, with its layout engine reusing the framework's
  reactive scheduling.

Each of these is one data point. Together they are a pattern: when a charting
problem looks novel, the answer is often _the same problem from UI, lightly
adapted_.

### Charts and UIs need the same APIs

UI frameworks and charting libraries both need, at minimum:

- **Interaction and animation** — reactivity throughout.
- **Visual hierarchy** — the framework decides what the eye should see first;
  this is common in UIs and embarrassingly underdeveloped in visualization.
- **Screen-size-aware layout** — responsive sizing across viewports.
- **Accessibility** — alt-text, keyboard nav, screen-reader semantics.
- **Design systems** — themes with consistent color, type, padding, spacing.

A charting library that takes any of these seriously ends up rebuilding what
UI frameworks already do. So GoFish starts from the assumption that it can
borrow.

### Both are data-driven graphic design

A UI for Amazon, Instagram, or Uber _is_ a visualization of some database
somewhere — products, posts, rides. A chart of survey responses or
sensor readings is the same kind of object. Both obey the same perceptual
rules: Cleveland & McGill's elementary perceptual tasks, the Gestalt
grouping principles, typography craft.

This is the deepest piece of the argument. Charts and UIs are not just
"similar in some ways." They are _examples of the same thing_:
data-driven graphic design.

## Where they actually differ

It would be sleight of hand to pretend that this is the whole story.
Charts genuinely need things UIs do not, and the differences are what force
GoFish to be more than a thin styling layer over a UI framework.

- **Data-driven sizes and positions.** A button's width is rarely
  proportional to a column in a database; a bar's height almost always is.
  This is what forces a layout pipeline that resolves _data domains_ before
  pixel sizes — see [Layout & Render Passes](/internals/layout/passes).
- **Coordinate transforms.** Polar, log, geographic projections. UIs sit in
  one Cartesian plane; charts routinely warp the plane underneath the marks.
  GoFish's [`coord` operator](/internals/layout/coord-flattening) is the
  apparatus.
- **Bespoke layout algorithms.** Circle packing, treemaps, sankey routing,
  force-directed graphs. Each is a one-off layout that has no analogue in
  any UI toolkit.
- **Single-table workflows.** UIs commonly assemble heterogeneous data from
  multiple sources; many charts work over one dataset that gets pivoted,
  grouped, and reshaped. The frontend's `chart(data).flow(...)` shape is
  built for this case.
- **Overlapping components.** Labels overlap marks; connectors cross stacks.
  Bluefish's relational model (a child can belong to several relations at
  once) is what makes this expressible without forcing a single-parent tree.

These differences are real, and GoFish handles them by extending the
UI-framework model — not by rejecting it.

## The advantage of the framing

UI frameworks have had orders of magnitude more time, money, and use poured
into them than charting libraries. They have worked out efficient layout,
declarative composition, reactivity, theming, accessibility, animation. When
GoFish treats a chart like a UI, it inherits — for free, by analogy — every
problem that whole ecosystem has already solved.

It also inherits the assumption that the system should be _recursively
extensible_ in the way a UI framework is. A user of React or SwiftUI does not
write a special incantation to "extend the framework"; they write a function
that returns the same kind of thing the built-ins return. GoFish wants the
same for charts. Custom marks, custom operators, custom coordinate
transforms, custom layouts — all of them are first-class extensions, not
plug-in points behind a wall.

## Does this make the system more complex than a Grammar of Graphics?

Yes, deliberately. GoFish's mid- and low-level surfaces are more complex
than a flat menu of chart types. The trade is the one the [PL
essay](/internals/design/principles) lays out: a small core with a smooth
complexity curve, so a beginner pays for what they use and an expert is
never stuck against a wall. The reference here is Guy Steele's keynote
[_Growing a Language_](https://www.youtube.com/watch?v=lw6TaiXzHAE)
([paper](https://www.cs.virginia.edu/~evans/cs655/readings/steele.pdf)) —
the case for designing a language that grows _with_ its users rather than
ahead of them.

A GoG-style menu is still expressible in GoFish, as a curated set of custom
marks and operators. The library does not block that. It just refuses to be
_only_ that.

## The risk: the Turing tar-pit

The honest version of the case has to admit the danger. A more compositional
system is harder to design than a flat one — you can fall into Alan Perlis's
[Turing tar-pit](http://weblog.raganwald.com/2004/10/beware-of-turing-tar-pit.html):

> The danger of the tar-pit is that instead of developing a solution to a
> problem, you develop a tool for solving problems. And invariably, the
> wider the class of problems the tool can solve, the less useful it is for
> solving any one problem.

The tar-pit is real and the risk to GoFish is real. The way out — the only
way out — is to stay close to actual end-user charts and ship a wide
standard library of marks, operators, and templates _fast_. Compositional
design is the long-term right answer, but only if it is constantly pulled
back to concrete examples.

## Sources

- [Bluefish: Composing Diagrams with Declarative
  Relations](https://vis.csail.mit.edu/pubs/bluefish.pdf) — Pollock et al.,
  UIST 2024.
- [Growing a Language](https://www.youtube.com/watch?v=lw6TaiXzHAE) — Guy
  Steele, OOPSLA 1998.
- [Beware of the Turing
  Tar-Pit](http://weblog.raganwald.com/2004/10/beware-of-turing-tar-pit.html) —
  Reg Braithwaite.
