/**
 * THROWAWAY PROTOTYPE (#1266). Hard examples, each written three ways:
 *  - `jsx`:    spelling A, nesting (flow steps wrap the mark);
 *  - `fluent`: the existing fluent chain, the reference;
 *  - `specB`:  spelling B, fluent value as a prop or a JSX child (some);
 *  - `specC`:  spelling C, pipeline as props on one element (some).
 * The tests check that `jsx` builds the same frontend IR (where the JS
 * emitter can write one) and the same display list as `fluent`.
 */
import type { ReactElement } from "react";
import {
  Chart,
  Spread,
  Stack,
  Layer,
  Rect,
  Ellipse,
  Text,
  Line,
  Ribbon,
  Arrow,
  Ref,
  Label,
  GoFish,
  chart,
  spread,
  stack,
  rect,
  ellipse,
  text,
  line,
  ribbon,
  arrow,
  ref,
  layer,
  map,
  selectAll,
  field,
  createMark,
  createName,
  Constraint,
  Coord,
} from "../src/index";
import { seafood } from "../../gofish-graphics/src/data/catch";

export type Example = {
  title: string;
  jsx: () => ReactElement;
  fluent: () => any;
  specB?: () => ReactElement;
  specC?: () => ReactElement;
  /** False when the JS IR emitter cannot write this example. */
  hasIR: boolean;
};

