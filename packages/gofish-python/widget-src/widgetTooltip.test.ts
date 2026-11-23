/**
 * `.tooltip()` in the notebook widget (#1395): a Python chart, shipped as
 * the widget ships it (`ir_payload`, tables as base64 Arrow), rendered by
 * the built widget bundle's own anywidget entry (`gofish/_static/
 * widget.esm.js`, the file a notebook loads), in a headless DOM. A pointer
 * move over a bar opens the box, and a leave closes it.
 *
 * Run: `pnpm --filter gofish-python test:widget-tooltip` (builds the bundle
 * first; needs `uv`, as pytest does).
 */
// The headless DOM must exist before the bundle (and its solid-js) loads.
import { settle } from "../../gofish-graphics/src/tests/interactionDomSetup";
import { execFileSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

declare const process: any;

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) {
    failed++;
    if (detail !== undefined) console.log("       ", detail);
  }
};

// The document a Python `rect(w="share").tooltip(["path", "n"])` chart
// ships to the widget.
const PY = `
import json
from gofish import chart, rect, spread
from gofish.ast import ir_payload
rows = [
    {"path": "VO→VO", "n": 11902, "share": 0.13},
    {"path": "INF→INF", "n": 9811, "share": 0.107},
    {"path": "PK→PK", "n": 5310, "share": 0.058},
]
c = (
    chart(rows)
    .flow(spread(by="path", dir="y", spacing=4))
    .mark(rect(w="share").tooltip(["path", "n"]))
)
doc, _ = ir_payload(c)
print(json.dumps(doc))
`;
const doc = JSON.parse(
  execFileSync("uv", ["run", "python", "-c", PY], {
    cwd: pkg,
    encoding: "utf8",
  })
);

// Built by `build-widget.mjs` before this test runs; it has no types.
const BUNDLE = "../gofish/_static/widget.esm.js";
const widget = (await import(BUNDLE)).default;

const traits: Record<string, unknown> = {
  doc,
  width: 400,
  height: 200,
  axes: null,
  legend: null,
  debug: false,
  container_id: "gofish-tooltip-test",
  call_response: null,
};
const model = {
  get: (key: string) => traits[key],
  set: (key: string, value: unknown) => void (traits[key] = value),
  save_changes: () => {},
  on: () => {},
};
const el = document.createElement("div");
document.body.appendChild(el);
widget.initialize({ model });
await widget.render({ model, el });
await settle(20);

const container = el.firstElementChild as HTMLElement;
const box = () =>
  [...el.querySelectorAll("rect")].find(
    (r) => r.getAttribute("stroke") === "#c9ced6"
  );
const texts = () => [...el.querySelectorAll("text")].map((t) => t.textContent);
const move = (x: number, y: number) =>
  el.querySelector("svg")!.dispatchEvent(
    new (globalThis as any).PointerEvent("pointermove", {
      clientX: x,
      clientY: y,
      bubbles: true,
      pointerType: "mouse",
    })
  );

console.log("# the widget renders the chart live");
check("an svg", el.querySelector("svg") !== null);
check("no box yet", box() === undefined);
check(
  "live: no <title> (the box replaces it)",
  el.querySelectorAll("title").length === 0
);

console.log("# hover the second bar");
// The middle bar spans y = 100 (the plot is 200 px tall, less its axis).
move(100, 100);
await settle(20);
check("a box", box() !== undefined);
check(
  "with the listed fields, painted last",
  JSON.stringify(texts().slice(-4)) ===
    JSON.stringify(["path", "n", "INF→INF", "9811"]),
  texts()
);

console.log("# leave the chart");
container.dispatchEvent(
  new (globalThis as any).PointerEvent("pointerleave", {
    clientX: 1000,
    clientY: 1000,
    bubbles: false,
    pointerType: "mouse",
  })
);
await settle(20);
check("the box closes", box() === undefined);

console.log(`\n${failed === 0 ? "all passed" : `${failed} failed`}`);
if (failed > 0) process.exitCode = 1;
// happy-dom keeps timers alive; end the run.
process.exit(process.exitCode ?? 0);
