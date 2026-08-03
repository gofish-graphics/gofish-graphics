// Internal-wiki explorer: investigate the small monotone size-request language and an
// explicit Frame-fit policy. Controls and status are DOM; the plot is a live
// GoFish chart. Executed as JavaScript by GoFishVue's new Function.

const PLOT_W = 620;
const PLOT_H = 340;
const EPSILON = 1e-7;

const presets = [
  {
    id: "overlay",
    label: "Overlay max",
    formula: "R(σ) = max(40σ, 10σ + 50)",
    defaultBudget: 180,
    minimum: 50,
    request: (sigma) => Math.max(40 * sigma, 10 * sigma + 50),
    pieces: [
      { formula: "40σ", request: (sigma) => 40 * sigma },
      { formula: "10σ + 50", request: (sigma) => 10 * sigma + 50 },
    ],
    crossovers: [5 / 3],
  },
  {
    id: "series",
    label: "Series",
    formula: "R(σ) = 2σ + 3σ + 10",
    defaultBudget: 210,
    minimum: 10,
    request: (sigma) => 5 * sigma + 10,
    pieces: [{ formula: "5σ + 10", request: (sigma) => 5 * sigma + 10 }],
    crossovers: [],
  },
  {
    id: "plateau",
    label: "Plateau",
    formula: "R(σ) = max(120, 30σ)",
    defaultBudget: 120,
    minimum: 120,
    request: (sigma) => Math.max(120, 30 * sigma),
    pieces: [
      { formula: "120", request: () => 120 },
      { formula: "30σ", request: (sigma) => 30 * sigma },
    ],
    crossovers: [4],
  },
  {
    id: "pixel",
    label: "Pixel only",
    formula: "R(σ) = 120",
    defaultBudget: 120,
    minimum: 120,
    request: () => 120,
    pieces: [{ formula: "120", request: () => 120 }],
    crossovers: [],
  },
];

const classifications = {
  unique: {
    label: "unique",
    color: "#51931b",
  },
  plateau: {
    label: "plateau",
    color: "#b56a00",
  },
  overflow: {
    label: "overflow",
    color: "#d65a4a",
  },
  slack: {
    label: "slack",
    color: "#3451b2",
  },
  underdetermined: {
    label: "underdetermined",
    color: "#7259b6",
  },
};

const style = document.createElement("style");
style.textContent = `
  .gf-size-request-lab *,
  .gf-size-request-lab *::before,
  .gf-size-request-lab *::after {
    animation: none !important;
    transition: none !important;
  }
  .gf-size-request-lab {
    border: 1px solid var(--vp-c-divider);
    border-radius: 12px;
    background: var(--vp-c-bg-soft);
    overflow: hidden;
  }
  .gf-size-request-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    padding: 12px;
    border-bottom: 1px solid var(--vp-c-divider);
  }
  .gf-size-request-toolbar button {
    appearance: none;
    padding: 7px 11px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 999px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-2);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .gf-size-request-toolbar button:hover {
    border-color: var(--vp-c-brand-1);
    color: var(--vp-c-brand-1);
  }
  .gf-size-request-toolbar button[aria-pressed="true"] {
    border-color: var(--vp-c-brand-1);
    background: var(--vp-c-brand-soft);
    color: var(--vp-c-brand-1);
    font-weight: 650;
  }
  .gf-size-request-readout {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr);
    gap: 16px;
    padding: 14px 16px 10px;
  }
  .gf-size-request-formula {
    margin: 0 0 7px;
    color: var(--vp-c-brand-1);
    font-family: var(--vp-font-family-mono);
    font-size: 13px;
    font-weight: 650;
  }
  .gf-size-request-result {
    margin: 0;
    color: var(--vp-c-text-2);
    font-size: 13px;
    line-height: 1.45;
  }
  .gf-size-request-result strong {
    color: var(--gf-size-request-status-color);
  }
  .gf-size-request-budget {
    display: grid;
    grid-template-columns: auto minmax(100px, 1fr) 52px;
    align-items: center;
    gap: 9px;
    color: var(--vp-c-text-2);
    font-size: 12px;
  }
  .gf-size-request-budget output {
    color: var(--vp-c-text-1);
    font-family: var(--vp-font-family-mono);
    font-weight: 650;
    text-align: right;
  }
  .gf-size-request-budget input {
    width: 100%;
    accent-color: var(--vp-c-brand-1);
  }
  .gf-size-request-plot {
    min-height: 250px;
    padding: 0 10px 12px;
  }
  .gf-size-request-plot svg {
    display: block;
    width: 100%;
    max-width: ${PLOT_W}px;
    height: auto;
    margin: 0 auto;
  }
  .gf-size-request-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 0 16px 14px;
    color: var(--vp-c-text-3);
    font-size: 11px;
  }
  .gf-size-request-key::before {
    content: "";
    display: inline-block;
    width: 18px;
    height: 3px;
    margin-right: 6px;
    border-radius: 2px;
    vertical-align: middle;
    background: var(--key-color);
  }
  @media (max-width: 560px) {
    .gf-size-request-readout { grid-template-columns: 1fr; }
  }
`;

