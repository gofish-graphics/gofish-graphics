/**
 * THROWAWAY PROTOTYPE (#1266). JSX element tree -> GoFish builder calls.
 *
 * Approach: no react-reconciler. A GoFish JSX tree is a plain value
 * (`{ type, props }` objects), so we walk it directly. Each GoFish component
 * carries a `gofish` spec (its factory and kind); a user-written function
 * component is expanded by calling it, inside `createMark`, so a React
 * component is exactly a GoFish custom mark (name scope included).
 *
 * Why builder calls and not frontend IR: the JS emitter (`Serialize.toJSON`)
 * drops function-valued options, and it cannot emit `arrow`, `.relate()` or
 * `createMark` at all (they have no JS-side wire tag). Going JSX -> IR ->
 * `buildIR` would lose every closure (`derive(fn)`, accessor callbacks,
 * relate bodies) unless we also built an in-process lambda bridge. Going
 * JSX -> the same factories the fluent chain calls keeps closures live and
 * lets us check IR equivalence by calling `toJSON` on both results.
 *
 * Upgrade path: a custom reconciler (react-reconciler + its-fine) is needed
 * only if children must use hooks/state/context. Here a user component is
 * called as a plain function outside React's render, so a hook inside it
 * throws ("Invalid hook call").
 */
