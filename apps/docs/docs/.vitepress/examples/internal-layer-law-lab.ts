// Internal-wiki lab: the proposed transparent-Layer laws.
//
// The controls change surface syntax. The GoFish scene is rendered from the
// corresponding Frame-local normal form, making the important distinction
// between unordered node/fact storage and an explicitly ordered operand list.

const palette = {
  ink: "#243042",
  muted: "#667085",
  line: "#a8b3c2",
  panel: "#f8fafc",
  border: "#d9e0ea",
  blue: "#3662d0",
  blueSoft: "#dce7ff",
  green: "#21845a",
  greenSoft: "#dcf3e8",
  amber: "#a15c00",
  amberSoft: "#fff0cf",
  red: "#bd3f3f",
};

const state = {
  nested: false,
  permutedChildren: false,
  permutedFacts: false,
  reversedOperands: false,
};

const style = document.createElement("style");
style.textContent = `
  .gf-layer-law-chart svg {
    display: block;
    width: 100%;
    max-width: 720px;
    height: auto;
    margin: 0 auto;
  }
  .gf-layer-law-lab *,
  .gf-layer-law-lab *::before,
  .gf-layer-law-lab *::after {
    animation: none !important;
    transition: none !important;
  }
`;

const shell = document.createElement("section");
shell.className = "gf-layer-law-lab";
shell.setAttribute("aria-label", "Interactive Layer law explorer");
Object.assign(shell.style, {
  border: `1px solid ${palette.border}`,
  borderRadius: "14px",
  background: "var(--vp-c-bg, white)",
  color: "var(--vp-c-text-1, #243042)",
  padding: "14px",
  boxSizing: "border-box",
  maxWidth: "760px",
  boxShadow: "0 8px 28px rgba(36, 48, 66, 0.06)",
});

const toolbar = document.createElement("div");
Object.assign(toolbar.style, {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "12px",
});

const syntaxGrid = document.createElement("div");
Object.assign(syntaxGrid.style, {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "8px",
  marginBottom: "8px",
});

const makeReadout = (label) => {
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    border: `1px solid ${palette.border}`,
    borderRadius: "9px",
    background: "var(--vp-c-bg-soft, #f8fafc)",
    padding: "9px 11px",
    minWidth: "0",
  });

  const heading = document.createElement("div");
  heading.textContent = label;
  Object.assign(heading.style, {
    color: "var(--vp-c-text-2, #667085)",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "4px",
  });

  const value = document.createElement("code");
  Object.assign(value.style, {
    display: "block",
    color: "var(--vp-c-text-1, #243042)",
    fontSize: "12px",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    lineHeight: "1.45",
  });

  panel.append(heading, value);
  return { panel, value };
};

const candidateReadout = makeReadout("Candidate surface tree");
const normalReadout = makeReadout("Frame-local normal form");
syntaxGrid.append(candidateReadout.panel, normalReadout.panel);

const status = document.createElement("div");
Object.assign(status.style, {
  borderRadius: "9px",
  padding: "9px 11px",
  fontSize: "12px",
  fontWeight: "650",
  lineHeight: "1.45",
  marginBottom: "8px",
});

const productionNote = document.createElement("div");
productionNote.innerHTML =
  '<strong style="color:#bd3f3f">CURRENT ENGINE</strong> &nbsp;Layer is not transparent yet: nesting may alter scale scopes, name resolution, proposals, bounds, or paint.';
Object.assign(productionNote.style, {
  border: `1px dashed ${palette.red}`,
  borderRadius: "9px",
  padding: "8px 10px",
  color: "var(--vp-c-text-2, #667085)",
  fontSize: "11.5px",
  lineHeight: "1.45",
  marginBottom: "10px",
});

