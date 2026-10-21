// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * JSON Schema for the GoFish frontend IR (v0).
 *
 * The envelope (Root/ChartIR/LayerChainIR/DataIR/MarkIR union, ChannelValue,
 * ConstraintIR, ...) stays hand-written below — these are structural/
 * recursive shapes, not flat field bags, and are cheap to keep authored.
 *
 * The per-operator `$defs` (a discriminated `oneOf`, one member per operator
 * type with its own required/optional properties) and the per-leaf-mark
 * `$defs` (enumerated channels, `additionalProperties: true` — the warn-
 * don't-reject rollout stance) are GENERATED from `descriptors.ts` by
 * `buildOperatorDefs()` / `buildLeafMarkDefs()` below, merged into the
 * authored `$defs` object, as are the named option types (`AxesOptions`,
 * `AxisOptions`, `AxisInterval`, `AxisDimsValue`) from `OPTION_TYPES`
 * (`buildOptionTypeDefs()`), `ChartOptions` among them. Field-level coverage matches `validate.ts` (which
 * interprets the same descriptor table); this file is the wire artifact
 * (consumed by external tooling, language servers, and the Python wrapper's
 * parity-test harness).
 */

import {
  CHART_OPTIONS,
  LABEL_OPTIONS,
  LEAF_MARKS,
  MARK_BASE_FIELDS,
  OPERATORS,
  OPTION_TYPES,
  resolveFields,
  t,
  type FieldGroup,
  type FieldType,
} from "./descriptors.js";

// ---------------------------------------------------------------------------
// Descriptor → JSON Schema fragment
// ---------------------------------------------------------------------------

/** Convert one descriptor `FieldType` to a JSON Schema fragment. */
function fieldTypeToSchema(type: FieldType): Record<string, unknown> {
  switch (type.kind) {
    case "string":
      return { type: "string" };
    case "number":
      // A finite number has no tagged form (`nonFinite.ts`), so it is a plain
      // JSON number; `minimum` constrains only the number, not the tag.
      // A whole number is finite too.
      return {
        ...(type.integer
          ? { type: "integer" }
          : type.finite
            ? { type: "number" }
            : { $ref: "#/$defs/Number" }),
        ...(type.min !== undefined ? { minimum: type.min } : {}),
        ...(type.exclusiveMin !== undefined
          ? { exclusiveMinimum: type.exclusiveMin }
          : {}),
        ...(type.max !== undefined ? { maximum: type.max } : {}),
      };
    case "boolean":
      return { type: "boolean" };
    case "any":
      return {};
    case "enum":
      return { enum: [...type.values] };
    case "literal":
      return { const: type.value };
    case "channel":
      return { $ref: "#/$defs/ChannelValue" };
    case "ref":
      return { $ref: `#/$defs/${type.name}` };
    case "union":
      // `anyOf`, as validate.ts reads a union: a value is valid when some
      // branch accepts it. Branches may overlap (a tagged `datum(...)` object
      // is a channel value and also fits an open interval object).
      return { anyOf: type.options.map(fieldTypeToSchema) };
    case "array":
      return {
        type: "array",
        items: fieldTypeToSchema(type.items),
        ...(type.minItems !== undefined ? { minItems: type.minItems } : {}),
      };
    case "tuple":
      return {
        type: "array",
        minItems: type.items.length,
        maxItems: type.items.length,
        prefixItems: type.items.map(fieldTypeToSchema),
      };
    case "record":
      return {
        type: "object",
        additionalProperties: fieldTypeToSchema(type.valueType),
      };
    case "object": {
      const { properties, required } = fieldsToProperties(type.fields);
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
  }
}

/** Convert a `FieldGroup` into JSON Schema `properties` + `required`. */
function fieldsToProperties(fields: FieldGroup): {
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, spec] of Object.entries(fields)) {
    const schema = fieldTypeToSchema(spec.type);
    properties[name] = {
      ...schema,
      ...(spec.doc ? { description: spec.doc } : {}),
      ...(spec.default !== undefined ? { default: spec.default } : {}),
    };
    if (spec.required) required.push(name);
  }
  return { properties, required };
}

