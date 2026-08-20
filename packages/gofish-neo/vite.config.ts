import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3002,
  },
  build: {
    target: "esnext",
    lib: {
      entry: "src/index.ts",
      name: "GoFishNeo",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["solid-js", "gofish-graphics", "gofish-gotree"],
      output: {
        globals: {
          "solid-js": "SolidJS",
          "gofish-graphics": "GoFishGraphics",
          "gofish-gotree": "GoFishGoTree",
        },
      },
    },
  },
});
