/**
 * book-stamps — the stamp and the checks for "Under the Surface", the book of
 * short chapters under apps/docs/docs/under-the-surface/.
 *
 *   node scripts/book-stamps.mjs stale   # chapters whose `reads` files changed since `checked.commit`
 *   node scripts/book-stamps.mjs check   # validate chapters and briefs (no git needed; CI)
 *   node scripts/book-stamps.mjs json    # print every chapter with its stamp as JSON
 *
 * The docs build reads the same stamps through `loadBook()` (the data loader
 * docs/.vitepress/data/book.data.mts), so the stamp at the top of a chapter is
 * rendered at build time and never typed into the markdown.
 *
 * A stamp has three parts:
 *   - state: `current` when no commit since `checked.commit` touched a `reads`
 *     file, `out-of-date` when one did, and `unknown` when git or the commit is
 *     not available (a shallow clone, a tarball). `unknown` never fails anything.
 *   - since: commits and changed lines (added + deleted) in the `reads` files
 *     between `checked.commit` and HEAD.
 *   - churn: commits and changed lines in the `reads` files in the 30 days up
 *     to HEAD's commit date, with a plain label (see CHURN below). HEAD's date,
 *     not today's, so one commit always builds the same stamp.
 * Merge commits are not counted: their changes are already in the commits they
 * merge.
 *
 * See apps/docs/book/README.md for the formats and the rules.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../../..");
export const CHAPTER_DIR = join(REPO_ROOT, "apps/docs/docs/under-the-surface");
export const BRIEF_DIR = join(REPO_ROOT, "apps/docs/book/briefs");
const ROUTE = "/under-the-surface/";

/** Over 30 days: "settled" is at most 2 commits and under 300 changed lines;
 *  "changing fast" is 10 or more commits or 2,000 or more changed lines;
 *  anything between is "changing". */
export const CHURN = {
  days: 30,
  settled: { maxCommits: 2, maxLines: 299 },
  fast: { minCommits: 10, minLines: 2000 },
};

export function churnLabel(commits, lines) {
  if (commits >= CHURN.fast.minCommits || lines >= CHURN.fast.minLines)
    return "changing fast";
  if (commits <= CHURN.settled.maxCommits && lines <= CHURN.settled.maxLines)
    return "settled";
  return "changing";
}

// ---------------------------------------------------------------------------
// Reading chapters and briefs
// ---------------------------------------------------------------------------

/** gray-matter turns `date: 2026-11-13` into a Date; keep it a plain string. */
function asDateString(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return v.toISOString().slice(0, 10);
  return typeof v === "string" ? v : undefined;
}

function mdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

/** Every chapter: each .md in the section except the contents page. */
export function readChapters() {
  return mdFiles(CHAPTER_DIR)
    .filter((f) => f !== "index.md")
    .map((f) => {
      const file = join(CHAPTER_DIR, f);
      const src = readFileSync(file, "utf-8");
      const { data, content } = matter(src);
      const slug = f.replace(/\.md$/, "");
      const checked = data.checked ?? {};
      return {
        slug,
        file,
        path: `apps/docs/docs/under-the-surface/${f}`,
        link: ROUTE + slug,
        title: data.title,
        label: data.label,
        order: data.order,
        topics: data.topics,
        reads: data.reads,
        checked: {
          commit: checked.commit,
          date: asDateString(checked.date),
        },
        cover: readCover(data.cover),
        content,
      };
    })
    .sort(
      (a, b) =>
        (typeof a.order === "number" ? a.order : 999) -
          (typeof b.order === "number" ? b.order : 999) ||
        a.slug.localeCompare(b.slug)
    );
}

/**
 * The cover tiles a chapter offers: `cover:` is a list of
 * { figure, rows?, cols? }. `figure` names the file <slug>.<figure>.vue beside
 * the chapter, whose root element has id="fig-<figure>". `rows` and `cols`
 * are the tile size in cells of the cover wall (default 2 by 2).
 */
export const COVER = { cols: 6, maxRows: 4, defaultSpan: 2 };
function readCover(cover) {
  if (!Array.isArray(cover)) return [];
  return cover.map((e) => ({
    figure: e?.figure,
    rows: e?.rows ?? COVER.defaultSpan,
    cols: e?.cols ?? COVER.defaultSpan,
  }));
}

export function readBrief(slug) {
  const file = join(BRIEF_DIR, `${slug}.md`);
  if (!existsSync(file)) return undefined;
  const { data, content } = matter(readFileSync(file, "utf-8"));
  return { file, data, content };
}

/**
 * The words a reader reads: the markdown with its frontmatter, fenced code
 * blocks, container fences (`:::`), <script>, <style> and <svg> elements and
 * HTML tags removed. Text inside other HTML (a figcaption) counts. Inline code
 * counts. Step notes kept in a figure's data file are not in the markdown and
 * do not count.
 */
export function proseWordCount(markdownBody) {
  const text = markdownBody
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, " ")
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^:::[ \t]*[\w-]*/gm, " ")
    .replace(/[#*_`>|]/g, " ");
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return undefined;
  }
}

