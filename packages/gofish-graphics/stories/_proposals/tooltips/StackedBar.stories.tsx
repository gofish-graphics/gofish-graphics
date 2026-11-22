/**
 * PROTOTYPE(#1395): the seafood catch, stacked. Two tooltips: one segment
 * (one species in one lake), and one whole stack (one lake). The whole stack
 * is the #802 case, a tooltip on the operator's group: `stack` cannot be
 * `.name()`d, so its group is rebuilt from its members, the segment refs
 * grouped by lake, and an `enclose` around them stands for the stack.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  stack,
  rect,
  selectAll,
  filter,
  group,
  enclose,
  live,
} from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import { rowTooltip, box, table, beside, thousands, rowOf, BARS } from "./helpers";
import { snap } from "./focusRuntime";

// The lowercase exports are builders and mounts, not stories.
const meta: Meta = { title: "Proposals/Tooltips/Stacked Bar", excludeStories: /^[a-z]/ };
export default meta;

type Focus = { lake: string; species?: string } | undefined;

const SPECIES = ["Bass", "Trout", "Catfish", "Perch", "Salmon"];
const LAKES: string[] = [...new Set(seafood.map((d) => d.lake))];

/** Keep it inside: the last two lakes open their box to the left (chosen
 *  from the datum, see NOTES.md "keep inside"). Past the right edge, the
 *  box widened the canvas and moved the plot. */
export const sideOf = (lake: string, fromEnd = 2) =>
  LAKES.indexOf(lake) >= LAKES.length - fromEnd ? ("left" as const) : ("right" as const);

/** The stacked bars, segments named "segments". */
const bars = (opacity: any = 1) =>
  chart(seafood, { w: 420, h: 320 })
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ h: "count", fill: "species", opacity }).name("segments"));

/** (a) A tooltip on ONE segment: the default row tooltip. */
export function segmentTooltip(focus: () => Focus, opacity?: any) {
  return bars(opacity).layer(
    chart(selectAll("segments"))
      .flow(
        filter(
          (s: any) =>
            s.datum[0].lake === focus()?.lake &&
            s.datum[0].species === focus()?.species
        ),
        group({ by: "species" })
      )
      .mark(((s: any[]) =>
        beside(s[0], rowTooltip(s[0].datum[0], { format: { count: thousands } }), {
          side: sideOf(s[0].datum[0].lake),
        })) as any)
  );
}

/** (b) A tooltip on the WHOLE stack of one lake: its segments, grouped by
 *  lake, enclosed (the enclose stands for the stack node #802 will not let
 *  us name), with a row per species and a total. */
export function stackTooltip(focus: () => Focus, opacity?: any) {
  return bars(opacity).layer(
    chart(selectAll("segments"))
      .flow(
        filter((s: any) => s.datum[0].lake === focus()?.lake),
        group({ by: "lake" })
      )
      .mark(((s: any[]) => {
        const rows = s.map((r) => r.datum[0]);
        const total = rows.reduce((t, r) => t + r.count, 0);
        const bySpecies = SPECIES.map((sp) => rows.find((r) => r.species === sp))
          .filter((r) => r !== undefined)
          .reverse(); // top segment first, as the stack reads
        // The stack's stand-in: an `enclose` around its segments' refs, drawn
        // as an outline. A relational mark paints under the marks it
        // references by default, which took the box under the next lake's
        // bars with it, so it is raised with `.zOrder(1)`. (A plain
        // `layer(refs)` stand-in throws: "axis 1 has a continuous type but no
        // size claim".)
        const outline = Promise.resolve(
          enclose({ padding: 2, fill: "none", stroke: "#111827", strokeWidth: 1.5 } as any, s)
        ).then((n: any) => n.zOrder(1));
        return beside(
          outline,
          box(
            table(
              [
                ...bySpecies.map((r): [string, string] => [r.species, thousands(r.count)]),
                ["total", thousands(total)],
              ],
              { title: rows[0].lake }
            )
          ),
          { side: sideOf(rows[0].lake) }
        );
      }) as any)
  );
}

export const PinnedSegment: StoryObj = {
  render: () => {
    const container = initializeContainer();
    segmentTooltip(() => ({ lake: "Lake C", species: "Trout" })).render(container);
    return container;
  },
};

export const PinnedWholeStack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    stackTooltip(() => ({ lake: "Lake C" })).render(container);
    return container;
  },
};

export const Closed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    bars().render(container);
    return container;
  },
};

/** Live: hover a segment for its row. The mounts are shared by the
 *  Interactive stories and the proposal page's demo bundle
 *  (proposals/tooltips/demo). */
export function mountInteractiveSegment(container: HTMLElement) {
  const key = (r: any) => (r ? `${r.lake}|${r.species}` : undefined);
  const { focus: focusKey, ping } = snap(container, {
    selector: BARS,
    count: seafood.length,
    // A segment's position is its `spread` slot in x and its `stack` place in y.
    position: ["x", "y"],
    key,
  });
  return segmentTooltip(
    () => {
      const k = focusKey();
      if (!k) return undefined;
      const [lake, species] = k.split("|");
      return { lake, species };
    },
    live((d: any) => (ping(), focusKey() === undefined || key(rowOf(d)) === focusKey() ? 1 : 0.55))
  ).render(container);
}

export const InteractiveSegment: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountInteractiveSegment(container);
    return container;
  },
};

/** Live: hover any segment for its whole stack. */
export function mountInteractiveWholeStack(container: HTMLElement) {
  const { focus: lake, ping } = snap(container, {
    selector: BARS,
    count: seafood.length,
    // A stack's position is its `spread` slot in x; in y it only has a height.
    // Its segments share the key `lake`, so the stack is one candidate.
    position: ["x"],
    key: (r) => r?.lake,
  });
  return stackTooltip(
    () => (lake() ? { lake: lake()! } : undefined),
    live((d: any) => {
      ping();
      const l = lake();
      return l === undefined || rowOf<any>(d)?.lake === l ? 1 : 0.55;
    })
  ).render(container);
}

export const InteractiveWholeStack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountInteractiveWholeStack(container);
    return container;
  },
};
