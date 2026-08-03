// Internal-wiki explorer: follow one two-box layout through the production
// pipeline. Controls and prose are DOM; every geometric view is rendered by
// GoFish itself. This file is executed as JavaScript by GoFishVue's new Function.

const W = 620;
const H = 286;
const BOX_Y = 136;
const SERIES_LEFT = 205;
const A_W = 80;
const B_W = 120;
const GAP = 10;
const A_MIN = SERIES_LEFT;
const B_MIN = SERIES_LEFT + A_W + GAP;
const A_MIDDLE = A_MIN + A_W / 2;
const B_MIDDLE = B_MIN + B_W / 2;
const SERIES_MIDDLE = SERIES_LEFT + (A_W + GAP + B_W) / 2;

const palette = {
  a: "#3451b2",
  aSoft: "rgba(52,81,178,0.18)",
  b: "#51931b",
  bSoft: "rgba(81,147,27,0.18)",
  ink: "#343a40",
  quiet: "#687076",
  faint: "#c8cdd2",
  frame: "#8b949e",
  accent: "#d65a4a",
  paper: "rgba(255,255,255,0.88)",
};

const stepData = [
  {
    short: "Request",
    title: "1 · Scale-dependent size request",
    equation: "Rₓ(σ) = 2σ + 3σ + 10",
    detail:
      "The children contribute two and three data units; distribute contributes a fixed 10 px gap. No pixel width has been chosen yet.",
  },
  {
    short: "Scale",
    title: "2 · Scope solve",
    equation: "5σ + 10 = 210  ⟹  σ = 40 px / unit",
    detail:
      "The owning scale scope inverts the size request against the 210 px allocation.",
  },
  {
    short: "Intrinsic",
    title: "3 · Intrinsic sizes",
    equation: "wᴬ = 2σ = 80 px     wᴮ = 3σ = 120 px",
    detail:
      "Each mark now knows its concrete size. Placement has not introduced a global ordering rule; it receives fixed boxes.",
  },
  {
    short: "Facts",
    title: "4 · Placement facts",
    equation: "min(B) − min(A) = wᴬ + 10 = 90",
    detail:
      "Align and distribute lower to simultaneous anchor equations. The difference graph fixes relative positions, up to one translation.",
  },
  {
    short: "Bounds",
    title: "5 · Bounds and reference ports",
    equation: "bounds = [205, 415]     exported anchors = 285, 295",
    detail:
      "Solved geometry can now be observed. A later reference should read a port without moving or rescaling its source.",
  },
  {
    short: "Paint",
    title: "6 · Bake and paint",
    equation: "placed nodes → baked transforms → ordered display list → SVG",
    detail:
      "Geometry is already settled. Paint ordering is a separate concern and need not match geometry-dependency order.",
  },
];

const style = document.createElement("style");
style.textContent = `
  .gf-pipeline-demo *,
  .gf-pipeline-demo *::before,
  .gf-pipeline-demo *::after {
    animation: none !important;
    transition: none !important;
  }
  .gf-pipeline-demo {
    border: 1px solid var(--vp-c-divider);
    border-radius: 12px;
    background: var(--vp-c-bg-soft);
    overflow: hidden;
  }
  .gf-pipeline-controls {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    padding: 12px;
    border-bottom: 1px solid var(--vp-c-divider);
  }
  .gf-pipeline-controls button {
    appearance: none;
    min-height: 34px;
    padding: 6px 7px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 7px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-2);
    font: inherit;
    font-size: 12px;
    line-height: 1.15;
    cursor: pointer;
  }
  .gf-pipeline-controls button:hover {
    border-color: var(--vp-c-brand-1);
    color: var(--vp-c-brand-1);
  }
  .gf-pipeline-controls button[aria-pressed="true"] {
    border-color: var(--vp-c-brand-1);
    background: var(--vp-c-brand-soft);
    color: var(--vp-c-brand-1);
    font-weight: 650;
  }
  .gf-pipeline-copy {
    min-height: 118px;
    padding: 14px 16px 8px;
  }
  .gf-pipeline-copy h4 {
    margin: 0 0 4px;
    border: 0;
    font-size: 15px;
  }
  .gf-pipeline-equation {
    margin: 0 0 7px;
    color: var(--vp-c-brand-1);
    font-family: var(--vp-font-family-mono);
    font-size: 13px;
    font-weight: 650;
  }
  .gf-pipeline-detail {
    margin: 0;
    color: var(--vp-c-text-2);
    font-size: 13px;
    line-height: 1.45;
  }
  .gf-pipeline-canvas {
    min-height: 220px;
    padding: 0 10px 12px;
  }
  .gf-pipeline-canvas svg {
    display: block;
    width: 100%;
    max-width: ${W}px;
    height: auto;
    margin: 0 auto;
  }
  @media (max-width: 520px) {
    .gf-pipeline-controls { grid-template-columns: repeat(3, 1fr); }
    .gf-pipeline-copy { min-height: 144px; }
  }
`;

