/**
 * THROWAWAY PROTOTYPE (#1266). The Storybook and capture harness Vite
 * configs run vite-plugin-solid over every .tsx file, and it ignores
 * `@jsxImportSource` pragmas. This pre-transform compiles gofish-react's own
 * .tsx files with React's automatic JSX runtime first, so Solid's Babel pass
 * sees no JSX left in them.
 */
import { transformWithEsbuild, type Plugin } from "vite";

export function gofishReactJsx(): Plugin {
  return {
    name: "gofish-react-jsx",
    enforce: "pre",
    async transform(code, id) {
      if (!/packages\/gofish-react\/.*\.tsx$/.test(id.split("?")[0])) return;
      const r = await transformWithEsbuild(code, id, {
        loader: "tsx",
        jsx: "automatic",
        jsxImportSource: "react",
      });
      return { code: r.code, map: r.map };
    },
  };
}
