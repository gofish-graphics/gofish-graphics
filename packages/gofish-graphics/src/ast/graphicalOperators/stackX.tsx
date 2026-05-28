import { stack } from "./stack";

export const stackX = (...args: any[]): ReturnType<typeof stack> => {
  if (args.length === 2) {
    const [props, children] = args;
    return stack(
      {
        ...props,
        dir: "x",
      },
      children
    );
  } else if (args.length === 1) {
    const [children] = args;
    return stack(
      {
        dir: "x",
      },
      children
    );
  } else {
    return stack(
      {
        dir: "x",
      },
      []
    );
  }
};