const pascalCase = (s: string): string =>
  s.replace(/(^|[-_])([a-z])/g, (_m, _sep, c: string) => c.toUpperCase());

/**
 * Build one `$def` per operator type (`SpreadOperator`, `TableOperator`, ...)
 * plus the `OperatorIR` discriminated union referencing them. Mirrors
 * `validate.ts`'s walkOperator field shapes with `type`/`translate`/`origin`/
 * `meta`/`debug` always present as properties. `additionalProperties` stays
 * `true`: the published schema keeps the permissive wire contract (the JS
 * low-level factories accept passthrough options the fluent operators' IR doesn't model,
 * e.g. spread/stack `FancyDims` — real producers emit them); rejecting an
 * unknown field is validate.ts's job, not the wire artifact's.
 */
function buildOperatorDefs(): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  const refs: Record<string, unknown>[] = [];
  for (const descriptor of Object.values(OPERATORS)) {
    const defName = `${pascalCase(descriptor.type)}Operator`;
    const { properties, required } = fieldsToProperties(
      resolveFields(descriptor)
    );
    defs[defName] = {
      ...(descriptor.doc ? { description: descriptor.doc } : {}),
      type: "object",
      required: ["type", ...required],
      additionalProperties: true,
      properties: {
        type: { const: descriptor.type },
        ...properties,
        // Base `.label(accessor, options?)` chain (LabelIR) — matches
        // validate.ts's `walkOperator` merge order.
        label: { $ref: "#/$defs/LabelIR" },
        translate: { $ref: "#/$defs/Translate" },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
        debug: { type: "boolean" },
      },
    };
    refs.push({ $ref: `#/$defs/${defName}` });
  }
  defs.OperatorIR = {
    description:
      "A pipeline operator — a discriminated union, one member per operator type. See validate.ts and schema.ts for the same field shapes.",
    oneOf: refs,
  };
  return defs;
}

/**
 * Build one `$def` per leaf-mark type (`RectMark`, `TextMark`, ...) plus the
 * `LeafMarkIR` union referencing them. Like the operator `$defs`,
 * `additionalProperties` stays `true`, and `required` is just `["type"]`
 * regardless of the descriptor's own required fields: the published schema
 * keeps the open wire contract, and rejecting an unknown or missing field is
 * validate.ts's job.
 */
function buildLeafMarkDefs(): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  const refs: Record<string, unknown>[] = [];
  for (const descriptor of Object.values(LEAF_MARKS)) {
    const defName = `${pascalCase(descriptor.type)}Mark`;
    const { properties } = fieldsToProperties(resolveFields(descriptor));
    defs[defName] = {
      ...(descriptor.doc ? { description: descriptor.doc } : {}),
      type: "object",
      required: ["type"],
      additionalProperties: true,
      properties: {
        type: { const: descriptor.type },
        ...properties,
        name: { type: "string" },
        label: { $ref: "#/$defs/LabelIR" },
        relate: {
          type: "array",
          items: { $ref: "#/$defs/RelateClauseIR" },
        },
        zOrder: fieldTypeToSchema(MARK_BASE_FIELDS.zOrder.type),
        debug: { type: "boolean" },
        translate: { $ref: "#/$defs/Translate" },
      },
    };
    refs.push({ $ref: `#/$defs/${defName}` });
  }
  defs.LeafMarkIR = {
    oneOf: refs,
  };
  return defs;
}

/** One `$def` per named option type (`AxesOptions`, `AxisOptions`, ...), so
 *  a descriptor field's `t.ref(name)` resolves to the same declaration the
 *  validator and the Python generator read. */
function buildOptionTypeDefs(): Record<string, unknown> {
  return fieldsToProperties(OPTION_TYPES).properties;
}

const GENERATED_DEFS: Record<string, unknown> = {
  ...buildOperatorDefs(),
  ...buildLeafMarkDefs(),
  ...buildOptionTypeDefs(),
};

