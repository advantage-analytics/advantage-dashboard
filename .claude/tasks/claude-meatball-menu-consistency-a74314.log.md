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
