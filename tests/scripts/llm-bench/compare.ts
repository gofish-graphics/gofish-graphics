/**
 * `pnpm llm-bench compare <runDir>[=label] ...`: one table comparing the
 * gofish arm across runs, one row per run (runs given the same label are
 * pooled, for a condition run in parts), for all single tasks and then per
 * group. Chains are left out, as in the report's other tables.
 *
 * The lexical code statistics (syntax tokens, lines, arithmetic operators,
 * magic numbers) are measured again from the saved programs, so every run is
 * measured by the current rule (codestats.ts); model tokens are kept as
 * recorded.
 */

import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { lexicalStats } from "./codestats";
import { contextOf } from "./context";
import {
  finalCodeStats,
  GOFISH_SUMMARY_HEADER,
  gofishSummaryRow,
  isScored,
  type JobResult,
} from "./report";
import { GROUPS } from "./tasks";

/** A saved result, with the outcome of results from before outcomes
 *  existed, and its lexical code statistics measured again from its saved
 *  programs. */
export function loadResults(dir: string): JobResult[] {
  return readFileSync(join(dir, "results.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const r: JobResult = JSON.parse(l);
      r.outcome ??= r.pass ? "pass" : "fail";
      for (const t of r.turns) {
        if (!t.code || !existsSync(join(dir, t.code))) continue;
        const code = readFileSync(join(dir, t.code), "utf8");
        t.codeStats = {
          model: NaN,
          ...t.codeStats,
          ...lexicalStats(code, r.arm),
        };
      }
      r.codeStats = finalCodeStats(r.turns);
      for (const s of r.steps ?? [])
        s.codeStats = finalCodeStats(r.turns.filter((t) => t.step === s.step));
      return r;
    });
}

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

export function compareRuns(runs: { dir: string; label?: string }[]): string {
  const rows = new Map<
    string,
    { contexts: Set<string>; dirs: string[]; results: JobResult[] }
  >();
  for (const { dir, label } of runs) {
    const results = loadResults(dir).filter(
      (r) => isScored(r) && r.arm === "gofish" && r.kind !== "chain"
    );
    const ctx = results.map(contextOf).find(Boolean);
    const context = ctx ? `${ctx.name} (${ctx.sha256})` : "not recorded";
    const key = label ?? ctx?.name ?? basename(dir);
    const row = rows.get(key) ?? { contexts: new Set(), dirs: [], results: [] };
    row.contexts.add(context);
    row.dirs.push(basename(dir));
    row.results.push(...results);
    rows.set(key, row);
  }
  const header = ["run", "context", ...GOFISH_SUMMARY_HEADER];
  const section = (keep: (r: JobResult) => boolean) =>
    table(
      header,
      [...rows].map(([label, row]) => [
        label,
        [...row.contexts].join(", "),
        ...gofishSummaryRow(row.results.filter(keep)),
      ])
    );
  const all = [...rows.values()].flatMap((r) => r.results);
  const groups = GROUPS.filter((g) => all.some((r) => r.group === g));
  const out = [
    "# GoFish across runs",
    "",
    "The gofish arm's single tasks (creates and edits) in each run. Input tokens include cache reads and writes; context tokens are the part that was the context; thinking tokens are the reasoning part of the output; tool calls are the skill's. Code size is the final program's (syntax tokens: lexical tokens without whitespace or comments).",
    "",
    ...[...rows].map(([label, row]) => `- ${label}: ${row.dirs.join(", ")}`),
    "",
    "## All tasks",
    "",
    section(() => true),
  ];
  if (groups.length > 1)
    for (const g of groups)
      out.push(
        "",
        `## Group "${g}"`,
        "",
        section((r) => r.group === g)
      );
  return out.join("\n") + "\n";
}
