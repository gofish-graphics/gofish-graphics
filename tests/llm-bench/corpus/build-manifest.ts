/**
 * Checks the chart-type corpus manifest (manifest.csv, next to this file)
 * and computes its held-out split.
 *
 *   pnpm --filter @gofish/tests exec tsx llm-bench/corpus/build-manifest.ts          # check
 *   pnpm --filter @gofish/tests exec tsx llm-bench/corpus/build-manifest.ts --write  # fill `split`, then check
 *
 * The rows are curated by hand. This script only fills the `split` column
 * and checks the rest:
 *
 *   - ids are unique kebab-case, and an alt-dataset id (`<parent>--<dataset>`)
 *     names a parent row that exists;
 *   - enum columns hold known values;
 *   - every http(s) URL is pinned to a 40-hex commit SHA;
 *   - `exclude_reason` is set exactly when `scope` is `excluded`;
 *   - every task file named in `existing_tasks` exists;
 *   - `split` matches the rule below.
 *
 * Split rule. A chart-type row in scope (core or stretch) is held out when
 * the first byte of sha1(id) is below 51, about 20% of rows. Alt-dataset
 * rows are always held out (they test a covered type on new data).
 * Excluded rows get "—". The script prints the split per family and warns
 * when a family is entirely held out or entirely tuned. It does not fix that
 * by hand.
 */

import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, "manifest.csv");
const TASKS_DIR = join(HERE, "..", "tasks");

const COLUMNS = [
  "id",
  "name",
  "family",
  "family_source",
  "sources",
  "primary_source",
  "primary_ref_url",
  "variant_refs",
  "data_kind",
  "dataset_ref",
  "license",
  "scope",
  "exclude_reason",
  "split",
  "existing_tasks",
  "notes",
] as const;
type Row = Record<(typeof COLUMNS)[number], string>;

const FAMILIES = [
  "deviation",
  "correlation",
  "ranking",
  "distribution",
  "change-over-time",
  "magnitude",
  "part-to-whole",
  "spatial",
  "flow",
];
const SOURCES = ["ft", "d2v", "rawgraphs"];
const DATA_KINDS = [
  "inline",
  "repo-file",
  "external-url",
  "package",
  "generated",
  "none",
];
const SCOPES = ["core", "stretch", "excluded"];
const NO_SPLIT = "—";
const HELDOUT_BELOW = 51; // first sha1 byte < 51 of 256, about 20%

export function isAltDataset(id: string): boolean {
  return id.includes("--");
}

