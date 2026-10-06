import js from "@eslint/js";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.claude/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.vitepress/**",
      "**/.vitepress/dist/**",
      "**/.vitepress/cache/**",
      "**/storybook-static/**",
      "**/coverage/**",
      "packages/gofish-graphics/src/tests/**",
      "packages/gofish-graphics/stories/**",
      // Generated from gallery stories; hashed as benchmark context.
      "tests/llm-bench/context/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/docs/**/*.js", "apps/docs/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "prefer-const": "off",
      "no-redeclare": "off",
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  eslintConfigPrettier
);