import {
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import * as GF from "gofish-graphics";

const { chart, createMark, ref } = GF as any;

export type Kind =
  | "chart" // <Chart data>: pipeline root
  | "operator" // flow step inside <Chart>, combinator over children outside
  | "combinator" // combinator only (<Layer>, <Frame>)
  | "mark" // leaf mark
  | "relational" // leaf mark / tier, or combinator over <Ref> children
  | "ref"
  | "label"
  | "spec"; // <GoFish spec={...}/> (spelling B)

export interface GoFishSpec {
  kind: Kind;
  /** The lowercase factory this component spells. */
  factory?: (...args: any[]) => any;
  /** Factory args for the leaf/flow-step form, from the props. */
  args?: (opts: Record<string, any>) => any[];
}

type Props = Record<string, any> & { children?: ReactNode };

const specOf = (el: ReactElement): GoFishSpec | undefined =>
  (el.type as any)?.gofish;

/** Flatten children: arrays, fragments, null/false/true dropped. */
export function flatten(children: ReactNode): unknown[] {
  const out: unknown[] = [];
  const visit = (c: unknown) => {
    if (c === null || c === undefined || typeof c === "boolean") return;
    if (Array.isArray(c)) return c.forEach(visit);
    if (isValidElement(c) && c.type === Fragment)
      return visit((c.props as Props).children);
    out.push(c);
  };
  visit(children);
  return out;
}

const isLabel = (c: unknown) =>
  isValidElement(c) && specOf(c)?.kind === "label";

/** One `.label(field, opts)` call, as `<Label field .../>` props. */
type LabelSpec = { field: unknown } & Record<string, unknown>;

/** Split children into `<Label>` specs and the rest. */
function splitLabels(kids: unknown[]): {
  labels: LabelSpec[];
  rest: unknown[];
} {
  const labels = kids.filter(isLabel).map((l) => {
    const { children: _c, ...p } = (l as ReactElement<Props>).props;
    return p as LabelSpec;
  });
  return { labels, rest: kids.filter((c) => !isLabel(c)) };
}

/** `label="species"` or `label={{ field: "species", ...opts }}` on a leaf
 *  mark: shorthand for one `<Label>` child. */
const labelProp = (label: unknown): LabelSpec[] =>
  label === undefined
    ? []
    : typeof label === "object" && label !== null
      ? [label as LabelSpec]
      : [{ field: label }];

/** The modifiers every mark takes as chained methods: `.label()`,
 *  `.name()`, `.zOrder()`. */
function applyModifiers(
  m: any,
  labels: LabelSpec[],
  name?: unknown,
  zOrder?: number
) {
  for (const { field, ...opts } of labels)
    m = m.label(field, Object.keys(opts).length > 0 ? opts : undefined);
  if (name !== undefined) m = m.name(name);
  if (zOrder !== undefined) m = m.zOrder(zOrder);
  return m;
}

/** Convert one child (a GoFish element, a user component, or a fluent value
 *  passed through as a JSX child: spelling B) to a GoFish mark/builder. */
export function toGoFish(node: unknown): any {
  if (!isValidElement(node)) {
    // Spelling B: a fluent value (`chart(d).flow(...).mark(...)`, `rect(...)`,
    // `ref(...)`) used as a JSX child passes through untouched.
    if (
      (typeof node === "object" || typeof node === "function") &&
      node !== null
    )
      return node;
    throw new Error(`gofish-react: cannot convert child ${String(node)}`);
  }
  const el = node as ReactElement<Props>;
  const spec = specOf(el);
  if (!spec) {
    if (typeof el.type === "function") return userComponent(el);
    throw new Error(
      `gofish-react: <${String(el.type)}> is not a GoFish component (DOM/SVG ` +
        "intrinsics are not allowed inside a GoFish tree)"
    );
  }
  const { children, name, zOrder, ...opts } = el.props;
  const { labels, rest } = splitLabels(flatten(children));

  switch (spec.kind) {
    case "spec":
      return opts.spec;
    case "chart":
      return convertChart(el.props);
    case "ref":
      return applyModifiers(ref(opts.to), labels, name, zOrder);
    case "label":
      throw new Error("gofish-react: <Label> must be a child of a mark");
    case "mark": {
      const { label, ...markOpts } = opts;
      if (rest.length > 0)
        throw new Error(
          `gofish-react: a leaf mark takes only <Label> children`
        );
      const m = spec.factory!(...(spec.args ?? ((o) => [o]))(markOpts));
      return applyModifiers(m, [...labelProp(label), ...labels], name, zOrder);
    }
    case "relational": {
      const { label, ...markOpts } = opts;
      const m =
        rest.length > 0
          ? spec.factory!(markOpts, rest.map(toGoFish))
          : spec.factory!(markOpts);
      return applyModifiers(m, [...labelProp(label), ...labels], name, zOrder);
    }
    case "operator":
    case "combinator": {
      // Outside a <Chart> pipeline: a combinator over explicit children.
      const { relate, ...combOpts } = opts;
      const childMarks = rest.map(toGoFish);
      let m =
        Object.keys(combOpts).length > 0
          ? spec.factory!(combOpts, childMarks)
          : spec.factory!(childMarks);
      if (relate !== undefined)
        m = m.relate((operands: any) =>
          flatten(relate(operands)).map(toGoFish)
        );
      return applyModifiers(m, labels, name, zOrder);
    }
  }
}

/**
 * A user function component is a custom mark: `createMark` closes it as a
 * component (name scope), and its body's JSX is converted. Only `name` and
 * `zOrder` are read as modifiers; every other prop is the component's own
 * (a component may well have a `label` prop of its own, as NodeLink's `Node`
 * does, so `label` is NOT read as `.label()` here).
 */
const markOf = new WeakMap<(p: any) => ReactNode, (props: any) => any>();
function userComponent(el: ReactElement<Props>) {
  const Type = el.type as (p: any) => ReactNode;
  let factory = markOf.get(Type);
  if (!factory) {
    factory = createMark((p: any) => toGoFish(flatten(Type(p))[0])) as (
      props: any
    ) => any;
    markOf.set(Type, factory);
  }
  const { name, zOrder, ...props } = el.props;
  let m = factory(props);
  if (name !== undefined) m = m.name(name);
  if (zOrder !== undefined) m = m.zOrder(zOrder);
  return m;
}

/** A flow step: the operator's factory with its options (and `<Label>`
 *  children as `.label()` on the operator). Returns the step and the single
 *  child it wraps. */
function flowStep(el: ReactElement<Props>): { op: any; inner: unknown } {
  const spec = specOf(el)!;
  const { children, name, zOrder, ...opts } = el.props;
  const { labels, rest } = splitLabels(flatten(children));
  if (rest.length !== 1)
    throw new Error(
      `gofish-react: inside <Chart>, a flow step wraps exactly one child ` +
        `(the next step or the mark); <${(el.type as any).name}> has ${rest.length}`
    );
  const op = applyModifiers(
    spec.factory!(...(spec.args ?? ((o) => [o]))(opts)),
    labels
  );
  return { op, inner: rest[0] };
}

const isFlowStep = (c: unknown): c is ReactElement<Props> =>
  isValidElement(c) && specOf(c)?.kind === "operator";

/**
 * <Chart data {...options}>  pipeline  tier2 tier3 ... </Chart>
 *
 * Children, in order: the first child is the pipeline (nested flow steps
 * ending in the mark): `chart(data).flow(...steps).mark(mark)`. Each later
 * child is one `.layer(tier)` (a bare mark such as <Line/>, or a <Chart>
 * scope, e.g. <Chart data={selectAll("bars")}>). This reads as a
 * `layer-chain` in the IR, exactly as the fluent `.layer()` chain does.
 *
 * Spelling C: `flow={[...]}` and `mark={...}` props instead of a pipeline
 * child; then every child is a `.layer()` tier.
 */
function convertChart(props: Props) {
  const { data, children, name, zOrder, flow, mark, ...options } = props;
  const hasOptions = Object.keys(options).length > 0;
  let b =
    data === undefined
      ? chart(hasOptions ? options : undefined)
      : chart(data, hasOptions ? options : undefined);
  const kids = flatten(children);
  let tiers: unknown[];
  if (mark !== undefined) {
    // Spelling C.
    b = (flow?.length ? b.flow(...flow) : b).mark(mark);
    tiers = kids;
  } else {
    if (kids.length === 0)
      throw new Error("gofish-react: <Chart> needs a mark");
    const steps: any[] = [];
    let cur: unknown = kids[0];
    while (isFlowStep(cur)) {
      const { op, inner } = flowStep(cur);
      steps.push(op);
      cur = inner;
    }
    b = (steps.length ? b.flow(...steps) : b).mark(toGoFish(cur));
    tiers = kids.slice(1);
  }
  if (name !== undefined) b = b.name(name);
  if (zOrder !== undefined) b = b.zOrder(zOrder);
  for (const t of tiers) b = b.layer(toGoFish(t));
  return b;
}
