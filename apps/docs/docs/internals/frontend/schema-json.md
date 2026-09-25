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
  "description": "Source-level chart specification produced by the fluent chart API.",
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
          "description": "Layer tiers. Each is a ChartIR; the chart(...).layer(mark) builder chain may also include a RawMarkIR tier (a component-level, datumless annotation overlay).",
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
          "description": "True when this came from the chart(...).layer(...) builder chain (not the low-level layer([...]) combinator). The deserializer reconstructs it through the real LayerBuilder so JS owns the builder's render logic (inferred axis titles, etc.)."
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
              "const": "dropNulls"
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
      "description": "Slice a single `source` mark into N clipped sub-shapes along `dir`. As a chart `.mark(...)` spec it deserializes to the expand-mark form; as a combinator child it expands in place into its N slice nodes. `size` is a field-name string (expand form) or an array of absolute-pixel numbers / datum() flex-weight wrappers; omitted means equal slices.",
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
          "type": "array",
          "items": {
            "type": "object",
            "required": ["accessor"],
            "properties": {
              "accessor": {
                "oneOf": [
                  {
                    "type": "string"
                  },
                  {
                    "$ref": "#/$defs/FieldAccessor"
                  }
                ]
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
              "rotate": {
                "type": "number"
              },
              "fontFamily": {
                "type": "string"
              },
              "fontWeight": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "string"
                  }
                ]
              },
              "fontStyle": {
                "type": "string"
              }
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
        "label": {
          "$ref": "#/$defs/LabelIR"
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
          "description": "The `selectAll(layerName)` of a prior layer whose nodes the columns are matched against."
        },
        "key": {
          "type": "string",
          "description": "Explicit match field; defaults to the producing operator's `by`."
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
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
        "label": {
          "$ref": "#/$defs/LabelIR"
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
          "description": "Share one scale across all children.",
          "default": false
        },
        "anchor": {
          "enum": ["edge", "start", "middle", "end", "baseline"],
          "description": "Whether spacing is measured between facing edges (edge), or as a fixed pitch between the named anchor point on each child.",
          "default": "edge"
        },
        "reverse": {
          "type": "boolean",
          "description": "Reverse the children's order along dir.",
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
        "label": {
          "$ref": "#/$defs/LabelIR"
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
          "description": "Cross-axis alignment (\"start\" | \"middle\" | \"end\" | \"baseline\").",
          "default": "baseline"
        },
        "sharedScale": {
          "type": "boolean",
          "description": "Share one scale across all children.",
          "default": false
        },
        "anchor": {
          "enum": ["edge", "start", "middle", "end", "baseline"],
          "description": "Whether spacing is measured between facing edges (edge), or as a fixed pitch between the named anchor point on each child.",
          "default": "edge"
        },
        "reverse": {
          "type": "boolean",
          "description": "Reverse the children's order along dir.",
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
        "label": {
          "$ref": "#/$defs/LabelIR"
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
        "label": {
          "$ref": "#/$defs/LabelIR"
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
          "$ref": "#/$defs/ChannelValue",
          "description": "Fixed cross-axis extent, or a field name sizing this operator's own box from data."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Fixed cross-axis extent, or a field name sizing this operator's own box from data."
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
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
        "label": {
          "$ref": "#/$defs/LabelIR"
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
      "description": "Debug pass-through: logs each row (optionally under `prefix`) and forwards it unchanged.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "log"
        },
        "prefix": {
          "type": "string",
          "description": "Console prefix string."
        },
        "label": {
          "$ref": "#/$defs/LabelIR"
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
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge of the box the treemap tiles into, in the parent's space (pixels). Omitted, the parent places the treemap."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Top/bottom edge (y-up: bottom) of the box the treemap tiles into, in the parent's space (pixels). Omitted, the parent places the treemap."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
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
          "description": "Field to partition rows by (like spread/group); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls). Without `by`, one leaf is emitted per row."
        },
        "paddingInner": {
          "type": "number",
          "description": "Padding between sibling rectangles.",
          "default": 0
        },
        "paddingOuter": {
          "type": "number",
          "description": "Padding around the outer edge of the treemap.",
          "default": 0
        },
        "round": {
          "type": "boolean",
          "description": "Round pixel positions and sizes.",
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
          "description": "Tiling strategy.",
          "default": "squarify"
        },
        "sort": {
          "enum": ["asc", "desc", "none"],
          "description": "Sort leaves by weight before layout.",
          "default": "desc"
        },
        "size": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Per-leaf weight driving tile area (entry-flagged per split entry); a field name aggregates (sums by default) per group."
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
        "label": {
          "$ref": "#/$defs/LabelIR"
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
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "type": "number",
          "description": "Opacity, 0 to 1.",
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
    "CircleMark": {
      "description": "A circle, drawn as an aspect-locked ellipse. Does NOT support the boxDims positioning channels directly (JS `circle()` in marks/chart.ts destructures only r/fill/stroke/strokeWidth/opacity) — position it via `spread`/`scatter`.",
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
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color, or a field name for a color scale."
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color. Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "type": "number",
          "description": "Opacity, 0 to 1, applied to fill and stroke. In JS it may also be a per-datum accessor or a `live(...)` value; only a literal number crosses the wire.",
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
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color, or a field name for a color scale."
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color. Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "type": "number",
          "description": "Opacity, 0 to 1.",
          "default": 1
        },
        "aspectRatio": {
          "type": "number",
          "description": "w/h ratio to enforce. When both dims are data-driven, the constraining axis is used."
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
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color, or a field name for a color scale."
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color. Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Stroke width in pixels.",
          "default": 0
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
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color, or a field name for a color scale.",
          "default": "black"
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "filter": {
          "type": "string",
          "description": "Raw SVG filter attribute."
        },
        "fontSize": {
          "type": "number",
          "description": "Font size in pixels.",
          "default": 12
        },
        "fontFamily": {
          "type": "string",
          "description": "Font family.",
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
          "description": "Draw the text's bounding box, for layout debugging.",
          "default": false
        },
        "rotate": {
          "type": "number",
          "description": "Rotation in degrees, applied in the chart's y-up world frame about the text anchor.",
          "default": 0
        },
        "textAnchor": {
          "enum": ["start", "middle", "end"],
          "description": "Where the text anchor — the local origin `rotate` pivots about and dims channels position — sits along the string: its first character, center, or last character.",
          "default": "start"
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
          "type": "number",
          "description": "Opacity, 0 to 1."
        },
        "preserveAspectRatio": {
          "type": "string",
          "description": "Raw SVG preserveAspectRatio value.",
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
      "description": "A closed polygon defined by local-coordinate points (y-up), given literally or read from a field. No dims channels — the bbox is computed from `points`.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "polygon"
        },
        "points": {
          "oneOf": [
            {
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
              }
            },
            {
              "type": "string"
            }
          ],
          "description": "Vertex list, at least 3 points — either a literal ring, or the name of a field holding one ring per row (which is how one mark draws a whole basemap)."
        },
        "fill": {
          "type": "string",
          "description": "Fill color.",
          "default": "black"
        },
        "stroke": {
          "type": "string",
          "description": "Stroke color. Defaults to `fill`."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "type": "number",
          "description": "Opacity, 0 to 1, applied to both fill and stroke.",
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
      "description": "An invisible sizing/positioning guide — a rect that emits no display items at all, with a restricted channel set (no x/y/cx/cy/x2/y2/theta/r — position it via a layout operator).",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "blank"
        },
        "emX": {
          "type": "boolean",
          "description": "Embed x in the parent's x space."
        },
        "emY": {
          "type": "boolean",
          "description": "Embed y in the parent's y space."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width.",
          "default": 0
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height.",
          "default": 0
        },
        "rx": {
          "type": "number",
          "description": "Corner radius, x."
        },
        "ry": {
          "type": "number",
          "description": "Corner radius, y."
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color. A blank draws nothing unless given one."
        },
        "stroke": {
          "type": "string",
          "description": "Stroke color."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Stroke width in pixels."
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
          "$ref": "#/$defs/ChannelValue",
          "description": "A line's path is never filled. `fill` is the channel the shared color scale reads, so a field name colors each line by group, and it is the line color when `stroke` is omitted."
        },
        "stroke": {
          "type": "string",
          "description": "Line color."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Line thickness in pixels.",
          "default": 1
        },
        "strokeDasharray": {
          "type": "string",
          "description": "Raw SVG stroke-dasharray (e.g. \"12\") for a dashed line."
        },
        "opacity": {
          "type": "number",
          "description": "Opacity, 0 to 1."
        },
        "mixBlendMode": {
          "enum": ["normal", "multiply"],
          "description": "Blend mode where connectors overlap."
        },
        "curve": {
          "description": "Screen-space path shape: a factory call (bezier()/orthogonal()/arc({direction})/perfectArrows({bow})/...) or a bare name (\"linear\"/\"bezier\"/\"catmullRom\"). Omitted = \"auto\" (catmullRom on a homogeneous continuous connection axis, else linear)."
        },
        "dir": {
          "enum": ["x", "y"],
          "description": "Connection axis."
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
        "along": {
          "type": "string",
          "description": "Names a flow tier by its `by` field: that tier becomes the path tier (threading its groups in order) and every OTHER grouping tier splits. Omitted: the path tier is inferred from the flow shape. Naming a field that matches no tier, or using `along` where the mark doesn't fuse over this chart's own flow (a refs bag, or the pairwise from/to form), is an error."
        },
        "emX": {
          "type": "boolean",
          "description": "Blank-fusion anchor key: placed directly in `.mark()` position, `line(opts)` elaborates to an invisible anchor tier (a `blank()` carrying just `{w, h, emX, emY}`) plus this connector — see the `mark` construct's doc. Ignored by `line` itself."
        },
        "emY": {
          "type": "boolean",
          "description": "Blank-fusion anchor key — see `emX`. Ignored by `line` itself."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Blank-fusion anchor key — see `emX`. Ignored by `line` itself."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Blank-fusion anchor key — see `emX`. Ignored by `line` itself."
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
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color of the band, or a field name for a color scale. Omitted, the band takes the color of the marks it connects."
        },
        "stroke": {
          "type": "string",
          "description": "Stroke color."
        },
        "strokeWidth": {
          "type": "number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "type": "number",
          "description": "Opacity, 0 to 1."
        },
        "mixBlendMode": {
          "enum": ["normal", "multiply"],
          "description": "Blend mode where bands overlap.",
          "default": "normal"
        },
        "dir": {
          "enum": ["x", "y"],
          "description": "Connection axis."
        },
        "curve": {
          "description": "Screen-space band-edge shape (\"linear\" | bezier() | \"catmullRom\"). Omitted = \"auto\" (catmullRom on a homogeneous continuous connection axis, else a bezier band)."
        },
        "from": {
          "type": "string"
        },
        "to": {
          "type": "string"
        },
        "along": {
          "type": "string",
          "description": "Names a flow tier by its `by` field: that tier becomes the path tier (threading its groups in order) and every OTHER grouping tier splits. Omitted: the path tier is inferred from the flow shape. Naming a field that matches no tier, or using `along` where the mark doesn't fuse over this chart's own flow (a refs bag, or the pairwise from/to form), is an error."
        },
        "emX": {
          "type": "boolean",
          "description": "Blank-fusion anchor key: placed directly in `.mark()` position, `ribbon(opts)` elaborates to an invisible anchor tier (a `blank()` carrying just `{w, h, emX, emY}`) plus this connector — see the `mark` construct's doc. Ignored by `ribbon` itself."
        },
        "emY": {
          "type": "boolean",
          "description": "Blank-fusion anchor key — see `emX`. Ignored by `ribbon` itself."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Blank-fusion anchor key — see `emX`. Ignored by `ribbon` itself."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Blank-fusion anchor key — see `emX`. Ignored by `ribbon` itself."
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
