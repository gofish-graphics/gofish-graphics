// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Python-bridge reconstruction for the `gotree-tree` frontend-IR mark
 * (issue #792). Python builds a `GoTreeSpec` shape and serializes it as a
 * `{type: "gotree-tree", ...}` `MarkIR` node (see `gofish-ir`'s
 * `GotreeTreeIR`); this module turns that IR back into a live gofish-gotree
 * `Mark` by rebuilding the combiners and calling the real `tree()`.
 *
 * This logic lives HERE (not in gofish-graphics) because gofish-graphics
 * must not depend on gofish-gotree — that would be a workspace cycle
 * (gofish-gotree already depends on gofish-graphics). The deserializer
 * instead INJECTS this function via an optional `markBridges` map, keyed by
 * IR type tag, exactly like the existing `DeriveBridge` precedent in
 * gofish-graphics' `serialize/registry.ts`.
 */
import type { HierarchyNode } from "d3-hierarchy";
import { Serialize, type Mark } from "gofish-graphics";
import type {
  Combiner,
  CombinerSpec,
  GoTreeSpec,
  HierarchyDatum,
  LinkOptions,
  LinkSpec,
  NodeFactory,
} from "./spec";
import { normalize, nodePath, toDatum } from "./data";
import { spread, distribute, nest, combine, alternate } from "./helpers";
import { tree, DEFAULT_NODE } from "./tree";

/**
 * The bridge the deserializer supplies. `mapMark` turns a (possibly
 * already-resolved) mark IR into a live `Mark` — the caller's own
 * `Serialize.mapMark` bound to its bridge/token-resolver. `applyLambda`
 * calls a single Python-registered lambda by id with positional args and
 * returns its single resolved result (already unwrapped) — a narrower
 * contract than gofish-graphics' `DeriveBridge.applyLambda` (which is
 * rows-in/rows-out over an Arrow transport); the caller adapts between the
 * two so this package stays transport-agnostic.
 */
export interface GotreeReconstructCtx {
  mapMark: (markIR: any) => Promise<Mark<any>> | Mark<any>;
  applyLambda?: (id: string, args: any[]) => Promise<any>;
}

function isLambdaSentinel(v: any): v is { __gofish_lambda: string } {
  return (
    v !== null && typeof v === "object" && typeof v.__gofish_lambda === "string"
  );
}

/**
 * Row for field/lambda resolution at one hierarchy node:
 * `{ ...d.data (children key omitted), depth, height, width, value }`.
 * `depth`/`height`/`width`/`value` come from gotree's `HierarchyDatum` and
 * OVERRIDE same-named fields already on the raw tree data — the spread
 * order below (`rest` first, then the HierarchyDatum fields) is what
 * enforces that collision rule. Both the Python emitter and this
 * reconstructor must agree on it.
 *
 * Exception: `datum.value` is only populated when the hierarchy was built
 * with d3's `.sum()`/`.count()`, which gotree's own `normalize()` never
 * calls — so an unconditional `value: datum.value` would stomp a raw data
 * field named `value` (the field most gallery specs actually read) with
 * `undefined`. The synthesized key therefore only overrides when it exists.
 */
function buildRow(datum: HierarchyDatum): Record<string, any> {
  const { children: _children, ...rest } = (datum.data ?? {}) as Record<
    string,
    any
  >;
  const row: Record<string, any> = {
    ...rest,
    depth: datum.depth,
    height: datum.height,
    width: datum.width,
  };
  if (datum.value !== undefined) row.value = datum.value;
  return row;
}

/**
 * Deep-walk a node-template `MarkIR`, resolving each channel value against
 * `row`: a `FieldAccessor` becomes a bare `row[name]` lookup (the sort/
 * aggregate `ops` a `FieldAccessor` may carry in other IR positions don't
 * apply to a single already-materialized row), a `{__gofish_lambda}`
 * sentinel issues one RPC for this node, a `DatumValue` passes through
 * untouched (its scale mapping happens later, during layout), and every
 * other value (plain objects/arrays/literals, including the mark's own
 * `type` discriminator) recurses or passes through unchanged.
 */
async function resolveTemplateValue(
  value: any,
  row: Record<string, any>,
  ctx: GotreeReconstructCtx
): Promise<any> {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => resolveTemplateValue(v, row, ctx)));
  }
  if (isLambdaSentinel(value)) {
    if (!ctx.applyLambda) {
      throw new Error(
        "gotree-tree IR: node template has a lambda-backed channel but no applyLambda was supplied on the reconstruction ctx"
      );
    }
    return ctx.applyLambda(value.__gofish_lambda, [row]);
  }
  if (value.type === "field" && typeof value.name === "string") {
    return row[value.name];
  }
  if (value.type === "datum") {
    return value;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = await resolveTemplateValue(v, row, ctx);
  }
  return out;
}

