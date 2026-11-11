import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { blank, chart, polygon, scatter } from "../../../src/lib";
import { TEST_ROWS, type Pt } from "./spacingModels";
import offsets from "./sdfOffsets.json";

// Spacing with signed distance fields, on Josh's three test rows. The
// offsets come from sdfModels.ts (run sdfRun.ts to regenerate the JSON).

const meta: Meta = { title: "Proposals/Stack Profile/Spacing SDF" };
export default meta;

const show = (build: (container: HTMLElement) => void): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    build(container);
    return container;
  },
});

type Run = { xs: number[][]; strips?: Pt[][][] };
const data = offsets as unknown as Record<string, Run>;

const panel = (key: string, bridge = false) => {
  const run = data[key];
  const dy = (r: number) => (TEST_ROWS.length - 1 - r) * 76 + 4;
  const ink = TEST_ROWS.flatMap((shapes, r) =>
    shapes.map((s, i) => ({ ring: s.contours[0].map(([x, y]) => [x + run.xs[r][i] + 6, y + dy(r)] as Pt) }))
  );
  const strips = bridge
    ? (run.strips ?? []).flatMap((row, r) => row.map((ring) => ({ ring: ring.map(([x, y]) => [x + 6, y + dy(r)] as Pt) })))
    : [];
  return chart(
    [
      { x: 0, y: 0, k: "lo" },
      { x: 420, y: 230, k: "hi" },
    ],
    { w: 420, h: 230, axes: false, legend: false }
  )
    .flow(scatter({ by: "k", x: "x", y: "y" }))
    .mark(blank())
    .layer(chart(strips).mark(polygon({ points: "ring", fill: "#6baed6" })))
    .layer(chart(ink).mark(polygon({ points: "ring", fill: "#333" })));
};

const story = (key: string, bridge = false) => show((el) => panel(key, bridge).render(el));
export const ContactLoose = story("contact-loose");
export const ContactTight = story("contact-tight");
export const Opened4Loose = story("opened4-loose");
export const Opened4Tight = story("opened4-tight");
export const Opened8Loose = story("opened8-loose");
export const Opened8Tight = story("opened8-tight");
export const Closed8Loose = story("closed8-loose");
export const Closed8Tight = story("closed8-tight");
export const FilletALoose = story("filletA-loose");
export const FilletATight = story("filletA-tight");
export const FilletBLoose = story("filletB-loose");
export const FilletBTight = story("filletB-tight");
export const SminALoose = story("sminA-loose");
export const SminATight = story("sminA-tight");
// the fillet drawn in blue: the area being measured
export const FilletALooseShown = story("filletA-loose", true);
export const FilletATightShown = story("filletA-tight", true);
