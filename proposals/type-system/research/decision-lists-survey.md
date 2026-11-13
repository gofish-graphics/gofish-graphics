# Do the decision lists get answered? A survey of past sessions

Survey date: 2026-11-13. Question: Josh said he basically never reads the numbered "decisions for Josh" lists at the end of proposals, and guessed that he mostly goes with the recommendation, or else the questions together point at a misunderstanding. This note checks that guess against the session record.

## Summary

The record supports the first half of the guess strongly and the second half partly.

- **The lists mostly go unanswered.** I found 61 assistant messages that end with a headed, numbered list of decisions or open questions, in 29 of the 96 transcript files. The next thing Josh typed answered the list by number about 8 times and gave a blanket "go with your recommendations" about 4 times. About 49 times he wrote something else: a reaction to a render, a question about one example, a correction, or an unrelated task. The 23 efforts I read closely carried roughly 280 listed decisions at their largest. Josh explicitly answered about 27 of them one at a time.
- **When he does answer an item, he mostly takes the recommendation.** Of the 27 items he answered one at a time, about 15 matched the recommendation, about 7 picked the other option or a third one, and about 5 rejected the question's framing.
- **When he answers in bulk, he defers.** About 75 more items were settled by a blanket answer, without his reading them one by one: "stick with your recommendations" (13 label decisions), "go with your own judgements for the 18 decisions" (enclose), "go with your recommendations" (layout engine, chrome outer box), "lgtm" on a 19 row recommendation table (shape definitions). In one case he overrode one of the 19 within 20 minutes of the "lgtm".
- **The rest were never addressed, and the work went on anyway.** Roughly 180 of the 280 items got no answer of either kind. Whole lists went silent: spiral periodic tables (11), stacking (14), bottle fill (11 after the first reply), stacked ribbons (8), uncertainty (6 and 12), and 39 of the 41 type system decisions. The label decisions sit in issue #1202, still open with no comments. In chrome children the assistant wrote "you hadn't answered the study's 7 questions, so I took its recommendations". Silence here is not agreement; it is simply no signal.
- **The misunderstanding half of the guess holds in specific cases.** In at least eight efforts, one free form reaction from Josh corrected a premise and made several listed decisions moot or rewrote them. Examples: the choice proposal's `Break` family and the `wrap` operator (corrected by "spread vs stack is about whether they separate spaces or glue them together"), the croissant `weight` option, the region compositing operators (`paint`, `mask`, `clip`), the stacked ribbons syntax, and the chrome outer box defaults. In these cases the list questions were downstream of the wrong premise, and answering them one by one would not have helped.
- **His design input arrives through examples.** Nearly every design change in these sessions started with Josh reacting to a picture, a spec, or a name: "a lot of dots are towards the edge", "give an example of dropping paint", "show me two images of the differences", "ranked is confusing too". The decision lists rarely produced a change.

## Sample

- **Files.** 96 transcript files under 50 project directories whose names start with `-Users-jmp-gofish-20250316` (4 of them are empty "orphaned" stubs). They span 2026-09-22 to 2026-11-13.
- **Automated pass over all 96.** A script streamed every file and found assistant messages with a decisions or open questions heading followed by at least two numbered items. It then classified the next human message as answered by number, blanket approval, or other. It also searched every human message for "decision", "recommend", "confused", "don't understand" and similar words. The heading pattern misses lists with other headings (for example "Judgment calls"), and it counts each round of a growing list separately, so the 61 figure is approximate.
- **Close reading.** I read the human messages and the decision lists in full for 23 efforts across about 25 sessions, chosen because the memory notes name them as proposal efforts or because the automated pass found lists in them. I compared each answered item against the recommendation stated in the list or on the page as quoted in the transcript. I did not open the published proposal pages themselves, so where a recommendation lived only on a page I mark it unknown.

## The lists found

"Items" is the size of the list at its largest. "Recs" says whether each item came with a stated recommendation. Session ids are the first 8 characters of the transcript file name.

