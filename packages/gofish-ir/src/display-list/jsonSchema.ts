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
  },
} as const;

const BASE_PROPS = {
  style: { $ref: "#/$defs/Style" },
  datum: { type: "object" },
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
      ],
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
        textAnchor: { enum: ["start", "middle", "end"] },
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
        ...BASE_PROPS,
      },
    },
  },
} as const;
