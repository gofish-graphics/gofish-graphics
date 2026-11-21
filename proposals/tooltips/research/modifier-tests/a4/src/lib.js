export class Mark {
  constructor(spec) {
    this.spec = spec;
  }
  name(n) {
    return new Mark({ ...this.spec, name: n });
  }
  tooltip(f) {
    return new Mark({ ...this.spec, tooltip: "METHOD_TOOLTIP_BODY" + f });
  }
  use(mod) {
    return mod(this);
  }
}
export const rect = (o) => new Mark({ type: "rect", ...o });
export const tooltipFn = (f) => (m) =>
  new Mark({ ...m.spec, tooltip: "FUNCTION_TOOLTIP_BODY" + f });
export const labelFn = (f) => (m) =>
  new Mark({ ...m.spec, label: "FUNCTION_LABEL_BODY" + f });
