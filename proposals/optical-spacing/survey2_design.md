# Spacing by eye, part 2: design

`survey2.html` is a second survey, built by `survey2_build.py` from
`survey2_widgets.json`, which
`packages/gofish-graphics/stories/proposals/stack-profile/survey2Run.ts` writes
(the pair search that chose the discriminating widgets is `survey2Search.ts`).
Part 1 (`survey.html`) stays as it is.

It tries to tell three hypotheses apart:

- **H1.** Everyone uses one way of judging a gap; the spread between people is
  only how precisely they set the slider (execution noise).
- **H2.** There are a few ways of judging, and each person keeps theirs on
  every widget.
- **H3.** There are a few ways of judging, and the shape decides which one
  people use (in part 1, everyone judged w2's triangle tip by its closest
  point, sd 0.8 px, though the models disagree there by 19.5 px).

It also separates two kinds of spread: spread that tells the strategies apart,
and spread from a widget being hard to set (a far gap, an odd shape).

## Candidates

Five ways of judging a gap, chosen from part 1's fit (round 14):

- **box**: the gap between bounding boxes.
- **contact**: the closest point of the two outlines.
- **p −3, cap 40**: the power mean of the gap profile, (mean of d^p)^(1/p),
  with each line's gap clipped at 40 px; the best fit to part 1.
- **hull, p −8**: the same power mean between the shapes' convex hulls, no cap;
  the best hull fit to part 1.
- **mean gap p 1**: the plain mean gap, the white area divided by the band.

For the square and circle widgets the table also gives p −3 with the cap
scaled to the shape (0.71 of its size), which the scaled copies tell apart from
the fixed 40 px cap.

## Widgets

Every widget except the two copies of part 1's widget 1 has the same form: a
pair of squares at a fixed gap g0 on top, and the pair being set below it,
shifted sideways so that no edges line up. The lower right shape moves. v is
the lower pair's box gap in px (shapes 56 px across), and every candidate
predicts the v at which it measures the lower pair as g0 (two squares at g0
measure g0 under every candidate). In the copies of part 1's widget 1, v is the
square's box gap, as in part 1. A mirrored copy has the same v as its original.

"(touch)" marks a candidate that never reaches g0 before the shapes overlap on
some line, so it puts them touching. "(blind)" marks the capped measure where
both gaps are past its cap: it measures both as 40 px, so any v past the value
shown is equal for it.

