import { stack } from "./stack";

export const stackY = (...args: any[]): ReturnType<typeof stack> => {
  if (args.length === 2) {
    const [props, children] = args;
    return stack(
      {
        ...props,
        dir: "y",
      },
      children
    );
  } else if (args.length === 1) {
    const [children] = args;
    return stack(
      {
        dir: "y",
      },
      children
    );
  } else {
    return stack(
      {
        dir: "y",
      },
      []
    );
  }
};
