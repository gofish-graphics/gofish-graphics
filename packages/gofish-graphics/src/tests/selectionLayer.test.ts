/**
 * A modifier lowered as a layer over its selection (`selectionLayer.ts`),
 * read through `.label()`: what the lowering emits for a mark's label and
 * for an operator's, as a structure a reader can check against the form a
 * user would write by hand,
 *
 *   .layer(chart(selectAll(<the labeled nodes>)).mark(<a label per ref>))
 *
 * one tier on the chart's content: a hygienic layer of the content, one ref
 * per labeled node (made as `selectAll` makes one, its `datum` the node's
 * rows), and one label per ref. Run via `tsx` (`pnpm test:selection-layer`).
 */
import { GoFishNode } from "../ast/_node";
import { GoFishRef } from "../ast/_ref";
import { runLayout } from "../ast/gofish";
import { homeOf, lowerSelectionLayers } from "../ast/selectionLayer";
import { LayerContext } from "../ast/marks/markResult";
import { resolveRefData, selectNode } from "../ast/marks/resolveRefData";
import { chart, rect, selectAll, spread } from "../lib";
import { check, report, textsOf } from "./testHelpers";

const rows = [
  { site: "Morris", variety: "a", v: 3 },
  { site: "Morris", variety: "b", v: 5 },
  { site: "Crookston", variety: "a", v: 2 },
  { site: "Crookston", variety: "b", v: 4 },
];

/** The node a ref points at. */
const nodeOf = (r: GoFishRef): unknown => (r as any).directNode;

/** The ring a lowering wrapped a chart's content in: the transparent layer
 *  whose first child holds the chart's marks. */
function tierOf(root: GoFishNode): GoFishNode | undefined {
  const all: GoFishNode[] = [];
  const walk = (n: GoFishNode) => {
    all.push(n);
    for (const c of n.children) if (c instanceof GoFishNode) walk(c);
  };
  walk(root);
  return all.find(
    (n) =>
      n._transparent === true &&
      n.children[0] instanceof GoFishNode &&
      (n.children[0] as GoFishNode)._chartContent === true
  );
}

/** A tier's refs and labels, in child order, after its content. */
function partsOf(tier: GoFishNode) {
  const rest = tier.children.slice(1);
  return {
    refs: rest.filter((c): c is GoFishRef => c instanceof GoFishRef),
    labels: rest.filter(
      (c): c is GoFishNode => c instanceof GoFishNode && c.type === "label"
    ),
    others: rest.filter(
      (c) =>
        !(c instanceof GoFishRef) &&
        !(c instanceof GoFishNode && c.type === "label")
    ),
  };
}

async function main() {
  console.log("\n# selection layer: a modifier is a layer over its selection");

  // A node read through a ref, as a selection reads it.
  {
    const node = await rect({ w: 10, h: 10 })([{ k: 1 }] as any);
    const layers = new LayerContext();
    layers.register("bars", node as GoFishNode);
    const viaSelectAll = resolveRefData(selectAll("bars"), layers)[0];
    const viaSelect = selectNode(node as GoFishNode);
    check(
      "selectNode makes the ref selectAll makes",
      viaSelect instanceof GoFishRef &&
        viaSelectAll instanceof GoFishRef &&
        nodeOf(viaSelect) === nodeOf(viaSelectAll) &&
        viaSelect.datum === viaSelectAll.datum,
      { viaSelect, viaSelectAll }
    );
  }

  // The mark form: one ref + label per labeled mark, on the chart's content.
  {
    const spec = () =>
      chart(rows)
        .flow(
          spread({ by: "site", dir: "x" }),
          spread({ by: "variety", dir: "x" })
        )
        .mark(rect({ h: "v", w: 10 }).label("v"));
    const node = await spec().resolve();
    const texts = textsOf(
      await spec().toDisplayList({ w: 300, h: 200, axes: false })
    );
    const marks: GoFishNode[] = [];
    const collect = (n: GoFishNode) => {
      if (n._labels?.length) marks.push(n);
      for (const c of n.children) if (c instanceof GoFishNode) collect(c);
    };
    collect(node);
    const content = homeOf(marks[0], node);
    const out = (await runLayout({ w: 300, h: 200, axes: false }, node)).child;
    const tier = tierOf(out);
    check("the mark form lowers", tier !== undefined);
    const { refs, labels, others } = partsOf(tier!);
    check(
      "the tier holds the chart's content first",
      tier!.children[0] === content && content._chartContent === true
    );
    check(
      "one ref per labeled mark, in order, each the mark's selection",
      refs.length === 4 &&
        refs.every((r, i) => nodeOf(r) === marks[i]) &&
        refs.every((r, i) => r.datum === marks[i].datum),
      refs.map((r) => r.datum)
    );
    check(
      "one label per ref, its text the accessor over the ref's rows",
      labels.length === 4 &&
        texts.join(",") === "3,5,2,4" &&
        others.length === 0,
      texts
    );
    check(
      "each label is attached to the mark it names",
      labels.every((l, i) => l._attachedTo === marks[i])
    );
  }

  // The operator form: one ref + label per group node, whose datum is the
  // group's rows.
  {
    const spec = () =>
      chart(rows)
        .flow(
          spread({ by: "site", dir: "x" }).label("site"),
          spread({ by: "variety", dir: "x" })
        )
        .mark(rect({ h: "v", w: 10 }));
    const node = await spec().resolve();
    const texts = textsOf(
      await spec().toDisplayList({ w: 300, h: 200, axes: false })
    );
    const out = (await runLayout({ w: 300, h: 200, axes: false }, node)).child;
    const tier = tierOf(out);
    const { refs, labels } = partsOf(tier!);
    check(
      "the operator form lowers to one ref per group, each a group node",
      refs.length === 2 &&
        refs.every((r) => {
          const n = nodeOf(r) as GoFishNode | undefined;
          return n?.parent === (nodeOf(refs[0]) as GoFishNode).parent;
        }) &&
        refs.every((r) => Array.isArray(r.datum))
    );
    check(
      "each group's ref carries the group's rows",
      refs
        .map((r) => (r.datum as any[]).map((d) => d.site).join("+"))
        .join(",") === "Morris+Morris,Crookston+Crookston",
      refs.map((r) => r.datum)
    );
    check(
      "one label per group, its text the group's site",
      labels.length === 2 && texts.join(",") === "Morris,Crookston",
      texts
    );
  }

  // No stamps: nothing is wrapped.
  {
    const node = await chart(rows)
      .flow(spread({ by: "site", dir: "x" }))
      .mark(rect({ h: "v", w: 10 }))
      .resolve();
    const res = await lowerSelectionLayers(node, {
      take: () => [] as never[],
      target: (e: never) => e,
      draw: () => ({ nodes: [], constraints: () => [], drawn: undefined }),
    });
    check("a modifier with no stamps changes nothing", !res.changed);
  }

  report();
}

main();
