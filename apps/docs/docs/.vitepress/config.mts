import { defineConfig } from "vitepress";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import matter from "gray-matter";
import starfish from "./markdown-it-starfish";
import container from "markdown-it-container";
import { renderSandbox } from "vitepress-plugin-sandpack";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { readdirSync, readFileSync } from "fs";
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

// The internals wiki is language-agnostic — a third top-level section beside
// js/ and python/. Its sidebar is generated from each essay's frontmatter:
// `section` picks the top-level group and `order` sorts within it. An optional
// `group` files the essay under an intermediate, non-clickable label — only leaf
// essays are pages; a group sits at the position of its lowest-ordered member.
const INTERNALS_SECTION_ORDER = [
  "Overview",
  "Frontend",
  "Core",
  "Layout & Rendering",
  "JSON Formats",
  "Python",
  "Design Evolution",
  "Speculative Notes",
];

function collectInternalsSidebar() {
  type Page = {
    title: string;
    section: string;
    order: number;
    group: string | null;
    link: string;
  };
  const pages: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // api/ holds generated TypeDoc output — essays link to it directly, it
      // does not belong in the hand-curated sidebar.
      if (entry.isDirectory()) {
        if (entry.name !== "api") walk(join(dir, entry.name));
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      const full = join(dir, entry.name);
      const fm = matter(readFileSync(full, "utf-8")).data as Record<
        string,
        unknown
      >;
      let rel = relative(docsDir, full)
        .replace(/\\/g, "/")
        .replace(/\.md$/, "");
      if (rel.endsWith("/index")) rel = rel.slice(0, -"/index".length);
      pages.push({
        title: typeof fm.title === "string" ? fm.title : entry.name,
        section: typeof fm.section === "string" ? fm.section : "Other",
        order: typeof fm.order === "number" ? fm.order : 999,
        group: typeof fm.group === "string" ? fm.group : null,
        link: "/" + rel,
      });
    }
  };
  walk(join(docsDir, "internals"));

  const byOrder = (a: Page, b: Page) =>
    a.order - b.order || a.title.localeCompare(b.title);

  const bySection = new Map<string, Page[]>();
  for (const p of pages) {
    if (!bySection.has(p.section)) bySection.set(p.section, []);
    bySection.get(p.section)!.push(p);
  }

  const rank = (s: string) => {
    const i = INTERNALS_SECTION_ORDER.indexOf(s);
    return i < 0 ? INTERNALS_SECTION_ORDER.length : i;
  };

  return [...bySection.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((section) => {
      const ps = bySection.get(section)!;
      // Each section entry is either a leaf essay or a label-only group; both
      // sort by `order` (a group takes its lowest-ordered member's order).
      type Entry = { order: number; item: Record<string, unknown> };
      const entries: Entry[] = ps
        .filter((p) => !p.group)
        .map((p) => ({
          order: p.order,
          item: { text: p.title, link: p.link },
        }));
      for (const name of new Set(
        ps.filter((p) => p.group).map((p) => p.group as string)
      )) {
        const members = ps.filter((p) => p.group === name).sort(byOrder);
        entries.push({
          order: members[0].order,
          item: {
            text: name,
            collapsed: false,
            items: members.map((m) => ({ text: m.title, link: m.link })),
          },
        });
      }
      return {
        text: section,
        collapsed: false,
        items: entries.sort((a, b) => a.order - b.order).map((e) => e.item),
      };
    });
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
    // preference wins. CSS keyed off this attribute does the rest. Internals
    // pages are language-agnostic (the toggle is hidden there), so they fall
    // through to the saved preference — harmless. The same script also adds the
    // `landing-page` class on the home route so the desk/navbar styling paints
    // immediately on direct loads instead of flashing a stock white docs page.
    // NOTE: the 'python' fallback literal must match DEFAULT_LANG in
    // theme/docsLang.ts (this inline script can't import it).
    [
      "script",
      {},
      `(function(){try{var p=location.pathname,l;if(p.indexOf('/python/')===0){l='python';}else if(p.indexOf('/js/')===0){l='js';}else{var s=localStorage.getItem('gofish-docs-lang');l=(s==='python'||s==='js')?s:'python';}document.documentElement.setAttribute('data-docs-lang',l);if(p==='/'||p==='/index.html'){document.documentElement.classList.add('landing-page');}}catch(e){}})();`,
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
    // Real type-on-hover in `ts twoslash` blocks — type errors fail the build.
    codeTransformers: [transformerTwoslash()],
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
      options: {
        // Show a text excerpt under each result, not just the heading.
        detailedView: true,
        // Internals essays are long and narrative; one search hit per heading
        // is noise. Demote sub-headings before the local-search indexer splits
        // the page, so each internals essay collapses to a single result. The
        // JS/Python API docs keep their finer-grained per-section results.
        _render(src, env, md) {
          const html = md.render(src, env);
          if (
            typeof env.relativePath === "string" &&
            env.relativePath.startsWith("internals/")
          ) {
            return html.replace(/<(\/?)h[2-6]([^>]*)>/g, "<$1p$2>");
          }
          return html;
        },
      },
    },
    // https://vitepress.dev/reference/default-theme-config
    // No top-nav items — section navigation lives in the per-language
    // sidebar, the language toggle is a theme slot, and the internals wiki
    // is reached via a quiet icon link in the nav bar (InternalsLink.vue).
    nav: [],

    // One sidebar per top-level area. JS/Python are hand-maintained and kept
    // structurally parallel; /internals/ is generated from essay frontmatter.
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
                { text: "connect", link: "/js/api/core/connect" },
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
                { text: "polygon", link: "/js/api/marks/polygon" },
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
                { text: "connect", link: "/js/api/operators/connect" },
                {
                  text: "region compositing",
                  link: "/js/api/operators/region-compositing",
                },
                { text: "cut", link: "/js/api/operators/cut" },
                { text: "offset", link: "/js/api/operators/offset" },
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
              items: [
                {
                  text: "ref / selectAll",
                  link: "/js/api/selection/ref",
                },
              ],
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
                { text: "connect", link: "/python/api/core/connect" },
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
                {
                  text: "region compositing",
                  link: "/python/api/operators/region-compositing",
                },
                { text: "cut", link: "/python/api/operators/cut" },
                { text: "offset", link: "/python/api/operators/offset" },
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
            {
              text: "Constraints",
              collapsed: true,
              items: [
                {
                  text: "constrain",
                  link: "/python/api/constraints/constrain",
                },
              ],
            },
            {
              text: "Selection",
              collapsed: true,
              items: [
                {
                  text: "ref / selectAll",
                  link: "/python/api/selection/ref",
                },
              ],
            },
          ],
        },
      ],
      "/internals/": collectInternalsSidebar(),
    },

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/gofish-graphics/gofish-graphics",
      },
    ],
  },
});
