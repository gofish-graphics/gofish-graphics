import { defineConfig } from "vitepress";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import matter from "gray-matter";
import gofish from "./markdown-it-gofish";
import wikilink, { type WikiTarget } from "./markdown-it-wikilink";
import container from "markdown-it-container";
import { renderSandbox } from "vitepress-plugin-sandpack";
import vueJsx from "@vitejs/plugin-vue-jsx";
import solidPlugin from "vite-plugin-solid";
import { readdirSync, readFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// SolidJS must resolve to exactly ONE physical copy, with every entrypoint
// pointing at its *client* (DOM) build. Two failure modes converge here:
//
//   1. Two copies. The docs package and the gofish-graphics package each carry
//      their own solid-js (different versions). If `solid-js/web` resolves to
//      one copy while bare `solid-js` resolves to the other, SolidJS's reactive
//      runtime state is split across two module instances — Suspense in
//      gofish.tsx never resolves and every chart hangs on "Loading...". We pin
//      to the copy the library sources naturally pair with: gofish-graphics's.
//
//   2. SSR build conditions. VitePress builds a server (SSR) bundle alongside
//      the client one. Under the `node` export condition, bare `solid-js`
//      resolves to `dist/server.js` and `solid-js/web` to its server build —
//      which omits DOM-only exports like `use` (the `use:` directive) and,
//      worse, is a *different* module instance than `solid-js/jsx-runtime`
//      (whose only export is the client `dist/solid.js`), re-splitting the
//      runtime even within a single copy.
//
// So we resolve solid-js from the gofish-graphics package context and alias
// every entrypoint the library imports (grepped from packages/gofish-graphics/
// src: `solid-js`, `solid-js/web`, `solid-js/jsx-runtime`) to that copy's
// client builds. We also force Solid DOM codegen (below). The story chunks and
// the dist build only ever execute in the browser (GoFishExample/GoFishVue
// mount in onMounted), so pointing SSR at the DOM builds is harmless.
const require = createRequire(import.meta.url);
const GOFISH_PKG_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/gofish-graphics"
);
const SOLID_DIR = dirname(
  require.resolve("solid-js/package.json", { paths: [GOFISH_PKG_DIR] })
);
const SOLID_CORE_CLIENT = join(SOLID_DIR, "dist/solid.js");
const SOLID_WEB_CLIENT = join(SOLID_DIR, "web/dist/web.js");

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

/** Map each internals essay's filename slug → its link + title, for `[[slug]]`
 *  wiki-link resolution (see markdown-it-wikilink). */
