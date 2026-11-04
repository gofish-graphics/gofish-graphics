// The playground's compute, off the page's thread: one Web Worker per set (up to the cores
// there are), so a slider never blocks the page and the sets of a dataset are computed side by
// side. A worker keeps its own per-piece cache, and set i always goes to worker i mod n, so the
// cache a set built is the one it finds. The worker runs this same script (the page's own
// bundle, started as a worker from its text): `handler` below is the worker's side, Pool the
// page's.
//
// While the page is idle, each worker fills its cache for every connection the slider can
// reach (warm), a position at a time, so a compute request is never stuck behind more than one.
// Where no Worker can be started (a page whose policy forbids blob workers), the same handler
// runs on the page's thread, a request per task.
import DATA from "./datasets.json";
import { computeSet, type Params, type SetResult } from "./compute";

type SetData = { members: unknown[]; avoiding: unknown[] };
type Dataset = { id: string; sets: SetData[] };
const DATASETS = DATA as unknown as Dataset[];

export type Msg =
  | { kind: "compute"; id: number; ds: string; sets: number[]; p: Params }
  | {
      kind: "warm";
      gen: number;
      ds: string;
      sets: number[];
      p: Params;
      connections: number[];
    };

export type Computed = { si: number; r: SetResult }[];

export type Reply =
  | { kind: "computed"; id: number; out: Computed }
  | { kind: "failed"; id: number; message: string }
  | { kind: "warmed"; gen: number };

/** The worker's side: answer one message (post the reply). Warm-up steps are scheduled as
 *  tasks of their own, so a compute message is handled between two of them. */
export function handler(post: (r: Reply) => void): (m: Msg) => void {
  let warmGen = -1;
  return (m) => {
    const d = DATASETS.find((x) => x.id === m.ds)!;
    if (m.kind === "compute") {
      warmGen = -1; // a newer state: the warm-up of the old one stops
      try {
        const out = m.sets.map((si) => ({
          si,
          r: computeSet(d.sets[si] as never, m.p),
        }));
        post({ kind: "computed", id: m.id, out });
      } catch (err) {
        post({ kind: "failed", id: m.id, message: (err as Error).message });
      }
      return;
    }
    const gen = (warmGen = m.gen);
    let q = 0,
      k = 0;
    const step = () => {
      if (warmGen !== gen) return;
      if (q >= m.connections.length) {
        post({ kind: "warmed", gen });
        return;
      }
      try {
        computeSet(d.sets[m.sets[k]] as never, {
          ...m.p,
          connection: m.connections[q],
        });
      } catch {
        // a failing state is reported when it is asked for
      }
      if (++k === m.sets.length) [k, q] = [0, q + 1];
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  };
}

/** Start this script as a worker (in a worker: install the handler). */
export function workerMain(): void {
  const post = (r: Reply) => (self as unknown as Worker).postMessage(r);
  const h = handler(post);
  self.onmessage = (e: MessageEvent<Msg>) => h(e.data);
}

type Port = {
  post: (m: Msg) => void;
  onReply: (f: (r: Reply) => void) => void;
};

/** A handler on the page's own thread, for when no worker can start. */
const localPort = (): Port => {
  let cb: (r: Reply) => void = () => {};
  const h = handler((r) => cb(r));
  return {
    post: (m) => setTimeout(() => h(m), 0),
    onReply: (f) => (cb = f),
  };
};

export class Pool {
  ports: Port[];
  /** false when the workers could not start and the page computes on its own thread */
  workers: boolean;
  private seq = 0;
  private waiting = new Map<
    number,
    {
      left: number;
      out: Computed;
      done: (r: Computed) => void;
      fail: (e: Error) => void;
    }
  >();
  private warmGen = 0;
  private warmLeft = 0;
  onWarm: () => void = () => {};

  constructor(src: string | null) {
    const n = Math.max(
      1,
      Math.min(4, (navigator.hardwareConcurrency ?? 2) - 1)
    );
    let ports: Port[] = [];
    try {
      if (!src || typeof Worker === "undefined") throw new Error("no worker");
      const url = URL.createObjectURL(
        new Blob([src], { type: "text/javascript" })
      );
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        ports.push({
          post: (m) => w.postMessage(m),
          onReply: (f) => (w.onmessage = (e) => f(e.data)),
        });
      }
      this.workers = true;
    } catch {
      ports = [localPort()];
      this.workers = false;
    }
    this.ports = ports;
    ports.forEach((p) => p.onReply((r) => this.reply(r)));
  }

  private reply(r: Reply) {
    if (r.kind === "warmed") {
      if (r.gen === this.warmGen && --this.warmLeft === 0) this.onWarm();
      return;
    }
    const w = this.waiting.get(r.id);
    if (!w) return;
    if (r.kind === "failed") {
      this.waiting.delete(r.id);
      w.fail(new Error(r.message));
      return;
    }
    w.out.push(...r.out);
    if (--w.left === 0) {
      this.waiting.delete(r.id);
      w.done(w.out);
    }
  }

  private groups(nSets: number) {
    const groups = this.ports.map(() => [] as number[]);
    for (let si = 0; si < nSets; si++) groups[si % this.ports.length].push(si);
    return groups;
  }

  /** Every set of dataset `ds` at params p, in set order. */
  compute(ds: string, nSets: number, p: Params): Promise<SetResult[]> {
    this.warmGen++; // any warm-up in flight is stale
    const id = ++this.seq;
    const groups = this.groups(nSets);
    return new Promise<Computed>((done, fail) => {
      this.waiting.set(id, {
        left: groups.filter((g) => g.length).length,
        out: [],
        done,
        fail,
      });
      groups.forEach((sets, w) => {
        if (sets.length)
          this.ports[w].post({ kind: "compute", id, ds, sets, p });
      });
    }).then((out) => out.sort((a, b) => a.si - b.si).map((x) => x.r));
  }

  /** Warm every worker's sets at each of `connections` (the slider's reachable values). */
  warm(ds: string, nSets: number, p: Params, connections: number[]) {
    const gen = ++this.warmGen;
    const groups = this.groups(nSets);
    this.warmLeft = groups.filter((g) => g.length).length;
    groups.forEach((sets, w) => {
      if (sets.length)
        this.ports[w].post({ kind: "warm", gen, ds, sets, p, connections });
    });
  }
}
