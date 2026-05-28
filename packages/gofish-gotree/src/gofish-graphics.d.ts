// Minimal type shim for gofish-graphics module resolution from a worktree
// without a built dist/index.d.ts. Tracks the public lib.ts surface we use.
// If you add new gofish-graphics imports, declare them here.

declare module "gofish-graphics" {
  export type Mark<T> = (
    d: T,
    key?: string | number,
    layerContext?: { [name: string]: { data: any[]; nodes: any[] } }
  ) => any;

  export type Operator<T, U> = (_: Mark<U>) => Promise<Mark<T>>;
  export type NameableMark<T> = Mark<T> & {
    name: (name: any) => NameableMark<T>;
  };

  export const rect: (opts: Record<string, any>) => any;
  export const circle: (opts: Record<string, any>) => any;
  export const ellipse: (opts: Record<string, any>) => any;
  export const text: (opts: Record<string, any>) => any;

  export const spread: (opts: Record<string, any>, children?: any[]) => any;
  export const Spread: (opts: Record<string, any>, children: any[]) => any;
  export const stack: (opts: Record<string, any>, children?: any[]) => any;
  export const connect: (opts: Record<string, any>, children: any[]) => any;
  export const layer: (...args: any[]) => any;
  export const Layer: (...args: any[]) => any;
  export const Frame: (opts: Record<string, any>, children: any[]) => any;
  export const frame: (opts: Record<string, any>, children: any[]) => any;
  export const palette: (scheme: string) => (key: any) => string;

  export const ref: (selectionOrNode: any) => any;

  export const Constraint: {
    align: (opts: any, refs: any[]) => any;
    distribute: (opts: any, refs: any[]) => any;
    zAbove: (a: any, b: any) => any;
    zBelow: (a: any, b: any) => any;
    contain: (opts: { x?: number; y?: number }, refs: [any, any]) => any;
    [k: string]: any;
  };

  export const gofish: any;
  export const GoFish: any;
  export const linear: any;
  export const polar: any;
}
