import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL(".", import.meta.url).pathname;
const OUT =
  "/Users/jmp/gofish-20250316/.claude/worktrees/tooltip-proposal-1395/proposals/tooltips/";
const snips = JSON.parse(readFileSync(dir + "snippets.json", "utf8"));
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const used = new Set();
const get = (name) => {
  const s = snips[name];
  if (!s) throw new Error("missing snippet " + name);
  used.add(name);
  return s;
};

const page = readFileSync(dir + "page.tpl.html", "utf8").replace(
  /\{\{([\w-]+)\}\}/g,
  (_, n) => {
    const s = get(n);
    return `<pre><code class="language-${s.lang}">${esc(s.code)}</code></pre>`;
  }
);
writeFileSync(OUT + "page.html", page);

const mdLang = {
  javascript: "js",
  python: "python",
  xml: "html",
  plaintext: "text",
  json: "json",
  r: "r",
  swift: "swift",
};
const md = readFileSync(dir + "proposal.tpl.md", "utf8").replace(
  /\{\{([\w-]+)\}\}/g,
  (_, n) => {
    const s = get(n);
    return "```" + mdLang[s.lang] + "\n" + s.code + "\n```";
  }
);
writeFileSync(OUT + "proposal.md", md);
console.log(
  "unused:",
  Object.keys(snips).filter((k) => !used.has(k))
);
