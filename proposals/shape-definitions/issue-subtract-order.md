# `subtract([a, b])` draws b − a, the reverse of its doc comment

Found while writing #1267 (how to define a shape without drawing it: `.hidden()`, and region compositing). Proposal page: https://claude.ai/artifact/Pc7MBRfGfQyTWvhFTXaH3H.

`subtract`'s doc comment says it draws "A with B removed: `A − B`" (`packages/gofish-graphics/src/ast/graphicalOperators/porterDuff.tsx`, line 520). It draws B with A removed instead.

## Repro

```js
import { subtract, circle } from "gofish-graphics";

subtract([
  circle({ cx: 70, cy: 70, r: 50, fill: "#e07a5f" }), // a
  circle({ cx: 130, cy: 70, r: 50, fill: "#3d5a80" }), // b
]).render(container, { w: 200, h: 140 });
```

Expected: the left circle with a bite taken out of its right side (a − b).

Actual: the right circle with a bite taken out of its left side (b − a).

The #1267 prototype stories show the same thing. `NoFillSubtract` in `packages/gofish-graphics/stories/proposals/ShapeDefinitions.stories.tsx` writes `subtract([b, a])` to get a − b. `MaskingSubtract` writes `subtract([a, stripes])` to draw the stripes with a removed.

## Fix

The #1267 implementation PR fixes the order so that `subtract([a, b])` is a − b, as the doc comment says and as Figma, Shapely, Paper.js, PiCCL and the JS `Set` methods do. It updates the callsites that rely on the reversed order in the same change.
