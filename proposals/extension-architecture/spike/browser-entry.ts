// The browser reference for S2: the normal Solid render of the same specs.
// Built with vite + vite-plugin-solid (vite.browser.config.mjs), loaded by
// s2-browser.mjs in headless Chromium.
import { seafood } from "../../../packages/gofish-graphics/src/data/catch";
import { world110m } from "../../../packages/gofish-graphics/src/data/world110m";
import { birds } from "../../../packages/gofish-graphics/src/data/birds";
import { buildSpecs } from "./specs";

(window as any).renderSpec = async (
  name: string,
  csvData: { weather: any[]; stocks: any[] }
) => {
  const specs: any = buildSpecs({ ...csvData, seafood, world110m, birds });
  const { node, opts } = specs[name];
  const container = document.getElementById("root")!;
  container.innerHTML = "";
  await node.render(container, opts);
};
