# Revisit the name of the `Effect` family when more visual effects are added

Draft of a follow-up issue (label `API design`). Not yet filed.

PR #1366 renamed the visual filter family from `Filter` to `Effect`, with the option key `effect`:

```js
image({ href, h, effect: Effect.grayscale });
rect({ effect: Effect.luminanceToAlpha });
layer({ effect: "blur(2px)" }, [...]);
```

The reason was that "filter" already means filtering rows (`filter(predicate)`), and the naming rule in `api-design.md` says a strategy family never shares its name with an operator. `Effect` is a working name. This issue is to revisit it when the family grows beyond its two members, for example with shadow and blur.

## What other tools call these

From a survey of 32 systems, each checked against its own docs:

- **"Effect"** is the design-tool and UI-framework word. Figma's sidebar section is "Effects" (drop shadow, inner shadow, layer blur, background blur, noise, texture, glass), its Plugin API has `node.effects: Effect[]`, and its Widget API has a singular `effect` prop. Sketch, Illustrator and After Effects use the same word. SwiftUI files `grayscale(_:)` and `luminanceToAlpha()` under "Graphical effects" and has a `VisualEffect` protocol. Android has `RenderEffect`.
- **"Filter"** is the code-side word: CSS `filter`, SVG `<filter>`, Canvas `ctx.filter`, Core Image, Flutter, PixiJS, Konva, Fabric, p5 and ggfx.
- **Design tools mostly split the category.** "Effects" means shadow, blur and glow. Grayscale and other color work sit under "adjustments" or "color": Photoshop Adjustments, Figma "Image adjustments" (`ImagePaint.filters` in its API), Keynote "Adjust Image", PowerPoint Color > Recolor.
- **"vfx" and "fx"** are not used as a family name by any API surveyed. Unity's VFX Graph is a particle system, "fx" is an icon label in Photoshop, Illustrator and Affinity, and jQuery's `fx` means animation.
- **Observable Plot** has the clash GoFish had, a data `filter` and a visual filter on the same marks, and prefixes the visual one: `imageFilter`.

## Things to settle when more members are added

- **Does one family cover both kinds?** Today's two members are color operations, which a designer would look for under "adjustments". Shadow and blur are what designers call "effects". One `Effect` family can hold both (SwiftUI does), or the color members could split off.
- **The word "effect" is used elsewhere in the code.** `Animation`'s members are called effects internally (`src/animation/effects.ts`, the public type `Animation.EffectOptions`), and SolidJS has `createEffect`. Nothing collides in the public surface today.
- **The CSS string form.** `effect: "blur(2px)"` passes a CSS filter string through. If the family gains its own `blur` and `shadow` members, decide whether the string form stays.

Related: #1355 (the `treemap` to `tile` rename, where the naming rule came from), #1100 (Python data-transform names that shadow builtins; `filter` is the remaining one).
