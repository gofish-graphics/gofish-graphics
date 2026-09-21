import { Component, onCleanup, type JSX, createEffect } from "solid-js";
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
}

export const GoFishSolid: Component<GoFishComponentProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (containerRef) {
      containerRef.innerHTML = "";
      gofish(
        containerRef,
        {
          w: props.w,
          h: props.h,
          x: props.x,
          y: props.y,
          transform: props.transform,
          debug: props.debug,
          defs: props.defs,
          axes: props.axes,
        },
        props.children
      );
    }

    onCleanup(() => {
      if (containerRef) {
        containerRef.innerHTML = "";
      }
    });
  });

  return <div ref={containerRef} />;
};
