# Run log — claude/meatball-menu-consistency-a74314

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · WizardShell footer draws Back and Cancel together — done

**gate:** mechanical PASS · completion `VERDICT: pass`

**changed:** `WizardShell` footer now draws Back (`<button>`) and Cancel (`<Link>`) together when both props are set, Back first, sharing one `FOOTER_LINK_CLS`. `UploadMatchFlow` passed `cancelHref` on every step (the task assumed first-step only), so it now passes `step === firstStep ? exitHref : undefined` to keep the upload footer unchanged. Side effect: new dual steps 2–3 and new tournament steps 2–3 now show Back and Cancel together.

**follow-ups:**

1. `new-dual-flow.tsx:530-531` comment ("the shell draws one or the other") is now stale — natural for T3 to fix.
