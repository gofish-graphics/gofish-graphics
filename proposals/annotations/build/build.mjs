// Build proposals/annotations/page.html from page.src.html + snippets.txt.
// Formats our JS/TS with the repo's prettier and Python with black.
// Snippets marked "raw" are verbatim prior-work samples and are left as is.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as prettier from "/Users/jmp/gofish-20250316/.claude/worktrees/annotation-api-proposal/node_modules/prettier/index.mjs";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const T = dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.OUT ??
  "/Users/jmp/gofish-20250316/.claude/worktrees/annotation-api-proposal/proposals/annotations/page.html";
const cfg = JSON.parse(
  readFileSync(
    "/Users/jmp/gofish-20250316/.claude/worktrees/annotation-api-proposal/.prettierrc",
    "utf8"
  )
);

const src = readFileSync(`${T}/snippets.txt`, "utf8");
const parts = src.split(/^=== /m).filter(Boolean);
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const out = {};
const lines = {};
for (const p of parts) {
  const nl = p.indexOf("\n");
  const [name, lang, mode] = p.slice(0, nl).trim().split(/\s+/);
  let code = p.slice(nl + 1).replace(/\s+$/, "");
  if (mode === "full" || mode === "frag") {
    if (lang === "py") {
      code = execFileSync("uvx", ["black", "-q", "-"], { input: code + "\n" })
        .toString()
        .replace(/\s+$/, "");
    } else {
      const input = mode === "frag" ? "chart(data)\n" + code : code;
      let f = await prettier.format(input, { ...cfg, parser: "typescript" });
      f = f.replace(/\s+$/, "");
      if (mode === "frag") {
        if (f.startsWith("chart(data)\n")) {
          f = f
            .slice("chart(data)\n".length)
            .split("\n")
            .map((l) => l.replace(/^ {2}/, ""))
            .join("\n");
        } else if (f.startsWith("chart(data).")) {
          f = f.slice("chart(data)".length);
        } else
          throw new Error("unexpected frag output for " + name + ":\n" + f);
        f = f.replace(/;$/, "");
      }
      code = f;
    }
  }
  const cls =
    { ts: "typescript", py: "python", js: "javascript" }[lang] ?? lang;
  lines[name] = code.split("\n").length;
  out[name] = `<pre><code class="language-${cls}">${esc(code)}</code></pre>`;
}

let page = readFileSync(`${T}/page.src.html`, "utf8");
page = page.replace(/\{\{(\w[\w-]*)\}\}/g, (m, k) => {
  if (!(k in out)) throw new Error("missing snippet " + k);
  return out[k];
});
page = page.replace(/\[\[lines:(\w[\w-]*)\]\]/g, (m, k) => String(lines[k]));
writeFileSync(OUT, page);
console.log("wrote", OUT, page.length);
console.log(lines);
