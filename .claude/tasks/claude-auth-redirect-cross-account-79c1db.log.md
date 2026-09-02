# Run log — claude/auth-redirect-cross-account-79c1db

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Honor a clamped `next` on both login paths — done
- **gate:** mechanical pass (lint, tsc, test, build all exit 0) · task-completion-reviewer `VERDICT: pass` · pipeline-guardrails-reviewer skipped (no files under src/app/dashboard/, src/components/dashboard/ or the upload wizard) · rls-boundary-reviewer skipped (no files under src/lib/supabase/, src/lib/data/, src/app/api/ or supabase/migrations/). The task subagent (opus) was interrupted after its edits; the gate and commit were run in-session at the author's request.
- **changed:** `src/app/(auth)/login/page.tsx` reads `?next=` once, clamps it with `safeNext`, and renders `LoginForm` inside a `<Suspense>` boundary. `src/components/auth/login-form.tsx` takes a `next` prop, re-clamps it, and uses the result for both `router.push` after password sign-in and the Google `redirectTo` (`/callback?next=<encoded>`), defaulting to `/dashboard`. New `tests/safe-next.spec.ts` pins the five refusal cases and one preserved invite path. Still to confirm by hand: the Supabase redirect allow-list accepts `/callback` with an arbitrary `next` value.
