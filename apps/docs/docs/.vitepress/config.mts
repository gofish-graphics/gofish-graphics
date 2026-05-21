import { defineConfig } from "vitepress";
import starfish from "./markdown-it-starfish";
import container from "markdown-it-container";
import { renderSandbox } from "vitepress-plugin-sandpack";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { readdirSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

// Build-time manifest of every JS/Python doc route. Exposed via themeConfig so
// the language toggle knows whether a mirrored page exists before navigating.
const docsDir = join(fileURLToPath(import.meta.url), "../..");

function collectDocRoutes(): string[] {
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        let rel = relative(docsDir, full)
          .replace(/\\/g, "/")
          .replace(/\.md$/, "");
        if (rel.endsWith("/index")) rel = rel.slice(0, -"index".length);
        routes.push("/" + rel);
      }
    }
  };
  walk(join(docsDir, "js"));
  walk(join(docsDir, "python"));
  return routes;
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  vite: { plugins: [vueJsx()] },
  appearance: false,
  // title: "Starfish Graphics",
  // description: "Documentation for Starfish",
  title: "GoFish Graphics",
  description: "Documentation for GoFish",
  head: [
    // Set <html data-docs-lang> before first paint so the language toggle and
    // hero render in the reader's preferred language with no flash of the
    // default. On doc pages the route wins; on the home page the saved
    // preference wins. CSS keyed off this attribute does the rest.
    [
      "script",
      {},
      `(function(){try{var p=location.pathname,l;if(p.indexOf('/python/')===0){l='python';}else if(p.indexOf('/js/')===0){l='js';}else{var s=localStorage.getItem('gofish-docs-lang');l=(s==='python'||s==='js')?s:'js';}document.documentElement.setAttribute('data-docs-lang',l);}catch(e){}})();`,
    ],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    [
      "link",
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Balsamiq+Sans:ital,wght@0,400;0,700;1,400;1,700&family=Comic+Neue:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&family=Fira+Code:wght@300..700&family=Source+Sans+3:ital,wght@0,200..900;1,200..900&display=swap",
      },
    ],
    ["link", { rel: "icon", href: "/gofish-logo.png" }],
  ],
  markdown: {
    config: (md) => {
      starfish(md);
      md.use(container, "starfish-live", {
        render(tokens, idx) {
          return renderSandbox(tokens, idx, "starfish-live");
        },
      });
    },
  },
  themeConfig: {
    logo: "/gofish-logo.png",
    // Consumed by the LanguageToggle theme component.
    docRoutes: collectDocRoutes(),
    search: {
      provider: "local",
    },
    // https://vitepress.dev/reference/default-theme-config
    // No top nav items — the logo links home, section navigation lives in the
    // per-language sidebar, and the JavaScript/Python toggle is a theme slot.
    nav: [],

    // One sidebar per language — the same structure shows on every page
    // (overview pages and API pages alike); VitePress auto-expands the group
    // that contains the current page.
    sidebar: {
      "/js/": [
        {
          text: "Get Started",
          items: [
            { text: "First Steps", link: "/js/get-started" },
            { text: "Tutorial", link: "/js/tutorial" },
            { text: "Examples", link: "/js/examples/" },
          ],
        },
        {
          text: "How To",
          items: [
            { text: "Create a chart", link: "/js/api/howto/create-chart" },
            { text: "Create a glyph", link: "/js/api/howto/create-glyph" },
            { text: "Pick a layout operator", link: "/js/api/howto/operators" },
            { text: "Use selection", link: "/js/api/howto/selection" },
            {
              text: "Name and scope",
              link: "/js/api/howto/naming-and-scoping",
            },
          ],
        },
        {
          text: "API Reference",
          items: [
            {
              text: "Core",
              collapsed: true,
              items: [
                { text: "chart", link: "/js/api/core/chart" },
                { text: "flow", link: "/js/api/core/flow" },
                { text: "mark", link: "/js/api/core/mark" },
                { text: "render", link: "/js/api/core/render" },
              ],
            },
            {
              text: "Marks",
              collapsed: true,
              items: [
                { text: "rect", link: "/js/api/marks/rect" },
                { text: "circle", link: "/js/api/marks/circle" },
                { text: "ellipse", link: "/js/api/marks/ellipse" },
                { text: "line", link: "/js/api/marks/line" },
                { text: "area", link: "/js/api/marks/area" },
                { text: "blank", link: "/js/api/marks/blank" },
                { text: "ref", link: "/js/api/marks/ref" },
              ],
            },
            {
              text: "Operators",
              collapsed: true,
              items: [
                { text: "spread", link: "/js/api/operators/spread" },
                { text: "stack", link: "/js/api/operators/stack" },
                { text: "table", link: "/js/api/operators/table" },
                { text: "scatter", link: "/js/api/operators/scatter" },
                { text: "group", link: "/js/api/operators/group" },
                { text: "layer", link: "/js/api/operators/layer" },
                { text: "derive", link: "/js/api/operators/derive" },
                { text: "log", link: "/js/api/operators/log" },
              ],
            },
            {
              text: "Color",
              collapsed: true,
              items: [
                { text: "palette", link: "/js/api/color/palette" },
                { text: "gradient", link: "/js/api/color/gradient" },
              ],
            },
            {
              text: "Constraints",
              collapsed: true,
              items: [
                { text: "constrain", link: "/js/api/constraints/constrain" },
              ],
            },
            {
              text: "Selection",
              collapsed: true,
              items: [{ text: "select", link: "/js/api/selection/select" }],
            },
            {
              text: "Coordinates",
              collapsed: true,
              items: [
                { text: "polar", link: "/js/api/coords/polar" },
                { text: "clock", link: "/js/api/coords/clock" },
              ],
            },
          ],
        },
      ],
      "/python/": [
        {
          text: "Get Started",
          items: [
            { text: "First Steps", link: "/python/get-started" },
            { text: "Tutorial", link: "/python/tutorial" },
            { text: "Examples", link: "/python/examples/" },
          ],
        },
        {
          text: "API Reference",
          items: [
            {
              text: "Core",
              collapsed: true,
              items: [
                { text: "chart", link: "/python/api/core/chart" },
                { text: "flow", link: "/python/api/core/flow" },
                { text: "mark", link: "/python/api/core/mark" },
                { text: "render", link: "/python/api/core/render" },
              ],
            },
            {
              text: "Marks",
              collapsed: true,
              items: [
                { text: "rect", link: "/python/api/marks/rect" },
                { text: "circle", link: "/python/api/marks/circle" },
                { text: "ellipse", link: "/python/api/marks/ellipse" },
                { text: "line", link: "/python/api/marks/line" },
                { text: "area", link: "/python/api/marks/area" },
                { text: "blank", link: "/python/api/marks/blank" },
              ],
            },
            {
              text: "Operators",
              collapsed: true,
              items: [
                { text: "spread", link: "/python/api/operators/spread" },
                { text: "stack", link: "/python/api/operators/stack" },
                { text: "table", link: "/python/api/operators/table" },
                { text: "scatter", link: "/python/api/operators/scatter" },
                { text: "group", link: "/python/api/operators/group" },
                { text: "derive", link: "/python/api/operators/derive" },
                { text: "log", link: "/python/api/operators/log" },
              ],
            },
            {
              text: "Color",
              collapsed: true,
              items: [
                { text: "palette", link: "/python/api/color/palette" },
                { text: "gradient", link: "/python/api/color/gradient" },
              ],
            },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/gofish-graphics/gofish-graphics",
      },
    ],
  },
});
