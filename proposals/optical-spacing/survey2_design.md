# Spacing by eye, part 2: design

The page is `survey2.html`, built by `survey2_build.py` from `survey2_widgets.json`,
which `survey2Run.ts` writes. This file is written by `survey2_design_build.py`.
Results go in `results/v2/` (see its README).

## Goal: rule candidates out

We have medium to low confidence that any of the candidate strategies below
is how people space shapes. So the survey is built to rule each one out, not
to pick a winner. For every candidate, the core tier has at least one
realistic widget where that candidate's prediction is at least 4 sd from
every other candidate's. If people's answers miss it there by more than
about 3 sd, the candidate is out.

If every candidate fails, the wedge widget tells us what people respond to.
It changes one feature, the wedge a triangle's tip leaves beside a flat
side, and nothing else. Each candidate predicts a different slope of the
answer against the wedge's depth, so one answer per person gives that
person's slope, and the slope says how much of the wedge's white counts as
gap. A slope between two candidates' slopes points to a measure between
them, such as a power mean with a different p; a slope outside all of them
points to something none of the candidates measure.

## Why rows, not offset pairs

The first draft of part 2 showed a reference pair of squares above the pair
being set, shifted sideways. Josh pointed out that comparing gaps that are
offset from each other adds error that tells us nothing about spacing, like
comparing lengths on unaligned baselines. Cleveland and McGill (1984) found
that people judge position along a common scale more accurately than
position along nonaligned scales. So every widget is now one row of three or
four shapes on a shared baseline, as in part 1: the fixed shapes set the
reference gap, and the gap being set sits beside it on the same line.

## Candidates

| Key     | Strategy                               |
| ------- | -------------------------------------- |
| box     | bounding box                           |
| contact | contact                                |
| pm3c    | power mean p −3, cap 40                |
| hull    | hull, p −8                             |
| mean    | mean gap p 1                           |
| size    | box gap ÷ mean neighbor size           |
| pm3cRel | power mean p −3, cap 0.71 of the shape |

v is the box gap between the moving shape and its neighbor, in px at the
page's own scale (shapes 56 px at 1x). Each candidate's prediction is the v
at which it measures the two compared gaps as equal. The expected sd is
1.5 px at 1x, scaled with size; the repeat will measure it. A prediction
marked ≥ is the capped measure's plateau: past that v both gaps measure as
far, so any larger answer fits. A plateau can't rule its candidate out and
doesn't count as coverage. `pm3cRel` is the capped mean with its cap scaled
to the shape; it differs from `pm3c` only on scaled rows.

Realism, 1 to 3: 3, a row that appears in real icon rows and diagrams; 2,
ordinary shapes in a plausible but less common arrangement; 1, a row built
to make strategies disagree. Only rows scored 2 or 3 go in the core tier.

## Widgets

Core widgets show first. The extended ones wait behind a "Keep going
(optional, N more)" button at the end. The copy button works at any point,
marks untouched widgets `unset`, and records whether the extended tier was
opened (`extended:`).

