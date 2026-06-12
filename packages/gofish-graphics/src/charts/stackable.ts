export interface Stackable<TInput, TOutput> {
  stack<K extends keyof TOutput & string>(
    field: K,
    options?: {
      x?: number;
      y?: number;
      w?: number | (keyof TOutput & string);
      h?: number | (keyof TOutput & string);
      alignment?: "start" | "middle" | "end";
    }
  ): Stackable<TInput, TOutput>;
}
