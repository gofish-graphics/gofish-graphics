// Direct style (round 2) for the titanic SANKEY TREE: the syntax follows the
// data. The data is a NESTED tree: a node is a RECORD (its box, its list of
// children), so it is a combinator; the list of children is a flow.
// See proposals/stacked-ribbons/NOTES.md, "R4. Sankey tree (round 2)".
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { titanic } from "../../../src/data/titanic";
import {
  chart,
  spread,
  rect,
  ribbon,
  selectAll,
  group,
  derive,
  filter,
  project,
  Curve,
} from "../../../src/lib";
import { ChartBuilder } from "../../../src/ast/marks/chartBuilder";

const meta: Meta = {
  title: "Proposals/Stacked Ribbons/Direct Style/Sankey Tree",
};
export default meta;

/** Render, and print a thrown error above the (empty) picture. */
const show = (fn: (c: HTMLElement) => unknown) => {
  const container = initializeContainer();
  Promise.resolve()
    .then(() => fn(container))
    .catch((e) => {
      const pre = document.createElement("pre");
      pre.textContent = "ERROR: " + (e?.message ?? String(e));
      container.prepend(pre);
      console.error(e);
    });
  return container;
};

// ---------------------------------------------------------------------------
// Data: a nested tree (plain JS, not library API)
// ---------------------------------------------------------------------------

type TreeNode = {
  name: string;
  key: string;
  depth: number;
  count: number;
  children: TreeNode[];
  [field: string]: any;
};

/** Group `rows` by `keys` in turn. A node carries its own category (`name`),
 *  its path (`key`), its ancestors' categories as fields (`class`, `sex`, ...),
 *  the subtotal `count`, and its `children`. Categories keep first-appearance
 *  order. A node's children's counts add up to its own count. */
const nestTree = (
  rows: any[],
  keys: string[],
  value: string,
  depth = 0,
  parent: Record<string, any> = {}
): TreeNode[] => {
  if (depth === keys.length) return [];
  const k = keys[depth];
  const names = [...new Set(rows.map((r) => r[k]))];
  return names.map((name) => {
    const sub = rows.filter((r) => r[k] === name);
    const fields = { ...parent, [k]: name };
    return {
      ...fields,
      name,
      key: keys.slice(0, depth + 1).map((kk) => fields[kk]).join("/"),
      depth,
      count: sub.reduce((s, r) => s + r[value], 0),
      children: nestTree(sub, keys, value, depth + 1, fields),
    };
  });
};

const tree = nestTree(titanic, ["class", "sex", "survived"], "count");

/** A ribbon joins a child's END (on its parent's right edge) to the child's
 *  BOX. Both are named "box" and both carry the child's `key`, so a group by
 *  `key` holds exactly the pair. An end is drawn from a copy of the child
 *  marked `end: true`, for one reason: a ribbon runs from its first ref to
 *  its second, and `selectAll` lists nodes in the order they finished
 *  resolving, not in document order (NOTES R4). With the plain child object
 *  (`group({ by: (r) => r.datum[0] })`) some tiers came out box-first and the
 *  ribbon ran backwards, from the child box's far edge. `endsFirst` sorts
 *  each end before its box. */
const asEnds = (children: TreeNode[]) =>
  children.map((c) => ({ ...c, end: true }));
const endsFirst = derive((refs: any[]) =>
  [...refs].sort(
    (a, b) => Number(!!project(b, "end")) - Number(!!project(a, "end"))
  )
);

// ===========================================================================
// 1. Works today: a recursive JS function, one call per depth
// ===========================================================================

const GAPS = [8, 4, 2];

export const SankeyTreeDirect: StoryObj = {
  render: () =>
    show((c) => {
      // A node's box: one rect drawn from the node itself.
      const box = (n: TreeNode) =>
        chart([n]).mark(rect({ w: 40, h: "count", fill: "class" }).name("box"));
      // The box's right edge, cut into one end per child (sizes = child
      // counts, which tile the box). Each end shares the child's `key`.
      const ends = (n: TreeNode) =>
        chart(asEnds(n.children))
          .flow(spread({ dir: "y", spacing: 0 }))
          .mark(rect({ w: 0, h: "count" }).name("box"));
      // One tree level: the list of nodes, each a box and then its children.
      const level = (nodes: TreeNode[], depth: number): any =>
        chart(nodes)
          .flow(spread({ dir: "y", spacing: GAPS[depth] }))
          .mark(([n]: TreeNode[]) =>
            n.children.length === 0
              ? box(n)
              : spread({ dir: "x", spacing: 64, alignment: "middle" }, [
                  spread({ dir: "x", spacing: 0, alignment: "start" }, [box(n), ends(n)]),
                  level(n.children, depth + 1),
                ])
          );

      return level(tree, 0)
        .layer(
          chart(selectAll("box"))
            .flow(
              filter((r: any) => (project(r, "depth") as number) === 1),
              endsFirst,
              group({ by: "key" })
            )
            .mark(ribbon({ opacity: 0.6, fill: "class", curve: Curve.bezier() }))
        )
        .layer(
          chart(selectAll("box"))
            .flow(
              filter((r: any) => (project(r, "depth") as number) === 2),
              endsFirst,
              group({ by: "key" })
            )
            .mark(
              ribbon({ opacity: 0.6, fill: "survived", curve: Curve.bezier() })
            )
        )
        .render(c, { w: 360, h: 500, axes: false } as any);
    }),
};

