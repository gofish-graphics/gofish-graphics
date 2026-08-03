// Interactive internal-wiki figure: one semi-abstract scenegraph carried
// through scale, placement, cross-Frame observation, and paint. DOM supplies
// the step controls; the scenegraph diagram and toy output are drawn by GoFish.

const shell = document.createElement("section");
shell.className = "frame-scenegraph-tour";

const controls = document.createElement("div");
controls.className = "frame-scenegraph-tour__controls";

const canvas = document.createElement("div");
canvas.className = "frame-scenegraph-tour__canvas";

const readout = document.createElement("div");
readout.className = "frame-scenegraph-tour__readout";

const style = document.createElement("style");
style.textContent = `
  .frame-scenegraph-tour *,
  .frame-scenegraph-tour *::before,
  .frame-scenegraph-tour *::after { animation: none !important; transition: none !important; }
  .frame-scenegraph-tour { display: grid; gap: 12px; color: var(--vp-c-text-1); }
  .frame-scenegraph-tour__controls { display: flex; flex-wrap: wrap; gap: 6px; }
  .frame-scenegraph-tour__controls button { border: 1px solid var(--vp-c-divider); border-radius: 999px; padding: 6px 10px; color: var(--vp-c-text-1); background: var(--vp-c-bg-soft); cursor: pointer; font: inherit; font-size: 12px; }
  .frame-scenegraph-tour__controls button[aria-pressed="true"] { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
  .frame-scenegraph-tour__canvas { width: 100%; overflow-x: auto; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); }
  .frame-scenegraph-tour__canvas > svg { display: block; width: 100%; height: auto; min-width: 620px; }
  .frame-scenegraph-tour__readout { display: grid; grid-template-columns: minmax(105px, auto) 1fr; gap: 4px 14px; padding: 10px 12px; border-left: 3px solid #7656b5; background: rgba(118,86,181,.09); font-size: 13px; }
  .frame-scenegraph-tour__readout strong { color: var(--vp-c-text-2); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
  @media (max-width: 520px) { .frame-scenegraph-tour__readout { grid-template-columns: 1fr; } }
`;

shell.append(style, controls, canvas, readout);
root.append(shell);

const stages = [
  {
    id: "structure",
    label: "1 · structure",
    focus: "Frame and Layer boundaries",
    source: "Layer contributes nodes and facts to its nearest Frame.",
    consumer:
      "The Cartesian root and polar child are distinct coordinate regions.",
    invariant:
      "A transparent Layer owns no scale, transform, or scheduling phase.",
  },
  {
    id: "scale",
    label: "2 · scale",
    focus: "scale ownership",
    source:
      "Frame P fits the points' scale-dependent extent in polar axes and owns σₚ.",
    consumer:
      "The root Frame does not re-solve σₚ merely because it observes a point.",
    invariant: "The LCA is a transport rendezvous, not a scale owner.",
  },
  {
    id: "place",
    label: "3 · place",
    focus: "source-home geometry",
    source: "p and q receive fixed positions inside Frame P.",
    consumer:
      "The connector and label are still waiting on exported bounds or anchors.",
    invariant:
      "Placement facts inside P cannot be written by the outer consumer.",
  },
  {
    id: "transport",
    label: "4 · transport",
    focus: "PlacedRef observation",
    source: "p and q export point-anchor ports after their bounds are known.",
    consumer:
      "The ports are transported into Cartesian root coordinates as constants.",
    invariant:
      "Observing p or q neither moves them nor contributes their scale-dependent extent again.",
  },
  {
    id: "paint",
    label: "5 · paint",
    focus: "separate paint program",
    source: "All geometry is complete before the display list is ordered.",
    consumer:
      "The connector can paint behind p and q despite depending on them geometrically.",
    invariant:
      "Computation order and z/paint order are different partial orders.",
  },
];

let active = "structure";

stages.forEach((stage) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = stage.label;
  button.dataset.stage = stage.id;
  button.addEventListener("click", () => {
    active = stage.id;
    render();
  });
  controls.append(button);
});

