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

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../dist/frontend/v0.json");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(FRONTEND_IR_JSON_SCHEMA, null, 2) + "\n");
console.log(`wrote ${out}`);
