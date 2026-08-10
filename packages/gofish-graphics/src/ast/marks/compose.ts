import type { Mark, Operator } from "../types";

const COMPOSED_OPERATORS = Symbol("gofish.composedOperators");

type ComposedOperator = Operator<any, any> & {
  [COMPOSED_OPERATORS]: readonly Operator<any, any>[];
};

/** @internal Expands a fragment at the ChartBuilder boundary for serialization. */
export function expandComposedOperator(
  operator: Operator<any, any>
): readonly Operator<any, any>[] {
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