const chartHost = document.createElement("div");
chartHost.className = "gf-layer-law-chart";
chartHost.setAttribute("role", "img");
Object.assign(chartHost.style, {
  width: "100%",
  minHeight: "220px",
  overflow: "hidden",
  border: `1px solid ${palette.border}`,
  borderRadius: "10px",
  background: "white",
});

shell.append(toolbar, syntaxGrid, status, productionNote, chartHost);
root.append(style, shell);

const boxSpecs = {
  a: { label: "A", w: 68, h: 44, fill: "#3662d0" },
  b: { label: "B", w: 92, h: 62, fill: "#21845a" },
  c: { label: "C", w: 58, h: 50, fill: "#b66b13" },
};

const namedBox = (id) => {
  const spec = boxSpecs[id];
  return gf
    .layer([
      gf
        .rect({
          w: spec.w,
          h: spec.h,
          fill: spec.fill,
          rx: 7,
          stroke: "white",
          strokeWidth: 1.5,
        })
        .name("shape"),
      gf
        .text({
          text: spec.label,
          fill: "white",
          fontSize: 15,
          fontWeight: "700",
        })
        .name("label"),
    ])
    .constrain(({ shape, label }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [shape, label]),
    ])
    .name(id);
};

const graphNode = (id) => {
  const spec = boxSpecs[id];
  return gf
    .layer([
      gf
        .rect({
          w: 52,
          h: 30,
          fill: "#f8fafc",
          stroke: spec.fill,
          strokeWidth: 1.5,
          rx: 15,
        })
        .name("shape"),
      gf
        .text({
          text: `x${spec.label}`,
          fill: spec.fill,
          fontSize: 12,
          fontWeight: "700",
        })
        .name("label"),
    ])
    .constrain(({ shape, label }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [shape, label]),
    ]);
};

const graphEdge = (from, to) => {
  const offset = boxSpecs[from].w + 24;
  return gf.stackY(
    { spacing: 1, alignment: "middle" },
    [
      gf.text({
        text: `+${offset}`,
        fill: palette.muted,
        fontSize: 10,
      }),
      gf.text({
        text: "────────→",
        fill: palette.line,
        fontSize: 12,
      }),
    ].reverse()
  );
};

const renderGoFish = () => {
  const storageOrder = state.permutedChildren
    ? ["c", "a", "b"]
    : ["a", "b", "c"];
  const operandOrder = state.reversedOperands
    ? ["c", "b", "a"]
    : ["a", "b", "c"];

  const solvedBoxes = gf.layer(storageOrder.map(namedBox)).constrain((c) => {
    const refs = operandOrder.map((id) => c[id]);
    const align = gf.Constraint.align({ y: "middle" }, refs);
    const distribute = gf.Constraint.distribute(
      { dir: "x", spacing: 24, anchor: "edge" },
      refs
    );
    return state.permutedFacts ? [distribute, align] : [align, distribute];
  });

  const differenceGraphItems = [];
  operandOrder.forEach((id, i) => {
    differenceGraphItems.push(graphNode(id));
    if (i < operandOrder.length - 1) {
      differenceGraphItems.push(graphEdge(id, operandOrder[i + 1]));
    }
  });

  const differenceGraph = gf.stackX(
    { spacing: 7, alignment: "middle" },
    differenceGraphItems
  );

  const figure = gf.stackY(
    { spacing: 21, alignment: "middle" },
    [
      gf.text({
        text: "Lowered x-axis difference facts",
        fill: palette.ink,
        fontSize: 12,
        fontWeight: "650",
      }),
      differenceGraph,
      gf.text({
        text: "min(next) − min(previous) = width(previous) + 24",
        fill: palette.muted,
        fontSize: 10.5,
      }),
      gf.text({
        text: "Solved box geometry",
        fill: palette.ink,
        fontSize: 12,
        fontWeight: "650",
      }),
      solvedBoxes,
    ].reverse()
  );

  const mount = document.createElement("div");
  Object.assign(mount.style, {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  });
  chartHost.replaceChildren(mount);
  chartHost.setAttribute(
    "aria-label",
    `Boxes distributed in the explicit order ${operandOrder
      .map((id) => id.toUpperCase())
      .join(", ")}`
  );
  figure.render(mount, {});

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
    svg.setAttribute(
      "aria-label",
      `Boxes distributed in the explicit order ${operandOrder
        .map((id) => id.toUpperCase())
        .join(", ")}`
    );
  }
};