// 1. Stacked bar chart (nested flow).
export const stackedBar: Example = {
  title: "Stacked bar",
  hasIR: true,
  jsx: () => (
    <Chart data={seafood} w={400} h={400}>
      <Spread by="lake" dir="x">
        <Stack by="species" dir="y">
          <Rect h="count" fill="species" />
        </Stack>
      </Spread>
    </Chart>
  ),
  fluent: () =>
    chart(seafood, { w: 400, h: 400 })
      .flow(
        spread({ by: "lake", dir: "x" }),
        stack({ by: "species", dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" })),
  specB: () => (
    <GoFish
      spec={chart(seafood, { w: 400, h: 400 })
        .flow(
          spread({ by: "lake", dir: "x" }),
          stack({ by: "species", dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }))}
    />
  ),
  specC: () => (
    <Chart
      data={seafood}
      w={400}
      h={400}
      flow={[
        spread({ by: "lake", dir: "x" }),
        stack({ by: "species", dir: "y" }),
      ]}
      mark={rect({ h: "count", fill: "species" })}
    />
  ),
};

// 2. Ribbon chart: a `.layer()` tier is a later child of <Chart>.
export const ribbonChart: Example = {
  title: "Ribbon chart (.layer tier)",
  hasIR: true,
  jsx: () => (
    <Chart data={seafood} h={400}>
      <Spread by="lake" dir="x" spacing={64}>
        <Stack by={field("species").sort("count")} dir="y">
          <Rect h="count" fill="species" />
        </Stack>
      </Spread>
      <Ribbon opacity={0.8} />
    </Chart>
  ),
  fluent: () =>
    chart(seafood, { h: 400 })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 64 }),
        stack({ by: field("species").sort("count"), dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .layer(ribbon({ opacity: 0.8 })),
};

// 3. Bars + line through a second chart over selectAll("bars").
export const barsAndLine: Example = {
  title: "Bars + line (selectAll)",
  hasIR: true,
  jsx: () => (
    <Layer>
      <Chart data={seafood} w={400} h={300}>
        <Spread by="lake" dir="x" spacing={20}>
          <Rect h="count" fill="#9ecae1" name="bars" />
        </Spread>
      </Chart>
      <Chart data={selectAll("bars")}>
        <Line
          stroke="#08519c"
          strokeWidth={3}
          source={["middle", "end"]}
          target={["middle", "end"]}
        />
      </Chart>
    </Layer>
  ),
  fluent: () =>
    layer([
      chart(seafood, { w: 400, h: 300 })
        .flow(spread({ by: "lake", dir: "x", spacing: 20 }))
        .mark(rect({ h: "count", fill: "#9ecae1" }).name("bars")),
      chart(selectAll("bars")).mark(
        line({
          stroke: "#08519c",
          strokeWidth: 3,
          source: ["middle", "end"],
          target: ["middle", "end"],
        })
      ),
    ]),
  // Spelling B: fluent values as JSX children of a combinator.
  specB: () => (
    <Layer>
      {chart(seafood, { w: 400, h: 300 })
        .flow(spread({ by: "lake", dir: "x", spacing: 20 }))
        .mark(rect({ h: "count", fill: "#9ecae1" }).name("bars"))}
      {chart(selectAll("bars")).mark(
        line({
          stroke: "#08519c",
          strokeWidth: 3,
          source: ["middle", "end"],
          target: ["middle", "end"],
        })
      )}
    </Layer>
  ),
};

// 4. Labels: <Label> as a child of the mark it labels.
export const labeledStack: Example = {
  title: "Stacked bar with labels",
  hasIR: true,
  jsx: () => (
    <Chart data={seafood} w={440} h={400}>
      <Spread by="lake" dir="x">
        <Stack by="species" dir="y">
          <Rect h="count" fill="species">
            <Label
              field="species"
              position="center"
              color="white"
              fontSize={12}
            />
          </Rect>
        </Stack>
      </Spread>
    </Chart>
  ),
  fluent: () =>
    chart(seafood, { w: 440, h: 400 })
      .flow(
        spread({ by: "lake", dir: "x" }),
        stack({ by: "species", dir: "y" })
      )
      .mark(
        rect({ h: "count", fill: "species" }).label("species", {
          position: "center",
          color: "white",
          fontSize: 12,
        })
      ),
};

// 5. Polar: a pie (clock coord) is chart options as props.
export const pie: Example = {
  title: "Pie (Coord.clock)",
  hasIR: true,
  jsx: () => (
    <Chart
      data={seafood}
      coord={Coord.clock()}
      axes
      padding={80}
      w={400}
      h={400}
    >
      <Stack by="species" dir="x">
        <Rect w="count" fill="species" />
      </Stack>
    </Chart>
  ),
  fluent: () =>
    chart(seafood, {
      coord: Coord.clock(),
      axes: true,
      padding: 80,
      w: 400,
      h: 400,
    })
      .flow(stack({ by: "species", dir: "x" }))
      .mark(rect({ w: "count", fill: "species" })),
};

// 6. Combinator diagram with ref + arrow + .relate (Bluefish planets).
const planets = [
  { name: "Mercury", radius: 15, color: "#EBE3CF" },
  { name: "Venus", radius: 36, color: "#DC933C" },
  { name: "Earth", radius: 38, color: "#179DD7" },
  { name: "Mars", radius: 21, color: "#F1CF8E" },
];

export const planetsArrow: Example = {
  title: "Planets with arrow (ref, arrow, relate)",
  hasIR: false, // arrow and .relate have no JS-side IR tag
  jsx: () => (
    <Layer
      relate={({ Mercury }: any) => [
        <Spread dir="y" spacing={60} alignment="middle">
          <Text text="Mercury" name="label" />
          {Mercury}
        </Spread>,
        <Arrow>
          <Ref to="label" />
          {Mercury}
        </Arrow>,
      ]}
    >
      <Spread dir="x" spacing={50} alignment="middle">
        {planets.map((p) => (
          <Ellipse
            key={p.name}
            w={p.radius * 2}
            h={p.radius * 2}
            fill={p.color}
            stroke="#333"
            strokeWidth={3}
            name={p.name}
          />
        ))}
      </Spread>
    </Layer>
  ),
  fluent: () =>
    layer([
      spread(
        { dir: "x", spacing: 50, alignment: "middle" },
        map(planets, (p: any) =>
          ellipse({
            w: p.radius * 2,
            h: p.radius * 2,
            fill: p.color,
            stroke: "#333",
            strokeWidth: 3,
          }).name(p.name)
        )
      ),
    ]).relate(({ Mercury }: any) => [
      spread({ dir: "y", spacing: 60, alignment: "middle" }, [
        text({ text: "Mercury" }).name("label"),
        Mercury,
      ]),
      arrow({}, [ref("label"), Mercury]),
    ]),
};

// 7. createMark as a plain React function component (node-link diagram).
const edge = { stroke: "#90a4ae", strokeWidth: 2 } as const;
const across = {
  source: ["end", "middle"],
  target: ["start", "middle"],
} as any;

function Node({ label }: { label: string }) {
  return (
    <Layer
      w={76}
      h={40}
      relate={({ box, caption }: any) => [
        Constraint.align({ x: "middle", y: "middle" }, [box, caption]),
      ]}
    >
      <Rect
        w={76}
        h={40}
        rx={6}
        fill="#e2ebf6"
        stroke="#457b9d"
        strokeWidth={2}
        name="box"
      />
      <Text text={label} fontSize={14} fill="#1d3557" name="caption" />
    </Layer>
  );
}

const NodeF = createMark(({ label }: { label: string }) =>
  layer({ w: 76, h: 40 }, [
    rect({
      w: 76,
      h: 40,
      rx: 6,
      fill: "#e2ebf6",
      stroke: "#457b9d",
      strokeWidth: 2,
    }).name("box"),
    text({ text: label, fontSize: 14, fill: "#1d3557" }).name("caption"),
  ]).relate(({ box, caption }: any) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, caption]),
  ])
);