/** Sum `git log --numstat` output into commits and changed lines. */
function sumLog(out) {
  let commits = 0;
  let lines = 0;
  for (const line of out.split("\n")) {
    if (line.startsWith("commit ")) commits++;
    const m = line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (m) lines += (Number(m[1]) || 0) + (Number(m[2]) || 0);
  }
  return { commits, lines };
}

function gitContext() {
  const head = tryGit(["rev-parse", "HEAD"]);
  if (!head) return undefined;
  const shallow = tryGit(["rev-parse", "--is-shallow-repository"]) === "true";
  const headDate = tryGit(["log", "-1", "--format=%cI", "HEAD"]);
  return { head, shallow, headDate };
}

/** The stamp of one chapter. Never throws: anything git cannot answer is
 *  `unknown` (state) or `null` (numbers). */
export function stampFor(chapter, ctx = gitContext()) {
  const reads = Array.isArray(chapter.reads) ? chapter.reads : [];
  const commit = chapter.checked?.commit;
  const stamp = {
    state: "unknown",
    since: null,
    churn: null,
  };
  if (!ctx || reads.length === 0) return stamp;

  const resolved =
    typeof commit === "string" &&
    tryGit(["rev-parse", "--verify", "--quiet", `${commit}^{commit}`]);
  if (resolved) {
    const out = tryGit([
      "log",
      "--no-merges",
      "--format=commit %H",
      "--numstat",
      `${resolved}..HEAD`,
      "--",
      ...reads,
    ]);
    if (out !== undefined) {
      stamp.since = sumLog(out);
      stamp.state = stamp.since.commits > 0 ? "out-of-date" : "current";
    }
  }

  // A shallow clone holds only the last few commits, so its 30-day count
  // would be wrong rather than missing. Leave it out.
  if (!ctx.shallow && ctx.headDate) {
    const end = new Date(ctx.headDate);
    const start = new Date(end.getTime() - CHURN.days * 24 * 3600 * 1000);
    const out = tryGit([
      "log",
      "--no-merges",
      "--format=commit %H",
      "--numstat",
      `--since=${start.toISOString()}`,
      "HEAD",
      "--",
      ...reads,
    ]);
    if (out !== undefined) {
      const c = sumLog(out);
      stamp.churn = {
        ...c,
        days: CHURN.days,
        label: churnLabel(c.commits, c.lines),
      };
    }
  }
  return stamp;
}