/**
 * Build the Mark for one hierarchy node from the wire's `node` template
 * (undefined → gotree's `DEFAULT_NODE`; `{type:"mark-fn"}` → the
 * whole-factory RPC fallback; otherwise the per-channel template walk).
 */
async function buildNodeMark(
  nodeIR: any,
  datum: HierarchyDatum,
  ctx: GotreeReconstructCtx
): Promise<Mark<any>> {
  if (nodeIR === undefined) {
    return DEFAULT_NODE(datum);
  }
  const row = buildRow(datum);
  if (nodeIR.type === "mark-fn") {
    if (!ctx.applyLambda) {
      throw new Error(
        "gotree-tree IR: node is a mark-fn lambda but no applyLambda was supplied on the reconstruction ctx"
      );
    }
    const resultIR = await ctx.applyLambda(nodeIR.lambdaId, [row]);
    return ctx.mapMark(resultIR);
  }
  const resolved = await resolveTemplateValue(nodeIR, row, ctx);
  return ctx.mapMark(resolved);
}

/** Rebuild a `GotreeCombinerIR` into a real `CombinerSpec` by calling the
 *  real helpers (`spread`/`distribute`/`nest`/`combine`/`alternate`) —
 *  never reimplemented here, so the layout semantics stay in ONE place. */
function rebuildCombiner(ir: any): CombinerSpec {
  switch (ir.kind) {
    case "spread":
      return spread(ir.options);
    case "distribute":
      return distribute(ir.options);
    case "nest":
      return nest(ir.options);
    case "combine":
      return combine(ir.options);
    case "alternate": {
      const combiners = (ir.combiners as any[]).map((c) => {
        const rebuilt = rebuildCombiner(c);
        if (typeof rebuilt !== "function") {
          // gotree's own alternate(combiners: Combiner[]) only accepts
          // concrete Combiners — a depth-indexed combiner (alternate/
          // perDepth) nested inside another alternate isn't a meaningful
          // shape (CombinerSpec = Combiner | DepthCombiner, and alternate
          // IS the DepthCombiner), so the wire IR never emits it.
          throw new Error(
            "gotree-tree IR: alternate() combiners must themselves resolve to concrete combiners, not nested alternate/perDepth"
          );
        }
        return rebuilt as Combiner;
      });
      return alternate(combiners);
    }
    default:
      throw new Error(
        `gotree-tree IR: unknown combiner kind ${JSON.stringify((ir as any).kind)}`
      );
  }
}

/**
 * Pre-resolve a lambda-backed `link` into a synchronous lookup function,
 * keyed by `(sourcePath, targetPath)`. gotree's `collectEdges` (src/links.ts)
 * walks the hierarchy and calls the link function SYNCHRONOUSLY — an RPC
 * can't run inside that walk — so every edge's link options are awaited
 * here, before `tree()` runs, over the exact same hierarchy walk order
 * `collectEdges` uses (root.each, then each node's children in order).
 */
