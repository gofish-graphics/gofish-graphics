/**
 * storyExamples.ts — build-time data layer for the docs example gallery.
 *
 * Scans `packages/gofish-graphics/stories/**\/*.stories.tsx` for story exports
 * tagged `tags: ["gallery"]` with `parameters.gallery.{title,description}`, and
 * for each one synthesizes a standalone, runnable TypeScript snippet by
 * transforming the story's source:
 *
 *   - library imports (`../../src/lib`, `../../src/color`, `clock`, …)  → `"gofish-graphics"`
 *   - dataset imports (`../../src/data/X`)                              → `"./dataset"`
 *   - the `initializeContainer()` helper                               → `document.getElementById("app")`
 *   - `args.w` / `args.h` / etc.                                       → the literal values from `args`
 *   - `loaders`                                                        → inlined into an async IIFE
 *   - the story scaffolding (`return container`)                       → dropped
 *
 * This module is imported at build time by the VitePress data loader
 * (`storyExamples.data.js`) and may also be consumed by markdown-it plugins, so
 * it is synchronous and depends only on `node:fs` / `node:path` / `typescript`.
 *
 * Hard build-time guards: duplicate ids throw; unparseable tagged stories throw.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export interface StoryExample {
  /** kebab-case of gallery.title, e.g. "seattle-weather-stacked-bar-chart" */
  id: string;
  /** gallery.title */
  title: string;
  /** gallery.description */
  description: string;
  /** path relative to repo root */
  storyFile: string;
  /** the story export, e.g. "Default" */
  exportName: string;
  /** harness story id: kebab(meta.title + "--" + exportName) */
  storyId: string;
  /** generated standalone TypeScript snippet */
  code: string;
  /** generated `./dataset` module content, when the story imports from src/data */
  datasetCode?: string;
  /**
   * Bare npm packages imported by `code` + `datasetCode` (excluding
   * `gofish-graphics`), mapped to a version. Versions are read from the
   * gofish-graphics package.json (where the stories' deps live), falling back
   * to `"latest"`. Declared to Sandpack's customSetup so the preview can
   * resolve them.
   */
  npmDeps: Record<string, string>;
  /** true when the snippet is a clearly-marked fallback (couldn't be fully transformed) */
  isFallback: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// .vitepress/data → repo root is five levels up.
const REPO_ROOT = resolve(__dirname, "../../../../..");
const STORIES_DIR = join(REPO_ROOT, "packages/gofish-graphics/stories");
const DATA_DIR = join(REPO_ROOT, "packages/gofish-graphics/src/data");
const GOFISH_PKG_JSON = join(
  REPO_ROOT,
  "packages/gofish-graphics/package.json"
);

const ASSET_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Generic kebab-case for ids: lowercase, non-alphanumerics → single dash. */
function kebab(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Harness story id (mirrors tests/harness/stories-runner.ts buildStoryList). */
function harnessStoryId(title: string, exportName: string): string {
  return `${title}--${exportName}`.toLowerCase().replace(/[\s/]+/g, "-");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (full.endsWith(".stories.tsx")) {
      out.push(full);
    }
  }
  return out;
}

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

// ---------------------------------------------------------------------------
// Import classification
// ---------------------------------------------------------------------------

type ImportTarget =
  | { kind: "gofish" }
  | { kind: "dataset"; modulePath: string }
  | { kind: "keep"; module: string }
  | { kind: "asset"; module: string }
  | { kind: "drop" }
  | { kind: "local" }; // unresolvable local module → forces fallback

