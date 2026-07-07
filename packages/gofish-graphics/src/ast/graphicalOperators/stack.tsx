import { Spread } from "./spread";
import { FancyDims } from "../dims";
import { MaybeValue } from "../data";

// Type definition for props
type StackProps = {
  key?: string;
  dir: "x" | "y";
  alignment?: "start" | "middle" | "end";
  sharedScale?: boolean;
  reverse?: boolean;
} & FancyDims<MaybeValue<number>>;

export const stack = (
  props: StackProps,
  children: any // GoFishChildrenInput type from ../withGoFish is not exported, using any
): ReturnType<typeof Spread> => {
  return Spread(
    {
      ...props,
      glue: true,
      mode: "edge",
    },
    children
  );
};
