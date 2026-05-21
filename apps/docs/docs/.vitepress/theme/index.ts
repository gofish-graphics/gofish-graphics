// https://vitepress.dev/guide/custom-theme
import { h } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import custom from "./custom.css";
import "./style.css";
import GoFishVue from "../../../components/GoFishVue.vue";
import ExampleGallery from "../../../components/ExampleGallery.vue";
import HomeGallery from "../../../components/HomeGallery.vue";
import CheatSheet from "../../../components/MarksCheatSheet.vue";
import CoordinateTransformsCheatSheet from "../../../components/CoordinateTransformsCheatSheet.vue";
import OverallCheatSheet from "../../../components/OverallCheatSheet.vue";
import OperatorsCheatSheet from "../../../components/OperatorsCheatSheet.vue";
import { Sandbox } from "vitepress-plugin-sandpack";
import "vitepress-plugin-sandpack/dist/style.css";
import { StarfishLive } from "../../../components/StarfishLive";
import HeroCode from "./components/HeroCode.vue";
import LanguageToggle from "./components/LanguageToggle.vue";
import HeroActions from "./components/HeroActions.vue";
export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // Put code snippet in the hero's image slot
      "home-hero-image": () => h(HeroCode),
      // Point the hero buttons at the reader's preferred language
      "home-hero-actions-after": () => h(HeroActions),
      // JavaScript / Python documentation toggle
      "nav-bar-content-after": () => h(LanguageToggle, { placement: "nav" }),
      "sidebar-nav-before": () => h(LanguageToggle, { placement: "sidebar" }),
    });
  },
  enhanceApp({ app, router }) {
    app.component("GoFishVue", GoFishVue);
    app.component("ExampleGallery", ExampleGallery);
    app.component("HomeGallery", HomeGallery);
    app.component("Sandbox", Sandbox);
    app.component("StarfishLive", StarfishLive);
    app.component("CheatSheet", CheatSheet);
    app.component(
      "CoordinateTransformsCheatSheet",
      CoordinateTransformsCheatSheet
    );
    app.component("OverallCheatSheet", OverallCheatSheet);
    app.component("OperatorsCheatSheet", OperatorsCheatSheet);
  },
} satisfies Theme;
