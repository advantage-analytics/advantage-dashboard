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
- Let users replace an attached video and confirm its first-point alignment.
- Let users correct the alignment of an attached video without uploading it again.

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
- A cancelled or failed replacement must preserve the previously attached video
  and its alignment.
- Support most common video file formats and a broad range of file sizes, with a
  practical upper limit for very large files. The user's size preference was
  "any size but nott big"; a numeric limit has not been specified.
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
- Replacing a video aligns playback with the replacement recording; correcting
  alignment updates all video-relative timestamps without accumulating offsets
  from previous alignment changes.
- If the video cannot cover the imported match at the chosen alignment, reject
  that attachment or alignment and show: "This video is not long enough."
- A rejected replacement or correction preserves the existing video and alignment.

## Open questions

- Which concrete file formats and codecs can the platform support, and what
  practical maximum file size meets the preference for broad size support without
  very large uploads? Resolve during design against existing capabilities.
- Which existing retention rules apply to attached and replaced videos? Resolve
  during design.

## Also consulted

- User clarification in this conversation: upload a video file; align all
  timestamps using the first point because the uploaded video may be trimmed
  differently from the video analysed by SwingVision.
- User review of the brief: include video replacement and alignment correction;
  show a video-too-short error when coverage is insufficient; support most video
  formats with a practical limit on very large files.