const shell = document.createElement("section");
shell.className = "gf-pipeline-demo";
shell.setAttribute("aria-label", "Interactive layout pipeline explorer");

const controls = document.createElement("div");
controls.className = "gf-pipeline-controls";

const copy = document.createElement("div");
copy.className = "gf-pipeline-copy";
copy.innerHTML = `
  <h4></h4>
  <p class="gf-pipeline-equation"></p>
  <p class="gf-pipeline-detail"></p>
`;

const canvas = document.createElement("div");
canvas.className = "gf-pipeline-canvas";
canvas.setAttribute("role", "img");

root.append(style, shell);
shell.append(controls, copy, canvas);

const text = (value, fontSize, fill, fontWeight) =>
  gf.text({
    text: value,
    fontSize: fontSize || 12,
    fill: fill || palette.ink,
    fontWeight: fontWeight || "normal",
    textAnchor: "middle",
  });

const at = (x, y, node) => gf.position({ x, y }, node);

const labeledBox = (label, w, fill, soft) =>
  gf
    .layer([
      gf
        .rect({
          w,
          h: 64,
          fill: soft ? soft : fill,
          stroke: fill,
          strokeWidth: 1.5,
          rx: 6,
        })
        .name("body"),
      text(label, 12, soft ? fill : "white", "650").name("label"),
    ])
    .constrain(({ body, label }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [body, label]),
    ]);

const unitCell = (label, fill, soft) =>
  gf
    .layer([
      gf
        .rect({
          w: 42,
          h: 54,
          fill: soft,
          stroke: fill,
          strokeWidth: 1.25,
          rx: 4,
        })
        .name("body"),
      text(label, 15, fill, "700").name("label"),
    ])
    .constrain(({ body, label }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [body, label]),
    ]);

const exactSeries = (soft) => [
  at(
    A_MIN,
    BOX_Y,
    labeledBox("A · 80 px", A_W, palette.a, soft ? palette.aSoft : null)
  ),
  at(
    B_MIN,
    BOX_Y,
    labeledBox("B · 120 px", B_W, palette.b, soft ? palette.bSoft : null)
  ),
];

const commonCaption = (value, y, fill, weight) =>
  at(SERIES_MIDDLE, y, text(value, 12, fill || palette.quiet, weight));

const requestScene = () => {
  const aUnits = gf.stackX({ spacing: 0, alignment: "middle" }, [
    unitCell("σ", palette.a, palette.aSoft),
    unitCell("σ", palette.a, palette.aSoft),
  ]);
  const bUnits = gf.stackX({ spacing: 0, alignment: "middle" }, [
    unitCell("σ", palette.b, palette.bSoft),
    unitCell("σ", palette.b, palette.bSoft),
    unitCell("σ", palette.b, palette.bSoft),
  ]);
  const symbolic = gf.stackX({ spacing: 0, alignment: "middle" }, [
    aUnits,
    gf.rect({ w: GAP, h: 54, fill: palette.accent }),
    bUnits,
  ]);

  return gf.layer([
    at(SERIES_MIDDLE - 110, BOX_Y, symbolic),
    at(A_MIDDLE, 193, text("A contributes 2σ", 12, palette.a, "650")),
    at(B_MIDDLE, 193, text("B contributes 3σ", 12, palette.b, "650")),
    at(SERIES_MIDDLE, 72, text("fixed 10 px", 11, palette.accent, "650")),
  ]);
};

