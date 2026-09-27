/**
 * What the model sees: the per-arm system prompt, the task message, the
 * repair message, and how its reply is turned back into a program.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ARM_LANG, BENCH_DIR, type Arm, type SingleTask } from "./tasks";

export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

let warnedMissingDocs = false;

/** The GoFish docs pack appended to the gofish arm's system prompt. Written
 *  separately; an empty string (with a warning) until it exists. */
function gofishDocs(): string {
  const p = join(BENCH_DIR, "context/gofish.md");
  if (existsSync(p)) return readFileSync(p, "utf8");
  if (!warnedMissingDocs) {
    console.warn(
      `warning: ${p} not found; the gofish arm runs without a docs pack`
    );
    warnedMissingDocs = true;
  }
  return "";
}

/** Stable per arm, so it is cached: the last block carries `cache_control`,
 *  which caches every system block up to and including it. */
export function systemBlocks(arm: Arm): SystemBlock[] {
  const blocks: SystemBlock[] = [
    {
      type: "text",
      text: readFileSync(join(BENCH_DIR, "prompts", `${arm}.md`), "utf8"),
    },
  ];
  if (arm === "gofish") {
    const docs = gofishDocs();
    if (docs) blocks.push({ type: "text", text: docs });
  }
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  return blocks;
}

function typeOf(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  return "string";
}

/** Field names with their value types, the row count, and the first rows. */
export function dataPreview(data: Record<string, unknown>[], rows = 5): string {
  const types = new Map<string, Set<string>>();
  for (const row of data)
    for (const [k, v] of Object.entries(row)) {
      if (!types.has(k)) types.set(k, new Set());
      types.get(k)!.add(typeOf(v));
    }
  const schema = [...types]
    .map(([k, t]) => `- \`${k}\`: ${[...t].join(" | ")}`)
    .join("\n");
  const head = data
    .slice(0, rows)
    .map((r) => JSON.stringify(r))
    .join(",\n  ");
  return (
    `The data is an array of ${data.length} rows. Fields:\n${schema}\n\n` +
    `First ${Math.min(rows, data.length)} rows:\n\`\`\`json\n[\n  ${head}\n]\n\`\`\``
  );
}

function sizeLine(task: SingleTask, arm: Arm): string {
  const { w, h } = task.size;
  const px = `${w} x ${h} px`;
  return arm === "matplotlib"
    ? `Chart size: ${px} (figsize=(${w / 100}, ${h / 100}) at dpi 100).`
    : `Chart size: ${px}.`;
}

export function taskMessage(
  task: SingleTask,
  arm: Arm,
  data: Record<string, unknown>[],
  startCode?: string
): string {
  const parts = [task.instruction, sizeLine(task, arm), dataPreview(data)];
  if (task.kind === "edit") {
    parts.push(
      `Here is the current program:\n\`\`\`${ARM_LANG[arm]}\n${startCode!.trimEnd()}\n\`\`\``,
      "Reply with the complete modified program."
    );
  }
  return parts.join("\n\n");
}

export function repairMessage(error: string): string {
  return (
    `Running your program failed:\n\`\`\`\n${error.trim()}\n\`\`\`\n\n` +
    "Reply with the complete corrected program in one fenced code block."
  );
}

export const NO_CODE_ERROR = "The reply did not contain a fenced code block.";

/** The last fenced code block in a reply, or null. */
export function extractCode(reply: string): string | null {
  const blocks = [...reply.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)];
  if (blocks.length === 0) return null;
  return blocks[blocks.length - 1][1];
}
