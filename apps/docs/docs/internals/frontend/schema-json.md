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
    },
    "tables": {
      "type": "object",
      "description": "The rows of every chart in the document that has rows of its own, by the id its {type: \"table\", id} data names.",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "object"
        }
      }
    }
  },
  "$defs": {
    "Root": {
      "description": "A root holds anything a mark position holds: a chart, a .layer(...) chain, a layer([...]) of charts or marks, or a bare mark.",
      "$ref": "#/$defs/MarkIR"
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
          "required": ["type", "id"],
          "properties": {
            "type": {
              "const": "table"
            },
            "id": {
              "type": "string"
            }
          },
          "description": "Rows of the chart's own, by id: they travel beside the IR (a document's tables, or a Python host's Arrow tables)."
        },
        {
          "$ref": "#/$defs/SelectRefIR"
        },
        {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": {
              "const": "previous-tier"
            }
          },
          "description": "An empty chart() scope, whose rows are the enclosing scope's: inside a .layer(...) chain the immediately preceding tier's marks; in a mark position the rows of the partition it sits in."
        }
      ]
    },
    "ChartIR": {
      "type": "object",
      "required": ["type", "data", "mark"],
      "properties": {
        "type": {
          "const": "chart"
        },
        "data": {
          "$ref": "#/$defs/DataIR"
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
    "LayerChainIR": {
      "type": "object",
      "required": ["type", "tiers"],
      "description": "A chart(...).layer(...) chain: tiers stacked in order, each offered the previous tier's marks as its scope. The first tier is a chart; it sits at the root or in any mark position, where a first tier with previous-tier data binds the rows of the partition it sits in.",
      "properties": {
        "type": {
          "const": "layer-chain"
        },
        "tiers": {
          "type": "array",
          "minItems": 2,
          "prefixItems": [
            {
              "$ref": "#/$defs/ChartIR"
            }
          ],
          "items": {
            "$ref": "#/$defs/MarkIR"
          }
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
      "description": "Explicit field-accessor form, emitted by field(name). Optionally carries a chained pipeline (ops) — field(\"site\").sort(\"yield\") or field(\"count\").normalize(). Two disjoint slots consume ops: a `by` (grouping key) slot accepts the domain ops (sort/reverse/bin); a value (size/pos) channel slot accepts the aggregate ops (sum/mean/count/distinct) and, only on an operator's entry-flagged size channel, normalize.",
      "type": "object",
      "required": ["type", "name"],
      "properties": {
        "type": {
          "const": "field"
        },
        "name": {
          "type": "string"
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
      "description": "A key built from two fields at once, emitted by struct({ x, y }), with the cells it is binned into (its one op, bin, takes Bin.hex or Bin.voronoi). Valid as a partition's `by` only once binned.",
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
                "$ref": "#/$defs/StructBin"
              }
            }
          }
        }
      }
    },
    "ChunkKey": {
      "description": "A `by` key that groups consecutive rows, emitted by chunk(size): row i goes to group floor(i / size), a bin over row position. It names no field, so its groups draw no axis or labels.",
      "type": "object",
      "required": ["type", "size"],
      "properties": {
        "type": {
          "const": "chunk"
        },
        "size": {
          "type": "integer",
          "minimum": 1
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
              "description": "The partition each value is binned into: a Calendar value (Calendar.month({ every: 3 }) is { kind: month, every: 3 }), Bin.step(size) or Bin.thresholds(countOrEdges), told apart by kind; or a product of Calendar values (a list, [year, month]: one cell where they meet). Absent: about 10 cells. A second bin op splits the cells of the one before it.",
              "oneOf": [
                {
                  "$ref": "#/$defs/Partition"
                },
                {
                  "type": "array",
                  "minItems": 2,
                  "items": {
                    "$ref": "#/$defs/Calendar"
                  }
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
        },
        {
          "$ref": "#/$defs/ChartIR"
        },
        {
          "$ref": "#/$defs/LayerChainIR"
        }
      ],
      "description": "What a mark position holds, and what a root holds. Besides the mark kinds, a whole chart or a .layer(...) chain may sit where a mark does, as in JS (.mark(chart(...)), layer([rect(...), chart(...)])). A layer of charts is the layer combinator mark with chart children."
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
    "NodeSelectionIR": {
      "description": "Nodes named inside an option (a blob's `avoiding`): a list of refs, or every node of a named layer (selectAll).",
      "oneOf": [
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RefMarkIR"
          }
        },
        {
          "allOf": [
            {
              "$ref": "#/$defs/SelectRefIR"
            },
            {
              "required": ["mode"],
              "properties": {
                "mode": {
                  "const": "all"
                }
              }
            }
          ]
        }
      ]
    },
    "SelectRefIR": {
      "description": "A reference to the nodes of a named layer: ref(name) (mode \"one\" or absent) or selectAll(name) (mode \"all\").",
      "type": "object",
      "required": ["type", "layer"],
      "additionalProperties": false,
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
            "offset": {
              "$ref": "#/$defs/Number",
              "description": "Pixel offset applied after the datum maps through its scale (datum(v) + px)."
            }
          }
        },
        {
          "$ref": "#/$defs/BridgeLambdaSentinel"
        }
      ]
    },
    "BridgeLambdaSentinel": {
      "description": "Python-bridge handle for a Python function: JS calls it through the bridge by this lambda id.",
      "type": "object",
      "required": ["__gofish_lambda"],
      "properties": {
        "__gofish_lambda": {
          "type": "string"
        }
      }
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
          "description": "Column types of the result, keyed by column name, as in a chart's schema, e.g. Schema.ordered(levels) or Unit.time(). They override the types the result keeps from its input or infers, and convert values (an ISO string in a time column becomes an instant)."
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
            },
            {
              "$ref": "#/$defs/ChunkKey"
            }
          ],
          "description": "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin), or chunk(size) to group consecutive rows. Without `by`, each row is its own group."
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
            },
            {
              "$ref": "#/$defs/ChunkKey"
            }
          ],
          "description": "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin), or chunk(size) to group consecutive rows. Without `by`, each row is its own group."
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
            },
            {
              "$ref": "#/$defs/ChunkKey"
            }
          ],
          "description": "Field to group rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin), or chunk(size) to group consecutive rows."
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
            },
            {
              "$ref": "#/$defs/ChunkKey"
            }
          ],
          "description": "Field to partition rows by; also accepts a field(...) accessor carrying domain ops (sort/reverse/bin), or chunk(size) to group consecutive rows. Without `by`, each row is its own group."
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
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "$ref": "#/$defs/FieldAccessor"
                },
                {
                  "$ref": "#/$defs/ChunkKey"
                }
              ]
            },
            "y": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "$ref": "#/$defs/FieldAccessor"
                },
                {
                  "$ref": "#/$defs/ChunkKey"
                }
              ]
            }
          },
          "required": ["x", "y"],
          "description": "The column key (x) and the row key (y), both required. Each takes what spread's `by` takes: a field name, a field(...) key (sorted, binned, a chain or product of bins, a part of a cycle), or chunk(size). A binned key's columns or rows are its cells, empty ones included. Each cell of the table holds the rows in both its column and its row."
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
            },
            {
              "$ref": "#/$defs/ChunkKey"
            }
          ],
          "description": "Field to partition rows by (like spread/group); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls), or chunk(size) to group consecutive rows. Without `by`, each row is its own group."
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
            },
            {
              "$ref": "#/$defs/ChunkKey"
            }
          ],
          "description": "Field to partition rows by (like spread/scatter); also accepts a field(...) accessor carrying domain ops (sort/reverse/bin/dropNulls), or chunk(size) to group consecutive rows. Without `by`, each row is its own group."
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
          "description": "A key that has a region: a binned field whose cells lie on the line, whose cells divide the axis `dir`: field(x).bin(p) with p Bin.step(size), Bin.thresholds(countOrEdges), or a Calendar level that is a part of nothing (Calendar.year, Calendar.week); a product that starts with one, field(x).bin([Calendar.year, Calendar.month]); or a chain that starts with one, field(x).bin(Calendar.year).bin(Calendar.month). A part of a cycle (field(x).bin(Calendar.month), the month of the year) has no one region on the time line and is an error. Or one binned field per axis, { x: field(a).bin(p), y: field(b).bin(q) }, whose cells divide both axes into rectangles; this is the partition on x, then the partition on y, and it is written as those two partitions. Or two fields binned together, struct({ x: a, y: b }).bin(Bin.hex({ radius })) or .bin(Bin.voronoi({ seeds })), whose cells are polygons over both axes. A plain field, or a struct with no bin, has no region and is an error."
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
          "description": "Corner radius, x. Default: `ry`, or 0 when neither is given."
        },
        "ry": {
          "$ref": "#/$defs/Number",
          "description": "Corner radius, y. Default: `rx`, or 0 when neither is given."
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
        },
        "debug": {
          "type": "boolean"
        },
        "translate": {
          "$ref": "#/$defs/Translate"
        }
      }
    },
    "EncloseMark": {
      "description": "Draw an outline around a set of nodes, under them: their padded bounding box (`Shape.box()`, the default), the smallest ellipse around them (`Shape.oval()`), or a smooth region (`Shape.blob()`, `Shape.hull()`, `Shape.spine()`). Combinator form `enclose(opts, children)`: fresh children are laid out as `layer` lays them out, and `ref(...)` children are enclosed where they already are. Bag form over a ref array (`chart(selectAll(name)).mark(enclose(opts))`), one outline per group when the flow groups the refs.",
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "const": "enclose"
        },
        "padding": {
          "$ref": "#/$defs/Number",
          "description": "Pixels between the members and the outline. For a blob, the distance from each member's own outline (around a line's whole length).",
          "default": 2
        },
        "shape": {
          "$ref": "#/$defs/Shape",
          "description": "The outline, made by a call in the Shape family: Shape.box({rx, ry}) draws the padded bounding box with rounded corners (the default). Shape.oval() draws the smallest-area ellipse around the padded members, rotated to follow them. Shape.blob({convexity, holes, roundness, neck, avoiding, clearance}) draws a smooth region: discs around the members, the links of a spanning tree between them, and the Delaunay triangles that fill `convexity` of their convex hull, smallest gaps first. Shape.hull() is a blob with convexity 1 and neck 1 (the padded convex hull, rounded), and Shape.spine() is a blob with convexity 0 (the spanning tree of tubes alone); any option overrides the preset."
        },
        "fill": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Fill color of the outline, or a field name or accessor for a color scale (constant within the enclosed group)."
        },
        "stroke": {
          "$ref": "#/$defs/ChannelValue",
          "description": "Stroke color of the outline, or a field name or accessor for a color scale (constant within the enclosed group). Default a light gray."
        },
        "strokeWidth": {
          "$ref": "#/$defs/Number",
          "description": "Stroke width in pixels.",
          "default": 1
        },
        "strokeDasharray": {
          "type": "string",
          "description": "Raw SVG stroke-dasharray (e.g. \"4 2\") for a dashed outline."
        },
        "opacity": {
          "$ref": "#/$defs/Number",
          "description": "Opacity of the whole outline, fill and stroke, 0 to 1.",
          "default": 1
        },
        "fillOpacity": {
          "$ref": "#/$defs/Number",
          "description": "Opacity of the fill alone, 0 to 1. The stroke keeps `opacity`, so a tinted region can keep a full-strength outline."
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "anyOf": [
            {
              "$ref": "#/$defs/Number"
            },
            {
              "$ref": "#/$defs/BridgeLambdaSentinel"
            }
          ]
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
          "$ref": "#/$defs/EncloseMark"
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
            "label": {
              "$ref": "#/$defs/AxisLabelOptions",
              "description": "How the axis's labels are drawn: their angle and their alignment, per level."
            },
            "levels": {
              "type": "array",
              "items": {
                "anyOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "$ref": "#/$defs/Calendar"
                  }
                ]
              },
              "description": "The axis's levels, its bands of labels, by depth, nearest the plot first. Every axis on the dim has levels: a numeric axis one (its ticks), a time axis two (the level and step its domain picks for about 10 ticks, then that level's parent), and an ordinal axis one per split, plus one per bin before the last of a chained key (field(x).bin(Calendar.year).bin(Calendar.month) gives a month level and a year level). Each entry sets the level at its depth: true keeps it as inferred, false hides it, and a Calendar value names its cells: a time row's partition, or, on an ordinal axis over cells of time, the cells that group its slots: each slot falls in the cell that holds its start, so Calendar.month over week slots puts each week in the month it starts in (a level finer than the slots is an error). Depths the list does not reach stay as inferred; on the outermost axis, Calendar values past the inferred levels add levels. An entry that cannot apply is an error that lists the axis's levels. The other per-level options (label.angle, label.align, divider) use the same depths and the same rule: a plain value applies to every level where it can, and an array entry that cannot apply at its depth, or one past the last level, is this error. In JS a level's labels can be custom: Calendar.quarter.format(fn), with fn a function of the cell; an entry with a format is JS-only (it has no wire form)."
            },
            "divider": {
              "anyOf": [
                {
                  "type": "boolean"
                },
                {
                  "type": "array",
                  "items": {
                    "type": "boolean"
                  }
                }
              ],
              "description": "Whether each level of an ordinal axis draws dividers: a line in each gap where its runs break, through every level whose runs also break there. Omitted, a level draws them when it partitions the value of the level inside it, that is, both bin the same column: a year level over a month level of one date (a chained key field(x).bin(Calendar.year).bin(Calendar.month), nested splits that bin the same column, or a coarser Calendar entry of levels), or numeric bins inside bins. Categories nested in other categories (a lake over its species) draw none, nor does the innermost level. true turns a level's dividers on and false turns them off. A continuous axis's level has ticks, not regions, so a plain value applies to every ordinal level and skips the continuous ones; an array is per level, by the same depths as levels, nearest the plot first, with a depth past its end left as inferred, and true at a continuous level's depth, or an entry past the last level, is an error."
            }
          }
        }
      ],
      "description": "One axis's options: a boolean shows or hides it (title inferred); an object sets title, side, label (angle and align), its levels, and their dividers."
    },
    "AxisLabelOptions": {
      "type": "object",
      "properties": {
        "angle": {
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
          "description": "Rotate tick and category labels by this many degrees, clockwise on screen (like Vega-Lite's labelAngle). A number applies to every level of the axis where it can (a time axis does not rotate its labels yet, so it skips their rows); an array is per level, by the same depths as `levels`, nearest the plot first, and an entry that cannot apply at its depth, or one past the last level, is an error; \"auto\" picks 0, 45, or 90 degrees per level so labels do not collide."
        },
        "align": {
          "anyOf": [
            {
              "enum": ["start", "center"]
            },
            {
              "type": "array",
              "items": {
                "anyOf": [
                  {
                    "enum": ["start", "center"]
                  },
                  {
                    "const": true
                  }
                ]
              }
            }
          ],
          "description": "Where each level's labels sit along the axis: \"center\" centers a label under what it names, \"start\" puts it at the start of its run, just past the divider before it (the first run starts at the axis start). Omitted, an ordinal axis's outer level over ordered groups (cells of time, numeric bins, or a column the schema declares ordered) starts its runs, and every other level centers: an outer level over unordered categories, the innermost level (one label per slot), and a continuous axis, whose labels name points. A plain value applies to every level where it can, so a plain \"start\" skips a continuous axis's levels; an array is per level, by the same depths as `levels`, nearest the plot first, with true keeping a level's inferred alignment, and \"start\" at a continuous level's depth, or an entry past the last level, is an error."
        }
      },
      "description": "How one axis's labels are drawn: their angle and their alignment, each per level by the same depths as `levels`."
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
          "description": "Draw this chart's axes: a boolean for both axes, or per-axis options {x?, y?}. It applies at this chart: a nested chart reads its own, and draws only the axes of the domains it owns. A chart that turns an axis off hides it; no chart inside it draws that axis instead.",
          "default": true
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
          "description": "Column types, keyed by column name: a Unit (Unit(\"USD\").summable()), a unit's name (\"km²\"), a column record { name, unit }, Unit.time() for a time, or Schema.ordered(levels)."
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
    "Partition": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "second"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "minute"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "hour"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "day"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "weekday"
            },
            "start": {
              "enum": ["monday", "sunday"],
              "description": "The first day of a week. Monday is the ISO 8601 default.",
              "default": "monday"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "week"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            },
            "start": {
              "enum": ["monday", "sunday"],
              "description": "The first day of a week. Monday is the ISO 8601 default.",
              "default": "monday"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "month"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "quarter"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "year"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "step"
            },
            "size": {
              "type": "number",
              "exclusiveMinimum": 0,
              "description": "The width of each cell, in data units."
            }
          },
          "required": ["kind", "size"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "thresholds"
            },
            "thresholds": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 1
                },
                {
                  "type": "array",
                  "items": {
                    "type": "number"
                  },
                  "minItems": 1
                }
              ],
              "description": "A count: about that many cells, with the width a numeric axis with that many ticks would use, so the edges are round numbers. Or a list of edges: the cells end and start at them, with the domain's ends as the outer edges, and an edge outside the domain cuts nothing."
            }
          },
          "required": ["kind", "thresholds"]
        }
      ],
      "description": "The cells `field(x).bin(...)` cuts a field's line into: a Calendar value (Calendar.month, Calendar.hour({ every: 6 })), Bin.step(size) or Bin.thresholds(countOrEdges)."
    },
    "StructBin": {
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
      "description": "The cells `struct({ x, y }).bin(...)` divides the plane of its two fields into: Bin.hex({ radius }) or Bin.voronoi({ seeds })."
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
              "const": "step"
            },
            "size": {
              "type": "number",
              "exclusiveMinimum": 0,
              "description": "The width of each cell, in data units."
            }
          },
          "required": ["kind", "size"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "thresholds"
            },
            "thresholds": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 1
                },
                {
                  "type": "array",
                  "items": {
                    "type": "number"
                  },
                  "minItems": 1
                }
              ],
              "description": "A count: about that many cells, with the width a numeric axis with that many ticks would use, so the edges are round numbers. Or a list of edges: the cells end and start at them, with the domain's ends as the outer edges, and an edge outside the domain cuts nothing."
            }
          },
          "required": ["kind", "thresholds"]
        },
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
      "description": "The cells a key is binned into. `step` and `thresholds` cut the line of one field into intervals: the value of `field(x).bin(...)`. `hex` and `voronoi` divide the plane of two fields into polygons: the value of `struct({ x, y }).bin(...)`. Each kind makes cells that do not overlap, and puts each row in the cell its value falls in."
    },
    "Calendar": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "second"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "minute"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "hour"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "day"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "weekday"
            },
            "start": {
              "enum": ["monday", "sunday"],
              "description": "The first day of a week. Monday is the ISO 8601 default.",
              "default": "monday"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "week"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            },
            "start": {
              "enum": ["monday", "sunday"],
              "description": "The first day of a week. Monday is the ISO 8601 default.",
              "default": "monday"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "month"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "quarter"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "year"
            },
            "every": {
              "type": "integer",
              "minimum": 1,
              "description": "How many units one cell spans, a whole number: 3 on a month is cells of 3 months. Steps count from the level above.",
              "default": 1
            }
          },
          "required": ["kind"]
        }
      ],
      "description": "Partitions of the time line into calendar cells, one kind per level: the value of `field(x).bin(...)` over a time column, and an entry of an axis's `levels`."
    },
    "Shape": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "box"
            },
            "rx": {
              "$ref": "#/$defs/Number",
              "minimum": 0,
              "description": "Corner radius in pixels, x. Default: `ry`, or 2 when neither is given."
            },
            "ry": {
              "$ref": "#/$defs/Number",
              "minimum": 0,
              "description": "Corner radius in pixels, y. Default: `rx`, or 2 when neither is given."
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "oval"
            }
          },
          "required": ["kind"]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "blob"
            },
            "convexity": {
              "$ref": "#/$defs/Number",
              "minimum": 0,
              "maximum": 1,
              "description": "The share of the members' convex hull that is filled, smallest gaps first, from 0 (the spanning tree alone) to 1 (the whole hull). It is the only option that fills gaps between members, so it decides the pieces and the filled area.",
              "default": 0.5
            },
            "holes": {
              "type": "boolean",
              "description": "Whether a gap left open inside the silhouette stays a hole. Off, every hole is filled and each avoided node it held is cut back out as its clearance circle, as `allow_holes` in PostGIS and Shapely.",
              "default": false
            },
            "roundness": {
              "type": "number",
              "minimum": 0,
              "description": "How far the outline's corners are rounded, in pixels. It changes how sharply the outline bends and nothing else: no gap fills, no hole opens, no two pieces join. Default: `padding`."
            },
            "neck": {
              "$ref": "#/$defs/Number",
              "exclusiveMinimum": 0,
              "maximum": 1,
              "description": "How far the outline is NOT pulled in between members, above 0 and at most 1: a lone link becomes a tube `neck` times the bulge, and the edge of a filled region sinks in between its members. 1 does not pull in. 0 is not allowed: a link `neck` times the bulge would have no width, and its two sides would meet. It never changes the pieces or holes.",
              "default": 1
            },
            "avoiding": {
              "$ref": "#/$defs/NodeSelectionIR",
              "description": "Nodes to keep out: a list of nodes or refs, or a `selectAll(name)` selection. A listed node that is also a member is ignored. Each avoided node inside the region becomes a round hole, and links route around the others."
            },
            "clearance": {
              "type": "number",
              "minimum": 0,
              "description": "Pixels kept between the outline and each avoided node.",
              "default": 4
            }
          },
          "required": ["kind"]
        }
      ],
      "description": "The outline `enclose` draws around its members: the value of its `shape` option. `padding` and the paint stay on `enclose`."
    }
  }
}
```
