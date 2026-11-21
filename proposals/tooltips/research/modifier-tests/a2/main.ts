import { rect, text, label } from "lib";
import { tooltip, outline, tooltipOf } from "gofish-tooltip";

// 1. .use() chained: every link keeps the precise subclass, no overloads.
export const used = rect({ h: "v" })
  .name("bars")
  .use(label("v"))
  .use(tooltip("v"))
  .cornerRadius(2); // still a RectMark here

// 2. .pipe() within its overloads (3): precise.
export const piped3 = rect({}).pipe(label("v"), tooltip("v"), tooltip("w"));

// 3. .pipe() past its overloads (4): falls to the loose overload.
export const piped4 = rect({}).pipe(
  label("v"),
  tooltip("v"),
  tooltip("w"),
  tooltip("x")
);

// 4. Wrapping form: precise, but reads inside out.
export const wrapped = tooltipOf(rect({}).name("bars"), "v").cornerRadius(2);

// 5. A text-only modifier on a rect: static error at the call site.
// export const wrongMark = rect({}).use(outline(1));

// 6. Fine on text.
export const okText = text({}).use(outline(1)).fontSize(12);

// 7. A typo in the modifier name.
// export const typo = rect({}).use(toolTip("v"));

console.log(
  JSON.stringify([
    used.spec,
    piped3.spec,
    piped4.spec,
    wrapped.spec,
    okText.spec,
  ])
);
