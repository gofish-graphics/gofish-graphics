// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Hand-written JSON Schema for the GoFish frontend IR (v0).
 *
 * Structural only — defines the document shape, the discriminator unions
 * for operators / marks / channel values, and the validity envelope. Full
 * field-level coverage matches `validate.ts`; this file is the wire
 * artifact (consumed by external tooling, language servers, and the
 * Python wrapper's parity-test harness).
 */

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
        origin: { $ref: "#/$defs/Origin" },
        meta: { $ref: "#/$defs/Meta" },
      },
    },
    LayerIR: {
      type: "object",
      required: ["type", "charts"],
      properties: {
        type: { const: "layer" },
        charts: { type: "array", items: { $ref: "#/$defs/ChartIR" } },
        options: { type: "object" },
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
    OperatorIR: {
      type: "object",
      description:
        "A pipeline operator. Field coverage is open at the schema level (`additionalProperties` is permitted) — see validate.ts and schema.ts for per-type field shapes. `spread`, `stack`, and `scatter` accept an `axes` property of shape `AxesOptions`.",
      required: ["type"],
      properties: {
        type: {
          enum: [
            "derive",
            "spread",
            "stack",
            "group",
            "scatter",
            "table",
            "log",
          ],
        },
        axes: { $ref: "#/$defs/AxesOptions" },
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
    MarkIR: {
      oneOf: [
        { $ref: "#/$defs/LeafMarkIR" },
        { $ref: "#/$defs/CombinatorMarkIR" },
        { $ref: "#/$defs/RefMarkIR" },
      ],
    },
    LeafMarkIR: {
      type: "object",
      required: ["type"],
      properties: {
        type: {
          enum: [
            "rect",
            "circle",
            "line",
            "area",
            "blank",
            "ellipse",
            "petal",
            "text",
            "image",
            "polygon",
            "mark-fn",
          ],
        },
        name: { type: "string" },
        label: { $ref: "#/$defs/LabelIR" },
        constraints: {
          type: "array",
          items: { $ref: "#/$defs/ConstraintIR" },
        },
        zOrder: { type: "number" },
      },
    },
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
            "arrow",
            "connect",
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
      },
    },
    LabelIR: {
      // Three shapes: the canonical object form, a boolean shorthand
      // (`label: true` — let the mark shape decide what to label), and
      // a string shorthand (`label: "field"` — use this field accessor
      // with default styling). All three match `LabelIR` in schema.ts.
      oneOf: [
        { type: "boolean" },
        { type: "string" },
        {
          type: "object",
          required: ["accessor"],
          properties: {
            accessor: { type: "string" },
            position: { type: "string" },
            fontSize: { type: "number" },
            color: { type: "string" },
            offset: { type: "number" },
            minSpace: { type: "number" },
            rotate: { type: "number" },
          },
        },
      ],
    },
    ConstraintIR: {
      type: "object",
      required: ["type", "refs"],
      properties: {
        type: { enum: ["align", "distribute", "position", "zAbove", "zBelow"] },
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
        {
          type: "object",
          required: ["type", "name"],
          properties: {
            type: { const: "field" },
            name: { type: "string" },
          },
        },
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
  },
} as const;
