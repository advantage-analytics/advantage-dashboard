# Brief — approach-heatmap

## Goal

Give a coach a picture of how a player comes to the net, so patterns show up over time: where the player came in from, where the approach went, what came back, and whether the point was won, with every point one click from its video.

The request came from a UGA coach who is pushing three players to come forward more. The question they want answered sounds like "every time I come in to their backhand, they pass me down the line". One match shows the pattern starting; a season confirms it.

## Scope

**One match.** A new court view on the match report's Visualizations tab, sitting with the existing serve, return, rally and error courts. For each time the player came to the net it shows:

- where they struck the approach (contact) and where it landed (placement);
- which part of the opponent's court it went to: their forehand side, the middle, or their backhand side;
- the shot's direction: crosscourt, middle, or down the line;
- how the point ended: passed down the line, passed crosscourt, lobbed, won at the net, or the player's own error;
- won or lost;
- the point's video clip, where the match has video.

It covers all three ways of coming in that the Net game card already counts (approach, serve and volley, drawn in). It opens on approaches only; the other two are a filter away. It works from either side of the match: the player, or the opponent coming in against them.

**Across a season.** The same view on a team player's profile page (`/dashboard/team/roster/[playerId]`), with every analysed match's net points on one court, so a pattern can be checked across opponents.

**Where it lives.** It joins the Visualizations wall and its opened view, using the filters, statistics and point list that view already has. The approved default-view design is in `02_design/references/approach-map-v9.html`.

## Non-goals

- Changing how the product decides a player came to the net, made an approach, or lost to a pass or a lob. The Net game rules are used as they are.
- Storing or asking for an opponent's handedness.
- Validating lob detection against labelled matches. That is separate data work.
- A written or AI summary of the pattern. The view shows counts and marks only.
- Ball speed. It is not loaded into pages (UGA coaches call, 2026-11-16).
- Personal-workspace season view. The season page this builds on is the team player profile.
- Changing the five existing Visualizations cards.

## Constraints

- **One source of truth.** Every count must come from the same classification as the Net game card (`netEntryOf`, `netApproachShotOf`, `netEndingOf` in `match-filters/net-game.ts`). On any match, the new view and the Net game card must agree on how many times a player came in and how those points ended.
- **Data coverage (live database, 2026-11-17, 50,939 non-serve shots).**

  | Field | Recorded on |
  |---|---|
  | Contact point | 81.3% |
  | Landing point | 76.2% |
  | Direction (crosscourt / middle / down the line) | 92.6% |
  | Video time | 78.0% |

  A point missing a field must be handled honestly, never drawn somewhere it wasn't.
- **Opponent's hand is unknown.** "Their forehand / backhand" assumes a right-handed opponent and must say so. The court regions themselves are fixed by geometry.
- **Lobs are estimated.** They come from ball height, which no labelled match has checked yet. A season that includes any match without ball-height data cannot count lobs apart from passes (the season Net game card already handles it this way).
- **Video.** SwingVision imports have no video, so their points have no clip. The season Net game card has no clips at all, because a season has no single film to open.
- **Attribution.** Whose shot is whose must follow the match's sides the way every other court does (`docs/ui-revamp-guardrails.md` §4). A swapped side would show the opponent's approaches as the player's, with nothing looking wrong.
- **Design system.** Built from the existing components and tokens, as the approved design is.
- **Decisions already made by the human:**
  - **Court:** vertical and full length, player at the bottom.
  - **Marks:** contact and placement are separate marks, with no line between them; hovering or clicking one links it to its pair.
  - **Labels:** Contact / Placement and the forehand / middle / backhand lane names appear only in the opened view, as dark text off the court.
  - **"How it ended" rows:** passed down the line, passed crosscourt, lobbed, won at the net, the player's own error.
  - **Filters:** they use the opened view's existing Filters button and filter sentence.
  - **Default:** approaches only, with serve and volley and drawn in available as filters.

## Success criteria

1. On any analysed match, the view's count of net points, and of each ending, equals the Net game card's for the same player.
2. A coach can answer "when this player came in to their backhand, how often were they passed down the line?" for one match, reading it straight off the screen with no arithmetic.
3. The same question can be answered across a team player's season on their profile page.
4. Every point that has video opens its clip from the match view in one action.
5. Points without video, contact, landing or direction never appear as if they had them.
6. The view reads correctly for the opponent's side as well as the player's.
7. The forehand / backhand wording says it assumes a right-handed opponent.

## Open questions

1. **Season clips.** The coach wants every point linked to its video, but the season view has no single film to open. Should a season point open its own match's Video tab at that point, or does the season view stay without clips, like its Net game card?
2. **Season scope for the first release.** Ship the match view first and the season view after, or both together?
3. **Opponent's hand.** Is assuming right-handed acceptable for launch? For team-versus-team matches the opponent may be a roster player whose hand is already stored. Should that be used when it exists?
4. **Missing fields.** A point with a contact but no landing, or the reverse: show the mark it has, or leave the point off the court but keep it in the counts and the point list?
5. **Season filters.** Should the season view also filter by opponent or date range? A pattern against one opponent is the scouting question, but the existing season views may not offer that.
6. **Which three players.** Is this for every team player, or should anything flag the three the coach is pushing forward? (Probably no; noted so it is decided rather than assumed.)

## Also consulted

- `src/components/dashboard/team/player-profile/season-net-game-card.tsx`: to confirm the season view exists on the team player profile, has no clips, and counts lobs separately only when every match has ball-height data.
- `MAP.md`: the route of the team player profile.
