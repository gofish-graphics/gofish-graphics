/**
 * Laws for the pure layout reference kernel.
 *
 * Run directly with: `tsx src/tests/layoutKernel.test.ts`
 */

import {
  EMPTY_FRAGMENT,
  anchorPort,
  composeFragments,
  dependency,
  fragment,
  knownSizeNode,
  layer,
  lowerAnchors,
  nodeId,
  paintBefore,
  pin,
  placedPort,
  placedPortId,
  placedPortRef,
  relation,
  scheduleDependencies,
  schedulePaint,
  solveFragment,
  solvedMin,
  translateFragment,
  type ConflictKind,
  type ConflictOutcome,
  type Fragment,
  type NodeId,
  type SolvedAxis,
  type SolveOutcome,
  type SolvedLayout,
} from "../ast/layoutKernel";

let passed = 0;
let failed = 0;

function test(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed++;
    console.error(
      `  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  assert(
    json(actual) === json(expected),
    `${message}: ${json(actual)} !== ${json(expected)}`
  );
}

const permutations = <T>(values: readonly T[]): T[][] => {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
      (rest) => [value, ...rest]
    )
  );
};

function expectSolved(outcome: SolveOutcome): SolvedLayout {
  assert(
    outcome.status === "solved",
    `expected solved, got ${json(outcome)}`
  );
  return outcome;
}

function expectConflict(
  outcome: SolveOutcome | ReturnType<typeof scheduleDependencies>,
  kind: ConflictKind
): ConflictOutcome {
  assert(
    outcome.status === "conflict",
    `expected ${kind} conflict, got ${json(outcome)}`
  );
  assert(
    outcome.conflict.kind === kind,
    `expected ${kind}, got ${json(outcome.conflict)}`
  );
  return outcome;
}

const cellHull = (axis: SolvedAxis): SolvedAxis["bounds"] =>
  axis.cells.length === 0
    ? null
    : {
        min: Math.min(...axis.cells.map((cell) => cell.min)),
        max: Math.max(...axis.cells.map((cell) => cell.min + cell.size)),
      };

const A = nodeId("A");
const B = nodeId("B");
const C = nodeId("C");
const D = nodeId("D");
const E = nodeId("E");

const node = (id: NodeId, width = 10, height = 10) =>
  knownSizeNode(id, width, height);
const start = (id: NodeId) => anchorPort(id, "start");
const middle = (id: NodeId) => anchorPort(id, "middle");
const end = (id: NodeId) => anchorPort(id, "end");

console.log("# layout kernel laws");

test("fragment composition has identity and is associative", () => {
  const a = fragment({ nodes: [node(A)] });
  const b = fragment({
    nodes: [node(B, 20)],
    relations: [relation("x", end(A), start(B), 5)],
  });
  const c = fragment({
    nodes: [node(C, 5)],
    pins: [pin("x", middle(C), 100)],
  });

  assertEqual(composeFragments(EMPTY_FRAGMENT, a), a, "left identity");
  assertEqual(composeFragments(a, EMPTY_FRAGMENT), a, "right identity");
  assertEqual(
    composeFragments(composeFragments(a, b), c),
    composeFragments(a, composeFragments(b, c)),
    "associativity"
  );
  assertEqual(
    composeFragments(a, b, c),
    composeFragments(c, a, b),
    "canonical fragment union is storage-order independent"
  );
});

test("canonical fact identity is safe for arbitrary stable IDs", () => {
  const leftSource = nodeId("a|b");
  const leftTarget = nodeId("c");
  const rightSource = nodeId("a");
  const rightTarget = nodeId("b|c");
  const nodes = [leftSource, leftTarget, rightSource, rightTarget].map((id) =>
    node(id)
  );
  const edges = [
    dependency(leftSource, leftTarget),
    dependency(rightSource, rightTarget),
  ];
  const forward = fragment({ nodes, dependencies: edges });
  const reverse = fragment({
    nodes: [...nodes].reverse(),
    dependencies: [...edges].reverse(),
  });
  assert(forward.dependencies.length === 2, "distinct edges collided");
  assertEqual(forward, reverse, "delimiter-bearing ID permutation");
  assertEqual(
    scheduleDependencies(forward),
    scheduleDependencies(reverse),
    "delimiter-bearing dependency solve"
  );
});

test("Layer nesting is transparent fragment union", () => {
  const a = fragment({ nodes: [node(A)] });
  const b = fragment({
    nodes: [node(B)],
    relations: [relation("x", end(A), start(B), 5)],
  });
  const c = fragment({ pins: [pin("x", start(A), 10)] });
  const flat = composeFragments(a, b, c);
  const groupings = [
    layer(layer(a, b), c),
    layer(a, layer(b, c)),
    layer(layer(EMPTY_FRAGMENT, a), layer(b, layer(c))),
  ];
  for (const nested of groupings) {
    assertEqual(nested, flat, "Layer introduced a semantic boundary");
    assertEqual(
      solveFragment(nested),
      solveFragment(flat),
      "nested Layer solve"
    );
  }
});

test("child and fact permutations have identical geometry", () => {
  const nodes = [node(A, 10), node(B, 20), node(C, 30)];
  const facts = [
    relation("x", middle(A), middle(B)),
    relation("x", middle(A), middle(C)),
  ];
  const variants = permutations(nodes).flatMap((nodeOrder) =>
    permutations(facts).map((factOrder) =>
      fragment({
        nodes: nodeOrder,
        pins: [pin("x", middle(A), 100)],
        relations: factOrder,
      })
    )
  );
  const canonical = variants[0];
  const geometry = expectSolved(solveFragment(canonical)).axes;
  assert(
    variants.length === 12,
    `expected 12 node/fact permutations, got ${variants.length}`
  );
  for (const variant of variants) {
    assertEqual(variant, canonical, "canonical fragment");
    assertEqual(
      expectSolved(solveFragment(variant)).axes,
      geometry,
      "permuted geometry"
    );
  }
});

test("known-size bounds equal the hull of canonical placement", () => {
  const cases = [
    EMPTY_FRAGMENT,
    fragment({ nodes: [node(A, 0, 0)] }),
    fragment({
      nodes: [node(A, 10), node(B, 20)],
      pins: [pin("x", start(A), -20)],
      relations: [relation("x", end(A), start(B), -15)],
    }),
    fragment({
      nodes: [node(A), node(B), node(C), node(D)],
      pins: [pin("x", start(A), 95), pin("x", start(C), 295)],
      relations: [
        relation("x", end(A), start(B), 5),
        relation("x", end(C), start(D), 5),
      ],
    }),
  ];

  for (const value of cases) {
    const solved = expectSolved(solveFragment(value));
    for (const axis of ["x", "y"] as const)
      assertEqual(
        solved.axes[axis].bounds,
        cellHull(solved.axes[axis]),
        `${axis} bounds/placement coherence`
      );
  }

  const empty = expectSolved(solveFragment(EMPTY_FRAGMENT));
  assert(empty.axes.x.bounds === null, "empty geometry acquired a bounds box");
  const point = expectSolved(
    solveFragment(fragment({ nodes: [node(A, 0, 0)] }))
  );
  assertEqual(
    point.axes.x.bounds,
    { min: 0, max: 0 },
    "zero-size geometry was confused with empty geometry"
  );
});

test("bounds include the separation between disconnected pinned components", () => {
  const solved = expectSolved(
    solveFragment(
      fragment({
        nodes: [node(A), node(B), node(C), node(D)],
        pins: [pin("x", start(A), 95), pin("x", start(C), 295)],
        relations: [
          relation("x", end(A), start(B), 5),
          relation("x", end(C), start(D), 5),
        ],
      })
    )
  );
  assertEqual(solved.axes.x.bounds, { min: 95, max: 320 }, "global hull");
  assert(
    solved.axes.x.bounds!.max - solved.axes.x.bounds!.min === 225,
    "occupied extent omitted inter-component separation"
  );
});

test("align-like relation sets are permutation invariant", () => {
  const base = [node(A, 10), node(B, 20), node(C, 30)];
  const alignAB = relation("x", middle(A), middle(B));
  const alignAC = relation("x", middle(A), middle(C));
  const solve = (relations: Fragment["relations"]) =>
    expectSolved(
      solveFragment(
        fragment({
          nodes: base,
          pins: [pin("x", middle(A), 100)],
          relations,
        })
      )
    );
  const first = solve([alignAB, alignAC]);
  const second = solve([alignAC, alignAB]);
  assertEqual(first.axes.x, second.axes.x, "align permutation");
  assert(solvedMin(first, "x", A) === 95, "A min");
  assert(solvedMin(first, "x", B) === 90, "B min");
  assert(solvedMin(first, "x", C) === 85, "C min");
});

test("ordered relation paths retain direction and gap semantics", () => {
  const ab = relation("x", end(A), start(B), 5);
  const bc = relation("x", start(B), start(C), -2);
  const solve = (relations: Fragment["relations"]) =>
    expectSolved(
      solveFragment(
        fragment({
          nodes: [node(C, 5), node(A, 10), node(B, 20)],
          pins: [pin("x", start(A), 10)],
          relations,
        })
      )
    );
  const first = solve([ab, bc]);
  const second = solve([bc, ab]);
  assertEqual(first.axes.x, second.axes.x, "path fact order");
  assert(solvedMin(first, "x", A) === 10, "A starts at pin");
  assert(solvedMin(first, "x", B) === 25, "B follows A end plus gap");
  assert(solvedMin(first, "x", C) === 23, "C follows directed negative gap");
});

test("anchor lowering produces min-potential equations", () => {
  const lowered = lowerAnchors(
    fragment({
      nodes: [node(A, 10), node(B, 20)],
      relations: [relation("x", end(A), middle(B), 5)],
      pins: [pin("x", middle(A), 100)],
    }),
    "x"
  );
  assert(lowered.status === "lowered", `lowering failed: ${json(lowered)}`);
  assertEqual(
    lowered.equations,
    [{ from: A, to: B, delta: 5 }],
    "anchor relation reduction"
  );
  assertEqual(
    lowered.pins,
    [{ node: A, value: 95, source: "pin" }],
    "anchor pin reduction"
  );
});

test("placed references anchor components without duplicating node claims", () => {
  const origin = placedPortId("outside:A:center:x");
  const source = fragment({
    nodes: [node(A, 10)],
    placedPorts: [placedPort(origin, "x", 50)],
    relations: [relation("x", placedPortRef(origin), middle(A))],
  });
  const solved = expectSolved(solveFragment(composeFragments(source, source)));
  assert(solved.axes.x.cells.length === 1, "placed port created a fake cell");
  assert(solvedMin(solved, "x", A) === 45, "placed center did not pin A");

  const conflictingDefinition = composeFragments(
    source,
    fragment({ placedPorts: [placedPort(origin, "x", 60)] })
  );
  expectConflict(
    solveFragment(conflictingDefinition),
    "duplicate-placed-port-definition"
  );
});

test("compatible pins give a unique component and incompatible pins conflict", () => {
  const common = {
    nodes: [node(A), node(B)],
    relations: [relation("x", start(A), start(B), 5)],
  } as const;
  const compatible = expectSolved(
    solveFragment(
      fragment({
        ...common,
        pins: [pin("x", start(A), 10), pin("x", start(B), 15)],
      })
    )
  );
  assert(solvedMin(compatible, "x", A) === 10, "compatible A pin");
  assert(solvedMin(compatible, "x", B) === 15, "compatible B pin");
  assert(compatible.axes.x.components[0].pinned, "component not marked pinned");

  expectConflict(
    solveFragment(
      fragment({
        ...common,
        pins: [pin("x", start(B), 16), pin("x", start(A), 10)],
      })
    ),
    "inconsistent-pins"
  );
});

test("relation conflicts return no partial placement or bounds", () => {
  const outcome = solveFragment(
    fragment({
      nodes: [node(A), node(B), node(C)],
      relations: [
        relation("x", start(A), start(B), 10),
        relation("x", start(B), start(C), 10),
        relation("x", start(A), start(C), 25),
      ],
    })
  );
  const conflict = expectConflict(outcome, "inconsistent-relation-cycle");
  assert(!("axes" in conflict), "conflict exposed a partial solved axis");
});

test("derived non-finite coordinates fail atomically", () => {
  expectConflict(
    solveFragment(
      fragment({
        nodes: [node(A, Number.MAX_VALUE), node(B, 0)],
        relations: [
          relation("x", end(A), start(B), Number.MAX_VALUE),
        ],
      })
    ),
    "invalid-number"
  );

  const endpointOverflow = solveFragment(
    fragment({
      nodes: [node(A, Number.MAX_VALUE)],
      pins: [pin("x", start(A), Number.MAX_VALUE)],
    })
  );
  const conflict = expectConflict(endpointOverflow, "invalid-number");
  assert(!("axes" in conflict), "numeric failure exposed partial bounds");
});

test("dependency scheduling is invariant and cycle diagnostics are canonical", () => {
  const nodes = [node(C), node(A), node(B)];
  const ab = dependency(A, C);
  const bb = dependency(B, C);
  const first = scheduleDependencies(
    fragment({ nodes, dependencies: [ab, bb] })
  );
  const second = scheduleDependencies(
    fragment({ nodes: [...nodes].reverse(), dependencies: [bb, ab] })
  );
  assert(first.status === "scheduled", json(first));
  assert(second.status === "scheduled", json(second));
  assertEqual(first.order, [A, B, C], "canonical dependency order");
  assertEqual(first, second, "dependency permutation");

  const cycle1 = scheduleDependencies(
    fragment({
      nodes: [node(A), node(B)],
      dependencies: [dependency(B, A), dependency(A, B)],
    })
  );
  const cycle2 = scheduleDependencies(
    fragment({
      nodes: [node(B), node(A)],
      dependencies: [dependency(A, B), dependency(B, A)],
    })
  );
  const firstConflict = expectConflict(cycle1, "dependency-cycle");
  const secondConflict = expectConflict(cycle2, "dependency-cycle");
  assertEqual(firstConflict, secondConflict, "canonical cycle conflict");
  assert(
    firstConflict.conflict.message === "Dependency cycle: A -> B -> A",
    firstConflict.conflict.message
  );
});

test("paint scheduling is invariant and cycle diagnostics are canonical", () => {
  const nodes = [node(C), node(A), node(B)];
  const ab = paintBefore(A, C);
  const bb = paintBefore(B, C);
  const first = schedulePaint(fragment({ nodes, paint: [ab, bb] }));
  const second = schedulePaint(
    fragment({ nodes: [...nodes].reverse(), paint: [bb, ab] })
  );
  assert(first.status === "scheduled", json(first));
  assert(second.status === "scheduled", json(second));
  assertEqual(first.order, [A, B, C], "canonical paint order");
  assertEqual(first, second, "paint permutation");

  const cycle1 = schedulePaint(
    fragment({
      nodes: [node(A), node(B)],
      paint: [paintBefore(B, A), paintBefore(A, B)],
    })
  );
  const cycle2 = schedulePaint(
    fragment({
      nodes: [node(B), node(A)],
      paint: [paintBefore(A, B), paintBefore(B, A)],
    })
  );
  const firstConflict = expectConflict(cycle1, "paint-cycle");
  const secondConflict = expectConflict(cycle2, "paint-cycle");
  assertEqual(firstConflict, secondConflict, "canonical paint cycle conflict");
  assert(
    firstConflict.conflict.message === "Paint cycle: A -> B -> A",
    firstConflict.conflict.message
  );
});

test("dependency and paint partial orders are separate", () => {
  const solved = expectSolved(
    solveFragment(
      fragment({
        nodes: [node(B), node(A)],
        dependencies: [dependency(A, B)],
        paint: [paintBefore(B, A)],
      })
    )
  );
  assertEqual(solved.dependencyOrder, [A, B], "dependency order");
  assertEqual(solved.paintOrder, [B, A], "paint order");
  assert(solvedMin(solved, "x", A) === 0, "paint moved A");
  assert(solvedMin(solved, "x", B) === 0, "dependency moved B");
});

test("duplicate fragment composition is idempotent", () => {
  const value = fragment({
    nodes: [node(A), node(B)],
    pins: [pin("x", start(A), 10)],
    relations: [relation("x", start(A), start(B), 5)],
    dependencies: [dependency(A, B)],
    paint: [paintBefore(A, B)],
  });
  assertEqual(composeFragments(value, value), value, "fragment idempotence");
  assertEqual(
    solveFragment(composeFragments(value, value)),
    solveFragment(value),
    "solve idempotence"
  );
});

test("absolute translation shifts pinned components and preserves differences", () => {
  const source = fragment({
    nodes: [node(A), node(B)],
    pins: [pin("x", start(A), 10)],
    relations: [relation("x", start(A), start(B), 5)],
  });
  const original = expectSolved(solveFragment(source));
  const shifted = expectSolved(
    solveFragment(translateFragment(source, { x: 37, y: -11 }))
  );
  assert(
    solvedMin(shifted, "x", A)! - solvedMin(original, "x", A)! === 37,
    "A translation"
  );
  assert(
    solvedMin(shifted, "x", B)! - solvedMin(original, "x", B)! === 37,
    "B translation"
  );
  assert(
    solvedMin(original, "x", B)! - solvedMin(original, "x", A)! ===
      solvedMin(shifted, "x", B)! - solvedMin(shifted, "x", A)!,
    "relative solution changed"
  );
  assertEqual(
    shifted.axes.x.bounds,
    {
      min: original.axes.x.bounds!.min + 37,
      max: original.axes.x.bounds!.max + 37,
    },
    "bounds translation"
  );
  assert(
    shifted.axes.x.bounds!.max - shifted.axes.x.bounds!.min ===
      original.axes.x.bounds!.max - original.axes.x.bounds!.min,
    "translation changed occupied extent"
  );
});

test("disconnected components are local and free components normalize at min zero", () => {
  const base = fragment({
    nodes: [node(A), node(B), node(C), node(D)],
    pins: [pin("x", start(A), 10)],
    relations: [
      relation("x", start(A), start(B), 5),
      relation("x", start(C), start(D), -3),
    ],
  });
  const extended = composeFragments(
    base,
    fragment({ nodes: [node(E)], pins: [pin("x", start(E), 100)] })
  );
  const one = expectSolved(solveFragment(base));
  const two = expectSolved(solveFragment(extended));
  for (const id of [A, B, C, D])
    assert(
      solvedMin(one, "x", id) === solvedMin(two, "x", id),
      `${id} changed through a disconnected component`
    );
  assert(solvedMin(one, "x", C) === 3, "free relative predecessor");
  assert(solvedMin(one, "x", D) === 0, "free component min is not zero");
  assertEqual(
    one.axes.x.bounds,
    { min: 0, max: 25 },
    "pinned and free component hull"
  );
  assertEqual(
    two.axes.x.bounds,
    { min: 0, max: 110 },
    "disconnected pin did not expand only the aggregate hull"
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
