/**
 * MORPH: the moving marks between whole keyframes, matched by identity.
 *
 * PROTOTYPE (animation grammar proposal). Both temporal composition forms
 * lower here:
 *
 *   time.sequence({...}, [k0, k1, k2]).transition({ update: Animation.tween() })
 *   layer([a, b]).relate(({ a, b }) => [time.after(a, b), time.transition(a, b)])
 *
 * The keyframes are whole nodes (a chart, a diagram), each at a time on one
 * axis (`knots`): a child index for the sequence, milliseconds for a relate
 * timeline. Their leaves are matched across the keyframes by identity
 * (`identity.ts`), and each identity becomes ONE `tween` over the leaves that
 * have it, the same node `time.transition()` builds for the flow form, read
 * with the same enter / update / exit rule over the keyframes: a leaf in two
 * neighboring keyframes moves (a rect and an ellipse morph, a changed text
 * cross-fades, fill and stroke mix), a leaf in only one of them fades in
 * place.
 *
 * Relational marks (arrows) are not interpolated: they are DRAWN AGAIN every
 * frame from their operands' moving boxes (`relationTween.tsx`), matched by
 * their operands' identities, so an arrow stays attached while the boxes it
 * joins move.
 */
import { GoFishNode } from "../ast/_node";
import { GoFishRef } from "../ast/_ref";
import { tween } from "../ast/graphicalOperators/tween";
import type { InterpolationMethod } from "../interpolate";
import { identities, type Identities } from "./identity";
import { relationTween } from "./relationTween";
import { arrowPropsOf } from "../ast/graphicalOperators/arrow";
import { foldTime, unrollOrder, unrollRun, type Cycle } from "../timeWindow";

export type MorphOptions = {
  /** Each keyframe's time, ascending, in the playhead's units. */
  knots: number[];
  /** The playhead. */
  at: () => number;
  method: InterpolationMethod;
  ease?: (u: number) => number;
  /** The clock's milliseconds per unit, for a staggered update. */
  msPerUnit?: () => number;
  /** The axis repeats (`time.sequence({ cyclic: true }, [...])`): the last
   *  keyframe moves on into the first, read on the run unrolled one cycle
   *  each way, as the flow form's cyclic sequence does. */
  cycle?: Cycle;
};

/** One keyframe entry of an identity's run. */
type Entry = { k: number; node: GoFishNode };

/** Group the values of per-keyframe maps by key, in first-seen order. */
function runsOf(maps: Map<string, GoFishNode>[]): Map<string, Entry[]> {
  const runs = new Map<string, Entry[]>();
  maps.forEach((map, k) => {
    for (const [id, node] of map) {
      let run = runs.get(id);
      if (run === undefined) runs.set(id, (run = []));
      run.push({ k, node });
    }
  });
  return runs;
}

/** The node an arrow's operand ref points at, found by name inside the
 *  keyframe (a relate operand is a name). */
function operandOf(ref: GoFishRef, ids: Identities): GoFishNode | undefined {
  if (ref.targetNode !== undefined) return ref.targetNode;
  const name = ref.selection;
  if (typeof name !== "string") return undefined;
  for (const [node] of ids.pathOf) if (node._name === name) return node;
  return undefined;
}

/**
 * The moving marks over `keyframes`: one `tween` per leaf identity and one
 * `relationTween` per arrow identity. The keyframe leaves and arrows they
 * take over draw nothing of their own from then on (the tweens silence them
 * at layout, as `time.transition()` does), so the caller places these nodes
 * beside the keyframes, in the same frame.
 */
export async function morph(
  keyframes: GoFishNode[],
  o: MorphOptions
): Promise<GoFishNode[]> {
  const ids = keyframes.map(identities);
  const moving: GoFishNode[] = [];
  const { cycle } = o;
  const at = () => foldTime(o.at(), cycle);
  const sequence = unrollRun(o.knots, cycle).knots;
  /** A run's knots and the entry standing at each, unrolled on a cycle. */
  const unrolled = (run: Entry[]) => {
    const u = unrollOrder(
      run.map((e) => o.knots[e.k]),
      cycle
    );
    return { knots: u.knots, operand: u.operand };
  };
  for (const run of runsOf(ids.map((i) => i.leaves)).values()) {
    moving.push(
      await tween(
        {
          at,
          run: unrolled(run),
          sequence,
          method: o.method,
          ease: o.ease,
          msPerUnit: o.msPerUnit,
        },
        run.map((e) => new GoFishRef({ node: e.node }))
      )
    );
  }

  // Arrows, by the identities of what they join.
  const arrowMaps = ids.map((i) => {
    const map = new Map<string, GoFishNode>();
    for (const node of i.relational) {
      if (node.type !== "arrow" || arrowPropsOf(node) === undefined) continue;
      const [from, to] = (node.children as GoFishRef[]).map((r) =>
        operandOf(r, i)
      );
      const [pf, pt] = [from, to].map((n) =>
        n === undefined ? undefined : i.pathOf.get(n)
      );
      if (pf === undefined || pt === undefined) continue;
      map.set(`${pf}->${pt}`, node);
    }
    return map;
  });
  const named = runsOf(ids.map((i) => i.named));
  for (const [id, run] of runsOf(arrowMaps)) {
    const [pf, pt] = id.split("->");
    const operand = (path: string) => {
      const entries = named.get(path) ?? [];
      const u = unrolled(entries);
      return u.knots.map((t, j) => ({ t, node: entries[u.operand[j]].node }));
    };
    // Each keyframe arrow is drawn by the moving arrow from now on.
    for (const e of run) e.node.INTERNAL_emitNothing();
    moving.push(
      await relationTween({
        at,
        knots: unrolled(run).knots,
        sequence,
        method: o.method,
        ease: o.ease,
        props: arrowPropsOf(run[0].node)!,
        from: operand(pf),
        to: operand(pt),
      })
    );
  }
  return moving;
}