export const FRONTEND_IR_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://gofish.graphics/schema/frontend/v0.json",
  title: "GoFish Frontend IR",
  description:
    "Source-level chart specification produced by the fluent chart API.",
  type: "object",
  required: ["irVersion", "ir", "root"],
  additionalProperties: false,
  properties: {
    irVersion: { const: 0 },
    ir: { const: "gofish-frontend" },
    $schema: { type: "string" },
    root: { $ref: "#/$defs/Root" },
    tables: {
      type: "object",
      description:
        'The rows of every chart in the document that has rows of its own, by the id its {type: "table", id} data names.',
      additionalProperties: {
        type: "array",
        items: { type: "object" },
      },
    },
  },
  $defs: {
    Root: {
      description:
        "A root holds anything a mark position holds: a chart, a .layer(...) chain, a layer([...]) of charts or marks, or a bare mark.",
      $ref: "#/$defs/MarkIR",
    },
    Origin: {
      type: "object",
      properties: {
        name: { type: "string" },
        stack: { type: "string" },
      },
    },
    Meta: {
      type: "object",
      description:
        "Optional inline annotations populated by later passes. v0 emitters leave it absent.",
    },
    DataIR: {
      oneOf: [
        {
          type: "object",
          required: ["type", "id"],
          properties: {
            type: { const: "table" },
            id: { type: "string" },
          },
          description:
            "Rows of the chart's own, by id: they travel beside the IR (a document's tables, or a Python host's Arrow tables).",
        },
        { $ref: "#/$defs/SelectRefIR" },
        {
          type: "object",
          required: ["type"],
          properties: {
            type: { const: "previous-tier" },
          },
          description:
            "An empty chart() scope, whose rows are the enclosing scope's: inside a .layer(...) chain the immediately preceding tier's marks; in a mark position the rows of the partition it sits in.",
        },
      ],
    },
    ChartIR: {
      type: "object",
      required: ["type", "data", "mark"],
      properties: {
        type: { const: "chart" },
        data: { $ref: "#/$defs/DataIR" },
        operators: { type: "array", items: { $ref: "#/$defs/OperatorIR" } },
        mark: { $ref: "#/$defs/MarkIR" },
        options: { $ref: "#/$defs/ChartOptions" },
        zOrder: { $ref: "#/$defs/Number" },
        name: {
          type: "string",
          description:
            "Chart-level name so a sibling Layer relate callback can reference this chart.",
        },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    LayerChainIR: {
      type: "object",
      required: ["type", "tiers"],
      description:
        "A chart(...).layer(...) chain: tiers stacked in order, each offered the previous tier's marks as its scope. The first tier is a chart; it sits at the root or in any mark position, where a first tier with previous-tier data binds the rows of the partition it sits in.",
      properties: {
        type: { const: "layer-chain" },
        tiers: {
          type: "array",
          minItems: 2,
          prefixItems: [{ $ref: "#/$defs/ChartIR" }],
          items: { $ref: "#/$defs/MarkIR" },
        },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    // OperatorIR + one $def per operator type (SpreadOperator, TableOperator,
    // ...) are GENERATED from descriptors.ts — see GENERATED_DEFS below.
    Translate: {
      description:
        "Structural pixel translation reapplied by the runtime deserializer.",
      type: "object",
      properties: {
        x: { $ref: "#/$defs/Number" },
        y: { $ref: "#/$defs/Number" },
      },
    },
    // AxesOptions / AxisOptions / AxisInterval / AxisDimsValue are GENERATED
    // from descriptors.ts's OPTION_TYPES (ChartOptions among them)
    // — see GENERATED_DEFS below.
    FieldAccessor: {
      description:
        'Explicit field-accessor form, emitted by field(name). Optionally carries a chained pipeline (ops) — field("site").sort("yield") or field("count").normalize(). Two disjoint slots consume ops: a `by` (grouping key) slot accepts the domain ops (sort/reverse/bin); a value (size/pos) channel slot accepts the aggregate ops (sum/mean/count/distinct) and, only on an operator\'s entry-flagged size channel, normalize.',
      type: "object",
      required: ["type", "name"],
      properties: {
        type: { const: "field" },
        name: { type: "string" },
        ops: {
          type: "array",
          items: { $ref: "#/$defs/FieldOpIR" },
        },
      },
    },
    StructAccessor: {
      description:
        "A key built from two fields at once, emitted by struct({ x, y }), with the cells it is binned into (its one op, bin, takes Bin.hex or Bin.voronoi). Valid as a partition's `by` only once binned.",
      type: "object",
      required: ["type", "fields"],
      additionalProperties: false,
      properties: {
        type: { const: "struct" },
        fields: {
          type: "object",
          required: ["x", "y"],
          additionalProperties: false,
          properties: { x: { type: "string" }, y: { type: "string" } },
        },
        ops: {
          type: "array",
          items: {
            type: "object",
            required: ["op", "partition"],
            additionalProperties: false,
            properties: {
              op: { const: "bin" },
              partition: { $ref: "#/$defs/StructBin" },
            },
          },
        },
      },
    },
    ChunkKey: {
      description:
        "A `by` key that groups consecutive rows, emitted by chunk(size): row i goes to group floor(i / size), a bin over row position. It names no field, so its groups draw no axis or labels.",
      type: "object",
      required: ["type", "size"],
      properties: {
        type: { const: "chunk" },
        size: { type: "integer", minimum: 1 },
      },
    },
    FieldOpIR: {
      description:
        "One op in a field(...) pipeline. Mirrors gofish-graphics' FieldOp (ast/fieldExpr.ts) exactly.",
      oneOf: [
        {
          type: "object",
          required: ["op"],
          properties: {
            op: { const: "sort" },
            by: { type: "string" },
            order: { enum: ["asc", "desc"] },
            values: {
              type: "array",
              items: {
                oneOf: [{ type: "string" }, { $ref: "#/$defs/Number" }],
              },
              description:
                'Explicit group order (#735), e.g. sort(["sun", "fog", ...]). Mutually exclusive with by/order. Groups whose key isn\'t in this list are appended after, in natural sort order.',
            },
          },
        },
        {
          type: "object",
          required: ["op"],
          properties: { op: { const: "reverse" } },
        },
        {
          type: "object",
          required: ["op"],
          properties: {
            op: { const: "bin" },
            partition: {
              description:
                "The partition each value is binned into: a Calendar value (Calendar.month({ every: 3 }) is { kind: month, every: 3 }), Bin.step(size) or Bin.thresholds(countOrEdges), told apart by kind; or a product of Calendar values (a list, [year, month]: one cell where they meet). Absent: about 10 cells. A second bin op splits the cells of the one before it.",
              oneOf: [
                { $ref: "#/$defs/Partition" },
                {
                  type: "array",
                  minItems: 2,
                  items: { $ref: "#/$defs/Calendar" },
                },
              ],
            },
          },
          additionalProperties: false,
        },
        {
          type: "object",
          required: ["op"],
          properties: { op: { const: "dropNulls" } },
        },
        {
          type: "object",
          required: ["op"],
          properties: { op: { const: "normalize" } },
        },
        {
          type: "object",
          required: ["op"],
          properties: { op: { const: "sum" } },
        },
        {
          type: "object",
          required: ["op"],
          properties: { op: { const: "mean" } },
        },
        {
          type: "object",
          required: ["op"],
          properties: { op: { const: "count" } },
        },
        {
          type: "object",
          required: ["op"],
          properties: { op: { const: "distinct" } },
        },
      ],
    },
    MarkIR: {
      oneOf: [
        { $ref: "#/$defs/LeafMarkIR" },
        { $ref: "#/$defs/CombinatorMarkIR" },
        { $ref: "#/$defs/RefMarkIR" },
        { $ref: "#/$defs/OffsetMarkIR" },
        { $ref: "#/$defs/CutMarkIR" },
        { $ref: "#/$defs/ChartIR" },
        { $ref: "#/$defs/LayerChainIR" },
      ],
      description:
        "What a mark position holds, and what a root holds. Besides the mark kinds, a whole chart or a .layer(...) chain may sit where a mark does, as in JS (.mark(chart(...)), layer([rect(...), chart(...)])). A layer of charts is the layer combinator mark with chart children.",
    },
    OffsetMarkIR: {
      description:
        "Shift a single child by (x, y) render-pixels without moving the bounds it advertises to its parent. Maps to the public `offset` operator.",
      type: "object",
      required: ["type", "children"],
      properties: {
        type: { const: "offset" },
        x: { $ref: "#/$defs/Number" },
        y: { $ref: "#/$defs/Number" },
        children: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: { $ref: "#/$defs/MarkIR" },
        },
        translate: { $ref: "#/$defs/Translate" },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    CutMarkIR: {
      description:
        "Slice a single `source` mark into N clipped sub-shapes along `dir`. As a chart `.mark(...)` spec it deserializes to the expand-mark form; as a combinator child it expands in place into its N slice nodes. `size` is a field-name string (expand form) or an array of absolute-pixel numbers / datum() flex-weight wrappers; omitted means equal slices.",
      type: "object",
      required: ["type", "source", "dir"],
      properties: {
        type: { const: "cut" },
        source: { $ref: "#/$defs/MarkIR" },
        dir: { enum: ["x", "y"] },
        size: { $ref: "#/$defs/CutSize" },
        inset: { $ref: "#/$defs/Number" },
        name: { type: "string" },
        zOrder: fieldTypeToSchema(MARK_BASE_FIELDS.zOrder.type),
        translate: { $ref: "#/$defs/Translate" },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    CutSize: {
      description:
        "cut slice extents: a field-name string (expand-mark form) or an array of raw numbers (absolute source pixels) and datum() wrappers (relative flex weights).",
      oneOf: [
        { type: "string" },
        {
          type: "array",
          items: {
            oneOf: [
              { $ref: "#/$defs/Number" },
              {
                type: "object",
                required: ["type", "datum"],
                properties: {
                  type: { const: "datum" },
                  datum: {},
                  offset: { $ref: "#/$defs/Number" },
                  colorOps: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["op", "amount"],
                      properties: {
                        op: { enum: ["lighten", "darken"] },
                        amount: { $ref: "#/$defs/Number" },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    },
    // LeafMarkIR + one $def per leaf-mark type (RectMark, TextMark, ...) are
    // GENERATED from descriptors.ts — see GENERATED_DEFS below.
    CombinatorMarkIR: {
      type: "object",
      required: ["type", "__combinator", "children"],
      properties: {
        type: {
          enum: [
            "spread",
            "stack",
            "scatter",
            "group",
            "table",
            "layer",
            "enclose",
            "position",
            "arrow",
            "line",
            "ribbon",
            "treemap",
            "over",
            "inside",
            "xor",
            "out",
            "atop",
            "mask",
          ],
        },
        __combinator: { const: true },
        options: { type: "object" },
        children: { type: "array", items: { $ref: "#/$defs/MarkIR" } },
        name: { type: "string" },
        label: { $ref: "#/$defs/LabelIR" },
        relate: {
          type: "array",
          items: { $ref: "#/$defs/RelateClauseIR" },
        },
        zOrder: fieldTypeToSchema(MARK_BASE_FIELDS.zOrder.type),
        debug: { type: "boolean" },
        translate: { $ref: "#/$defs/Translate" },
      },
    },
    RefMarkIR: {
      type: "object",
      required: ["type", "selection"],
      properties: {
        type: { const: "ref" },
        selection: {
          oneOf: [
            { type: "string" },
            {
              type: "array",
              items: {
                oneOf: [{ type: "string" }, { $ref: "#/$defs/Number" }],
              },
            },
          ],
        },
        name: { type: "string" },
        label: { $ref: "#/$defs/LabelIR" },
        translate: { $ref: "#/$defs/Translate" },
      },
    },
    LabelIR: {
      // Two shapes: an array of label specs (one entry per `.label(...)`
      // call — repeated calls append), and a boolean shorthand (`label:
      // true|false` — enable/suppress a label, the operator-kwarg
      // suppression mechanism, e.g. `stack({...}, label: false)`). Both
      // match `LabelIR` in schema.ts.
      oneOf: [
        { type: "boolean" },
        {
          type: "array",
          items: {
            type: "object",
            required: ["accessor"],
            properties: {
              accessor: {
                oneOf: [{ type: "string" }, { $ref: "#/$defs/FieldAccessor" }],
              },
              ...fieldsToProperties(LABEL_OPTIONS).properties,
            },
          },
        },
      ],
    },
    Number: {
      description:
        'A number. JSON has no Infinity, so +/-Infinity travel as the tagged object { "$numberDouble": "Infinity" | "-Infinity" } (MongoDB Extended JSON). A tagged "NaN" is not a valid number here.',
      oneOf: [
        { type: "number" },
        {
          type: "object",
          required: ["$numberDouble"],
          additionalProperties: false,
          properties: {
            $numberDouble: { enum: ["Infinity", "-Infinity"] },
          },
        },
      ],
    },
    NodeSelectionIR: {
      description:
        "Nodes named inside an option (a blob's `avoiding`): a list of refs, or every node of a named layer (selectAll).",
      oneOf: [
        { type: "array", items: { $ref: "#/$defs/RefMarkIR" } },
        {
          allOf: [
            { $ref: "#/$defs/SelectRefIR" },
            { required: ["mode"], properties: { mode: { const: "all" } } },
          ],
        },
      ],
    },
    SelectRefIR: {
      description:
        'A reference to the nodes of a named layer: ref(name) (mode "one" or absent) or selectAll(name) (mode "all").',
      type: "object",
      required: ["type", "layer"],
      additionalProperties: false,
      properties: {
        type: { const: "select" },
        layer: { type: "string" },
        mode: { enum: ["one", "all"] },
      },
    },
    RelateClauseIR: {
      description:
        "One clause of a .relate() callback: a constraint over names (carries refs), or a mark that draws, whose children may reference the layer's names.",
      oneOf: [{ $ref: "#/$defs/ConstraintIR" }, { $ref: "#/$defs/MarkIR" }],
    },
    ConstraintIR: {
      type: "object",
      required: ["type", "refs"],
      properties: {
        type: {
          enum: ["align", "distribute", "position", "nest", "zAbove", "zBelow"],
        },
        options: { type: "object" },
        refs: { type: "array", items: { type: "string" } },
      },
    },
    ChannelValue: {
      description:
        "Right-hand side of a channel slot. Bare primitives for the shorthand path; tagged objects for the explicit field/datum/literal constructors and Python-bridge sentinels.",
      oneOf: [
        { type: "string" },
        { $ref: "#/$defs/Number" },
        { type: "boolean" },
        { type: "null" },
        { $ref: "#/$defs/FieldAccessor" },
        {
          type: "object",
          required: ["type", "value"],
          properties: {
            type: { const: "literal" },
            value: {},
          },
        },
        {
          type: "object",
          required: ["type", "datum"],
          properties: {
            type: { const: "datum" },
            datum: {},
            offset: {
              $ref: "#/$defs/Number",
              description:
                "Pixel offset applied after the datum maps through its scale (datum(v) + px).",
            },
          },
        },
        { $ref: "#/$defs/BridgeLambdaSentinel" },
      ],
    },
    BridgeLambdaSentinel: {
      description:
        "Python-bridge handle for a Python function: JS calls it through the bridge by this lambda id.",
      type: "object",
      required: ["__gofish_lambda"],
      properties: { __gofish_lambda: { type: "string" } },
    },
    ...GENERATED_DEFS,
  },
};