function classifyModule(spec: string, storyFile: string): ImportTarget {
  if (spec === "@storybook/html") return { kind: "drop" };
  // helper module (initializeContainer)
  if (/(^|\/)helper$/.test(spec) && spec.startsWith("."))
    return { kind: "drop" };

  if (spec.startsWith(".")) {
    const absolute = resolve(dirname(storyFile), spec);
    // Dataset modules live under src/data
    if (absolute.startsWith(DATA_DIR + "/") || absolute.startsWith(DATA_DIR)) {
      // resolve to the actual .ts file path
      const modulePath = resolveModuleFile(absolute);
      return { kind: "dataset", modulePath };
    }
    // Asset imports (png etc.) — keep as a local file reference.
    if (ASSET_EXTENSIONS.some((ext) => spec.endsWith(ext))) {
      return { kind: "asset", module: "./" + basename(spec) };
    }
    // Any other import that lands inside the library source tree is re-exported
    // from the package entry (lib re-exports color, clock, path, util, …).
    if (absolute.includes("/packages/gofish-graphics/src/")) {
      return { kind: "gofish" };
    }
    // A local helper module next to the story — cannot be made standalone.
    return { kind: "local" };
  }

  // Bare specifier (npm package) — keep verbatim.
  return { kind: "keep", module: spec };
}

function resolveModuleFile(absoluteNoExt: string): string {
  for (const candidate of [
    absoluteNoExt,
    absoluteNoExt + ".ts",
    absoluteNoExt + ".tsx",
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* ignore */
    }
  }
  return absoluteNoExt + ".ts";
}

// ---------------------------------------------------------------------------
// Identifier collection (value positions only)
// ---------------------------------------------------------------------------

function collectIdentifiers(node: ts.Node, out: Set<string>): void {
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) {
      const parent = n.parent;
      // property access `.foo`
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n)
        return;
      // qualified name `A.B`
      if (parent && ts.isQualifiedName(parent) && parent.right === n) return;
      // object literal key `foo:`
      if (parent && ts.isPropertyAssignment(parent) && parent.name === n)
        return;
      // declaration names (let local scoping handle these)
      if (parent && ts.isPropertyAssignment(parent) === false) {
        if (
          (ts.isVariableDeclaration(parent) && parent.name === n) ||
          (ts.isParameter(parent) && parent.name === n) ||
          (ts.isFunctionDeclaration(parent) && parent.name === n) ||
          (ts.isBindingElement(parent) && parent.propertyName === n) ||
          ts.isImportSpecifier(parent) ||
          ts.isImportClause(parent)
        ) {
          return;
        }
      }
      out.add(n.text);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
}

// ---------------------------------------------------------------------------
// Story metadata extraction
// ---------------------------------------------------------------------------

interface TopDecl {
  name: string;
  text: string;
  node: ts.Node;
}

interface ImportBinding {
  name: string; // local name
  module: string; // module specifier
  form: "named" | "default" | "namespace";
  imported?: string; // original exported name for named imports
  isTypeOnly: boolean;
}

interface ParsedFile {
  source: string;
  sourceFile: ts.SourceFile;
  metaTitle?: string;
  topDecls: Map<string, TopDecl>;
  imports: ImportBinding[];
}

function parseFile(storyFile: string): ParsedFile {
  const source = readFileSync(storyFile, "utf-8");
  const sourceFile = parse(storyFile, source);
  const topDecls = new Map<string, TopDecl>();
  const imports: ImportBinding[] = [];
  let metaTitle: string | undefined;

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const module = (stmt.moduleSpecifier as ts.StringLiteral).text;
      const clause = stmt.importClause;
      if (!clause) continue;
      const declTypeOnly = !!clause.isTypeOnly;
      if (clause.name) {
        imports.push({
          name: clause.name.text,
          module,
          form: "default",
          isTypeOnly: declTypeOnly,
        });
      }
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          imports.push({
            name: clause.namedBindings.name.text,
            module,
            form: "namespace",
            isTypeOnly: declTypeOnly,
          });
        } else {
          for (const el of clause.namedBindings.elements) {
            imports.push({
              name: el.name.text,
              imported: el.propertyName?.text ?? el.name.text,
              module,
              form: "named",
              isTypeOnly: declTypeOnly || !!el.isTypeOnly,
            });
          }
        }
      }
      continue;
    }

    // Top-level const/let/var
    if (ts.isVariableStatement(stmt)) {
      const isExported = stmt.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        // Detect the default-exported meta object's title.
        // Non-exported declarations are reusable helpers (scores, MONTHS, …).
        if (!isExported) {
          topDecls.set(name, {
            name,
            text: stmt.getText(sourceFile),
            node: stmt,
          });
        }
        // meta title
        if (
          name === "meta" &&
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          const t = getProp(decl.initializer, "title");
          if (t && ts.isStringLiteral(t)) metaTitle = t.text;
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const isExported = stmt.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (!isExported) {
        topDecls.set(stmt.name.text, {
          name: stmt.name.text,
          text: stmt.getText(sourceFile),
          node: stmt,
        });
      }
    }
  }

  // Fall back to scanning for `const meta` / `export default meta` title.
  if (!metaTitle) {
    metaTitle = findMetaTitle(sourceFile);
  }

  return { source, sourceFile, metaTitle, topDecls, imports };
}

