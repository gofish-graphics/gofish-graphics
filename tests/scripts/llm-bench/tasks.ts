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

/** Model token counts of programs and context files, by model and sha256
 *  (see ModelTokenCounter in codestats.ts). */
export const TOKEN_CACHE = join(
  import.meta.dirname,
  "../../tmp/llm-bench/token-cache.json"
);

export const ARMS = [
  "gofish",
  "recharts",
  "d3",
  "matplotlib",
  "ggplot2",
  "altair",
] as const;
export type Arm = (typeof ARMS)[number];

/** Arms whose program is a script run in its own process (Python or R),
 *  which saves an SVG file that the harness then loads into the page. The
 *  other arms are JS modules rendered in the page. */
export const SCRIPT_ARMS = ["matplotlib", "ggplot2", "altair"] as const;
export type ScriptArm = (typeof SCRIPT_ARMS)[number];
export const isScriptArm = (arm: Arm): arm is ScriptArm =>
  (SCRIPT_ARMS as readonly Arm[]).includes(arm);

/** File extension of a program in each arm. */
export const ARM_EXT: Record<Arm, string> = {
  gofish: "js",
  recharts: "jsx",
  d3: "js",
  matplotlib: "py",
  ggplot2: "R",
  altair: "py",
};

/** Fenced-code language tag each arm is asked to use (informational). */
export const ARM_LANG: Record<Arm, string> = {
  gofish: "js",
  recharts: "jsx",
  d3: "js",
  matplotlib: "python",
  ggplot2: "r",
  altair: "python",
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

/**
 * Which set a task belongs to, reported separately. "common": charts every
 * library draws with a built-in chart type. "beyond-defaults": charts no arm
 * has a built-in for (mosaic, waffle, ribbon chart), so a program has to
 * compose them from lower-level pieces.
 */
export const GROUPS = ["common", "beyond-defaults"] as const;
export type Group = (typeof GROUPS)[number];

interface TaskBase {
  /** "create/<name>" or "edit/<name>" ("chain/<name>/step<k>" for a chain
   *  step); also the references/ subpath. */
  id: string;
  /** Report group (default "common"). */
  group?: Group;
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

/** One step of a chain: an edit whose starting program is the model's own
 *  final program of the previous step (the arm's reference for the chain's
 *  base, on step 1), and whose preservation is judged against the previous
 *  step's final render. */
export interface ChainStep {
  instruction: string;
  checks: Check[];
  mayChange: Aspect[];
}

/**
 * A chain of edits on one chart. Data and size come from the `base` create
 * task. Each step runs like an edit task (see `chainSteps`), and the chain
 * stops at the first step that does not pass.
 */
export interface ChainTask {
  /** "chain/<name>"; step k's references are in
   *  references/<id>/step<k>/<arm>.<ext>. */
  id: string;
  kind: "chain";
  group?: Group;
  /** Id of the create task whose reference program (per arm) is where
   *  step 1 starts. */
  base: string;
  steps: ChainStep[];
}

/** A task that runs as one conversation: a create, an edit, or one step of
 *  a chain (as an edit, see `chainSteps`). */
export type SingleTask = CreateTask | EditTask;
export type Task = SingleTask | ChainTask;

/**
 * The steps of `chain` as edit tasks. Step k has id `<chain id>/step<k>`
 * (so its references are at references/<chain id>/step<k>/), `base` is the
 * previous step's id (the chain's base on step 1), and the data and size are
 * the base task's. When a model runs the chain, the starting program and the
 * preservation base are the model's own previous step, not `base`'s
 * reference; `base` names the reference that stands in for it in
 * `references` mode, in the cost estimate, and in the mock model.
 */
export function chainSteps(chain: ChainTask, base: CreateTask): EditTask[] {
  return chain.steps.map((s, i) => ({
    id: `${chain.id}/step${i + 1}`,
    kind: "edit",
    group: chain.group ?? base.group,
    base: i === 0 ? chain.base : `${chain.id}/step${i}`,
    data: base.data,
    size: base.size,
    instruction: s.instruction,
    checks: s.checks,
    mayChange: s.mayChange,
  }));
}

/** A chain's base task (checked to be a create task by loadTasks). */
export function chainBase(
  chain: ChainTask,
  byId: Map<string, Task>
): CreateTask {
  return byId.get(chain.base) as CreateTask;
}

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
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    if (t.kind === "edit" && !ids.has(t.base))
      throw new Error(`${t.id}: base task ${t.base} does not exist`);
    if (t.kind === "chain") {
      if (byId.get(t.base)?.kind !== "create")
        throw new Error(`${t.id}: base ${t.base} is not a create task`);
      if (t.steps.length === 0) throw new Error(`${t.id}: no steps`);
    }
  }
  // Creates, then edits, then chains, each by id, so a run's log reads
  // naturally.
  const rank = { create: 0, edit: 1, chain: 2 };
  tasks.sort((a, b) =>
    a.kind === b.kind ? a.id.localeCompare(b.id) : rank[a.kind] - rank[b.kind]
  );
  return filter ? tasks.filter((t) => t.id.includes(filter)) : tasks;
}

export function taskGroup(task: Task): Group {
  return task.group ?? "common";
}

export function dataPath(task: SingleTask): string {
  return join(BENCH_DIR, "data", `${task.data}.json`);
}

export function loadData(task: SingleTask): Record<string, unknown>[] {
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
