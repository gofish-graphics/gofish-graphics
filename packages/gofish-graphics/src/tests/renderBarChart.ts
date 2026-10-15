import { rect } from "../lib";
import { seafood } from "../data/catch";

export const renderBarChart = () => {
  // Create container element
  const container = document.createElement("div");
  container.style.margin = "20px";
  document.body.appendChild(container);

  // Create the bar chart
  rect(seafood, { fill: "lake", h: "count" })
    .spreadX("lake")
    .render(container, {
      w: 320,
      h: 400,
      axes: true,
    });

  return container;
};
