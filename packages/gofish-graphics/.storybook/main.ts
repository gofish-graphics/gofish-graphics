import type { StorybookConfig } from "storybook-solidjs-vite";
// PROTOTYPE (#1266): React JSX for packages/gofish-react .tsx files.
import { gofishReactJsx } from "../../gofish-react/vite-react-jsx";

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../stories/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "storybook-solidjs-vite",
    options: {},
  },
  viteFinal: async (config) => ({
    ...config,
    plugins: [gofishReactJsx(), ...(config.plugins ?? [])],
  }),
};
export default config;
