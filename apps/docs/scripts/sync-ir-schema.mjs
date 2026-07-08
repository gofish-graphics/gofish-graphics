#!/usr/bin/env node
/**
 * sync-ir-schema — regenerate the "Full JSON Schema" docs page from the
 * built Frontend IR JSON Schema artifact.
 *
 * Mirrors the sync-backlinks pattern: there's a generator (`sync`) and a
 * CI-friendly drift detector (`check`). The generated page lives at
 *   apps/docs/docs/internals/frontend/schema-json.md
 *
 * Run modes:
 *   sync   — write the page (or no-op if already in sync)
 *   check  — exit non-zero if the page would be regenerated to something
 *            different than what's on disk
 *
 * This script consumes the *build artifact*
 * (`packages/gofish-ir/dist/frontend/v0.json`), not the TS source. Since
 * `jsonSchema.ts` retargeted its per-operator/per-leaf-mark `$defs` onto
 * `descriptors.ts` (generated at call time via `buildOperatorDefs()` /
 * `buildLeafMarkDefs()`), the exported schema is no longer a single `as
 * const` object literal a regex can lift out of the source — it has to be
 * evaluated, and the JSON artifact is the already-evaluated result. This
 * means `pnpm --filter gofish-ir build` MUST run before this script, the
 * same ordering `gofish-python`'s `scripts/generate.ts` needs (it imports
 * `gofish-ir/frontend`, which resolves through `dist/`) — see that CI step
 * and this package's `sync-ir-schema` / `check-ir-schema` scripts, which
 * both run the build first rather than each consumer re-deriving it.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const SCHEMA_ARTIFACT = resolve(
  REPO_ROOT,
  "packages/gofish-ir/dist/frontend/v0.json"
);
const DOC_PAGE = resolve(
  REPO_ROOT,
  "apps/docs/docs/internals/frontend/schema-json.md"
);

const mode = process.argv[2] === "check" ? "check" : "sync";

/** Read the built JSON Schema artifact. Requires `pnpm --filter gofish-ir
 *  build` to have run first (see the module doc comment above). */
function readSchemaConstant() {
  if (!existsSync(SCHEMA_ARTIFACT)) {
    throw new Error(
      `${SCHEMA_ARTIFACT} does not exist. Run \`pnpm --filter gofish-ir build\` first.`
    );
  }
  return JSON.parse(readFileSync(SCHEMA_ARTIFACT, "utf-8"));
}

const PAGE_TEMPLATE = (json) => `---
title: Full JSON Schema
section: JSON Formats
group: Frontend
order: 30
status: draft
---

# Frontend IR — Full JSON Schema

The canonical JSON Schema (Draft 2020-12) for the v0 Frontend IR. This
page is regenerated from
[\`packages/gofish-ir/src/frontend/jsonSchema.ts\`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/jsonSchema.ts)
by \`apps/docs/scripts/sync-ir-schema.mjs\`; \`pnpm --filter docs
check-ir-schema\` runs in CI to catch drift. The published build
artifact lives at \`packages/gofish-ir/dist/frontend/v0.json\` and at
the public URL \`https://gofish.graphics/schema/frontend/v0.json\`.

See [Frontend IR (Serialization)](/internals/frontend/serialization)
for the design discussion and [Using the Frontend IR](/internals/frontend/serialization-api)
for the API.

\`\`\`json
${json}
\`\`\`
`;

async function buildPage() {
  const schema = readSchemaConstant();
  const json = JSON.stringify(schema, null, 2);
  const raw = PAGE_TEMPLATE(json);
  // Run the output through prettier so the file matches what lint-staged
  // produces post-commit (otherwise `check` would diff on every push:
  // prettier collapses short arrays / objects). Resolve the parser via
  // prettier's own filepath logic so we pick up the same config the rest
  // of the repo uses.
  const config = (await prettier.resolveConfig(DOC_PAGE)) ?? {};
  return prettier.format(raw, { ...config, filepath: DOC_PAGE });
}

if (mode === "sync") {
  const content = await buildPage();
  const current = existsSync(DOC_PAGE) ? readFileSync(DOC_PAGE, "utf-8") : "";
  if (content === current) {
    console.log(`sync-ir-schema: already in sync (${DOC_PAGE})`);
  } else {
    writeFileSync(DOC_PAGE, content);
    console.log(`sync-ir-schema: wrote ${DOC_PAGE}`);
  }
} else {
  const want = await buildPage();
  const have = existsSync(DOC_PAGE) ? readFileSync(DOC_PAGE, "utf-8") : "";
  if (want !== have) {
    console.error(
      `sync-ir-schema: ${DOC_PAGE} is out of sync with the source. ` +
        `Run \`pnpm --filter docs sync-ir-schema\` and commit the result.`
    );
    process.exit(1);
  }
  console.log(`sync-ir-schema: in sync`);
}
