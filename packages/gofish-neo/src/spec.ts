/** Declarative specification for a Neo hierarchical-confusion-matrix chart. */

import type { Condition } from "./pipeline";
import type { Measure } from "./measures";

export type Normalization = "total" | "row" | "column";
export type Encoding = "color" | "size";

export interface NeoSpec {
  /** classes[0] is the primary axis; the rest are nested into it by `nest()`. */
  classes: string[];
  where?: Condition;
  filter?: string[];
  /** @default "total" */
  normalization?: Normalization;
  /** @default "color" */
  encoding?: Encoding;
  /** Node ids (not names) whose subtrees are collapsed in the rendering frontier. */
  collapsed?: string[];
  /** @default ["precision", "recall", "accuracy"] */
  measures?: Measure[];
}

/**
 * A `NeoSpec` with every optional field filled in with its default value.
 * `where` stays optional — there is no meaningful default condition.
 */
export type ResolvedNeoSpec = Required<Omit<NeoSpec, "where">> &
  Pick<NeoSpec, "where">;

/** Fills in default values for a `NeoSpec`'s optional fields. */
export function applyDefaults(spec: NeoSpec): ResolvedNeoSpec {
  return {
    classes: spec.classes,
    where: spec.where,
    filter: spec.filter ?? [],
    normalization: spec.normalization ?? "total",
    encoding: spec.encoding ?? "color",
    collapsed: spec.collapsed ?? [],
    measures: spec.measures ?? ["precision", "recall", "accuracy"],
  };
}
