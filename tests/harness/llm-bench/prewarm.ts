// Listed in `optimizeDeps.entries` so Vite's dependency scan sees every
// library an arm's program may import (a dependency discovered mid-run
// triggers a re-optimization that reloads the page). The runner also calls
// `prewarm()` once at startup, so gofish-graphics source is transformed before
// the first render, and `prewarm(lib)` before each timed render, so the
// render time covers the program, not loading the library.
export type Lib = "gofish" | "d3" | "recharts";

const loaders: Record<Lib, () => Promise<unknown>> = {
  gofish: () => import("gofish-graphics"),
  d3: () => import("d3"),
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
