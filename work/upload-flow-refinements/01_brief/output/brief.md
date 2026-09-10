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
- Communicate video requirements: 60 fps preferred, 30 fps minimum (including
  the provider's accepted 29.97 fps), and at least 1080p. The user's required
  framing includes the far service line, near baseline, and area outside the
  court. Provider guidance additionally requires the full court, including both
  baselines; guidance must not imply the far service line alone is sufficient.
- Plan how Save draft should behave. Implementation of draft persistence is not
  established by this seed.
- Disable upload Continue for teams awaiting claim approval in `/admin/claims`.
  Per the user's clarification, a college claim made with an email that does
  not match the scraped emails enters the admin approval queue. This is claim
  approval, not confirmation of a team or player selection. Approval clears this
  particular restriction; other upload eligibility requirements still apply.
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
- Align video guidance with the provider's documented limits and camera guidance.
  The API guide specifies files under 8,000,000,000 bytes, singles only, and
  recommends MP4/H.264 while accepting formats ffmpeg can decode. It recommends
  an elevated camera centered behind a baseline; processing boundaries should
  cover complete games matching the supplied set scores. These are provider
  constraints, not authorization to redesign the processing pipeline.
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
- Teams whose claims await approval in `/admin/claims` cannot continue with a
  team upload. Once approved, this restriction clears without bypassing other
  required fields or eligibility checks. Owning a team does not by itself make
  the owner an eligible match athlete.
- Video guidance distinguishes the minimum 1080p/30 fps requirements from the
  60 fps preference, accepts the documented 29.97 fps exception, and describes
  framing that includes both baselines, the far service line, and outside-court
  area. It remains consistent with the provider's other documented constraints.
- The design-stage output defines how video requirements are presented and an
  explicit Save draft behavior contract before implementation tasks are created.

## Open questions

1. Which upload step should expose the pending claim approval restriction and its
   explanation? The approval condition itself is resolved: `/admin/claims`.
2. Beyond presenting the clarified video requirements, should this feature add
   pre-upload validation? The provider already enforces resolution, frame rate,
   and file size. How much outside-court area should the framing guidance show?
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

- [Provider API client guide — Video Guidelines and error codes](https://splitstep.ai/api-docs.html),
  checked 2026-09-10 for specifications and framing requirements. The guide's
  specifications accept 29.97 fps; its error table describes rejection below
  29.9 fps. Do not invent a stricter rejection threshold during implementation.
- User clarification after stage 01: claim approval means approval through
  `/admin/claims`; unmatched scraped college emails trigger that queue. Video
  requirements and framing above incorporate the same clarification.
- No additional repository source files. This brief also uses the seed, pipeline
  contracts, and the user's in-chat model preference. Repository guidance supplied
  in the conversation establishes the design and attribution constraints.
