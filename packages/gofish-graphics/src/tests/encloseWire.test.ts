/**
 * A blob's `avoiding` on the wire (`NodeSelectionIR`): the JS emitter writes
 * each kind of value it can hold, the validator accepts it, and fromJSON
 * rebuilds an enclosure that renders exactly as the JS one does. Also the
 * values the wire has no form for: an unnamed node, a single ref, a
 * selectAll inside a list.
 *
 * Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/encloseWire.test.ts` (wired as `pnpm test:enclose-wire`).
 */
import { settle } from "./interactionDomSetup";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { Frontend } from "gofish-ir";

const {
  chart,
  layer,
  spread,
  circle,
  enclose,
  ref,
  selectAll,
  scatter,
  group,
  Shape,
  Serialize,
} = GoFish as any;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
async function errorOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}
const valid = (doc: unknown) => {
  const r = Frontend.validate(doc);
  return r.valid ? "" : JSON.stringify(r.errors.slice(0, 2));
};
/** Render into a fresh container and return its SVG markup. */
async function svgOf(draw: (el: HTMLElement) => Promise<unknown>) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await draw(el);
  await settle();
  return el.innerHTML;
}

console.log("# avoiding: [b] inside .relate(), as Python writes it");
{
  // a and c in, b out: Munkres' {a, c} spine
  const dots = () =>
    spread({ dir: "x", spacing: 95, alignment: "middle" }, [
      circle({ r: 5, fill: "#111" }).name("a"),
      circle({ r: 5, fill: "#111" }).name("b"),
      circle({ r: 5, fill: "#111" }).name("c"),
    ]);
  const js = await svgOf((el) =>
    layer([dots()])
      .relate(({ a, b, c }: any) => [
        enclose(
          { shape: Shape.spine({ avoiding: [b], clearance: 6 }), padding: 22 },
          [a, c]
        ),
      ])
      .render(el, { w: 380, h: 150 })
  );
  // The IR a Python `.relate()` callback emits for the same layer.
  const doc = {
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "raw-mark",
      mark: {
        type: "layer",
        __combinator: true,
        children: [
          {
            type: "spread",
            __combinator: true,
            options: { dir: "x", spacing: 95, alignment: "middle" },
            children: ["a", "b", "c"].map((name) => ({
              type: "circle",
              r: 5,
              fill: "#111",
              name,
            })),
          },
        ],
        relate: [
          {
            type: "enclose",
            __combinator: true,
            options: {
              shape: {
                kind: "blob",
                convexity: 0,
                clearance: 6,
                avoiding: [{ type: "ref", selection: "b" }],
              },
              padding: 22,
            },
            children: [
              { type: "ref", selection: "a" },
              { type: "ref", selection: "c" },
            ],
          },
        ],
      },
    },
  };
  check("the IR validates", valid(doc) === "", valid(doc));
  const ir = await svgOf((el) =>
    Serialize.renderIR(doc.root, el, { w: 380, h: 150 })
  );
  check(
    "fromJSON renders the same enclosure as the JS spec",
    ir === js && js.includes("<path"),
    `${ir.length} vs ${js.length} chars`
  );
}

console.log("# avoiding: selectAll(name), through JS toJSON and back");
{
  const rows = [
    { x: 1, y: 1, g: "p" },
    { x: 2, y: 1.5, g: "p" },
    { x: 1.5, y: 3, g: "p" },
    { x: 4, y: 2, g: "q" },
    { x: 5, y: 3, g: "q" },
    { x: 4.5, y: 4, g: "q" },
  ];
  const points = () =>
    chart(rows)
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 4, fill: "g" }).name("pts"));
  const outlines = () =>
    chart(selectAll("pts"))
      .flow(group({ by: "g" }))
      .mark(
        enclose({
          shape: Shape.blob({ avoiding: selectAll("pts") }),
          padding: 6,
          fill: "g",
        })
      );
  const build = () => points().layer(outlines());
  // The two tiers, each emitted by JS, as one builder layer (the form a
  // Python `.layer(...)` chain takes).
  const doc = {
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "layer",
      builder: true,
      charts: [
        (await points().toJSON()).root,
        (await outlines().toJSON()).root,
      ],
    },
  };
  check("the IR validates", valid(doc) === "", valid(doc));
  const avoiding = JSON.stringify(doc).match(/"avoiding":(\{[^}]*\})/)?.[1];
  check(
    "selectAll is written as a select of every node",
    avoiding === '{"type":"select","layer":"pts","mode":"all"}',
    avoiding
  );
  const js = await svgOf((el) => build().render(el, { w: 300, h: 200 }));
  const ir = await svgOf((el) =>
    Serialize.renderIR(
      Serialize.readIR(JSON.stringify(doc)).root,
      el,
      { w: 300, h: 200 },
      { tierRows: [rows] }
    )
  );
  check(
    "fromJSON renders the same enclosures",
    ir === js && js.includes("<path"),
    `${ir.length} vs ${js.length} chars`
  );
}