| id                        | tier     | purpose                                                          | realism | shapes                                         | color               | box  | contact | pm3c    | hull | mean  | size | start         |
| ------------------------- | -------- | ---------------------------------------------------------------- | ------- | ---------------------------------------------- | ------------------- | ---- | ------- | ------- | ---- | ----- | ---- | ------------- |
| w1 notch                  | core     | a triangle's tip into the notch of an L                          | 2       | square, L, triangle                            | none                | 30.0 | −3.6    | −19.7   | 4.8  | −33.5 | 30.0 | 51.0 (far)    |
| w2 interlock-small        | core     | smaller up and down triangles after two squares                  | 2       | square, square, small triangle, small triangle | none                | 30.0 | 10.4    | 10.4    | 10.4 | 10.4  | 21.0 | −19.5 (close) |
| w3 wedge                  | core     | diagnostic: a triangle after two squares; one feature, the wedge | 3       | square, square, triangle                       | none                | 30.0 | 30.0    | 16.3    | 20.8 | 2.0   | 30.0 | 50.5 (far)    |
| w4 mixed-small            | core     | mixed sizes: a small square after two big ones                   | 3       | square, square, small square                   | none                | 30.0 | 30.0    | 30.0    | 30.0 | 30.0  | 22.5 | 0.0 (close)   |
| w5 stars                  | core     | control: three identical stars                                   | 3       | star, star, star                               | none                | 30.0 | 30.0    | 30.0    | 30.0 | 30.0  | 30.0 | 50.5 (far)    |
| w6 notch-double           | core     | scale: notch at 2x                                               | 2       | square, L, triangle                            | none                | 60.0 | −7.2    | ≥ −28.0 | 9.7  | −67.0 | 60.0 | 101.5 (far)   |
| w7 mixed-big              | core     | mixed sizes: a big square after two small ones                   | 3       | small square, small square, square             | none                | 30.0 | 30.0    | 30.0    | 30.0 | 30.0  | 45.0 | 64.5 (far)    |
| w8 interlock-small-mirror | core     | repeat of interlock-small, mirrored                              | 2       | small triangle, small triangle, square, square | none                | 30.0 | 10.4    | 10.4    | 10.4 | 10.4  | 21.0 | 49.0 (far)    |
| w9 square-circle          | extended | a circle after two squares (the simple row)                      | 3       | square, square, circle                         | none                | 30.0 | 30.0    | 25.9    | 27.0 | 24.0  | 30.0 | 50.5 (far)    |
| w10 notch-invert          | extended | inversion: notch with shape and background swapped               | 2       | square, L, triangle                            | inverted            | 30.0 | −3.6    | −19.7   | 4.8  | −33.5 | 30.0 | 51.0 (far)    |
| w11 tip-circle            | extended | a triangle's tip toward a circle                                 | 3       | square, circle, triangle                       | none                | 30.0 | 30.0    | 20.3    | 23.2 | 2.0   | 30.0 | 50.5 (far)    |
| w12 square-circle-invert  | extended | inversion: square-circle with shape and background swapped       | 3       | square, square, circle                         | inverted            | 30.0 | 30.0    | 25.9    | 27.0 | 24.0  | 30.0 | 0.0 (close)   |
| w13 notch-hue             | extended | color: notch with the moving triangle colored                    | 2       | square, L, triangle                            | the moving triangle | 30.0 | −3.6    | −19.7   | 4.8  | −33.5 | 30.0 | 51.0 (far)    |
| w14 tip-circle-hue        | extended | color: tip-circle with the fixed circle colored                  | 3       | square, circle, triangle                       | the fixed circle    | 30.0 | 30.0    | 20.3    | 23.2 | 2.0   | 30.0 | 50.5 (far)    |
| w15 tips                  | extended | pathological: two long spikes, tip to tip                        | 1       | square, spike, spike, circle                   | none                | 30.0 | 30.0    | 11.1    | 18.0 | 0.2   | 25.7 | 50.5 (far)    |

Starts: a far start sits 40% of the track past every prediction. A close
start has the moving shape just touching its neighbor, never overlapping it.
Sides alternate down the page and a matched widget starts on the side
opposite its original, except where the touching start would sit within
3 sd of a prediction (mean predicts touching on the notch, wedge and tip
rows): those start far.

## Ranking

Rows are ranked greedily: first the realistic row that rules out the most
candidates not yet covered, then the next, until every candidate is
covered. The score is the sum over candidates of each one's isolation in sd,
capped at 8. Factor pairs are ranked by what their comparison decides, not
by spread, in the order the coordinator proposed, which I agree with: noise
comes first because every other comparison is read against it.

| rank | id                     | purpose                                                          | realism | score | decides                                                              | tier     |
| ---- | ---------------------- | ---------------------------------------------------------------- | ------- | ----- | -------------------------------------------------------------------- | -------- |
| 1    | notch                  | a triangle's tip into the notch of an L                          | 2       | 27.24 | rules out contact, pm3c, hull, mean (new: contact, pm3c, hull, mean) | core     |
| 2    | interlock-small        | smaller up and down triangles after two squares                  | 2       | 12    | rules out box, size (new: box, size)                                 | core     |
| 3    | wedge                  | diagnostic: a triangle after two squares; one feature, the wedge | 3       | 13.97 | rules out mean (all already covered)                                 | core     |
| 4    | tip-circle             | a triangle's tip toward a circle                                 | 3       | 11.83 | rules out mean (all already covered)                                 | extended |
| 5    | mixed-big              | mixed sizes: a big square after two small ones                   | 3       | 8     | rules out size (all already covered)                                 | core     |
| 6    | mixed-small            | mixed sizes: a small square after two big ones                   | 3       | 5     | rules out size (all already covered)                                 | core     |
| 7    | square-circle          | a circle after two squares (the simple row)                      | 3       | 2.71  | isolates no candidate                                                | extended |
| 8    | interlock              | an up and a down triangle, slanted sides parallel                | 2       | 0     | isolates no candidate                                                | cut      |
| 9    | tips                   | pathological: two long spikes, tip to tip                        | 1       | 19.39 | pathological; isolates pm3c, hull, mean                              | extended |
| 10   | spike-square           | pathological: a long spike's tip at a flat side                  | 1       | 15.27 | pathological; isolates mean                                          | cut      |
| 11   | interlock-small-mirror | repeat of interlock-small, mirrored                              | 2       | n/a   | repeat: within-person noise, opposite start                          | core     |
| 12   | notch-double           | scale: notch at 2x                                               | 2       | n/a   | scale: does the gap scale with the shapes                            | core     |
| 13   | stars                  | control: three identical stars                                   | 3       | n/a   | control: execution noise where every candidate agrees                | core     |
| 14   | notch-invert           | inversion: notch with shape and background swapped               | 2       | n/a   | inversion: does light on dark change the gap                         | extended |
| 15   | square-circle-invert   | inversion: square-circle with shape and background swapped       | 3       | n/a   | inversion, on the simple row                                         | extended |
| 16   | notch-hue              | color: notch with the moving triangle colored                    | 2       | n/a   | color: the moving shape colored                                      | extended |
| 17   | tip-circle-hue         | color: tip-circle with the fixed circle colored                  | 3       | n/a   | color: a fixed neighbor colored                                      | extended |

