/**
 * spec-diff.ts
 *
 * Which `StoryObj` exports of a JS story file changed their spec between
 * two versions of the file. Used by check-python-sync.ts to decide which
 * Python stories a JS story change needs updated; tested by
 * spec-diff.test.ts.
 */

import { readdirSync } from "fs";
import { dirname, join } from "path";
import ts from "typescript";

const ROOT_DIR = dirname(dirname(import.meta.dirname));

// ---------------------------------------------------------------------------
// Spec-neutral change detection.
//
// A modified JS story whose spec-relevant content is unchanged does not
// require a Python update. The comparison is per `StoryObj` export, so a
// modified file whose spec changes all fall in per-export exempt stories
// (`file::Export` in the exempt list) needs no Python update either.
//
// A change to a top-level declaration outside every export (a helper, a
// const, a dataset, a type) counts against the exports that reach it: the
// exports whose text names it, directly or through other top-level
// declarations (the transitive closure over top-level identifiers, taken in
// both the base and the head file). So a helper changed under exempt exports
// only needs no Python update. Reach over-approximates: any identifier with
// the declaration's name counts, even a shadowing local or a property name,
// which can only add exports. What cannot be credited to exports counts
// against the whole file, as before: the rest of the file (the meta and
// `export default`, side-effecting statements, exported non-story
// declarations another module may import, destructuring declarations), and
// a changed declaration reached from that rest or from no export at all.
//
// These kinds of difference are spec-neutral:
//
//   - **Storybook chrome** — story-level `title`, `tags`, and `parameters`
//     (e.g. the gallery annotation) are presentation metadata. Python stories
//     key off the file path and `story_*` function name, not these.
//     `argTypes` (meta- or story-level) is chrome too: it only configures
//     the Storybook controls panel (control kinds, slider ranges).
//   - **Unread args** — an `args: {...}` entry whose key the file never
//     reads cannot reach the spec, so it is dropped before comparing (e.g.
//     removing a dead `paddingInner` control). A key counts as read when the
//     file has `args.key`, `args["key"]`, or destructures it (`({ w, h }) =>`
//     as the `render` parameter, `const { w } = args`); the same goes for a
//     `render` parameter under another name and for `context.args`. Read
//     args stay in the comparison: their default values feed the spec, and
//     the Python story bakes them in. When reads cannot be determined (args
//     passed whole to a helper, spread, indexed by a computed key), every
//     entry is kept. The `Args` type that lists the keys is erased with the
//     other types (below).
//   - **Retired API names** — the public surface is lowercase-only (#146,
//     #416): the capitalized spellings (`Chart`, `Layer`, `Spread`, `StackY`,
//     `Frame`, ...) were aliases or node-level forms of the lowercase
//     operators and are no longer exported, and `For` was renamed to `map`.
//     A pure `Layer`→`layer` / `For`→`map` rename in a JS story has no Python
//     counterpart, since Python was always lowercase (and uses list
//     comprehensions where JS maps). Rewriting each retired name to its
//     current name before comparing folds such renames out. The same goes
//     for a strategy moved into its family namespace (#1013): `polar()` and
//     `Coord.polar()` are one call, so the family prefix is dropped.
//   - **Import declarations** — a Python story mirrors the spec, not the JS
//     module's imports, which Python spells its own way (`from gofish import
//     ...`). Adding, removing, or reordering an import changes no spec: if a
//     spec starts using a new name, the spec body changes too. Dropping whole
//     `ImportDeclaration`s from the parsed file handles multi-line and
//     `import type` forms alike.
//   - **Import aliases** — `import { mask as maskOp }` binds a JS-local name
//     for an exported one, so renaming the alias (or dropping it) changes no
//     spec. Before the imports are dropped, every aliased identifier in the
//     body is renamed back to its exported name; the retired-name fold then
//     canonicalizes it (`MaskOp` → `Mask` → `mask`). Default and namespace
//     imports have no exported name to resolve to and are left alone.
//   - **Type annotations** — TypeScript types have no Python counterpart.
//     `ts.transpileModule` erases them (annotations, `as` casts, type
//     aliases, interfaces) after the imports are gone, so it cannot elide or
//     re-emit any import.
//   - **Comments and whitespace** — a Python story mirrors the spec, not the
//     prose around it, so a comment-only edit needs no Python change.
//     Tokenizing with the TypeScript scanner drops comments without touching
//     string contents (a `//` inside a URL string survives).
// ---------------------------------------------------------------------------