console.log("# what each node value is written as");
{
  const b = await circle({ r: 5 }).name("b")([{}]);
  const unnamed = await circle({ r: 5 })([{}]);
  const ir = async (avoiding: unknown) => {
    // The combinator builds its node at once; only its IR is read here, so
    // a build that fails (as an invalid avoiding does) is caught, not left
    // unhandled.
    const built = enclose({ shape: Shape.spine({ avoiding }) }, [ref("a")]);
    built.catch(() => {});
    const doc = await chart([{}])
      .mark(layer([circle({ r: 5 }).name("a"), built]))
      .toJSON();
    return JSON.stringify(
      (doc.root as any).mark.children[1].options.shape.avoiding
    );
  };
  check(
    "a ref by name is a ref",
    (await ir([ref("x")])) === '[{"type":"ref","selection":"x"}]'
  );
  check(
    "a named node is a ref by its name",
    (await ir([b])) === '[{"type":"ref","selection":"b"}]'
  );
  check(
    "an unnamed node cannot cross the wire, and says to name it",
    /no name.*Name it/s.test(await errorOf(() => ir([unnamed])))
  );
  check(
    "a selectAll inside a list is an error",
    /not an item of a list/.test(await errorOf(() => ir([selectAll("pts")])))
  );
}

console.log("# nested children, rendered and serialized alike");
{
  // enclose(opts, [[a, b], c]): rendering flattens the nested list, and
  // so does toJSON, so the IR rebuilds the same enclosure.
  const build = () =>
    chart([{}]).mark(
      layer([
        enclose({ shape: Shape.box({ rx: 6 }), padding: 8, fill: "#eee" }, [
          [
            spread({ dir: "x", spacing: 20, alignment: "middle" }, [
              circle({ r: 6, fill: "#111" }),
              circle({ r: 9, fill: "#111" }),
            ]),
            circle({ r: 4, fill: "#c00" }),
          ],
          circle({ r: 12, fill: "none", stroke: "#111" }),
        ]),
      ])
    );
  const doc = await build().toJSON();
  check("the IR validates", valid(doc) === "", valid(doc));
  const kids = (doc.root as any).mark.children[0].children.map(
    (c: any) => c.type
  );
  check(
    "the enclosure's children are written flat",
    JSON.stringify(kids) === '["spread","circle","circle"]',
    JSON.stringify(kids)
  );
  const js = await svgOf((el) => build().render(el, { w: 200, h: 80 }));
  const ir = await svgOf((el) =>
    Serialize.renderIR(Serialize.readIR(JSON.stringify(doc)).root, el, {
      w: 200,
      h: 80,
    })
  );
  check(
    "fromJSON renders the same enclosure",
    ir === js && js.includes("<rect"),
    `${ir.length} vs ${js.length} chars`
  );
}

console.log("# a single ref is not a node list, in JS as on the wire");
{
  const message = await errorOf(() =>
    layer([
      circle({ r: 5 }).name("a"),
      circle({ r: 5 }).name("b"),
    ])
      .relate(({ a, b }: any) => [
        enclose({ shape: Shape.spine({ avoiding: b }) }, [a]),
      ])
      .render(document.createElement("div"), { w: 100, h: 100 })
  );
  check(
    "enclose rejects avoiding: ref, and says to use a list",
    /put a single ref in a list/.test(message),
    message
  );
  const wire = Frontend.validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "raw-mark",
      mark: {
        type: "enclose",
        __combinator: true,
        options: {
          shape: { kind: "blob", avoiding: { type: "ref", selection: "b" } },
        },
        children: [],
      },
    },
  });
  check("the validator rejects it too", !wire.valid);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
