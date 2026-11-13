// https://vitepress.dev/guide/custom-theme
import { defineAsyncComponent, h } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import custom from "./custom.css";
import "./style.css";
import "vitepress-plugin-sandpack/dist/style.css";
import LanguageToggle from "./components/LanguageToggle.vue";
import EssayMeta from "./components/EssayMeta.vue";
import BookChapterHead from "./components/book/BookChapterHead.vue";
import BookRunningHead from "./components/book/BookRunningHead.vue";
import BookNotes from "./components/book/BookNotes.vue";
import "./book.css";
import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import "@shikijs/vitepress-twoslash/style.css";

// The components pages embed in markdown are registered globally but loaded
// on demand: each is its own chunk, fetched only by a page that uses it. A
// static import here would put all of them in the theme chunk every page
// downloads, the home page included: GoFishExample alone pulls in the gallery
// data loader (every example's code and whole dataset) and GoFishVue the
// library and its sample datasets, about 30 MB of JavaScript.
const pageComponents = {
  GoFishVue: () => import("../../../components/GoFishVue.vue"),
  GoFishExample: () => import("../../../components/GoFishExample.vue"),
  GoFishImage: () => import("../../../components/GoFishImage.vue"),
  Sandbox: () => import("vitepress-plugin-sandpack").then((m) => m.Sandbox),
  GoFishLive: () =>
    import("../../../components/GoFishLive").then((m) => m.GoFishLive),
  CheatSheet: () => import("../../../components/MarksCheatSheet.vue"),
  CoordinateTransformsCheatSheet: () =>
    import("../../../components/CoordinateTransformsCheatSheet.vue"),
  OverallCheatSheet: () => import("../../../components/OverallCheatSheet.vue"),
  OperatorsCheatSheet: () =>
    import("../../../components/OperatorsCheatSheet.vue"),
  VegaLiteEmbed: () => import("../../../components/VegaLiteEmbed.vue"),
  ObservablePlotEmbed: () =>
    import("../../../components/ObservablePlotEmbed.vue"),
  TutorialGrid: () => import("./components/tutorials/TutorialGrid.vue"),
  TutorialCard: () => import("./components/tutorials/TutorialCard.vue"),
  // Under the Sea (docs/under-the-sea/).
  TreeStepper: () => import("./components/book/TreeStepper.vue"),
  BookSpread: () => import("./components/book/BookSpread.vue"),
};
export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // Right-hand nav cluster: the JavaScript / Python toggle directly
      // before the GitHub social icon.
      "nav-bar-content-after": () => h(LanguageToggle, { placement: "nav" }),
      "sidebar-nav-before": () => h(LanguageToggle, { placement: "sidebar" }),
      // A persistent copy of the toggle that docks into the fixed "Return to
      // top" bar (VitePress's VPLocalNav) shown when the navbar scrolls away on
      // the narrow-screen landing page. Renders nothing off the home route and
      // is positioned/shown via CSS (see .lang-toggle--localnav in style.css).
      "layout-top": () => h(LanguageToggle, { placement: "localnav" }),
      // Status banner + "Source files" box for internals essays
      // (the component renders nothing on pages without the frontmatter).
      // Under the Sea: the running head, stamp and title on top of a
      // chapter, the note links at the end of the page (all render nothing
      // elsewhere).
      "doc-before": () => [
        h(EssayMeta),
        h(BookRunningHead),
        h(BookChapterHead),
      ],
      "doc-after": () => h(BookNotes),
    });
  },
  enhanceApp({ app, router }) {
    app.use(TwoslashFloatingVue);
    for (const [name, load] of Object.entries(pageComponents))
      app.component(name, defineAsyncComponent(load));
  },
} satisfies Theme;
