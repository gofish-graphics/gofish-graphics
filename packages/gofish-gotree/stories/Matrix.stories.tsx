import type { Meta, StoryObj } from "@storybook/html";
import { rect } from "gofish-graphics";
import { tree, combine } from "../src";
import type { CombineAxis } from "../src";

/**
 * Systematic enumeration of GoTree's layout space.
 *
 * Two relationships, each with an independent per-axis constraint choice:
 *  - parent ↔ subtree-group: {align, distribute, nest} on x AND y  → 3 × 3 = 9
 *  - sibling ↔ sibling:      {align, distribute}      on x AND y    → 2 × 2 = 4
 *
 * 9 × 4 = 36 combinations, laid out as a matrix: columns = the 9 parentChild
 * combos (the long axis, run horizontally), rows = the 4 sibling combos. Each
 * cell is labeled with its `<x-constraint> × <y-constraint>` per relationship.
 */
const meta: Meta = {
  title: "GoTree / Constraint Matrix",
};
export default meta;

// A small balanced tree (7 nodes, depth 2) — enough to show parent↔group and
// sibling↔sibling structure without crowding each 150×130 cell.
const tinyTree = {
  name: "root",
  children: [
    { name: "A", children: [{ name: "A1" }, { name: "A2" }] },
    { name: "B", children: [{ name: "B1" }, { name: "B2" }] },
  ],
};

const depthColor = ["#1f3a5f", "#4682b4", "#7baed1"];

const NODE = 14; // fixed node side, in px

// Node factory for one parentChild combo. Leaves are always a fixed square.
// Internal (parent) nodes are left UNSIZED on whichever axis parentChild nests
// (so `nest` can grow them to wrap the subtree) and fixed on the other axis —
// otherwise an unsized box would balloon to fill the cell and hide structure.
const makeNode = (nestX: boolean, nestY: boolean) => (d: any) => {
  if (d.height === 0) {
    return rect({
      w: NODE,
      h: NODE,
      fill: depthColor[Math.min(d.depth, depthColor.length - 1)],
    });
  }
  const dims: Record<string, number> = {};
  if (!nestX) dims.w = NODE;
  if (!nestY) dims.h = NODE;
  return rect({
    ...dims,
    fill: "rgba(70,130,180,0.12)",
    stroke: "#4682b4",
    strokeWidth: 1,
  });
};

type Kind = "align" | "distribute" | "nest";
const PC_KINDS: Kind[] = ["align", "distribute", "nest"];
const SIB_KINDS: Kind[] = ["align", "distribute"];

// Build a per-axis spec with visibility-friendly defaults. For parentChild
// y-distribute we reverse so the root lands at the top (y-up canvas).
const axisSpec = (
  kind: Kind,
  axis: "x" | "y",
  role: "pc" | "sib"
): CombineAxis => {
  if (kind === "align") return { kind: "align", alignment: "middle" };
  if (kind === "nest") return { kind: "nest", pad: 8 };
  return {
    kind: "distribute",
    spacing: 14,
    order: axis === "y" && role === "pc" ? "reverse" : "forward",
  };
};

const CELL_W = 150;
const CELL_H = 130;

// Scale each cell's content to fill its box: set the SVG viewBox to the
// content's bounding box (plus padding). This both centers small trees and
// rescues the large nest cases that would otherwise overflow and clip.
const fitToContent = (host: HTMLElement) => {
  requestAnimationFrame(() => {
    const svg = host.querySelector("svg");
    if (!svg) return;
    try {
      const bb = (svg as SVGSVGElement).getBBox();
      if (!bb.width || !bb.height) return;
      const pad = 8;
      svg.setAttribute(
        "viewBox",
        `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`
      );
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
    } catch {
      /* getBBox can throw before paint; ignore */
    }
  });
};

const renderMatrix = () => {
  const root = document.createElement("div");
  root.style.font = "12px ui-sans-serif, system-ui, sans-serif";
  root.style.margin = "16px";

  // Columns = the 9 parentChild combos (long axis, horizontal); rows = the 4
  // sibling combos. Transposed so the long side runs across the screen.
  const pcCombos = PC_KINDS.flatMap((px) =>
    PC_KINDS.map((py) => ({
      label: `${px} × ${py}`,
      parentChild: combine({
        x: axisSpec(px, "x", "pc"),
        y: axisSpec(py, "y", "pc"),
      }),
      node: makeNode(px === "nest", py === "nest"),
    }))
  );
  const sibCombos = SIB_KINDS.flatMap((sx) =>
    SIB_KINDS.map((sy) => ({
      label: `${sx} × ${sy}`,
      sibling: combine({
        x: axisSpec(sx, "x", "sib"),
        y: axisSpec(sy, "y", "sib"),
      }),
    }))
  );

  const grid = document.createElement("div");
  grid.style.display = "grid";
  // Two header columns (vertical axis title + sibling-combo label) and two
  // header rows (horizontal axis title + parentChild-combo label).
  grid.style.gridTemplateColumns = `28px 150px repeat(${pcCombos.length}, ${CELL_W}px)`;
  grid.style.gridTemplateRows = `34px 28px repeat(${sibCombos.length}, ${CELL_H}px)`;
  grid.style.gap = "4px";
  grid.style.alignItems = "stretch";
  root.appendChild(grid);

  const place = (
    el: HTMLElement,
    col: string,
    row: string,
    style: Partial<CSSStyleDeclaration> = {}
  ) => {
    el.style.gridColumn = col;
    el.style.gridRow = row;
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.textAlign = "center";
    Object.assign(el.style, style);
    grid.appendChild(el);
    return el;
  };

  const labelEl = (text: string) => {
    const d = document.createElement("div");
    d.textContent = text;
    return d;
  };

  // Axis titles (spelled out, x × y means constraint on the x then y axis).
  place(
    labelEl("Parent → subtree-group constraint   (x × y)"),
    `3 / ${3 + pcCombos.length}`,
    "1",
    { fontWeight: "700", borderBottom: "2px solid #ccc" }
  );
  const sibTitle = place(
    labelEl("Sibling constraint   (x × y)"),
    "1",
    `3 / ${3 + sibCombos.length}`,
    { fontWeight: "700", borderRight: "2px solid #ccc" }
  );
  sibTitle.style.writingMode = "vertical-rl";
  sibTitle.style.transform = "rotate(180deg)";

  // Combo headers.
  pcCombos.forEach((pc, i) =>
    place(labelEl(pc.label), `${3 + i}`, "2", { fontWeight: "600" })
  );
  sibCombos.forEach((sib, j) =>
    place(labelEl(sib.label), "2", `${3 + j}`, { fontWeight: "600" })
  );

  // Cells.
  sibCombos.forEach((sib, j) =>
    pcCombos.forEach((pc, i) => {
      const cellDiv = document.createElement("div");
      place(cellDiv, `${3 + i}`, `${3 + j}`, {
        border: "1px solid #eee",
        overflow: "hidden",
      });
      try {
        tree(
          {
            node: pc.node,
            link: "none",
            parentChild: pc.parentChild,
            sibling: sib.sibling,
          },
          tinyTree
        ).render(cellDiv, { w: CELL_W, h: CELL_H });
        fitToContent(cellDiv);
      } catch (e) {
        cellDiv.textContent = `err: ${String(e).slice(0, 60)}`;
        cellDiv.style.color = "#c00";
      }
    })
  );

  return root;
};

export const AllCombinations: StoryObj = {
  render: () => renderMatrix(),
};
