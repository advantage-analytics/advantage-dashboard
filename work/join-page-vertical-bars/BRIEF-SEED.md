# Brief seed — join-page-vertical-bars

Replace or extend this with your raw intent in any form. `/feature-next
join-page-vertical-bars` starts the pipeline once you're happy with it.

## Captured from the invocation (author's words, verbatim)

> Remove the vertical bars from the "Join your program" page

## Where those bars come from (for stage 01 to confirm)

The "Join your program" screen is `/join/[token]` in the `ready` state,
rendered from `src/app/join/[token]/page.tsx` through `JoinReady` in
`src/components/join/join-forms.tsx`. Its sharing terms
(`JoinSharingTerms` in `src/components/join/join-terms.tsx`) draw a 2 × 12 px
vertical tick before every row — blue in the "Your coaches will see" column,
ink in the "Stays yours" column — via the private `Tick` component there.
The same block renders on the sign-up state of that page, on
`/invitations/[inviteId]`, and on onboarding step zero, so removing the marks
changes all four surfaces unless the brief says otherwise. The onboarding
guardian step (`src/app/onboarding/onboarding-flow.tsx`) draws a similar
2 px tick-bar on its acknowledgment rows; whether that one is in scope is
for the author to say.
