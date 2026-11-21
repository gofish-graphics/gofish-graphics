export default {
  logLevel: "warn",
  build: {
    minify: false,
    outDir: "dist3",
    rollupOptions: {
      input: "src3/main.js",
      output: { entryFileNames: "out.js" },
    },
  },
};
