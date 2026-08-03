// Internal-wiki explorer: the fixed-size placement problem as an equality
// difference graph. Controls switch mathematical cases synchronously; the graph
// itself is rendered by GoFish with no animation or delayed interpolation.

const W = 720;
const H = 330;
const VIEW_W = 840;

const palette = {
  ink: "#252150",
  muted: "#667085",
  quiet: "#98a2b3",
  panel: "#fffefa",
  panelSoft: "#f7f5ff",
  border: "#d9dce3",
  edge: "#667085",
  purple: "#8d63bd",
  purpleSoft: "#ddcdf3",
  red: "#bd3f3f",
  redSoft: "#fde2df",
  green: "#21845a",
  greenSoft: "#dcf3e8",
  earthFill: "#3e8ccc",
  earthStroke: "#2f6fa6",
  marsFill: "#f4bc80",
  marsStroke: "#e0954c",
  venusFill: "#d2913c",
  venusStroke: "#a96f26",
};

const modes = [
  {
    id: "family",
    label: "Free family",
    summary: "r = (0, 90, 160)   ·   x = r + t·1   ·   one translation remains",
    values: ["x=t", "x=t+90", "x=t+160"],
  },
  {
    id: "gauge",
    label: "Canonical gauge",
    summary: "t = −min(r) = 0   ·   x = (0, 90, 160)",
    values: ["x=0", "x=90", "x=160"],
  },
  {
    id: "pin",
    label: "Pin A = 20",
    summary: "A.start = 20 ⇒ t = 20   ·   x = (20, 110, 180)",
    values: ["x=20", "x=110", "x=180"],
  },
  {
    id: "conflict",
    label: "Conflicting cycle",
    summary: "(+90) + (+70) − (+150) = +10 ≠ 0   ·   no solution",
    values: ["no solution", "no solution", "no solution"],
  },
];

const style = document.createElement("style");
style.textContent = `
  .gf-difference-lab *,
  .gf-difference-lab *::before,
  .gf-difference-lab *::after {
    animation: none !important;
    transition: none !important;
  }
  .gf-difference-lab {
    border: 1px solid var(--vp-c-divider);
    border-radius: 12px;
    background: var(--vp-c-bg-soft);
    overflow: hidden;
  }
  .gf-difference-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    padding: 12px;
    border-bottom: 1px solid var(--vp-c-divider);
  }
  .gf-difference-toolbar button {
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
  .gf-difference-toolbar button:hover {
    border-color: var(--vp-c-brand-1);
    color: var(--vp-c-brand-1);
  }
  .gf-difference-toolbar button[aria-pressed="true"] {
    border-color: var(--vp-c-brand-1);
    background: var(--vp-c-brand-soft);
    color: var(--vp-c-brand-1);
    font-weight: 650;
  }
  .gf-difference-summary {
    padding: 11px 16px;
    border-bottom: 1px solid var(--vp-c-divider);
    color: var(--vp-c-text-1);
    font-family: var(--vp-font-family-mono);
    font-size: 12px;
    line-height: 1.45;
  }
  .gf-difference-summary[data-conflict="true"] {
    color: #a73535;
    background: #fff3f1;
  }
  .gf-difference-canvas {
    width: 100%;
    min-height: 240px;
    overflow: hidden;
    background: ${palette.panel};
  }
  .gf-difference-canvas > svg {
    display: block;
    width: 100%;
    height: auto;
  }
`;

const shell = document.createElement("section");
shell.className = "gf-difference-lab";
shell.setAttribute(
  "aria-label",
  "Interactive equality difference-graph placement explorer"
);

const toolbar = document.createElement("div");
toolbar.className = "gf-difference-toolbar";

const summary = document.createElement("div");
summary.className = "gf-difference-summary";
summary.setAttribute("aria-live", "polite");

const canvas = document.createElement("div");
canvas.className = "gf-difference-canvas";
canvas.setAttribute("role", "img");

shell.append(toolbar, summary, canvas);
root.append(style, shell);

const at = (x, y, node) => gf.position({ x, y }, node);

const text = (value, size, fill, weight, anchor) =>
  gf.text({
    text: value,
    fontSize: size || 11,
    fill: fill || palette.ink,
    fontWeight: weight || "normal",
    textAnchor: anchor || "middle",
  });

const graphNode = (id, potential, value, x, y, fill, stroke) =>
  at(
    x,
    y,
    gf
      .layer([
        gf
          .rect({
            w: 160,
            h: 54,
            rx: 27,
            fill,
            stroke,
            strokeWidth: 3,
          })
          .name(`difference-${id}`),
        text(
          `${id}   ·   r=${potential}   ·   ${value}`,
          11,
          "white",
          "760"
        ).name("label"),
      ])
      .constrain((targets) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [
          targets[`difference-${id}`],
          targets.label,
        ]),
      ])
  );

