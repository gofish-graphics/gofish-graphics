/**
 * Descriptor ↔ schema.ts agreement test.
 *
 * `schema.ts`'s per-operator TS interfaces (SpreadOperator, TableOperator,
 * ...) stay hand-authored rather than derived from `descriptors.ts` (see the
 * decision note in this stage's report: deriving them via mapped/conditional
 * types over the field-type DSL — resolving `t.channel`/`t.ref`/`t.union`/
 * `t.record` into real TS types while keeping the exported interface NAMES
 * stable — produced deep conditional-type gymnastics for marginal benefit at
 * only 9 operator shapes). This test is the fallback the design doc calls
 * for instead: assert, per operator, that the descriptor's field-name set
 * agrees with the authored interface's own keys (excluding the shared base
 * fields every operator carries — `type`, `translate`, `origin`, `meta`,
 * which the descriptor deliberately omits per-entry; see
 * `OPERATOR_BASE_FIELDS` in descriptors.ts). A drift in either direction
 * (a field added to one but not the other) fails this test.
 *
 * Runnable as a script: `pnpm --filter gofish-ir test`.
 */

import {
  LABEL_OPTIONS,
  OPERATORS,
  OPTION_TYPES,
  resolveFields,
  type FieldType,
} from "../frontend/descriptors.js";
import type {
  AxesOptions,
  AxisInterval,
  FieldPredicateIR,
  AxisOptions,
  LabelSpecIR,
} from "../frontend/schema.js";
import { AXIS_INTERVAL_KEYS } from "../frontend/validate.js";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// `debug` is OperatorFlagsIR — a shared mixin like TranslatableIR, merged at
// walk time in validate.ts rather than living in each descriptor entry.
const BASE_FIELDS = ["type", "translate", "origin", "meta", "debug"] as const;

/**
 * The authored `schema.ts` interface's own keys, per operator, transcribed
 * by hand (once) from the interface declarations — excluding the shared
 * `BaseIRNode`/`TranslatableIR`/`OperatorFlagsIR` keys every operator
 * interface extends. This is the "known keys list" half of the agreement
 * check; the other half comes from `resolveFields(OPERATORS[type])` at
 * runtime.
 */
const SCHEMA_OPERATOR_KEYS: Record<string, readonly string[]> = {
  derive: ["lambdaId", "provenance"],
  resolve: ["cols", "from", "key"],
  join: ["on", "right"],
  filter: ["predicate"],
  spread: [
    "by",
    "dir",
    "spacing",
    "alignment",
    "sharedScale",
    "anchor",
    "reverse",
    "glue",
    "axes",
    "x",
    "y",
    "w",
    "h",
    "size",
  ],
  stack: [
    "by",
    "dir",
    "spacing",
    "glue",
    "alignment",
    "sharedScale",
    "anchor",
    "reverse",
    "axes",
    "x",
    "y",
    "w",
    "h",
    "size",
  ],
  group: ["by"],
  scatter: [
    "by",
    "x",
    "y",
    "xMin",
    "xMax",
    "yMin",
    "yMax",
    "dims",
    "alignment",
    "overlap",
    "axes",
    "w",
    "h",
  ],
  table: ["by", "spacing", "numCols"],
  log: ["prefix"],
  treemap: [
    "x",
    "y",
    "w",
    "h",
    "dims",
    "by",
    "spacing",
    "padding",
    "round",
    "tile",
    "sort",
    "size",
  ],
  pack: ["by", "method"],
};

console.log("\n# Descriptor fields agree with schema.ts operator interfaces");

