export default {
  logLevel: "warn",
  build: {
    minify: false,
    outDir: "dist",
    rollupOptions: {
      input: "src/main.js",
      output: { entryFileNames: "out.js" },
    },
  },
};
