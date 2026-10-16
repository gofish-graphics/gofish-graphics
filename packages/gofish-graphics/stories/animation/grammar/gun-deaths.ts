// Periscopic, "U.S. Gun Deaths" (2013), https://guns.periscopic.com/?year=2013
//
// Each victim is one arch over an age axis, from birth to the age they might
// have lived to. The orange part is the life they lived (the arch where the
// age is under their age at death), the grey part the years stolen. Each
// arch is drawn along its path at one pen speed, so the orange is drawn first
// and the grey goes on from the moment of death. One life plays alone, then a
// few, then the lives come faster and faster until a thousand overlap.
//
// It is ONE picture built in, so it is a `layer` with build-ins, not a
// timeline.
//
// PROTOTYPE (animation grammar proposal). The syntax is not signed off.
import {
  Animation,
  Curve,
  blank,
  chart,
  field,
  filter,
  layer,
  line,
  mask,
  rect,
  stack,
  text,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { gunDeaths2013, type GunDeath } from "../../../src/data/gunDeaths2013";

const ORANGE = "#f26c21";
const GREY = "#b4b4b4";
const N = gunDeaths2013.length;
/** Taller than any arch, in pixels: the cut that keeps the ages lived
 *  reaches over the whole arch. */
const TALL = 260;
/** How far the arch's control points are lifted off its chord, as a share
 *  of the chord's length. A cubic's middle rises 3/4 of that, so the arch
 *  peaks at 0.28 of its span. PROTOTYPE SHORTCUT: one height for every life;
 *  Periscopic's heights vary per life, and a strategy's params cannot read
 *  a field. */
const LIFT = 0.37;

/** Each victim with the years their death took. */
const victims = gunDeaths2013.map((d) => ({ ...d, stolen: d.potential - d.age }));

/** Ages are one measure wherever a chart sizes by them, so every act and the
 *  axis share one age scale. */
const years = (name: string) => field(name, "years");

/** The arch of one life: a line from age 0 to `potential`, routed as
 *  Periscopic's curve, a cubic whose control points sit a quarter and three
 *  quarters of the way along, lifted. Its ends are two points a `potential`
 *  apart. */
const arch = (stroke: string) =>
  layer([
    stack({ dir: "x", spacing: 0 }, [
      blank({ w: 0, h: 0 }).name("birth"),
      blank({ w: years("potential"), h: 0 }),
      blank({ w: 0, h: 0 }).name("end"),
    ]),
  ]).relate(({ birth, end }) => [
    line(
      {
        stroke,
        strokeWidth: 1,
        opacity: 0.5,
        curve: Curve.bezier({
          controls: [
            [0.25, LIFT],
            [0.75, LIFT],
          ],
        }),
      },
      [birth, end]
    ),
  ]);

/** A band over the arch, `w` years wide. */
const band = (w: string) => rect({ y: -TALL, h: TALL, w: years(w), fill: "white" });

/** The ages a person lived: from 0 to their age at death. */
const lived = () => band("age");
/** The years stolen: from their age at death to the age they might have
 *  lived to. */
const stolen = () =>
  stack({ dir: "x", spacing: 0 }, [blank({ w: years("age"), h: 0 }), band("stolen")]);

/** One life: the arch inside the ages lived (orange) and inside the years
 *  stolen (grey), drawn along its path, the draw lasting in proportion to
 *  the years the arch spans (one pen speed for every life). The two copies
 *  of the arch are one mark's strokes, so they are drawn as one pen. */
const life = layer([
  mask([stolen(), arch(GREY)]),
  mask([lived(), arch(ORANGE)]),
]).transition({
  enter: Animation.draw({ duration: "potential", ease: "linear" }),
});

/** The lives `from` to `to` (in order of death), one after another as
 *  `arrangement` says. */
const lives = (
  from: number,
  to: number,
  arrangement: Parameters<typeof time.stagger>[0]
) =>
  chart(victims)
    .flow(
      filter((d: GunDeath) => d.i >= from && d.i < to),
      time.stagger({ by: "i", ...arrangement })
    )
    .mark(life);

/** The age axis: a rule from 0 to 108 and its two ends. */
const axis = () =>
  chart([{ potential: 108 }]).mark(
    layer([
      rect({ w: years("potential"), h: 1, fill: "#555" }),
      text({ y: 10, text: "AGE 0", fontSize: 9, fill: "#888" }),
      stack({ dir: "x", spacing: 0 }, [
        blank({ w: years("potential"), h: 0 }),
        text({ y: 10, text: "108", fontSize: 9, fill: "#888" }),
      ]),
    ])
  );

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  layer([
    axis(),
    // Three acts, one after another: one life and then the next; a few
    // lives 720 ms apart; then the rest, faster and faster.
    layer([
      lives(0, 2, { spacing: 0 }),
      lives(2, 5, { lag: 720 }),
      // A quadOut warp of the start times: the gaps shrink from about 22 ms
      // to nothing.
      lives(5, N, { lag: 11, ease: "quadOut" }),
    ]).transition({ enter: time.stagger({ spacing: 480 }) }),
  ]).render(container, { w: 880, h: 330, axes: false, ...clock } as any);