Covered by the core: box by interlock-small, contact by notch, pm3c by notch, hull by notch, mean by notch, size by interlock-small.
Uncovered: none.

Cut from this round's pool: far-squares (one control is enough; the stars
stay), spike-square (pathological, and tips already shows the same thing),
interlock at one size (box and size agree there, so it isolates nothing),
the half and double copies of tip-circle and the mirrors of tips and
tip-circle (one scaled copy and one repeat), and the offset layout's
triangles rows.

## What rules out what

Each cell is that candidate's isolation in sd: how far its prediction is
from the nearest other candidate's. **out**: 4 sd or more, so a miss of more
than about 3 sd rules that candidate out on its own. shared: a bold
prediction another candidate shares, so a miss rules out the group.
plateau: the cap's plateau, which rules nothing out. On a pathological row
(realism 1), an isolated miss is marked **switch**: it shows people change
strategy on rows like that one, not that the candidate is wrong on
realistic rows.

| widget                 | realism | box         | contact        | pm3c              | hull              | mean              | size          |
| ---------------------- | ------- | ----------- | -------------- | ----------------- | ----------------- | ----------------- | ------------- |
| notch                  | 2       | shared (0)  | **out** (5.62) | **out** (9.19)    | **out** (5.62)    | **out** (9.19)    | shared (0)    |
| interlock-small        | 2       | **out** (6) | shared (0)     | shared (0)        | shared (0)        | shared (0)        | **out** (6)   |
| wedge                  | 3       | shared (0)  | shared (0)     | shared (2.99)     | shared (2.99)     | **out** (9.53)    | shared (0)    |
| mixed-small            | 3       | shared (0)  | shared (0)     | shared (0)        | shared (0)        | shared (0)        | **out** (5)   |
| stars                  | 3       | shared (0)  | shared (0)     | shared (0)        | shared (0)        | shared (0)        | shared (0)    |
| notch-double           | 2       | shared (0)  | shared (0)     | plateau           | shared (0)        | **out** (13)      | shared (0)    |
| mixed-big              | 3       | shared (0)  | shared (0)     | shared (0)        | shared (0)        | shared (0)        | **out** (10)  |
| interlock-small-mirror | 2       | **out** (6) | shared (0)     | shared (0)        | shared (0)        | shared (0)        | **out** (6)   |
| square-circle          | 3       | shared (0)  | shared (0)     | shared (0.7)      | shared (0.7)      | shared (1.31)     | shared (0)    |
| notch-invert           | 2       | shared (0)  | **out** (5.62) | **out** (9.19)    | **out** (5.62)    | **out** (9.19)    | shared (0)    |
| tip-circle             | 3       | shared (0)  | shared (0)     | shared (1.91)     | shared (1.91)     | **out** (12.21)   | shared (0)    |
| square-circle-invert   | 3       | shared (0)  | shared (0)     | shared (0.7)      | shared (0.7)      | shared (1.31)     | shared (0)    |
| notch-hue              | 2       | shared (0)  | **out** (5.62) | **out** (9.19)    | **out** (5.62)    | **out** (9.19)    | shared (0)    |
| tip-circle-hue         | 3       | shared (0)  | shared (0)     | shared (1.91)     | shared (1.91)     | **out** (12.21)   | shared (0)    |
| tips                   | 1       | shared (0)  | shared (0)     | **switch** (4.63) | **switch** (4.63) | **switch** (7.25) | shared (2.88) |

What realism costs:

- On the realism 3 rows that use shape alone (wedge, tip-circle,
  square-circle, stars), box, contact and size all predict the same place.
  Telling box from contact needs an overhang (the interlocking triangles),
  and telling box from size needs neighbors of different sizes. So in the
  most ordinary rows those three are the same rule, and the choice between
  them matters only for overhangs and mixed sizes.
