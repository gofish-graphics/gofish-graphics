import type { Meta, StoryObj } from "@storybook/html";
import * as Shapes from "../EncloseShapes.stories";
import * as Members from "../EncloseMembers.stories";
import * as PackS from "../lowlevel/Pack.stories";
import * as BT from "../forwardsyntax/BubbleTreemap.stories";
import * as Compare from "./EncloseShapeCompare.stories";
import { ENCLOSE_PROTOTYPE } from "../../src/ast/graphicalOperators/enclose";
import { ARCS_PROTOTYPE } from "../../src/ast/graphicalOperators/enclose/arcs";
import type { UnifiedOptions } from "../../src/ast/graphicalOperators/enclose/unified";
import { initializeContainer } from "../helper";
import {
  chart,
  circle,
  enclose,
  filter,
  layer,
  position,
  project,
  scatter,
  selectAll,
  Color,
  Shape,
} from "../../src/lib";
import { gapminderCountries } from "../../src/data/gapminderCountries";

// SCRATCH (not for merge): round 3 of the unified enclose outline. Each
// existing enclose story as it is (Current), through the unified outline
// (New), and with its enclose geometry dumped as JSON (Dump) for the
// measurement scripts in scratch-bumps/. No gallery tags.
const meta: Meta = { title: "Scratch/Enclose Round3" };
export default meta;

type Proto = {
  unified?: boolean;
  arcs?: boolean;
  overrides?: Partial<UnifiedOptions>;
  dump?: boolean;
};

const wrap = (story: StoryObj, p: Proto): StoryObj => ({
  render: (...args: any[]) => {
    ARCS_PROTOTYPE.spine = undefined;
    ARCS_PROTOTYPE.smooth = undefined;
    ENCLOSE_PROTOTYPE.unified = p.unified;
    ENCLOSE_PROTOTYPE.arcs = p.arcs;
    ENCLOSE_PROTOTYPE.overrides = p.overrides;
    ENCLOSE_PROTOTYPE.dump = p.dump ? [] : undefined;
    const pre = document.createElement("pre");
    pre.className = "enclose-dump";
    ENCLOSE_PROTOTYPE.dumpEl = p.dump ? pre : undefined;
    const el = (story.render as any)(...args) as HTMLElement;
    if (p.dump) el.append(pre);
    return el;
  },
});
const three = (story: StoryObj, arcs = false) => ({
  cur: wrap(story, {}),
  neu: wrap(story, { unified: true, arcs }),
  dump: wrap(story, { dump: true }),
});

const S = Shapes as any;
const M = Members as any;

export const MunkresFigure_Current = three(S.MunkresFigure).cur;
export const MunkresFigure_New = three(S.MunkresFigure).neu;
export const MunkresFigure_Dump = three(S.MunkresFigure).dump;
export const RefHull_Current = three(S.RefHull).cur;
export const RefHull_New = three(S.RefHull).neu;
export const RefHull_Dump = three(S.RefHull).dump;
export const PenguinHulls_Current = three(S.PenguinHulls).cur;
export const PenguinHulls_New = three(S.PenguinHulls).neu;
export const PenguinHulls_Dump = three(S.PenguinHulls).dump;
export const PenguinBlobs_Current = three(S.PenguinBlobs).cur;
export const PenguinBlobs_New = three(S.PenguinBlobs).neu;
export const PenguinBlobs_Dump = three(S.PenguinBlobs).dump;
export const PenguinSpines_Current = three(S.PenguinSpines).cur;
export const PenguinSpines_New = three(S.PenguinSpines).neu;
export const PenguinSpines_Dump = three(S.PenguinSpines).dump;
export const PenguinsFourShapes_Current = three(S.PenguinsFourShapes).cur;
export const PenguinsFourShapes_New = three(S.PenguinsFourShapes).neu;
export const ChartAccent_Current = three(S.ChartAccentSubSaharanAfrica).cur;
export const ChartAccent_New = three(S.ChartAccentSubSaharanAfrica).neu;
export const ChartAccent_Dump = three(S.ChartAccentSubSaharanAfrica).dump;
export const HolesFilled_Current = three(S.HolesFilled).cur;
export const HolesFilled_New = three(S.HolesFilled).neu;
export const HolesFilled_Dump = three(S.HolesFilled).dump;
export const HolesKept_Current = three(S.HolesKept).cur;
export const HolesKept_New = three(S.HolesKept).neu;
export const HolesKept_Dump = three(S.HolesKept).dump;
export const Hyperedges_Current = three(S.Hyperedges).cur;
export const Hyperedges_New = three(S.Hyperedges).neu;
export const Hyperedges_Dump = three(S.Hyperedges).dump;
export const ArcsRadiusSweep_Current = three(S.ArcsRadiusSweep, true).cur;
export const ArcsRadiusSweep_New = three(S.ArcsRadiusSweep, true).neu;
export const ArcsRadiusSweep_Dump = three(S.ArcsRadiusSweep, true).dump;
export const MembersCircles_Current = three(M.Circles).cur;
export const MembersCircles_New = three(M.Circles).neu;
export const MembersCircles_Dump = three(M.Circles).dump;
export const MembersThickCurves_Current = three(M.ThickCurves).cur;
export const MembersThickCurves_New = three(M.ThickCurves).neu;
export const MembersThickCurves_Dump = three(M.ThickCurves).dump;
export const MembersPolygons_Current = three(M.Polygons).cur;
export const MembersPolygons_New = three(M.Polygons).neu;
export const MembersPolygons_Dump = three(M.Polygons).dump;
export const MembersRibbonBand_Current = three(M.RibbonBand).cur;
export const MembersRibbonBand_New = three(M.RibbonBand).neu;
export const MembersRibbonBand_Dump = three(M.RibbonBand).dump;
export const PackEnclosed_Current = three((PackS as any).Enclosed).cur;
export const PackEnclosed_New = three((PackS as any).Enclosed).neu;
export const PackEnclosed_Dump = three((PackS as any).Enclosed).dump;
export const BubbleTreemap_Current = three((BT as any).Default, true).cur;
export const BubbleTreemap_New = three((BT as any).Default, true).neu;
export const BubbleTreemap_Exact = wrap((BT as any).Default, {
  unified: true,
  arcs: true,
  overrides: { smooth: null },
});
export const BubbleTreemap_Dump = three((BT as any).Default, true).dump;

