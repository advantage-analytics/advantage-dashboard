# Run log — claude/meatball-menu-consistency-a74314

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · WizardShell footer draws Back and Cancel together — done

**gate:** mechanical PASS · completion `VERDICT: pass`

**changed:** `WizardShell` footer now draws Back (`<button>`) and Cancel (`<Link>`) together when both props are set, Back first, sharing one `FOOTER_LINK_CLS`. `UploadMatchFlow` passed `cancelHref` on every step (the task assumed first-step only), so it now passes `step === firstStep ? exitHref : undefined` to keep the upload footer unchanged. Side effect: new dual steps 2–3 and new tournament steps 2–3 now show Back and Cancel together.

**follow-ups:**

1. `new-dual-flow.tsx:530-531` comment ("the shell draws one or the other") is now stale — natural for T3 to fix.

## T2 · Event chooser adopts WizardShell, keys and stepper — done

**gate:** mechanical PASS · completion `VERDICT: pass`

**changed:** `StaticEventChooser` now draws through `WizardShell` as step 1 of 4 (heading/lede as title/description, Back + Cancel → schedule, selection label in `status`, shell Continue), dropping `EventShell`, the ghost Cancel and the 820px footer wrapper. `useWizardKeys` bound with `canGoBack: false`; its ⌘/Ctrl+Enter walk is scoped to the card group (card → card → Continue), Enter on a card opens that card's flow, and a keyboard-only handler lets Enter on the aside link / Back / Cancel activate that control instead of Continue. `EventChooserPending` skeleton now uses the shared wizard chrome at 1 of 4 with a Back · Cancel · label footer. Copy spec: `"Cancel"` assertion retired; `"Continue"` kept (still in `COPY`).

**follow-ups:**

1. `useWizardKeys` itself swallows plain Enter on footer links/buttons (Cancel, Back) and continues the wizard instead — on every consumer, dual flow included. The hook should skip non-Continue links and buttons.
2. `src/components/dashboard/schedule/README.md` may still describe the chooser as `EventShell`.

## T3 · Dual/tournament flows: 4-step count, Back to chooser on step 1 — done

**gate:** mechanical PASS · completion `VERDICT: pass`

**changed:** On create, both flows count 4 steps with the chooser as step 1 (school/name step reads "Step 2 of 4"); edit keeps 3 steps and `step - 1`. Step 1 of both create flows now has Back → `router.push("/dashboard/team/schedule/new")` plus Cancel → schedule, with `canGoBack: false` so Escape stays inert there. Dual's unused `SchoolStep` `back` prop removed and the stale "one or the other" comment rewritten. New dual / new tournament skeletons draw 4 segments with a Back · Cancel footer; the edit skeleton keeps 3.

**follow-ups:**

1. Add a harness assertion that step 1's Back pushes `/dashboard/team/schedule/new` (the `next/navigation` mock records pushes in `window.routerPushes`) — no spec exercises it today.
2. Dual edit's last step now shows Back and Cancel together (a T1 consequence) — confirm that's wanted.
3. `useWizardKeys` still swallows plain Enter on footer Back/Cancel (see T2 follow-up 1).
