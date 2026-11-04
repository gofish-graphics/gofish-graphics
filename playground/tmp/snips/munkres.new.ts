layer([
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
      shape: Shape.spine(),
      padding: 12,
      avoiding: [b],
      clearance: 6,
      ...outline,
    },
    [a, c]
  ),
]);
