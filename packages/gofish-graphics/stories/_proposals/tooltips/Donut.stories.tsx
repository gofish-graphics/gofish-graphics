/**
 * PROTOTYPE(#1395): a donut, the example where the focus rule changed. Each
 * wedge is a region: a pointer inside it picks it. The hole is near no
 * wedge, so with the default reach (16 px) it shows no box.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, layer, position, stack, rect, selectAll, filter, group, live, Coord } from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import { box, table, beside, floating, thousands } from "./helpers";
import { snap } from "./focusRuntime";

// The lowercase exports are builders and mounts, not stories.
const meta: Meta = { title: "Proposals/Tooltips/Donut", excludeStories: /^[a-z]/ };
export default meta;

const SPECIES = [...new Set(seafood.map((d) => d.species))];

/** The donut, wedges named "wedges", with a tooltip on the wedge whose
 *  species is `focus()`. The box shows the species and its summed count. */
export function donut(focus: () => string | undefined, opacity: any = 1) {
  return layer([
    chart(seafood, { coord: Coord.clock(), w: 300, h: 300 })
      // `y` and `h` place the ring (the Pie story's Donut); `StackOptions`
      // does not type them.
      .flow(stack({ by: "species", dir: "x", y: 50, h: 50 } as any))
      .mark(rect({ w: "count", fill: "species", opacity }).name("wedges")),
    chart(selectAll("wedges"))
      .flow(
        filter((w: any) => w.datum[0].species === focus()),
        group({ by: "species" })
      )
      .mark(((w: any[]) => {
        const rows = w[0].datum as any[];
        const species = rows[0].species;
        const count = rows.reduce((t, r) => t + r.count, 0);
        // The height of the wedge's middle, from the data.
        const turn = (2 * Math.PI * (BEFORE.get(species)! + count / 2)) / TOTAL;
        const y = R - R * Math.cos(turn);
        // Picked by hand: the box sits right of the ring, level with the
        // wedge's middle. A `ref` to a wedge has its box in the clock space,
        // not on screen, so `beside` cannot seat the box by the wedge (the
        // implementation does, from the drawn geometry). `position` places
        // the group by its top left; a tall invisible anchor centers the box.
        const placed = position({ x: 2 * R + 10, y: Math.min(Math.max(y, 30), 2 * R - 30) - 30 }, [
          beside(
            rect({ w: 0, h: 60, fill: "none" }),
            box(
              table([
                ["species", species],
                ["count", thousands(count)],
              ])
            ),
            { side: "right", gap: 0 }
          ),
        ]);
        return floating(placed);
      }) as any),
    // The canvas: 20 px around the ring, the reach of the open box, and room
    // right of the ring for the box.
    rect({ x: -20, y: -20, w: 2 * R + 170, h: 2 * R + 40, fill: "none" }),
  ]);
}

/** The ring's outer radius in px, and each species' count before it in the
 *  stack, from 12 o'clock. */
const R = 100;
const TOTAL = seafood.reduce((t, r) => t + r.count, 0);
const BEFORE = new Map(
  SPECIES.map((s, i) => [s, seafood.filter((r) => SPECIES.indexOf(r.species) < i).reduce((t, r) => t + r.count, 0)])
);

/** Static capture: the tooltip open on one wedge. */
export const Pinned: StoryObj = {
  render: () => {
    const container = initializeContainer();
    donut(() => SPECIES[1]).render(container, {});
    return container;
  },
};

export const Closed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    donut(() => undefined).render(container, {});
    return container;
  },
};

/** Live, by the default rule. A wedge's drawn center counts on both screen
 *  axes: in a coordinate space its drawn box is not its data box. Shared by
 *  the Interactive story, the proposal page's demo bundle and the focus
 *  switcher. */
export function mountInteractive(container: HTMLElement, focus?: Parameters<typeof snap>[2]) {
  const { focus: species, ping } = snap(
    container,
    { selector: "path[data-gf-id]", count: SPECIES.length, position: ["x", "y"], key: (r) => r?.species },
    focus
  );
  return donut(species, live(() => (ping(), 1))).render(container, {});
}

export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountInteractive(container);
    return container;
  },
};
