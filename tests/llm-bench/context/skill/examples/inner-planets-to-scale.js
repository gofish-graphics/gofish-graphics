// Inner Planets to Scale
// The four inner planets rendered as colored circles sized by their relative radii and spread in a row.

import { ellipse, map, spread } from "gofish-graphics";
const planets = [
  { name: "Mercury", radius: 15, color: "#EBE3CF" },
  { name: "Venus", radius: 36, color: "#DC933C" },
  { name: "Earth", radius: 38, color: "#179DD7" },
  { name: "Mars", radius: 21, color: "#F1CF8E" },
];
const container = document.getElementById("app");
spread(
  { dir: "x", spacing: 50, alignment: "middle" },
  map(planets, (planet) =>
    ellipse({
      w: planet.radius * 2,
      h: planet.radius * 2,
      fill: planet.color,
      stroke: "#333",
      strokeWidth: 3,
    }),
  ),
).render(container, {});
