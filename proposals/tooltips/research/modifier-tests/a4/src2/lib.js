export class Mark {
  constructor(s) {
    this.spec = s;
  }
}
export const rect = (o) => new Mark({ type: "rect", ...o });