| Effort                           | Session            | Dates          | Items                                        | Recs                          | What Josh did                                                                                                                                                                               |
| -------------------------------- | ------------------ | -------------- | -------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label placement                  | 8d8582bd           | 10-16 to 10-27 | 8, then 13                                   | Yes                           | Never answered items. Eleven days later: "stick with your recommendations". Parked in #1202, still open.                                                                                    |
| Enclose (background hull)        | 945bc731           | 10-11 to 10-15 | 18                                           | Yes                           | "go with your own judgements for the 18 decisions". Later reframed `Shape.box` versus any mark as background; picked `Shape.oval`.                                                          |
| Chrome outer box #1032           | 8cfdf6ab           | 10-09 to 10-14 | several short lists                          | Yes                           | First corrected the premise ("I'm kind of confused by the decisions you're making"), then twice "go with your recommendations".                                                             |
| Layout engine #1176              | b0b4122c           | 10-28          | 5, then 5                                    | Yes                           | "go with your recommendations", plus answers to D4 and D7 from the page. Second list: "lgtm".                                                                                               |
| Croissant charts                 | 8bfbe80b           | 10-28 to 10-29 | 7, plus two "walls"                          | Yes                           | A render reaction exposed a bug and reshaped decision 2. Chose option (b) over the recommended `weight`. "I agree with this" for the rest. Reframed both walls.                             |
| Shape definitions #1267          | 7e82df07           | 10-30 to 11-03 | 8, 8, up to 15, then 19                      | Yes                           | Answered round 2 in prose, matching the recommendations. Many reframes from cards. Asked "what do you recommend for each decision", then "lgtm" on 19. Overrode `blank()` 20 minutes later. |
| Annotation API                   | 486a6973           | 11-01          | 9, growing to 18                             | Partly                        | "C is good overall" (item 1, matched). Reframed bands and the math example. The other items were never answered.                                                                            |
| Blob enclose shapes              | 5bd3b264           | 11-02 to 11-04 | 4, 5, 6, then 8                              | Yes, recommended option first | Asked "what do you need me to decide", then answered all 8 by number: 5 matched, 2 overridden, 1 reframed.                                                                                  |
| Uncertainty #980                 | 96373e20, 4d52bff1 | 10-30 to 11-06 | 6, then 12                                   | Partly                        | No list answered. The memory note says "6 decisions listed for Josh; none answered yet". The design moved through his reactions to specs.                                                   |
| Animation grammar                | 44e059e0           | 10-13 to 10-16 | 7, then 5                                    | Unknown                       | Answered a few in prose; "I'll get back to you on the other questions". No later answer found.                                                                                              |
| Python animation and interaction | 37eb3564           | 10-21 to 10-22 | 7, 9, 8                                      | Yes                           | Answered three open questions by number, delegating: "I'm delegating more of the decisions to you".                                                                                         |
| Units and CanAdd #1197           | bfb06ef1           | 10-27          | several lists of 2 to 5                      | Yes                           | Answered by number, with premise corrections ("CanAdd is a property of the unit not the column. fix it now").                                                                               |
| Choice, cost and wrap            | 03f16e14           | 11-05          | 4 in chat (10 on the page), then 14, then 17 | Yes                           | Two of four matched in prose. Questioned `Break`, which flipped it. A premise correction moved `wrap` into an option. The rest were never answered.                                         |
| Sankey layout                    | 82521337           | 11-05          | 6, then 10                                   | Yes                           | Answered the name by reaction (neither `layered` nor `ranked`) and deferred the phase DSL. Nothing else.                                                                                    |
| Scale ranges and transforms      | 20fec538           | 11-05 to 11-06 | about 9 each                                 | Yes                           | Answered the per-unit color question (matched). His observation about log flipped the transforms recommendation. The rest open.                                                             |
| Stack profiles                   | acc9d1fa           | 11-11          | 5 points (16 on the page)                    | Yes                           | Answered 5 by number, one with "do we need this or is it superfluous?"                                                                                                                      |
| Stacking design space            | 385f0ee6           | 11-07          | 11, then 14                                  | Yes                           | No list answered. "slept on it" message reframed stack as an operator over an interval representation.                                                                                      |
| Bottle fill by area              | 8ff5ac3f           | 11-07          | 9, then 11                                   | Yes                           | Name answered by reaction (`Coord.envelope`, over the recommended `Coord.region`). Nothing else.                                                                                            |
| Spiral periodic tables           | 3e82bbbc           | 11-11          | 11                                           | Yes                           | No reply in the record.                                                                                                                                                                     |
| Stacked ribbons                  | 4b54a3df           | 10-20 to 10-21 | 8, plus later lists                          | Yes                           | No list answered. "go back to the drawing board", then anchors replaced the design.                                                                                                         |
| Chrome children #1257            | 9b3799ac           | 11-03 to 11-05 | 7, then lists of 2 to 4                      | Yes                           | The 7 went unanswered and defaults were taken. Later lists answered by number, with corrections, or "yes do all three".                                                                     |
| Petal and polygon #1331          | 62975e6f           | 11-06 to 11-07 | 5, then 2                                    | Mostly                        | Picked "shape 1" from renders; "sure go with A"; "keep petal around".                                                                                                                       |
| Type system                      | e051d870           | 11-12 to 11-13 | 13, growing to 41                            | Mostly                        | No list answered. Two naming items settled from a side by side comparison: `over` (matched) and `canSum` / `canAverage` (overrode the lean toward adjectives).                              |

## Evidence

### Blanket approval, without reading the items

