// "Under the Surface": a dev-server-only endpoint that saves a reader's
// feedback straight into the chapter's brief (apps/docs/book/briefs/<slug>.md).
//
//   GET  /__book/note  -> {"ok":true,"transport":"brief"}, the capability
//                         probe. A static host has no such route, so the page
//                         falls back to opening a GitHub issue.
//   POST /__book/note  {slug, anchor, quote, reaction?, stopped?, text}
//                         -> appends one line to the brief's "## Notes"
//                         section. `reaction` is one of REACTIONS; the text
//                         may be empty when there is a reaction or a stop.
//
// `apply: "serve"` keeps it out of the build: the published site has no such
// endpoint. See apps/docs/book/README.md, "How notes reach a brief".
import type { Plugin } from "vitepress";
import type { IncomingMessage, ServerResponse } from "http";
import { execFileSync } from "child_process";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const ROUTE = "/__book/note";
const MAX_TEXT = 2000;
const MAX_QUOTE = 80;
const MAX_BODY = 16 * 1024;
/** The reactions the feedback box offers (bookNotes.ts, REACTIONS). */
const REACTIONS = ["confusing", "slow", "useful", "loved"];

/** One line of prose: newlines become spaces, and double quotes become
 *  single quotes, so the quoted note in the brief stays well-formed. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/"/g, "'").trim();

function readerName(cwd: string): string {
  try {
    const name = execFileSync("git", ["config", "user.name"], {
      cwd,
      encoding: "utf8",
    }).trim();
    return name.split(/\s+/)[0] || "Reader";
  } catch {
    return "Reader";
  }
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add `line` as the last item of the brief's `## Notes` section, creating
 *  the section at the end of the brief when it has none. */
export function appendNote(brief: string, line: string): string {
  const lines = brief.split("\n");
  const head = lines.findIndex((l) => /^## Notes\s*$/.test(l));
  if (head < 0) {
    const body = brief.replace(/\s*$/, "");
    return `${body}\n\n## Notes\n\n${line}\n`;
  }
  let end = lines.findIndex((l, i) => i > head && /^## /.test(l));
  if (end < 0) end = lines.length;
  let last = end - 1;
  while (last > head && lines[last].trim() === "") last--;
  lines.splice(last + 1, 0, ...(last === head ? ["", line] : [line]));
  const out = lines.join("\n");
  return out.endsWith("\n") ? out : `${out}\n`;
}

type Note = {
  slug: string;
  anchor: string;
  quote: string;
  reaction: string;
  stopped: boolean;
  text: string;
};

/** The brief's line for a note, or an error message for a bad request. */
export function noteLine(
  input: unknown,
  briefs: string[],
  name: string,
  date: string
): { line: string; slug: string } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Not a note." };
  const {
    slug,
    anchor = "",
    quote = "",
    reaction,
    stopped = false,
    text,
  } = input as Partial<Note>;
  if (typeof slug !== "string" || !briefs.includes(`${slug}.md`))
    return { error: "No brief has that name." };
  if (typeof text !== "string" || typeof anchor !== "string")
    return { error: "Not a note." };
  if (typeof quote !== "string") return { error: "Not a note." };
  if (reaction !== undefined && !REACTIONS.includes(reaction))
    return { error: "Not a reaction." };
  if (typeof stopped !== "boolean") return { error: "Not a note." };
  const body = text.trim();
  if (!body && !reaction && !stopped) return { error: "The note is empty." };
  if (body.length > MAX_TEXT)
    return { error: `A note is at most ${MAX_TEXT} characters.` };
  // Heading and figure ids are slugs; anything else is not an anchor.
  if (!/^[\p{L}\p{N}_-]{0,120}$/u.test(anchor))
    return { error: "Not an anchor." };

  let where = "the whole chapter";
  const q = oneLine(quote);
  if (q) {
    const cut = q.length > MAX_QUOTE ? q.slice(0, MAX_QUOTE).trimEnd() : q;
    where = `"${cut}${cut.length < q.length ? "…" : ""}"`;
  }
  if (anchor) where += `, #${anchor}`;
  const marks = [reaction, stopped && "stopped here"].filter(Boolean);
  const who = marks.length ? `${name} [${marks.join(", ")}]` : name;
  const said = body ? ` "${oneLine(body)}"` : "";
  return { slug, line: `- ${date}, ${who}:${said} (on ${where})` };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) reject(new Error("too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** The dev-only plugin. `briefsDir` is apps/docs/book/briefs. */
export function bookNotes(briefsDir: string): Plugin {
  return {
    name: "gofish-book-notes",
    apply: "serve",
    configureServer(server) {
      const name = readerName(briefsDir);
      server.middlewares.use(ROUTE, async (req, res, next) => {
        // `use(ROUTE)` also matches /__book/note/anything; only the route
        // itself is ours.
        if (req.url !== "/" && req.url !== "" && !req.url?.startsWith("/?"))
          return next();
        if (req.method === "GET")
          return send(res, 200, { ok: true, transport: "brief" });
        if (req.method !== "POST")
          return send(res, 405, { ok: false, error: "GET or POST only." });
        let input: unknown;
        try {
          input = JSON.parse(await readBody(req));
        } catch {
          return send(res, 400, { ok: false, error: "Not JSON." });
        }
        const briefs = readdirSync(briefsDir).filter((f) => f.endsWith(".md"));
        const result = noteLine(input, briefs, name, today());
        if ("error" in result)
          return send(res, 400, { ok: false, error: result.error });
        const file = join(briefsDir, `${result.slug}.md`);
        writeFileSync(
          file,
          appendNote(readFileSync(file, "utf8"), result.line)
        );
        return send(res, 200, { ok: true, line: result.line });
      });
    },
  };
}
