#!/usr/bin/env node
/**
 * sync-ir-schema — regenerate the "Full JSON Schema" docs page from the
 * canonical `FRONTEND_IR_JSON_SCHEMA` constant exported by gofish-ir.
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
 * This script consumes the *source* (gofish-ir/src/frontend/jsonSchema.ts)
 * rather than the build artifact, so it doesn't require `pnpm --filter
 * gofish-ir build` to have run first.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const SCHEMA_SOURCE = resolve(
  REPO_ROOT,
  "packages/gofish-ir/src/frontend/jsonSchema.ts"
);
const DOC_PAGE = resolve(
  REPO_ROOT,
  "apps/docs/docs/internals/frontend/schema-json.md"
);

const mode = process.argv[2] === "check" ? "check" : "sync";

/**
 * The schema is exported as a TypeScript `as const` object literal.
 * We can't `import()` it in plain Node (no ts loader), so we parse the
 * JS object literal out of the source. The constant's body is
 * everything between `FRONTEND_IR_JSON_SCHEMA = ` and the trailing
 * `} as const;`.
 */
function readSchemaConstant() {
  const src = readFileSync(SCHEMA_SOURCE, "utf-8");
  const start = src.indexOf("FRONTEND_IR_JSON_SCHEMA = ");
  if (start === -1) {
    throw new Error(
      `couldn't find FRONTEND_IR_JSON_SCHEMA in ${SCHEMA_SOURCE}`
    );
  }
  const afterEq = src.slice(start + "FRONTEND_IR_JSON_SCHEMA = ".length);
  const endMarker = "} as const;";
  const endIdx = afterEq.lastIndexOf(endMarker);
  if (endIdx === -1) {
    throw new Error(`couldn't find "} as const;" terminator`);
  }
  // Trim the trailing `}` back onto the body, drop ` as const;`.
  const body = afterEq.slice(0, endIdx + 1);
  // Use `new Function` so we can evaluate the literal without bringing
  // in a TS loader. The literal is plain JSON-ish JS — object/array
  // literals with string/number/boolean values — so this is safe.

  const value = new Function(`return (${body})`)();
  return value;
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
