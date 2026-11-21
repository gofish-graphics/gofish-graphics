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
  pointer,
} from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import { rowTooltip, box, table, beside, focusFrom, hitRow, noPointer, thousands } from "./helpers";

const meta: Meta = { title: "Proposals/Tooltips/Stacked Bar" };
export default meta;

type Focus = { lake: string; species?: string } | undefined;

const SPECIES = ["Bass", "Trout", "Catfish", "Perch", "Salmon"];

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
        beside(s[0], rowTooltip(s[0].datum[0], { format: { count: thousands } }))) as any)
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
          )
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

/** Live: hover a segment for its row. */
export const InteractiveSegment: StoryObj = {
  render: () => {
    const container = initializeContainer();
    noPointer(container);
    const p = pointer();
    const key = (r: any) => (r ? `${r.lake}|${r.species}` : undefined);
    const focusKey = focusFrom(() => key(hitRow(p)));
    segmentTooltip(
      () => {
        const k = focusKey();
        if (!k) return undefined;
        const [lake, species] = k.split("|");
        return { lake, species };
      },
      live((d: any) => (key(hitRow(p)) === undefined || key(d) === key(hitRow(p)) ? 1 : 0.55))
    ).render(container);
    return container;
  },
};

/** Live: hover any segment for its whole stack. */
export const InteractiveWholeStack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    noPointer(container);
    const p = pointer();
    const lake = focusFrom(() => hitRow<any>(p)?.lake);
    stackTooltip(
      () => (lake() ? { lake: lake()! } : undefined),
      live((d: any) => {
        const l = hitRow<any>(p)?.lake;
        return l === undefined || d?.lake === l ? 1 : 0.55;
      })
    ).render(container);
    return container;
  },
};