const controls = [
  {
    label: () =>
      `Grouping: ${state.nested ? "Layer(A, Layer(B, C))" : "Layer(A, B, C)"}`,
    active: () => state.nested,
    toggle: () => {
      state.nested = !state.nested;
    },
    title: "Toggle the candidate Layer grouping",
  },
  {
    label: () =>
      `Child storage: ${state.permutedChildren ? "C, A, B" : "A, B, C"}`,
    active: () => state.permutedChildren,
    toggle: () => {
      state.permutedChildren = !state.permutedChildren;
    },
    title: "Permute the nodes' storage order",
  },
  {
    label: () =>
      `Fact storage: ${
        state.permutedFacts ? "distribute, align" : "align, distribute"
      }`,
    active: () => state.permutedFacts,
    toggle: () => {
      state.permutedFacts = !state.permutedFacts;
    },
    title: "Permute constraint declaration order",
  },
  {
    label: () =>
      `Distribute operands: ${state.reversedOperands ? "C → B → A" : "A → B → C"}`,
    active: () => state.reversedOperands,
    toggle: () => {
      state.reversedOperands = !state.reversedOperands;
    },
    title: "Reverse the explicitly ordered distribute path",
  },
];

const buttons = controls.map((control) => {
  const button = document.createElement("button");
  button.type = "button";
  button.title = control.title;
  Object.assign(button.style, {
    appearance: "none",
    border: `1px solid ${palette.border}`,
    borderRadius: "999px",
    padding: "7px 10px",
    font: "600 11.5px/1.2 system-ui, sans-serif",
    cursor: "pointer",
  });
  button.addEventListener("click", () => {
    control.toggle();
    refresh();
  });
  toolbar.append(button);
  return button;
});

const refresh = () => {
  const storageOrder = state.permutedChildren ? "C,A,B" : "A,B,C";
  const factOrder = state.permutedFacts
    ? "distribute; align"
    : "align; distribute";
  const operandOrder = state.reversedOperands ? "[C,B,A]" : "[A,B,C]";

  candidateReadout.value.textContent = state.nested
    ? `Layer(A, Layer(B, C)); nodes stored ${storageOrder}`
    : `Layer(A, B, C); nodes stored ${storageOrder}`;
  normalReadout.value.textContent = `Frame { nodes: {A,B,C}, facts: {${factOrder.replace(
    "; ",
    ", "
  )}}, distributeOperands: ${operandOrder} }`;

  if (state.reversedOperands) {
    status.innerHTML =
      '<span style="color:#a15c00">ORDERED SEQUENCE</span> &nbsp;The explicit distribute path changed, so the lowered facts and named geometry change.';
    status.style.background = palette.amberSoft;
    status.style.border = `1px solid #e7bd68`;
  } else {
    status.innerHTML =
      '<span style="color:#21845a">TARGET LAW</span> &nbsp;Grouping, node storage, and fact declaration normalize to the same unordered Frame-local fact set.';
    status.style.background = palette.greenSoft;
    status.style.border = `1px solid #91cfb2`;
  }

  buttons.forEach((button, i) => {
    const active = controls[i].active();
    button.textContent = controls[i].label();
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.style.background = active
      ? palette.blueSoft
      : "var(--vp-c-bg, white)";
    button.style.borderColor = active ? palette.blue : palette.border;
    button.style.color = active ? palette.blue : "var(--vp-c-text-1, #243042)";
  });

  renderGoFish();
};

refresh();
