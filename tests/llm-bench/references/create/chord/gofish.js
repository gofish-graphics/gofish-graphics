import { layer, polygon, text } from "gofish-graphics";

const SIZE = 400;
const C = SIZE / 2; // center
const R_OUT = 170; // ring outer radius
const R_IN = 155; // ring inner radius, where the ribbons end
const GAP = 0.08; // radians between neighboring segments
const COLORS = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2"];

// clock angle (0 at 12 o'clock, clockwise) and radius to pixels
const pt = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)];
const arc = (a0, a1, r) =>
  Array.from({ length: 33 }, (_, i) => pt(a0 + ((a1 - a0) * i) / 32, r));
// quadratic curve from p to q with its control point at the center
const bend = (p, q) =>
  Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    const u = 1 - t;
    return [
      u * u * p[0] + 2 * u * t * C + t * t * q[0],
      u * u * p[1] + 2 * u * t * C + t * t * q[1],
    ];
  });

// WORKAROUND: GoFish has no chord layout, and its text marks do not follow
// the polar transform, so the whole diagram (segments, ribbons and labels)
// is computed here in pixels and drawn as polygons and text in one layer.
export default function render(container, data) {
  const names = [...new Set(data.flatMap((d) => [d.source, d.target]))];
  const total = (n) =>
    data
      .filter((d) => d.source === n || d.target === n)
      .reduce((s, d) => s + d.count, 0);
  const sum = names.reduce((s, n) => s + total(n), 0);
  const k = (2 * Math.PI - GAP * names.length) / sum; // radians per count

  // each node's angle, and a cursor that hands out its links' ends in turn
  let a = GAP / 2;
  const nodes = new Map(
    names.map((n, i) => {
      const node = { a0: a, a1: a + total(n) * k, next: a, color: COLORS[i] };
      a = node.a1 + GAP;
      return [n, node];
    })
  );
  const end = (n, count) => {
    const node = nodes.get(n);
    const e = [node.next, node.next + count * k];
    node.next = e[1];
    return e;
  };

  // one ribbon per link, its ends handed out in data order
  const shapes = [];
  for (const d of data) {
    const [s0, s1] = end(d.source, d.count);
    const [t0, t1] = end(d.target, d.count);
    shapes.push(
      polygon({
        points: [
          ...arc(s0, s1, R_IN),
          ...bend(pt(s1, R_IN), pt(t0, R_IN)),
          ...arc(t0, t1, R_IN),
          ...bend(pt(t1, R_IN), pt(s0, R_IN)),
        ],
        fill: nodes.get(d.source).color,
        opacity: 0.6,
      })
    );
  }
  for (const [n, { a0, a1, color }] of nodes) {
    shapes.push(
      polygon({
        points: [...arc(a0, a1, R_OUT), ...arc(a1, a0, R_IN)],
        fill: color,
      })
    );
    const [x, y] = pt((a0 + a1) / 2, R_OUT + 16);
    shapes.push(text({ x, y, text: n, fontSize: 13, textAnchor: "middle" }));
  }
  return layer(shapes).render(container, { w: SIZE, h: SIZE });
}
