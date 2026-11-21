// Split snippets.txt, format each (prettier for ts/json, black for py), write snippets.json.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const WT = "/Users/jmp/gofish-20250316/.claude/worktrees/tooltip-proposal-1395";
const require = createRequire(WT + "/package.json");
const prettier = require("prettier");
const config = JSON.parse(readFileSync(WT + "/.prettierrc", "utf8"));

const dir = new URL(".", import.meta.url).pathname;
const src = readFileSync(dir + "snippets.txt", "utf8");
const parts = src.split(/^=== (.+)$/m).slice(1);
const out = {};
for (let i = 0; i < parts.length; i += 2) {
  const file = parts[i].trim();
  let code = parts[i + 1].replace(/^\n/, "").replace(/\s+$/, "") + "\n";
  const [name, ext] = [file.replace(/\.[^.]+$/, ""), file.split(".").pop()];
  if (ext === "ts")
    code = await prettier.format(code, { ...config, parser: "typescript" });
  else if (ext === "json")
    code = await prettier.format(code, { ...config, parser: "json" });
  else if (ext === "py")
    code = execFileSync("uvx", ["black", "-q", "-"], {
      input: code,
    }).toString();
  const lang = {
    ts: "javascript",
    py: "python",
    json: "json",
    html: "xml",
    r: "r",
    swift: "swift",
    txt: "plaintext",
  }[ext];
  out[name] = { lang, code: code.replace(/\s+$/, "") };
}
writeFileSync(dir + "snippets.json", JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, "snippets");
