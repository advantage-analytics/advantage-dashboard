# Brief seed — first-run-onboarding

_Captured verbatim from the `/feature-new` invocation. Stage 01 refines it from here._

> first-run onboarding: sample match tour + guided first upload (personal workspace only). Decisions so far: sample = a single game from the Rudy vs Goodman match, read-only fixture rendered through the real match-detail components via MatchDataProvider, never written to the user's tables; include film (one clip readable by every account); tooltips built on our own design system (no library); tour state persisted per account in DB; route from onboarding step 5 recording-source answer; day-zero home gets "Explore a sample match" secondary link; wizard gets helper copy on the player-identity inputs + quota cost preview (copy only, no input changes per guardrails §4); progress screen links to sample; one-time tour on first real report; getting-started checklist (reuse setup-line.tsx). Team onboarding out of scope.

## Original ask

> I want to have Onboarding UI to help the user familiarize with the app for a first time user. […] Should it be seeded/mock data or have a user upload their first match using advantage intelligence?

## Open items for stage 01

- Consent + anonymisation for using the Rudy vs Goodman match as the public sample.
- How the sample film clip is served to every account (Azure SAS policy for a shared blob).
