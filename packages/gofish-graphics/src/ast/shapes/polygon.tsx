import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { Dimensions, displayTranslate, Size, Transform } from "../dims";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { createMark } from "../withGoFish";

/**
 * A closed polygon defined by explicit local-coordinate points (GoFish-native
 * y-up). The bounding box is computed from the points; the parent constraint
 * system places it via `transform.translate`.
 */
export const Polygon = ({
  name,
  fill = "black",
  stroke = fill,
  strokeWidth = 0,
  points,
}: {
  name?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  points: [number, number][];
}) => {
  // Without an explicit guard, Math.min(...[]) → Infinity and
  // Math.max(...[]) → -Infinity, producing a bbox with size: -Infinity that
  // silently corrupts downstream layout. Three points is the closed-polygon
  // floor.
  if (points.length < 3) {
    throw new Error(`polygon requires at least 3 points, got ${points.length}`);
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return new GoFishNode(
    {
      name,
      type: "polygon",
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ) => [UNDEFINED, UNDEFINED],
      layout: () => ({
        intrinsicDims: [
          {
            min: minX,
            size: maxX - minX,
          },
          {
            min: minY,
            size: maxY - minY,
          },
        ],
        // translate is set by the parent's constraint placement.
        transform: { translate: [undefined, undefined] },
      }),
      render: ({
        transform,
      }: {
        intrinsicDims?: Dimensions;
        transform?: Transform;
        coordinateTransform?: CoordinateTransform;
      }) => {
        const [tx, ty] = displayTranslate(transform);
        // GoFish is y-up; emit under scale(1, -1) like rect.tsx.
        const pts = points.map(([x, y]) => `${x + tx},${-(y + ty)}`).join(" ");
        return (
          <polygon
            transform="scale(1, -1)"
            points={pts}
            fill={fill}
            stroke={stroke ?? fill ?? "black"}
            stroke-width={strokeWidth ?? 0}
          />
        );
      },
    },
    []
  );
};

export const polygon = createMark(Polygon, undefined, "polygon");
