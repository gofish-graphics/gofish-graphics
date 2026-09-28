import * as Plot from "@observablehq/plot";

const ANSWERS = ["Agree", "Neutral", "Disagree"];

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marginLeft: 80,
      fy: { domain: data.map((d) => d.question), label: null, axis: "left" },
      y: { domain: ANSWERS, axis: null },
      color: { domain: ANSWERS, legend: true },
      marks: [
        Plot.barX(data, {
          fy: "question",
          y: "answer",
          x: "count",
          fill: "answer",
        }),
        Plot.ruleX([0]),
      ],
    })
  );
}
