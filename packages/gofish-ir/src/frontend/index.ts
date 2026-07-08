export * from "./schema.js";
export {
  validate,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
} from "./validate.js";
export {
  exampleBarChart,
  exampleLayer,
  exampleScatter,
  exampleTreemap,
  exampleCustomMark,
  allExamples,
} from "./examples.js";
export { FRONTEND_IR_JSON_SCHEMA } from "./jsonSchema.js";
export {
  t,
  ch,
  group,
  resolveFields,
  OPERATORS,
  LEAF_MARKS,
  COMBINATOR_MARKS,
  COORDS,
  MARK_BASE_FIELDS,
  OPERATOR_BASE_FIELDS,
  PY_LEAF_BASE_KWARGS,
  boxDims,
  paint,
  ALL_OPERATOR_DESCRIPTORS,
  ALL_LEAF_MARK_DESCRIPTORS,
  ALL_COMBINATOR_MARK_DESCRIPTORS,
  ALL_COORD_DESCRIPTORS,
  type ChannelInner,
  type FieldType,
  type FieldSpec,
  type FieldGroup,
  type ConstructKind,
  type ConstructDescriptor,
} from "./descriptors.js";
