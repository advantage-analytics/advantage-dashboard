# Run log — claude/api-audit-684175

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Webhook fails closed when the secret is set — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** `verifyWebhookAuth` + `SIGNATURE_HEADERS` moved to new pure module `src/lib/services/splitstep/webhook-auth.ts`; with a secret set, a delivery with no signature header is now refused (401) unless `SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED=true`; `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE` is no longer read. `.env.example` rewritten; new offline spec `tests/splitstep-webhook-auth.spec.ts` (6 cases, incl. the inert-flag case). Raw-secret-in-header tolerance untouched.
**follow-ups:**

1. `docs/video-pipeline-overview.md:287,675` and `docs/ui-revamp-guardrails.md:27` still say to set `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true` — now inert; update to the fail-closed default + `ALLOW_UNSIGNED` hatch.
2. `SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED=true` left on in Vercel only surfaces as a per-delivery warn — consider `pipelineLog.error` or a health assertion.
3. The route's 401 branch is covered by reading only; a route-level spec (T3's harness) could assert the HTTP response.
