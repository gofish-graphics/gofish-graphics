// Internal-wiki figure: coordinate scopes and scale identities are two
// different structures carried by the same scenegraph.
//
// The diagram itself is rendered by GoFish. It is intentionally static: the
// semantic distinctions should be visible at a glance, with no animation or
// delayed state to obscure them.

const shell = document.createElement("section");
shell.className = "layout-scope-map";

const canvas = document.createElement("div");
canvas.className = "layout-scope-map__canvas";
canvas.setAttribute(
  "aria-label",
  "Target scope map. A yellow Cartesian coordinate scope contains a yellow polar coordinate scope. A purple radial scale scope surrounds two source points inside the polar scope. Read-only placed-reference arrows leave the polar scope for a connector and label without extending the purple scale scope."
);

const style = document.createElement("style");
style.textContent = `
  .layout-scope-map *,
  .layout-scope-map *::before,
  .layout-scope-map *::after {
    animation: none !important;
    transition: none !important;
  }
  .layout-scope-map {
    color: var(--vp-c-text-1);
  }
  .layout-scope-map__canvas {
    width: 100%;
    overflow-x: auto;
    border: 1px solid var(--vp-c-divider);
    border-radius: 14px;
    background: #fffefa;
  }
  .layout-scope-map__canvas > svg {
    display: block;
    width: 100%;
    height: auto;
    min-width: 680px;
  }
`;

shell.append(style, canvas);
root.append(shell);

const W = 780;
const H = 600;

const palette = {
  ink: "#252150",
  text: "#30343a",
  muted: "#667085",
  quiet: "#a1a8b2",
  panel: "#fafaf8",
  panelStroke: "#dfe2e7",

  // Like the thesis planets, each scope pairs a light fill with a darker,
  // still-saturated stroke of roughly the same hue.
  coordFill: "#fff3be",
  coordStroke: "#d8ad2d",
  coordInnerFill: "#f8e29a",
  coordInnerStroke: "#c99a1c",
  coordText: "#8a650f",
  scaleFill: "#ddcdf3",
  scaleStroke: "#8d63bd",
  scaleText: "#694093",

  // Planet palette from the thesis reveal.js deck.
  earthFill: "#3e8ccc",
  earthStroke: "#2f6fa6",
  marsFill: "#f4bc80",
  marsStroke: "#e0954c",
  mercuryFill: "#f5e3c8",
  mercuryStroke: "#efc9a2",
  greenFill: "#b9dfcf",
  greenStroke: "#4f9b78",
};

const at = (x, y, node) => gf.position({ x, y }, node);

const text = (value, size, fill, weight, anchor) =>
  gf.text({
    text: value,
    fontSize: size || 11,
    fill: fill || palette.text,
    fontWeight: weight || "normal",
    textAnchor: anchor || "middle",
  });

const portEdge = (from, to) =>
  gf.line(
    {
      stroke: palette.muted,
      strokeWidth: 1.8,
      strokeDasharray: "6 5",
      source: { x: "end", y: "middle" },
      target: { x: "start", y: "middle" },
    },
    [gf.ref(from), gf.ref(to)]
  );

const planetNode = (name, label, x, y, fill, stroke, labelFill) =>
  at(
    x,
    y,
    gf
      .layer([
        gf.circle({ r: 24, fill, stroke, strokeWidth: 3 }).name(name),
        text(label, 14, labelFill || "white", "760").name("label"),
      ])
      .constrain((targets) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [
          targets[name],
          targets.label,
        ]),
      ])
  );

const consumer = (name, label, x, y, w, fill, stroke, labelFill) =>
  at(
    x,
    y,
    gf
      .layer([
        gf.rect({ w, h: 44, rx: 22, fill, stroke, strokeWidth: 3 }).name(name),
        text(label, 11, labelFill || palette.text, "700").name("label"),
      ])
      .constrain((targets) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [
          targets[name],
          targets.label,
        ]),
      ])
  );