- Contact and hull are told apart only by the notch, by 5.6 sd (8.4 px),
  because the hull fills the notch the triangle's tip enters. Without a
  notch they differ only by how the hull's power mean weighs lines that
  aren't the closest, which is a few px.
- The capped mean and the hull differ by less than 3 sd on the wedge and
  tip-circle; they separate on the notch (24.5 px).

## The diagnostic: the wedge's slope

Two squares 30 px apart, then a triangle whose tip points back at the second
square. With a flat side (depth 0) every candidate puts it at 30. The table
gives each candidate's prediction at four wedge depths (the triangle's length
along the row; the survey uses 56, an equilateral-looking triangle).

| depth | box  | contact | pm3c | hull | mean | size |
| ----- | ---- | ------- | ---- | ---- | ---- | ---- |
| 14    | 30.0 | 30.0    | 24.1 | 25.2 | 23.0 | 22.5 |
| 28    | 30.0 | 30.0    | 20.2 | 22.9 | 16.0 | 25.6 |
| 42    | 30.0 | 30.0    | 17.9 | 21.6 | 9.0  | 28.0 |
| 56    | 30.0 | 30.0    | 16.3 | 20.8 | 2.0  | 30.0 |

Slope at depth 56, in px of v per px of depth: box 0.0, contact 0.0, pm3c −0.2, hull −0.2, mean −0.5, size 0.0.
Size's slope is 0 only at depth 56, where the triangle's box is the
square's; at shallower depths the triangle's box is narrower.

## Analysis plan

Each result block has a `theme:` line (light or dark, from the page's color
scheme), an `extended:` line (shown or hidden), the window width
(`screen:`), and one line per widget, `unset` if untouched.

- **Noise.** Within-person noise comes from interlock-small and its mirror:
  half the squared difference of a person's two answers, averaged. One
  starts with the shapes touching, the other far, so a difference that keeps
  its sign across people is a start bias. The stars' spread across people
  is execution noise on an easy row where every candidate agrees.
- **Ruling out.** For each candidate, on each core widget where it is
  marked out, compare the people's mean with its prediction. A miss of more
  than 3 sd (the noise above, or 1.5 px until it is measured) rules it out.
  A candidate that survives every one of its widgets stays in. On tips
  (realism 1), a miss means people switch strategy on extreme spikes.
- **If all fail.** Read each person's wedge slope, (answer − 30) / 56, and
  place it among the candidates' slopes. Then check whether the same
  in-between measure also fits the notch and interlock-small answers.
- **One strategy or several.** On the core falsifiers, assign each person
  to the nearest candidate when it is more than 2 sd closer than the next.
  The same candidate for one person across widgets, with people differing,
  means each person keeps a strategy; agreement within a widget with the
  candidate changing across widgets means the shape picks the strategy.
- **Mixed sizes.** If the gap scales with its neighbors' size as size^a,
  mixed-small and mixed-big give a: gap alone predicts 30 on both (a = 0),
  the size candidate predicts 22.5 and 45 (a = 1). Grouping can bend this:
  a small square may read as belonging to its nearer big neighbor, which
  would pull mixed-small below the size line while leaving mixed-big near
  it, so the two rows are read separately before they are combined.
- **Scale.** notch-double against notch, divided by 2: equal if the
  measure scales with the shapes. Its capped prediction sits on the
  plateau, so this pair can rule out the relative cap (pm3cRel) but not the
  absolute one. On a narrow screen the 2x copy is drawn smaller; use
  `screen:` to keep only blocks wide enough to show it whole.
- **Inversion.** A widget's polarity is light on dark when the page is dark
  and the widget is plain, or the page is light and the widget is inverted.
  Within person, notch against notch-invert and square-circle against
  square-circle-invert give the effect of flipping polarity; across people,
  the `theme:` line gives it on every plain widget. Irradiation predicts
  light shapes on dark look larger, so the gaps look smaller and people set
  them wider.
- **Color.** notch against notch-hue (the moving triangle colored) and
  tip-circle against tip-circle-hue (the fixed circle colored), within
  person. The colored shape is a saturated hue with the ink's luminance:
  blue `#000090` in light mode (luminance 0.020 against the ink's 0.017)
  and cyan `#00ffff` in dark mode (0.787 against 0.792). No hue reaches the
  ink's luminance in both themes, so the hue differs by theme; split the
  color comparison by `theme:`.
- **Extended tier.** Only blocks with `extended: shown` count for the
  extended widgets; the rest stand on the core.
