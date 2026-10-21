// Format every <pre><code> block in the given HTML pages: JS with the repo's prettier
// config, Python with black. Fragments that start with "." are wrapped so they parse;
// blocks that still fail (pseudo-code sketches) are left as written and listed.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const repo = process.cwd(); // run from the repo root
const require = createRequire(repo + "/package.json");
const prettier = require("prettier");
const config =
  (await prettier.resolveConfig(
    repo + "/packages/gofish-graphics/src/lib.ts"
  )) ?? {};

const unesc = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isPython = (t) =>
  /\blambda\b|\bfor \w+ in \b|^\(chart|\w+=["[\w]/m.test(t) &&
  !/=>|\bconst\b/.test(t);

async function formatJs(code) {
  try {
    return (
      await prettier.format(code, { ...config, parser: "babel" })
    ).trimEnd();
  } catch {
    // not a whole program; try it as a chained fragment below
  }
  // A chained fragment (`.anchor(...)`), possibly after leading comment lines:
  // give it a receiver `_`, format, then take the receiver off again.
  const lines = code.split("\n");
  const k = lines.findIndex(
    (l) => l.trim() !== "" && !l.trim().startsWith("//")
  );
  if (k >= 0 && lines[k].trimStart().startsWith(".")) {
    const head = lines.slice(0, k).join("\n");
    const body =
      "_" +
      lines
        .slice(k)
        .map((l) => l.trimStart())
        .join("\n");
    try {
      let out = (
        await prettier.format(body, { ...config, parser: "babel" })
      ).trimEnd();
      if (out.startsWith("_\n")) {
        out = out
          .slice(2)
          .split("\n")
          .map((l) => (l.startsWith("  ") ? l.slice(2) : l))
          .join("\n");
      } else if (out.startsWith("_")) out = out.slice(1);
      return (head ? head + "\n" : "") + out;
    } catch {
      // pseudo-code that doesn't parse: leave it as written
    }
  }
  return null;
}

function formatPy(code) {
  try {
    return execFileSync("uvx", ["black", "-q", "-"], {
      input: code,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return null;
  }
}

for (const path of process.argv.slice(2)) {
  let s = readFileSync(path, "utf8");
  const re = /<pre><code>([\s\S]*?)<\/code><\/pre>/g;
  const blocks = [...s.matchAll(re)];
  let done = 0;
  const skipped = [];
  let out = "";
  let last = 0;
  for (const m of blocks) {
    const code = unesc(m[1]);
    // other systems' code (R, TikZ) is quoted as written, never reformatted
    const foreign =
      /\baes\(|geom_|chordDiagram|make_long|\\sankey|<-|\bggplot\(/.test(code);
    const formatted = foreign
      ? null
      : isPython(code)
        ? formatPy(code)
        : await formatJs(code);
    out += s.slice(last, m.index);
    if (formatted === null) {
      skipped.push(code.split("\n")[0].slice(0, 70));
      out += m[0];
    } else {
      done++;
      out += "<pre><code>" + esc(formatted) + "</code></pre>";
    }
    last = m.index + m[0].length;
  }
  out += s.slice(last);
  writeFileSync(path, out);
  console.log(`${path}: formatted ${done} of ${blocks.length}`);
  for (const k of skipped) console.log("  left as written:", k);
}
