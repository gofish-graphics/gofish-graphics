/**
 * rule() — an interactive reference line declared in MARK POSITION (surface
 * direction B, notes/design/interaction.md "Toward a fluent surface"):
 *
 *   chart(seafood, { axes: true })
 *     .flow(spread({ by: "lake", dir: "x" }))
 *     .mark(rect({ h: "count", fill: when(above("cut", of), red).else(blue) }))
 *     .layer(chart(null).mark(rule({ y: 100 }).drag("y").name("cut")))
 *
 * Manipulability is a mark modifier (`.drag("y")` makes the y anchor
 * writable); `.name()` registers the instrument for name-deferred selectors.
 * Per the writability rule, the rule's geometry is INSTRUMENT-OWNED overlay
 * state: invoked as a mark during resolve it registers a threshold instrument
 * with the ambient context and contributes a zero-footprint node to the tree
 * (interactive geometry never participates in layout or domain inference —
 * a brush must not change the chart's scales). Its default Limit to the
 * enclosing plot's y domain is the SCOPED default (visible, documented,
 * overridable) that replaces Meros' phantom edges.
 */
import { Rect } from "../../ast/shapes/rect";
import type { GoFishNode } from "../../ast/_node";
import { ambientRegistrar } from "../resolveContext";
import { threshold, type ThresholdInstrument } from "../instruments/threshold";

export interface RuleOptions {
  /** Initial position, in data space. */
  y: number;
  stroke?: string;
  strokeWidth?: number;
}

interface RuleConfig extends RuleOptions {
  draggable?: "y";
  name?: string;
}

export interface InteractiveRuleMark {
  (d: unknown, key?: string | number, layerContext?: unknown): GoFishNode;
  /** Make the given dimension writable (draggable). Only "y" so far. */
  drag(dim: "y"): InteractiveRuleMark;
  /** Register the instrument under a name (for `above("name", of)` etc.). */
  name(name: string): InteractiveRuleMark;
  /** The backing instrument (created lazily, shared across re-resolves). */
  __gfRule: () => ThresholdInstrument;
}

function build(config: RuleConfig): InteractiveRuleMark {
  // One instrument per mark-chain instance, shared across (re-)resolves;
  // each resolve gets a FRESH zero-footprint node (the pipeline is
  // tree-consuming) while the instrument's signal state persists.
  let instrument: ThresholdInstrument | undefined;
  const getInstrument = (): ThresholdInstrument =>
    (instrument ??= threshold({
      name: config.name,
      at: config.y,
      draggable: config.draggable === "y",
      stroke: config.stroke,
      strokeWidth: config.strokeWidth,
    }));

  const mark = ((_d: unknown) => {
    ambientRegistrar()?.register(getInstrument());
    // Zero-footprint placeholder: keeps mark-position declaration legal
    // without contributing geometry, domains, or hit targets.
    return Rect({ w: 0, h: 0, fill: "transparent", strokeWidth: 0 });
  }) as InteractiveRuleMark;

  mark.drag = (dim: "y") => {
    if (dim !== "y") {
      throw new Error(
        '[gofish interaction] rule().drag: only "y" is supported so far'
      );
    }
    return build({ ...config, draggable: dim });
  };
  // `name` collides with the read-only Function.prototype.name — it must be
  // defined, not assigned (assignment throws in strict mode).
  Object.defineProperty(mark, "name", {
    value: (name: string) => build({ ...config, name }),
    configurable: true,
  });
  mark.__gfRule = getInstrument;
  return mark;
}

export function rule(options: RuleOptions): InteractiveRuleMark {
  return build({ ...options });
}