const edge = (from, to, label, x, y, conflict = false) => [
  gf.line(
    {
      stroke: conflict ? palette.red : palette.edge,
      strokeWidth: conflict ? 3 : 2,
      strokeDasharray: conflict ? "7 5" : undefined,
      source: { x: "end", y: "middle" },
      target: { x: "start", y: "middle" },
    },
    [gf.ref(`difference-${from}`), gf.ref(`difference-${to}`)]
  ),
  at(
    x,
    y,
    gf
      .layer([
        gf
          .rect({
            w: conflict ? 146 : 112,
            h: 28,
            rx: 14,
            fill: conflict ? palette.redSoft : palette.panelSoft,
            stroke: conflict ? palette.red : palette.border,
            strokeWidth: 1.25,
          })
          .name("shape"),
        text(label, 10, conflict ? palette.red : palette.muted, "760").name(
          "label"
        ),
      ])
      .constrain((targets) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [
          targets.shape,
          targets.label,
        ]),
      ])
  ),
];

const pinNode = () =>
  at(
    30,
    78,
    gf
      .layer([
        gf
          .rect({
            w: 160,
            h: 42,
            rx: 21,
            fill: palette.purpleSoft,
            stroke: palette.purple,
            strokeWidth: 2.5,
          })
          .name("difference-pin"),
        text("pin  A.start = 20", 10.5, palette.purple, "760").name("label"),
      ])
      .constrain((targets) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [
          targets["difference-pin"],
          targets.label,
        ]),
      ])
  );

const applyViewport = () => {
  const svg = canvas.querySelector("svg");
  if (!svg) return false;
  // GoFish's conservative absolute-position claim is wider than the requested
  // render budget. Keep the full semantic drawing in view rather than making
  // the article column horizontally scroll.
  svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${H}`);
  svg.setAttribute("width", String(VIEW_W));
  svg.setAttribute("height", String(H));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return true;
};

let activeMode = 0;

const buttons = modes.map((mode, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = mode.label;
  button.addEventListener("click", () => {
    activeMode = index;
    render();
  });
  toolbar.append(button);
  return button;
});

const render = () => {
  const mode = modes[activeMode];
  const isConflict = mode.id === "conflict";
  const isPinned = mode.id === "pin";

  buttons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index === activeMode));
  });
  summary.textContent = mode.summary;
  summary.dataset.conflict = String(isConflict);
  canvas.setAttribute(
    "aria-label",
    isConflict
      ? "Three placement variables. Edges A to B plus 90 and B to C plus 70 imply A to C plus 160, but a direct edge asserts plus 150, so the cycle is inconsistent."
      : `Three placement variables with relative potentials zero, 90, and 160. ${mode.summary}`
  );

  const nodes = [
    graphNode(
      "A",
      "0",
      mode.values[0],
      30,
      190,
      palette.earthFill,
      palette.earthStroke
    ),
    graphNode(
      "B",
      "90",
      mode.values[1],
      260,
      70,
      palette.venusFill,
      palette.venusStroke
    ),
    graphNode(
      "C",
      "160",
      mode.values[2],
      450,
      190,
      palette.marsFill,
      palette.marsStroke
    ),
    ...edge("A", "B", "A → B   +90", 180, 112),
    ...edge("B", "C", "B → C   +70", 365, 112),
    at(
      360,
      38,
      text(
        "relations determine differences; a pin or gauge chooses translation",
        10.5,
        palette.muted,
        "650"
      )
    ),
  ];

  if (isPinned) {
    nodes.push(
      pinNode(),
      gf.line(
        {
          stroke: palette.purple,
          strokeWidth: 2,
          strokeDasharray: "5 4",
          source: { x: "middle", y: "end" },
          target: { x: "middle", y: "start" },
        },
        [gf.ref("difference-pin"), gf.ref("difference-A")]
      )
    );
  }

  if (isConflict) {
    nodes.push(
      ...edge("A", "C", "asserted +150 · implied +160", 235, 260, true)
    );
  } else {
    nodes.push(
      at(
        360,
        270,
        text(
          mode.id === "family"
            ? "solution family:  (t, t + 90, t + 160)"
            : mode.id === "gauge"
              ? "canonical representative:  (0, 90, 160)"
              : "pinned representative:  (20, 110, 180)",
          11,
          mode.id === "pin" ? palette.purple : palette.green,
          "760"
        )
      )
    );
  }

  canvas.replaceChildren();
  const viewportObserver = new MutationObserver(() => {
    if (applyViewport()) viewportObserver.disconnect();
  });
  viewportObserver.observe(canvas, { childList: true });
  gf.layer(nodes).render(canvas, { w: W, h: H });
  if (applyViewport()) viewportObserver.disconnect();
};

render();
