# export (SVG)

Get a chart's SVG out as a value instead of mounting it into the page.
`toSVG()` is the primitive; `save()` is the convenience that infers the format
from the file extension. These are siblings of [`render`](/js/api/core/render) —
same options, plus `background` — and chain off any chart, mark, or layer.

```ts
// SVG markup as a string
const svg = await chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }))
  .toSVG({ w: 400, h: 250, axes: true });

// Save (browser → download, Node → write file)
await chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }))
  .save("seafood.svg", { w: 400, h: 250, axes: true });
```

## Methods

```ts
.toSVG(options?): Promise<string>          // standalone SVG markup
.toSVGElement(options?): Promise<SVGSVGElement>  // detached DOM element
.save(filename, options?): Promise<void>   // format inferred from extension
```

All three are **async** — await them.

## Options

`options` accepts everything [`render`](/js/api/core/render) accepts (`w`, `h`,
`axes`, `padding`, …) plus:

| Option       | Type             | Description                                                      |
| ------------ | ---------------- | ---------------------------------------------------------------- |
| `background` | `string \| null` | Background fill painted behind the chart. Omitted = transparent. |

```ts
await chart(data)
  .mark(rect({ h: "value" }))
  .save("chart.svg", { w: 400, h: 300, background: "white" });
```

## `save()` dispatch

- **Format** is inferred from the extension. `.svg` is supported today; PNG and
  HTML are tracked in [#578](https://github.com/gofish-graphics/gofish-graphics/issues/578).
- **Environment** is detected automatically: in a browser `save()` triggers a
  download; in Node it writes the file to disk.

## Notes

- **Requires a DOM.** `toSVG()` runs the same layout + render pipeline as
  `render()` but mounts into a throwaway element, so it needs a browser-like
  environment (browser, or a notebook front-end). Headless Node rendering —
  producing the SVG with no browser — is tracked in
  [#577](https://github.com/gofish-graphics/gofish-graphics/issues/577).
- **Fonts are referenced, not embedded.** Text keeps its `font-family`
  references, so a viewer without those fonts sees fallback fonts. Embedding
  (subsetted `@font-face`) and outlining (text → paths) for fully self-contained
  output are tracked in [#578](https://github.com/gofish-graphics/gofish-graphics/issues/578).
- The output carries the SVG/xlink namespaces and a `viewBox`, so it scales when
  a consumer overrides `width`/`height`.
