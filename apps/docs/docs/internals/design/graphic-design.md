---
title: Graphic Design
section: Overview
order: 23
group: Design Philosophy
status: stable
---

# Graphic Design

The third tradition GoFish blends in is **graphic design** — the craft of making a
chart that is not merely correct but _good_. A chart can plot every number faithfully
and still fail to communicate. Graphic design is what closes that gap, and GoFish
treats it as a first-class concern, not a layer of polish applied at the end.

Three pieces of that craft shape GoFish most: **Gestalt principles**, **color**, and
**typography**.

## Gestalt principles

The Gestalt principles describe how the visual system _groups_ what it sees —
elements placed close together (proximity), elements that look alike (similarity),
elements inside a shared boundary (common region), elements joined by a line
(connectedness). They are not decoration. They are the mechanism by which a reader
perceives any structure in a chart at all.

This is where graphic design and [UI component
frameworks](/internals/design/component-frameworks) meet. GoFish's graphical
operators are, quite directly, Gestalt principles turned into composition primitives:
`spread` is proximity and uniform density, `stack` is alignment, `enclose` is common
region, `connect` and `arrow` are connectedness. Composing a chart in GoFish _is_
composing it out of Gestalt relations. Bluefish made this correspondence explicit —
its relational standard library is drawn straight from the Gestalt relations — and
GoFish carries it forward.

## Color

In data visualization, color is above all a tool for **emphasis** — for steering the
reader's attention to the few things that matter. And the most important color is
**gray**. A well-designed chart is mostly grays, with saturated color spent
sparingly, only where the eye should land.

Most visualization libraries do not center gray. They hand you a categorical palette
and encourage you to color _everything_ — which spends the reader's attention evenly
and so emphasizes nothing. GoFish treats gray as the default and color as a
deliberate act of emphasis. Datawrapper's
[_How to use color to emphasize_](https://www.datawrapper.de/blog/emphasize-with-color-in-data-visualizations)
is the clearest short statement of this approach.

This is the design-craft companion to the [PL essay's](/internals/design/principles)
point about color. That essay argues GoFish should not _restrict_ you to
perceptually optimal palettes; this one argues that, given the freedom, the
_well-designed_ use of color is mostly restraint. See
[Color Scale Resolution](/internals/layout/color-scales) for the mechanism.

## Typography

Typography matters as much as color, and it is the most underdeveloped part of
visualization tooling — GoFish's own included. Here it is a stated direction more
than a finished feature.

The intent has three parts:

- **Semantic type, not raw point sizes.** Following SwiftUI's lead, text should be
  sized by _role_ — a title, a label, a caption — with a theme deciding the actual
  measurements. This is one piece of a broader move toward theming.
- **Labels as first-class.** In most visualization libraries a label — a piece of
  text annotating a mark — is an afterthought, or absent entirely. In GoFish, labels
  are a central part of the system; see [Labels](/internals/design/label-syntax).
- **Attention to detail.** The fine craft of setting text — Jost Hochuli's _Detail
  in Typography_ is the touchstone — is something charts almost never get right, and
  GoFish wants to.

## Sources

- [_How to use color to emphasize_](https://www.datawrapper.de/blog/emphasize-with-color-in-data-visualizations) — Datawrapper, on color, emphasis, and the centrality of gray.
- _Detail in Typography_ — Jost Hochuli, on the micro-craft of setting text.
- _Building Science Graphics_ — Jen Christiansen, on the craft of explanatory data graphics.
