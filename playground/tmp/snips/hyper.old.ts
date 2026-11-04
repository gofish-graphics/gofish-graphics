SETS.map((set) =>
  enclose(
    {
      shape: Shape.spine({
        avoiding: Object.keys(NODES).map((id) => n[id]),
        clearance: 3,
      }),
      padding: 6,
      fill: set.color,
      stroke: set.color,
      fillOpacity: 0.3,
    },
    [
      ...set.nodes.map((id) => n[id]),
      ...EDGES.filter(
        ([p, q]) => set.nodes.includes(p) && set.nodes.includes(q)
      ).map((e) => n[edgeName(e)]),
    ]
  )
);
