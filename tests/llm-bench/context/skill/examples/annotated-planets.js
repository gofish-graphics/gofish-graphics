// Annotated Planets
// The inner planets drawn as scaled circles with a labeled callout arrow pointing to one of them.

import { arrow, ellipse, layer, map, ref, spread, text } from "gofish-graphics";
const planets = [
  { name: "Mercury", radius: 15, color: "#EBE3CF" },
  { name: "Venus", radius: 36, color: "#DC933C" },
  { name: "Earth", radius: 38, color: "#179DD7" },
  { name: "Mars", radius: 21, color: "#F1CF8E" },
];
const container = document.getElementById("app");
layer([
  spread(
    { dir: "x", spacing: 50, alignment: "middle" },
    map(planets, (planet) =>
      ellipse({
        w: planet.radius * 2,
        h: planet.radius * 2,
        fill: planet.color,
        stroke: "#333",
        strokeWidth: 3,
      }).name(planet.name),
    ),
  ),
])
  .relate(({ Mercury }) => [
    spread({ dir: "y", spacing: 60, alignment: "middle" }, [
      text({ text: "Mercury" }).name("label"),
      Mercury,
    ]),
    arrow({}, [ref("label"), Mercury]),
  ])
  .render(container, {});