const policyPanel = (x, title, detail, iconNodes) => {
  const panelNodes = [
    at(
      x,
      443,
      gf.rect({
        w: 166,
        h: 126,
        rx: 12,
        fill: palette.panel,
        stroke: palette.panelStroke,
        strokeWidth: 1.25,
      })
    ),
    at(x + 83, 454, text(title, 11, palette.ink, "760")),
    ...iconNodes,
    at(x + 83, 541, text(detail, 9.5, palette.muted, "650")),
  ];
  return panelNodes;
};

const nodes = [
  // Outer Frame / coordinate scope.
  at(
    24,
    26,
    gf.rect({
      w: 732,
      h: 374,
      rx: 22,
      fill: palette.coordFill,
      stroke: palette.coordStroke,
      strokeWidth: 3,
    })
  ),

  // A Layer is visible only as neutral syntax. It contributes all three
  // children to Frame R but opens no semantic scope.
  at(
    52,
    68,
    gf.rect({
      w: 676,
      h: 300,
      rx: 17,
      fill: "transparent",
      stroke: palette.quiet,
      strokeWidth: 1.5,
      strokeDasharray: "7 6",
    })
  ),

  // Nested polar coordinate scope: yellow scopes form a strict Frame tree.
  at(
    78,
    78,
    gf.ellipse({
      w: 300,
      h: 276,
      fill: palette.coordInnerFill,
      stroke: palette.coordInnerStroke,
      strokeWidth: 3,
    })
  ),

  // One axis's locally fitted scale identity. It is deliberately smaller
  // than the coordinate scope rather than being treated as the same region.
  at(
    116,
    132,
    gf.ellipse({
      w: 224,
      h: 170,
      fill: palette.scaleFill,
      stroke: palette.scaleStroke,
      strokeWidth: 3,
    })
  ),

  planetNode(
    "scope-map-p",
    "p",
    156,
    196,
    palette.earthFill,
    palette.earthStroke,
    "white"
  ),
  planetNode(
    "scope-map-q",
    "q",
    261,
    234,
    palette.marsFill,
    palette.marsStroke,
    palette.ink
  ),
  consumer(
    "scope-map-connector",
    "connector(p, q)",
    462,
    148,
    178,
    palette.greenFill,
    palette.greenStroke,
    "#2e6f53"
  ),
  consumer(
    "scope-map-label",
    "label(q)",
    520,
    250,
    118,
    palette.mercuryFill,
    palette.mercuryStroke,
    palette.ink
  ),

  // Placed geometry may leave P. These arrows are observations, not scale
  // edges, so they cross the yellow boundary without extending the purple one.
  portEdge("scope-map-p", "scope-map-connector"),
  portEdge("scope-map-q", "scope-map-connector"),
  portEdge("scope-map-q", "scope-map-label"),

  at(
    47,
    43,
    text(
      "Frame R · Cartesian coordinate scope Φᴿ",
      12,
      palette.coordText,
      "760",
      "start"
    )
  ),
  at(635, 43, text("TARGET · one axis shown", 9.5, palette.coordText, "760")),
  at(
    228,
    95,
    text("Frame P · polar coordinate scope Φᴾ→ᴿ", 10, palette.coordText, "760")
  ),
  at(
    228,
    146,
    text("radial scale scope Sᵣ · fit in P", 10, palette.scaleText, "760")
  ),
  at(540, 214, text("PlacedRef ports → consumers", 10, palette.muted, "760")),
  at(
    540,
    229,
    text("finished geometry · read-only", 9.5, palette.muted, "600")
  ),
  at(
    607,
    342,
    text("Layer · syntax only, not a scope", 9.5, palette.muted, "700")
  ),
  at(
    228,
    327,
    text("Sᵣ stays in its source Frame", 9.5, palette.scaleText, "700")
  ),

  at(
    390,
    415,
    text(
      "Scale policy changes purple membership; it does not change the yellow coordinate tree",
      10.5,
      palette.text,
      "700"
    )
  ),
];

