import type { Meta, StoryObj } from "@storybook/html";
import { chart, spread, stack, rect } from "../src/lib";
import { seafood } from "../src/data/catch";
import * as publicApi from "../src/lib";

const meta: Meta = {
  title: "Regressions/Docs Context Parity",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Args = { w: number; h: number };

const DOCS_GROUPED_BAR_CODE = `
chart(seafood, { axes: true })
  .flow(
    spread({ by: "lake",  dir: "x" }),
    stack({ by: "species",  dir: "x", label: false })
  )
  .mark(rect({ h: "count", fill: "species" }))
  .render(root, {
    w,
    h,
  });
`;

type ChartApi = {
  chart: typeof chart;
  spread: typeof spread;
  stack: typeof stack;
  rect: typeof rect;
};

const runDocsLikeSnippet = (
  container: HTMLElement,
  api: ChartApi,
  w: number,
  h: number
) => {
  const root = document.createElement("div");
  root.style.margin = "8px";
  container.appendChild(root);

  const fn = new Function(
    "root",
    "w",
    "h",
    "chart",
    "spread",
    "stack",
    "rect",
    "seafood",
    DOCS_GROUPED_BAR_CODE
  ) as (
    root: HTMLElement,
    w: number,
    h: number,
    chartFn: typeof chart,
    spreadFn: typeof spread,
    stackFn: typeof stack,
    rectFn: typeof rect,
    seafoodData: typeof seafood
  ) => void;

  fn(root, w, h, api.chart, api.spread, api.stack, api.rect, seafood);
  return root;
};

const runDirectStorybookVersion = (container: HTMLElement, w: number, h: number) => {
  const root = document.createElement("div");
  root.style.margin = "8px";
  container.appendChild(root);

  chart(seafood, { axes: true })
    .flow(
      spread({ by: "lake",  dir: "x" }),
      stack({ by: "species",  dir: "x" })
    )
    .mark(rect({ h: "count", fill: "species" }))
    .render(root, {
      w,
      h,
    });

  return root;
};

const inspectHealth = (container: HTMLElement) => {
  const hasLoading = (container.textContent ?? "").includes("Loading");
  const fills = Array.from(container.querySelectorAll("rect"))
    .map((el) => el.getAttribute("fill"))
    .filter((v): v is string => !!v && v !== "none");
  const uniqueFills = new Set(fills);
  return {
    hasLoading,
    uniqueFillCount: uniqueFills.size,
    isHealthy: !hasLoading && uniqueFills.size >= 3,
  };
};

const renderPanel = (title: string, mount: HTMLElement) => {
  const panel = document.createElement("section");
  panel.style.border = "1px solid #d8d8d8";
  panel.style.borderRadius = "8px";
  panel.style.padding = "10px";
  panel.style.background = "#fff";

  const heading = document.createElement("h4");
  heading.textContent = title;
  heading.style.margin = "0 0 8px 0";
  heading.style.fontFamily = "Space Grotesk, sans-serif";
  heading.style.fontWeight = "500";
  panel.appendChild(heading);

  panel.appendChild(mount);
  return panel;
};

export const GroupedBarDocsParity: StoryObj<Args> = {
  args: { w: 400, h: 300 },
  // Async render: the runner awaits it (same contract as lowlevel/Treemap),
  // so the DONE signal — and therefore DOM snapshots — can't land while the
  // panels are still "Loading" / the status still reads "Running parity
  // checks...". A floating promise here raced the capture's settle window.
  render: async (args: Args) => {
    const host = document.createElement("div");
    host.style.padding = "20px";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(420px, 1fr))";
    grid.style.gap = "12px";
    host.appendChild(grid);

    const directMount = document.createElement("div");
    const docsLikeSourceMount = document.createElement("div");
    const docsLikePublicMount = document.createElement("div");

    runDirectStorybookVersion(directMount, args.w, args.h);
    runDocsLikeSnippet(
      docsLikeSourceMount,
      { chart, spread, stack, rect },
      args.w,
      args.h
    );
    runDocsLikeSnippet(
      docsLikePublicMount,
      {
        chart: publicApi.chart as typeof chart,
        spread: publicApi.spread as typeof spread,
        stack: publicApi.stack as typeof stack,
        rect: publicApi.rect as typeof rect,
      },
      args.w,
      args.h
    );

    const directPanel = renderPanel("Storybook source API", directMount);
    const docsSourcePanel = renderPanel(
      "Docs-style runtime (new Function) + source API",
      docsLikeSourceMount
    );
    const docsPublicPanel = renderPanel(
      "Docs-style runtime (new Function) + public dist API",
      docsLikePublicMount
    );

    const status = document.createElement("pre");
    status.style.margin = "8px 0 0 0";
    status.style.padding = "8px";
    status.style.borderRadius = "6px";
    status.style.background = "#f7f7f7";
    status.style.fontSize = "12px";
    status.style.lineHeight = "1.4";
    status.textContent = "Running parity checks...";
    host.appendChild(status);

    grid.appendChild(directPanel);
    grid.appendChild(docsSourcePanel);
    grid.appendChild(docsPublicPanel);

    // Wait until each mount has actually rendered some <rect>s before
    // reading the status. The previous double-`requestAnimationFrame`
    // version captured intermittently: in CI a snapshot would land before
    // SolidJS had flushed, leaving status text frozen at
    // `loading=true, uniqueFills=0` even though the SVG itself was fine.
    const waitForRects = (mount: HTMLElement) =>
      new Promise<void>((resolve) => {
        if (mount.querySelectorAll("rect").length > 0) return resolve();
        const observer = new MutationObserver(() => {
          if (mount.querySelectorAll("rect").length > 0) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(mount, { childList: true, subtree: true });
      });

    await Promise.all([
      waitForRects(directMount),
      waitForRects(docsLikeSourceMount),
      waitForRects(docsLikePublicMount),
    ]);
    // One extra frame so SolidJS finishes any post-mount effects that
    // would update `fill` attributes (e.g. color-scale resolution).
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );

    const a = inspectHealth(directMount);
    const b = inspectHealth(docsLikeSourceMount);
    const c = inspectHealth(docsLikePublicMount);

    status.textContent =
      `source: healthy=${a.isHealthy}, loading=${a.hasLoading}, uniqueFills=${a.uniqueFillCount}\n` +
      `docs+source: healthy=${b.isHealthy}, loading=${b.hasLoading}, uniqueFills=${b.uniqueFillCount}\n` +
      `docs+public: healthy=${c.isHealthy}, loading=${c.hasLoading}, uniqueFills=${c.uniqueFillCount}`;

    return host;
  },
};
