export default {
  logLevel: "warn",
  build: {
    minify: false,
    outDir: "dist2",
    rollupOptions: {
      input: "src2/main.js",
      output: { entryFileNames: "out.js" },
    },
  },
};
