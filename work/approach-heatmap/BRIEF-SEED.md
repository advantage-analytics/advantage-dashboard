# Brief seed — approach-heatmap

## Captured verbatim from the invocation

> A UGA coach wants a transition/approach heat map: where the player approached from (forehand/backhand/middle), where the approach shot went, the passing shot that came back (down the line/cross-court), and whether the point ended in an error or winner, with each point linked to its video. Goal: build up approach patterns per player across matches ("every time I come in to their backhand, they pass down the line"). Three of their players are being pushed to come to the net more.
>
> First check what the shot data actually has: approach shots, net positions, passing shots, shot direction. Use the same source as the Net game widget. If key fields are missing, say so before designing. Brief should cover single-match vs. multi-match views and how it fits next to the existing serve/return/error heat maps. Stop after the brief for my review.

## Decided in the design session (2026-11-17) — Claude's summary, check before relying on it

**Data check (live database, 50,939 non-serve shots).** Contact point recorded on 81.3%, landing point 76.2%, direction (`shots.zone`: Crosscourt / Down the Line / Middle) 92.6%, video time 78.0%. No key field is missing. Coming to the net, the approach shot and how the point ended already come from `src/components/dashboard/matches/match-detail/match-filters/net-game.ts` (`netEntryOf`, `netApproachShotOf`, `netEndingOf`), the Net game card's source, so the two must agree.

**Known gaps.**
- The opponent's hand is not stored for opponents. "Their forehand / backhand" labels assume right-handed; the court lanes themselves are geometric and do not change.
- Lob detection (`LOB_APEX_M`) has not been checked against a labelled match.
- SwingVision imports have no video, so their points have no clip.

**Decisions the human made.**
- Count all three ways of coming in that `netEntryOf` returns (approach, serve and volley, drawn in). The card opens on approaches only; the other two are filters.
- Group approaches mainly by where they went: their forehand / middle / their backhand. Shot direction (crosscourt / middle / down the line) is a second filter.
- Court is vertical and full length, player at the bottom.
- No lines joining the two points of an approach: contact and placement are separate marks, linked by hover and click.
- Contact / Placement and lane labels on the opened view only, in dark text on the apron.
- "How it ended": Passed down the line, Passed crosscourt, Lobbed, Won at the net, Your error. No written summary in the rail.
- Filters go in the lightbox's existing strip (one Filters button and the applied-filter sentence), not a new chip row.

**Approved default view.** `02_design/references/approach-map-v9.html`, published at https://claude.ai/artifact/42iLY987gGCYEH2R7HZHc8 (v9). A sixth card, "Approaches", after Rally shots on the match Visualizations wall, opening in the shipped lightbox.

**Multi-match.** The same card on a player's season page: every match's approaches on one court, the point list grouped by match. Not yet designed.
