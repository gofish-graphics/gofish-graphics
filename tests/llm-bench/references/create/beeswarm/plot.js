import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 300,
      x: { tickFormat: "d", label: null },
      color: { legend: true },
      marks: [
        Plot.dot(
          data,
          Plot.dodgeY("middle", { x: "year", r: 6, fill: "genre" })
        ),
      ],
    })
  );
}
