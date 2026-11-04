const uBlob = (holes: boolean) =>
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
