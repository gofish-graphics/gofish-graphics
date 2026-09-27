/**
 * Task definitions for the LLM authoring benchmark, and the loader.
 *
 * A task is one file under tests/llm-bench/tasks/ whose default export is a
 * `Task`. Its reference solutions live at
 * tests/llm-bench/references/<task id>/<arm>.<ext>. See
 * tests/llm-bench/README.md for how to add one.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import type { Check } from "./checks";

export const BENCH_DIR = join(import.meta.dirname, "../../llm-bench");

export const ARMS = ["gofish", "recharts", "d3", "matplotlib"] as const;
export type Arm = (typeof ARMS)[number];

/** File extension of a program in each arm. */
export const ARM_EXT: Record<Arm, string> = {
  gofish: "js",
  recharts: "jsx",
  d3: "js",
  matplotlib: "py",
};

/** Fenced-code language tag each arm is asked to use (informational). */
export const ARM_LANG: Record<Arm, string> = {
  gofish: "js",
  recharts: "jsx",
  d3: "js",
  matplotlib: "python",
};

export interface Size {
  w: number;
  h: number;
}

/**
 * What an edit is allowed to change in the picture. Everything not listed
 * must stay as it was in the base task's reference render (see
 * `preserved` in checks.ts):
 *   - "colors":  the set of colors used by data marks
 *   - "text":    the set of non-numeric text strings (numeric tick labels
 *                are never compared, since they move with any layout change)
 *   - "marks":   the number of data marks of each kind
 *   - "size":    the size of the chart
 */
export type Aspect = "colors" | "text" | "marks" | "size";
export const ASPECTS: Aspect[] = ["colors", "text", "marks", "size"];

interface TaskBase {
  /** "create/<name>" or "edit/<name>"; also the references/ subpath. */
  id: string;
  /** Basename of a JSON file in tests/llm-bench/data/ (an array of rows). */
  data: string;
  size: Size;
  /** What the model is asked to do. States the picture, not the program. */
  instruction: string;
  /** All must pass for the task to count as solved (for edits: "applied"). */
  checks: Check[];
}

export interface CreateTask extends TaskBase {
  kind: "create";
}

export interface EditTask extends TaskBase {
  kind: "edit";
  /** Id of the task whose reference program (per arm) is the starting code. */
  base: string;
  mayChange: Aspect[];
}

export type Task = CreateTask | EditTask;

export async function loadTasks(filter?: string): Promise<Task[]> {
  const dir = join(BENCH_DIR, "tasks");
  const files = readdirSync(dir)
    .filter((f) => /\.ts$/.test(f))
    .sort();
  const tasks: Task[] = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    tasks.push(mod.default as Task);
  }
  const ids = new Set<string>();
  for (const t of tasks) {
    if (ids.has(t.id)) throw new Error(`Duplicate task id ${t.id}`);
    ids.add(t.id);
  }
  for (const t of tasks) {
    if (t.kind === "edit" && !ids.has(t.base))
      throw new Error(`${t.id}: base task ${t.base} does not exist`);
  }
  // Creates before edits, then by id, so a run's log reads naturally.
  tasks.sort((a, b) =>
    a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "create" ? -1 : 1
  );
  return filter ? tasks.filter((t) => t.id.includes(filter)) : tasks;
}

export function dataPath(task: Task): string {
  return join(BENCH_DIR, "data", `${task.data}.json`);
}

export function loadData(task: Task): Record<string, unknown>[] {
  return JSON.parse(readFileSync(dataPath(task), "utf8"));
}

export function referencePath(taskId: string, arm: Arm): string {
  return join(BENCH_DIR, "references", taskId, `${arm}.${ARM_EXT[arm]}`);
}

export function loadReference(taskId: string, arm: Arm): string {
  const p = referencePath(taskId, arm);
  if (!existsSync(p)) throw new Error(`Missing reference ${p}`);
  return readFileSync(p, "utf8");
}
