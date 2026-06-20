---
title: Full JSON Schema
section: JSON Formats
group: Frontend
order: 30
status: draft
---

# Frontend IR — Full JSON Schema

The canonical JSON Schema (Draft 2020-12) for the v0 Frontend IR. This
page is regenerated from
[`packages/gofish-ir/src/frontend/jsonSchema.ts`](https://github.com/gofish-graphics/gofish-graphics/blob/main/packages/gofish-ir/src/frontend/jsonSchema.ts)
by `apps/docs/scripts/sync-ir-schema.mjs`; `pnpm --filter docs
check-ir-schema` runs in CI to catch drift. The published build
artifact lives at `packages/gofish-ir/dist/frontend/v0.json` and at
the public URL `https://gofish.graphics/schema/frontend/v0.json`.

See [Frontend IR (Serialization)](/internals/frontend/serialization)
for the design discussion and [Using the Frontend IR](/internals/frontend/serialization-api)
for the API.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://gofish.graphics/schema/frontend/v0.json",
  "title": "GoFish Frontend IR",
  "description": "Source-level chart specification produced by the v3 fluent API.",
  "type": "object",
  "required": ["irVersion", "ir", "root"],
  "additionalProperties": false,
  "properties": {
    "irVersion": {
      "const": 0
    },
    "ir": {
      "const": "gofish-frontend"
    },
    "$schema": {
      "type": "string"
    },
    "root": {
      "$ref": "#/$defs/Root"
    }
  },
  "$defs": {
    "Root": {
      "oneOf": [
        {
          "$ref": "#/$defs/ChartIR"
        },
        {
          "$ref": "#/$defs/LayerIR"
        },
        {
          "$ref": "#/$defs/RawMarkIR"
        }
      ]
    },
    "Origin": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "stack": {
          "type": "string"
        }
      }
    },
    "Meta": {
      "type": "object",
      "description": "Optional inline annotations populated by later passes. v0 emitters leave it absent."
    },
    "DataIR": {
      "oneOf": [
        {
          "type": "object",
          "required": ["type", "rows"],
          "properties": {
            "type": {
              "const": "inline"
            },
            "rows": {
              "type": "array",
              "items": {
                "type": "object"
              }
            }
          }
        },
        {
          "type": "object",
          "required": ["type", "layer"],
          "properties": {
            "type": {
              "const": "select"
            },
            "layer": {
              "type": "string"
            },
            "mode": {
              "enum": ["one", "all"]
            }
          }
        },
        {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": {
              "const": "external"
            },
            "id": {
              "type": "string"
            }
          }
        }
      ]
    },
    "ChartIR": {
      "type": "object",
      "required": ["type", "mark"],
      "properties": {
        "type": {
          "const": "chart"
        },
        "data": {
          "oneOf": [
            {
              "$ref": "#/$defs/DataIR"
            },
            {
              "type": "null"
            }
          ]
        },
        "operators": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/OperatorIR"
          }
        },
        "mark": {
          "$ref": "#/$defs/MarkIR"
        },
        "options": {
          "type": "object"
        },
        "zOrder": {
          "type": "number"
        },
        "connect": {
          "$ref": "#/$defs/MarkIR"
        },
        "name": {
          "type": "string",
          "description": "Chart-level name so a sibling Layer constrain callback can reference this chart."
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        }
      }
    },
    "LayerIR": {
      "type": "object",
      "required": ["type", "charts"],
      "properties": {
        "type": {
          "const": "layer"
        },
        "charts": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ChartIR"
          }
        },
        "options": {
          "type": "object"
        },
        "constraints": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ConstraintIR"
          },
          "description": "Layer-level constraints (Layer([...]).constrain(...)), resolving refs against the child charts' names."
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        }
      }
    },
    "RawMarkIR": {
      "type": "object",
      "required": ["type", "mark"],
      "properties": {
        "type": {
          "const": "raw-mark"
        },
        "mark": {
          "$ref": "#/$defs/MarkIR"
        },
        "options": {
          "type": "object"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        }
      }
    },
    "OperatorIR": {
      "type": "object",
      "description": "A pipeline operator. Field coverage is open at the schema level (`additionalProperties` is permitted) — see validate.ts and schema.ts for per-type field shapes. `spread`, `stack`, and `scatter` accept an `axes` property of shape `AxesOptions`; operators may carry structural `translate` metadata.",
      "required": ["type"],
      "properties": {
        "type": {
          "enum": [
            "derive",
            "spread",
            "stack",
            "group",
            "scatter",
            "table",
            "log"
          ]
        },
        "axes": {
          "$ref": "#/$defs/AxesOptions"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "w": {
          "$ref": "#/$defs/ChannelValue"
        },
        "h": {
          "$ref": "#/$defs/ChannelValue"
        }
      }
    },
    "Translate": {
      "description": "Structural pixel translation reapplied by the runtime deserializer.",
      "type": "object",
      "properties": {
        "x": {
          "type": "number"
        },
        "y": {
          "type": "number"
        }
      }
    },
    "AxesOptions": {
      "description": "Per-node axis-rendering override. Boolean toggles both dimensions; object form lets x and y differ. Each `AxisOption` is `true`/`false`, or `{ title?: string | false }` to set or suppress the title.",
      "oneOf": [
        {
          "type": "boolean"
        },
        {
          "type": "object",
          "properties": {
            "x": {
              "$ref": "#/$defs/AxisOption"
            },
            "y": {
              "$ref": "#/$defs/AxisOption"
            }
          }
        }
      ]
    },
    "AxisOption": {
      "oneOf": [
        {
          "type": "boolean"
        },
        {
          "type": "object",
          "properties": {
            "title": {
              "oneOf": [
                {
                  "type": "string"
                },
                {
                  "const": false
                }
              ]
            }
          }
        }
      ]
    },
    "MarkIR": {
      "oneOf": [
        {
          "$ref": "#/$defs/LeafMarkIR"
        },
        {
          "$ref": "#/$defs/CombinatorMarkIR"
        },
        {
          "$ref": "#/$defs/RefMarkIR"
        },
        {
          "$ref": "#/$defs/OffsetMarkIR"
        },
        {
          "$ref": "#/$defs/CutMarkIR"
        }
      ]
    },
    "OffsetMarkIR": {
      "description": "Shift a single child by (x, y) render-pixels without moving the bounds it advertises to its parent. Maps to the public `offset` operator.",
      "type": "object",
      "required": ["type", "children"],
      "properties": {
        "type": {
          "const": "offset"
        },
        "x": {
          "type": "number"
        },
        "y": {
          "type": "number"
        },
        "children": {
          "type": "array",
          "minItems": 1,
          "maxItems": 1,
          "items": {
            "$ref": "#/$defs/MarkIR"
          }
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        }
      }
    },
    "CutMarkIR": {
      "description": "Slice a single `source` mark into N clipped sub-shapes along `dir`. As a chart `.mark(...)` spec it deserializes to the v3 expand-mark form; as a combinator child it expands in place into its N slice nodes. `size` is a field-name string (expand form) or an array of absolute-pixel numbers / datum() flex-weight wrappers; omitted means equal slices.",
      "type": "object",
      "required": ["type", "source", "dir"],
      "properties": {
        "type": {
          "const": "cut"
        },
        "source": {
          "$ref": "#/$defs/MarkIR"
        },
        "dir": {
          "enum": ["x", "y"]
        },
        "size": {
          "$ref": "#/$defs/CutSize"
        },
        "inset": {
          "type": "number"
        },
        "name": {
          "type": "string"
        },
        "zOrder": {
          "type": "number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        }
      }
    },
    "CutSize": {
      "description": "cut slice extents: a field-name string (expand-mark form) or an array of raw numbers (absolute source pixels) and datum() wrappers (relative flex weights).",
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "number"
              },
              {
                "type": "object",
                "required": ["type", "datum"],
                "properties": {
                  "type": {
                    "const": "datum"
                  },
                  "datum": {},
                  "measure": {
                    "type": "string"
                  },
                  "offset": {
                    "type": "number"
                  },
                  "colorOps": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["op", "amount"],
                      "properties": {
                        "op": {
                          "enum": ["lighten", "darken"]
                        },
                        "amount": {
                          "type": "number"
                        }
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    },
    "LeafMarkIR": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "enum": [
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
            "mark-fn"
          ]
        },
        "name": {
          "type": "string"
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
        },
        "constraints": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ConstraintIR"
          }
        },
        "zOrder": {
          "type": "number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "CombinatorMarkIR": {
      "type": "object",
      "required": ["type", "__combinator", "children"],
      "properties": {
        "type": {
          "enum": [
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
            "mask"
          ]
        },
        "__combinator": {
          "const": true
        },
        "options": {
          "type": "object"
        },
        "children": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/MarkIR"
          }
        },
        "name": {
          "type": "string"
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
        },
        "constraints": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ConstraintIR"
          }
        },
        "zOrder": {
          "type": "number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "RefMarkIR": {
      "type": "object",
      "required": ["type", "selection"],
      "properties": {
        "type": {
          "const": "ref"
        },
        "selection": {
          "oneOf": [
            {
              "type": "string"
            },
            {
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            }
          ]
        },
        "name": {
          "type": "string"
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
        },
        "zOrder": {
          "type": "number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "LabelIR": {
      "oneOf": [
        {
          "type": "boolean"
        },
        {
          "type": "string"
        },
        {
          "type": "object",
          "required": ["accessor"],
          "properties": {
            "accessor": {
              "type": "string"
            },
            "position": {
              "type": "string"
            },
            "fontSize": {
              "type": "number"
            },
            "color": {
              "type": "string"
            },
            "offset": {
              "type": "number"
            },
            "minSpace": {
              "type": "number"
            },
            "rotate": {
              "type": "number"
            }
          }
        }
      ]
    },
    "ConstraintIR": {
      "type": "object",
      "required": ["type", "refs"],
      "properties": {
        "type": {
          "enum": [
            "align",
            "distribute",
            "position",
            "nest",
            "zAbove",
            "zBelow"
          ]
        },
        "options": {
          "type": "object"
        },
        "refs": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "ChannelValue": {
      "description": "Right-hand side of a channel slot. Bare primitives for the shorthand path; tagged objects for the explicit field/datum/literal constructors and Python-bridge sentinels.",
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "object",
          "required": ["type", "name"],
          "properties": {
            "type": {
              "const": "field"
            },
            "name": {
              "type": "string"
            },
            "measure": {
              "type": "string",
              "description": "Optional unit annotation for the channel's underlying space (a type claim; see field(name, measure))."
            }
          }
        },
        {
          "type": "object",
          "required": ["type", "value"],
          "properties": {
            "type": {
              "const": "literal"
            },
            "value": {}
          }
        },
        {
          "type": "object",
          "required": ["type", "datum"],
          "properties": {
            "type": {
              "const": "datum"
            },
            "datum": {},
            "measure": {
              "type": "string"
            },
            "offset": {
              "type": "number",
              "description": "Pixel offset applied after the datum maps through its scale (datum(v) + px)."
            }
          }
        },
        {
          "type": "object",
          "required": ["__gofish_lambda"],
          "properties": {
            "__gofish_lambda": {
              "type": "string"
            }
          }
        }
      ]
    }
  }
}
```