- Label placement, 8d8582bd, 10-27: "just open some tracking issue about the 13 decisions to revisit them later. stick with your recommendations. I just want to get a version of labeling out"
- Enclose, 945bc731, 10-15: "go with your own judgements for the 18 decisions and convert this from a prototype to a real implementation."
- Layout engine, b0b4122c, 10-28: "go with your recommendations, and push the prototype first"
- Parity exemptions, d7321ffa, 10-20: "re: those two decisions, pick the simplest, most consistent options (consistent with the system as a whole not necessarily with what we did before)"
- Layout engine, b0b4122c, 10-30: "wall 2. I'm less concerned about this right now. make a decision and open an issue to revisit it"

### Answers item by item, and how they compared with the recommendation

- Blob shapes, 5bd3b264, 11-04, after he asked "what do you need me to decide": "1. I don't really like reach. ... 2. I don't understand the difference between these two or how to decide 3. I think radius 0 is a really harsh preset on anything other than bubble treemap so idk 4-7 yes 8 should we move holes, avoiding, and clearance onto the main enclose operator along with padding?" Items 4 to 7 matched. Item 2 matched once explained ("definitely A"). Items 1 and 3 overrode the recommendation. Item 8 reframed it.
- Shape definitions, 7e82df07, 11-02: "ok I am on board with .hidden() only and no hide(x) ... I now agree that we shouldn't be able to call .hidden() through a ref". These matched the round 2 recommendations. On 11-03 he asked "what do you recommend for each decision", got a 19 row table and replied "lgtm". Twenty minutes later he overrode row 17 (delete `blank()`): "yes I think that blank serves an important purpose. it's the "nil" element for some operations".
- Type system, e051d870, 11-12, after a side by side naming comparison: "we wrote the standing rule. we don't necessarily have to keep it. I like `over` better than `by` here. ... I like canAverage better than weighted b/c weighted is ambiguous". The assistant had leaned toward `over` and toward keeping the adjective names, so one matched and one did not.
- Choice and cost, 03f16e14, 11-05: "I could go with either choose or choice ... I have a very soft preference for choose" (matched) and "choice over options is very clever and great" (matched). On `Break`: "it feels like most of them desugar to the same structure with different cost models? ... Just wondering why we have both Break and Cost". The assistant then dropped `Break`.

### Overrides that came from a picture, not the list

- Croissant, 8bfbe80b, 10-28. The recommendation was a `weight` option. After a three panel figure he had asked for ("can you visualize this in the artifact? I don't understand"), he wrote: "yes switch to (b) and republish. I'm in favor of a bad approximation to first-class distributions rather than an extraneous option we'll remove later"
- Bottle fill, 8ff5ac3f, 11-07: "coord.envelope is better b/c we already have a region mark which isn't really the same as the envelope thing". The naming decision disappeared.

### Reframings that made several listed decisions moot

- Choice and cost, 03f16e14, 11-05: "By the way spread vs stack is about whether they separate spaces or glue them together. It's not specifically about spacing = 0 or about horizontal vs vertical direction". The assistant replied that round 1 "was wrong" and turned `wrap` from an operator into an option on `stack` and `spread`. The listed `wrap` and `Break` questions changed with it.
- Chrome outer box, 8cfdf6ab, 10-09: "I'm kind of confused by the decisions you're making. My first instinct is that axes: true should be the default."
- Chrome children, 9b3799ac, 11-05: "1. I don't know what this means. there shouldn't be a sepcial case for axes and legends that the rest of the system doesn't have. like they should be normal nodes"
- Units, bfb06ef1, 10-27: "2. CanAdd is a property of the unit not the column. fix it now 3. ok... I don't understand this"
- Shape definitions, 7e82df07, 11-02: "ok it seems like paint, clip, and mask overlap a lot. so maybe we can do a better job? clip isn't actually even in gofish yet". Several decisions about `mask`, `paint` and `clip` came off the page.
- Stacked ribbons, 4b54a3df, 10-20: "I think you should go back to the drawing board and spend some more time exploring possibilities. We'll know it's right when we have something that's effortlessly compositional". The 8 listed decisions were replaced by the anchors design.
- Stacking, 385f0ee6, 11-07: "slept on it. current thinking is that we have an interval repr for lines and ribbons ... and then maybe stack can just be an operator not a modifier."
- Type system, e051d870, 11-13: "It seems like the key is just a list of fields, but does not contain any information about the key space. ... But the other thing is that warehouse does not have a type."

### Where the design input actually came from

His substantive input almost always took the form of a reaction to something concrete:

