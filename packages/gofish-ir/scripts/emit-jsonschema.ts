/**
 * Emit the JSON Schema artifact to `dist/frontend/v0.json`.
 *
 * Run by `pnpm --filter gofish-ir build` after `tsc`. The artifact is
 * what external tools (Python parity harnesses, language servers, Olli's
 * adapter validators) consume.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FRONTEND_IR_JSON_SCHEMA } from "../src/frontend/jsonSchema.js";
import { DISPLAY_LIST_JSON_SCHEMA } from "../src/display-list/jsonSchema.js";

const here = dirname(fileURLToPath(import.meta.url));

const artifacts: Array<[string, unknown]> = [
  ["../dist/frontend/v0.json", FRONTEND_IR_JSON_SCHEMA],
  ["../dist/display-list/v0.json", DISPLAY_LIST_JSON_SCHEMA],
];

for (const [rel, schema] of artifacts) {
  const out = resolve(here, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(schema, null, 2) + "\n");
  console.log(`wrote ${out}`);
}
