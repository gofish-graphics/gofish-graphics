/**
 * book-tree — print a GoFish node tree before and after `layout()` rewrites it,
 * as an indented outline, so a chapter of "Under the Sea" can quote a real
 * tree instead of a typed one.
 *
 *   pnpm --filter docs book:tree                     # the built-in "bars" example
 *   pnpm --filter docs book:tree bars --after        # only the tree after the rewrite
 *   pnpm --filter docs book:tree ./my-spec.mts       # a spec module of your own
 *   pnpm --filter docs book:tree --list              # the built-in examples
 *
 * Flags: --before | --after (default: both), --full (do not fold runs of
 * siblings with the same shape), --w <px> --h <px> (default 300 x 200).
 *
 * A spec module's default export is a chart builder (what `chart(...)...`
 * returns, before `.render`) or a function that returns one, sync or async.
 * It imports the library from source:
 *   import { chart, spread, rect } from "../../../packages/gofish-graphics/src/lib";
 *
 * Each line is: node type, {flags}, key, name, text, [constraints], and for a
 * ref the node it points at. Flags are the internal markers the rewrite reads
 * and writes (chartBox, chartContent, chromeRing, chartRing, transparent,
 * axesBeside, isComponent).
 *
 * This runs the library from its TypeScript source with tsx. The tsconfig
 * beside this file points `gofish-ir` at its source too, so a stale
 * gofish-ir dist/ cannot change the tree.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chart, spread, rect } from "../../../packages/gofish-graphics/src/lib";
import { runLayout } from "../../../packages/gofish-graphics/src/ast/gofish";
import { GoFishRef } from "../../../packages/gofish-graphics/src/ast/_ref";
import { isToken } from "../../../packages/gofish-graphics/src/ast/createName";

type Builder = {
  resolve(): Promise<unknown>;
  renderMeta(): { axes?: unknown; legend?: unknown };
};
type Spec = Builder | (() => Builder | Promise<Builder>);

const EXAMPLES: Record<string, { about: string; spec: Spec }> = {
  bars: {
    about:
      "Three bars with a name and a label (the 'How does a chart get its axes?' chapter).",
    spec: () =>
      chart([
        { category: "A", value: 3 },
        { category: "B", value: 7 },
        { category: "C", value: 5 },
      ])
        .flow(spread({ by: "category", dir: "x" }))
        .mark(
          (rect({ h: "value" }) as any).name("bars").label("value")
        ) as unknown as Builder,
  },
};

const FLAGS = [
  "_chartBox",
  "_chartContent",
  "_chromeRing",
  "_chartRing",
  "_transparent",
  "_axesBeside",
  "_isComponent",
] as const;

/** `position, position, align` → `position ×2, align`. */
function runs(names: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < names.length; ) {
    let j = i;
    while (j < names.length && names[j] === names[i]) j++;
    out.push(j - i > 1 ? `${names[i]} ×${j - i}` : names[i]);
    i = j;
  }
  return out.join(", ");
}

/** A name as the reader wrote it: a string as is, a `createName(tag)` token
 *  as `token(tag)`, and a ref's path (a list of these) joined with dots. */
function nameText(v: any): string {
  if (typeof v === "string") return v;
  if (isToken(v)) return `token(${v.__tag})`;
  if (Array.isArray(v)) return v.map(nameText).join(".");
  return String(v);
}

function nameOf(n: any): string | undefined {
  const v = n?._name;
  return v === undefined ? undefined : nameText(v);
}

function describeTarget(t: any): string {
  if (!t) return "(unresolved)";
  const bits = [t.type];
  if (t.key !== undefined) bits.push(`key=${t.key}`);
  const nm = nameOf(t);
  if (nm) bits.push(`name=${nm}`);
  return bits.join(" ");
}

function head(n: any): string {
  if (n instanceof GoFishRef) {
    const r = n as any;
    const sel = r.selection !== undefined ? `  "${nameText(r.selection)}"` : "";
    return `ref → ${describeTarget(r.targetNode ?? r.handle)}${sel}`;
  }
  const bits: string[] = [String(n.type)];
  const flags = FLAGS.filter((f) => n[f]).map((f) => f.slice(1));
  if (flags.length) bits.push(`{${flags.join(", ")}}`);
  if (n.key !== undefined && !n._syntheticKey) bits.push(`key=${n.key}`);
  const nm = nameOf(n);
  if (nm) bits.push(`name=${nm}`);
  if (n.type === "text" && n.args?.text !== undefined)
    bits.push(JSON.stringify(String(n.args.text)));
  const cs = (n.constraints ?? []).map((c: any) => c.type);
  if (cs.length) bits.push(`[${runs(cs)}]`);
  return bits.join("  ");
}

/** The shape of a subtree, without its texts and keys: siblings with the
 *  same shape fold into one line unless --full. */
function shape(n: any): string {
  if (n instanceof GoFishRef) return "ref";
  const cs = (n.constraints ?? []).map((c: any) => c.type).join(",");
  const kids = (n.children ?? []).map(shape).join(";");
  return `${n.type}[${cs}](${kids})`;
}

function print(n: any, depth: number, full: boolean, out: string[]) {
  out.push("  ".repeat(depth) + head(n));
  const kids: any[] = n instanceof GoFishRef ? [] : (n.children ?? []);
  for (let i = 0; i < kids.length; ) {
    let j = i;
    if (!full) while (j < kids.length && shape(kids[j]) === shape(kids[i])) j++;
    const count = Math.max(1, j - i);
    if (count >= 4) {
      print(kids[i], depth + 1, full, out);
      out.push(
        "  ".repeat(depth + 1) + `… ${count - 2} more with the same shape`
      );
      print(kids[j - 1], depth + 1, full, out);
      i = j;
    } else {
      print(kids[i], depth + 1, full, out);
      i++;
    }
  }
}

async function loadSpec(arg: string): Promise<Spec> {
  if (EXAMPLES[arg]) return EXAMPLES[arg].spec;
  const url = pathToFileURL(
    resolve(process.env.INIT_CWD ?? process.cwd(), arg)
  );
  const mod = await import(url.href);
  if (!mod.default)
    throw new Error(
      `${arg} has no default export (a chart builder or a function returning one)`
    );
  return mod.default as Spec;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    for (const [k, v] of Object.entries(EXAMPLES))
      console.log(`${k}\t${v.about}`);
    return;
  }
  const num = (flag: string, d: number) => {
    const i = args.indexOf(flag);
    return i >= 0 ? Number(args[i + 1]) : d;
  };
  const w = num("--w", 300);
  const h = num("--h", 200);
  const full = args.includes("--full");
  const onlyBefore = args.includes("--before") && !args.includes("--after");
  const onlyAfter = args.includes("--after") && !args.includes("--before");
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !["--w", "--h"].includes(args[i - 1])
  );
  const spec = await loadSpec(positional[0] ?? "bars");
  const builder = typeof spec === "function" ? await spec() : spec;

  const node = await builder.resolve();
  if (!onlyAfter) {
    const out: string[] = [];
    print(node, 0, full, out);
    console.log("── before layout() ──");
    console.log(out.join("\n"));
  }
  if (!onlyBefore) {
    const meta = builder.renderMeta();
    const res: any = await runLayout(
      { w, h, axes: meta.axes, legend: meta.legend } as any,
      node as any
    );
    const out: string[] = [];
    print(res.child, 0, full, out);
    if (!onlyAfter) console.log("");
    console.log("── after layout() ──");
    console.log(out.join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