- To a render: "this looks pretty good but I'm noticing a lot of dots are towards the edge for some reason" (croissant, 8bfbe80b). That led to a real bug fix and decision 2.
- To a spec: "The spread call with a single child looks like it has a single child!" (stacked ribbons, 4b54a3df, on a pasted Titanic spec).
- To a name: "ranked is confusing too. maybe sugiyama or layeredGraph idk" (sankey, 82521337).
- With his own syntax: in 62975e6f he pasted the `sweep` spec he "really wanna write".
- To an interactive tool: "convexity, neck, and padding are really good and it's really fun to manipulate the convexity slider" (blob, 5bd3b264).

### Signs the lists lacked context

Josh often could not answer a listed item without more material:

- "create an artifact with specs and images of some of the failing examples. use those to explain your questions as well b/c I don't understand them" (chrome outer box, 16d4fc3c, 10-16)
- "2. I don't understand the difference between these two or how to decide" (blob, 5bd3b264)
- "yes w and h should still mean the plot area. I don't undesrtand the scatter axis question or item 3" (chrome children, 9b3799ac)
- "for decision 1 show me two images of the differences" (blob, 5bd3b264), followed later by the one character answer "1".
- "I didn't mean decision 5 I meant example 5" (30b0c1af, 11-10). He refers to work by example, not by decision number.

## What forms of question worked

Ranked by how often the form got a real answer in the sessions I read:

1. **Two or three rendered options side by side, on the example he cares about.** These almost always got a quick pick, often one word: "shape 1" (petal), "1" after "show me two images of the differences" (blob), "per-bay blend looks the best to mee" (blob), "my two favorite are avoid and no cut/overlap" (blob), and option (b) after the croissant figure. The pick sometimes went against the recommendation, which is the useful case.
2. **One direct question in chat about something he is looking at.** Answered within minutes: "for 1330 I think that large charts should shrink to fit" (62975e6f), "yes, fix all ten" (945bc731), "yes do all three" (9b3799ac), "sure go with A" (62975e6f).
3. **A name comparison table or side by side spellings.** These got answers, but often a third option: `canSum` and `canAverage` (type system), `connection` instead of `reach` or `bridge` (blob), `sugiyama` or `layeredGraph` instead of `ranked` (sankey).
4. **A short list he asked for himself.** "what do you need me to decide" got 8 answers by number. "what do you recommend for each decision" got "lgtm". The difference is that he requested the list at a moment he chose.
5. **An AskUserQuestion dialog.** I found one in the sessions I read closely (label placement, 10-27, 13 decisions in one option). He did not pick an option in it; 14 minutes later he answered in chat with "stick with your recommendations" and asked for a tracking issue.
6. **A long numbered list at the end of a proposal page or report.** Least effective. In the automated count, about 49 of 61 such lists were followed by something other than an answer. Lists that grew round by round (9 to 18, 13 to 41) were never answered in full.

## Standing instructions he has given before

- **Design Desk, 10-30** (memory note `reference_design_desk_hub.md`): no status prose or issue numbers on cards ("my eyes glaze over") and "no counts of open decisions".
- **Example first proposals, 11-02** (shape definitions, 7e82df07): "the way the artifact is written, it's hard to understand what the proposals are ... What I want are the examples with an image above and the code below it ... Right now I'm having to read a lot of prose to understand what's changing b/c it's so diffuse"
- **Syntax under the images, 10-15** (13f2459c): "the syntax recommendations should be immediately under the images they are drawing btw."
- **Delegation, 10-22** (37eb3564): "I want whatever is simple, compositional, and as expressive as JS, but I'm delegating more of the decisions to you as to how to implement that, so I'm less strongly opiniated about precise semantics like that as long as the high-level design decisions are achieved"
- **Today, 11-13** (e051d870): "I basically never read the list of design decisions ... the list typically does not have enough context for me to answer them and it quickly leads to decision fatigue". This is now the memory note `feedback_no_decision_lists.md`.

The `api-proposal` skill told sessions to "end with the decisions Josh needs to make, phrased as short questions". That instruction is the main source of the lists.

## What I could not determine

- **Exact item counts.** Lists grew and were renumbered across rounds, and many lived only on published pages that I did not open. The 280 total and the per-category counts are estimates from the transcript text, accurate to perhaps 10 to 20 percent.
- **Recommendations that lived only on pages.** Where the chat did not restate a recommendation, I could not say whether a later instruction matched it. For example, the layout engine's D4 "a" and the petal "A".
- **Later sessions outside this project.** Some efforts may have been settled in claude.ai chats, in GitHub comments, or in person. I only checked issue #1202, which has no comments.
- **Implicit agreement.** When work proceeded on a default, Josh sometimes reviewed the resulting PR and merged it. That may be agreement with the defaults or simply no objection. I did not count it as agreement.
- **Full AskUserQuestion count.** The tool shows up in the tool list of every transcript, so a text search could not separate real uses from the listing. I found one real use in the sessions I read.
- **Subagent transcripts.** I skipped subagent and sidechain turns, so lists that agents wrote and the main session did not relay are not counted.
