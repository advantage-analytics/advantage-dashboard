# Upload flow refinements

## Goal

Make match upload and import easier to complete accurately: reliable score entry,
clear player identity and editable details, consistent selection controls, and
appropriate team upload eligibility.

## Scope

- Auto-advance game-score entry in set order: player 1 set 1 → player 2 set 1 →
  player 1 set 2 → player 2 set 2, continuing through the available sets.
  Tiebreak score entry must accommodate multiple digits without auto-advancing.
- Fix the reported failure to display scores in set 2 and subsequent set boxes.
- When an import's player name differs from the user's name, ask the user to
  confirm their identity and whether they are player 1. The seed's requested
  message is: “This import has a different name as you, are you sure this is you?
  Are you player1?” Final copy and team-specific identity handling need design.
- Make selection checkmarks blue and list Advantage Intelligence first in the
  provider dropdown.
- Make hand and backhand choices required, prevent their option text from
  wrapping, and align the controls with the design system.
- Make it apparent that player names and hand details can be edited.
- Resolve the selected dropdown option's grey hover treatment. The requested
  direction is a blue checkmark without grey hover, but the seed explicitly asks
  whether retaining grey hover is better. Record the agreed behavior in the
  design system as part of this feature.
- Define the video requirements work; the seed names this topic without details.
- Plan how Save draft should behave. Implementation of draft persistence is not
  established by this seed.
- Prevent Continue for teams that are not confirmed, with the meaning of
  confirmation still to be clarified.
- Ensure team match attribution is to players: an owner must not upload a match
  under their own name merely because they own the team.

## Non-goals

- Redesigning the entire dashboard or unrelated match analysis screens.
- Replacing the upload provider or video processing pipeline.
- Changing tennis scoring rules or restricting tiebreaks to single digits.
- Selecting a new draft storage architecture or implementing draft persistence
  before its behavior and scope have been agreed.
- Broad design-system changes beyond the relevant controls and their states.

## Constraints

- Preserve correct player attribution across personal imports and team uploads.
  Identity confirmation must not silently assume that the uploading team owner
  is the athlete.
- Game-score auto-advance must not apply to tiebreak inputs.
- Use Advantage Intelligence in user-visible naming.
- Follow the repository's design system and upload UI guardrails during later
  design and implementation; this brief does not change pipeline contracts or
  existing upload data semantics.
- Treat the reported bugs as issues to reproduce and verify during implementation;
  this stage has not investigated their causes.
- Prioritize Codex Spark for suitable bounded execution work when available;
  use a more capable model where complex reasoning or review requires it.
- Keep unresolved choices visible for stage 02 rather than treating them as
  approved requirements.

## Success criteria

- Entering a game score moves focus to the next player/set box in the requested
  order. Entering a multi-digit tiebreak score does not move focus mid-entry.
- Scores for set 2 and all subsequent supported sets visibly reflect the entered
  or imported values in the affected upload flow.
- A differing imported name produces an explicit identity confirmation before
  the import can be attributed to the intended athlete.
- Advantage Intelligence is the first provider option, and affected selection
  checkmarks use the design system's blue treatment.
- Hand and backhand fields cannot be omitted when continuing the relevant step;
  their option labels remain readable without wrapping at supported sizes.
- The player name and hand controls visibly communicate editability.
- The selected-option hover decision is documented in the design system and
  applied consistently to the affected dropdowns.
- The agreed team confirmation condition disables Continue while unmet, and
  owning a team does not by itself make the owner an eligible match athlete.
- The design-stage output defines the video requirements scope and an explicit
  Save draft behavior contract before implementation tasks are created for them.

## Open questions

1. What does an unconfirmed team mean: program approval, team selection, roster
   confirmation, or another state? Which step's Continue must be disabled?
   Asked in chat; unresolved when this brief was written.
2. Does Video Requirements mean uploader-facing guidance, uploaded-file validation,
   or both? What specific requirements or current shortcomings prompted it?
   Asked in chat; unresolved when this brief was written.
3. How should Save draft behave: what is saved, when it is saved, how it is resumed,
   what happens to selected local files or uploaded video, and when it expires or
   is discarded? Is the desired deliverable a plan only or implementation too?
4. Should selected options retain a hover/focus background alongside the blue
   checkmark? Resolve the seed's explicit design question, including keyboard focus.
5. Which name is the identity check against for team imports? What counts as a
   mismatch, and what should happen when the user says they are not player 1?
6. Does the owner restriction also exclude an owner who is separately an eligible
   roster player, or only prevent automatic attribution to non-player owners?
7. Are hand and backhand required for both players and all providers? How should
   imported unknown values or an unknown opponent's details be handled?
8. Where is the set 2+ display failure observed: manual entry, imported prefill,
   confirmation, or more than one of these? No reproduction has been supplied.

## Also consulted

- No additional source files. This brief uses the seed, stage references (empty),
  pipeline contracts, and the user's in-chat model preference. Repository guidance
  supplied in the conversation establishes the design and attribution constraints.