for (const [type, schemaKeys] of Object.entries(SCHEMA_OPERATOR_KEYS)) {
  const descriptor = OPERATORS[type];
  check(`OPERATORS["${type}"] exists`, descriptor !== undefined);
  if (!descriptor) continue;

  const descriptorKeys = Object.keys(resolveFields(descriptor)).filter(
    (k) => !(BASE_FIELDS as readonly string[]).includes(k)
  );

  const schemaSet = new Set(schemaKeys);
  const descriptorSet = new Set(descriptorKeys);

  const missingFromDescriptor = schemaKeys.filter((k) => !descriptorSet.has(k));
  const extraInDescriptor = descriptorKeys.filter((k) => !schemaSet.has(k));

  check(
    `${type}: descriptor field set === schema.ts interface keys`,
    missingFromDescriptor.length === 0 && extraInDescriptor.length === 0,
    JSON.stringify({ missingFromDescriptor, extraInDescriptor })
  );
}

// Every entry in OPERATORS should have a corresponding hand-transcribed key
// list above (catches a descriptor entry added without updating this test).
console.log("\n# Every OPERATORS entry has a schema-key list to check against");
for (const type of Object.keys(OPERATORS)) {
  check(
    `SCHEMA_OPERATOR_KEYS has an entry for "${type}"`,
    type in SCHEMA_OPERATOR_KEYS
  );
}

/**
 * The object-form keys of schema.ts's hand-written `AxisOptions` /
 * `AxesOptions` types. Typed as `Record<keyof ..., true>`, so a type checker
 * flags a key added to or removed from the TS type; the runtime check below
 * compares them with the `OPTION_TYPES` declaration.
 */
const SCHEMA_OPTION_TYPE_KEYS: Record<string, Record<string, true>> = {
  AxisOptions: {
    title: true,
    side: true,
    labelAngle: true,
  } satisfies Record<keyof Exclude<AxisOptions, boolean>, true>,
  AxesOptions: {
    x: true,
    y: true,
  } satisfies Record<keyof Exclude<AxesOptions, boolean>, true>,
  AxisInterval: {
    min: true,
    center: true,
    max: true,
    size: true,
    embedded: true,
  } satisfies Record<keyof AxisInterval, true>,
  FieldPredicate: {
    field: true,
    between: true,
    closed: true,
  } satisfies Record<keyof FieldPredicateIR, true>,
};

/** The fields of the one object branch of a named option type. */
function optionTypeObjectKeys(type: FieldType): string[] {
  if (type.kind === "object") return Object.keys(type.fields);
  if (type.kind === "union") return type.options.flatMap(optionTypeObjectKeys);
  return [];
}

console.log("\n# OPTION_TYPES agree with schema.ts option types");
for (const [name, keys] of Object.entries(SCHEMA_OPTION_TYPE_KEYS)) {
  const spec = OPTION_TYPES[name];
  check(`OPTION_TYPES["${name}"] exists`, spec !== undefined);
  if (!spec) continue;
  const schemaKeys = Object.keys(keys).sort();
  const descriptorKeys = optionTypeObjectKeys(spec.type).sort();
  check(
    `${name}: OPTION_TYPES object keys === schema.ts type keys`,
    JSON.stringify(schemaKeys) === JSON.stringify(descriptorKeys),
    JSON.stringify({ schemaKeys, descriptorKeys })
  );
}
check(
  "AXIS_INTERVAL_KEYS (the runtime's interval anchors) === OPTION_TYPES.AxisInterval keys",
  JSON.stringify([...AXIS_INTERVAL_KEYS].sort()) ===
    JSON.stringify(optionTypeObjectKeys(OPTION_TYPES.AxisInterval.type).sort())
);

console.log("\n# LABEL_OPTIONS agree with schema.ts LabelSpecIR");
{
  const schemaKeys = Object.keys({
    position: true,
    fontSize: true,
    color: true,
    offset: true,
    rotate: true,
    fontFamily: true,
    fontWeight: true,
    fontStyle: true,
  } satisfies Record<Exclude<keyof LabelSpecIR, "accessor">, true>).sort();
  const descriptorKeys = Object.keys(LABEL_OPTIONS).sort();
  check(
    "LABEL_OPTIONS keys === LabelSpecIR keys but accessor",
    JSON.stringify(schemaKeys) === JSON.stringify(descriptorKeys),
    JSON.stringify({ schemaKeys, descriptorKeys })
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
