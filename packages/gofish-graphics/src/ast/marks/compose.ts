import type { Mark, Operator } from "../types";
import { datumOfInput, resolveMarkResult } from "./markResult";

const COMPOSED_OPERATORS = Symbol("gofish.composedOperators");
const FLOW_STEP = Symbol("gofish.flowStep");
const FLOW_STEP_MARK = Symbol("gofish.flowStepMark");

type ComposedOperator = Operator<any, any> & {
  [COMPOSED_OPERATORS]: readonly Operator<any, any>[];
};

/**
 * @internal Tag `mark` as one that may also stand in a `.flow(...)` (or
 * `compose(...)`) as a step, when `flowStep` holds. `enclose(opts)` is the
 * one such mark (its descriptor's `flowStep`). Every mark modifier carries
 * the tag to the mark it returns, as it carries the mark's kind
 * (`createOperator.ts`). Returns `mark`.
 */
export function withFlowStep<M extends object>(mark: M, flowStep = true): M {
  if (flowStep)
    Object.defineProperty(mark, FLOW_STEP, { value: true, configurable: true });
  return mark;
}

/** @internal Whether `value` is a mark that may stand in `.flow(...)`
 *  ({@link withFlowStep}). */
export const isFlowStep = (value: unknown): boolean =>
  (value as { [FLOW_STEP]?: boolean } | null)?.[FLOW_STEP] === true;

/** @internal The mark a flow step was made from ({@link flowStepOperator}),
 *  read where the chart is serialized: in `operators`, its IR is the mark's. */
export const flowStepMarkOf = (op: unknown): Mark<any> | undefined =>
  (op as { [FLOW_STEP_MARK]?: Mark<any> } | null)?.[FLOW_STEP_MARK];

/**
 * The operator a flow-step mark is in a `.flow(...)`: for each group, it
 * builds the node the rest of the flow builds and applies `mark` to that one
 * node as its bag, so the mark's node holds it as a fresh child, as the
 * combinator form `enclose(opts, [child])` does. The child carries the
 * group's rows (its datum, when it has none of its own), which the mark reads
 * its per-group channels from.
 */
function flowStepOperator(mark: Mark<any>): Operator<any, any> {
  const op: Operator<any, any> = async (inner) =>
    (async (d: unknown[], key, layerContext) => {
      const child = await resolveMarkResult(inner, layerContext, d, key);
      child.datum ??= datumOfInput(d);
      return mark([child], key, layerContext);
    }) as Mark<any>;
  Object.defineProperty(op, FLOW_STEP_MARK, { value: mark });
  return op;
}

/** @internal The operators a `.flow(...)` argument stands for: a fragment's
 *  own operators, a flow-step mark's operator ({@link flowStepOperator}), or
 *  the operator itself. Read at the ChartBuilder boundary, so the IR carries
 *  them. */
export function expandComposedOperator(
  operator: Operator<any, any>
): readonly Operator<any, any>[] {
  if (isFlowStep(operator))
    return [flowStepOperator(operator as unknown as Mark<any>)];
  return (
    (operator as Partial<ComposedOperator>)[COMPOSED_OPERATORS] ?? [operator]
  );
}

/**
 * Packages a left-to-right sequence of operators as one reusable flow fragment.
 * Nested fragments are flattened, and an empty fragment is the identity operator.
 */
export function compose<T>(): Operator<T, T>;
export function compose<T1, T2>(op1: Operator<T1, T2>): Operator<T1, T2>;
export function compose<T1, T2, T3>(
  op1: Operator<T1, T2>,
  op2: Operator<T2, T3>
): Operator<T1, T3>;
export function compose<T1, T2, T3, T4>(
  op1: Operator<T1, T2>,
  op2: Operator<T2, T3>,
  op3: Operator<T3, T4>
): Operator<T1, T4>;
export function compose<T1, T2, T3, T4, T5>(
  op1: Operator<T1, T2>,
  op2: Operator<T2, T3>,
  op3: Operator<T3, T4>,
  op4: Operator<T4, T5>
): Operator<T1, T5>;
export function compose<T1, T2, T3, T4, T5, T6>(
  op1: Operator<T1, T2>,
  op2: Operator<T2, T3>,
  op3: Operator<T3, T4>,
  op4: Operator<T4, T5>,
  op5: Operator<T5, T6>
): Operator<T1, T6>;
export function compose<T1, T2, T3, T4, T5, T6, T7>(
  op1: Operator<T1, T2>,
  op2: Operator<T2, T3>,
  op3: Operator<T3, T4>,
  op4: Operator<T4, T5>,
  op5: Operator<T5, T6>,
  op6: Operator<T6, T7>
): Operator<T1, T7>;
export function compose<T1, T2, T3, T4, T5, T6, T7, T8>(
  op1: Operator<T1, T2>,
  op2: Operator<T2, T3>,
  op3: Operator<T3, T4>,
  op4: Operator<T4, T5>,
  op5: Operator<T5, T6>,
  op6: Operator<T6, T7>,
  op7: Operator<T7, T8>
): Operator<T1, T8>;
/** A list of steps of any length (`compose(...steps)`), untyped between them. */
export function compose(...operators: Operator<any, any>[]): Operator<any, any>;
export function compose(
  ...operators: Operator<any, any>[]
): Operator<any, any> {
  const flattened = operators.flatMap(expandComposedOperator);
  const composed = async (mark: Mark<any>) => {
    let result = mark;
    for (const operator of flattened.toReversed()) {
      result = await operator(result);
    }
    return result;
  };
  Object.defineProperty(composed, COMPOSED_OPERATORS, { value: flattened });
  return composed;
}
