/**
 * `pnpm llm-bench gallery <runDir>[=label] ... [--references <runDir>]
 * [--out <dir>] [--group <g>] [--tasks <substr>]`: a static page for
 * comparing the arms' pictures and programs, task by task.
 *
 * The folder it writes holds:
 *   - index.html: the page (gallery.html next to this file, as is).
 *   - data.js: every task, run and job (outcomes, first failure, code
 *     statistics) and a small WebP thumbnail of each job's final picture,
 *     for the overview grid.
 *   - tasks/<task>.js: one pack per task with every turn's picture (WebP)
 *     and program, and the references', loaded when the task is opened.
 * Data is in script files, not JSON, so the page also works when opened
 * from disk (file:// blocks fetch). Images are packed per task so the
 * folder stays a few dozen files, whatever the number of jobs.
 *
 * Runs given the same label are pooled (a condition run in parts). When
 * several labels cover an arm (extensions on and off, say), the page shows
 * one at a time, with a switch.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { chromium, type Page } from "playwright";
import { loadResults } from "./compare";
import { extensionsOf } from "./extensions";
import { turnOutcome, type JobResult, type TurnResult } from "./report";
import {
  ARM_LANG,
  ARMS,
  BENCH_DIR,
  chainSteps,
  loadTasks,
  taskGroup,
  type Arm,
  type CreateTask,
  type Task,
} from "./tasks";

const TEMPLATE = join(import.meta.dirname, "gallery.html");
const MANIFEST = join(BENCH_DIR, "corpus/manifest.csv");
/** Widths of the stored pictures: the full picture (the renders are 2x
 *  screenshots, so this keeps them sharp at their CSS size) and the
 *  overview thumbnail. */
const FULL_W = 1300;
const THUMB_W = 420;

export interface GalleryOptions {
  runs: { dir: string; label?: string }[];
  references?: string;
  out: string;
  tasks?: string;
  group?: string;
}

interface Stats {
  syntax: number;
  loc: number;
  arithOps?: number;
  magicNumbers?: number;
}

interface GTurn {
  step?: number;
  turn: number;
  outcome: string;
  /** Keys into the task pack's `img` and `code`. */
  img?: string;
  code?: string;
  stats?: Stats;
  /** The error sent back to the model (the next turn is its repair). */
  error?: string;
  errorKind?: string;
  /** The first failing check, or the error's first line. */
  why?: string;
}

interface GJob {
  task: string;
  arm: Arm;
  /** Index into `runs`. */
  run: number;
  sample: number;
  outcome: string;
  turns: GTurn[];
  stats?: Stats;
  /** Key into `thumbs`: the final turn's picture. */
  thumb?: string;
  why?: string;
  note?: string;
}

/** A small CSV reader (quoted fields may hold commas and doubled quotes). */
function parseCsv(text: string): Record<string, string>[] {
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
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) =>
    Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]))
  );
}

/** Chart family per corpus id (the task id without its kind). */
function families(): Map<string, string> {
  if (!existsSync(MANIFEST)) return new Map();
  return new Map(
    parseCsv(readFileSync(MANIFEST, "utf8")).map((r) => [r.id, r.family])
  );
}

const firstLines = (s: string, n = 2) =>
  s.trim().split("\n").slice(0, n).join(" ").slice(0, 300);

/** Why a turn did not pass: its error, else its first failing check. */
function whyOf(t: TurnResult): string | undefined {
  if (turnOutcome(t) === "pass") return undefined;
  if (t.error) return firstLines(t.error);
  for (const block of [t.checks, t.preserved]) {
    const c = block?.results.find((r) => !r.pass);
    if (c) return `${c.check}: ${c.detail}`.slice(0, 300);
  }
  return t.code ? "failed" : "no program";
}

const statsOf = (s: TurnResult["codeStats"]): Stats | undefined =>
  s && {
    syntax: s.syntax,
    loc: s.loc,
    arithOps: s.arithOps,
    magicNumbers: s.magicNumbers,
  };

