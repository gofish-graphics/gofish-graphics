import * as d3 from "d3";

export default function render(container, data) {
  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 110, bottom: 40, left: 50 };

  const years = [...new Set(data.map((d) => d.year))];
  const channels = [...new Set(data.map((d) => d.channel))];

  // Stack bottom to top in the data's channel order, the same in every bar.
  const series = d3
    .stack()
    .keys(channels)
    .value(([, byChannel], key) => byChannel.get(key)?.revenue ?? 0)(
    d3.index(
      data,
      (d) => d.year,
      (d) => d.channel
    )
  );

  const x = d3
    .scaleBand()
    .domain(years)
    .range([margin.left, width - margin.right])
    .padding(0.45);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1]))])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(channels);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  // Ribbons: for each channel and each pair of neighboring bars, a band from
  // the right edge of the left segment to the left edge of the right one.
  const ribbon = (a, b) => {
    const x0 = x(a.data[0]) + x.bandwidth();
    const x1 = x(b.data[0]);
    const xm = (x0 + x1) / 2;
    return (
      `M${x0},${y(a[1])} C${xm},${y(a[1])} ${xm},${y(b[1])} ${x1},${y(b[1])}` +
      ` L${x1},${y(b[0])} C${xm},${y(b[0])} ${xm},${y(a[0])} ${x0},${y(a[0])} Z`
    );
  };
  svg
    .append("g")
    .selectAll("g")
    .data(series)
    .join("g")
    .attr("fill", (s) => color(s.key))
    .attr("fill-opacity", 0.4)
    .selectAll("path")
    .data((s) => d3.pairs(s))
    .join("path")
    .attr("d", ([a, b]) => ribbon(a, b));

  svg
    .append("g")
    .selectAll("g")
    .data(series)
    .join("g")
    .attr("fill", (s) => color(s.key))
    .selectAll("rect")
    .data((s) => s)
    .join("rect")
    .attr("x", (d) => x(d.data[0]))
    .attr("y", (d) => y(d[1]))
    .attr("height", (d) => y(d[0]) - y(d[1]))
    .attr("width", x.bandwidth());

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  const legend = svg
    .append("g")
    .attr("transform", `translate(${width - margin.right + 16},${margin.top})`)
    .selectAll("g")
    .data(channels)
    .join("g")
    .attr("transform", (d, i) => `translate(0,${i * 20})`);
  legend
    .append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", color);
  legend
    .append("text")
    .attr("x", 18)
    .attr("y", 10)
    .attr("font-size", 12)
    .text((d) => d);
}
