// https://vitepress.dev/guide/custom-theme
import { h } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import custom from "./custom.css";
import "./style.css";
import GoFishVue from "../../../components/GoFishVue.vue";
import GoFishExample from "../../../components/GoFishExample.vue";
import CheatSheet from "../../../components/MarksCheatSheet.vue";
import CoordinateTransformsCheatSheet from "../../../components/CoordinateTransformsCheatSheet.vue";
import OverallCheatSheet from "../../../components/OverallCheatSheet.vue";
import OperatorsCheatSheet from "../../../components/OperatorsCheatSheet.vue";
import VegaLiteEmbed from "../../../components/VegaLiteEmbed.vue";
import ObservablePlotEmbed from "../../../components/ObservablePlotEmbed.vue";
import { Sandbox } from "vitepress-plugin-sandpack";
import "vitepress-plugin-sandpack/dist/style.css";
import { GoFishLive } from "../../../components/GoFishLive";
import LanguageToggle from "./components/LanguageToggle.vue";
import EssayMeta from "./components/EssayMeta.vue";
import InternalsLink from "./components/InternalsLink.vue";
import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import "@shikijs/vitepress-twoslash/style.css";
export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // Right-hand nav cluster: the labeled Internals link, then the
      // JavaScript / Python toggle directly before the GitHub social icon.
      "nav-bar-content-after": () => [
        h(InternalsLink),
        h(LanguageToggle, { placement: "nav" }),
      ],
      "sidebar-nav-before": () => h(LanguageToggle, { placement: "sidebar" }),
      // A persistent copy of the toggle that docks into the fixed "Return to
      // top" bar (VitePress's VPLocalNav) shown when the navbar scrolls away on
      // the narrow-screen landing page. Renders nothing off the home route and
      // is positioned/shown via CSS (see .lang-toggle--localnav in style.css).
      "layout-top": () => h(LanguageToggle, { placement: "localnav" }),
      // Status banner + "Source files" box for internals essays
      // (the component renders nothing on pages without the frontmatter).
      "doc-before": () => h(EssayMeta),
    });
  },
  enhanceApp({ app, router }) {
    app.use(TwoslashFloatingVue);
    app.component("GoFishVue", GoFishVue);
    app.component("GoFishExample", GoFishExample);
    app.component("Sandbox", Sandbox);
    app.component("GoFishLive", GoFishLive);
    app.component("CheatSheet", CheatSheet);
    app.component(
      "CoordinateTransformsCheatSheet",
      CoordinateTransformsCheatSheet
    );
    app.component("OverallCheatSheet", OverallCheatSheet);
    app.component("OperatorsCheatSheet", OperatorsCheatSheet);
    app.component("VegaLiteEmbed", VegaLiteEmbed);
    app.component("ObservablePlotEmbed", ObservablePlotEmbed);
  },
} satisfies Theme;
