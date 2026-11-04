SETS.map((set) =>
  enclose(
    {
      shape: Shape.spine(),
      padding: 6,
      avoiding: Object.keys(NODES).map((id) => n[id]),
      clearance: 3,
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
