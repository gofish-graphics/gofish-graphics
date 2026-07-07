// VitePress data loader exposing the current GoFish package version at build
// time, so the landing-page version tag tracks
// packages/gofish-graphics/package.json automatically — no manual bump.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(
  new URL(
    "../../../../../packages/gofish-graphics/package.json",
    import.meta.url
  )
);

export default {
  // Re-read when the package version changes during dev.
  watch: ["../../../../../packages/gofish-graphics/package.json"],
  load() {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return { version: pkg.version };
  },
};
