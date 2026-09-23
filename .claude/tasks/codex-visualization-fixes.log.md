# Run log — codex/visualization-fixes

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Reconcile serve zones and plotted coordinates — done

**gate:** Mechanical: GATE PASS (lint, typecheck, full test suite). Completion: VERDICT: pass.

**changed:** Unified serve resolution, zone membership, service-side filters, and zone statistics with the verified server-facing dot orientation. Corrected mirrored zone counts; retained empty zone cells and documented in-serve denominators. Added asymmetric source fixtures and Chromium regressions covering production chart selection and both court renderers. Targeted validation: 451 pure tests and 2 browser tests passed.

**follow-ups:** 1. Audit other consumers of legacy serve-zones.ts; they were intentionally outside T1 scope.
