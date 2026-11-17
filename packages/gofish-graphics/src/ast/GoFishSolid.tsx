import { type Component, createEffect } from "solid-js";
import type { JSX } from "@solidjs/web";
import { gofish, type AxesOptions } from "./gofish";
import { type GoFishNode } from "./_node";

interface GoFishComponentProps {
  w: number;
  h: number;
  x?: number;
  y?: number;
  transform?: { x?: number; y?: number };
  debug?: boolean;
  defs?: JSX.Element[];
  children: GoFishNode;
  axes?: AxesOptions;
  legend?: boolean;
}

export const GoFishSolid: Component<GoFishComponentProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  // Compute reads the props (the effect's dependencies); apply draws the
  // chart and returns its cleanup. The component owns the chart's lifetime: a
  // prop change re-runs the effect, which unmounts the previous chart first,
  // and the component's disposal ends it.
  createEffect(
    () => ({
      options: {
        w: props.w,
        h: props.h,
        x: props.x,
        y: props.y,
        transform: props.transform,
        debug: props.debug,
        defs: props.defs,
        axes: props.axes,
        legend: props.legend,
      },
      child: props.children,
    }),
    ({ options, child }) => {
      if (!containerRef) return;
      const view = gofish(containerRef, options, child);
      return () => view.unmount();
    }
  );

  return <div ref={containerRef} />;
};