function getProp(
  obj: ts.ObjectLiteralExpression,
  key: string
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && propName(prop.name) === key) {
      return prop.initializer;
    }
  }
  return undefined;
}

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function findMetaTitle(sourceFile: ts.SourceFile): string | undefined {
  let title: string | undefined;
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          const t = getProp(decl.initializer, "title");
          if (t && ts.isStringLiteral(t)) title = t.text;
        }
      }
    }
  }
  return title;
}

// ---------------------------------------------------------------------------
// Per-story transform
// ---------------------------------------------------------------------------

interface GalleryExport {
  exportName: string;
  galleryTitle: string;
  galleryDescription: string;
  storyObj: ts.ObjectLiteralExpression;
}

function findGalleryExports(parsed: ParsedFile): GalleryExport[] {
  const out: GalleryExport[] = [];
  for (const stmt of parsed.sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = stmt.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!isExported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer))
        continue;
      const obj = decl.initializer;
      const tags = getProp(obj, "tags");
      if (!tags || !ts.isArrayLiteralExpression(tags)) continue;
      const isGallery = tags.elements.some(
        (e) => ts.isStringLiteral(e) && e.text === "gallery"
      );
      if (!isGallery) continue;
      const parameters = getProp(obj, "parameters");
      if (!parameters || !ts.isObjectLiteralExpression(parameters)) continue;
      const gallery = getProp(parameters, "gallery");
      if (!gallery || !ts.isObjectLiteralExpression(gallery)) continue;
      const titleNode = getProp(gallery, "title");
      const descNode = getProp(gallery, "description");
      if (!titleNode || !ts.isStringLiteral(titleNode)) continue;
      out.push({
        exportName: decl.name.text,
        galleryTitle: titleNode.text,
        galleryDescription:
          descNode && ts.isStringLiteral(descNode) ? descNode.text : "",
        storyObj: obj,
      });
    }
  }
  return out;
}

/** Resolve `args` (object literal or identifier reference) → map prop → value text. */
function resolveArgs(
  storyObj: ts.ObjectLiteralExpression,
  parsed: ParsedFile
): Map<string, string> {
  const out = new Map<string, string>();
  let argsExpr = getProp(storyObj, "args");
  if (argsExpr && ts.isIdentifier(argsExpr)) {
    // referenced top-level const (e.g. defaultArgs)
    const decl = parsed.topDecls.get(argsExpr.text);
    if (decl && ts.isVariableStatement(decl.node)) {
      for (const d of decl.node.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.name.text === argsExpr!.getText(parsed.sourceFile) &&
          d.initializer &&
          ts.isObjectLiteralExpression(d.initializer)
        ) {
          argsExpr = d.initializer;
        }
      }
    }
    // generic: search any decl initializer matching the identifier
    if (argsExpr && ts.isIdentifier(argsExpr)) {
      const found = findConstObject(parsed.sourceFile, argsExpr.text);
      if (found) argsExpr = found;
    }
  }
  if (argsExpr && ts.isObjectLiteralExpression(argsExpr)) {
    for (const prop of argsExpr.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = propName(prop.name);
        if (key) out.set(key, prop.initializer.getText(parsed.sourceFile));
      }
    }
  }
  return out;
}

