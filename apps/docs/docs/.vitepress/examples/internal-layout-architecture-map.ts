// Interactive internal-wiki figure: the conceptual order of GoFish's layout
// computations. DOM supplies the step controls; every diagram primitive is
// rendered by GoFish. This intentionally distinguishes the production stages
// from the explicit dependency schedule proposed by Core Layout Semantics v0.

const shell = document.createElement("section");
shell.className = "layout-architecture-map";

const controls = document.createElement("div");
controls.className = "layout-architecture-map__controls";

const canvas = document.createElement("div");
canvas.className = "layout-architecture-map__canvas";

const readout = document.createElement("div");
readout.className = "layout-architecture-map__readout";

const style = document.createElement("style");
style.textContent = `
  .layout-architecture-map *,
  .layout-architecture-map *::before,
  .layout-architecture-map *::after { animation: none !important; transition: none !important; }
  .layout-architecture-map { display: grid; gap: 12px; color: var(--vp-c-text-1); }
  .layout-architecture-map__controls { display: flex; flex-wrap: wrap; gap: 6px; }
  .layout-architecture-map__controls button { border: 1px solid var(--vp-c-divider); border-radius: 999px; padding: 6px 10px; color: var(--vp-c-text-1); background: var(--vp-c-bg-soft); cursor: pointer; font: inherit; font-size: 12px; }
  .layout-architecture-map__controls button[aria-pressed="true"] { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
  .layout-architecture-map__canvas { width: 100%; overflow-x: auto; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); }
  .layout-architecture-map__canvas > svg { display: block; width: 100%; height: auto; min-width: 820px; }
  .layout-architecture-map__readout { display: grid; grid-template-columns: minmax(100px, auto) 1fr; gap: 4px 14px; padding: 10px 12px; border-left: 3px solid var(--vp-c-brand-1); background: var(--vp-c-brand-soft); font-size: 13px; }
  .layout-architecture-map__readout strong { color: var(--vp-c-text-2); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
  .layout-architecture-map__readout code { overflow-wrap: anywhere; }
  @media (max-width: 520px) { .layout-architecture-map__readout { grid-template-columns: 1fr; } }
`;

shell.append(style, controls, canvas, readout);
root.append(shell);

const stages = [
  {
    id: "resolve",
    label: "1 · meaning",
    mechanism: "whole-program resolution",
    input: "surface nodes, names, channels, constraints",
    output: "stable identities, aliases, underlying spaces, elaborated chrome",
    note: "Axes, labels, titles, and legends become ordinary nodes before the root scale solve.",
  },
  {
    id: "scale",
    label: "2 · scale",
    mechanism: "production scope roots and ScopeRegistry",
    input: "symbolic claim C(σ) plus a pixel allocation",
    output: "σ and/or an anchored data-to-pixel map",
    note: "Today roots include the render root, coordinate boundaries, and some Layers. The target declares fit/inherit/share policy on Frames.",
  },
  {
    id: "intrinsic",
    label: "3 · intrinsic",
    mechanism: "recursive child layout",
    input: "proposals, scales, concrete mark metrics",
    output: "known mark sizes plus intrinsic or weak extents",
    note: "Text measurement and other concrete intrinsic work happen here; placement closure may still determine an unresolved span.",
  },
  {
    id: "place",
    label: "4 · placement",
    mechanism: "rank-two box closure then difference graphs",
    input: "intrinsic boxes and lowered anchor facts",
    output: "frame-local placed boxes",
    note: "Constraint declarations form one simultaneous fact set; their source order is not the scheduler.",
  },
  {
    id: "refs",
    label: "5 · refs",
    mechanism: "bounds, transport, and derived geometry",
    input: "already placed source geometry",
    output: "transported anchors, connectors, labels, enclosures",
    note: "Production still relies heavily on source-before-consumer tiering; the target makes these dependencies explicit.",
  },
  {
    id: "paint",
    label: "6 · paint",
    mechanism: "coordinate bake, paint DAG, display-list lowering",
    input: "finished geometry and explicit paint relations",
    output: "ordered display primitives and SVG",
    note: "Geometry may depend on a source that ultimately paints above it; computation order and paint order are separate.",
  },
];

let active = "resolve";

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
const GREEN = "#51931b";
const ORANGE = "#d9792b";
const PURPLE = "#7656b5";
const GREY = "#8d939a";
const INACTIVE = "#c7cbd0";
const TEXT = "#30343a";
const SOFT_BLUE = "rgba(58,123,181,.08)";
const SOFT_ORANGE = "rgba(217,121,43,.08)";

const label = (text, size, fill, weight) =>
  gf.text({
    text,
    fontSize: size || 11,
    fill: fill || TEXT,
    fontWeight: weight || "normal",
    textAnchor: "middle",
  });

const flowBox = (text, w, stage, color) => {
  const selected = active === stage;
  const fill = selected ? color : INACTIVE;
  return gf
    .layer([
      gf
        .rect({
          w,
          h: 38,
          rx: 7,
          fill,
          stroke: selected ? "white" : "#b2b6bb",
          strokeWidth: 1.5,
        })
        .name("r"),
      label(
        text,
        10.5,
        selected ? "white" : "#4b5056",
        selected ? "700" : "600"
      ).name("t"),
    ])
    .constrain(({ r, t }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [r, t]),
    ]);
};

