// Internal-wiki lab: three reference authorities.
//
// Each tab renders a concrete GoFish scene. The status cards distinguish what
// the production engine does today from the proposed Frame/PlacedRef contract.

const colors = {
  ink: "#243042",
  muted: "#667085",
  border: "#d9e0ea",
  blue: "#3662d0",
  blueSoft: "#e4ecff",
  green: "#21845a",
  greenSoft: "#dcf3e8",
  amber: "#a15c00",
  amberSoft: "#fff0cf",
  red: "#bd3f3f",
  redSoft: "#ffeded",
  edge: "#91a0b4",
};

const style = document.createElement("style");
style.textContent = `
  .gf-reference-boundary-chart svg {
    display: block;
    width: 100%;
    max-width: 720px;
    height: auto;
    margin: 0 auto;
  }
  .gf-reference-boundary-lab *,
  .gf-reference-boundary-lab *::before,
  .gf-reference-boundary-lab *::after {
    animation: none !important;
    transition: none !important;
  }
`;

const shell = document.createElement("section");
shell.className = "gf-reference-boundary-lab";
shell.setAttribute("aria-label", "Interactive reference-boundary explorer");
Object.assign(shell.style, {
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  background: "var(--vp-c-bg, white)",
  color: "var(--vp-c-text-1, #243042)",
  padding: "14px",
  boxSizing: "border-box",
  maxWidth: "760px",
  boxShadow: "0 8px 28px rgba(36, 48, 66, 0.06)",
});

const tabList = document.createElement("div");
tabList.setAttribute("role", "tablist");
tabList.setAttribute("aria-label", "Reference kind");
Object.assign(tabList.style, {
  display: "flex",
  flexWrap: "wrap",
  gap: "7px",
  marginBottom: "10px",
});

const summary = document.createElement("div");
Object.assign(summary.style, {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "8px",
  marginBottom: "10px",
});

const makeStatusCard = (label, tone) => {
  const card = document.createElement("div");
  const heading = document.createElement("div");
  const body = document.createElement("div");

  heading.textContent = label;
  Object.assign(heading.style, {
    fontSize: "11px",
    fontWeight: "800",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "4px",
  });
  Object.assign(body.style, {
    fontSize: "11.5px",
    lineHeight: "1.45",
    color: "var(--vp-c-text-1, #243042)",
  });
  Object.assign(card.style, {
    border: `1px solid ${tone.border}`,
    borderRadius: "9px",
    background: tone.bg,
    padding: "9px 11px",
  });
  heading.style.color = tone.ink;
  card.append(heading, body);
  return { card, body, heading };
};

const currentCard = makeStatusCard("Current engine", {
  bg: colors.amberSoft,
  border: "#e7bd68",
  ink: colors.amber,
});
const targetCard = makeStatusCard("Target semantics", {
  bg: colors.greenSoft,
  border: "#91cfb2",
  ink: colors.green,
});
summary.append(currentCard.card, targetCard.card);

const chartHost = document.createElement("div");
chartHost.className = "gf-reference-boundary-chart";
chartHost.setAttribute("role", "img");
Object.assign(chartHost.style, {
  width: "100%",
  minHeight: "220px",
  overflow: "hidden",
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  background: "white",
});

const footnote = document.createElement("div");
Object.assign(footnote.style, {
  color: "var(--vp-c-text-2, #667085)",
  fontSize: "11px",
  lineHeight: "1.45",
  marginTop: "8px",
});

shell.append(tabList, summary, chartHost, footnote);
root.append(style, shell);

const labeledBox = (label, fill, w, h) =>
  gf
    .layer([
      gf
        .rect({
          w,
          h,
          fill,
          rx: 7,
          stroke: "white",
          strokeWidth: 1.5,
        })
        .name("shape"),
      gf
        .text({
          text: label,
          fill: "white",
          fontSize: 13,
          fontWeight: "700",
        })
        .name("label"),
    ])
    .constrain(({ shape, label: textLabel }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [shape, textLabel]),
    ]);

