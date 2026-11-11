// Build index.html from template.html: {{code:N}} is the Nth fenced block of
// proposal.md, {{proto:key}} a prototype form from protos.mjs. Both become
// a <pre><code> with a language class.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import protos from "./protos.mjs";

const [, , dir, repo] = process.argv;
const require = createRequire(repo + "/package.json");
const prettier = require("prettier");
const config = await prettier.resolveConfig(repo + "/x.ts");

const md = readFileSync(dir + "/proposal.md", "utf8");
const blocks = [...md.matchAll(/```(js|python)\n([\s\S]*?)\n```/g)].map(
  (m) => ({ lang: m[1], code: m[2] })
);
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pre = (lang, code) =>
  `<pre><code class="language-${lang === "js" ? "javascript" : "python"}">${esc(code)}</code></pre>`;

const fmt = {};
for (const [k, v] of Object.entries(protos))
  fmt[k] = (
    await prettier.format(v, { ...config, parser: "typescript" })
  ).trimEnd();

let html = readFileSync(new URL("./template.html", import.meta.url), "utf8");
const used = new Set();
html = html.replace(/\{\{code:(\d+)\}\}/g, (_, n) => {
  const b = blocks[+n - 1];
  if (!b) throw new Error("no block " + n);
  used.add(+n);
  return pre(b.lang, b.code);
});
html = html.replace(/\{\{proto:(\w+)\}\}/g, (_, k) => {
  if (!fmt[k]) throw new Error("no proto " + k);
  return pre("js", fmt[k]);
});
const unused = blocks.map((_, i) => i + 1).filter((n) => !used.has(n));
console.log("blocks:", blocks.length, "unused:", unused);
writeFileSync(dir + "/index.html", html);