const shell = document.createElement("section");
shell.className = "gf-size-request-lab";
shell.setAttribute("aria-label", "Interactive size request and Frame fit lab");

const toolbar = document.createElement("div");
toolbar.className = "gf-size-request-toolbar";

const readout = document.createElement("div");
readout.className = "gf-size-request-readout";

const explanation = document.createElement("div");
explanation.innerHTML = `
  <p class="gf-size-request-formula"></p>
  <p class="gf-size-request-result" aria-live="polite"></p>
`;

const budgetControl = document.createElement("label");
budgetControl.className = "gf-size-request-budget";
budgetControl.innerHTML = `
  <span>Budget B</span>
  <input type="range" min="0" max="260" step="1" />
  <output></output>
`;

const plot = document.createElement("div");
plot.className = "gf-size-request-plot";
plot.setAttribute("role", "img");

const legend = document.createElement("div");
legend.className = "gf-size-request-legend";
legend.innerHTML = `
  <span class="gf-size-request-key" style="--key-color:#98a2b3">affine pieces aᵢσ + bᵢ</span>
  <span class="gf-size-request-key" style="--key-color:#3451b2">request R(σ)</span>
  <span class="gf-size-request-key" style="--key-color:#d65a4a">budget B</span>
  <span class="gf-size-request-key" style="--key-color:#51931b">selected σ*</span>
  <span class="gf-size-request-key" style="--key-color:#b56a00">piece crossover</span>
`;

root.append(style, shell);
shell.append(toolbar, readout, plot, legend);
readout.append(explanation, budgetControl);

const budgetInput = budgetControl.querySelector("input");
const budgetOutput = budgetControl.querySelector("output");
const formulaNode = explanation.querySelector(".gf-size-request-formula");
const resultNode = explanation.querySelector(".gf-size-request-result");

let activePreset = 0;
let budget = presets[0].defaultBudget;

const approximatelyEqual = (a, b) => Math.abs(a - b) <= EPSILON;

