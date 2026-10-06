import * as Plot from "@observablehq/plot";

// Identity scales, so positions are pixels. Each bottle: the image in
// grayscale, then a rect of the liquid color up to the level, blended with
// mix-blend-mode "color" (hue and saturation from the rect, brightness from
// what is below). Over the white background the blend stays white, so the
// color shows only on the bottle's own pixels.
const H = 240; // image height
const W = (H * 157) / 650; // image width at its own aspect ratio
const BASE = 300; // the shared baseline

export default function render(container, data) {
  const cx = (d, i) => 80 + 140 * i;
  const left = (d, i) => cx(d, i) - W / 2;
  const right = (d, i) => cx(d, i) + W / 2;
  const level = (d) => BASE - (H * d.fill_pct) / 100;
  container.append(
    Plot.plot({
      width: 640,
      height: 360,
      axis: null,
      x: { type: "identity" },
      y: { type: "identity" },
      marks: [
        Plot.frame({ fill: "white" }),
        Plot.image(data, {
          x: cx,
          y: BASE - H / 2,
          width: W,
          height: H,
          src: "/assets/bottle.png",
          imageFilter: "grayscale(1)",
        }),
        Plot.rect(data, {
          x1: left,
          x2: right,
          y1: BASE,
          y2: level,
          fill: "#00c853",
          mixBlendMode: "color",
        }),
        Plot.ruleY(data, { x1: left, x2: right, y: level, stroke: "#666666" }),
        Plot.text(data, {
          x: right,
          y: level,
          text: (d) => `${d.fill_pct}%`,
          textAnchor: "start",
          dx: 4,
          fill: "#666666",
          fontSize: 14,
        }),
        Plot.text(data, { x: cx, y: BASE, text: "wine", dy: 16, fontSize: 12 }),
      ],
    })
  );
}
