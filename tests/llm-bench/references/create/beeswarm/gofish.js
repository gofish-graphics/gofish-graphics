import { chart, scatter, circle, blank } from "gofish-graphics";

const W = 520; // plot width
const R = 6; // circle radius
const H = 240; // plot height

export default function render(container, data) {
  // WORKAROUND: GoFish has no beeswarm (dodge) layout, so the vertical
  // offsets are computed here, in pixels. That needs the x scale in pixels:
  // GoFish rounds the year axis out to whole decades, so it spans W px
  // over those decades.
  const years = data.map((d) => d.year);
  const x0 = Math.floor(Math.min(...years) / 10) * 10;
  const x1 = Math.ceil(Math.max(...years) / 10) * 10;
  const px = (year) => ((year - x0) / (x1 - x0)) * W;

  // Dodge: left to right, each circle takes the offset nearest the center
  // line where it overlaps no circle placed so far; the candidates are 0 and
  // the offsets that rest it against a placed neighbor.
  const placed = [];
  for (const d of [...data].sort((a, b) => a.year - b.year)) {
    const cx = px(d.year);
    const near = placed.filter((p) => Math.abs(p.cx - cx) < 2 * R);
    const candidates = [0];
    for (const p of near) {
      const dy = Math.sqrt((2 * R) ** 2 - (p.cx - cx) ** 2);
      candidates.push(p.dy + dy, p.dy - dy);
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b));
    const dy = candidates.find((c) =>
      near.every((p) => Math.hypot(p.cx - cx, p.dy - c) >= 2 * R - 1e-6)
    );
    placed.push({ ...d, cx, dy });
  }
  // The y axis is hidden, so it is not rounded: two invisible points at
  // dy = -H/2 and H/2 pin its range, so one unit of dy is one pixel.
  const frame = [{ dy: -H / 2 }, { dy: H / 2 }];

  return chart(
    placed.map((p, i) => ({ ...p, id: i })),
    { axes: { x: { title: "Year" }, y: false } }
  )
    .flow(scatter({ by: "id", x: "year", y: "dy" }))
    .mark(circle({ r: R, fill: "genre" }))
    .layer(
      chart(frame)
        .flow(scatter({ by: "dy", y: "dy" }))
        .mark(blank())
    )
    .render(container, { w: W, h: H });
}