/** Everything a page needs: the chapters in order, each with its stamp. */
export function loadBook() {
  const ctx = gitContext();
  return {
    churnDays: CHURN.days,
    chapters: readChapters().map((c) => ({
      slug: c.slug,
      link: c.link,
      title: typeof c.title === "string" ? c.title : c.slug,
      label: typeof c.label === "string" ? c.label : "",
      order: c.order,
      topics: Array.isArray(c.topics) ? c.topics : [],
      reads: Array.isArray(c.reads) ? c.reads : [],
      checked: c.checked,
      cover: c.cover,
      stamp: stampFor(c, ctx),
    })),
  };
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

/** A chapter's label: one or two words, shown before its question
 *  ("Layout: How does every node ...?"). */
function validLabel(v) {
  return typeof v === "string" && /^\S+( \S+)?$/.test(v.trim());
}

/** Validate every chapter against its brief. Needs no git history. */
export function checkBook() {
  const errors = [];
  const chapters = readChapters();
  for (const c of chapters) {
    const at = (msg) => errors.push(`${c.path}: ${msg}`);
    if (typeof c.title !== "string" || !c.title.trim())
      at("frontmatter `title` (the question) is missing");
    if (!validLabel(c.label))
      at("frontmatter `label` must be one or two words, like `Layout`");
    if (typeof c.order !== "number") at("frontmatter `order` must be a number");
    if (
      !Array.isArray(c.topics) ||
      c.topics.length === 0 ||
      !c.topics.every((t) => typeof t === "string")
    )
      at("frontmatter `topics` must be a non-empty list of terms");
    if (!Array.isArray(c.reads) || c.reads.length === 0) {
      at("frontmatter `reads` must list the source files the chapter reads");
    } else {
      for (const r of c.reads) {
        if (typeof r !== "string" || !existsSync(join(REPO_ROOT, r)))
          at(`\`reads\` file does not exist: ${r}`);
      }
    }
    if (
      typeof c.checked.commit !== "string" ||
      !/^[0-9a-f]{40}$/.test(c.checked.commit)
    )
      at("frontmatter `checked.commit` must be a full 40-character commit sha");
    if (!c.checked.date || !/^\d{4}-\d{2}-\d{2}$/.test(c.checked.date))
      at("frontmatter `checked.date` must be a date like 2026-11-13");
    if (c.cover.length === 0)
      at(
        "frontmatter `cover` must offer at least one figure for the book cover"
      );
    for (const t of c.cover) {
      const file = `${c.slug}.${t.figure}.vue`;
      if (typeof t.figure !== "string" || !/^[a-z0-9-]+$/.test(t.figure)) {
        at(
          `\`cover\` entry needs a \`figure\` name like "rewrite", got ${JSON.stringify(t.figure)}`
        );
        continue;
      }
      const path = join(CHAPTER_DIR, file);
      if (!existsSync(path)) at(`cover figure file does not exist: ${file}`);
      else if (!readFileSync(path, "utf-8").includes(`id="fig-${t.figure}"`))
        at(`${file} has no element with id="fig-${t.figure}"`);
      for (const [k, max] of [
        ["rows", COVER.maxRows],
        ["cols", COVER.cols],
      ])
        if (!Number.isInteger(t[k]) || t[k] < 1 || t[k] > max)
          at(
            `cover figure "${t.figure}": \`${k}\` must be a whole number from 1 to ${max}`
          );
    }

    const brief = readBrief(c.slug);
    if (!brief) {
      at(`no brief at apps/docs/book/briefs/${c.slug}.md`);
      continue;
    }
    const b = brief.data;
    const bat = (msg) =>
      errors.push(`apps/docs/book/briefs/${c.slug}.md: ${msg}`);
    if (b.chapter !== c.slug) bat(`\`chapter\` must be "${c.slug}"`);
    if (typeof b.question !== "string") bat("`question` is missing");
    else if (
      typeof c.title === "string" &&
      b.question.trim() !== c.title.trim()
    )
      at(
        `title "${c.title}" does not match the brief's question "${b.question}"`
      );
    if (!validLabel(b.label))
      bat("`label` must be one or two words, like `Layout`");
    else if (typeof c.label === "string" && b.label.trim() !== c.label.trim())
      at(`label "${c.label}" does not match the brief's label "${b.label}"`);
    if (typeof b.words !== "number" || b.words <= 0)
      bat("`words` must be a positive number");
    if (!/^##\s+Must answer\s*$/m.test(brief.content))
      bat('needs a "## Must answer" section');

    if (typeof b.words === "number" && b.words > 0) {
      const words = proseWordCount(c.content);
      const limit = Math.floor(b.words * 1.1);
      if (words > limit)
        at(
          `${words} words of prose, over the brief's ${b.words} plus 10 percent (${limit})`
        );
    }
  }
  errors.push(...checkFigures());
  return { chapters: chapters.length, errors };
}

/** What only the shared stepper may draw: buttons, their pressed state, the
 *  group around them, key handling, and form controls. */
const STEP_CONTROLS = [
  ["<button", /<button\b/],
  ["aria-pressed", /aria-pressed/],
  ['role="group"', /role=["']group["']/],
  ["a keydown handler", /(@|v-on:)keydown/],
  ["<input", /<input\b/],
  ["<select", /<select\b/],
];
const FRAME_IMPORT =
  /\bfrom\s+["'][^"']*\/(BookFigure|BookStepper|TreeStepper)\.vue["']/;

/**
 * Every figure file (a .vue in the chapter folder) uses the shared frame and
 * the shared stepper: it imports BookFigure, BookStepper or TreeStepper
 * (theme/components/book/), and it draws no step controls of its own, so
 * every figure steps the same way.
 */
export function checkFigures() {
  const errors = [];
  if (!existsSync(CHAPTER_DIR)) return errors;
  for (const f of readdirSync(CHAPTER_DIR).filter((f) => f.endsWith(".vue"))) {
    const src = readFileSync(join(CHAPTER_DIR, f), "utf-8");
    const at = (msg) =>
      errors.push(`apps/docs/docs/under-the-surface/${f}: ${msg}`);
    if (!FRAME_IMPORT.test(src))
      at(
        "a figure must import BookFigure, BookStepper or TreeStepper from theme/components/book/ and be drawn inside it"
      );
    const own = STEP_CONTROLS.filter(([, re]) => re.test(src)).map(
      ([name]) => name
    );
    if (own.length)
      at(
        `draws its own controls (${own.join(", ")}); step with <BookStepper> (or <BookStepper picker> for choices) instead`
      );
  }
  return errors;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(mode) {
  if (mode === "check") {
    const { chapters, errors } = checkBook();
    if (errors.length) {
      for (const e of errors) console.error(`✗ ${e}`);
      console.error(`\nbook:check failed: ${errors.length} problem(s).`);
      process.exit(1);
    }
    console.log(`book:check: ${chapters} chapter(s) OK.`);
    return;
  }
  if (mode === "json") {
    console.log(JSON.stringify(loadBook(), null, 2));
    return;
  }
  if (mode === "stale") {
    const book = loadBook();
    const stale = book.chapters.filter((c) => c.stamp.state === "out-of-date");
    const unknown = book.chapters.filter((c) => c.stamp.state === "unknown");
    for (const c of stale)
      console.log(
        `${c.slug}\t${c.stamp.since.commits} commit(s), ${c.stamp.since.lines} changed line(s) since ${c.checked.commit?.slice(0, 7)}\t${c.label}: ${c.title}`
      );
    for (const c of unknown)
      console.error(
        `${c.slug}\tunknown: commit ${c.checked.commit?.slice(0, 7) ?? "(none)"} is not in this clone`
      );
    if (!stale.length) console.error("No chapter is out of date.");
    return;
  }
  console.error("usage: book-stamps.mjs stale | check | json");
  process.exit(2);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv[2]);