// ── cusps: Shape.arcs on ChartAccent, connected: false ──────────────────────
const C = Compare as any;
export const Cusp_R40_Before = wrap(C.CA_Arcs40, {});
export const Cusp_R40_After = wrap(C.CA_Arcs40, {
  unified: true,
  arcs: true,
  overrides: { smooth: null },
});
export const Cusp_R40_AfterSmooth = wrap(C.CA_Arcs40, {
  unified: true,
  arcs: true,
});
export const Cusp_R24Pad10_Before = wrap(C.CA_Arcs24Pad10, {});
export const Cusp_R24Pad10_After = wrap(C.CA_Arcs24Pad10, {
  unified: true,
  arcs: true,
  overrides: { smooth: null },
});
export const Cusp_R24Pad10_AfterSmooth = wrap(C.CA_Arcs24Pad10, {
  unified: true,
  arcs: true,
});
export const Cusp_R40_Dump = wrap(C.CA_Arcs40, { dump: true });
export const Cusp_R24Pad10_Dump = wrap(C.CA_Arcs24Pad10, { dump: true });

// ── convexity sweeps ────────────────────────────────────────────────────────

// The U-shaped cloud of HolesFilled, members only (no avoided points), so
// the sweep shows convexity alone.
type Pt = [number, number];
const U: Pt[] = (() => {
  const path: Pt[] = [
    [35, 22],
    [35, 150],
    [190, 150],
    [190, 22],
  ];
  const out: Pt[] = [];
  for (let s = 0; s < 3; s++) {
    const [a, b] = [path[s], path[s + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / L,
      ny = (b[0] - a[0]) / L;
    const k = Math.round(L / 26);
    for (let i = s === 0 ? 0 : 1; i <= k; i++) {
      const t = i / k,
        jit = ((i * 7 + s * 3) % 5) - 2;
      for (const side of [-1, 1])
        out.push([
          a[0] + t * (b[0] - a[0]) + side * 11 * nx + jit,
          a[1] + t * (b[1] - a[1]) + side * 11 * ny - jit,
        ]);
    }
  }
  return out;
})();
const uStory = (convexity: number): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    layer(
      U.map(([x, y], i) =>
        position({ x: x - 5, y: y - 5 }, [
          circle({ r: 5, fill: "#3366aa" }).name(`u${i}`),
        ])
      )
    )
      .relate((names: any) => [
        enclose(
          {
            shape: Shape.blob({ convexity }),
            padding: 8,
            fill: "#3366aa",
            stroke: "#3366aa",
            fillOpacity: 0.25,
          },
          U.map((_, i) => names[`u${i}`])
        ),
      ])
      .render(container);
    return container;
  },
});
const REGION_COLORS = {
  America: "#5aa3b8",
  "East Asia & Pacific": "#9cb850",
  "Europe & Central Asia": "#f2b45c",
  "Middle East & North Africa": "#a99bc0",
  "South Asia": "#e07b9b",
  "Sub-Saharan Africa": "#47b8a0",
};
const caStory = (convexity: number): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(gapminderCountries, {
      axes: true,
      w: 520,
      h: 320,
      color: Color.palette(REGION_COLORS),
    })
      .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
      .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
      .layer(
        chart(selectAll("countries"))
          .flow(
            filter(
              (country: any) =>
                project(country, "Region") === "Sub-Saharan Africa"
            )
          )
          .mark(
            enclose({
              shape: Shape.blob({ convexity }),
              padding: 6,
              fill: "#47b8a0",
              stroke: "#47b8a0",
              fillOpacity: 0.3,
            })
          )
      )
      .render(container);
    return container;
  },
});

export const ConvU_000_Current = wrap(uStory(0), {});
export const ConvU_025_Current = wrap(uStory(0.25), {});
export const ConvU_050_Current = wrap(uStory(0.5), {});
export const ConvU_075_Current = wrap(uStory(0.75), {});
export const ConvU_100_Current = wrap(uStory(1), {});
export const ConvU_000_New = wrap(uStory(0), { unified: true });
export const ConvU_025_New = wrap(uStory(0.25), { unified: true });
export const ConvU_050_New = wrap(uStory(0.5), { unified: true });
export const ConvU_075_New = wrap(uStory(0.75), { unified: true });
export const ConvU_100_New = wrap(uStory(1), { unified: true });
export const ConvU_Dump = wrap(uStory(0.5), { dump: true });
export const ConvCA_000_Current = wrap(caStory(0), {});
export const ConvCA_025_Current = wrap(caStory(0.25), {});
export const ConvCA_050_Current = wrap(caStory(0.5), {});
export const ConvCA_075_Current = wrap(caStory(0.75), {});
export const ConvCA_100_Current = wrap(caStory(1), {});
export const ConvCA_000_New = wrap(caStory(0), { unified: true });
export const ConvCA_025_New = wrap(caStory(0.25), { unified: true });
export const ConvCA_050_New = wrap(caStory(0.5), { unified: true });
export const ConvCA_075_New = wrap(caStory(0.75), { unified: true });
export const ConvCA_100_New = wrap(caStory(1), { unified: true });