function findConstObject(
  sourceFile: ts.SourceFile,
  name: string
): ts.ObjectLiteralExpression | undefined {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (
        ts.isIdentifier(d.name) &&
        d.name.text === name &&
        d.initializer &&
        ts.isObjectLiteralExpression(d.initializer)
      ) {
        return d.initializer;
      }
    }
  }
  return undefined;
}

interface TransformResult {
  code: string;
  datasetCode?: string;
  isFallback: boolean;
}

function transformStory(
  storyFile: string,
  parsed: ParsedFile,
  ex: GalleryExport
): TransformResult {
  const sourceFile = parsed.sourceFile;
  const renderExpr = getProp(ex.storyObj, "render");
  if (
    !renderExpr ||
    (!ts.isArrowFunction(renderExpr) && !ts.isFunctionExpression(renderExpr))
  ) {
    throw new Error(
      `Story ${storyFile}:${ex.exportName} has no render function to transform.`
    );
  }
  const render = renderExpr as ts.ArrowFunction | ts.FunctionExpression;
  if (!render.body || !ts.isBlock(render.body)) {
    throw new Error(
      `Story ${storyFile}:${ex.exportName} render body is not a block.`
    );
  }
  const block = render.body;

  // Parameter names: (args, context)
  const argsParam = render.parameters[0];
  const argsName =
    argsParam && ts.isIdentifier(argsParam.name) ? argsParam.name.text : "args";

  // ----- loaders -----
  const loadersExpr = getProp(ex.storyObj, "loaders");
  const loaderObjectTexts: string[] = [];
  if (loadersExpr && ts.isArrayLiteralExpression(loadersExpr)) {
    for (const el of loadersExpr.elements) {
      if (ts.isArrowFunction(el) || ts.isFunctionExpression(el)) {
        let body: ts.Node = el.body;
        if (ts.isParenthesizedExpression(body)) body = body.expression;
        if (ts.isObjectLiteralExpression(body)) {
          loaderObjectTexts.push(body.getText(sourceFile));
        } else {
          loaderObjectTexts.push(
            `(${(el.body as ts.Node).getText(sourceFile)})`
          );
        }
      }
    }
  }
  const hasLoaders = loaderObjectTexts.length > 0;

  const argsMap = resolveArgs(ex.storyObj, parsed);

  // ----- collect referenced identifiers (body + loaders + args) -----
  const referenced = new Set<string>();
  const roots = new Set<string>();
  collectIdentifiers(block, roots);
  if (loadersExpr) collectIdentifiers(loadersExpr, roots);
  for (const v of argsMap.values()) {
    // arg values may reference identifiers
    roots.add(" ignore"); // no-op
  }

  // Transitive closure over top-level decls.
  const worklist = [...roots];
  while (worklist.length) {
    const name = worklist.pop()!;
    if (referenced.has(name)) continue;
    referenced.add(name);
    const decl = parsed.topDecls.get(name);
    if (decl) {
      const inner = new Set<string>();
      collectIdentifiers(decl.node, inner);
      for (const i of inner) if (!referenced.has(i)) worklist.push(i);
    }
  }

  // ----- build imports -----
  const gofishNames = new Set<string>();
  const datasetNames = new Set<string>();
  const datasetModules = new Set<string>();
  const keepLines: string[] = [];
  const seenKeep = new Set<string>();
  let forcedFallback = false;
  const fallbackReasons: string[] = [];

  // group keep imports by module to merge named bindings
  const keepNamed = new Map<string, Set<string>>();
  const keepDefault = new Map<string, string>();
  const keepNamespace = new Map<string, string>();
  const assetImports: string[] = [];

  for (const imp of parsed.imports) {
    if (imp.isTypeOnly) continue;
    if (!referenced.has(imp.name)) continue;
    const target = classifyModule(imp.module, storyFile);
    switch (target.kind) {
      case "drop":
        break;
      case "gofish":
        if (imp.form === "named") gofishNames.add(imp.imported ?? imp.name);
        else forcedFallback = true; // default/namespace import from lib is unexpected
        break;
      case "dataset":
        datasetNames.add(imp.name);
        datasetModules.add(target.modulePath);
        break;
      case "asset":
        assetImports.push(`import ${imp.name} from "${target.module}";`);
        break;
      case "keep": {
        if (imp.form === "named") {
          if (!keepNamed.has(target.module))
            keepNamed.set(target.module, new Set());
          keepNamed.get(target.module)!.add(imp.imported ?? imp.name);
        } else if (imp.form === "default") {
          keepDefault.set(target.module, imp.name);
        } else {
          keepNamespace.set(target.module, imp.name);
        }
        break;
      }
      case "local":
        forcedFallback = true;
        fallbackReasons.push(`unresolvable local import "${imp.module}"`);
        break;
    }
  }

  const importLines: string[] = [];
  if (gofishNames.size) {
    importLines.push(
      `import { ${[...gofishNames].sort().join(", ")} } from "gofish-graphics";`
    );
  }
  for (const [module, names] of [...keepNamed.entries()].sort()) {
    importLines.push(
      `import { ${[...names].sort().join(", ")} } from "${module}";`
    );
  }
  for (const [module, name] of [...keepDefault.entries()].sort()) {
    importLines.push(`import ${name} from "${module}";`);
  }
  for (const [module, name] of [...keepNamespace.entries()].sort()) {
    importLines.push(`import * as ${name} from "${module}";`);
  }
  importLines.push(...assetImports);
  if (datasetNames.size) {
    importLines.push(
      `import { ${[...datasetNames].sort().join(", ")} } from "./dataset";`
    );
  }

  // ----- top-level decls (in source order) -----
  const declLines: string[] = [];
  for (const stmt of sourceFile.statements) {
    let name: string | undefined;
    if (ts.isVariableStatement(stmt)) {
      const d = stmt.declarationList.declarations[0];
      if (d && ts.isIdentifier(d.name)) name = d.name.text;
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      name = stmt.name.text;
    }
    if (name && referenced.has(name) && parsed.topDecls.has(name)) {
      declLines.push(parsed.topDecls.get(name)!.text);
    }
  }

  // ----- transform render body -----
  const bodyText = transformBody(sourceFile, block, argsName, argsMap);

  // ----- assemble snippet -----
  let codeBody: string;
  if (hasLoaders) {
    const loaderInit =
      loaderObjectTexts.length === 1
        ? loaderObjectTexts[0]
        : `Object.assign({}, ${loaderObjectTexts.join(", ")})`;
    const inner = indent(bodyText, "  ");
    codeBody =
      `(async () => {\n` +
      `  const loaded = ${loaderInit};\n` +
      `  const context = { loaded };\n` +
      `${inner}\n` +
      `})();`;
  } else {
    codeBody = bodyText;
  }

  const parts: string[] = [];
  if (importLines.length) parts.push(importLines.join("\n"));
  if (declLines.length) parts.push(declLines.join("\n\n"));
  parts.push(codeBody);
  const code = parts.join("\n\n") + "\n";

  const datasetCode = datasetModules.size
    ? buildDatasetCode([...datasetModules])
    : undefined;

  if (forcedFallback) {
    return {
      code: buildFallback(storyFile, parsed, block, argsName, argsMap),
      datasetCode,
      isFallback: true,
    };
  }

  return { code, datasetCode, isFallback: false };
}

