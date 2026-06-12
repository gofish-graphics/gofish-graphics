---
title: Color
section: Frontend
order: 60
status: draft
---

# Color in the Frontend

This essay covers how a chart author _uses_ color: the surface API, the
default scales the library ships, and the stance GoFish takes on
palette choice. For the mechanism that resolves a color encoding into a
concrete fill at render time, see [Color Scale
Resolution](/internals/layout/color-scales).

The argument _for_ careful color use sits in the [Graphic
Design](/internals/design/graphic-design) essay; the argument for not
restricting the user's palette choice sits in the [PL & Compilers
essay](/internals/design/principles). This page is the practical bridge: how
the frontend exposes that stance.

## Two scale shapes

The frontend recognizes two color scale kinds, set on `chart(...)` and
inherited by marks:

```ts
// discrete — cycles by index or maps by key
chart(data, { color: palette("tableau10") });
chart(data, { color: palette(["#e41a1c", "#377eb8", "#4daf4a"]) });
chart(data, { color: palette({ Salmon: "#e15759" }) }); // unmapped → fallback

// continuous — interpolates in perceptual space (Lab)
chart(data, { color: gradient("blues") });
chart(data, { color: gradient(["#f7fbff", "#6b0808"]) });
```

A mark's `fill: "<field>"` is resolved against the chart's color scale; a
literal `fill: "#e15759"` or `fill: "tomato"` bypasses the scale entirely.

## The stance

GoFish ships the perceptually-tuned palettes you expect — viridis,
ColorBrewer, Tableau — and lets you pass arbitrary hex / named / palette
colors. It does _not_ restrict you to a curated list. The reasoning:

1. **A perceptually optimal palette is not always the one a chart needs.**
   Brand colors, intentionally muted ranges, high-contrast pairings for
   print, single-color emphasis schemes — all are legitimate, and the
   palette-of-the-day approach forecloses them. The PL essay frames this as
   GoFish's preference for _internal_ correctness (the chart you specify is
   the chart you get) over _external_ correctness (the library refuses
   things it judges bad).
2. **Most charts should be mostly gray.** This is the
   [graphic-design](/internals/design/graphic-design) half of the same coin.
   Color is for _emphasis_, and a chart that colors everything emphasizes
   nothing. The default scale is colorful; the recommended _practice_ is to
   override it down to grays plus one or two accent colors. Datawrapper's
   _[How to use color to
   emphasize](https://www.datawrapper.de/blog/emphasize-with-color-in-data-visualizations)_
   is the short reference.

The two stances coexist: the library does not _lock you in_ to good
defaults, but the wiki and examples push hard toward gray-plus-emphasis as
the path of least friction.

## Planned contents

- Worked examples of palette / gradient overrides (single-color emphasis,
  brand palettes, print-friendly palettes).
- Theming hooks: how a project-wide color theme should plug into
  `chart(...)`.
- Accessibility: what GoFish provides today (which is honest: very little)
  and what should land (contrast-aware defaults, colorblind-safe ramps as
  first-class options, alt-text plumbing through marks).
- The `Value` API for per-mark color literals that should _not_ be resolved
  against the scale.

## Source

Likely `covers:`: the color-scheme entry points at
`packages/gofish-graphics/src/ast/colorSchemes.ts` and the `fill`/`stroke`
channel declarations in the shape modules. Add `covers:` when filled in and
run `pnpm --filter docs sync-backlinks`.
