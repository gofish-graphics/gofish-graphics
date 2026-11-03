// The bundle's entry: the page (main.ts) on the page, the compute (pool.ts) when the same
// script is started as a worker. The page's own text is kept now (document.currentScript is
// only set while the script first runs) for starting the workers.
import { workerMain } from "./pool";

if (typeof document === "undefined") workerMain();
else {
  (globalThis as { __SCRIPT?: string | null }).__SCRIPT =
    document.currentScript?.textContent ?? null;
  void import("./main");
}
