// Prototype forms, copied from PeriodicTable.stories.tsx (chart options cut to
// the coord). Formatted by build.mjs with the repo's prettier.
export default {
  spiral: `chart(leftStepTable(), {
  coord: warpLabels(spiralRows({ pitch: 1, rows: 8, spacing: 1, innerRadius: 0.2, outerRadius: 330 })),
}).flow(grid([0, 1])).mark(cell());`,
  sequence: `chart(sequence(), {
  coord: warpLabels(along(archimedean({ turns: 4, innerRadius: 2.25 }), { width: 0.92, x: [-0.5, 117.5], y: [0, 1] })),
}).flow(scatter({ x: "seq" })).mark(cell({ w: v(0.95), h: v(0.95) }));`,
  race: `chart(leftStepTable(), {
  coord: warpLabels(along(stadium({ w: 6, h: 2 }), { closed: true, width: 2.4, x: [0.5, 32.5], y: [0.5, 8.5] })),
}).flow(scatter({ x: "col", y: "row" })).mark(cell({ w: v(0.95), h: v(0.92) }, 10));`,
  benfey: `// benfey.pieces: the four guide pieces built in benfeyGuide.ts.
chart(benfeyTable(), {
  coord: warpLabels(along(benfey.pieces, { width: 7, x: [0.5, 32.5], y: [-0.5, 6.5] })),
}).flow(scatter({ x: "col", y: "track" })).mark(cell({ w: v(0.95), h: v(0.95) }, 10));`,
  rigid: `// Each square's corners are computed in the story at an equal arc-length
// station of the spiral, turned to its tangent. GoFish only draws them.
chart(rows).flow(group({ by: "z" })).mark(polygon({ points: "ring", fill: field("block") }).label("symbol", { position: "center" }));`,
  periodTable: `chart(leftStepSequence(), {
  coord: warpLabels(spiralPeriod({ period: 32, gap: 0.03, innerRadius: 2, x: [0.5, 8 * 32 + 0.5], y: [0, 1] })),
}).flow(scatter({ x: "seq" })).mark(cell({ w: v(1), h: v(1) }));`,
  pitchSeasons: `chart(seasons(), {
  coord: spiralRows({ pitch: 1, rows: 6, spacing: 6, innerRadius: 0.25, outerRadius: 270 }),
}).flow(table({ by: { x: field("month").bin(Bin.step(1)), y: field("year").bin(Bin.step(1)) }, spacing: [0, 6] }))
  .mark(rect({ h: "value", fill: field("year") }));`,
  periodSeasons: `chart(seasons(), {
  coord: spiralPeriod({ period: 12, gap: 0.15, innerRadius: 1.2, x: [-0.5, 71.5], y: [0, top] }),
}).flow(scatter({ x: "t" })).mark(rect({ w: v(0.9), h: "value", fill: field("year") }));`,
  cartogram: `// tableCartogram (scarcity.ts) solves each cell's four corners.
const cells = tableCartogram(scarcityGrid()).map((c, i) => ({ ...c, id: i }));
chart(cells).flow(group({ by: "id" })).mark(polygon({ points: "ring", fill: field("block") }));`,
};
