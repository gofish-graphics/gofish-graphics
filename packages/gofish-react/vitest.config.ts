import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: { environment: "node", include: ["test/**/*.test.{ts,tsx}"] },
});