const outlinedPill = (label, color, w) =>
  gf
    .layer([
      gf
        .rect({
          w,
          h: 30,
          fill: "#f8fafc",
          stroke: color,
          strokeWidth: 1.5,
          rx: 15,
        })
        .name("shape"),
      gf
        .text({
          text: label,
          fill: color,
          fontSize: 10.5,
          fontWeight: "700",
        })
        .name("label"),
    ])
    .constrain(({ shape, label: textLabel }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [shape, textLabel]),
    ]);

const makeLocalScene = () => {
  const jointSolve = gf
    .layer([
      labeledBox("A", colors.blue, 86, 48).name("a"),
      labeledBox("B", colors.green, 112, 62).name("b"),
    ])
    .constrain(({ a, b }) => [
      gf.Constraint.align({ y: "middle" }, [a, b]),
      gf.Constraint.distribute({ dir: "x", spacing: 54, anchor: "edge" }, [
        a,
        b,
      ]),
    ]);

  const authority = gf.stackX({ spacing: 10, alignment: "middle" }, [
    outlinedPill("ConstraintTarget(A)", colors.blue, 150),
    gf.text({ text: "⇄  joint equations  ⇄", fill: colors.edge, fontSize: 12 }),
    outlinedPill("ConstraintTarget(B)", colors.green, 150),
  ]);

  return gf.stackY(
    { spacing: 34, alignment: "middle" },
    [
      gf.text({
        text: "Same Frame · both placements are writable",
        fill: colors.ink,
        fontSize: 12,
        fontWeight: "650",
      }),
      jointSolve,
      authority,
      gf.text({
        text: "align + distribute lower into one simultaneous fact set",
        fill: colors.muted,
        fontSize: 10.5,
      }),
    ].reverse()
  );
};

const makeNode = (label, fill) =>
  gf
    .layer([
      gf
        .rect({
          w: 86,
          h: 46,
          fill,
          rx: 8,
          stroke: "white",
          strokeWidth: 1.5,
        })
        .name("shape"),
      gf
        .text({
          text: label,
          fill: "white",
          fontSize: 14,
          fontWeight: "750",
        })
        .name("label"),
    ])
    .constrain(({ shape, label: textLabel }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [shape, textLabel]),
    ]);

const makePlacedRefScene = () => {
  const A = gf.createName("A");
  const B = gf.createName("B");
  const C = gf.createName("C");

  const sourceTier = gf
    .layer([
      makeNode("A", colors.blue).name(A),
      makeNode("B", colors.green).name(B),
      makeNode("C", "#b66b13").name(C),
    ])
    .constrain((c) => [
      gf.Constraint.align({ y: "middle" }, [c.A, c.B, c.C]),
      gf.Constraint.distribute({ dir: "x", spacing: 64, anchor: "edge" }, [
        c.A,
        c.B,
        c.C,
      ]),
    ]);

  const nodeLink = gf.layer([
    sourceTier,
    gf
      .line(
        {
          stroke: colors.edge,
          strokeWidth: 2.5,
          source: ["end", "middle"],
          target: ["start", "middle"],
        },
        [gf.ref(A), gf.ref(B)]
      )
      .zOrder(-1),
    gf
      .line(
        {
          stroke: colors.edge,
          strokeWidth: 2.5,
          source: ["end", "middle"],
          target: ["start", "middle"],
        },
        [gf.ref(B), gf.ref(C)]
      )
      .zOrder(-1),
  ]);

  const dependency = gf.stackX({ spacing: 9, alignment: "middle" }, [
    outlinedPill("Place + Bounds(nodes)", colors.blue, 162),
    gf.text({ text: "→", fill: colors.edge, fontSize: 18 }),
    outlinedPill("PlacedRef anchors", colors.green, 144),
    gf.text({ text: "→", fill: colors.edge, fontSize: 18 }),
    outlinedPill("Build edges", "#b66b13", 112),
  ]);

  return gf.stackY(
    { spacing: 31, alignment: "middle" },
    [
      gf.text({
        text: "Source tier first · ref consumer tier second",
        fill: colors.ink,
        fontSize: 12,
        fontWeight: "650",
      }),
      nodeLink,
      dependency,
      gf.text({
        text: "the edge reads anchors; moving the proxy never moves A, B, or C",
        fill: colors.muted,
        fontSize: 10.5,
      }),
    ].reverse()
  );
};