The order was shuffled once (seed 1, the first seed that keeps a
repeat or a scaled copy away from its original's neighbors). The start is
outside every prediction and at least 8% of the track from either end, and a
repeat starts on the side opposite its original.

| id  | key                  | purpose                        | geometry                                                                          | box  | contact | p −3, cap 40   | hull, p −8 | mean gap p 1 | p −3, cap 0.71 s | start |
| --- | -------------------- | ------------------------------ | --------------------------------------------------------------------------------- | ---- | ------- | -------------- | ---------- | ------------ | ---------------- | ----- |
| w1  | square-circle        | discriminate                   | a square and a circle                                                             | 30.0 | 30.0    | 25.9           | 27.0       | 24.0         | 25.9             | 51    |
| w2  | far-squares          | control: a far gap             | two pairs of squares, the reference 90 px apart                                   | 90.0 | 90.0    | ≥ 40.0 (blind) | 90.0       | 90.0         |                  | 22.5  |
| w3  | interlock            | discriminate                   | an up triangle and a down triangle, slanted sides parallel                        | 30.0 | 2.0     | 2.0            | 2.0        | 2.0          |                  | 49    |
| w4  | triangles            | repeat: v1 widget 1            | v1 widget 1: a square, then up, down and up triangles fixed 30 px apart           | 2.0  | 30.0    | 20.3           | 23.0       | 16.0         |                  | −17   |
| w5  | square-circle-double | scale of square-circle, 2x     | a square and a circle at 2x size (shapes 112 px, reference gap 60 px)             | 60.0 | 60.0    | ≥ 40.0 (blind) | 54.0       | 48.0         | 51.9             | 101   |
| w6  | tip-circle           | discriminate                   | a circle and a triangle whose tip points at it                                    | 30.0 | 30.0    | 16.1           | 20.7       | 0.4 (touch)  |                  | −18.5 |
| w7  | notch                | discriminate                   | a triangle's tip pointing into the notch of an L                                  | 30.0 | 14.2    | −2.9           | 13.7       | −15.6        |                  | 48    |
| w8  | stars                | control: an odd shape          | two pairs of thin stars, the reference 30 px apart                                | 30.0 | 30.0    | 30.0           | 30.0       | 30.0         |                  | 9.5   |
| w9  | square-circle-half   | scale of square-circle, 0.5x   | a square and a circle at 0.5x size (shapes 28 px, reference gap 15 px)            | 15.0 | 15.0    | 12.9           | 13.5       | 12.0         | 13.0             | 25.5  |
| w10 | tip-circle-mirror    | repeat of tip-circle, mirrored | a circle and a triangle whose tip points at it, mirrored                          | 30.0 | 30.0    | 16.1           | 20.7       | 0.4 (touch)  |                  | 49    |
| w11 | tips                 | discriminate                   | two spikes, tip to tip                                                            | 30.0 | 30.0    | 11.1           | 18.0       | −0.3 (touch) |                  | 49    |
| w12 | triangles-mirror     | repeat of triangles, mirrored  | v1 widget 1: a square, then up, down and up triangles fixed 30 px apart, mirrored | 2.0  | 30.0    | 20.3           | 23.0       | 16.0         |                  | 49    |

### How well the discriminating widgets separate the candidates

Each pair of candidates, with the discriminating widget where they differ most.
Every pair differs by at least 3 sd of part 1's typical spread (1.5 px)
somewhere.

| candidate               | candidate               | largest gap, px | in sd of 1.5 px | widget     |
| ----------------------- | ----------------------- | --------------- | --------------- | ---------- |
| bounding box            | contact                 | 28.0            | 18.7            | interlock  |
| bounding box            | power mean p −3, cap 40 | 32.9            | 21.9            | notch      |
| bounding box            | hull, p −8              | 28.0            | 18.7            | interlock  |
| bounding box            | mean gap p 1            | 45.6            | 30.4            | notch      |
| contact                 | power mean p −3, cap 40 | 18.9            | 12.6            | tips       |
| contact                 | hull, p −8              | 12.0            | 8.0             | tips       |
| contact                 | mean gap p 1            | 30.3            | 20.2            | tips       |
| power mean p −3, cap 40 | hull, p −8              | 16.6            | 11.1            | notch      |
| power mean p −3, cap 40 | mean gap p 1            | 15.6            | 10.4            | tip-circle |
| hull, p −8              | mean gap p 1            | 29.3            | 19.5            | notch      |

The weakest pair is contact against the hull at p −8 (12 px, on the tips).
Away from a tip in a notch, no simple pair of shapes put p −3, cap 40 and the
hull more than about 7 px apart, so the notch widget carries that pair.
square-circle separates the candidates least (box and contact at 30, the
others at 24 to 27); it is there mainly as the 1x of the scaled copies.

## Analysis plan

- **Execution noise per person** comes from the repeats: for each person, the
  difference between their answers on tip-circle and tip-circle-mirror, and on
  triangles and triangles-mirror. Half the squared difference, averaged, is
  that person's within-person variance.
- **Variance due to strategy** on a widget is the between-person variance
  minus the mean within-person variance. If it is about zero on the
  discriminating widgets, H1 holds.
- **H2 against H3.** On the five discriminating widgets, assign each person on
  each widget to the nearest candidate (when the nearest is more than 2 sd of
  the within-person noise closer than the next). If each person's candidate is
  the same across widgets while people differ, that is H2. If people agree on a
  widget while the candidate changes from widget to widget (for example contact
  on the tips, a power mean on the square and circle), that is H3. A mix shows
  as clusters that hold on some widgets and not others.
- **Noise and difficulty.** The two controls (far-squares, stars) have every
  candidate at the same place (the capped measure is blind past 40 px on
  far-squares), so their spread is execution noise alone. Compared with the
  repeats' noise on easy widgets, they give noise as a function of difficulty;
  a high-spread widget whose spread is no larger than the controls' tells the
  strategies apart only by noise.
- **Size.** square-circle-half, square-circle and square-circle-double show the
  same pair at 0.5x, 1x and 2x. If people's answers divided by the size are the
  same at every size, the depth limit is relative to the shape (p −3 with the
  cap at 0.71 s); if they follow the fixed 40 px cap, it is absolute. Their
  spread, divided by the size, says whether noise grows with size. On a narrow
  screen the 2x copy is drawn smaller than twice the 1x copy, so each block
  records the window width (`screen:`), and only blocks from screens wide
  enough to show it whole should count for the size question.