const nodeConstraints = (c: any) => [
  Constraint.distribute({ dir: "x", spacing: 60, anchor: "edge" }, [
    c.A,
    c.B,
    c.C,
  ]),
  Constraint.align({ y: "middle" }, [c.A, c.B, c.C]),
  Constraint.distribute({ dir: "y", spacing: 60, anchor: "edge" }, [c.D, c.B]),
  Constraint.align({ x: "middle" }, [c.B, c.D]),
];

export const nodeLink: Example = {
  title: "Node-link (component = createMark)",
  hasIR: false, // createMark and .relate have no JS-side IR tag
  jsx: () => {
    const [A, B, C, D] = ["A", "B", "C", "D"].map((n) => createName(n));
    return (
      <Layer x={20} y={20}>
        <Layer relate={nodeConstraints}>
          <Node label="A" name={A} />
          <Node label="B" name={B} />
          <Node label="C" name={C} />
          <Node label="D" name={D} />
        </Layer>
        <Line {...edge} {...across} zOrder={-1}>
          <Ref to={A} />
          <Ref to={B} />
        </Line>
        <Line {...edge} {...across} zOrder={-1}>
          <Ref to={B} />
          <Ref to={C} />
        </Line>
        <Line
          {...edge}
          source={["middle", "start"]}
          target={["middle", "end"]}
          zOrder={-1}
        >
          <Ref to={B} />
          <Ref to={D} />
        </Line>
      </Layer>
    );
  },
  fluent: () => {
    const [A, B, C, D] = ["A", "B", "C", "D"].map((n) => createName(n));
    return layer({ x: 20, y: 20 }, [
      layer([
        NodeF({ label: "A" }).name(A),
        NodeF({ label: "B" }).name(B),
        NodeF({ label: "C" }).name(C),
        NodeF({ label: "D" }).name(D),
      ]).relate(nodeConstraints),
      line({ ...edge, ...across }, [ref(A), ref(B)]).zOrder(-1),
      line({ ...edge, ...across }, [ref(B), ref(C)]).zOrder(-1),
      line(
        { ...edge, source: ["middle", "start"], target: ["middle", "end"] },
        [ref(B), ref(D)]
      ).zOrder(-1),
    ]);
  },
};

export const EXAMPLES: Record<string, Example> = {
  stackedBar,
  ribbonChart,
  barsAndLine,
  labeledStack,
  pie,
  planetsArrow,
  nodeLink,
};
