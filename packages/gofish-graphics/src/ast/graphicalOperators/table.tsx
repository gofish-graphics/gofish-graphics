import { For } from "solid-js";
import { GoFishNode, Placeable } from "../_node";
import { Size } from "../dims";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import { ORDINAL, UNDEFINED } from "../underlyingSpace";
import { UnderlyingSpace } from "../underlyingSpace";
import { createOperator } from "../marks/createOperator";

export const Table = createNodeOperator(
  (
    {
      name,
      key,
      numCols: numColsOpt,
      spacing = 0,
      colKeys,
      rowKeys,
    }: {
      name?: string;
      key?: string;
      numCols?: number;
      spacing?: number | [number, number];
      colKeys?: string[];
      rowKeys?: string[];
    },
    children: GoFishAST[]
  ) => {
    // Prefer explicit numCols; fall back to colKeys.length; finally to a
    // single-row layout if neither is available.
    const numCols = numColsOpt ?? colKeys?.length ?? children.length;
    const xSpacing = Array.isArray(spacing) ? spacing[0] : spacing;
    const ySpacing = Array.isArray(spacing) ? spacing[1] : spacing;

    return new GoFishNode(
      {
        type: "table",
        args: { key, name, numCols, spacing, colKeys, rowKeys },
        key,
        name,
        shared: [false, false],
        resolveUnderlyingSpace: (
          childSpaces: Size<UnderlyingSpace>[],
          childNodes: GoFishAST[]
        ) => {
          const numRows = Math.ceil(childSpaces.length / numCols);

          // x-axis: ORDINAL over columns
          let xSpace: UnderlyingSpace = UNDEFINED;
          if (colKeys && colKeys.length > 0) {
            xSpace = ORDINAL(colKeys);
          } else {
            const firstRowKeys = childNodes
              .slice(0, numCols)
              .filter((node): node is GoFishNode => node instanceof GoFishNode)
              .map((node) => node.key)
              .filter((k): k is string => k !== undefined);
            if (firstRowKeys.length > 0) {
              xSpace = ORDINAL(firstRowKeys);
            }
          }

          // y-axis: ORDINAL over rows
          let ySpace: UnderlyingSpace = UNDEFINED;
          if (rowKeys && rowKeys.length > 0) {
            ySpace = ORDINAL(rowKeys);
          } else {
            const firstColKeys = Array.from(
              { length: numRows },
              (_, r) => r * numCols
            )
              .map((idx) => childNodes[idx])
              .filter((node): node is GoFishNode => node instanceof GoFishNode)
              .map((node) => node.key)
              .filter((k): k is string => k !== undefined);
            if (firstColKeys.length > 0) {
              ySpace = ORDINAL(firstColKeys);
            }
          }

          return [xSpace, ySpace];
        },
        layout: (_shared, size, scaleFactors, children, posScales, node) => {
          const numRows = Math.ceil(children.length / numCols);
          const cellW = (size[0] - xSpacing * (numCols - 1)) / numCols;
          const cellH = (size[1] - ySpacing * (numRows - 1)) / numRows;

          const session = node.getRenderSession();
          const scaleContext = session.scaleContext;
          scaleContext.x = {
            domain: [0, size[0] / (scaleFactors[0] ?? 1)],
            scaleFactor: scaleFactors[0] ?? 1,
          };
          scaleContext.y = {
            domain: [0, size[1] / (scaleFactors[1] ?? 1)],
            scaleFactor: scaleFactors[1] ?? 1,
          };

          const cellSize: Size = [cellW, cellH];
          const childPlaceables: Placeable[] = children.map((child) =>
            child.layout(cellSize, scaleFactors, posScales)
          );

          for (let i = 0; i < childPlaceables.length; i++) {
            const child = childPlaceables[i];
            const col = i % numCols;
            const row = Math.floor(i / numCols);
            child.place(0, col * (cellW + xSpacing), "min");
            child.place(1, row * (cellH + ySpacing), "min");
          }

          // Register representative cells in keyContext for ordinal axis labels.
          // First-row cells provide x-positions for column keys.
          // First-column cells provide y-positions for row keys.
          // The same cell at (0,0) can be registered under both — buildOrdinalScaleX
          // only reads its x-center and buildOrdinalScaleY only reads its y-center.
          const keyContext = session.keyContext;
          if (colKeys) {
            for (
              let j = 0;
              j < Math.min(numCols, childPlaceables.length);
              j++
            ) {
              keyContext[colKeys[j]] = childPlaceables[
                j
              ] as unknown as GoFishNode;
            }
          }
          if (rowKeys) {
            for (let i = 0; i < numRows; i++) {
              const idx = i * numCols;
              if (idx < childPlaceables.length) {
                keyContext[rowKeys[i]] = childPlaceables[
                  idx
                ] as unknown as GoFishNode;
              }
            }
          }

          const xMin = Math.min(...childPlaceables.map((c) => c.dims[0].min!));
          const xMax = Math.max(...childPlaceables.map((c) => c.dims[0].max!));
          const yMin = Math.min(...childPlaceables.map((c) => c.dims[1].min!));
          const yMax = Math.max(...childPlaceables.map((c) => c.dims[1].max!));

          return {
            intrinsicDims: {
              0: {
                min: xMin,
                size: xMax - xMin,
                center: (xMin + xMax) / 2,
                max: xMax,
              },
              1: {
                min: yMin,
                size: yMax - yMin,
                center: (yMin + yMax) / 2,
                max: yMax,
              },
            },
            transform: {
              translate: { 0: undefined, 1: undefined },
            },
          };
        },
        render: ({ transform }, children) => {
          return (
            <g
              transform={`translate(${transform?.translate?.[0] ?? 0}, ${transform?.translate?.[1] ?? 0})`}
            >
              {children}
            </g>
          );
        },
      },
      children
    );
  }
);

export type TableOptions = {
  by?: { x: string; y: string };
  spacing?: number | [number, number];
  numCols?: number;
};

export const table = createOperator<any, TableOptions>(Table, {
  split: ({ by }, d) => {
    if (!by?.x || !by?.y)
      throw new Error(
        "table operator form requires opts.by = { x: fieldName, y: fieldName }"
      );
    const colKeys = [...new Map(d.map((r) => [String(r[by.x]), true])).keys()];
    const rowKeys = [...new Map(d.map((r) => [String(r[by.y]), true])).keys()];
    const entries = new Map<string | number, any[]>();
    for (const rowKey of rowKeys)
      for (const colKey of colKeys)
        entries.set(
          `${colKey}-${rowKey}`,
          d.filter(
            (r) => String(r[by.x]) === colKey && String(r[by.y]) === rowKey
          )
        );
    return { entries, keys: { colKeys, rowKeys } };
  },
  axisFields: ({ by }) => (by ? { x: by.x, y: by.y } : undefined),
});
