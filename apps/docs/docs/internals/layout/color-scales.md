---
title: Color Scale Resolution
section: Layout & Rendering
order: 62
group: Scale Resolution
status: draft
covers:
  - packages/gofish-graphics/src/ast/colorSchemes.ts
  - packages/gofish-graphics/src/ast/_node.ts
  - packages/gofish-graphics/src/color.ts
---

# GoFish Color Scales

## API

```ts
// Palette — discrete colors, cycles by index or maps by key
Chart(data, { color: palette("tableau10") });
Chart(data, { color: palette(["#e41a1c", "#377eb8", "#4daf4a"]) });
Chart(data, { color: palette({ Salmon: "#e15759" }) }); // unmapped → "#ccc"

// Gradient — continuous, interpolates via chroma-js in lab space
Chart(data, { color: gradient("blues") });
Chart(data, { color: gradient(["#f7fbff", "#6b0808"]) });
```

Combined with marks:

```ts
Chart(seafood, { color: palette("tableau10") })
  .flow(spread("lake", { dir: "x" }), stack("species", { dir: "x" }))
  .mark(rect({ h: "count", fill: "species" }));
```

---

## Types

```ts
type PaletteScale = {
  _tag: "palette";
  values: string | string[] | Record<string, string>;
};
type GradientScale = { _tag: "gradient"; stops: string | string[] };
type ColorConfig = PaletteScale | GradientScale;

palette(values); // constructor
gradient(stops); // constructor
```

`_tag` is the explicit user intent — scale behavior is determined by `_tag`, not inferred from data type.

---

## How It Works

### Palette

- `string` → named scheme, cycle by index
- `string[]` → cycle by index
- `Record<string, string>` → direct key lookup; unmapped values fall back to `"#ccc"` automatically

### Gradient

- `string` → named scheme stops, interpolate in lab space via chroma-js
- `string[]` → use as stops, interpolate in lab space via chroma-js
- A gradient becomes a single **continuous color scale** — `createGradientScale(config, [min, max])` returns a reusable `(value) => string` (chroma scale built once, `t = (value - min) / (max - min)` clamped to `[0, 1]`). This one `scaleFn` is the source of truth for the encoding: both the mark fills (`resolveColorChannel`) and the [colorbar legend](/internals/frontend/legends) read it, so a value and its swatch on the bar always agree. `min`/`max` span the full subtree domain.

### Named scheme registry (`colorSchemes.ts`)

| Name        | Type     |
| ----------- | -------- |
| `tableau10` | palette  |
| `viridis`   | gradient |
| `blues`     | gradient |
| `reds`      | gradient |

### Two-pass color resolution (`_node.ts` `resolveColorScale()`)

1. `collectColorValues()` walks subtree, collects unique fill values in encounter order
2. Dispatch on `_tag`:
   - `"gradient"` → compute numeric min/max, build one continuous scale via `createGradientScale(config, [min, max])` and store it (with the domain) on `scaleContext.unit` as a `ContinuousColorScale`. First writer wins: the root resolves the full-subtree domain, and deeper re-entries are skipped (a `resolved` flag) so they can't shrink it. No per-value color map is enumerated for gradients.
   - `"palette"` → assign `assignPaletteColor(config, key, index)` per value into the `color` map (`CategoricalScale`)
3. Falls back to `color6` cycling when no `colorConfig` is set

### Literal hex passthrough

Fill values that are pre-computed hex strings (e.g. from `derive`) pass through the color map directly — if the value is not found in the map, the value itself is used as the color.

`_node.ts` is also the shared home for node-level layout protocols such as
`Placeable.localAnchor()`. That anchor API is unrelated to color scale
resolution; it is consumed later by placement solving, after the color pass has
already recorded the subtree's color encodings in the render session.

---

## Files

| File                      | Role                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/ast/colorSchemes.ts` | Types, constructors, `assignPaletteColor`, `assignGradientColor`, `createGradientScale`, scheme registry |
| `src/ast/_node.ts`        | `collectColorValues`, `resolveColorScale` two-pass dispatch (categorical map vs continuous scaleFn)      |
| `src/color.ts`            | `resolveColorChannel` — shared categorical/continuous lookup + color ops for mark fills                  |
| `src/ast/shapes/rect.tsx` | Resolves fill/stroke via `resolveColorChannel`                                                           |
| `src/ast/marks/chart.ts`  | `ChartOptions.color?: ColorConfig`; passes `colorConfig` to render                                       |
| `src/lib.ts`              | Exports `palette`, `gradient`, `assignGradientColor`, `ColorConfig`, `PaletteScale`, `GradientScale`     |

---

## Deferred

- **Named sub-scales** (`named({ groupA: gradient(...), groupB: gradient(...) })`) — apply different scales to different data groups; requires `colorGroup: keyof T` on marks and per-group domain resolution
- **`schemeColors(name): string[]`** — expose raw colors from a named scheme so users can subset or extend (e.g. `palette(schemeColors("tableau10").slice(0, 5))`)
- **Diverging scales** with `mid` domain pinning (3-stop gradient with pinned midpoint)
- **Redundant encoding** (`fill` + position driven by the same field)
- **Make HSL values data-driven in `fill`** — currently only hex/rgb literals pass through; HSL strings should also be recognized and passed through without scale lookup
- **Nested/hierarchical schemes** per discrete group
- **Multiple color scales** per layered chart
- **`x`/`y` scale params** on `Chart()` — `type: "log" | "band"`, explicit `domain: [min, max]` for cross-chart comparisons (currently always linear, always inferred)