const smallPoint = (label, fill) =>
  gf
    .layer([
      gf.circle({ r: 7, fill, stroke: "white", strokeWidth: 1.5 }).name("dot"),
      gf
        .text({
          text: label,
          fill: colors.ink,
          fontSize: 9.5,
          fontWeight: "700",
        })
        .name("label"),
    ])
    .constrain(({ dot, label: textLabel }) => [
      gf.Constraint.align({ x: "middle" }, [dot, textLabel]),
      gf.Constraint.distribute({ dir: "y", spacing: 4, anchor: "edge" }, [
        dot,
        textLabel,
      ]),
    ]);

const makeCrossFrameScene = () => {
  const sourcePoints = [
    { theta: 0.15, r: 58, label: "p₀", fill: colors.blue },
    { theta: 1.9, r: 78, label: "p₁", fill: colors.green },
    { theta: 3.65, r: 64, label: "p₂", fill: "#b66b13" },
    { theta: 5.15, r: 72, label: "p₃", fill: "#8a53ba" },
  ];

  // This side is a real GoFish polar Frame. The target contract exports point
  // anchors only after this source has been scaled and placed at home.
  const polarSource = gf.frame(
    {
      coord: gf.polar({
        startAngle: Math.PI / 2,
        direction: -1,
        center: [92, 82],
      }),
    },
    sourcePoints.map((p) =>
      gf.position({ x: p.theta, y: p.r }, smallPoint(p.label, p.fill))
    )
  );

  const P0 = gf.createName("transported-p0");
  const P1 = gf.createName("transported-p1");
  const P2 = gf.createName("transported-p2");
  const cartesianPoints = gf.layer([
    gf.position(
      { x: 24, y: 30 },
      gf.circle({ r: 6, fill: colors.blue }).name(P0)
    ),
    gf.position(
      { x: 112, y: 98 },
      gf.circle({ r: 6, fill: colors.green }).name(P1)
    ),
    gf.position(
      { x: 192, y: 42 },
      gf.circle({ r: 6, fill: "#b66b13" }).name(P2)
    ),
  ]);

  const cartesianConsumer = gf.layer([
    cartesianPoints,
    gf
      .line({ stroke: colors.edge, strokeWidth: 2.5 }, [gf.ref(P0), gf.ref(P1)])
      .zOrder(-1),
    gf
      .line({ stroke: colors.edge, strokeWidth: 2.5 }, [gf.ref(P1), gf.ref(P2)])
      .zOrder(-1),
    gf.position(
      { x: 24, y: 10 },
      gf.text({ text: "p₀", fill: colors.blue, fontSize: 10 })
    ),
    gf.position(
      { x: 112, y: 118 },
      gf.text({ text: "p₁", fill: colors.green, fontSize: 10 })
    ),
    gf.position(
      { x: 192, y: 22 },
      gf.text({ text: "p₂", fill: "#b66b13", fontSize: 10 })
    ),
  ]);

  const sourceColumn = gf.stackY(
    { spacing: 8, alignment: "middle" },
    [
      gf.text({
        text: "Frame P · polar source",
        fill: colors.blue,
        fontSize: 11.5,
        fontWeight: "700",
      }),
      polarSource,
      gf.text({
        text: "solve scale + place at home",
        fill: colors.muted,
        fontSize: 9.5,
      }),
    ].reverse()
  );

  const transportColumn = gf.stackY(
    { spacing: 3, alignment: "middle" },
    [
      outlinedPill("PointAnchor", colors.green, 104),
      gf.text({ text: "transport", fill: colors.muted, fontSize: 9.5 }),
      gf.text({ text: "────────→", fill: colors.edge, fontSize: 13 }),
      gf.text({ text: "through LCA", fill: colors.muted, fontSize: 9.5 }),
    ].reverse()
  );

  const consumerColumn = gf.stackY(
    { spacing: 8, alignment: "middle" },
    [
      gf.text({
        text: "Frame C · Cartesian consumer",
        fill: colors.green,
        fontSize: 11.5,
        fontWeight: "700",
      }),
      cartesianConsumer,
      gf.text({
        text: "connector + labels use constants",
        fill: colors.muted,
        fontSize: 9.5,
      }),
    ].reverse()
  );

  return gf.stackX({ spacing: 22, alignment: "middle" }, [
    sourceColumn,
    transportColumn,
    consumerColumn,
  ]);
};

