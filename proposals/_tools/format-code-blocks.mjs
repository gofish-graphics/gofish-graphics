// Format every <pre><code class="language-js|language-python"> block in the
// given HTML pages: JS with the repo's prettier config, Python with black.
// Fragments that start with "." are wrapped so they parse; blocks that still
// fail (pseudo-code sketches, other languages) are left as written and listed.
// Run from the repo root: node proposals/_tools/format-code-blocks.mjs page.html
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const repo = process.cwd();
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
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function formatJs(code) {
  try {
    return (
      await prettier.format(code, { ...config, parser: "babel" })
    ).trimEnd();
  } catch {
    // not a whole program; try it as a chained fragment below
  }
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
      // leave it as written
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
  const s = readFileSync(path, "utf8");
  const re = /<code class="language-(js|python)">([\s\S]*?)<\/code>/g;
  let out = "";
  let last = 0;
  let done = 0;
  const skipped = [];
  const blocks = [...s.matchAll(re)];
  for (const m of blocks) {
    const code = unesc(m[2]);
    const formatted = m[1] === "python" ? formatPy(code) : await formatJs(code);
    out += s.slice(last, m.index);
    if (formatted === null) {
      skipped.push(code.split("\n")[0].slice(0, 70));
      out += m[0];
    } else {
      done++;
      out += `<code class="language-${m[1]}">` + esc(formatted) + "</code>";
    }
    last = m.index + m[0].length;
  }
  out += s.slice(last);
  writeFileSync(path, out);
  console.log(`${path}: formatted ${done} of ${blocks.length}`);
  for (const k of skipped) console.log("  left as written:", k);
}
