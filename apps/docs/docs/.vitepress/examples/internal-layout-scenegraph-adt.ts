// Internal-wiki figure: the authoring scene ADT and the normalized semantic
// relations it produces. The diagram is rendered entirely by GoFish and is
// deliberately static so no delayed motion obscures the distinctions.

const shell = document.createElement("section");
shell.className = "layout-scenegraph-adt";

const canvas = document.createElement("div");
canvas.className = "layout-scenegraph-adt__canvas";
canvas.setAttribute("role", "img");
canvas.setAttribute(
  "aria-label",
  "The authoring scene is an algebraic data type with Mark, Layer, Frame, and Derived variants. Normalization erases Layers, keeps nested Frame coordinate regions, assigns every node one writable Frame owner, groups scale identity separately, and turns references into dashed read-only dependencies from placed source ports to derived consumers."
);

const style = document.createElement("style");
style.textContent = `
  .layout-scenegraph-adt *,
  .layout-scenegraph-adt *::before,
  .layout-scenegraph-adt *::after {
    animation: none !important;
    transition: none !important;
  }
  .layout-scenegraph-adt {
    color: var(--vp-c-text-1);
  }
  .layout-scenegraph-adt__canvas {
    width: 100%;
    overflow-x: auto;
    border: 1px solid var(--vp-c-divider);
    border-radius: 14px;
    background: #fffefa;
  }
  .layout-scenegraph-adt__canvas > svg {
    display: block;
    width: 100%;
    height: auto;
    min-width: 0;
  }
  @media (max-width: 700px) {
    .layout-scenegraph-adt__canvas > svg {
      min-width: 760px;
    }
  }
`;

shell.append(style, canvas);
root.append(shell);

const W = 760;
const H = 615;

const palette = {
  ink: "#252150",
  text: "#30343a",
  muted: "#667085",
  quiet: "#a1a8b2",
  panel: "#fafaf8",
  panelStroke: "#dfe2e7",

  // Coordinate and scale colors match the scope map and the thesis planets:
  // a soft fill with a darker, offset stroke in the same hue.
  coordFill: "#fff3be",
  coordStroke: "#d8ad2d",
  coordInnerFill: "#f8e29a",
  coordInnerStroke: "#c99a1c",
  coordText: "#8a650f",
  scaleFill: "#ddcdf3",
  scaleStroke: "#8d63bd",
  scaleText: "#694093",

  targetFill: "#3e8ccc",
  targetStroke: "#2f6fa6",
  derivedFill: "#b9dfcf",
  derivedStroke: "#4f9b78",
  derivedText: "#2e6f53",
  ref: "#d9792b",
};

const at = (x, y, node) => gf.position({ x, y }, node);

const text = (value, size, fill, weight, anchor, family) =>
  gf.text({
    text: value,
    fontSize: size || 11,
    fill: fill || palette.text,
    fontWeight: weight || "normal",
    textAnchor: anchor || "middle",
    fontFamily: family,
  });

const card = ({ x, y, w, title, detail, fill, stroke, dashed = false }) => [
  at(
    x,
    y,
    gf.rect({
      w,
      h: 60,
      rx: 10,
      fill,
      stroke,
      strokeWidth: 2,
      strokeDasharray: dashed ? "7 5" : undefined,
    })
  ),
  at(
    x + 14,
    y + 20,
    text(
      title,
      11,
      palette.ink,
      "760",
      "start",
      "ui-monospace, SFMono-Regular, Menlo, monospace"
    )
  ),
  at(x + 14, y + 42, text(detail, 10, palette.muted, "600", "start")),
];

const planet = (name, label, x, y) =>
  at(
    x,
    y,
    gf
      .layer([
        gf
          .circle({
            r: 22,
            fill: palette.targetFill,
            stroke: palette.targetStroke,
            strokeWidth: 3,
          })
          .name(name),
        text(label, 13, "white", "760").name("label"),
      ])
      .constrain((targets) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [
          targets[name],
          targets.label,
        ]),
      ])
  );

const consumer = (name, label, x, y, w) =>
  at(
    x,
    y,
    gf
      .layer([
        gf
          .rect({
            w,
            h: 42,
            rx: 21,
            fill: palette.derivedFill,
            stroke: palette.derivedStroke,
            strokeWidth: 3,
          })
          .name(name),
        text(label, 10.5, palette.derivedText, "760").name("label"),
      ])
      .constrain((targets) => [
        gf.Constraint.align({ x: "middle", y: "middle" }, [
          targets[name],
          targets.label,
        ]),
      ])
  );

const dottedRoute = (x1, y1, x2, y2, count) =>
  Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    return at(
      x1 + (x2 - x1) * t,
      y1 + (y2 - y1) * t,
      gf.circle({ r: 2.1, fill: palette.ref })
    );
  });