const scaleScene = () =>
  gf.layer([
    ...exactSeries(true),
    at(
      SERIES_LEFT,
      BOX_Y - 10,
      gf.rect({
        w: 210,
        h: 84,
        fill: "transparent",
        stroke: palette.frame,
        strokeWidth: 1.5,
        rx: 7,
      })
    ),
    commonCaption("allocation B = 210 px", 213, palette.frame, "650"),
    commonCaption("one shared scope chooses σ = 40", 67, palette.accent, "650"),
  ]);

const intrinsicScene = () =>
  gf.layer([
    ...exactSeries(false),
    at(A_MIN, 202, gf.rect({ w: A_W, h: 2, fill: palette.a })),
    at(B_MIN, 202, gf.rect({ w: B_W, h: 2, fill: palette.b })),
    at(A_MIDDLE, 219, text("2 × 40 = 80", 11, palette.a, "650")),
    at(B_MIDDLE, 219, text("3 × 40 = 120", 11, palette.b, "650")),
    commonCaption("concrete intrinsic boxes", 67, palette.quiet),
  ]);

const factsScene = () =>
  gf.layer([
    ...exactSeries(false),
    at(A_MIN - 4, 88, gf.circle({ r: 4, fill: palette.a })),
    at(B_MIN - 4, 88, gf.circle({ r: 4, fill: palette.b })),
    at(A_MIN, 92, gf.rect({ w: A_W + GAP, h: 2, fill: palette.accent })),
    at(A_MIN, 70, text("min(A)", 11, palette.a, "650")),
    at(B_MIN, 70, text("min(B)", 11, palette.b, "650")),
    commonCaption("same y-middle", 211, palette.frame),
    at((A_MIN + B_MIN) / 2, 108, text("90 px", 12, palette.accent, "700")),
  ]);

const boundsScene = () =>
  gf.layer([
    ...exactSeries(true),
    at(
      SERIES_LEFT,
      BOX_Y - 10,
      gf.rect({
        w: 210,
        h: 84,
        fill: "transparent",
        stroke: palette.accent,
        strokeWidth: 2,
        rx: 7,
      })
    ),
    at(A_MIN + A_W - 6, BOX_Y + 26, gf.circle({ r: 6, fill: palette.a })),
    at(B_MIN - 6, BOX_Y + 26, gf.circle({ r: 6, fill: palette.b })),
    at(A_MIN + A_W, 211, text("A.end = 285", 11, palette.a, "650")),
    at(B_MIN, 65, text("B.start = 295", 11, palette.b, "650")),
    commonCaption("read-only geometry ports", 238, palette.accent, "700"),
  ]);

const paintScene = () => {
  const primitive = (label, fill) =>
    gf
      .layer([
        gf
          .rect({
            w: 132,
            h: 34,
            fill: palette.paper,
            stroke: fill,
            strokeWidth: 1.5,
            rx: 5,
          })
          .name("body"),
        text(label, 11, fill, "650").name("label"),
      ])
      .constrain(({ body, label }) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [body, label]),
      ]);

  return gf.layer([
    ...exactSeries(false),
    commonCaption("final painted geometry", 211, palette.quiet, "650"),
    at(165, 62, primitive("paint rect A", palette.a)),
    at(SERIES_MIDDLE, 62, text("→", 18, palette.frame, "650")),
    at(323, 62, primitive("paint rect B", palette.b)),
  ]);
};

const scenes = [
  requestScene,
  scaleScene,
  intrinsicScene,
  factsScene,
  boundsScene,
  paintScene,
];

let activeStep = 0;

const buttons = stepData.map((step, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = step.short;
  button.addEventListener("click", () => {
    activeStep = index;
    renderStep();
  });
  controls.append(button);
  return button;
});

const renderStep = () => {
  const step = stepData[activeStep];
  buttons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index === activeStep));
    button.setAttribute(
      "aria-label",
      `${index + 1} of ${stepData.length}: ${stepData[index].short}`
    );
  });
  copy.querySelector("h4").textContent = step.title;
  copy.querySelector(".gf-pipeline-equation").textContent = step.equation;
  copy.querySelector(".gf-pipeline-detail").textContent = step.detail;
  canvas.setAttribute("aria-label", `${step.title}. ${step.equation}`);
  canvas.replaceChildren();
  scenes[activeStep]().render(canvas, { w: W, h: H });
};

renderStep();