/**
 * Apply the byte-faithful edits to the render block body:
 *   - `initializeContainer()` → `document.getElementById("app")`
 *   - `args.<prop>`           → literal value
 *   - top-level `return X;`   → removed
 */
function transformBody(
  sourceFile: ts.SourceFile,
  block: ts.Block,
  argsName: string,
  argsMap: Map<string, string>
): string {
  const fullStart = block.getStart(sourceFile) + 1; // after `{`
  const fullEnd = block.getEnd() - 1; // before `}`
  const edits: { start: number; end: number; text: string }[] = [];

  const visit = (n: ts.Node) => {
    // initializeContainer() call
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "initializeContainer"
    ) {
      edits.push({
        start: n.getStart(sourceFile),
        end: n.getEnd(),
        text: `document.getElementById("app")`,
      });
    }
    // args.<prop>
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === argsName
    ) {
      const prop = n.name.text;
      if (argsMap.has(prop)) {
        edits.push({
          start: n.getStart(sourceFile),
          end: n.getEnd(),
          text: argsMap.get(prop)!,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  for (const stmt of block.statements) visit(stmt);

  // Remove top-level return statements.
  for (const stmt of block.statements) {
    if (ts.isReturnStatement(stmt)) {
      edits.push({
        start: stmt.getStart(sourceFile),
        end: stmt.getEnd(),
        text: "",
      });
    }
  }

  // Apply edits over the body slice.
  let text = sourceFile.text.slice(fullStart, fullEnd);
  const rel = edits
    .map((e) => ({
      start: e.start - fullStart,
      end: e.end - fullStart,
      text: e.text,
    }))
    .filter((e) => e.start >= 0 && e.end <= text.length)
    .sort((a, b) => b.start - a.start);
  for (const e of rel) {
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  }

  return dedentBlock(text);
}

/** Remove common leading indentation and trim blank edges. */
function dedentBlock(text: string): string {
  const lines = text.replace(/\t/g, "  ").split("\n");
  // drop leading / trailing blank lines
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const indents = lines
    .filter((l) => l.trim() !== "")
    .map((l) => l.match(/^ */)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((l) => (l.trim() === "" ? l : pad + l))
    .join("\n");
}

/** Fallback: lightly-cleaned raw render body with an `adapted from` header. */
function buildFallback(
  storyFile: string,
  parsed: ParsedFile,
  block: ts.Block,
  argsName: string,
  argsMap: Map<string, string>
): string {
  const rel = relative(REPO_ROOT, storyFile);
  const body = transformBody(parsed.sourceFile, block, argsName, argsMap);
  return `// adapted from ${rel}\n// (this story uses local helper modules that cannot be inlined as a standalone snippet)\n\n${body}\n`;
}

// ---------------------------------------------------------------------------
// Dataset module synthesis
// ---------------------------------------------------------------------------

function buildDatasetCode(modulePaths: string[]): string {
  const seen = new Set<string>();
  const chunks: string[] = [];
  for (const modulePath of modulePaths.sort()) {
    if (seen.has(modulePath)) continue;
    seen.add(modulePath);
    chunks.push(inlineDataModule(modulePath));
  }
  return chunks.join("\n\n") + "\n";
}

function inlineDataModule(modulePath: string): string {
  let src = readFileSync(modulePath, "utf-8");
  const sourceFile = parse(modulePath, src);
  const edits: { start: number; end: number; text: string }[] = [];

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = (stmt.moduleSpecifier as ts.StringLiteral).text;
    if (spec.endsWith(".json")) {
      // inline the JSON as a const default
      const clause = stmt.importClause;
      const localName = clause?.name?.text ?? "raw";
      const jsonPath = resolveJsonPath(modulePath, spec);
      const jsonText = readFileSync(jsonPath, "utf-8").trim();
      edits.push({
        start: stmt.getStart(sourceFile),
        end: stmt.getEnd(),
        text: `const ${localName} = ${jsonText};`,
      });
    } else if (spec.startsWith(".")) {
      // a relative import into the library source → re-point at the package
      edits.push({
        start: stmt.moduleSpecifier.getStart(sourceFile),
        end: stmt.moduleSpecifier.getEnd(),
        text: `"gofish-graphics"`,
      });
    }
  }

  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) {
    src = src.slice(0, e.start) + e.text + src.slice(e.end);
  }
  return src.trim();
}

function resolveJsonPath(modulePath: string, spec: string): string {
  return resolve(dirname(modulePath), spec);
}

// ---------------------------------------------------------------------------
// npm dependency resolution
// ---------------------------------------------------------------------------

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp)$/;

/** Version map from the gofish-graphics package.json (deps + devDeps). */
let pkgVersionsCache: Record<string, string> | undefined;
function pkgVersions(): Record<string, string> {
  if (pkgVersionsCache) return pkgVersionsCache;
  const pkg = JSON.parse(readFileSync(GOFISH_PKG_JSON, "utf-8"));
  pkgVersionsCache = {
    ...(pkg.devDependencies ?? {}),
    ...(pkg.dependencies ?? {}),
  };
  return pkgVersionsCache;
}

/** All `from "<spec>"` and bare side-effect import specifiers in a snippet. */
function importSpecifiers(code: string): string[] {
  const specs: string[] = [];
  const re = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) specs.push(m[1]);
  const re2 = /^\s*import\s+["']([^"']+)["']/gm;
  while ((m = re2.exec(code)) !== null) specs.push(m[1]);
  return specs;
}