const nodes = [
  // The authoring/elaborated ADT uses the full article width so its labels
  // remain readable beside the persistent glossary.
  at(380, 27, text("AUTHORING / ELABORATED TREE", 13, palette.ink, "760")),
  at(
    380,
    47,
    text(
      "recursive containment · not execution order",
      10,
      palette.muted,
      "650"
    )
  ),
  at(
    20,
    64,
    gf.rect({
      w: 720,
      h: 235,
      rx: 16,
      fill: palette.panel,
      stroke: palette.panelStroke,
      strokeWidth: 1.5,
    })
  ),
  at(
    45,
    84,
    text(
      "TARGET · Scene ::= Mark | Layer | Frame | Derived",
      11,
      palette.ink,
      "760",
      "start",
      "ui-monospace, SFMono-Regular, Menlo, monospace"
    )
  ),
  ...card({
    x: 45,
    y: 106,
    w: 320,
    title: "Mark(id, intrinsicSpec)",
    detail: "symbolic claim → intrinsic geometry",
    fill: "#dbeafa",
    stroke: palette.targetStroke,
  }),
  ...card({
    x: 395,
    y: 106,
    w: 320,
    title: "Layer(children, declarations)",
    detail: "transparent syntax · no semantic boundary",
    fill: "transparent",
    stroke: palette.quiet,
    dashed: true,
  }),
  ...card({
    x: 45,
    y: 176,
    w: 320,
    title: "Frame(id, body, extent², scale², coord?)",
    detail: "allocation + coordinate + local-write boundary",
    fill: palette.coordFill,
    stroke: palette.coordStroke,
  }),
  ...card({
    x: 395,
    y: 176,
    w: 320,
    title: "Derived(id, RefQuery*, build)",
    detail: "waits for completed geometry ports",
    fill: palette.derivedFill,
    stroke: palette.derivedStroke,
  }),
  at(
    45,
    251,
    gf.rect({
      w: 670,
      h: 30,
      rx: 8,
      fill: "#f1f2f4",
      stroke: palette.panelStroke,
      strokeWidth: 1.2,
    })
  ),
  at(
    380,
    270,
    text(
      "AS BUILT · GoFishAST = GoFishNode | GoFishRef · semantic cases share one generic carrier",
      10,
      palette.ink,
      "760",
      "middle",
      "ui-monospace, SFMono-Regular, Menlo, monospace"
    )
  ),

  // Normalization is a compilation step, not tree or execution order.
  at(380, 315, text("↓", 25, palette.quiet, "500")),
  at(
    380,
    333,
    text(
      "resolve stable IDs · flatten Layers · expose dependencies",
      10,
      palette.muted,
      "700"
    )
  ),
  at(380, 356, text("NORMALIZED CORE", 13, palette.ink, "760")),
  at(
    380,
    374,
    text(
      "one tree projected into explicit semantic relations",
      10,
      palette.muted,
      "650"
    )
  ),

  // Frame R is both a coordinate context and a writable region.
  at(
    20,
    390,
    gf.rect({
      w: 720,
      h: 218,
      rx: 18,
      fill: palette.coordFill,
      stroke: palette.coordStroke,
      strokeWidth: 3,
    })
  ),
  at(
    42,
    412,
    text("Frame R · κᴿ · owner R", 11, palette.coordText, "760", "start")
  ),
  at(718, 412, text("scaleᴿ = pixel", 9.5, palette.coordText, "700", "end")),

  // Child Frame P has an outer shell in R and a body owned by P.
  at(
    47,
    432,
    gf.rect({
      w: 326,
      h: 139,
      rx: 16,
      fill: palette.coordInnerFill,
      stroke: palette.coordInnerStroke,
      strokeWidth: 3,
    })
  ),
  at(62, 451, text("shell(P) ∈ R", 9.5, palette.coordText, "760", "start")),
  at(358, 451, text("body owner = P", 9.5, palette.coordText, "760", "end")),

  // The purple scale identity is distinct from the yellow coordinate region.
  at(
    95,
    466,
    gf.ellipse({
      w: 225,
      h: 91,
      fill: palette.scaleFill,
      stroke: palette.scaleStroke,
      strokeWidth: 3,
    })
  ),
  at(208, 482, text("radial ScaleId ρ", 9.5, palette.scaleText, "760")),

  // Static GoFish marks make the relation types explicit without relying on
  // layout-time reference resolution inside this explanatory figure.
  at(
    166,
    521,
    gf.rect({
      w: 62,
      h: 3,
      rx: 1.5,
      fill: palette.targetStroke,
    })
  ),
  ...dottedRoute(146, 506, 472, 459, 15),
  ...dottedRoute(273, 516, 472, 459, 10),
  ...dottedRoute(273, 524, 500, 531, 12),
  at(457, 457, text("›", 15, palette.ref, "760")),
  at(487, 530, text("›", 15, palette.ref, "760")),

  planet("adt-p", "p", 122, 505),
  planet("adt-q", "q", 250, 514),
  consumer("adt-connector", "connector", 472, 438, 146),
  consumer("adt-label", "label", 500, 510, 112),

  at(
    208,
    557,
    text(
      "solid blue · one local fact set in P",
      9.5,
      palette.targetStroke,
      "700"
    )
  ),
  at(
    552,
    558,
    text("dashed orange · PlacedRef ports", 9.5, palette.ref, "700")
  ),
  at(
    401,
    575,
    gf.rect({
      w: 314,
      h: 23,
      rx: 7,
      fill: "rgba(255,255,255,.68)",
      stroke: palette.panelStroke,
      strokeWidth: 1.2,
    })
  ),
  at(
    558,
    590,
    text(
      "Layer is gone · task dependencies ≠ paint edges",
      9,
      palette.ink,
      "760"
    )
  ),
];

const applyViewport = () => {
  const svg = canvas.querySelector("svg");
  if (!svg) return false;

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
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
