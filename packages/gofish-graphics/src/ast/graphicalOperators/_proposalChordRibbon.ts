// THROWAWAY PROTOTYPE for proposals/stacked-ribbons (chord diagram). Not
// exported from lib.ts, not serialized, not tested. Delete with the proposal.
//
// A chord ribbon between two operands that live in a polar space: each end
// is the operand's INNER face (its r.min edge, the "bottom" part of a polar
// rect), traced as an arc in coordinate space; the two ends are joined by
// quadratic curves whose control point is the circle's CENTER in SCREEN
// space (d3.ribbon's shape). One operand draws a self-chord.
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import type { DisplayList } from "gofish-ir";
import { resolveColorChannel } from "../../color";
import { isValue, type MaybeValue } from "../data";
import { axisScale } from "../domain";
import { UNDEFINED } from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import { lowerStyle, roleFor } from "../displayList/lowerHelpers";
import { createRelationalMark } from "../marks/chart";

type Opts = { fill?: MaybeValue<string>; opacity?: number; samples?: number };

const ChordNode = createNodeOperator(
  ({ fill, opacity, samples = 32 }: Opts, children: GoFishAST[]) =>
    new GoFishNode(
      {
        // "connect" so the polar bake (coordinateTransforms/bake.ts
        // RELATIONAL_TYPES) treats this node as a leaf; any other type is
        // flattened through and never lowered.
        type: "connect",
        color: isValue(fill) ? fill : undefined,
        resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
        layout: (size: any, scales: any, kids: any[]) => {
          const placed = kids.map((c: any) =>
            c.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ])
          );
          // Each end: [theta.min, theta.max, r.min] (the inner face).
          const ends = placed.map((p: any) => [
            p.dims[0].min,
            p.dims[0].max,
            p.dims[1].min,
          ]);
          const xs = ends.flatMap((e: number[]) => [e[0], e[1]]);
          const rs = ends.map((e: number[]) => e[2]);
          return {
            intrinsicDims: [
              { min: Math.min(...xs), size: Math.max(...xs) - Math.min(...xs) },
              { min: 0, size: Math.max(...rs) },
            ],
            transform: { translate: [0, 0] },
            renderData: { ends },
          };
        },
        lower: (
          { renderData, coordinateTransform, toPixel, local }: any,
          _children: any,
          node: any
        ): DisplayList.DisplayItem[] => {
          const toScreen = (p: [number, number]): [number, number] => {
            const q = local(p);
            return toPixel(
              coordinateTransform ? coordinateTransform.transform(q) : q
            );
          };
          // The center of the circle, in screen space. r = 0 in the local
          // frame; `local` may translate theta, which does not matter at r = 0.
          const c = toScreen([0, 0]);
          const arc = (e: number[]) =>
            Array.from({ length: samples + 1 }, (_, i) =>
              toScreen([e[0] + ((e[1] - e[0]) * i) / samples, e[2]])
            );
          const ends = renderData.ends as number[][];
          const a = arc(ends[0]);
          const b = ends.length > 1 ? arc(ends[1]) : a;
          const pt = (p: number[]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
          const d =
            `M${pt(a[0])}` +
            a
              .slice(1)
              .map((p) => `L${pt(p)}`)
              .join("") +
            `Q${pt(c)} ${pt(b[0])}` +
            b
              .slice(1)
              .map((p) => `L${pt(p)}`)
              .join("") +
            `Q${pt(c)} ${pt(a[0])}Z`;
          const scaleContext = node.getRenderSession().scaleContext;
          const color =
            resolveColorChannel(fill, scaleContext?.unit) ?? "black";
          return [
            {
              kind: "path",
              d,
              role: roleFor(node.datum),
              datum: node.datum,
              style: lowerStyle({
                fill: color,
                stroke: color,
                strokeWidth: 0,
                opacity: opacity ?? 1,
                mixBlendMode: "normal",
              } as any),
            } as DisplayList.DisplayItem,
          ];
        },
      } as any,
      children
    )
);

// Registered under the "ribbon" type so the group paint resolver
// (chart.ts resolveGroupPaint -> paintChannelsOf(type)) resolves `fill`.
export const chordRibbon = createRelationalMark<Opts>("ribbon", (o, children) =>
  ChordNode(o as Opts, children)
);
