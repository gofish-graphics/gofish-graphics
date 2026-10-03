import * as Plot from "@observablehq/plot";
import * as d3 from "d3";

// Plot has no sankey or alluvial layout: stack the nodes and the ribbons'
// slots by hand in pixels, and draw them on identity scales. Each ribbon is
// one area through its three slots with a bump curve, flat through the
// middle node.
export default function render(container, data) {
  const width = 640;
  const height = 420;
  const margin = { top: 20, right: 70, bottom: 20, left: 70 };
  const steps = ["class", "survival", "gender"];
  const nodeWidth = 16;
  const gap = 12;

  const cats = steps.map((s) => [...new Set(data.map((d) => d[s]))]);
  const total = d3.sum(data, (d) => d.count);
  const maxNodes = d3.max(cats, (c) => c.length);
  const k =
    (height - margin.top - margin.bottom - gap * (maxNodes - 1)) / total;
  const colX = steps.map(
    (s, i) =>
      margin.left +
      (i * (width - margin.left - margin.right - nodeWidth)) /
        (steps.length - 1)
  );

  // Nodes: stacked top to bottom in first-appearance order.
  const nodes = steps.flatMap((s, i) => {
    let y = margin.top;
    return cats[i].map((c) => {
      const h = d3.sum(data, (d) => (d[s] === c ? d.count : 0)) * k;
      const node = { step: i, name: c, x: colX[i], y, h };
      y += h + gap;
      return node;
    });
  });

  // One ribbon per row. Within each node the ribbons are stacked in the
  // order of the other two steps' categories, so a ribbon keeps its slot
  // all the way through the middle node.
  const ribbons = data
    .filter((d) => d.count > 0)
    .map((d, id) => ({ d, id, t: d.count * k, y: [] }));
  const rank = (j, r) => cats[j].indexOf(r.d[steps[j]]);
  steps.forEach((s, i) => {
    const [o1, o2] = [0, 1, 2].filter((j) => j !== i);
    for (const node of nodes.filter((n) => n.step === i)) {
      let y = node.y;
      ribbons
        .filter((r) => r.d[s] === node.name)
        .sort((a, b) => rank(o1, a) - rank(o1, b) || rank(o2, a) - rank(o2, b))
        .forEach((r) => {
          r.y[i] = y;
          y += r.t;
        });
    }
  });
  const points = ribbons.flatMap((r) =>
    [
      [colX[0] + nodeWidth, r.y[0]],
      [colX[1], r.y[1]],
      [colX[1] + nodeWidth, r.y[1]],
      [colX[2], r.y[2]],
    ].map(([x, y]) => ({ id: r.id, cls: r.d.class, x, y1: y, y2: y + r.t }))
  );

  container.append(
    Plot.plot({
      width,
      height,
      axis: null,
      x: { type: "identity" },
      y: { type: "identity" },
      color: { domain: cats[0], scheme: "tableau10" },
      marks: [
        Plot.areaY(points, {
          x: "x",
          y1: "y1",
          y2: "y2",
          z: "id",
          fill: "cls",
          fillOpacity: 0.5,
          curve: "bump-x",
        }),
        Plot.rect(nodes, {
          x1: "x",
          x2: (n) => n.x + nodeWidth,
          y1: "y",
          y2: (n) => n.y + n.h,
          fill: "#444",
        }),
        Plot.text(nodes, {
          x: (n) => (n.step === 0 ? n.x - 6 : n.x + nodeWidth + 6),
          y: (n) => n.y + n.h / 2,
          text: "name",
          textAnchor: "start",
          filter: (n) => n.step > 0,
        }),
        Plot.text(nodes, {
          x: (n) => n.x - 6,
          y: (n) => n.y + n.h / 2,
          text: "name",
          textAnchor: "end",
          filter: (n) => n.step === 0,
        }),
      ],
    })
  );
}