async function buildLinkFn(
  lambdaId: string,
  root: HierarchyNode<any>,
  ctx: GotreeReconstructCtx
): Promise<LinkSpec> {
  if (!ctx.applyLambda) {
    throw new Error(
      "gotree-tree IR: link is a lambda but no applyLambda was supplied on the reconstruction ctx"
    );
  }
  const applyLambda = ctx.applyLambda;
  const edgeKeys: { sourcePath: string; targetPath: string }[] = [];
  const pending: Promise<[string, LinkOptions]>[] = [];
  root.each((node: HierarchyNode<any>) => {
    if (!node.children) return;
    const sourcePath = nodePath(node);
    const srcRow = buildRow(toDatum(node));
    for (const child of node.children) {
      const targetPath = nodePath(child);
      const tgtRow = buildRow(toDatum(child));
      const key = `${sourcePath}->${targetPath}`;
      edgeKeys.push({ sourcePath, targetPath });
      pending.push(
        applyLambda(lambdaId, [srcRow, tgtRow]).then((opts) => [
          key,
          opts as LinkOptions,
        ])
      );
    }
  });
  const resolved = await Promise.all(pending);
  const edgeMap = new Map<string, LinkOptions>(resolved);
  return (
    _source: HierarchyDatum,
    _target: HierarchyDatum,
    sourcePath?: string,
    targetPath?: string
  ): LinkOptions => {
    const key = `${sourcePath}->${targetPath}`;
    const opts = edgeMap.get(key);
    if (!opts) {
      // Should not happen: this walk visits the exact same edges
      // collectEdges will, over the same (shared) hierarchy object.
      throw new Error(
        `gotree-tree IR: no pre-computed link options for edge ${key}`
      );
    }
    return opts;
  };
}

/**
 * Reconstruct a `gotree-tree` wire-IR node into a live gofish-gotree `Mark`.
 * Registered by consumers (the Python widget, the parity harness) under
 * `markBridges["gotree-tree"]` on gofish-graphics' deserializer.
 */
export async function reconstructGotreeTree(
  ir: any,
  ctx: GotreeReconstructCtx
): Promise<Mark<any>> {
  // `normalize` is idempotent on an already-built HierarchyNode, so passing
  // this same `root` to `tree()` below (rather than the raw `ir.data`)
  // guarantees the pre-expansion walk here and tree()'s internal walk see
  // the exact same node/child structure — required for `nodePath` to line
  // up between the two passes.
  const root = normalize(ir.data);

  // Pre-expand every node's Mark (see buildNodeMark's doc comment on the
  // sync-vs-async split: tree()'s node factory is called synchronously from
  // renderSubtree, but resolving a lambda-backed channel is an RPC).
  const nodeEntries: { path: string; datum: HierarchyDatum }[] = [];
  root.each((node: HierarchyNode<any>) => {
    nodeEntries.push({ path: nodePath(node), datum: toDatum(node) });
  });
  const nodeMarks = new Map<string, Mark<any>>();
  await Promise.all(
    nodeEntries.map(async ({ path, datum }) => {
      nodeMarks.set(path, await buildNodeMark(ir.node, datum, ctx));
    })
  );
  const nodeFactory: NodeFactory = (_datum, path) => {
    const mark = nodeMarks.get(path!);
    if (!mark) {
      throw new Error(
        `gotree-tree IR: no pre-built mark for node path ${path}`
      );
    }
    return mark;
  };

  const link: LinkSpec | undefined =
    ir.link === undefined || ir.link === "none" || !isLambdaSentinel(ir.link)
      ? ir.link
      : await buildLinkFn(ir.link.__gofish_lambda, root, ctx);

  const spec: GoTreeSpec = {
    node: nodeFactory,
    link,
    parentChild: ir.parentChild ? rebuildCombiner(ir.parentChild) : undefined,
    sibling: ir.sibling ? rebuildCombiner(ir.sibling) : undefined,
    // Reuses gofish-graphics' existing coord deserialization (polar/clock/
    // wavy) via the same `resolveOptions` the chart/combinator `options.coord`
    // path uses — no separate coord-mapping contract needed on `ctx`.
    coord: ir.coord
      ? Serialize.resolveOptions({ coord: ir.coord }).coord
      : undefined,
  };

  return tree(spec, root as any) as Mark<any>;
}
