// Format code snippets for proposal pages. Reads JSON [{ lang, code }] on
// stdin and writes the same list with each code formatted: JS with the repo's
// prettier config, Python with black. A chained fragment (starting with ".")
// is given a receiver so it parses. A snippet that does not parse is returned
// as written, with `ok: false`. Run from the repo root.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const repo = process.cwd();
const require = createRequire(repo + "/package.json");
const prettier = require("prettier");
const config =
  (await prettier.resolveConfig(
    repo + "/packages/gofish-graphics/src/lib.ts"
  )) ?? {};

async function formatJs(code) {
  try {
    return (
      await prettier.format(code, { ...config, parser: "babel" })
    ).trimEnd();
  } catch {
    return null;
  }
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

let input = "";
for await (const chunk of process.stdin) input += chunk;
const items = JSON.parse(input);
const out = [];
for (const it of items) {
  const f =
    it.lang === "python"
      ? formatPy(it.code)
      : it.lang === "js"
        ? await formatJs(it.code)
        : null;
  out.push({
    ...it,
    code: f ?? it.code,
    ok: f !== null || (it.lang !== "js" && it.lang !== "python"),
  });
}
process.stdout.write(JSON.stringify(out));
