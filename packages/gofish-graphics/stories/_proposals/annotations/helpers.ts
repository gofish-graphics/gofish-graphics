/**
 * Approach B prototypes: small annotation shorthands, each a plain local
 * function that expands into today's primitives and nothing else. None of
 * them touches the library. Each comment gives the exact expansion, so a
 * story spelled with a shorthand and one spelled with its expansion are the
 * same spec (compare the A and B stories' normalized SVGs).
 */
import { maxBy, orderBy } from "lodash";
import {
  arrow,
  Color,
  Constraint,
  Curve,
  datum,
  derive,
  enclose,
  GoFishRef,
  layer,
  line,
  project,
  rect,
  Shape,
  spread,
  text,
} from "../../../src/lib";

// ─── Selection: extrema ──────────────────────────────────────────────────────

/** `argmax(field)` ≡ `derive(xs => [maxBy(xs, x => project(x, field))])`.
 *  A flow step over a selection (refs) or over rows: keeps the one item with
 *  the largest `field`. Ties keep the first. */
export const argmax = (field: string) =>
  derive((xs: any[]) => [maxBy(xs, (x) => read(x, field))]);

/** `argmin(field)`: the same with the smallest `field`. */
export const argmin = (field: string) =>
  derive((xs: any[]) => [maxBy(xs, (x) => -read(x, field))]);

/** `top(n, field)` ≡ `derive(xs => orderBy(xs, x => project(x, field), "desc").slice(0, n))`. */
export const top = (n: number, field: string) =>
  derive((xs: any[]) => orderBy(xs, (x) => read(x, field), "desc").slice(0, n));

// A ref reads its field through `project`; a plain row reads it directly.
const read = (x: any, field: string) =>
  x && typeof x === "object" && !Array.isArray(x) && !(x instanceof GoFishRef)
    ? x[field]
    : project(x, field);

// ─── Reference marks: rule and band ──────────────────────────────────────────

type Scalar = number | string | Date;
// A data value on a time axis is its epoch milliseconds: `datum("2015-06-01")`
// does not place today (it is not parsed), so the helpers convert.
const num = (v: Scalar): number =>
  typeof v === "number" ? v : v instanceof Date ? v.getTime() : Date.parse(v);
const unwrap = (v: any): Scalar =>
  v && typeof v === "object" && v.type === "datum" ? v.datum : v;

type Paint = {
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
};

/** `rule({ y: v })` ≡ `rect({ y: datum(v), h: strokeWidth, fill: stroke })`;
 *  `rule({ x: v })` ≡ `rect({ x: datum(v), w: strokeWidth, fill: stroke })`.
 *  With no length on the other axis the rect spans the plot. Returns the rect,
 *  so `.label()` and `.zOrder()` chain as on any mark. */
export const rule = (
  o: { x?: Scalar; y?: Scalar } & Paint
): ReturnType<typeof rect> => {
  const sw = o.strokeWidth ?? 1;
  const fill = o.stroke ?? "#444";
  return o.y !== undefined
    ? rect({ y: datum(num(unwrap(o.y))), h: sw, fill, opacity: o.opacity })
    : rect({ x: datum(num(unwrap(o.x!))), w: sw, fill, opacity: o.opacity });
};

/** `band({ x: [a, b] })` ≡ `rect({ x: datum(a), x2: datum(b), fill })`,
 *  and the same in y. Returns the rect. */
export const band = (
  o: { x?: [Scalar, Scalar]; y?: [Scalar, Scalar] } & Paint
): ReturnType<typeof rect> => {
  const paint = { fill: o.fill ?? "#f2b45c", opacity: o.opacity ?? 0.25 };
  if (o.x) {
    const [a, b] = o.x.map((v) => num(unwrap(v)));
    return rect({ x: datum(a), x2: datum(b), ...paint });
  }
  const [a, b] = o.y!.map((v) => num(unwrap(v)));
  return rect({ y: datum(a), h: datum(b - a), ...paint });
};

// ─── Callout: subject + note + connector ─────────────────────────────────────

export type CalloutOptions = {
  /** The note: one string, or lines; the first line is the bold title. */
  note: string | string[];
  /** Pixels from the subject to the note: `dx < 0` puts it left, `dy > 0`
   *  puts it toward +y (up on a value axis). With no `dy`, the note's top
   *  is level with the subject's top. */
  dx: number;
  dy?: number;
  /** The outline drawn around the target. `null` draws none. Default oval. */
  subject?: Shape.Shape | null;
  /** Fill the subject (at 0.3 opacity, stroked in the same color) instead of
   *  outlining it in `color`. */
  fill?: string;
  padding?: number;
  connector?: "straight" | "curve" | "elbow";
  color?: string;
};

