/**
 * Hand-written JSON Schema for the GoFish Display List IR.
 *
 * Structural mirror of the TS types in `schema.ts` and the runtime checks in
 * `validate.ts` — the three must agree. This is the wire artifact consumed by
 * external tooling / language servers / cross-runtime hosts.
 */

const STYLE = {
  type: "object",
  additionalProperties: false,
  properties: {
    fill: { type: "string" },
    stroke: { type: "string" },
    strokeWidth: { type: "number" },
    opacity: { type: "number" },
    fillOpacity: { type: "number" },
    mixBlendMode: { type: "string" },
    strokeDasharray: { type: "string" },
    filter: { type: "string" },
  },
} as const;

const BBOX = {
  type: "object",
  required: ["x", "y", "w", "h"],
  additionalProperties: false,
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
} as const;

const BASE_PROPS = {
  style: { $ref: "#/$defs/Style" },
  datum: {
    anyOf: [{ type: "object" }, { type: "array", items: { type: "object" } }],
  },
  role: { enum: ["node", "overlay"] },
  id: { type: "string" },
} as const;

export const DISPLAY_LIST_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://gofish.graphics/schema/display-list/v0.json",
  title: "GoFish Display List IR",
  description:
    "Viewport-baked, backend-agnostic list of positioned primitives — the output of GoFish's layout pass, just before backend emission.",
  type: "object",
  required: ["irVersion", "ir", "viewport", "items"],
  additionalProperties: false,
  properties: {
    irVersion: { const: 0 },
    ir: { const: "gofish-display-list" },
    $schema: { type: "string" },
    viewport: {
      type: "object",
      required: ["w", "h"],
      additionalProperties: false,
      properties: { w: { type: "number" }, h: { type: "number" } },
    },
    items: { type: "array", items: { $ref: "#/$defs/DisplayItem" } },
  },
  $defs: {
    Style: STYLE,
    DisplayItem: {
      oneOf: [
        { $ref: "#/$defs/RectItem" },
        { $ref: "#/$defs/EllipseItem" },
        { $ref: "#/$defs/PathItem" },
        { $ref: "#/$defs/TextItem" },
        { $ref: "#/$defs/ImageItem" },
        { $ref: "#/$defs/GroupItem" },
        { $ref: "#/$defs/CompositeItem" },
        { $ref: "#/$defs/MaskItem" },
      ],
    },
    GroupItem: {
      type: "object",
      required: ["kind", "transform", "children"],
      additionalProperties: false,
      properties: {
        kind: { const: "group" },
        transform: {
          type: "object",
          additionalProperties: false,
          properties: {
            translate: { type: "array", items: { type: "number" } },
            scale: { type: "array", items: { type: "number" } },
          },
        },
        children: { type: "array", items: { $ref: "#/$defs/DisplayItem" } },
        ...BASE_PROPS,
      },
    },
    RectItem: {
      type: "object",
      required: ["kind", "x", "y", "w", "h"],
      additionalProperties: false,
      properties: {
        kind: { const: "rect" },
        x: { type: "number" },
        y: { type: "number" },
        w: { type: "number" },
        h: { type: "number" },
        rx: { type: "number" },
        ry: { type: "number" },
        ...BASE_PROPS,
      },
    },
    EllipseItem: {
      type: "object",
      required: ["kind", "cx", "cy", "rx", "ry"],
      additionalProperties: false,
      properties: {
        kind: { const: "ellipse" },
        cx: { type: "number" },
        cy: { type: "number" },
        rx: { type: "number" },
        ry: { type: "number" },
        ...BASE_PROPS,
      },
    },
    PathItem: {
      type: "object",
      required: ["kind", "d"],
      additionalProperties: false,
      properties: {
        kind: { const: "path" },
        d: { type: "string" },
        ...BASE_PROPS,
      },
    },
    TextItem: {
      type: "object",
      required: ["kind", "x", "y", "text"],
      additionalProperties: false,
      properties: {
        kind: { const: "text" },
        x: { type: "number" },
        y: { type: "number" },
        text: { type: "string" },
        fontSize: { type: "number" },
        fontFamily: { type: "string" },
        textAnchor: { enum: ["start", "middle", "end"] },
        dominantBaseline: {
          enum: ["auto", "central", "middle", "hanging", "mathematical"],
        },
        rotate: { type: "number" },
        ...BASE_PROPS,
      },
    },
    ImageItem: {
      type: "object",
      required: ["kind", "x", "y", "w", "h", "href"],
      additionalProperties: false,
      properties: {
        kind: { const: "image" },
        x: { type: "number" },
        y: { type: "number" },
        w: { type: "number" },
        h: { type: "number" },
        href: { type: "string" },
        preserveAspectRatio: { type: "string" },
        ...BASE_PROPS,
      },
    },
    CompositeItem: {
      type: "object",
      required: ["kind", "operator", "bbox", "source", "dest"],
      additionalProperties: false,
      properties: {
        kind: { const: "composite" },
        operator: { enum: ["over", "atop", "in", "out", "xor"] },
        blendMode: { type: "string" },
        bbox: BBOX,
        source: { type: "array", items: { $ref: "#/$defs/DisplayItem" } },
        dest: { type: "array", items: { $ref: "#/$defs/DisplayItem" } },
        ...BASE_PROPS,
      },
    },
    MaskItem: {
      type: "object",
      required: ["kind", "bbox", "mask", "content"],
      additionalProperties: false,
      properties: {
        kind: { const: "mask" },
        bbox: BBOX,
        mask: { type: "array", items: { $ref: "#/$defs/DisplayItem" } },
        content: { type: "array", items: { $ref: "#/$defs/DisplayItem" } },
        ...BASE_PROPS,
      },
    },
  },
} as const;
