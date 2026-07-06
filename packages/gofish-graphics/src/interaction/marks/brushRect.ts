/**
 * `.drawWith()` — manipulability as a modifier on the REGULAR rect mark
 * (surface direction B, notes/design/interaction.md "Toward a fluent
 * surface"). A brush is not a new kind of thing; it is a rect whose geometry
 * is drawn by an input:
 *
 *   .mark(rect({ h: "count", fill: when(intersectsX("b"), …)… }).name("bars"))
 *   .layer(chart(null).mark(
 *     rect({ fill: "rgba(105,140,190,0.15)" }).drawWith(drag().span()).name("b")
 *   ))
 *
 * The modifier lifts the rect from LAYOUT-owned to INSTRUMENT-owned (the
 * writability rule): invoked as a mark it registers a brush instrument styled
 * with the rect's own fill/stroke and contributes a zero-footprint node —
 * interactive geometry never participates in layout or domain inference.
 * Selector accessors come from the chart's own encodings (frame.axisFields),
 * so the brush needs no x/y config. `.name()` names the INSTRUMENT (for
 * `inside("b")` / `refs.instrument("b")`), not a layer.
 */
import type { GoFishNode } from "../../ast/_node";
import { ambientRegistrar } from "../resolveContext";
import { brush, type BrushInstrument } from "../instruments/brush";
import type { SpanSpec } from "../inputs";

export interface DrawWithStyle {
  fill?: string;
  stroke?: string;
  multi?: boolean;
}

export interface InteractiveBrushMark {
  (d: unknown, key?: string | number, layerContext?: unknown): GoFishNode;
  name(name: string): InteractiveBrushMark;
  multi(): InteractiveBrushMark;
  /** The backing instrument (created lazily, shared across re-resolves). */
  __gfBrush: () => BrushInstrument;
}

interface Config {
  style: DrawWithStyle;
  span: SpanSpec;
  name?: string;
  multi?: boolean;
  /** Zero-footprint node factory, injected by the attach site (rect.tsx) to
   *  avoid a static import cycle rect → brushRect → rect. */
  placeholder: () => GoFishNode;
}

function build(config: Config): InteractiveBrushMark {
  let instrument: BrushInstrument | undefined;
  const getInstrument = (): BrushInstrument =>
    (instrument ??= brush({
      name: config.name,
      drag: config.span.drag,
      multi: config.multi ?? config.style.multi,
      fill: config.style.fill,
      stroke: config.style.stroke,
    }));

  const mark = ((_d: unknown) => {
    ambientRegistrar()?.register(getInstrument());
    return config.placeholder();
  }) as InteractiveBrushMark;

  // `name` collides with the read-only Function.prototype.name.
  Object.defineProperty(mark, "name", {
    value: (name: string) => build({ ...config, name }),
    configurable: true,
  });
  mark.multi = () => build({ ...config, multi: true });
  mark.__gfBrush = getInstrument;
  return mark;
}

/** The transform behind `rect(...).drawWith(drag().span())`. `style` is the
 *  rect's authored opts (recovered from its `__serialize` tag at the attach
 *  site). */
export function drawWithTransform(
  style: DrawWithStyle,
  span: SpanSpec,
  placeholder: () => GoFishNode
): InteractiveBrushMark {
  return build({ style, span, placeholder });
}
