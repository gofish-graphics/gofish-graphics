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
          "$ref": "#/$defs/ChartOptions"
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
        },
        "name": {
          "type": "string",
          "description": "Chart-level name so a sibling Layer relate callback can reference this chart."
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          },
          "description": "Layer-level relate clauses (layer([...]).relate(...)), resolving names against the child charts' names."
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
          "$ref": "#/$defs/Number"
        },
        "y": {
          "$ref": "#/$defs/Number"
        }
      }
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
    "StructAccessor": {
      "description": "A key built from two fields at once, emitted by struct({ x, y }), with the cells it is binned into (its one op, bin, takes a Bin strategy). Valid as a partition's `by` only once binned.",
      "type": "object",
      "required": ["type", "fields"],
      "additionalProperties": false,
      "properties": {
        "type": {
          "const": "struct"
        },
        "fields": {
          "type": "object",
          "required": ["x", "y"],
          "additionalProperties": false,
          "properties": {
            "x": {
              "type": "string"
            },
            "y": {
              "type": "string"
            }
          }
        },
        "ops": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["op", "partition"],
            "additionalProperties": false,
            "properties": {
              "op": {
                "const": "bin"
              },
              "partition": {
                "$ref": "#/$defs/Bin"
              }
            }
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
                    "$ref": "#/$defs/Number"
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
            "partition": {
              "description": "The partition each value is binned into: a Calendar value ({ unit, step?, start? }), { step }, or { thresholds } (a cell count or a list of edges). Absent: about 10 cells.",
              "oneOf": [
                {
                  "$ref": "#/$defs/Calendar"
                },
                {
                  "type": "object",
                  "required": ["step"],
                  "properties": {
                    "step": {
                      "type": "number",
                      "exclusiveMinimum": 0
                    }
                  },
                  "additionalProperties": false
                },
                {
                  "type": "object",
                  "required": ["thresholds"],
                  "properties": {
                    "thresholds": {
                      "oneOf": [
                        {
                          "$ref": "#/$defs/Number"
                        },
                        {
                          "type": "array",
                          "items": {
                            "$ref": "#/$defs/Number"
                          }
                        }
                      ]
                    }
                  },
                  "additionalProperties": false
                }
              ]
            }
          },
          "additionalProperties": false
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
          "$ref": "#/$defs/Number"
        },
        "y": {
          "$ref": "#/$defs/Number"
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
          "$ref": "#/$defs/Number"
        },
        "name": {
          "type": "string"
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
                "$ref": "#/$defs/Number"
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
                    "$ref": "#/$defs/Number"
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
                          "$ref": "#/$defs/Number"
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
                    "$ref": "#/$defs/Number"
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
          "$ref": "#/$defs/Number"
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
                "type": "string",
                "description": "Label position, e.g. \"center\", \"outset-top\", \"inset-bottom-start\"."
              },
              "fontSize": {
                "$ref": "#/$defs/Number",
                "description": "Font size in pixels."
              },
              "color": {
                "type": "string",
                "description": "Label color. Omitted, it is chosen to contrast with the mark."
              },
              "offset": {
                "$ref": "#/$defs/Number",
                "description": "Offset from the shape's edge in pixels."
              },
              "rotate": {
                "$ref": "#/$defs/Number",
                "description": "Rotation in degrees, clockwise on screen."
              },
              "fontFamily": {
                "type": "string",
                "description": "Font family of the label's text node. Omitted, the elaborator's own font family."
              },
              "fontWeight": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/Number"
                  },
                  {
                    "type": "string"
                  }
                ],
                "description": "Font weight, e.g. \"bold\" or a numeric weight."
              },
              "fontStyle": {
                "type": "string",
                "description": "Font style, e.g. \"italic\"."
              }
            }
          }
        }
      ]
    },
    "Number": {
      "description": "A number. JSON has no Infinity, so +/-Infinity travel as the tagged object { \"$numberDouble\": \"Infinity\" | \"-Infinity\" } (MongoDB Extended JSON). A tagged \"NaN\" is not a valid number here.",
      "oneOf": [
        {
          "type": "number"
        },
        {
          "type": "object",
          "required": ["$numberDouble"],
          "additionalProperties": false,
          "properties": {
            "$numberDouble": {
              "enum": ["Infinity", "-Infinity"]
            }
          }
        }
      ]
    },
    "RelateClauseIR": {
      "description": "One clause of a .relate() callback: a constraint over names (carries refs), or a mark that draws, whose children may reference the layer's names.",
      "oneOf": [
        {
          "$ref": "#/$defs/ConstraintIR"
        },
        {
          "$ref": "#/$defs/MarkIR"
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
          "$ref": "#/$defs/Number"
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
              "$ref": "#/$defs/Number",
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
      "description": "Transforms the data with a function, `derive(fn)`. A function does not serialize: the IR carries a Python bridge handle in its place.",
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
        "schema": {
          "type": "object",
          "additionalProperties": {},
          "description": "Column types of the result, keyed by column name, as in a chart's schema, e.g. Schema.ordered(levels) or Schema.time(). They override the types the result keeps from its input or infers, and convert values (an ISO string in a time column becomes an instant)."
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
            "additionalProperties": {}
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
    "FilterOperator": {
      "description": "Keep the rows a field predicate accepts (`filter(field(name).between(lo, hi, { closed }))`). A filter over a hand-written predicate has no wire form and serializes as an opaque `derive`.",
      "type": "object",
      "required": ["type", "predicate"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "filter"
        },
        "predicate": {
          "$ref": "#/$defs/FieldPredicate",
          "description": "The field predicate `field(name).between(lo, hi, { closed })` builds: `{ field, between: [lo, hi], closed? }`."
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
          "anyOf": [
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
          "type": "string",
          "description": "Axis to spread along: x, y, or an axis name the enclosing coordinate space declares (polar theta/r, geo lon/lat)."
        },
        "spacing": {
          "$ref": "#/$defs/Number",
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
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge of this operator's box, in the parent's space (pixels). Omitted, the parent places it."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Start edge on y (top where y reads top-down, bottom where it grows upward) of this operator's box, in the parent's space (pixels). Omitted, the parent places it."
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
          "anyOf": [
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
          "type": "string",
          "description": "Axis to stack along: x, y, or an axis name the enclosing coordinate space declares (polar theta/r, geo lon/lat)."
        },
        "spacing": {
          "$ref": "#/$defs/Number",
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
        "x": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Left edge of this operator's box, in the parent's space (pixels). Omitted, the parent places it."
        },
        "y": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Start edge on y (top where y reads top-down, bottom where it grows upward) of this operator's box, in the parent's space (pixels). Omitted, the parent places it."
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
          "anyOf": [
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
          "anyOf": [
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
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "Placement by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). A bare value or {center} is the point, {min, max} the span."
        },
        "alignment": {
          "type": "string",
          "description": "Cross-axis alignment for the axis without an explicit position.",
          "default": "baseline"
        },
        "overlap": {
          "$ref": "#/$defs/Overlap",
          "description": "How children keep clear of each other on the axis no field places, made by a call in the Overlap family. Overlap.separate({padding}) is a beeswarm: each dot moves to the free spot nearest the alignment line, so the counts set the width. Overlap.noise({randomness, smoothing, padding, seed}) spreads the dots inside an outline that follows how many dots share each part of the data axis: each dot adds a small bell-shaped bump, and the outline is the sum of the bumps. randomness is \"blue\" (default), \"quasi\" or \"uniform\". smoothing is the bandwidth of each bell in data units, 0 or more (default 0: no smoothing beyond the size of the dots), Infinity for a flat band, or \"silverman\" to compute it from the data. Overlap.sina() is noise with smoothing \"silverman\" (a violin outline), and Overlap.jitter() is noise with randomness \"uniform\" and smoothing Infinity (classic jitter); both make kind \"noise\". Both kinds grow from the `alignment` line: \"middle\" both ways, \"start\"/\"baseline\" to the positive side, \"end\" to the negative side. Omit it and every child sits on the line. Strategies move only the free axis. Linear coordinate spaces only."
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "type": "array",
              "minItems": 2,
              "maxItems": 2,
              "prefixItems": [
                {
                  "$ref": "#/$defs/Number"
                },
                {
                  "$ref": "#/$defs/Number"
                }
              ]
            }
          ],
          "description": "Cell gap: a single number for both axes, or [x, y].",
          "default": 0
        },
        "numCols": {
          "$ref": "#/$defs/Number",
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
          "description": "Start edge on y (top where y reads top-down, bottom where it grows upward) of the box the treemap tiles into, in the parent's space (pixels). Omitted, the parent places the treemap."
        },
        "w": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Width of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
        },
        "h": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Height of the box the treemap tiles into; a number is pixels, a data-driven value scales through the layout. Omitted, the treemap fills the slot its parent allots."
        },
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "The box the treemap tiles into, by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
        },
        "by": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/FieldAccessor"
            }
          ],
          "description": "Field to partition rows by (like spread/group); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls). Without `by`, one leaf is emitted per row."
        },
        "spacing": {
          "$ref": "#/$defs/Number",
          "description": "Gap between sibling tiles, in pixels.",
          "default": 0
        },
        "padding": {
          "$ref": "#/$defs/Number",
          "description": "Inset around the outer edge of the treemap, in pixels.",
          "default": 0
        },
        "round": {
          "type": "boolean",
          "description": "Round pixel positions and sizes.",
          "default": true
        },
        "tile": {
          "$ref": "#/$defs/Tile",
          "description": "The tiling strategy, made by a call in the Tile family: Tile.squarify({ ratio? }), Tile.slice(), Tile.dice(), Tile.binary(), or Tile.sliceDice(). Each is one of d3-hierarchy's tiling methods.",
          "default": {
            "kind": "squarify"
          }
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
    "PackOperator": {
      "description": "Circle packing: place the flow's groups (or rows) so their enclosing circles touch without overlapping, with d3's front-chain algorithm. Children keep their pixel size; the pack does not fit itself to the available space yet (#967).",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "pack"
        },
        "by": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/FieldAccessor"
            }
          ],
          "description": "Field to partition rows by (like spread/scatter); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls). Without `by`, one child per row."
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
    "PartitionOperator": {
      "description": "Divide the space into the cells of a binned key, and give each group its cell. Each cell sits at its true place on one continuous scale, so a cell's width follows its width in data, and an empty cell keeps its place. A mark with no size of its own fills its cell, and a mark with a size of its own is centered in it.",
      "type": "object",
      "required": ["type", "by"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "partition"
        },
        "by": {
          "anyOf": [
            {
              "$ref": "#/$defs/FieldAccessor"
            },
            {
              "$ref": "#/$defs/StructAccessor"
            }
          ],
          "description": "A key that has a region: a binned field, field(x).bin(p), whose cells divide the axis `dir`. Or one binned field per axis, { x: field(a).bin(p), y: field(b).bin(q) }, whose cells divide both axes into rectangles; this is the partition on x, then the partition on y, and it is written as those two partitions. Or two fields binned together, struct({ x: a, y: b }).bin(Bin.hex({ radius })) or .bin(Bin.voronoi({ seeds })), whose cells are polygons over both axes. A plain field, or a struct with no bin, has no region and is an error."
        },
        "dir": {
          "type": "string",
          "description": "Axis to divide: x, y, or an axis name the enclosing coordinate space declares (polar theta/r). Required with a single key, and not allowed with a key per axis."
        },
        "alignment": {
          "type": "string",
          "description": "Alignment of the children on the other axis (\"start\" | \"middle\" | \"end\" | \"baseline\"). Applies only where nothing gives the children a cell on that axis: inside a cell of another partition, each child is placed in that cell. Not allowed with a key per axis.",
          "default": "baseline"
        },
        "axes": {
          "$ref": "#/$defs/AxesOptions"
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
          "$ref": "#/$defs/FilterOperator"
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
        },
        {
          "$ref": "#/$defs/PackOperator"
        },
        {
          "$ref": "#/$defs/PartitionOperator"
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
          "description": "Start edge on y: the top edge where y reads top-down, the bottom edge where it grows upward."
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
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "Box dimensions by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
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
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "$ref": "#/$defs/Number",
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
          "$ref": "#/$defs/Number",
          "description": "Corner radius, x.",
          "default": 0
        },
        "ry": {
          "$ref": "#/$defs/Number",
          "description": "Corner radius, y.",
          "default": 0
        },
        "aspectRatio": {
          "$ref": "#/$defs/Number",
          "description": "w/h ratio to enforce; the constraining axis wins when both are data-driven."
        },
        "inset": {
          "$ref": "#/$defs/Number",
          "description": "Pixels drawn in from each side of the space the rect fills, on an axis where it has no size or span of its own (a bar's width in a spread or a partition cell), so neighbors are drawn apart. A side the rect sizes itself, such as a bar's data height, is never inset. It changes only what is drawn: the rect's box stays the space it was given.",
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "CircleMark": {
      "description": "A circle: an ellipse locked to a 1:1 aspect ratio, with the same box dimensions. Its diameter is set by at most one of r, w, or h and applies to both axes; with none, the circle fills the space it is given.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "circle"
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
          "description": "Start edge on y: the top edge where y reads top-down, the bottom edge where it grows upward."
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
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "Box dimensions by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
        },
        "r": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Radius. The diameter is 2r for a number (pixels), a field name, or an accessor alike. Pass at most one of r, w, and h."
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
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Opacity, 0 to 1, applied to fill and stroke: a number, a field name, or a per-datum accessor (in JS also a `live(...)` value, which does not cross the wire).",
          "default": 1
        },
        "fillOpacity": {
          "$ref": "#/$defs/Number",
          "description": "Opacity of the fill alone, 0 to 1. The stroke keeps `opacity`."
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "EllipseMark": {
      "description": "An ellipse. Box geometry via the shared dims channels; paint is `paint` without filter, plus fillOpacity.",
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
          "description": "Start edge on y: the top edge where y reads top-down, the bottom edge where it grows upward."
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
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "Box dimensions by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
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
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "$ref": "#/$defs/Number",
          "description": "Opacity, 0 to 1.",
          "default": 1
        },
        "fillOpacity": {
          "$ref": "#/$defs/Number",
          "description": "Opacity of the fill alone, 0 to 1. The stroke keeps `opacity`."
        },
        "aspectRatio": {
          "$ref": "#/$defs/Number",
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
          "description": "Start edge on y: the top edge where y reads top-down, the bottom edge where it grows upward."
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
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "Box dimensions by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
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
          "$ref": "#/$defs/Number",
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
          "description": "Start edge on y: the top edge where y reads top-down, the bottom edge where it grows upward."
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
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "Box dimensions by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
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
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "filter": {
          "type": "string",
          "description": "Raw SVG filter attribute."
        },
        "fontSize": {
          "$ref": "#/$defs/Number",
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
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
          "$ref": "#/$defs/Number",
          "description": "Rotation in degrees, clockwise on screen, about the text anchor.",
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
          "description": "Start edge on y: the top edge where y reads top-down, the bottom edge where it grows upward."
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
        "dims": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/AxisDimsValue"
          },
          "description": "Box dimensions by axis name: x/y, or a name the enclosing coordinate space declares (polar theta/r, geo lon/lat). Each value is a position (like x) or an interval {min, center, max, size, embedded}."
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
          "$ref": "#/$defs/Number",
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "PolygonMark": {
      "description": "A closed polygon defined by local-coordinate points (in the frame the polygon sits in: top-down on a plain canvas, upward inside a continuous y), given literally or read from a field. No dims channels — the bbox is computed from `points`.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "polygon"
        },
        "points": {
          "anyOf": [
            {
              "type": "array",
              "items": {
                "type": "array",
                "minItems": 2,
                "maxItems": 2,
                "prefixItems": [
                  {
                    "$ref": "#/$defs/Number"
                  },
                  {
                    "$ref": "#/$defs/Number"
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
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color, or a field name for a color scale.",
          "default": "black"
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color. Defaults to `fill`."
        },
        "strokeWidth": {
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "$ref": "#/$defs/Number",
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
        "fill": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color. A blank never paints; `fill` only seeds the shared color scale."
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "RegionMark": {
      "description": "Draws the region its parent gives it, such as a partition's cell. It has no size or position of its own: it fills the space it is given on both axes. It draws the region's outline when the region has one (a hexagon of Bin.hex, a cell of Bin.voronoi), and a rectangle otherwise.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "region"
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
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "$ref": "#/$defs/Number",
          "description": "Opacity, 0 to 1.",
          "default": 1
        },
        "filter": {
          "type": "string",
          "description": "Raw SVG filter attribute."
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
          "description": "A line's path is never filled. `fill` is the channel the shared color scale reads: a field name or an accessor colors each line by group (it must be constant within the line), and it is the line color when `stroke` is omitted."
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Line color, or a field name or accessor for a color scale (constant within the line). Defaults to `fill`."
        },
        "strokeWidth": {
          "$ref": "#/$defs/Number",
          "description": "Line thickness in pixels.",
          "default": 1
        },
        "strokeDasharray": {
          "type": "string",
          "description": "Raw SVG stroke-dasharray (e.g. \"12\") for a dashed line."
        },
        "opacity": {
          "$ref": "#/$defs/Number",
          "description": "Opacity, 0 to 1."
        },
        "mixBlendMode": {
          "enum": ["normal", "multiply"],
          "description": "Blend mode where connectors overlap."
        },
        "curve": {
          "$ref": "#/$defs/Curve",
          "description": "Screen-space path shape, made by a call in the Curve family: Curve.linear(), Curve.step(), Curve.monotone(), Curve.smooth(), Curve.catmullRom(), Curve.bezier(), Curve.orthogonal({bend}), Curve.arc({direction}) or Curve.perfectArrows({bow, ...}). Curve.step(), Curve.linear(), Curve.monotone() and Curve.smooth() are read over the parameter of the run, from the least to the most smooth. Curve.step() holds every value that depends on the ordering field until the next point, then jumps: a staircase when the ordering field is an axis (a line chart over years), and straight jumps between the points when it is not (a connected scatter plot). Curve.monotone() is piecewise monotone: between two neighboring points each coordinate only rises or only falls, so the curve never goes past either point. It does not make the whole line monotone: the line still turns where the data turns, and the turn sits exactly on the data point. For a path in x and y (a connected scatter plot) this holds for x and y separately, over the ordering field. It is the same curve as d3 curveMonotoneX and Vega-Lite interpolate \"monotone\". Curve.smooth() rounds a peak a little past its point, but keeps a run of equal values flat. Curve.catmullRom() is a centripetal Catmull-Rom through the points on screen. It can overshoot between points, and it is not used when reading values over time (a mark moving along the run follows a data-space curve). Omitted, it is Curve.monotone() on a homogeneous continuous connection axis, else Curve.linear()."
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
          "description": "Fill color of the band, or a field name or accessor for a color scale (constant within the band). Omitted, the band takes the color of the marks it connects."
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color of the band's outline, or a field name or accessor for a color scale (constant within the band)."
        },
        "strokeWidth": {
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 0
        },
        "opacity": {
          "$ref": "#/$defs/Number",
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
          "$ref": "#/$defs/Curve",
          "description": "Screen-space band-edge shape, made by a call in the Curve family: Curve.linear(), Curve.bezier(), Curve.step(), Curve.monotone(), Curve.smooth() or Curve.catmullRom(). Curve.step() steps both edges, as a stepped area does. Curve.monotone() is piecewise monotone: between two neighboring points each edge only rises or only falls, so it never goes past either point, though the band still turns where the data turns (d3 curveMonotoneX, Vega-Lite interpolate \"monotone\"); Curve.smooth() is a rounder reading over the same parameter, and can go a little past a point; Curve.catmullRom() is a centripetal Catmull-Rom on screen and can overshoot. Omitted, it is Curve.monotone() on a homogeneous continuous connection axis, else a Curve.bezier() band."
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
        "relate": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RelateClauseIR"
          }
        },
        "zOrder": {
          "$ref": "#/$defs/Number"
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
          "$ref": "#/$defs/RegionMark"
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
    },
    "AxisOptions": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "object",
          "properties": {
            "title": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "const": false
                }
              ],
              "description": "Axis title. A string sets it; false suppresses the inferred title."
            },
            "side": {
              "enum": ["start", "end"],
              "description": "Which frame edge the axis sits on: \"start\" is the near (origin) edge, \"end\" the far edge. Omitted, a continuous x-axis sits at the visual bottom."
            },
            "labelAngle": {
              "anyOf": [
                {
                  "$ref": "#/$defs/Number"
                },
                {
                  "type": "array",
                  "items": {
                    "$ref": "#/$defs/Number"
                  }
                },
                {
                  "enum": ["auto"]
                }
              ],
              "description": "Rotate tick and category labels by this many degrees, clockwise on screen (like Vega-Lite's labelAngle). A number applies to every tier of a nested ordinal axis; an array is per tier, from the innermost tier outward; \"auto\" picks 0, 45, or 90 degrees per label row so labels do not collide."
            },
            "rows": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/Calendar"
              },
              "description": "The label rows of a time axis, inner row first, e.g. [Calendar.month, Calendar.year]. Each row is one calendar partition: its ticks are its cells' starts, and each label is centered on its cell's start tick. The domain is niced outward to the inner row's cells. Default: the level and step the domain picks for about 10 ticks, then its parent level. In JS a row's labels can be custom: Calendar.quarter.format(fn), with fn a function of the cell. A row with a format is JS-only (it has no wire form)."
            }
          }
        }
      ],
      "description": "One axis's options: a boolean shows or hides it (title inferred); an object sets title, side, labelAngle, and the rows of a time axis."
    },
    "Calendar": {
      "type": "object",
      "properties": {
        "unit": {
          "enum": [
            "second",
            "minute",
            "hour",
            "day",
            "week",
            "month",
            "quarter",
            "year"
          ],
          "description": "The calendar level of each cell."
        },
        "step": {
          "$ref": "#/$defs/Number",
          "description": "How many units one cell spans; steps align to the level above.",
          "default": 1
        },
        "start": {
          "enum": ["monday", "sunday"],
          "description": "The first day of a week (weeks only)."
        }
      },
      "required": ["unit"],
      "description": "A calendar partition: a level (unit) at a step, e.g. Calendar.month.every(3)."
    },
    "AxesOptions": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "object",
          "properties": {
            "x": {
              "$ref": "#/$defs/AxisOptions",
              "description": "Options for the x axis."
            },
            "y": {
              "$ref": "#/$defs/AxisOptions",
              "description": "Options for the y axis."
            }
          }
        }
      ],
      "description": "Per-node axis override: a boolean shows or hides both axes; an object sets each axis on its own."
    },
    "AxisInterval": {
      "type": "object",
      "properties": {
        "min": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Start edge position."
        },
        "center": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Center position."
        },
        "max": {
          "$ref": "#/$defs/ChannelValue",
          "description": "End edge position."
        },
        "size": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Size along the axis."
        },
        "embedded": {
          "type": "boolean",
          "description": "Embed this axis in the parent's space."
        }
      },
      "description": "One axis of a `dims` option as an interval: `size` is a size channel, `min`/`center`/`max` are position channels."
    },
    "FieldPredicate": {
      "type": "object",
      "properties": {
        "field": {
          "type": "string",
          "description": "The field whose value is tested."
        },
        "between": {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "prefixItems": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/Number"
            }
          ],
          "description": "The interval's ends, `[lo, hi]`, compared by value."
        },
        "closed": {
          "enum": ["both", "left", "right", "none"],
          "description": "Which ends of the interval are inclusive, as in polars' `is_between`.",
          "default": "both"
        }
      },
      "required": ["field", "between"],
      "description": "A field predicate, as `field(name).between(lo, hi, { closed })` builds it: the field it reads and the interval it tests."
    },
    "ChartOptions": {
      "type": "object",
      "properties": {
        "w": {
          "$ref": "#/$defs/Number",
          "description": "Chart width in pixels."
        },
        "h": {
          "$ref": "#/$defs/Number",
          "description": "Chart height in pixels."
        },
        "coord": {
          "description": "Coordinate transform for the whole chart, made by a call in the Coord family: Coord.polar(), Coord.clock(), Coord.wavy(), ..."
        },
        "color": {
          "description": "Color scale for every mark, made by a call in the Color family: Color.palette(...) or Color.gradient(...)."
        },
        "axes": {
          "$ref": "#/$defs/AxesOptions",
          "description": "Draw axes: a boolean for both axes, or per-axis options {x?, y?}."
        },
        "legend": {
          "type": "boolean",
          "description": "Draw the color legend. Turned off, the marks keep their colors and only the legend is dropped.",
          "default": true
        },
        "padding": {
          "$ref": "#/$defs/Number",
          "description": "Extra padding in pixels between the plot and the SVG edge (polar charts, overflowing labels)."
        },
        "schema": {
          "type": "object",
          "additionalProperties": {},
          "description": "Column types, keyed by column name, e.g. Schema.ordered(levels) or Schema.time()."
        }
      },
      "description": "Chart-level options: chart(data, {...}) in JS, chart(data, **options) in Python."
    },
    "AxisDimsValue": {
      "anyOf": [
        {
          "$ref": "#/$defs/ChannelValue"
        },
        {
          "$ref": "#/$defs/AxisInterval"
        }
      ],
      "description": "A `dims` entry: a bare channel value (a position) or an interval. A channel value that is an object is tagged (`field(...)`, `datum(...)`), so an untagged object is an interval."
    },
    "Tile": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "squarify"
            },
            "ratio": {
              "$ref": "#/$defs/Number",
              "minimum": 1,
              "description": "Target tile aspect ratio: the longer side over the shorter side, at least 1 (orientation is not chosen). Omitted, d3's default, the golden ratio. 1 aims for square tiles, which suits one circle per leaf."
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "slice"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "dice"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "binary"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "sliceDice"
            }
          },
          "required": ["kind"]
        }
      ],
      "description": "How `treemap` tiles its box: the value of its `tile` option. Each kind is one of d3-hierarchy's tiling methods."
    },
    "Overlap": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "separate"
            },
            "padding": {
              "type": "number",
              "minimum": 0,
              "description": "Pixels kept between neighboring dots.",
              "default": 0
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "noise"
            },
            "randomness": {
              "enum": ["blue", "quasi", "uniform"],
              "description": "How offsets are drawn inside the outline: \"blue\" keeps each dot as far from its placed neighbors as it can, \"quasi\" spreads the dots by rank (fastest), \"uniform\" draws seeded uniform offsets.",
              "default": "blue"
            },
            "smoothing": {
              "anyOf": [
                {
                  "$ref": "#/$defs/Number",
                  "minimum": 0
                },
                {
                  "enum": ["silverman"]
                }
              ],
              "description": "The bandwidth of each dot's bell, in data units of the data axis: 0 is no smoothing beyond the dots' own size, Infinity is a flat band, and \"silverman\" computes it from the data.",
              "default": 0
            },
            "padding": {
              "type": "number",
              "minimum": 0,
              "description": "Pixels added to each dot's width when the outline is sized and, for \"blue\" randomness, when distances are compared.",
              "default": 0
            },
            "seed": {
              "type": "number",
              "description": "Seed for \"blue\" and \"uniform\" randomness, so a render is the same every time.",
              "default": 0
            }
          },
          "required": ["kind"]
        }
      ],
      "description": "How `scatter` keeps its children clear of each other on the axis no field places: the value of its `overlap` option. Both kinds grow from the `alignment` line and move only that free axis."
    },
    "Curve": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "linear"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "step"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "monotone"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "smooth"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "catmullRom"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "bezier"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "orthogonal"
            },
            "bend": {
              "enum": ["auto"],
              "description": "Omitted, the elbow bends on the connector's `dir` axis; \"auto\" infers the bend axis from the endpoint geometry instead, for layouts with no single growth axis."
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "arc"
            },
            "direction": {
              "enum": ["up", "down"],
              "description": "Which side the arc bulges toward.",
              "default": "up"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "perfectArrows"
            },
            "bow": {
              "$ref": "#/$defs/Number",
              "description": "Baseline curvature. 0 is a straight line.",
              "default": 0
            },
            "stretch": {
              "$ref": "#/$defs/Number",
              "description": "How much the bow grows as the endpoints get closer, and shrinks as they get farther apart.",
              "default": 0.25
            },
            "stretchMin": {
              "$ref": "#/$defs/Number",
              "description": "Distance in pixels below which stretch has its full effect.",
              "default": 50
            },
            "stretchMax": {
              "$ref": "#/$defs/Number",
              "description": "Distance in pixels above which stretch has no effect.",
              "default": 420
            },
            "padStart": {
              "$ref": "#/$defs/Number",
              "description": "Gap in pixels between the source box and the start of the arc.",
              "default": 0
            },
            "padEnd": {
              "$ref": "#/$defs/Number",
              "description": "Gap in pixels between the end of the arc and the target box.",
              "default": 20
            },
            "flip": {
              "type": "boolean",
              "description": "Flip which side the arc bows toward.",
              "default": false
            },
            "straights": {
              "type": "boolean",
              "description": "Allow a straight line when the endpoints are axis-aligned, instead of forcing a slight bow.",
              "default": true
            }
          },
          "required": ["kind"]
        }
      ],
      "description": "How a path runs through its points: the value of the `curve` option of `line` and `ribbon`. `linear`, `step`, `monotone` and `smooth` are read over the parameter of the run, from the least to the most smooth; `catmullRom` is a shape on screen; `bezier`, `orthogonal`, `arc` and `perfectArrows` route each pair of neighboring points."
    },
    "Bin": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "hex"
            },
            "radius": {
              "anyOf": [
                {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                {
                  "type": "object",
                  "properties": {
                    "x": {
                      "type": "number",
                      "exclusiveMinimum": 0,
                      "description": "The radius in units of the x field."
                    },
                    "y": {
                      "type": "number",
                      "exclusiveMinimum": 0,
                      "description": "The radius in units of the y field."
                    }
                  },
                  "required": ["x", "y"]
                }
              ],
              "description": "The distance from a hexagon's center to its corners, in data units. A number when both fields share a unit (longitude and latitude), or `{ x, y }`, one per field, when they do not (as in ggplot2's `binwidth = c(x, y)`)."
            }
          },
          "required": ["kind", "radius"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "voronoi"
            },
            "seeds": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": {}
              },
              "description": "The seed rows, with the same two fields as the key, such as weather stations for rain gauge readings. Pass the chart's own data to give each row its own cell."
            }
          },
          "required": ["kind", "seeds"]
        }
      ],
      "description": "The cells a key built from two fields is binned into: the value of `struct({ x, y }).bin(...)`. Each kind divides the plane of the two fields into cells that do not overlap, and puts each row in the cell its point falls in."
    }
  }
}
```
