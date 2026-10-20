import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { energy } from "../../../src/data/energy";
import { titanic } from "../../../src/data/titanic";
import { renderA, type ANode, type ALink } from "./approachA";
import { sankeyDepths, orderColumns } from "./sankeyPrep";
import _ from "lodash";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Approach A" };
export default meta;

// ---- Energy: nodes table + links table, exactly the d3-sankey inputs. ----
const names = energy.nodes.map((n) => n.name);
const eLinks: ALink[] = energy.links.map((l) => ({
  source: names[l.source],
  target: names[l.target],
  value: l.value,
}));
const depth = sankeyDepths(names, eLinks);
const eNodes: ANode[] = orderColumns(names, eLinks, depth).map((name) => ({
  name,
  depth: depth.get(name)!,
}));

export const EnergySankey: StoryObj = {
  render: () => {
    const container = initializeContainer();
    renderA(container, eNodes, eLinks);
    return container;
  },
};

// ---- Sankey tree: the tree as nodes + parent->child links. ----
const tNodes: ANode[] = [];
const tLinks: ALink[] = [];
for (const [cls, a] of Object.entries(_.groupBy(titanic, "class"))) {
  tNodes.push({ name: cls, depth: 0, value: _.sumBy(a, "count") });
  for (const [sex, b] of Object.entries(_.groupBy(a, "sex"))) {
    const n1 = `${cls}/${sex}`;
    tNodes.push({ name: n1, depth: 1, value: _.sumBy(b, "count") });
    tLinks.push({ source: cls, target: n1, value: _.sumBy(b, "count"), fill: cls });
    for (const [surv, c] of Object.entries(_.groupBy(b, "survived"))) {
      const n2 = `${n1}/${surv}`;
      tNodes.push({ name: n2, depth: 2, value: _.sumBy(c, "count") });
      tLinks.push({ source: n1, target: n2, value: _.sumBy(c, "count"), fill: surv });
    }
  }
}
// Column order: tree order (parents before children, depth-first).
tNodes.sort((x, y) => x.depth - y.depth);

export const SankeyTree: StoryObj = {
  render: () => {
    const container = initializeContainer();
    renderA(container, tNodes, tLinks, { nodeW: 40, colSpacing: 64, nodeSpacing: 6, w: 400, h: 500, opacity: 0.6 });
    return container;
  },
};

// ---- Mismatch: node values that disagree with the ribbon sizes. ----
// "Third" claims 1.5x its true total (slack shows as uncovered node body);
// "Crew/Male" claims half its true total (the ribbons overflow the node, and
// the rewrite can only report it).
const mNodes = tNodes.map((n) =>
  n.name === "Third"
    ? { ...n, value: n.value! * 1.5 }
    : n.name === "Crew/Male"
      ? { ...n, value: n.value! / 2 }
      : n
);
export const SankeyTreeMismatch: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const report = renderA(container, mNodes, tLinks, { nodeW: 40, colSpacing: 64, nodeSpacing: 6, w: 400, h: 500, opacity: 0.6 });
    const p = document.createElement("pre");
    p.textContent = report.join("\n");
    container.appendChild(p);
    return container;
  },
};
