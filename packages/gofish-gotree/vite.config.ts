import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3001,
  },
  build: {
    target: "esnext",
    lib: {
      entry: "src/index.ts",
      name: "GoFishGoTree",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["solid-js", "gofish-graphics", "d3-hierarchy"],
      output: {
        globals: {
          "solid-js": "SolidJS",
          "gofish-graphics": "GoFishGraphics",
          "d3-hierarchy": "d3hierarchy",
        },
      },
    },
  },
});