/** Converts PNG screenshots to WebP data URIs in Chromium (no image
 *  library needed), downscaled to at most `maxW` pixels wide. */
async function webp(page: Page, png: Buffer, maxW: number): Promise<string> {
  return page.evaluate(
    async ({ b64, maxW }) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      const s = Math.min(1, maxW / bmp.width);
      const c = new OffscreenCanvas(
        Math.round(bmp.width * s),
        Math.round(bmp.height * s)
      );
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const out = await c.convertToBlob({ type: "image/webp", quality: 0.85 });
      const bytes = new Uint8Array(await out.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:${out.type};base64,${btoa(bin)}`;
    },
    { b64: png.toString("base64"), maxW }
  );
}

const slug = (id: string) => id.replace(/\//g, "__");

/** A task's instruction as shown on the page (a chain lists its steps). */
function instructionOf(t: Task, byId: Map<string, Task>): string {
  if (t.kind !== "chain") return t.instruction;
  return chainSteps(t, byId.get(t.base) as CreateTask)
    .map((s, i) => `Step ${i + 1}: ${s.instruction}`)
    .join("\n\n");
}

export async function buildGallery(opts: GalleryOptions): Promise<void> {
  const allTasks = await loadTasks();
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const family = families();

  // Runs, pooled by label.
  const labels: string[] = [];
  const results: { run: number; dir: string; r: JobResult }[] = [];
  for (const { dir, label } of opts.runs) {
    const name = label ?? basename(dir);
    if (!labels.includes(name)) labels.push(name);
    for (const r of loadResults(dir))
      results.push({ run: labels.indexOf(name), dir, r });
  }
  const keep = (id: string) => {
    const t = byId.get(id);
    return (
      (!opts.tasks || id.includes(opts.tasks)) &&
      (!opts.group || (t ? taskGroup(t) : undefined) === opts.group)
    );
  };
  const inRuns = results.filter(({ r }) => keep(r.task));
  const taskIds = [...new Set(inRuns.map(({ r }) => r.task))];
  if (taskIds.length === 0) throw new Error("no jobs match the filters");
  const arms = ARMS.filter((a) => inRuns.some(({ r }) => r.arm === a));

  const refs = new Map<string, { dir: string; r: JobResult }>();
  if (opts.references)
    for (const r of loadResults(opts.references))
      if (taskIds.includes(r.task))
        refs.set(`${r.task}|${r.arm}`, { dir: opts.references, r });

  mkdirSync(opts.out, { recursive: true });
  rmSync(join(opts.out, "tasks"), { recursive: true, force: true });
  mkdirSync(join(opts.out, "tasks"));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const thumbs: Record<string, string> = {};
  const jobs: GJob[] = [];
  const references: Record<
    string,
    { outcome: string; img?: string; code?: string; stats?: Stats }
  > = {};
  let files = 0;
  try {
    for (const id of taskIds) {
      const pack = {
        img: {} as Record<string, string>,
        code: {} as Record<string, string>,
      };
      // Reads a turn's program and picture into the pack under `key`.
      const addTurn = async (
        dir: string,
        t: TurnResult,
        key: string,
        thumb: boolean
      ) => {
        const out: { img?: string; code?: string } = {};
        if (!t.code) return out;
        const codePath = join(dir, t.code);
        if (existsSync(codePath)) {
          pack.code[key] = readFileSync(codePath, "utf8");
          out.code = key;
        }
        const png = codePath.replace(/\.[^./]+$/, ".png");
        if (existsSync(png)) {
          const buf = readFileSync(png);
          pack.img[key] = await webp(page, buf, FULL_W);
          if (thumb) thumbs[`${id}|${key}`] = await webp(page, buf, THUMB_W);
          out.img = key;
        }
        return out;
      };
      for (const { run, dir, r } of inRuns.filter(({ r }) => r.task === id)) {
        const base = `${run}/${r.arm}/s${r.sample}`;
        const turns: GTurn[] = [];
        for (const [i, t] of r.turns.entries()) {
          const key = `${base}/${t.step ? `step${t.step}/` : ""}t${t.turn}`;
          const last = i === r.turns.length - 1;
          turns.push({
            step: t.step,
            turn: t.turn,
            outcome: turnOutcome(t),
            ...(await addTurn(dir, t, key, last)),
            stats: statsOf(t.codeStats),
            error: t.error?.slice(0, 4000),
            errorKind: t.errorKind,
            why: whyOf(t),
          });
        }
        const final = turns[turns.length - 1];
        jobs.push({
          task: id,
          arm: r.arm,
          run,
          sample: r.sample,
          outcome: r.outcome,
          turns,
          stats: statsOf(r.codeStats),
          thumb: final?.img && `${id}|${final.img}`,
          why:
            r.outcome === "pass"
              ? undefined
              : (r.apiError ?? final?.why ?? r.stopped ?? "no turns"),
          note: r.rescoreNote,
        });
      }
      for (const arm of arms) {
        const ref = refs.get(`${id}|${arm}`);
        const t = ref?.r.turns[ref.r.turns.length - 1];
        if (!ref || !t) continue;
        references[`${id}|${arm}`] = {
          outcome: ref.r.outcome,
          ...(await addTurn(ref.dir, t, `ref/${arm}`, false)),
          stats: statsOf(t.codeStats),
        };
      }
      writeFileSync(
        join(opts.out, "tasks", `${slug(id)}.js`),
        `window.galleryPack(${JSON.stringify(id)},${JSON.stringify(pack)});\n`
      );
      files++;
      process.stdout.write(".");
    }
  } finally {
    await browser.close();
  }
  process.stdout.write("\n");

  const tasks = taskIds
    .map((id) => {
      const t = byId.get(id);
      const kind = id.split("/")[0];
      const name = id.split("/")[1];
      const corpusId = t?.kind === "chain" ? t.base.split("/")[1] : name;
      const group = t
        ? taskGroup(t)
        : (inRuns.find(({ r }) => r.task === id)!.r.group ?? "common");
      return {
        id,
        kind,
        group,
        family: family.get(corpusId) ?? group,
        instruction: t ? instructionOf(t, byId) : "(task file not found)",
        size: t && t.kind !== "chain" ? t.size : undefined,
        pack: `tasks/${slug(id)}.js`,
      };
    })
    .sort((a, b) =>
      a.family === b.family
        ? a.id.localeCompare(b.id)
        : a.family.localeCompare(b.family)
    );

  const runs = labels.map((label, i) => {
    const rs = results.filter((x) => x.run === i).map((x) => x.r);
    const ext = [...new Set(rs.map(extensionsOf).filter(Boolean))];
    return {
      label,
      dirs: [
        ...new Set(
          results.filter((x) => x.run === i).map((x) => basename(x.dir))
        ),
      ],
      arms: arms.filter((a) => rs.some((r) => r.arm === a)),
      model: rs.find((r) => r.model)?.model,
      context: rs.find((r) => r.context)?.context?.name,
      extensions: ext.join(", ") || undefined,
    };
  });

  const data = {
    generated: new Date().toISOString(),
    referencesRun: opts.references ? basename(opts.references) : undefined,
    arms,
    lang: Object.fromEntries(arms.map((a) => [a, ARM_LANG[a]])),
    runs,
    tasks,
    jobs,
    references,
    thumbs,
  };
  writeFileSync(
    join(opts.out, "data.js"),
    `window.GALLERY=${JSON.stringify(data)};\n`
  );
  writeFileSync(join(opts.out, "index.html"), readFileSync(TEMPLATE, "utf8"));
  console.log(
    `Gallery: ${join(opts.out, "index.html")} (${taskIds.length} tasks, ${jobs.length} jobs, ${files + 2} files)`
  );
}
