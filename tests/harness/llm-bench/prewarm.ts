// Listed in `optimizeDeps.entries` so Vite's dependency scan sees every
// library an arm's program may import (a dependency discovered mid-run
// triggers a re-optimization that reloads the page). The runner also calls
// `prewarm()` once at startup, so gofish-graphics source is transformed before
// the first render, and `prewarm(lib)` before each timed render, so the
// render time covers the program, not loading the library.
export type Lib = "gofish" | "d3" | "recharts" | "plot";

// The d3 and plot arms' extension packages (llm-bench/extensions.ts), which
// both arms may import beside d3.
const d3Modules = () =>
  Promise.all([import("d3"), import("d3-sankey"), import("d3-hexbin")]);

const loaders: Record<Lib, () => Promise<unknown>> = {
  gofish: () => import("gofish-graphics"),
  d3: d3Modules,
  plot: () => Promise.all([import("@observablehq/plot"), d3Modules()]),
  recharts: () =>
    Promise.all([
      import("react"),
      import("react/jsx-runtime"),
      import("react-dom"),
      import("react-dom/client"),
      import("recharts"),
    ]),
};

export async function prewarm(lib?: Lib): Promise<void> {
  if (lib) await loaders[lib]();
  else await Promise.all(Object.values(loaders).map((load) => load()));
}