const BLUE = "#3a7bb5";
const PURPLE = "#7656b5";
const GREEN = "#51931b";
const ORANGE = "#d9792b";
const GREY = "#8d939a";
const TEXT = "#30343a";

const label = (text, size, fill, weight) =>
  gf.text({
    text,
    fontSize: size || 11,
    fill: fill || TEXT,
    fontWeight: weight || "normal",
    textAnchor: "middle",
  });

const pill = (text, x, y, w, fill, stroke, textFill) =>
  gf.position(
    { x, y },
    gf
      .layer([
        gf
          .rect({
            w,
            h: 30,
            rx: 6,
            fill,
            stroke,
            strokeWidth: 1.25,
          })
          .name("r"),
        label(text, 10, textFill || TEXT, "650").name("t"),
      ])
      .constrain(({ r, t }) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [r, t]),
      ])
  );

const backdrop = (x, y, w, h, fill, stroke) =>
  gf.position(
    { x, y },
    gf.rect({ w, h, rx: 13, fill, stroke, strokeWidth: 1.5 })
  );

const renderDiagram = () => {
  const W = 680;
  const H = 410;
  const nodes = [];

  // Left: a semi-abstract scenegraph whose backgrounds encode semantic scope.
  nodes.push(backdrop(20, 18, 300, 374, "rgba(58,123,181,.07)", "#78a5cc"));
  nodes.push(
    gf.position(
      { x: 98, y: 361 },
      label("Frame R · Cartesian", 11, BLUE, "700")
    )
  );
  nodes.push(
    gf.position(
      { x: 252, y: 361 },
      label("scale: pixel / inherit", 9.5, GREY, "600")
    )
  );

  // Layer is deliberately unfilled: it groups declarations without owning a
  // coordinate or scale region.
  nodes.push(backdrop(34, 48, 272, 318, "rgba(255,255,255,0)", "#b8bdc2"));
  nodes.push(
    gf.position(
      { x: 104, y: 333 },
      label("Layer · transparent", 9.5, GREY, "700")
    )
  );

  // The polar Frame is the only nested semantic boundary.
  const polarStrong = ["structure", "scale", "place"].includes(active);
  nodes.push(
    backdrop(
      58,
      142,
      224,
      150,
      polarStrong ? "rgba(118,86,181,.16)" : "rgba(118,86,181,.08)",
      PURPLE
    )
  );
  nodes.push(
    gf.position(
      { x: 116, y: 271 },
      label("Frame P · polar", 10.5, PURPLE, "700")
    )
  );
  nodes.push(
    gf.position(
      { x: 226, y: 271 },
      label(
        active === "scale" ? "owns σₚ" : "coord + scale boundary",
        9,
        PURPLE,
        "600"
      )
    )
  );
  nodes.push(pill("point p", 88, 214, 78, "white", PURPLE, PURPLE));
  nodes.push(pill("point q", 181, 173, 78, "white", PURPLE, PURPLE));

  const consumerFill = ["transport", "paint"].includes(active)
    ? "rgba(81,147,27,.18)"
    : "white";
  nodes.push(
    pill("connector(ref p,q)", 76, 91, 168, consumerFill, GREEN, GREEN)
  );
  nodes.push(pill("label(ref q)", 96, 53, 128, consumerFill, GREEN, GREEN));

  // Tree edges and the explicit boundary crossing.
  nodes.push(
    gf.position(
      { x: 170, y: 131 },
      label(
        "↓ placed anchors leave P read-only",
        9.5,
        active === "transport" ? ORANGE : GREY,
        "650"
      )
    )
  );
  nodes.push(
    gf.position(
      { x: 170, y: 31 },
      label("one root-Frame derived-geometry region", 9, BLUE, "600")
    )
  );

  // Right: the toy scene after source-home placement and Cartesian transport.
  nodes.push(backdrop(360, 18, 300, 374, "rgba(141,147,154,.05)", "#c5c9ce"));
  nodes.push(
    gf.position(
      { x: 510, y: 361 },
      label("Resolved geometry in Frame R", 11, TEXT, "700")
    )
  );
  nodes.push(
    gf.position(
      { x: 401, y: 109 },
      gf.ellipse({
        w: 218,
        h: 218,
        fill: "rgba(118,86,181,.06)",
        stroke: PURPLE,
        strokeWidth: 1.5,
      })
    )
  );
  nodes.push(
    gf.position(
      { x: 439, y: 147 },
      gf.ellipse({
        w: 142,
        h: 142,
        fill: "transparent",
        stroke: "#d7d0e5",
        strokeWidth: 1,
      })
    )
  );
  nodes.push(
    gf.position(
      { x: 475, y: 183 },
      gf.ellipse({
        w: 70,
        h: 70,
        fill: "transparent",
        stroke: "#e6e1ef",
        strokeWidth: 1,
      })
    )
  );
  nodes.push(
    gf.position(
      { x: 510, y: 330 },
      label("polar source region", 9.5, PURPLE, "650")
    )
  );

  const pointOpacity = active === "structure" || active === "scale" ? 0.38 : 1;
  const P = gf.createName("toy-p");
  const Q = gf.createName("toy-q");
  const pointTier = gf.layer([
    gf
      .position(
        { x: 434, y: 232 },
        gf.ellipse({
          w: 16,
          h: 16,
          fill: `rgba(217,121,43,${pointOpacity})`,
          stroke: "white",
          strokeWidth: 2,
        })
      )
      .name(P),
    gf
      .position(
        { x: 550, y: 170 },
        gf.ellipse({
          w: 16,
          h: 16,
          fill: `rgba(58,123,181,${pointOpacity})`,
          stroke: "white",
          strokeWidth: 2,
        })
      )
      .name(Q),
  ]);
  nodes.push(pointTier);

  if (["transport", "paint"].includes(active)) {
    nodes.push(
      gf
        .line({ stroke: GREEN, strokeWidth: 3 }, [gf.ref(P), gf.ref(Q)])
        .zOrder(active === "paint" ? -1 : 0)
    );
    nodes.push(
      pill("label q", 566, 142, 76, "rgba(81,147,27,.14)", GREEN, GREEN)
    );
    nodes.push(
      gf.position(
        { x: 510, y: 91 },
        label(
          "Cartesian connector from transported point ports",
          9.5,
          GREEN,
          "650"
        )
      )
    );
  } else {
    nodes.push(
      gf.position(
        { x: 510, y: 91 },
        label("connector + label waiting on source bounds", 9.5, GREY, "650")
      )
    );
  }

  if (active === "scale") {
    nodes.push(
      gf.position(
        { x: 510, y: 57 },
        label("σₚ solved here; not at the LCA", 10, PURPLE, "700")
      )
    );
  }
  if (active === "place") {
    nodes.push(
      gf.position(
        { x: 510, y: 57 },
        label("p and q are now fixed at home", 10, ORANGE, "700")
      )
    );
  }
  if (active === "transport") {
    nodes.push(
      gf.position(
        { x: 510, y: 57 },
        label("Φ(P→R)(anchor) → Cartesian constant", 10, ORANGE, "700")
      )
    );
  }
  if (active === "paint") {
    nodes.push(
      gf.position(
        { x: 510, y: 57 },
        label("connector z=-1 · points paint above", 10, PURPLE, "700")
      )
    );
  }

  return gf.layer(nodes).render(canvas, { w: W, h: H });
};

const renderReadout = () => {
  const stage = stages.find((candidate) => candidate.id === active);
  readout.replaceChildren();
  [
    ["Focus", stage.focus],
    ["Source subtree", stage.source],
    ["Consumer", stage.consumer],
    ["Invariant", stage.invariant],
  ].forEach(([key, value]) => {
    const heading = document.createElement("strong");
    heading.textContent = key;
    const body = document.createElement("span");
    body.textContent = value;
    readout.append(heading, body);
  });
};

const render = () => {
  controls.querySelectorAll("button").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      button.dataset.stage === active ? "true" : "false"
    );
  });
  canvas.replaceChildren();
  renderDiagram();
  renderReadout();
};

render();
