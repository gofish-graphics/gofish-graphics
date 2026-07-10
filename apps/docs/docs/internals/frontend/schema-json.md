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
        },
        {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": {
              "const": "previous-tier"
            }
          },
          "description": "An empty chart() scope inside a .layer(...) chain: inherit the immediately preceding tier's marks. Only valid on a tier inside a builder:true LayerIR."
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
          "description": "Layer tiers. Each is a ChartIR; the v3 chart(...).layer(mark) builder chain may also include a RawMarkIR tier (a component-level, datumless annotation overlay).",
          "items": {
            "oneOf": [
              {
                "$ref": "#/$defs/ChartIR"
              },
              {
                "$ref": "#/$defs/RawMarkIR"
              }
            ]
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
        "builder": {
          "type": "boolean",
          "description": "True when this came from the v3 chart(...).layer(...) builder chain (not the low-level layer([...]) combinator). The deserializer reconstructs it through the real LayerBuilder so JS owns the builder's render logic (inferred axis titles, etc.)."
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
    "FieldAccessor": {
      "description": "Explicit field-accessor form, emitted by field(name, measure?). Optionally carries a chained pipeline (ops) — field(\"site\").sort(\"yield\") or field(\"count\").normalize(). Two disjoint slots consume ops: a `by` (grouping key) slot accepts the domain ops (sort/reverse/bin); a value (size/pos) channel slot accepts the aggregate ops (sum/mean/count/distinct) and, only on an operator's entry-flagged size channel, normalize.",
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
        },
        "ops": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/FieldOpIR"
          }
        }
      }
    },
    "FieldOpIR": {
      "description": "One op in a field(...) pipeline. Mirrors gofish-graphics' FieldOp (ast/fieldExpr.ts) exactly.",
      "oneOf": [
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "sort"
            },
            "by": {
              "type": "string"
            },
            "order": {
              "enum": ["asc", "desc"]
            },
            "values": {
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
              },
              "description": "Explicit group order (#735), e.g. sort([\"sun\", \"fog\", ...]). Mutually exclusive with by/order. Groups whose key isn't in this list are appended after, in natural sort order."
            }
          }
        },
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "reverse"
            }
          }
        },
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "bin"
            },
            "thresholds": {
              "oneOf": [
                {
                  "type": "number"
                },
                {
                  "type": "array",
                  "items": {
                    "type": "number"
                  }
                }
              ]
            }
          }
        },
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "normalize"
            }
          }
        },
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "sum"
            }
          }
        },
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "mean"
            }
          }
        },
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "count"
            }
          }
        },
        {
          "type": "object",
          "required": ["op"],
          "properties": {
            "op": {
              "const": "distinct"
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
            "enclose",
            "arrow",
            "line",
            "ribbon",
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
        "debug": {
          "type": "boolean"
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
          "$ref": "#/$defs/FieldAccessor"
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
    },
    "DeriveOperator": {
      "description": "Opaque user transformation (`derive(fn)`). Function bodies aren't serializable; the IR carries a bridge handle when the Python widget is the producer.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "derive"
        },
        "lambdaId": {
          "type": "string",
          "description": "Python-bridge handle for the remote callable."
        },
        "provenance": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          },
          "description": "Measure provenance a transform (e.g. bin) declares for its output columns — output field name → measure."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "ResolveOperator": {
      "description": "Dereference reference columns into the drawn nodes they name (`resolve(cols, { from, key? })`).",
      "type": "object",
      "required": ["type", "cols"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "resolve"
        },
        "cols": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Local columns holding references to resolve in place."
        },
        "from": {
          "type": "string",
          "description": "Layer name whose nodes the columns are resolved against (a selectAll)."
        },
        "key": {
          "type": "string",
          "description": "Explicit match field; defaults to the producing operator's `by`."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "JoinOperator": {
      "description": "One-to-many equi-join of the incoming rows against an inlined `right` table on a shared `on` key.",
      "type": "object",
      "required": ["type", "on", "right"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "join"
        },
        "on": {
          "type": "string",
          "description": "Shared key field matched between the incoming rows and `right`."
        },
        "right": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {}
          },
          "description": "The right-hand table, inlined as JSON rows."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "SpreadOperator": {
      "description": "Arrange children along `dir` with spacing, aligning them on the cross axis.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "spread"
        },
        "by": {
          "oneOf": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/FieldAccessor"
            }
          ],
          "description": "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin)."
        },
        "dir": {
          "enum": ["x", "y"],
          "description": "Direction to spread along."
        },
        "spacing": {
          "type": "number",
          "description": "Gap between children, px.",
          "default": 8
        },
        "alignment": {
          "type": "string",
          "description": "Cross-axis alignment (\"start\" | \"middle\" | \"end\" | \"baseline\").",
          "default": "baseline"
        },
        "sharedScale": {
          "type": "boolean",
          "default": false
        },
        "mode": {
          "enum": ["edge", "center"],
          "default": "edge"
        },
        "reverse": {
          "type": "boolean",
          "default": false
        },
        "glue": {
          "type": "boolean",
          "description": "Stack semantics: children glued, sizes sum; spacing forced to 0.",
          "default": false
        },
        "axes": {
          "$ref": "#/$defs/AxesOptions"
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Data-driven cross-axis extent (field/datum-sized children)."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Data-driven cross-axis extent (field/datum-sized children)."
        },
        "size": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Per-entry stack-axis extent (field/datum-sized children); a field(...).normalize() accessor makes it a space-filling spine."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "StackOperator": {
      "description": "`spread({ glue: true })` under its own wire tag — children glued together (touching, no gaps).",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "stack"
        },
        "by": {
          "oneOf": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/FieldAccessor"
            }
          ],
          "description": "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin)."
        },
        "dir": {
          "enum": ["x", "y"],
          "description": "Direction to stack along."
        },
        "spacing": {
          "type": "number",
          "description": "Forwarded to the underlying spread. Glue semantics force the effective gap to 0; accepted for spread-parity."
        },
        "glue": {
          "type": "boolean",
          "description": "Spread-parity passthrough; stack always glues regardless."
        },
        "alignment": {
          "type": "string",
          "default": "baseline"
        },
        "sharedScale": {
          "type": "boolean",
          "default": false
        },
        "mode": {
          "enum": ["edge", "center"],
          "default": "edge"
        },
        "reverse": {
          "type": "boolean",
          "default": false
        },
        "axes": {
          "$ref": "#/$defs/AxesOptions"
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Data-driven cross-axis extent (field/datum-sized children)."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Data-driven cross-axis extent (field/datum-sized children)."
        },
        "size": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Per-entry stack-axis extent (field/datum-sized children); a field(...).normalize() accessor makes it a space-filling spine."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "GroupOperator": {
      "description": "Partition rows by `by` into a flat `Frame` (no layout beyond grouping).",
      "type": "object",
      "required": ["type", "by"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "group"
        },
        "by": {
          "oneOf": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/FieldAccessor"
            }
          ],
          "description": "Field to group rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin)."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "ScatterOperator": {
      "description": "Position each child at an explicit (x, y) point or [min, max] span in data space.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "scatter"
        },
        "by": {
          "oneOf": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/FieldAccessor"
            }
          ],
          "description": "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin)."
        },
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Point position, x."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Point position, y."
        },
        "xMin": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Range form: left/bottom edge, x."
        },
        "xMax": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Range form: right/top edge, x."
        },
        "yMin": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Range form: left/bottom edge, y."
        },
        "yMax": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Range form: right/top edge, y."
        },
        "alignment": {
          "type": "string",
          "description": "Cross-axis alignment for the axis without an explicit position.",
          "default": "baseline"
        },
        "axes": {
          "$ref": "#/$defs/AxesOptions"
        },
        "w": {
          "$ref": "#/$defs/ChannelValue"
        },
        "h": {
          "$ref": "#/$defs/ChannelValue"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "TableOperator": {
      "description": "Arrange cells in a `numCols`-wide grid (or a `{x, y}` keyed grid via `by`).",
      "type": "object",
      "required": ["type", "by"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "table"
        },
        "by": {
          "type": "object",
          "properties": {
            "x": {
              "type": "string"
            },
            "y": {
              "type": "string"
            }
          },
          "required": ["x", "y"],
          "description": "Grouping fields for the column/row keys — the table operator can't run without both."
        },
        "spacing": {
          "oneOf": [
            {
              "type": "number"
            },
            {
              "type": "array",
              "minItems": 2,
              "maxItems": 2,
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ]
            }
          ],
          "description": "Cell gap: a single number for both axes, or [x, y].",
          "default": 0
        },
        "numCols": {
          "type": "number",
          "description": "Explicit column count (falls back to the number of distinct column keys)."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "LogOperator": {
      "description": "Debug pass-through: logs each row (optionally under `label`) and forwards it unchanged.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "log"
        },
        "label": {
          "type": "string",
          "description": "Console label prefix."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "TreemapOperator": {
      "description": "d3-hierarchy treemap layout over the flow's rows, fare/weight-proportional.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "treemap"
        },
        "w": {
          "$ref": "#/$defs/ChannelValue"
        },
        "h": {
          "$ref": "#/$defs/ChannelValue"
        },
        "paddingInner": {
          "type": "number",
          "default": 0
        },
        "paddingOuter": {
          "type": "number",
          "default": 0
        },
        "round": {
          "type": "boolean",
          "default": true
        },
        "tile": {
          "enum": [
            "squarify",
            "slice",
            "dice",
            "binary",
            "slicedice",
            "squarifyCircle"
          ],
          "default": "squarify"
        },
        "sort": {
          "enum": ["asc", "desc", "none"],
          "default": "desc"
        },
        "valueField": {
          "type": "string",
          "description": "Field summed per row to weight the tile size."
        },
        "flipY": {
          "type": "boolean",
          "description": "Mirror leaf layout top-to-bottom within the treemap box.",
          "default": false
        },
        "leafIntrinsicRadiusField": {
          "type": "string",
          "description": "When set, each leaf is laid out in a square of side min(leafW, leafH, 2*datum[field])."
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        },
        "origin": {
          "$ref": "#/$defs/Origin"
        },
        "meta": {
          "$ref": "#/$defs/Meta"
        },
        "debug": {
          "type": "boolean"
        }
      }
    },
    "OperatorIR": {
      "description": "A pipeline operator — a discriminated union, one member per operator type. See validate.ts and schema.ts for the same field shapes.",
      "oneOf": [
        {
          "$ref": "#/$defs/DeriveOperator"
        },
        {
          "$ref": "#/$defs/ResolveOperator"
        },
        {
          "$ref": "#/$defs/JoinOperator"
        },
        {
          "$ref": "#/$defs/SpreadOperator"
        },
        {
          "$ref": "#/$defs/StackOperator"
        },
        {
          "$ref": "#/$defs/GroupOperator"
        },
        {
          "$ref": "#/$defs/ScatterOperator"
        },
        {
          "$ref": "#/$defs/TableOperator"
        },
        {
          "$ref": "#/$defs/LogOperator"
        },
        {
          "$ref": "#/$defs/TreemapOperator"
        }
      ]
    },
    "RectMark": {
      "description": "A rectangle. Box geometry via the shared dims channels.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "rect"
        },
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge position."
        },
        "cx": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center x."
        },
        "x2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Right edge position."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width."
        },
        "emX": {
          "type": "boolean",
          "description": "Embed x in the parent's x space."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Top/bottom edge position (y-up: bottom)."
        },
        "cy": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center y."
        },
        "y2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Other y edge position."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height."
        },
        "emY": {
          "type": "boolean",
          "description": "Embed y in the parent's y space."
        },
        "theta": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular position alias (polar coord's x)."
        },
        "thetaSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular extent alias (polar coord's w)."
        },
        "r": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial position alias (polar coord's y)."
        },
        "rSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial extent alias (polar coord's h)."
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color, or a field name for a color scale."
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color. Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number",
          "default": 0
        },
        "opacity": {
          "type": "number",
          "default": 1
        },
        "filter": {
          "type": "string",
          "description": "Raw SVG filter attribute."
        },
        "key": {
          "type": "string",
          "description": "Internal per-node key override."
        },
        "rx": {
          "type": "number",
          "description": "Corner radius, x.",
          "default": 0
        },
        "ry": {
          "type": "number",
          "description": "Corner radius, y.",
          "default": 0
        },
        "aspectRatio": {
          "type": "number",
          "description": "w/h ratio to enforce; the constraining axis wins when both are data-driven."
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
        },
        "debug": {
          "type": "boolean"
        },
        "name": {
          "type": "string"
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
    "CircleMark": {
      "description": "A circle, drawn as an aspect-locked ellipse. Does NOT support the boxDims positioning channels directly (JS `circle()` in marks/chart.ts destructures only r/fill/stroke/strokeWidth/label) — position it via `spread`/`scatter`.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "circle"
        },
        "r": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radius; becomes w=h=2r on the underlying ellipse."
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue"
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number"
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
        },
        "debug": {
          "type": "boolean"
        },
        "name": {
          "type": "string"
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
    "EllipseMark": {
      "description": "An ellipse. Box geometry via the shared dims channels; paint is a strict subset of `paint` (no filter).",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "ellipse"
        },
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge position."
        },
        "cx": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center x."
        },
        "x2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Right edge position."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width."
        },
        "emX": {
          "type": "boolean",
          "description": "Embed x in the parent's x space."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Top/bottom edge position (y-up: bottom)."
        },
        "cy": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center y."
        },
        "y2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Other y edge position."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height."
        },
        "emY": {
          "type": "boolean",
          "description": "Embed y in the parent's y space."
        },
        "theta": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular position alias (polar coord's x)."
        },
        "thetaSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular extent alias (polar coord's w)."
        },
        "r": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial position alias (polar coord's y)."
        },
        "rSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial extent alias (polar coord's h)."
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue"
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number"
        },
        "opacity": {
          "type": "number",
          "default": 1
        },
        "aspectRatio": {
          "type": "number",
          "description": "w/h ratio to enforce. When both dims are data-driven, the constraining axis is used."
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
        },
        "debug": {
          "type": "boolean"
        },
        "name": {
          "type": "string"
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
    "PetalMark": {
      "description": "A polar-only wedge/petal shape (Petal.tsx). Box geometry via the shared dims channels.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "petal"
        },
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge position."
        },
        "cx": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center x."
        },
        "x2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Right edge position."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width."
        },
        "emX": {
          "type": "boolean",
          "description": "Embed x in the parent's x space."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Top/bottom edge position (y-up: bottom)."
        },
        "cy": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center y."
        },
        "y2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Other y edge position."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height."
        },
        "emY": {
          "type": "boolean",
          "description": "Embed y in the parent's y space."
        },
        "theta": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular position alias (polar coord's x)."
        },
        "thetaSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular extent alias (polar coord's w)."
        },
        "r": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial position alias (polar coord's y)."
        },
        "rSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial extent alias (polar coord's h)."
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue"
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number"
        },
        "debug": {
          "type": "boolean"
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
    "TextMark": {
      "description": "A text label. Box geometry via the shared dims channels positions the text anchor.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "text"
        },
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge position."
        },
        "cx": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center x."
        },
        "x2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Right edge position."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width."
        },
        "emX": {
          "type": "boolean",
          "description": "Embed x in the parent's x space."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Top/bottom edge position (y-up: bottom)."
        },
        "cy": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center y."
        },
        "y2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Other y edge position."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height."
        },
        "emY": {
          "type": "boolean",
          "description": "Embed y in the parent's y space."
        },
        "theta": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular position alias (polar coord's x)."
        },
        "thetaSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular extent alias (polar coord's w)."
        },
        "r": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial position alias (polar coord's y)."
        },
        "rSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial extent alias (polar coord's h)."
        },
        "key": {
          "type": "string",
          "description": "Internal per-node key override."
        },
        "text": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Text content (raw channel — a literal, field name, or accessor)."
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue"
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue"
        },
        "strokeWidth": {
          "type": "number"
        },
        "filter": {
          "type": "string",
          "description": "Raw SVG filter attribute."
        },
        "fontSize": {
          "type": "number",
          "default": 12
        },
        "fontFamily": {
          "type": "string",
          "default": "system-ui, sans-serif"
        },
        "fontStyle": {
          "type": "string",
          "description": "Raw CSS font-style (e.g. \"italic\")."
        },
        "fontWeight": {
          "oneOf": [
            {
              "type": "number"
            },
            {
              "type": "string"
            }
          ],
          "description": "CSS font-weight (e.g. 300, 700, \"bold\")."
        },
        "debugBoundingBox": {
          "type": "boolean",
          "default": false
        },
        "rotate": {
          "type": "number",
          "description": "Rotation in degrees, applied in the chart's y-up world frame about the text anchor.",
          "default": 0
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
        "debug": {
          "type": "boolean"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "ImageMark": {
      "description": "An embedded raster/SVG image. Box geometry via the shared dims channels.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "image"
        },
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge position."
        },
        "cx": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center x."
        },
        "x2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Right edge position."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width."
        },
        "emX": {
          "type": "boolean",
          "description": "Embed x in the parent's x space."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Top/bottom edge position (y-up: bottom)."
        },
        "cy": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center y."
        },
        "y2": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Other y edge position."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height."
        },
        "emY": {
          "type": "boolean",
          "description": "Embed y in the parent's y space."
        },
        "theta": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular position alias (polar coord's x)."
        },
        "thetaSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Angular extent alias (polar coord's w)."
        },
        "r": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial position alias (polar coord's y)."
        },
        "rSize": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radial extent alias (polar coord's h)."
        },
        "key": {
          "type": "string",
          "description": "Internal per-node key override."
        },
        "href": {
          "type": "string",
          "description": "Image URL or data URI."
        },
        "filter": {
          "type": "string",
          "description": "Raw SVG filter attribute."
        },
        "opacity": {
          "type": "number"
        },
        "preserveAspectRatio": {
          "type": "string",
          "default": "xMidYMid meet"
        },
        "debug": {
          "type": "boolean"
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
    "PolygonMark": {
      "description": "A closed polygon defined by explicit local-coordinate points (y-up). No dims channels — the bbox is computed from `points`.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "polygon"
        },
        "points": {
          "type": "array",
          "items": {
            "type": "array",
            "minItems": 2,
            "maxItems": 2,
            "prefixItems": [
              {
                "type": "number"
              },
              {
                "type": "number"
              }
            ]
          },
          "description": "Vertex list, at least 3 points."
        },
        "fill": {
          "type": "string",
          "default": "black"
        },
        "stroke": {
          "type": "string",
          "description": "Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number"
        },
        "opacity": {
          "type": "number",
          "default": 1
        },
        "debug": {
          "type": "boolean"
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
    "BlankMark": {
      "description": "An invisible sizing/positioning guide — a transparent rect with a restricted channel set (no x/y/cx/cy/x2/y2/theta/r — position it via a layout operator).",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "blank"
        },
        "emX": {
          "type": "boolean"
        },
        "emY": {
          "type": "boolean"
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "default": 0
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "default": 0
        },
        "rx": {
          "type": "number"
        },
        "ry": {
          "type": "number"
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue"
        },
        "stroke": {
          "type": "string"
        },
        "strokeWidth": {
          "type": "number"
        },
        "debug": {
          "type": "boolean"
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
    "LineMark": {
      "description": "Center-mode connector — the path between the centers of consecutive marks (the drop-in for the removed `connect`). Bag form over a ref array, or pairwise `{from, to}` form over rows with two ref columns.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "line"
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue"
        },
        "stroke": {
          "type": "string"
        },
        "strokeWidth": {
          "type": "number"
        },
        "strokeDasharray": {
          "type": "string",
          "description": "Raw SVG stroke-dasharray (e.g. \"12\") for a dashed line."
        },
        "opacity": {
          "type": "number"
        },
        "mixBlendMode": {
          "enum": ["normal", "multiply"]
        },
        "curve": {
          "description": "Screen-space path shape: a factory call (straight()/bezier()/catmullRom()/orthogonal()/arc({direction})/perfectArrows({bow})/...) or a bare name. Omitted = \"auto\" (catmullRom on a homogeneous continuous connection axis, else straight)."
        },
        "dir": {
          "enum": ["x", "y"]
        },
        "source": {
          "description": "Anchor-mode start point: a normalized [fx, fy] on the mark's bbox, or a start/middle/end keyword."
        },
        "target": {
          "description": "Anchor-mode end point; see `source`."
        },
        "from": {
          "type": "string",
          "description": "Pairwise form: column holding the source ref."
        },
        "to": {
          "type": "string",
          "description": "Pairwise form: column holding the target ref."
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
        "debug": {
          "type": "boolean"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "RibbonMark": {
      "description": "Edge-mode connector — a filled band between the facing edges of consecutive marks (areas, streamgraphs, sankey ribbons).",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "ribbon"
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue"
        },
        "stroke": {
          "type": "string"
        },
        "strokeWidth": {
          "type": "number",
          "default": 0
        },
        "opacity": {
          "type": "number"
        },
        "mixBlendMode": {
          "enum": ["normal", "multiply"],
          "default": "normal"
        },
        "dir": {
          "enum": ["x", "y"]
        },
        "curve": {
          "description": "Screen-space band-edge shape (straight() | bezier()). Omitted = \"auto\" (bezier)."
        },
        "from": {
          "type": "string"
        },
        "to": {
          "type": "string"
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
        "debug": {
          "type": "boolean"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "MarkFnMark": {
      "description": "Python-bridge: a registered `(data) -> ChartBuilder` lambda, resolved via the bridge.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "mark-fn"
        },
        "lambdaId": {
          "type": "string"
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
        "debug": {
          "type": "boolean"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "LeafMarkIR": {
      "oneOf": [
        {
          "$ref": "#/$defs/RectMark"
        },
        {
          "$ref": "#/$defs/CircleMark"
        },
        {
          "$ref": "#/$defs/EllipseMark"
        },
        {
          "$ref": "#/$defs/PetalMark"
        },
        {
          "$ref": "#/$defs/TextMark"
        },
        {
          "$ref": "#/$defs/ImageMark"
        },
        {
          "$ref": "#/$defs/PolygonMark"
        },
        {
          "$ref": "#/$defs/BlankMark"
        },
        {
          "$ref": "#/$defs/LineMark"
        },
        {
          "$ref": "#/$defs/RibbonMark"
        },
        {
          "$ref": "#/$defs/MarkFnMark"
        }
      ]
    }
  }
}
```