export function expectedSplit(row: Pick<Row, "id" | "scope">): string {
  if (row.scope === "excluded") return NO_SPLIT;
  if (isAltDataset(row.id)) return "heldout";
  const firstByte = createHash("sha1").update(row.id).digest()[0];
  return firstByte < HELDOUT_BELOW ? "heldout" : "tune";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toCsv(rows: Row[]): string {
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [COLUMNS.join(",")].concat(
    rows.map((r) => COLUMNS.map((c) => esc(r[c])).join(","))
  );
  return lines.join("\n") + "\n";
}

function readManifest(): Row[] {
  const [header, ...body] = parseCsv(readFileSync(MANIFEST, "utf8"));
  if (header.join(",") !== COLUMNS.join(",")) {
    throw new Error(`manifest.csv header must be: ${COLUMNS.join(",")}`);
  }
  return body.map((cells, i) => {
    if (cells.length !== COLUMNS.length) {
      throw new Error(
        `row ${i + 2}: ${cells.length} cells, expected ${COLUMNS.length}`
      );
    }
    return Object.fromEntries(COLUMNS.map((c, j) => [c, cells[j]])) as Row;
  });
}

function validate(rows: Row[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    const at = `${r.id}:`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*(--[a-z0-9]+(-[a-z0-9]+)*)?$/.test(r.id))
      errors.push(`${at} id is not kebab-case`);
    if (ids.has(r.id)) errors.push(`${at} duplicate id`);
    ids.add(r.id);
    if (!r.name) errors.push(`${at} name is empty`);
    if (!FAMILIES.includes(r.family))
      errors.push(`${at} unknown family ${r.family}`);
    if (!["ft", "inferred"].includes(r.family_source))
      errors.push(`${at} unknown family_source ${r.family_source}`);
    const sources = r.sources.split(";");
    if (sources.some((s) => !SOURCES.includes(s)))
      errors.push(`${at} unknown source in ${r.sources}`);
    if (!sources.includes(r.primary_source))
      errors.push(`${at} primary_source not in sources`);
    if (!DATA_KINDS.includes(r.data_kind))
      errors.push(`${at} unknown data_kind ${r.data_kind}`);
    if (!SCOPES.includes(r.scope))
      errors.push(`${at} unknown scope ${r.scope}`);
    if ((r.scope === "excluded") !== (r.exclude_reason !== "")) {
      errors.push(
        `${at} exclude_reason must be set exactly when scope is excluded`
      );
    }
    if (!r.primary_ref_url.startsWith("https://"))
      errors.push(`${at} primary_ref_url is not a URL`);
    const urls = [
      r.primary_ref_url,
      r.dataset_ref,
      ...r.variant_refs.split(" "),
    ].filter((u) => /^https?:/.test(u));
    for (const u of urls) {
      if (!/\/[0-9a-f]{40}\//.test(u))
        errors.push(`${at} URL not pinned to a commit: ${u}`);
    }
    const dataOk =
      r.data_kind === "inline"
        ? r.dataset_ref === "inline"
        : r.data_kind === "generated"
          ? r.dataset_ref === "generated"
          : r.data_kind === "none"
            ? r.dataset_ref === "none"
            : r.data_kind === "package"
              ? r.dataset_ref.startsWith("package:")
              : r.dataset_ref.startsWith("https://");
    if (!dataOk)
      errors.push(
        `${at} dataset_ref ${r.dataset_ref} does not fit data_kind ${r.data_kind}`
      );
    for (const t of r.existing_tasks.split(";").filter(Boolean)) {
      if (!existsSync(join(TASKS_DIR, t)))
        errors.push(`${at} existing task ${t} not found`);
    }
    if (r.split !== expectedSplit(r))
      errors.push(
        `${at} split is "${r.split}", rule says "${expectedSplit(r)}"`
      );
  }
  for (const r of rows) {
    if (isAltDataset(r.id) && !ids.has(r.id.split("--")[0]))
      errors.push(`${r.id}: parent row missing`);
  }
  return errors;
}

function report(rows: Row[]): void {
  const types = rows.filter((r) => !isAltDataset(r.id));
  const count = (pred: (r: Row) => boolean) => types.filter(pred).length;
  console.log(
    `${rows.length} rows: ${types.length} chart types, ${rows.length - types.length} alt-dataset rows`
  );
  console.log(`family            core stretch excluded  tune heldout`);
  for (const f of FAMILIES) {
    const inF = (r: Row) => r.family === f;
    const cells = [
      count((r) => inF(r) && r.scope === "core"),
      count((r) => inF(r) && r.scope === "stretch"),
      count((r) => inF(r) && r.scope === "excluded"),
      count((r) => inF(r) && r.split === "tune"),
      count((r) => inF(r) && r.split === "heldout"),
    ];
    const widths = [4, 7, 8, 5, 7];
    console.log(
      `${f.padEnd(17)} ${cells.map((n, i) => String(n).padStart(widths[i])).join(" ")}`
    );
    const [, , , tune, heldout] = cells;
    if (tune + heldout > 0 && (tune === 0 || heldout === 0)) {
      console.log(
        `  warning: family ${f} is entirely ${tune === 0 ? "held out" : "tuned"}`
      );
    }
  }
  const inScope = types.filter((r) => r.scope !== "excluded");
  const held = inScope.filter((r) => r.split === "heldout").length;
  console.log(
    `in scope: ${inScope.length} chart types, ${held} held out (${Math.round((100 * held) / inScope.length)}%)`
  );
}

const rows = readManifest();
if (process.argv.includes("--write")) {
  for (const r of rows) r.split = expectedSplit(r);
  writeFileSync(MANIFEST, toCsv(rows));
}
const errors = validate(rows);
report(rows);
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("manifest.csv is valid");
