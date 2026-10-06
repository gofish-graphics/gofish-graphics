// Sunflower (Equal Scale)
// A phyllotaxis spiral of 500 seeds placed by the golden angle; tagging x and y with the same measure gives them one shared data→pixel scale, so the packing stays perfectly circular in a wide canvas.

import { chart, circle, field, gradient, scatter } from "gofish-graphics";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const sunflower = Array.from({ length: 500 }, (_, i) => {
  const r = Math.sqrt(i);
  const theta = i * GOLDEN_ANGLE;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), i };
});
const container = document.getElementById("app");
chart(sunflower, { color: gradient(["#fde725", "#21918c", "#440154"]) })
  // Same measure on both axes ⇒ one shared scale ⇒ a true circle.
  .flow(scatter({ x: field("x", "plane"), y: field("y", "plane") }))
  .mark(circle({ r: 4, fill: "i" }))
  .render(container, { w: 640, h: 380 });
