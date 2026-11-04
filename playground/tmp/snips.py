# SCRATCH: write the proposal page's code snippets (proposed .new.ts, today .old.ts) for prettier.
import os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snips")
os.makedirs(D, exist_ok=True)

CA_HEAD = """chart(gapminderCountries, { axes: true, w: 520, h: 320, color: Color.palette(REGION_COLORS) })
  .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
  .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
  .layer(
    chart(selectAll("countries"))
      .flow(filter((country: any) => project(country, "Region") === "Sub-Saharan Africa"))
      .mark(
        enclose({"""
CA_TAIL = """          fill: "#47b8a0", stroke: "#47b8a0", fillOpacity: 0.3,
        })
      )
  );"""


def ca(mid):
    return f"{CA_HEAD}\n{mid}\n{CA_TAIL}\n"


S = {
    "ca-blob.new": ca("shape: Shape.blob(), padding: 6,"),
    "ca-blob.old": ca("shape: Shape.blob({ convexity: 0.1, neck: 0.6 }), padding: 6,"),
    "ca-oval.new": ca("shape: Shape.blob({ convexity: 2, connection: 0.85 }), padding: 4.5,"),
    "ca-oval.old": ca("shape: Shape.oval(), padding: 4.5,"),
    "ca-avoid.new": ca('shape: Shape.blob(), padding: 6, avoiding: selectAll("countries"),'),
    "ca-avoid.old": ca('shape: Shape.blob({ avoiding: selectAll("countries") }), padding: 6,'),
    "ca-fillet.new": """// in the ChartAccent visualization above: left, then right
enclose({ shape: Shape.fillet({ radius: 12, neck: 0 }), padding: 6, fill: "#47b8a0", stroke: "#47b8a0", fillOpacity: 0.3 });
enclose({ shape: Shape.fillet({ radius: 12 }), padding: 6, fill: "#47b8a0", stroke: "#47b8a0", fillOpacity: 0.3 });
""",
    "ca-fillet.old": """// in the ChartAccent visualization above; no links between pieces today
enclose({ shape: Shape.arcs({ radius: 12 }), padding: 6, fill: "#47b8a0", stroke: "#47b8a0", fillOpacity: 0.3 });
""",
    "pen-09.new": "export const PenguinBlobs = penguinStory(Shape.blob({ connection: 0.9 }));\n",
    "pen-09.old": "export const PenguinBlobs = penguinStory(Shape.blob());\n",
    "pen-sep.new": """// left: pieces may overlap (the default)
penguinStory(Shape.blob({ convexity: 2, connection: 0.5 }));
// right: each piece is cut out of its set's other pieces
penguinStory(Shape.blob({ convexity: 2, connection: 0.5, separate: true }));
""",
    "pen-sep.old": """// no pieces today; the nearest is one oval per species
penguinStory(Shape.oval());
""",
    "u.new": """layer(U.map((p, i) => dot(p, "#3366aa", `u${i}`))).relate((names: any) => [
  enclose(
    { shape: Shape.blob(), padding: 8, fill: "#3366aa", stroke: "#3366aa", fillOpacity: 0.25 },
    U.map((_, i) => names[`u${i}`])
  ),
]);
""",
    "holes.new": """const uBlob = (holes: boolean) =>
  layer([
    ...U.map((p, i) => dot(p, "#3366aa", `u${i}`)),
    ...GRAY.map((p, i) => dot(p, "#9aa0a6", `g${i}`)),
  ]).relate((names: any) => [
    enclose(
      {
        shape: Shape.blob({ convexity: 0.75, holes }),
        padding: 8,
        avoiding: GRAY.map((_, i) => names[`g${i}`]),
        fill: "#3366aa",
        stroke: "#3366aa",
        fillOpacity: 0.25,
      },
      U.map((_, i) => names[`u${i}`])
    ),
  ]);
""",
    "holes.old": """const uBlob = (holes: boolean) =>
  layer([
    ...U.map((p, i) => dot(p, "#3366aa", `u${i}`)),
    ...GRAY.map((p, i) => dot(p, "#9aa0a6", `g${i}`)),
  ]).relate((names: any) => [
    enclose(
      {
        shape: Shape.blob({
          convexity: 0.75,
          holes,
          avoiding: GRAY.map((_, i) => names[`g${i}`]),
        }),
        padding: 8,
        fill: "#3366aa",
        stroke: "#3366aa",
        fillOpacity: 0.25,
      },
      U.map((_, i) => names[`u${i}`])
    ),
  ]);
""",
}
MUNK = """layer([
  spread({ dir: "x", spacing: 95, alignment: "middle" }, [
    circle({ r: 5, fill: "#111" }).name("a"),
    circle({ r: 5, fill: "#111" }).name("b"),
    circle({ r: 5, fill: "#111" }).name("c"),
  ]),
]).relate(({ a, b, c }: any) => [
  enclose({ shape: Shape.oval(), padding: 30, ...outline }, [a, b, c]),
  enclose({ shape: Shape.oval(), padding: 16, ...outline }, [a, b]),
  enclose({ shape: Shape.oval(), padding: 16, ...outline }, [b, c]),
  enclose(
    {
%s
      ...outline,
    },
    [a, c]
  ),
]);
"""
S["munkres.new"] = MUNK % "shape: Shape.spine(), padding: 12, avoiding: [b], clearance: 6,"
S["munkres.old"] = MUNK % "shape: Shape.spine({ avoiding: [b], clearance: 6 }), padding: 12,"
HYP = """SETS.map((set) =>
  enclose(
    {
%s
      fill: set.color,
      stroke: set.color,
      fillOpacity: 0.3,
    },
    [
      ...set.nodes.map((id) => n[id]),
      ...EDGES.filter(([p, q]) => set.nodes.includes(p) && set.nodes.includes(q)).map((e) => n[edgeName(e)]),
    ]
  )
);
"""
S["hyper.new"] = HYP % (
    "shape: Shape.spine(), padding: 6, avoiding: Object.keys(NODES).map((id) => n[id]), clearance: 3,"
)
S["hyper.old"] = HYP % (
    "shape: Shape.spine({ avoiding: Object.keys(NODES).map((id) => n[id]), clearance: 3 }), padding: 6,"
)
BUB = """chart(countryPopulations)
  .flow(
    pack({ by: "continent", spacing: 4 }),
    enclose({ shape: %s, padding: 4, fill: "none", stroke: "#333", strokeWidth: 1.5 }),
    pack({ by: "region", spacing: 4 }),
    enclose({ shape: %s, padding: 4, fill: "none", stroke: "#999" }),
    pack()
  )
  .mark(country)
  .render(container, { w: 720, h: 600 });
"""
S["bubble.new"] = BUB % ("Shape.fillet({ radius: 12 })", "Shape.fillet({ radius: 0 })")
S["bubble.old"] = BUB % ("Shape.arcs({ radius: 12 })", "Shape.arcs({ radius: 8 })")
S["api"] = """// clearance defaults to the padding
enclose({ shape, padding, avoiding, clearance }, members);
// convexity 0.5, connection 1, neck 1, holes false, separate false
Shape.blob({ convexity, connection, neck, holes, separate });
// radius defaults to the padding; neck 0.5, holes false
Shape.fillet({ radius, neck, holes });
// presets: the blob at convexity 0, 1 and 2
Shape.spine(); Shape.hull(); Shape.oval();
"""
for k, v in S.items():
    open(os.path.join(D, k + ".ts"), "w").write(v)
print(len(S))