// ===========================================================================
// 2. Callback-free target spelling (EMULATED with the helpers below)
// ===========================================================================

// Story-local helpers, EMULATION and not library API.

/** What a combinator would do if it passed its scope to an empty-scope
 *  `chart()` child, the way `layer([...])` does (see DirectStyle.stories). */
const inherit = (children: any[]) =>
  children.map((m) =>
    m instanceof ChartBuilder && m.usesPreviousLayerMarks()
      ? (d: any) => m.withData(d)
      : m
  );

/** `unnest(f)`: a node's list field as the child's data (emulates
 *  `chart(field("children"))`). Keeps the child objects themselves. */
const unnest = (f: string) =>
  derive((rows: any[]) => rows.flatMap((r) => r[f]));

/** The part of the target `.layer(ribbon())` that must exist at layout
 *  time: the box's right edge cut into one zero-width end per child, sized
 *  by the child's count. Each end is named like the box and carries the
 *  child's `key`. */
const stackedEnds = (boxMark: any) =>
  spread(
    { dir: "x", spacing: 0, alignment: "start" },
    inherit([
      boxMark,
      chart()
        .flow(
          derive((rows: any[]) => asEnds(rows.flatMap((r) => r.children))),
          spread({ dir: "y", spacing: 0 })
        )
        .mark(rect({ w: 0, h: "count" }).name("box")),
    ])
  );

/** The rest of the target `.layer(ribbon())`: one ribbon per child, from
 *  its end on the parent's edge to its own box. */
const treeRibbon = (opts: any) =>
  chart(selectAll("box"))
    .flow(endsFirst, group({ by: "key" }))
    .mark(ribbon({ curve: Curve.bezier(), ...opts }));

export const SankeyTreeNested: StoryObj = {
  render: () =>
    show((c) => {
      const box = () => rect({ w: 40, h: "count", fill: "class" }).name("box");
      // One tree level: a box, then the list of children.
      const node = (gap: number, child: any) =>
        spread(
          { dir: "x", spacing: 64, alignment: "middle" },
          inherit([
            stackedEnds(box()),
            chart()
              .flow(unnest("children"), spread({ dir: "y", spacing: gap }))
              .mark(child),
          ])
        );
      return chart(tree)
        .flow(spread({ by: "name", dir: "y", spacing: 8 }))
        .mark(node(4, node(2, box())))
        .layer(treeRibbon({ opacity: 0.6, fill: "class" }))
        .render(c, { w: 360, h: 500, axes: false } as any);
    }),
};

// ===========================================================================
// 3. Probe: a truly recursive mark (refers to itself, any depth)
// ===========================================================================

/** Tie the knot: `fix(f)` is `f(self)` where `self` is the same mark,
 *  built lazily per group so the recursion stops where `children` is
 *  empty (no groups, so `self` is never called). */
const fix = (f: (self: any) => any) => {
  const self = (d: any) => chart(d).mark(f(self));
  return f(self);
};

export const SankeyTreeRecursive: StoryObj = {
  render: () =>
    show((c) => {
      const box = () => rect({ w: 40, h: "count", fill: "class" }).name("box");
      const node = (child: any) =>
        spread(
          { dir: "x", spacing: 64, alignment: "middle" },
          inherit([
            stackedEnds(box()),
            chart()
              .flow(unnest("children"), spread({ dir: "y", spacing: 4 }))
              .mark(child),
          ])
        );
      return chart(tree)
        .flow(spread({ by: "name", dir: "y", spacing: 8 }))
        .mark(fix(node))
        .layer(treeRibbon({ opacity: 0.6, fill: "class" }))
        .render(c, { w: 360, h: 500, axes: false } as any);
    }),
};
