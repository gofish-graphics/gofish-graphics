import type { LabelStrategy } from "./types";

/**
 * Area-label placement via Mapbox's polylabel algorithm: find the polygon's
 * pole of inaccessibility (interior point farthest from any edge).
 *
 * Reads `node.renderData.polygon` — a closed ring `[x, y][]` in node-parent-
 * local coords (the connect operator populates this for area-mode marks).
 */
export const areaStrategy: LabelStrategy = {
  place(node, _obstacles, _label, ctx) {
    const polygon = node.renderData?.polygon as [number, number][] | undefined;
    if (!polygon || polygon.length < 3) return { kind: "hidden" };

    const result = polylabel([polygon], 1.0);
    if (!result) return { kind: "hidden" };

    const [localX, localY] = result;
    const tx = ctx.parentTranslate[0] + (node.transform?.translate?.[0] ?? 0);
    const ty = ctx.parentTranslate[1] + (node.transform?.translate?.[1] ?? 0);

    return {
      kind: "transform",
      x: tx + localX,
      y: ty + localY,
      anchor: "middle",
      baseline: "central",
    };
  },
};

// ─── polylabel port (Mapbox; ISC-licensed) ──────────────────────────────────
// Adapted from https://github.com/mapbox/polylabel — pure-math reimplementation
// without the `tinyqueue` dep (uses an inline max-heap).

type Polygon = [number, number][][]; // outer ring + optional holes

function polylabel(polygon: Polygon, precision = 1.0): [number, number] | null {
  if (!polygon[0] || polygon[0].length < 3) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of polygon[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.max(precision, Math.min(width, height));
  if (cellSize === 0) return [minX, minY];
  let h = cellSize / 2;

  const heap = new MaxHeap();

  // Initial cover.
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      heap.push(new Cell(x + h, y + h, h, polygon));
    }
  }

  // First guesses.
  let bestCell = getCentroidCell(polygon);
  const bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, polygon);
  if (bboxCell.d > bestCell.d) bestCell = bboxCell;

  while (heap.length) {
    const cell = heap.pop()!;
    if (cell.d > bestCell.d) bestCell = cell;
    if (cell.max - bestCell.d <= precision) continue;
    h = cell.h / 2;
    heap.push(new Cell(cell.x - h, cell.y - h, h, polygon));
    heap.push(new Cell(cell.x + h, cell.y - h, h, polygon));
    heap.push(new Cell(cell.x - h, cell.y + h, h, polygon));
    heap.push(new Cell(cell.x + h, cell.y + h, h, polygon));
  }

  return [bestCell.x, bestCell.y];
}

class Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
  constructor(x: number, y: number, h: number, polygon: Polygon) {
    this.x = x;
    this.y = y;
    this.h = h;
    this.d = pointToPolygonDist(x, y, polygon);
    this.max = this.d + this.h * Math.SQRT2;
  }
}

function getCentroidCell(polygon: Polygon): Cell {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const points = polygon[0];
  for (let i = 0, len = points.length, j = len - 1; i < len; j = i++) {
    const a = points[i];
    const b = points[j];
    const f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f;
    cy += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (area === 0) return new Cell(points[0][0], points[0][1], 0, polygon);
  return new Cell(cx / area, cy / area, 0, polygon);
}

/** Signed distance: positive inside polygon, negative outside. */
function pointToPolygonDist(x: number, y: number, polygon: Polygon): number {
  let inside = false;
  let minDistSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (
        a[1] > y !== b[1] > y &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
      ) {
        inside = !inside;
      }
      minDistSq = Math.min(minDistSq, segDistSq(x, y, a, b));
    }
  }
  const d = Math.sqrt(minDistSq);
  return minDistSq === 0 ? 0 : (inside ? 1 : -1) * d;
}

function segDistSq(
  px: number,
  py: number,
  a: [number, number],
  b: [number, number]
): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

// ─── Inline max-heap on Cell.max ────────────────────────────────────────────
class MaxHeap {
  private data: Cell[] = [];
  get length() {
    return this.data.length;
  }
  push(c: Cell): void {
    this.data.push(c);
    this.siftUp(this.data.length - 1);
  }
  pop(): Cell | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }
  private siftUp(i: number): void {
    const item = this.data[i];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].max >= item.max) break;
      this.data[i] = this.data[parent];
      i = parent;
    }
    this.data[i] = item;
  }
  private siftDown(i: number): void {
    const item = this.data[i];
    const len = this.data.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let best = i;
      if (l < len && this.data[l].max > this.data[best].max) best = l;
      if (r < len && this.data[r].max > this.data[best].max) best = r;
      if (best === i) break;
      this.data[i] = this.data[best];
      i = best;
    }
    this.data[i] = item;
  }
}