function stripStorybookChrome(source: string): string {
  const out: string[] = [];
  let depth = 0; // > 0 while inside a `parameters:` / `argTypes:` block
  for (const line of source.split("\n")) {
    if (depth > 0) {
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      continue;
    }
    if (/^\s*tags:\s*\[[^\]]*\],?\s*$/.test(line)) continue;
    if (/^\s*title:\s*.*$/.test(line)) continue; // `meta.title` (nav path)
    if (/^\s*(parameters|argTypes):\s*\{/.test(line)) {
      depth =
        (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** The keys of `args` this file reads, or `undefined` when some read cannot
 * be resolved to a fixed key (args passed whole, spread, computed index). */
function readArgKeys(file: ts.SourceFile): Set<string> | undefined {
  const keys = new Set<string>();
  let unknown = false;

  /** Record the keys bound by a destructuring pattern over args. */
  const readPattern = (pattern: ts.BindingName): void => {
    if (!ts.isObjectBindingPattern(pattern)) {
      unknown = true; // `const a = args` / array pattern: can't follow
      return;
    }
    for (const el of pattern.elements) {
      const key = el.propertyName ?? el.name;
      if (
        el.dotDotDotToken ||
        !(ts.isIdentifier(key) || ts.isStringLiteral(key))
      ) {
        unknown = true;
      } else {
        keys.add(key.text);
      }
    }
  };

  /** Classify one use of an expression that evaluates to the args object. */
  const readUse = (ref: ts.Node): void => {
    const parent = ref.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === ref) {
      keys.add(parent.name.text);
    } else if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === ref &&
      ts.isStringLiteralLike(parent.argumentExpression)
    ) {
      keys.add(parent.argumentExpression.text);
    } else if (ts.isVariableDeclaration(parent) && parent.initializer === ref) {
      readPattern(parent.name);
    } else if (
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isNonNullExpression(parent)
    ) {
      readUse(parent);
    } else {
      unknown = true;
    }
  };

  /** True when `id` names a binding or property rather than reading a value. */
  const isDeclarationName = (id: ts.Identifier): boolean => {
    const p = id.parent;
    return (
      ((ts.isParameter(p) ||
        ts.isBindingElement(p) ||
        ts.isVariableDeclaration(p) ||
        ts.isPropertyAssignment(p) ||
        ts.isPropertyAccessExpression(p) ||
        ts.isMethodDeclaration(p) ||
        ts.isFunctionDeclaration(p)) &&
        p.name === id) ||
      (ts.isBindingElement(p) && p.propertyName === id)
    );
  };

  /** Every read of `name` in `body` (an identifier bound to args). */
  const readIdentifierUses = (body: ts.Node, name: string): void => {
    const visit = (node: ts.Node): void => {
      if (ts.isTypeNode(node)) return;
      if (
        ts.isIdentifier(node) &&
        node.text === name &&
        !isDeclarationName(node)
      ) {
        readUse(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    // `context.args`: the args object reached through the story context.
    if (ts.isPropertyAccessExpression(node) && node.name.text === "args") {
      readUse(node);
    }
    // A `render` function's first parameter is the args object.
    if (
      (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "render"
    ) {
      const fn = ts.isMethodDeclaration(node) ? node : node.initializer;
      if (
        ts.isArrowFunction(fn) ||
        ts.isFunctionExpression(fn) ||
        ts.isMethodDeclaration(fn)
      ) {
        const param = fn.parameters[0]?.name;
        if (param && ts.isIdentifier(param)) {
          if (param.text !== "args" && fn.body) {
            readIdentifierUses(fn.body, param.text);
          }
        } else if (param) {
          readPattern(param);
        }
      } else {
        unknown = true; // `render: renderFn` — defined elsewhere
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Any value read of an identifier named `args` (render parameters so named,
  // `const { args } = context`, ...).
  readIdentifierUses(file, "args");
  return unknown ? undefined : keys;
}

/** The source with each `args: {...}` entry whose key the file never reads
 * removed. Every `args` object is re-emitted as `{ a, b }` from its kept
 * entries, so a removal leaves no stray comma. */
function dropUnreadArgs(source: string): string {
  const file = ts.createSourceFile(
    "story.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
  const read = readArgKeys(file);
  if (!read) return source;
  const edits: [start: number, end: number, text: string][] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "args" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const obj = node.initializer;
      const kept = obj.properties.filter((prop) => {
        const name =
          ts.isPropertyAssignment(prop) ||
          ts.isShorthandPropertyAssignment(prop)
            ? prop.name
            : undefined;
        // Spreads, methods, and computed keys are kept: can't name them.
        if (!name || !(ts.isIdentifier(name) || ts.isStringLiteral(name))) {
          return true;
        }
        return read.has(name.text);
      });
      const text = `{ ${kept.map((p) => p.getText(file)).join(", ")} }`;
      edits.push([obj.getStart(file), obj.getEnd(), text]);
      return; // outermost `args` object only
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let out = source;
  for (const [start, end, text] of edits.reverse()) {
    out = out.slice(0, start) + text + out.slice(end);
  }
  return out;
}

/** The source with each `{ exported as local }` import alias renamed back to
 * `exported` wherever `local` appears as an identifier (strings untouched). */
function resolveImportAliases(source: string): string {
  const file = ts.createSourceFile(
    "story.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX
  );
  const aliases = new Map<string, string>();
  for (const stmt of file.statements) {
    const bindings = ts.isImportDeclaration(stmt)
      ? stmt.importClause?.namedBindings
      : undefined;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      if (el.propertyName) aliases.set(el.name.text, el.propertyName.text);
    }
  }
  if (aliases.size === 0) return source;
  const edits: [start: number, end: number, name: string][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) && aliases.has(node.text)) {
      edits.push([node.getStart(file), node.getEnd(), aliases.get(node.text)!]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let out = source;
  for (const [start, end, name] of edits.reverse()) {
    out = out.slice(0, start) + name + out.slice(end);
  }
  return out;
}

/** The source with its TypeScript types erased (JSX left as written). */
function eraseTypes(source: string): string {
  return ts.transpileModule(source, {
    fileName: "story.tsx",
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
    },
  }).outputText;
}

/** The source as a whitespace-separated token stream, comments dropped. */
function stripComments(source: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ true,
    ts.LanguageVariant.JSX,
    source
  );
  const tokens: string[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    tokens.push(scanner.getTokenText());
  }
  return tokens.join(" ");
}

/** The retired capitalized API spellings (#146, #416); each is now its lowercase form. */
const RETIRED_CAPITALIZED_NAMES = [
  "Chart",
  "Layer",
  "Spread",
  "Stack",
  "Scatter",
  "Treemap",
  "Table",
  "Intersect",
  "Exclude",
  "Subtract",
  "Paint",
  "Mask",
  "StackX",
  "StackY",
  "SpreadX",
  "SpreadY",
  "Enclose",
  "Frame",
  "Position",
  "Arrow",
  "Cut",
  "Offset",
  "GoFish",
];
/** Every retired public API name, mapped to the name that replaced it. */
const RETIRED_API_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    RETIRED_CAPITALIZED_NAMES.map((name) => [
      name,
      name[0].toLowerCase() + name.slice(1),
    ])
  ),
  For: "map",
};
const RETIRED_API_NAMES_RE = new RegExp(
  `\\b(${Object.keys(RETIRED_API_NAMES).join("|")})\\b`,
  "g"
);

/** The strategy families (#1013), read from `src/families/<name>.ts`: a
 * strategy that moved from a flat export into its family (`polar()` →
 * `Coord.polar()`) is the same call, so the `Coord.` prefix is dropped. */
const STRATEGY_FAMILIES = readdirSync(
  join(ROOT_DIR, "packages/gofish-graphics/src/families")
)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f[0].toUpperCase() + f.slice(1, -".ts".length));
const STRATEGY_FAMILY_PREFIX_RE = new RegExp(
  `\\b(${STRATEGY_FAMILIES.join("|")})\\.`,
  "g"
);

/** Rewrite retired API names to their current names so a pure rename is spec-neutral. */
function canonicalizeRetiredApiNames(source: string): string {
  return source
    .replace(RETIRED_API_NAMES_RE, (name) => RETIRED_API_NAMES[name])
    .replace(STRATEGY_FAMILY_PREFIX_RE, "");
}

/** One top-level piece of a story file: its text, and every identifier it
 * names (an over-approximation of what it references). */
interface Piece {
  text: string;
  refs: Set<string>;
}

/** A story file cut into the pieces change attribution works on. */
interface StoryFileParts {
  /** The `export const Foo: StoryObj` statements, by export name. */
  stories: Map<string, Piece>;
  /** The non-exported top-level declarations (helpers, consts, datasets,
   * types), keyed by the names each declares, joined with `,`. */
  decls: Map<string, Piece>;
  /** Each top-level declared name → its key in `decls`. */
  owner: Map<string, string>;
  /** Everything no export can be credited with: the meta and `export
   * default`, side-effecting statements, exported non-story declarations,
   * destructuring declarations. Import declarations are dropped. */
  rest: Piece;
}

function identifiersIn(node: ts.Node, out: Set<string>): Set<string> {
  if (ts.isIdentifier(node)) out.add(node.text);
  ts.forEachChild(node, (child) => {
    identifiersIn(child, out);
  });
  return out;
}

/** The names a non-exported top-level statement declares, or `undefined`
 * when it declares none by plain name (an expression, a destructuring). */
function declaredNames(stmt: ts.Statement): string[] | undefined {
  if (
    (ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt)) &&
    stmt.name
  ) {
    return [stmt.name.text];
  }
  if (ts.isVariableStatement(stmt)) {
    const names: string[] = [];
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) return undefined;
      names.push(decl.name.text);
    }
    return names;
  }
  return undefined;
}

function isStoryExport(
  stmt: ts.Statement,
  file: ts.SourceFile
): string | undefined {
  if (!ts.isVariableStatement(stmt)) return undefined;
  const decls = stmt.declarationList.declarations;
  const decl = decls.length === 1 ? decls[0] : undefined;
  if (
    !decl ||
    !ts.isIdentifier(decl.name) ||
    !decl.type?.getText(file).startsWith("StoryObj")
  ) {
    return undefined;
  }
  return decl.name.text;
}

function splitStoryFile(source: string): StoryFileParts {
  const file = ts.createSourceFile(
    "story.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX
  );
  const parts: StoryFileParts = {
    stories: new Map(),
    decls: new Map(),
    owner: new Map(),
    rest: { text: "", refs: new Set() },
  };
  for (const stmt of file.statements) {
    if (ts.isImportDeclaration(stmt)) continue;
    const text = source.slice(stmt.getStart(file), stmt.getEnd());
    const exported =
      ts.canHaveModifiers(stmt) &&
      ts
        .getModifiers(stmt)
        ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
    const story = exported ? isStoryExport(stmt, file) : undefined;
    if (story !== undefined) {
      parts.stories.set(story, { text, refs: identifiersIn(stmt, new Set()) });
      continue;
    }
    const names = exported ? undefined : declaredNames(stmt);
    if (names === undefined) {
      parts.rest.text += text + "\n";
      identifiersIn(stmt, parts.rest.refs);
      continue;
    }
    // Overloads (or a redeclared type) share one key and one piece.
    const key = names.join(",");
    const piece = parts.decls.get(key) ?? { text: "", refs: new Set() };
    piece.text += text + "\n";
    identifiersIn(stmt, piece.refs);
    parts.decls.set(key, piece);
    for (const name of names) parts.owner.set(name, key);
  }
  return parts;
}

/** The `export const Foo: StoryObj` names of a JS story file's text. */
export function storyExportNames(source: string): string[] {
  return [...splitStoryFile(source).stories.keys()];
}

/** The `decls` keys `piece` reaches through top-level identifiers. */
function reachedDecls(parts: StoryFileParts, piece: Piece): Set<string> {
  const reached = new Set<string>();
  const queue = [piece];
  while (queue.length > 0) {
    for (const ref of queue.pop()!.refs) {
      const key = parts.owner.get(ref);
      if (key === undefined || reached.has(key)) continue;
      reached.add(key);
      queue.push(parts.decls.get(key)!);
    }
  }
  return reached;
}

/** Stands for the rest of the file among the exports that reach a
 * declaration; not an identifier, so no export can be named it. */
const REST = " rest";

/** The `StoryObj` exports whose spec changed from `baseContent` to
 * `headContent`, ignoring spec-neutral content (Storybook chrome, unread
 * args, retired API names, imports, import aliases, type annotations,
 * comments, whitespace). An export added or removed counts as changed, and
 * so does every export that reaches a changed top-level declaration. An
 * empty list means the change is spec-neutral. Returns `undefined` when a
 * spec change cannot be credited to exports: the rest of the file changed,
 * or a changed declaration is reached from the rest or from no export.
 *
 * The whole-file passes (unread args, import aliases) run before the split,
 * since what they drop depends on the whole file; the split drops imports;
 * the rest run on each piece. */
export function changedStoryExportsBetween(
  baseContent: string,
  headContent: string
): string[] | undefined {
  const normalize = (s: string) =>
    stripComments(
      eraseTypes(canonicalizeRetiredApiNames(stripStorybookChrome(s)))
    );
  const split = (s: string) =>
    splitStoryFile(resolveImportAliases(dropUnreadArgs(s)));
  const base = split(baseContent);
  const head = split(headContent);
  const same = (before?: Piece, after?: Piece) =>
    before !== undefined &&
    after !== undefined &&
    (before.text === after.text ||
      normalize(before.text) === normalize(after.text));
  if (!same(base.rest, head.rest)) return undefined;

  const changed = new Set<string>();
  for (const name of new Set([
    ...base.stories.keys(),
    ...head.stories.keys(),
  ])) {
    if (!same(base.stories.get(name), head.stories.get(name))) {
      changed.add(name);
    }
  }
  const changedDecls = [
    ...new Set([...base.decls.keys(), ...head.decls.keys()]),
  ].filter((key) => !same(base.decls.get(key), head.decls.get(key)));
  if (changedDecls.length === 0) return [...changed];

  // decl key → the exports (and REST) that reach it, in either version.
  const reachers = new Map<string, Set<string>>();
  for (const parts of [base, head]) {
    const roots: [string, Piece][] = [...parts.stories, [REST, parts.rest]];
    for (const [root, piece] of roots) {
      for (const key of reachedDecls(parts, piece)) {
        if (!reachers.has(key)) reachers.set(key, new Set());
        reachers.get(key)!.add(root);
      }
    }
  }
  for (const key of changedDecls) {
    const roots = reachers.get(key);
    if (roots === undefined || roots.has(REST)) return undefined;
    for (const root of roots) changed.add(root);
  }
  return [...changed];
}
