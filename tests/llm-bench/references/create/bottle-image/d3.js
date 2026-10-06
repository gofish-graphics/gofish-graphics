import * as d3 from "d3";

// Each bottle: the image in grayscale, then a rect of the liquid color up to
// the level, blended with `mix-blend-mode: color` (hue and saturation from
// the rect, brightness from the gray glass) and masked by the image's alpha,
// so the color follows the bottle's shape. The group is isolated so the
// blend only sees the bottle, not the page behind it.
export default function render(container, data) {
  const width = 640;
  const height = 360;
  const H = 240; // image height
  const W = (H * 157) / 650; // image width at its own aspect ratio
  const bottom = 300;

  const x = d3
    .scalePoint()
    .domain(data.map((d) => d.wine))
    .range([80, width - 140]);
  const level = d3.scaleLinear().domain([0, 100]).range([0, H]);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "white");

  const defs = svg.append("defs");
  defs
    .append("filter")
    .attr("id", "gray")
    .attr("color-interpolation-filters", "sRGB")
    .append("feColorMatrix")
    .attr("type", "saturate")
    .attr("values", 0);
  defs
    .append("mask")
    .attr("id", "bottle-alpha")
    .attr("maskContentUnits", "userSpaceOnUse")
    .style("mask-type", "alpha")
    .append("image")
    .attr("href", "/assets/bottle.png")
    .attr("width", W)
    .attr("height", H);

  const bottles = svg
    .selectAll("g.bottle")
    .data(data)
    .join("g")
    .attr("class", "bottle")
    .attr("transform", (d) => `translate(${x(d.wine) - W / 2},${bottom - H})`);

  const art = bottles.append("g").style("isolation", "isolate");
  art
    .append("image")
    .attr("href", "/assets/bottle.png")
    .attr("width", W)
    .attr("height", H)
    .attr("filter", "url(#gray)");
  art
    .append("rect")
    .attr("width", W)
    .attr("y", (d) => H - level(d.fill_pct))
    .attr("height", (d) => level(d.fill_pct))
    .attr("fill", "#00c853")
    .attr("mask", "url(#bottle-alpha)")
    .style("mix-blend-mode", "color");

  bottles
    .append("line")
    .attr("x1", 0)
    .attr("x2", W)
    .attr("y1", (d) => H - level(d.fill_pct))
    .attr("y2", (d) => H - level(d.fill_pct))
    .attr("stroke", "#666666");
  bottles
    .append("text")
    .attr("x", W + 4)
    .attr("y", (d) => H - level(d.fill_pct))
    .attr("dominant-baseline", "middle")
    .attr("fill", "#666666")
    .attr("font-size", 14)
    .text((d) => `${d.fill_pct}%`);
  bottles
    .append("text")
    .attr("x", W / 2)
    .attr("y", H + 20)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .text((d) => d.wine);
}
