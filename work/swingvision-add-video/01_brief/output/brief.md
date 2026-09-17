# Add video to an existing SwingVision match

## Goal

Let a user upload a video file to a match already imported from SwingVision and
align its existing data with that video. The uploaded recording may have been
trimmed differently from the recording SwingVision analysed.

## Scope

- Add a video file to an existing SwingVision match after the data import.
- During video attachment, prompt the user to identify where the first point in
  the imported match data starts in the uploaded video.
- Use that first-point alignment to adjust all video-relative timestamps for the
  match consistently, preserving the intervals between events in the data.
- Make point selection and timestamp-based playback use the aligned times, so
  selecting a point seeks to its corresponding moment in the attached video.
- Retain the attached video and alignment when the user returns to the match.

## Non-goals

- Adding video through a pasted link.
- Re-analysing the video, generating new statistics, or changing the match's
  SwingVision provenance.
- Automatic detection of the first point.
- Synchronising recordings with internal cuts, reordered footage, or changed
  playback speed; a single first-point alignment cannot correct those differences.

## Constraints

- Preserve the imported match results, statistics, player identities, event order,
  and timing intervals; alignment changes where events occur in the video.
- Account for the first point's existing data timestamp as well as its position
  in the uploaded video. The first imported point need not start at data time zero.
- Support a recording with either more or less lead-in than the analysed video,
  provided it includes the first imported point and corresponding match footage.
- An incomplete or failed attachment must leave the existing match data usable.
- Apply the existing workspace and match access rules to video attachment.
- Storage, upload mechanics, and how alignment is persisted are design-stage
  decisions; this brief specifies the user-visible timing outcome.

## Success criteria

- A user can open an existing SwingVision match and upload a video file without
  importing the match data again.
- The attachment flow asks where the first imported point starts in that video
  and requires the user to confirm that position.
- If the first imported point is at data time 00:30 and the user identifies it at
  video time 00:10, a later point at data time 01:30 plays at video time 01:10.
- If the same first point is instead at video time 00:50, that later point plays
  at video time 01:50. Both added and removed lead-in are handled consistently.
- All timestamp-based match playback uses the same alignment after saving and
  reopening the match, while statistics and event ordering remain unchanged.
- Cancelling or failing the upload does not corrupt the imported match.

## Open questions

- Should this release also let users replace an attached video or correct a
  previously confirmed alignment? The confirmed requirement covers adding video
  after data import; replacement and correction have not yet been agreed.
- What should users see when some imported events fall outside the uploaded
  video's duration or the recording omits the first imported point?
- Which file formats, size limits, and retention rules apply to attached videos?
  Resolve against existing platform capabilities during design.

## Also consulted

- User clarification in this conversation: upload a video file; align all
  timestamps using the first point because the uploaded video may be trimmed
  differently from the video analysed by SwingVision.