const tabs = [
  {
    id: "local",
    label: "1 · Local target",
    aria: "Local writable constraint targets",
    current:
      "The .constrain() callback receives name-only handles. The containing Layer resolves them to placement participants, and the joint solver may move both nodes.",
    target:
      "Name this authority ConstraintTarget: local to one Frame, writable by that Frame's simultaneous placement solve.",
    footnote:
      "Local relations are equations, not dependencies: align does not run before distribute or vice versa.",
    render: makeLocalScene,
  },
  {
    id: "placed",
    label: "2 · Placed ref",
    aria: "Read-only references to placed geometry",
    current:
      "Public ref() creates a real proxy node. It works when its source tier has already been laid out; ordinary source-array order is still a hidden prerequisite.",
    target:
      "PlacedRef is read-only. A task edge Bounds(source) → Transport(ref) schedules the observer without re-solving or moving the source.",
    footnote:
      "This panel runs the production tier pattern: nodes first, then lines whose GoFish refs read their anchors.",
    render: makePlacedRefScene,
  },
  {
    id: "cross",
    label: "3 · Cross Frame",
    aria: "Geometry transported across Frame and coordinate boundaries",
    current:
      "GoFishRef currently sums translation paths and copies intrinsic dimensions. It does not soundly transport nonlinear geometry, independent scales, or general coordinate transforms.",
    target:
      "Solve the source in its polar Frame, export a typed PointAnchor, transport through the LCA, then consume a Cartesian constant. The LCA is not the scale owner.",
    footnote:
      "The two sides are real GoFish scenes, but the arrow depicts the proposed transport contract—not a cross-coordinate operation the current ref implementation can safely execute.",
    render: makeCrossFrameScene,
  },
];

let activeTab = "local";

const tabButtons = tabs.map((tab) => {
  const button = document.createElement("button");
  button.type = "button";
  button.id = `reference-tab-${tab.id}`;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-label", tab.aria);
  Object.assign(button.style, {
    appearance: "none",
    border: `1px solid ${colors.border}`,
    borderRadius: "999px",
    padding: "7px 11px",
    font: "650 11.5px/1.2 system-ui, sans-serif",
    cursor: "pointer",
  });
  button.addEventListener("click", () => {
    activeTab = tab.id;
    refresh();
  });
  tabList.append(button);
  return button;
});

const refresh = () => {
  const tab = tabs.find((candidate) => candidate.id === activeTab);
  currentCard.body.textContent = tab.current;
  targetCard.body.textContent = tab.target;
  footnote.textContent = tab.footnote;

  tabButtons.forEach((button, i) => {
    const selected = tabs[i].id === activeTab;
    button.textContent = tabs[i].label;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
    button.style.background = selected
      ? colors.blueSoft
      : "var(--vp-c-bg, white)";
    button.style.borderColor = selected ? colors.blue : colors.border;
    button.style.color = selected ? colors.blue : "var(--vp-c-text-1, #243042)";
  });

  const mount = document.createElement("div");
  Object.assign(mount.style, {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  });
  chartHost.replaceChildren(mount);
  chartHost.setAttribute("aria-label", tab.aria);
  tab.render().render(mount, {});

  const svg = mount.querySelector("svg");
  if (svg) {
    const svgWidth = Number(svg.getAttribute("width"));
    const svgHeight = Number(svg.getAttribute("height"));
    if (Number.isFinite(svgWidth) && Number.isFinite(svgHeight)) {
      svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.maxWidth = `${svgWidth}px`;
    }
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", tab.aria);
  }
};

refresh();
