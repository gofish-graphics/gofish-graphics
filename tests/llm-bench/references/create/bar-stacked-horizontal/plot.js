import * as Plot from "@observablehq/plot";

export default function render(container, data) {
  container.append(
    Plot.plot({
      width: 640,
      height: 400,
      marginLeft: 80,
      y: { domain: data.map((d) => d.question), label: null },
      color: { domain: ["Agree", "Neutral", "Disagree"], legend: true },
      marks: [
        Plot.barX(data, { y: "question", x: "count", fill: "answer" }),
        Plot.ruleX([0]),
      ],
    })
  );
}