const flowArrow = (glyph) => label(glyph || "→", 16, "#9aa0a6", "700");

const rowTag = (text, color) =>
  gf
    .layer([
      gf
        .rect({
          w: 82,
          h: 38,
          rx: 7,
          fill: "rgba(255,255,255,.62)",
          stroke: color,
          strokeWidth: 1,
        })
        .name("tagBg"),
      label(text, 9.5, color, "700").name("tagText"),
    ])
    .constrain(({ tagBg, tagText }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [tagBg, tagText]),
    ]);

const band = (title, body, noteLines, h, fill, stroke, titleColor) => {
  const content = gf.stackY({ spacing: 8, alignment: "middle" }, [
    label(title, 9, titleColor, "700"),
    body,
    ...noteLines.map((note) =>
      label(
        note.text,
        note.size || 9.5,
        note.color || GREY,
        note.weight || "600"
      )
    ),
  ]);

  return gf
    .layer([
      gf
        .rect({ w: 860, h, rx: 12, fill, stroke, strokeWidth: 1.25 })
        .name("bg"),
      content.name("content"),
    ])
    .constrain(({ bg, content: bandContent }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [bg, bandContent]),
    ]);
};

const renderDiagram = () => {
  const W = 900;
  const H = 560;

  // The non-recursive root driver. Elaboration may rewrite the tree, so the
  // affected resolution passes run again before root scale construction.
  const rootRow = gf.stackX({ spacing: 12, alignment: "middle" }, [
    flowBox("resolve tree", 126, "resolve", BLUE),
    flowArrow(),
    flowBox("elaborate + re-resolve", 162, "resolve", BLUE),
    flowArrow(),
    flowBox("solve root scopes", 136, "scale", GREEN),
  ]);
  const rootBand = band(
    "ROOT DRIVER",
    rootRow,
    [
      {
        text: "color · names · aliases · spaces · axes/labels/titles/legend",
      },
    ],
    102,
    "rgba(141,147,154,.06)",
    "#c5c9ce",
    GREY
  );

  // The crucial as-built interleaving: child.layout dispatches to different
  // recursive implementations. Layer and coordinate boundaries each establish
  // their own prerequisites before recursing, so there is not one global
  // intrinsic pass followed by one global placement pass today.
  const layerRow = gf.stackX({ spacing: 9, alignment: "middle" }, [
    flowBox("plan proposals + scopes", 150, "scale", GREEN),
    flowArrow(),
    flowBox("child.layout (recurse)", 142, "intrinsic", PURPLE),
    flowArrow(),
    flowBox("solve local facts", 116, "place", ORANGE),
    flowArrow(),
    flowBox("fold bounds", 100, "refs", BLUE),
  ]);
  const coordRow = gf.stackX({ spacing: 9, alignment: "middle" }, [
    flowBox("derive coord budget", 132, "scale", GREEN),
    flowArrow(),
    flowBox("solve local scopes", 120, "scale", GREEN),
    flowArrow(),
    flowBox("child.layout (recurse)", 142, "intrinsic", PURPLE),
    flowArrow(),
    flowBox("transform + fold", 118, "refs", BLUE),
  ]);
  const recursiveRows = gf.stackY({ spacing: 14, alignment: "middle" }, [
    gf.stackX({ spacing: 10, alignment: "middle" }, [
      rowTag("Layer", ORANGE),
      layerRow,
    ]),
    gf.stackX({ spacing: 10, alignment: "middle" }, [
      rowTag("coord / Frame", PURPLE),
      coordRow,
    ]),
  ]);
  const recursiveBand = band(
    "RECURSIVE child.layout DISPATCH",
    recursiveRows,
    [
      {
        text: "ordinary children: source order · nest: planned topological order",
        color: ORANGE,
      },
      {
        text: "refs work only after a source subtree has returned placed bounds",
        color: BLUE,
      },
    ],
    218,
    SOFT_BLUE,
    "#8db4d5",
    BLUE
  );

  // Geometry has returned before coordinate baking and display-list lowering.
  const renderRow = gf.stackX({ spacing: 12, alignment: "middle" }, [
    flowBox("bake coordinate scopes", 158, "paint", PURPLE),
    flowArrow(),
    flowBox("paint DAG + lower", 142, "paint", PURPLE),
    flowArrow(),
    flowBox("SVG", 70, "paint", PURPLE),
  ]);
  const renderBand = band(
    "RENDER",
    renderRow,
    [],
    82,
    "rgba(118,86,181,.06)",
    "#b5a4d4",
    PURPLE
  );

  const figure = gf.stackY({ spacing: 10, alignment: "middle" }, [
    label("PRODUCTION CONTROL FLOW · TOP TO BOTTOM", 9.5, GREY, "700"),
    rootBand,
    flowArrow("↓ child.layout(...) recursively"),
    recursiveBand,
    flowArrow("↓ root pin + final extents"),
    renderBand,
    label(
      "TARGET: explicit task edges replace hidden source-order prerequisites; paint stays separate",
      9.5,
      ORANGE,
      "700"
    ),
  ]);

  return figure.render(canvas, { w: W, h: H });
};

const renderReadout = () => {
  const stage = stages.find((candidate) => candidate.id === active);
  readout.replaceChildren();
  [
    ["Mechanism", stage.mechanism],
    ["Consumes", stage.input],
    ["Produces", stage.output],
    ["Important", stage.note],
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