/** Package name of a bare specifier (`@scope/name/sub` → `@scope/name`). */
function packageName(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Bare npm deps imported by code + datasetCode, mapped to a version. */
function computeNpmDeps(
  code: string,
  datasetCode: string | undefined
): Record<string, string> {
  const versions = pkgVersions();
  const out: Record<string, string> = {};
  for (const src of [code, datasetCode]) {
    if (!src) continue;
    for (const spec of importSpecifiers(src)) {
      if (spec.startsWith(".")) continue;
      if (spec === "gofish-graphics") continue;
      if (ASSET_RE.test(spec)) continue;
      const pkg = packageName(spec);
      if (pkg === "gofish-graphics") continue;
      out[pkg] = versions[pkg] ?? "latest";
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let cache: StoryExample[] | undefined;

export function loadStoryExamples(): StoryExample[] {
  if (cache) return cache;

  const files = walk(STORIES_DIR).sort();
  const examples: StoryExample[] = [];
  const seenIds = new Map<string, string>();

  for (const storyFile of files) {
    let parsed: ParsedFile;
    let galleryExports: GalleryExport[];
    try {
      parsed = parseFile(storyFile);
      galleryExports = findGalleryExports(parsed);
    } catch (err) {
      throw new Error(
        `Failed to parse gallery story ${relative(REPO_ROOT, storyFile)}: ${
          (err as Error).message
        }`
      );
    }
    if (galleryExports.length === 0) continue;
    if (!parsed.metaTitle) {
      throw new Error(
        `Gallery story ${relative(REPO_ROOT, storyFile)} has no meta.title.`
      );
    }

    for (const ex of galleryExports) {
      const id = kebab(ex.galleryTitle);
      if (seenIds.has(id)) {
        throw new Error(
          `Duplicate gallery example id "${id}" from "${ex.galleryTitle}" in ` +
            `${relative(REPO_ROOT, storyFile)} (already defined by ${seenIds.get(id)}).`
        );
      }
      seenIds.set(id, relative(REPO_ROOT, storyFile));

      let result: TransformResult;
      try {
        result = transformStory(storyFile, parsed, ex);
      } catch (err) {
        throw new Error(
          `Failed to transform gallery story ${relative(REPO_ROOT, storyFile)}:` +
            `${ex.exportName}: ${(err as Error).message}`
        );
      }

      examples.push({
        id,
        title: ex.galleryTitle,
        description: ex.galleryDescription,
        storyFile: relative(REPO_ROOT, storyFile),
        exportName: ex.exportName,
        storyId: harnessStoryId(parsed.metaTitle, ex.exportName),
        code: result.code,
        datasetCode: result.datasetCode,
        npmDeps: computeNpmDeps(result.code, result.datasetCode),
        isFallback: result.isFallback,
      });
    }
  }

  examples.sort((a, b) => a.title.localeCompare(b.title));
  cache = examples;
  return examples;
}

export function getStoryExampleById(id: string): StoryExample | undefined {
  return loadStoryExamples().find((ex) => ex.id === id);
}
