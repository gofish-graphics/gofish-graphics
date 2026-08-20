// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * JSON Schema for the GoFish frontend IR (v0).
 *
 * The envelope (Root/ChartIR/LayerIR/DataIR/MarkIR union, ChannelValue,
 * ConstraintIR, ...) stays hand-written below — these are structural/
 * recursive shapes, not flat field bags, and are cheap to keep authored.
 *
 * The per-operator `$defs` (a discriminated `oneOf`, one member per operator
 * type with its own required/optional properties) and the per-leaf-mark
 * `$defs` (enumerated channels, `additionalProperties: true` — the warn-
 * don't-reject rollout stance) are GENERATED from `descriptors.ts` by
 * `buildOperatorDefs()` / `buildLeafMarkDefs()` below, merged into the
 * authored `$defs` object. Field-level coverage matches `validate.ts` (which
 * interprets the same descriptor table); this file is the wire artifact
 * (consumed by external tooling, language servers, and the Python wrapper's
 * parity-test harness).
 */

import {
  LEAF_MARKS,
  OPERATORS,
  resolveFields,
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
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "any":
      return {};
    case "enum":
      return { enum: [...type.values] };
    case "channel":
      return { $ref: "#/$defs/ChannelValue" };
    case "ref":
      return { $ref: `#/$defs/${type.name}` };
    case "union":
      return { oneOf: type.options.map(fieldTypeToSchema) };
    case "array":
      return { type: "array", items: fieldTypeToSchema(type.items) };
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
 * low-level factories accept passthrough options the v3 IR doesn't model,
 * e.g. spread/stack `FancyDims` — real producers emit them); strict
 * unknown-field rejection is validate.ts strict mode's job, not the wire
 * artifact's.
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
 * `LeafMarkIR` union referencing them. Unlike operators, `additionalProperties`
 * stays `true` (leaf marks are open-world for now — the gradual-rollout
 * stance `validate.ts`'s leaf-mark warnings implement) and `required` is
 * just `["type"]` regardless of the descriptor's own required fields, so an
 * external strict consumer of this schema doesn't start rejecting documents
 * our own validator only warns about.
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
        constraints: {
          type: "array",
          items: { $ref: "#/$defs/ConstraintIR" },
        },
        zOrder: { type: "number" },
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

const GENERATED_DEFS: Record<string, unknown> = {
  ...buildOperatorDefs(),
  ...buildLeafMarkDefs(),
};

export const FRONTEND_IR_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://gofish.graphics/schema/frontend/v0.json",
  title: "GoFish Frontend IR",
  description:
    "Source-level chart specification produced by the v3 fluent API.",
  type: "object",
  required: ["irVersion", "ir", "root"],
  additionalProperties: false,
  properties: {
    irVersion: { const: 0 },
    ir: { const: "gofish-frontend" },
    $schema: { type: "string" },
    root: { $ref: "#/$defs/Root" },
  },
  $defs: {
    Root: {
      oneOf: [
        { $ref: "#/$defs/ChartIR" },
        { $ref: "#/$defs/LayerIR" },
        { $ref: "#/$defs/RawMarkIR" },
      ],
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
          required: ["type", "rows"],
          properties: {
            type: { const: "inline" },
            rows: { type: "array", items: { type: "object" } },
          },
        },
        {
          type: "object",
          required: ["type", "layer"],
          properties: {
            type: { const: "select" },
            layer: { type: "string" },
            mode: { enum: ["one", "all"] },
          },
        },
        {
          type: "object",
          required: ["type"],
          properties: {
            type: { const: "external" },
            id: { type: "string" },
          },
        },
        {
          type: "object",
          required: ["type"],
          properties: {
            type: { const: "previous-tier" },
          },
          description:
            "An empty chart() scope inside a .layer(...) chain: inherit the immediately preceding tier's marks. Only valid on a tier inside a builder:true LayerIR.",
        },
      ],
    },
    ChartIR: {
      type: "object",
      required: ["type", "mark"],
      properties: {
        type: { const: "chart" },
        data: { oneOf: [{ $ref: "#/$defs/DataIR" }, { type: "null" }] },
        operators: { type: "array", items: { $ref: "#/$defs/OperatorIR" } },
        mark: { $ref: "#/$defs/MarkIR" },
        options: { type: "object" },
        zOrder: { type: "number" },
        name: {
          type: "string",
          description:
            "Chart-level name so a sibling Layer constrain callback can reference this chart.",
        },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    LayerIR: {
      type: "object",
      required: ["type", "charts"],
      properties: {
        type: { const: "layer" },
        charts: {
          type: "array",
          description:
            "Layer tiers. Each is a ChartIR; the v3 chart(...).layer(mark) builder chain may also include a RawMarkIR tier (a component-level, datumless annotation overlay).",
          items: {
            oneOf: [{ $ref: "#/$defs/ChartIR" }, { $ref: "#/$defs/RawMarkIR" }],
          },
        },
        options: { type: "object" },
        constraints: {
          type: "array",
          items: { $ref: "#/$defs/ConstraintIR" },
          description:
            "Layer-level constraints (Layer([...]).constrain(...)), resolving refs against the child charts' names.",
        },
        builder: {
          type: "boolean",
          description:
            "True when this came from the v3 chart(...).layer(...) builder chain (not the low-level layer([...]) combinator). The deserializer reconstructs it through the real LayerBuilder so JS owns the builder's render logic (inferred axis titles, etc.).",
        },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    RawMarkIR: {
      type: "object",
      required: ["type", "mark"],
      properties: {
        type: { const: "raw-mark" },
        mark: { $ref: "#/$defs/MarkIR" },
        options: { type: "object" },
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
        x: { type: "number" },
        y: { type: "number" },
      },
    },
    AxesOptions: {
      description:
        "Per-node axis-rendering override. Boolean toggles both dimensions; object form lets x and y differ. Each `AxisOption` is `true`/`false`, or `{ title?: string | false }` to set or suppress the title.",
      oneOf: [
        { type: "boolean" },
        {
          type: "object",
          properties: {
            x: { $ref: "#/$defs/AxisOption" },
            y: { $ref: "#/$defs/AxisOption" },
          },
        },
      ],
    },
    AxisOption: {
      oneOf: [
        { type: "boolean" },
        {
          type: "object",
          properties: {
            title: {
              oneOf: [{ type: "string" }, { const: false }],
            },
          },
        },
      ],
    },
    FieldAccessor: {
      description:
        'Explicit field-accessor form, emitted by field(name, measure?). Optionally carries a chained pipeline (ops) — field("site").sort("yield") or field("count").normalize(). Two disjoint slots consume ops: a `by` (grouping key) slot accepts the domain ops (sort/reverse/bin); a value (size/pos) channel slot accepts the aggregate ops (sum/mean/count/distinct) and, only on an operator\'s entry-flagged size channel, normalize.',
      type: "object",
      required: ["type", "name"],
      properties: {
        type: { const: "field" },
        name: { type: "string" },
        measure: {
          type: "string",
          description:
            "Optional unit annotation for the channel's underlying space (a type claim; see field(name, measure)).",
        },
        ops: {
          type: "array",
          items: { $ref: "#/$defs/FieldOpIR" },
        },
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
              items: { oneOf: [{ type: "string" }, { type: "number" }] },
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
            thresholds: {
              oneOf: [
                { type: "number" },
                { type: "array", items: { type: "number" } },
              ],
            },
          },
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
        { $ref: "#/$defs/GotreeTreeIR" },
      ],
    },
    GotreeTreeIR: {
      description:
        "gotree-tree (issue #792): a serialized gotree hierarchy visualization. Reconstructed via an injected markBridges entry (gofish-graphics never statically imports gofish-gotree). Row shape for field/lambda resolution at each hierarchy node: {...d.data (children key omitted), depth, height, width, value} — depth/height/width/value come from gotree's HierarchyDatum and OVERRIDE same-named data fields.",
      type: "object",
      required: ["type", "data"],
      properties: {
        type: { const: "gotree-tree" },
        data: { type: "object" },
        node: { $ref: "#/$defs/MarkIR" },
        link: { $ref: "#/$defs/GotreeLinkSpec" },
        parentChild: { $ref: "#/$defs/GotreeCombinerIR" },
        sibling: { $ref: "#/$defs/GotreeCombinerIR" },
        coord: { type: "object" },
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    GotreeLinkOptionsIR: {
      type: "object",
      properties: {
        curve: { enum: ["straight", "bezier", "orthogonal", "arc"] },
        stroke: { type: "string" },
        strokeWidth: { type: "number" },
        opacity: { type: "number" },
      },
    },
    GotreeLinkSpec: {
      description:
        '"none", a link-options object, or a {__gofish_lambda} sentinel — the lambda receives (srcRow, tgtRow) and returns a link-options dict, resolved eagerly at deserialize time.',
      oneOf: [
        { const: "none" },
        { $ref: "#/$defs/GotreeLinkOptionsIR" },
        {
          type: "object",
          required: ["__gofish_lambda"],
          properties: { __gofish_lambda: { type: "string" } },
        },
      ],
    },
    GotreeCombinerIR: {
      description:
        "Mirrors gofish-gotree's SpreadOptions/DistributeOptions/NestOptions/CombineOptions (helpers.ts) and its depth-indexed alternate(...). `options` bags are unvalidated here (the real helpers own their own opts), like other combinator options elsewhere in this schema.",
      oneOf: [
        {
          type: "object",
          required: ["kind", "options"],
          properties: {
            kind: { enum: ["spread", "distribute", "nest", "combine"] },
            options: { type: "object" },
          },
        },
        {
          type: "object",
          required: ["kind", "combiners"],
          properties: {
            kind: { const: "alternate" },
            combiners: {
              type: "array",
              items: { $ref: "#/$defs/GotreeCombinerIR" },
            },
          },
        },
      ],
    },
    OffsetMarkIR: {
      description:
        "Shift a single child by (x, y) render-pixels without moving the bounds it advertises to its parent. Maps to the public `offset` operator.",
      type: "object",
      required: ["type", "children"],
      properties: {
        type: { const: "offset" },
        x: { type: "number" },
        y: { type: "number" },
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
        "Slice a single `source` mark into N clipped sub-shapes along `dir`. As a chart `.mark(...)` spec it deserializes to the v3 expand-mark form; as a combinator child it expands in place into its N slice nodes. `size` is a field-name string (expand form) or an array of absolute-pixel numbers / datum() flex-weight wrappers; omitted means equal slices.",
      type: "object",
      required: ["type", "source", "dir"],
      properties: {
        type: { const: "cut" },
        source: { $ref: "#/$defs/MarkIR" },
        dir: { enum: ["x", "y"] },
        size: { $ref: "#/$defs/CutSize" },
        inset: { type: "number" },
        name: { type: "string" },
        zOrder: { type: "number" },
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
              { type: "number" },
              {
                type: "object",
                required: ["type", "datum"],
                properties: {
                  type: { const: "datum" },
                  datum: {},
                  measure: { type: "string" },
                  offset: { type: "number" },
                  colorOps: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["op", "amount"],
                      properties: {
                        op: { enum: ["lighten", "darken"] },
                        amount: { type: "number" },
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
        constraints: {
          type: "array",
          items: { $ref: "#/$defs/ConstraintIR" },
        },
        zOrder: { type: "number" },
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
              items: { oneOf: [{ type: "string" }, { type: "number" }] },
            },
          ],
        },
        name: { type: "string" },
        label: { $ref: "#/$defs/LabelIR" },
        zOrder: { type: "number" },
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
              position: { type: "string" },
              fontSize: { type: "number" },
              color: { type: "string" },
              offset: { type: "number" },
              rotate: { type: "number" },
              fontFamily: { type: "string" },
              fontWeight: {
                oneOf: [{ type: "number" }, { type: "string" }],
              },
              fontStyle: { type: "string" },
            },
          },
        },
      ],
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
        { type: "number" },
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
            measure: { type: "string" },
            offset: {
              type: "number",
              description:
                "Pixel offset applied after the datum maps through its scale (datum(v) + px).",
            },
          },
        },
        {
          type: "object",
          required: ["__gofish_lambda"],
          properties: { __gofish_lambda: { type: "string" } },
        },
      ],
    },
    ...GENERATED_DEFS,
  },
};
