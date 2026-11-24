// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Slack` family: where the parts go when minimum gaps
 * (`Spacing.atLeast`) leave them room. It is the value of `spread`'s `slack`
 * option, along its `dir`, and of `layer`'s, per axis
 * (`layer({ slack: { y: Slack.end() } }, ...)`).
 *
 * A minimum gap gives each part a range of positions, not one position. The
 * least solution puts every part as early as its gaps allow. The greatest
 * solution puts every part as late as they allow, within the least
 * solution's span. A part's slack is the difference. A rule picks one point
 * in each part's range, and it is one rule per scope and axis: the gaps a
 * layer solves together on an axis share their room, so they share the rule
 * (`separateGroups` in `ast/constraints/differenceGraph.ts`).
 *
 * `lib.ts` binds this module as `Slack` (`Slack.end()`), and
 * `gofish-graphics/slack` exports the same module. There is one rule,
 * {@link at}, a fraction of the way from the least solution to the greatest.
 * `start`, `center` and `end` are its presets at 0, 0.5 and 1, so their
 * objects have kind `"at"`. A preset fixes `t`, its one param, so it takes
 * no options and is a value as it is (`Slack.end` is `Slack.end()`, #1133). A rule is a plain object,
 * `{ kind, t }`, and that object is also its wire form. The kind and its
 * param, and the presets, are declared once, in gofish-ir's `STRATEGIES`
 * table, which checks a rule where `at` makes it and where `layer` reads it.
 */
import { Frontend } from "gofish-ir";
import { preset } from "../ast/strategyKind";

/** A slack rule: what a `slack` option takes. */
export type Slack = Frontend.SlackIR;

/**
 * Each part a fraction `t` of the way from where the least solution puts it
 * to where the greatest puts it: least + t × (greatest − least).
 *
 * @param t From 0 (the least solution) to 1 (the greatest).
 */
export function at(t: number): Slack {
  const rule: Slack = { kind: "at", t };
  Frontend.checkStrategy("Slack", rule, `Slack.at(${t})`);
  return rule;
}

/** The least solution: each part as early as its gaps allow. The default.
 *  It is `at(0)`, and takes no options. */
export const start = preset<Slack>()("Slack", "start");

/** Halfway between the least and the greatest solution, their mean. It is
 *  `at(0.5)`, and takes no options. */
export const center = preset<Slack>()("Slack", "center");

/** The greatest solution within the least solution's span: each part as
 *  late as its gaps allow. It is `at(1)`, and takes no options. */
export const end = preset<Slack>()("Slack", "end");
