import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      "@gofish-data": path.resolve(
        __dirname,
        "../../packages/gofish-graphics/src/data"
      ),
    },
  },
  server: {
    port: 4000,
  },
});