// fit: one new purple identity is owned locally.
nodes.push(
  ...policyPanel(24, "fit", "new local S", [
    at(
      68,
      480,
      gf.rect({
        w: 78,
        h: 48,
        rx: 8,
        fill: palette.coordFill,
        stroke: palette.coordStroke,
        strokeWidth: 2,
      })
    ),
    at(
      92,
      491,
      gf.ellipse({
        w: 30,
        h: 26,
        fill: palette.scaleFill,
        stroke: palette.scaleStroke,
        strokeWidth: 2.5,
      })
    ),
    at(107, 497, text("S", 9, palette.scaleText, "760")),
  ])
);

// inherit: the same scale identity remains accessible across a nested Frame.
nodes.push(
  ...policyPanel(214, "inherit", "reuse ancestor S", [
    at(
      258,
      480,
      gf.rect({
        w: 78,
        h: 48,
        rx: 8,
        fill: palette.coordFill,
        stroke: palette.coordStroke,
        strokeWidth: 2,
      })
    ),
    at(
      296,
      487,
      gf.ellipse({
        w: 31,
        h: 31,
        fill: palette.coordInnerFill,
        stroke: palette.coordInnerStroke,
        strokeWidth: 2,
      })
    ),
    at(271, 502, gf.rect({ w: 46, h: 3, rx: 1.5, fill: palette.scaleStroke })),
    at(267, 500, gf.circle({ r: 5, fill: palette.scaleStroke })),
    at(313, 500, gf.circle({ r: 5, fill: palette.scaleStroke })),
    at(289, 487, text("S", 9, palette.scaleText, "760")),
  ])
);

// share(k): membership can be non-contiguous, so it is shown as linked islands
// rather than one misleading purple enclosure.
nodes.push(
  ...policyPanel(404, "share(k)", "linked Sₖ islands", [
    at(
      430,
      484,
      gf.rect({
        w: 42,
        h: 38,
        rx: 7,
        fill: palette.coordFill,
        stroke: palette.coordStroke,
        strokeWidth: 2,
      })
    ),
    at(
      502,
      484,
      gf.rect({
        w: 42,
        h: 38,
        rx: 7,
        fill: palette.coordFill,
        stroke: palette.coordStroke,
        strokeWidth: 2,
      })
    ),
    at(460, 502, gf.rect({ w: 7, h: 3, fill: palette.scaleStroke })),
    at(472, 502, gf.rect({ w: 7, h: 3, fill: palette.scaleStroke })),
    at(484, 502, gf.rect({ w: 7, h: 3, fill: palette.scaleStroke })),
    at(496, 502, gf.rect({ w: 7, h: 3, fill: palette.scaleStroke })),
    at(508, 502, gf.rect({ w: 7, h: 3, fill: palette.scaleStroke })),
    at(
      440,
      493,
      gf.ellipse({
        w: 19,
        h: 19,
        fill: palette.scaleFill,
        stroke: palette.scaleStroke,
        strokeWidth: 2,
      })
    ),
    at(
      512,
      493,
      gf.ellipse({
        w: 19,
        h: 19,
        fill: palette.scaleFill,
        stroke: palette.scaleStroke,
        strokeWidth: 2,
      })
    ),
    at(487, 485, text("k", 9, palette.scaleText, "760")),
  ])
);

// pixel: a coordinate scope with local geometric units and no data scale.
nodes.push(
  ...policyPanel(594, "pixel", "no data scale", [
    at(
      638,
      480,
      gf.rect({
        w: 78,
        h: 48,
        rx: 8,
        fill: palette.coordFill,
        stroke: palette.coordStroke,
        strokeWidth: 2,
      })
    ),
    at(677, 493, text("px", 13, palette.coordText, "760")),
  ])
);

const applyViewport = () => {
  const svg = canvas.querySelector("svg");
  if (!svg) return false;

  // GoFish currently sizes this absolute-positioned Layer from its conservative
  // size request, which is wider than the actual drawing. Supply the intended
  // viewport explicitly so the complete scope map scales into the article column.
  svg.setAttribute("viewBox", `40 40 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return true;
};

const viewportObserver = new MutationObserver(() => {
  if (applyViewport()) viewportObserver.disconnect();
});
viewportObserver.observe(canvas, { childList: true });

gf.layer(nodes).render(canvas, { w: W, h: H });
if (applyViewport()) viewportObserver.disconnect();