/**
 * `callout(target, opts)` where `target` is a chart over a selection
 * (`chart(selectAll("days")).flow(argmax("price"))`). Expands to:
 *
 *   layer([
 *     target.mark(enclose({ shape, padding, fill: "none", stroke }).name("subject")),
 *     spread({ dir: "y", alignment: "start" }, [text(title), text(body)…]).name("note"),
 *   ]).relate(({ subject, note }) => [
 *     Constraint.distribute({ dir: "x", spacing: |dx| }, dx < 0 ? [note, subject] : [subject, note]),
 *     Constraint.distribute({ dir: "y", spacing: |dy| }, dy > 0 ? [subject, note] : [note, subject]),
 *       // (no dy: Constraint.align({ y: "end" }, [subject, note]))
 *     arrow({ bow: 0, stretch: 0, … }, [note, subject]),   // or line({ curve: Curve.orthogonal() }) for "elbow"
 *   ])
 *
 * It cannot be a `.label()` option: a `.label()` position is a value of the
 * closed `Place` family, so a new `Place.offset({ dx, dy })` and a `leader`
 * option need library changes (a label is not a node a connector can name).
 * Used as a `.layer(...)` tier, it sees the chart's names.
 */
export const callout = (target: any, o: CalloutOptions) => {
  const color = o.color ?? "#c0392b";
  const lines = typeof o.note === "string" ? [o.note] : o.note;
  const note = spread(
    { dir: "y", spacing: 2, alignment: "start" },
    lines.map((t, i) =>
      text({
        text: t,
        ...(i === 0 ? { fontSize: 13, fontWeight: 700 } : {}),
      })
    )
  );
  const subject =
    o.subject === null
      ? enclose({ padding: o.padding ?? 3, fill: "none", stroke: "none" })
      : o.fill !== undefined
        ? enclose({
            shape: o.subject ?? Shape.oval(),
            padding: o.padding ?? 6,
            fill: o.fill,
            stroke: o.fill,
            fillOpacity: 0.3,
          })
        : enclose({
            shape: o.subject ?? Shape.oval(),
            padding: o.padding ?? 6,
            fill: "none",
            stroke: color,
            strokeWidth: 1.5,
          });
  return layer([
    target.mark(subject.name("subject")),
    note.name("note"),
  ]).relate(({ subject, note }) => [
    Constraint.distribute(
      { dir: "x", spacing: Math.abs(o.dx) },
      o.dx < 0 ? [note, subject] : [subject, note]
    ),
    o.dy === undefined
      ? Constraint.align({ y: "end" }, [subject, note])
      : Constraint.distribute(
          { dir: "y", spacing: Math.abs(o.dy) },
          o.dy > 0 ? [subject, note] : [note, subject]
        ),
    o.connector === "elbow"
      ? line({ stroke: color, curve: Curve.orthogonal() }, [note, subject])
      : arrow(
          {
            bow: o.connector === "curve" ? 0.4 : 0,
            stretch: 0,
            strokeWidth: 1,
            padStart: 4,
            padEnd: 2,
            stroke: color,
          },
          [note, subject]
        ),
  ]);
};

// ─── Emphasis: one declaration for color and z ───────────────────────────────

/**
 * `emphasize(field, { AAPL: "#d62728" }, ["color", "z", "label"])` returns the
 * two places the declaration has to land today, because the color scale is a
 * chart option and paint order and labels are mark modifiers (#641):
 *
 *   hi.chart  ≡ { color: Color.palette({ AAPL: "#d62728" }) }  // others gray
 *   hi.mark(m) ≡ m.zOrder(d => emph(d) ? 1 : 0)
 *                 .label(d => emph(d) ? project(d, field) : "", { position })
 *
 * The mark's own color channel must still read `field` (`stroke: "symbol"`).
 */
export const emphasize = (
  field: string,
  colors: Record<string, string>,
  channels: ("color" | "z" | "label")[] = ["color", "z"],
  labelOptions: Record<string, unknown> = {}
) => {
  const emph = (d: any) => read(d, field) in colors;
  return {
    chart: channels.includes("color") ? { color: Color.palette(colors) } : {},
    mark: (m: any) => {
      let out = m;
      if (channels.includes("z"))
        out = out.zOrder((d: any) => (emph(d) ? 1 : 0));
      if (channels.includes("label"))
        out = out.label(
          (d: any) => (emph(d) ? String(read(d, field)) : ""),
          labelOptions
        );
      return out;
    },
  };
};
