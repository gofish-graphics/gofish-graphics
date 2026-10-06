import * as d3 from "d3";

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
  const colX = d3
    .scalePoint()
    .domain(steps)
    .range([margin.left, width - margin.right - nodeWidth]);

  // Nodes: stacked top to bottom in first-appearance order.
  const nodes = steps.map((s, i) => {
    let y = margin.top;
    return new Map(
      cats[i].map((c) => {
        const value = d3.sum(
          data.filter((d) => d[s] === c),
          (d) => d.count
        );
        const node = { step: s, name: c, x: colX(s), y, h: value * k };
        y += node.h + gap;
        return [c, node];
      })
    );
  });

  // One ribbon per row. Within each node the ribbons are stacked in the
  // order of the other two steps' categories; a ribbon keeps its slot all
  // the way through a middle node.
  const ribbons = data
    .filter((d) => d.count > 0)
    .map((d) => ({ d, t: d.count * k, y: [] }));
  const rank = (s, v) => cats[s].indexOf(v);
  steps.forEach((s, i) => {
    const others = [0, 1, 2].filter((j) => j !== i);
    for (const node of nodes[i].values()) {
      let y = node.y;
      ribbons
        .filter((r) => r.d[s] === node.name)
        .sort(
          (a, b) =>
            rank(others[0], a.d[steps[others[0]]]) -
              rank(others[0], b.d[steps[others[0]]]) ||
            rank(others[1], a.d[steps[others[1]]]) -
              rank(others[1], b.d[steps[others[1]]])
        )
        .forEach((r) => {
          r.y[i] = y;
          y += r.t;
        });
    }
  });

  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(cats[0]);
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  // Each ribbon is one path: a curve across each gap and straight through
  // the middle node, then back along its lower edge.
  const x0 = colX(steps[0]) + nodeWidth;
  const x1 = colX(steps[1]);
  const x2 = colX(steps[1]) + nodeWidth;
  const x3 = colX(steps[2]);
  const curve = (xa, ya, xb, yb) => {
    const xm = (xa + xb) / 2;
    return `C${xm},${ya} ${xm},${yb} ${xb},${yb}`;
  };
  svg
    .append("g")
    .attr("fill-opacity", 0.5)
    .selectAll("path")
    .data(ribbons)
    .join("path")
    .attr("fill", (r) => color(r.d[steps[0]]))
    .attr("d", ({ y, t }) =>
      [
        `M${x0},${y[0]}`,
        curve(x0, y[0], x1, y[1]),
        `H${x2}`,
        curve(x2, y[1], x3, y[2]),
        `V${y[2] + t}`,
        curve(x3, y[2] + t, x2, y[1] + t),
        `H${x1}`,
        curve(x1, y[1] + t, x0, y[0] + t),
        "Z",
      ].join("")
    );

  const all = nodes.flatMap((m) => [...m.values()]);
  svg
    .append("g")
    .selectAll("rect")
    .data(all)
    .join("rect")
    .attr("x", (n) => n.x)
    .attr("y", (n) => n.y)
    .attr("width", nodeWidth)
    .attr("height", (n) => n.h)
    .attr("fill", "#444");

  svg
    .append("g")
    .attr("font-size", 12)
    .selectAll("text")
    .data(all)
    .join("text")
    .attr("x", (n) => (n.step === steps[0] ? n.x - 6 : n.x + nodeWidth + 6))
    .attr("y", (n) => n.y + n.h / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (n) => (n.step === steps[0] ? "end" : "start"))
    .text((n) => n.name);
}
