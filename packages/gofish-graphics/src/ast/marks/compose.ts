import type { Mark, Operator } from "../types";

const COMPOSED_OPERATORS = Symbol("gofish.composedOperators");
const FLOW_STEP = Symbol("gofish.flowStep");

type ComposedOperator = Operator<any, any> & {
  [COMPOSED_OPERATORS]: readonly Operator<any, any>[];
};

/**
 * @internal Give `value`, a mark, the operator it is when it stands in a
 * `.flow(...)` (or `compose(...)`) instead of a mark position. `enclose(opts)`
 * is the one such value: a bag-form mark in `.mark(...)`, and a step that
 * wraps each group's subtree in `.flow(...)`. Returns `value`.
 */
export function withFlowStep<V extends object>(
  value: V,
  step: Operator<any, any>
): V {
  Object.defineProperty(value, FLOW_STEP, { value: step });
  return value;
}

/** @internal The flow step `value` carries ({@link withFlowStep}), if any.
 *  A mark modifier that wraps such a mark (`.name()`, `.label()`,
 *  `.zOrder()`, `.translate()`) gives the wrapped mark the step wrapped the
 *  same way, so the step survives the chain (`createOperator.ts`). */
export function flowStepOf(value: unknown): Operator<any, any> | undefined {
  return (value as { [FLOW_STEP]?: Operator<any, any> } | null)?.[FLOW_STEP];
}

/** @internal The operators a `.flow(...)` argument stands for: a fragment's
 *  own operators, a value's flow step ({@link withFlowStep}), or the
 *  operator itself. Read at the ChartBuilder boundary, so the IR carries
 *  them. */
export function expandComposedOperator(
  operator: Operator<any, any>
): readonly Operator<any, any>[] {
  const step = flowStepOf(operator);
  if (step !== undefined) return [step];
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
