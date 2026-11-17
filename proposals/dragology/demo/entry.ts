// Entry of the standalone demo bundle: `window.GofishDragDemos`.
import {
  demos,
  type DemoOptions,
} from "../../../packages/gofish-graphics/stories/drag/demos";

const handles: Record<string, unknown> = {};

(window as any).GofishDragDemos = {
  names: Object.keys(demos),
  mount(name: string, element: HTMLElement, opts?: DemoOptions) {
    const demo = demos[name];
    if (!demo)
      throw new Error(
        `Unknown demo "${name}". Known: ${Object.keys(demos).join(", ")}`
      );
    const h = demo(element, opts);
    handles[name] = h;
    return h;
  },
};
