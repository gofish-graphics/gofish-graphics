// Example 4: group enclosure + note. ChartAccent's blob around the
// Sub-Saharan African countries (EncloseShapes.stories.tsx), plus a note
// outside the cloud with an arrow to the blob.
import type { Meta, StoryObj } from "@storybook/html";
import { maxBy } from "lodash";
import { initializeContainer } from "../../helper";
import {
  arrow,
  chart,
  circle,
  Color,
  Constraint,
  derive,
  enclose,
  filter,
  layer,
  project,
  scatter,
  selectAll,
  Shape,
  spread,
  text,
} from "../../../src/lib";
import { gapminderCountries } from "../../../src/data/gapminderCountries";
import { REGION_COLORS } from "./data";
import { callout } from "./helpers";

const meta: Meta = { title: "Proposals/Annotations/Ex4 Enclosure Note" };
export default meta;

const TEAL = "#2b8a74";

// ─── A: today's primitives ───────────────────────────────────────────────────
export const A: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    layer([
      chart(gapminderCountries, {
        w: 520,
        h: 320,
        color: Color.palette(REGION_COLORS),
      })
        .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
        .mark(
          circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries")
        )
        .layer(
          chart(selectAll("countries"))
            .flow(filter((c) => project(c, "Region") === "Sub-Saharan Africa"))
            .mark(
              enclose({
                shape: Shape.blob({ convexity: 0.1, neck: 0.6 }),
                padding: 6,
                fill: "#47b8a0",
                stroke: "#47b8a0",
                fillOpacity: 0.3,
              }).name("africa")
            )
        ),
      spread({ dir: "y", spacing: 2, alignment: "start" }, [
        text({ text: "Sub-Saharan Africa", fontSize: 13, fontWeight: 700 }),
        text({ text: "high fertility, short lives" }),
      ]).name("note"),
    ])
      .relate(({ africa, note }) => [
        Constraint.distribute({ dir: "x", spacing: 16 }, [africa, note]),
        Constraint.align({ y: "end" }, [africa, note]),
        arrow(
          {
            bow: 0.4,
            stretch: 0,
            strokeWidth: 1,
            padStart: 4,
            padEnd: 2,
            stroke: TEAL,
          },
          [note, africa]
        ),
      ])
      .render(container, { axes: true, legend: false });
    // ── end spec ──
    return container;
  },
};

// A workaround for #975: the arrow aims at the box of what it targets, and a
// blob's box is mostly empty. Aim it at one member instead, the
// highest-fertility African country, through a second selection whose
// invisible padded box stands in for the blob's edge there.
export const AAimAtMember: StoryObj = {
  name: "A (arrow aimed at a member)",
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    const african = (c: any) => project(c, "Region") === "Sub-Saharan Africa";
    layer([
      chart(gapminderCountries, {
        w: 520,
        h: 320,
        color: Color.palette(REGION_COLORS),
      })
        .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
        .mark(
          circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries")
        )
        .layer(
          chart(selectAll("countries"))
            .flow(filter(african))
            .mark(
              enclose({
                shape: Shape.blob({ convexity: 0.1, neck: 0.6 }),
                padding: 6,
                fill: "#47b8a0",
                stroke: "#47b8a0",
                fillOpacity: 0.3,
              }).name("africa")
            )
        )
        .layer(
          chart(selectAll("countries"))
            .flow(
              filter(african),
              derive((cs) => [maxBy(cs, (c) => project(c, "FertilityRate"))])
            )
            .mark(
              enclose({ padding: 6, fill: "none", stroke: "none" }).name("tip")
            )
        ),
      spread({ dir: "y", spacing: 2, alignment: "start" }, [
        text({ text: "Sub-Saharan Africa", fontSize: 13, fontWeight: 700 }),
        text({ text: "high fertility, short lives" }),
      ]).name("note"),
    ])
      .relate(({ africa, tip, note }) => [
        Constraint.distribute({ dir: "x", spacing: 24 }, [africa, note]),
        Constraint.distribute({ dir: "y", spacing: 36 }, [tip, note]),
        arrow(
          {
            bow: 0.4,
            stretch: 0,
            strokeWidth: 1,
            padStart: 4,
            padEnd: 2,
            stroke: TEAL,
          },
          [note, tip]
        ),
      ])
      .render(container, { axes: true, legend: false });
    // ── end spec ──
    return container;
  },
};

// ─── B: shorthands (helpers.ts) ──────────────────────────────────────────────
export const B: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    chart(gapminderCountries, {
      w: 520,
      h: 320,
      color: Color.palette(REGION_COLORS),
    })
      .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
      .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
      .layer(
        callout(
          chart(selectAll("countries")).flow(
            filter((c) => project(c, "Region") === "Sub-Saharan Africa")
          ),
          {
            note: ["Sub-Saharan Africa", "high fertility, short lives"],
            subject: Shape.blob({ convexity: 0.1, neck: 0.6 }),
            fill: "#47b8a0",
            dx: 16,
            connector: "curve",
            color: TEAL,
          }
        )
      )
      .render(container, { axes: true, legend: false });
    // ── end spec ──
    return container;
  },
};