const uniqueRoot = (request, target) => {
  let low = 0;
  let high = 1;
  while (request(high) < target && high < 1000000) high *= 2;
  for (let i = 0; i < 72; i += 1) {
    const middle = (low + high) / 2;
    if (request(middle) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
};

const analyze = (preset, target) => {
  if (target < preset.minimum - EPSILON) {
    return {
      kind: "overflow",
      sigma: null,
      text: `R(0) = ${preset.minimum} px already exceeds B, so no nonnegative scale is feasible.`,
    };
  }

  if (preset.id === "pixel") {
    const exact = approximatelyEqual(target, preset.minimum);
    return {
      kind: exact ? "underdetermined" : "slack",
      sigma: null,
      text: exact
        ? "Every σ ≥ 0 gives the same 120 px request; size alone cannot choose a scale."
        : `R(σ) = 120 px stays below B for every σ, leaving ${target - preset.minimum} px unused.`,
    };
  }

  if (preset.id === "plateau" && approximatelyEqual(target, 120)) {
    return {
      kind: "plateau",
      sigma: 4,
      text: "Every σ in [0, 4] satisfies R(σ) = B; greatest-feasible fit selects σ* = 4.",
    };
  }

  const sigma = uniqueRoot(preset.request, target);
  return {
    kind: "unique",
    sigma,
    text: `The monotone request reaches B once, at σ* = ${sigma.toFixed(2)} px / unit.`,
  };
};

const presetButtons = presets.map((preset, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = preset.label;
  button.addEventListener("click", () => {
    activePreset = index;
    budget = preset.defaultBudget;
    budgetInput.value = String(budget);
    render();
  });
  toolbar.append(button);
  return button;
});

budgetInput.value = String(budget);
budgetInput.addEventListener("input", () => {
  budget = Number(budgetInput.value);
  render();
});

const plotScene = (preset, analysis) => {
  const maxSigma = Math.max(
    8,
    analysis.sigma === null ? 0 : analysis.sigma * 1.22
  );
  const sampleCount = 100;
  const curveData = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const sigma = (maxSigma * index) / sampleCount;
    return { sigma, request: preset.request(sigma) };
  });
  const budgetData = [
    { sigma: 0, request: budget },
    { sigma: maxSigma, request: budget },
  ];

  const pieceLayers = preset.pieces.flatMap((piece, index) => {
    const name = `requestPiece${index}Points`;
    const data = Array.from({ length: sampleCount + 1 }, (_, sampleIndex) => {
      const sigma = (maxSigma * sampleIndex) / sampleCount;
      return { sigma, request: piece.request(sigma) };
    });
    return [
      gf
        .chart(data)
        .flow(gf.scatter({ x: "sigma", y: "request" }))
        .mark(gf.circle({ r: 0.01, fill: "transparent" }).name(name)),
      gf.chart(gf.selectAll(name)).mark(
        gf.line({
          stroke: "#98a2b3",
          strokeWidth: 1.4,
          strokeDasharray: "4 4",
        })
      ),
    ];
  });

  const layers = [
    ...pieceLayers,
    gf
      .chart(curveData)
      .flow(gf.scatter({ x: "sigma", y: "request" }))
      .mark(
        gf
          .circle({ r: 1.6, fill: "rgba(52,81,178,0.35)" })
          .name("requestCurvePoints")
      ),
    gf
      .chart(gf.selectAll("requestCurvePoints"))
      .mark(gf.line({ stroke: "#3451b2", strokeWidth: 2.5 })),
    gf
      .chart(budgetData)
      .flow(gf.scatter({ x: "sigma", y: "request" }))
      .mark(
        gf.circle({ r: 0.01, fill: "transparent" }).name("budgetLinePoints")
      ),
    gf.chart(gf.selectAll("budgetLinePoints")).mark(
      gf.line({
        stroke: "#d65a4a",
        strokeWidth: 2,
        strokeDasharray: "6 4",
      })
    ),
  ];

  const visibleCrossovers = preset.crossovers.filter(
    (sigma) => sigma >= 0 && sigma <= maxSigma
  );
  if (visibleCrossovers.length > 0) {
    layers.push(
      gf
        .chart(
          visibleCrossovers.map((sigma) => ({
            sigma,
            request: preset.request(sigma),
          }))
        )
        .flow(gf.scatter({ x: "sigma", y: "request" }))
        .mark(
          gf.circle({
            r: 4.5,
            fill: "#b56a00",
            stroke: "white",
            strokeWidth: 1.5,
          })
        )
    );
  }

  if (analysis.sigma !== null) {
    layers.push(
      gf
        .chart([{ sigma: analysis.sigma, request: budget }])
        .flow(gf.scatter({ x: "sigma", y: "request" }))
        .mark(
          gf.circle({
            r: 6,
            fill: classifications[analysis.kind].color,
            stroke: "white",
            strokeWidth: 2,
          })
        )
    );
  }

  return gf.layer(layers);
};

const render = () => {
  const preset = presets[activePreset];
  const analysis = analyze(preset, budget);
  const classification = classifications[analysis.kind];

  presetButtons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index === activePreset));
  });
  formulaNode.textContent = preset.formula;
  budgetOutput.value = `${budget} px`;
  resultNode.style.setProperty(
    "--gf-size-request-status-color",
    classification.color
  );
  resultNode.innerHTML = `<strong>${classification.label}</strong> · ${analysis.text}`;
  plot.setAttribute(
    "aria-label",
    `${preset.formula}. Budget ${budget} pixels. Result: ${classification.label}. ${analysis.text}`
  );
  plot.replaceChildren();
  plotScene(preset, analysis).render(plot, {
    w: PLOT_W,
    h: PLOT_H,
    axes: true,
  });
};

render();