function collectWikiTargets(): Map<string, WikiTarget> {
  const targets = new Map<string, WikiTarget>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
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
      const slug = entry.name.replace(/\.md$/, "");
      targets.set(slug, {
        link: "/" + rel,
        title: typeof fm.title === "string" ? fm.title : slug,
      });
    }
  };
  walk(join(docsDir, "internals"));
  return targets;
}

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
  vite: {
    resolve: {
      // See SOLID_CORE_CLIENT above — pin every solid-js entrypoint the library
      // imports to a single physical copy's client (DOM) builds, in both the
      // client and SSR bundles. jsx-runtime's only export is the client core
      // build, so aliasing core + web to the matching client builds keeps all
      // three on one runtime instance.
      alias: [
        { find: /^solid-js\/web$/, replacement: SOLID_WEB_CLIENT },
        { find: /^solid-js\/jsx-runtime$/, replacement: SOLID_CORE_CLIENT },
        { find: /^solid-js$/, replacement: SOLID_CORE_CLIENT },
      ],
    },
    plugins: [
      // The Storybook stories rendered by GoFishExample are SolidJS source.
      // Scope each JSX compiler to its own slice of the tree so they never fight
      // over the same .tsx files: vue-jsx owns the docs' own Vue .tsx components
      // (and must NOT touch the gofish-graphics package), while vite-plugin-solid
      // owns only the library package's .ts(x) sources and its .stories.tsx files.
      // `generate: "dom"` forces DOM codegen even in the SSR bundle (the stories
      // only execute client-side, so SSR-flavoured codegen is never needed).
      vueJsx({ exclude: [/packages\/gofish-graphics\/.*\.[jt]sx?$/] }),
      solidPlugin({
        include: [/packages\/gofish-graphics\/.*\.[jt]sx?$/],
        solid: { generate: "dom", hydratable: false },
      }),
      // vue-jsx's config() narrows vite's esbuild to `/\.ts$/` (it expects to own
      // every .tsx itself). We instead route the gofish-graphics .tsx — including
      // the .stories.tsx rendered by GoFishExample — through vite-plugin-solid,
      // which only compiles JSX and leaves the remaining TS types for esbuild to
      // strip. So re-widen esbuild back to .tsx/.jsx. This plugin's config() runs
      // after vue-jsx's, so its esbuild.include wins.
      //
      // CRITICAL: `jsx: "preserve"`. esbuild's default JSX handling compiles any
      // JSX it sees with the React.createElement pragma. With esbuild widened to
      // .tsx, that pragma would hit the docs' OWN .tsx (e.g. components/
      // GoFishLive.tsx, the Sandpack wrapper) before vue-jsx transforms it,
      // emitting `React.createElement(...)` → "React is not defined" at runtime
      // (the playground rendered blank). `preserve` makes esbuild strip TS types
      // only and leave JSX untouched, so the real JSX compilers own it: vue-jsx
      // for the docs' Vue .tsx, vite-plugin-solid for the gofish-graphics sources.
      {
        name: "gofish-restore-esbuild-tsx",
        config: () => ({ esbuild: { include: /\.[jt]sx?$/, jsx: "preserve" } }),
      },
    ],
  },
  appearance: false,
  title: "GoFish Graphics",
  description:
    "GoFish is an open-source visualization library for Python and JavaScript.",
  // Per-page social-preview tags. The invariant og:image / twitter:card etc.
  // live in `head` above; here we fill in the title / description / url for the
  // specific page so a shared deep link previews with that page's own heading
  // rather than the site default. Pushed onto the page's frontmatter head so
  // they render into each generated HTML file.
  transformPageData(pageData) {
    const path = pageData.relativePath
      .replace(/(^|\/)index\.md$/, "$1")
      .replace(/\.md$/, ".html");
    const url = `https://gofish.graphics/${path}`;
    const title = pageData.title
      ? `${pageData.title} | GoFish Graphics`
      : "GoFish Graphics";
    const description =
      pageData.description ||
      pageData.frontmatter.description ||
      "GoFish is an open-source visualization library for Python and JavaScript.";
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }]
    );
  },
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
    // Social-media preview (Open Graph + Twitter cards). These are the
    // invariant tags; transformPageData below adds the per-page og:title /
    // og:description / og:url / twitter:title / twitter:description so a link to
    // any deep page previews with that page's own title. The image URL is
    // absolute against the canonical domain — scrapers (Facebook / Slack /
    // Twitter) don't resolve site-relative paths.
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "GoFish Graphics" }],
    [
      "meta",
      { property: "og:image", content: "https://gofish.graphics/og-image.png" },
    ],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    [
      "meta",
      {
        property: "og:image:alt",
        content: "GoFish — graphics that communicate",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    [
      "meta",
      {
        name: "twitter:image",
        content: "https://gofish.graphics/og-image.png",
      },
    ],
  ],
  markdown: {
    // KaTeX/MathJax `$…$` and `$$…$$` (markdown-it-mathjax3, VitePress's math dep).
    math: true,
    // Real type-on-hover in `ts twoslash` blocks — type errors fail the build.
    codeTransformers: [transformerTwoslash()],
    config: (md) => {
      gofish(md);
      // `[[slug]]` wiki links between internals essays → resolved internal links.
      wikilink(md, collectWikiTargets());
      md.use(container, "gofish-live", {
        render(tokens, idx) {
          return renderSandbox(tokens, idx, "gofish-live");
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
    nav: [
      { text: "Examples", link: "/js/examples/", activeMatch: "/examples/" },
      {
        text: "API Reference",
        link: "/js/api/core/chart",
        activeMatch: "/api/",
      },
    ],

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
                { text: "layer", link: "/js/api/core/layer" },
                { text: "connect", link: "/js/api/core/connect" },
                { text: "render", link: "/js/api/core/render" },
                { text: "export (SVG)", link: "/js/api/core/export" },
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
                { text: "text", link: "/js/api/marks/text" },
                { text: "image", link: "/js/api/marks/image" },
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
                { text: "treemap", link: "/js/api/operators/treemap" },
                { text: "layer", link: "/js/api/operators/layer" },
                { text: "connect", link: "/js/api/operators/connect" },
                { text: "arrow", link: "/js/api/operators/arrow" },
                {
                  text: "region compositing",
                  link: "/js/api/operators/region-compositing",
                },
                { text: "cut", link: "/js/api/operators/cut" },
                { text: "offset", link: "/js/api/operators/offset" },
                { text: "derive", link: "/js/api/operators/derive" },
                { text: "resolve", link: "/js/api/operators/resolve" },
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
          text: "How To",
          items: [
            { text: "Create a chart", link: "/python/api/howto/create-chart" },
            { text: "Create a glyph", link: "/python/api/howto/create-glyph" },
            {
              text: "Pick a layout operator",
              link: "/python/api/howto/operators",
            },
            { text: "Use selection", link: "/python/api/howto/selection" },
            {
              text: "Name and scope",
              link: "/python/api/howto/naming-and-scoping",
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
                { text: "chart", link: "/python/api/core/chart" },
                { text: "flow", link: "/python/api/core/flow" },
                { text: "mark", link: "/python/api/core/mark" },
                { text: "layer", link: "/python/api/core/layer" },
                { text: "connect", link: "/python/api/core/connect" },
                { text: "render", link: "/python/api/core/render" },
                { text: "export (SVG)", link: "/python/api/core/export" },
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
                { text: "polygon", link: "/python/api/marks/polygon" },
                { text: "text", link: "/python/api/marks/text" },
                { text: "image", link: "/python/api/marks/image" },
                { text: "ref", link: "/python/api/marks/ref" },
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
                { text: "treemap", link: "/python/api/operators/treemap" },
                { text: "layer", link: "/python/api/operators/layer" },
                { text: "connect", link: "/python/api/operators/connect" },
                { text: "arrow", link: "/python/api/operators/arrow" },
                { text: "derive", link: "/python/api/operators/derive" },
                {
                  text: "region compositing",
                  link: "/python/api/operators/region-compositing",
                },
                { text: "cut", link: "/python/api/operators/cut" },
                { text: "offset", link: "/python/api/operators/offset" },
                { text: "resolve", link: "/python/api/operators/resolve" },
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
            {
              text: "Coordinates",
              collapsed: true,
              items: [
                { text: "polar", link: "/python/api/coords/polar" },
                { text: "clock", link: "/python/api/coords/clock" },
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
