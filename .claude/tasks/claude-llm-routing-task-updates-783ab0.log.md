# Run log — claude/llm-routing-task-updates-783ab0

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Define attachment timing and request contracts — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/match-video/` holds the feature's pure contracts with no
Azure/Supabase/Next imports: `types.ts` (add/replace/align modes, pending/active/retired
lifecycle, 15 error codes with their status/message table, `MatchVideoResult` union, and
request/result shapes for all six planned endpoints), `limits.ts`
(`MATCH_VIDEO_MAX_BYTES = 7_999_999_999`, `COVERAGE_TOLERANCE_SECONDS = 0.1`), and
`alignment.ts` (`summarizeSourceTiming` orders by point_number; `planAlignment` computes
offset = anchor source time − confirmed video time and validates coverage). New
`tests/match-video-alignment.spec.ts`, 34 cases. Required coverage end is a max over every
known point start, positive point end and shot time — a first implementation derived it
from the final point alone and accepted a file that cut off mid-rally; the failing case is
kept as a test.

**follow-ups:**

1. T3's SQL timing helper must reproduce `requiredSourceEndSeconds` as that same max over
   all known bounds, not just the final point's end; the parity fixtures should include the
   out-of-range-shot case.
2. `formatConfirmedVideoTime` is exported for T18's hh:mm:ss.sss field. If a sub-hour
   display is wanted, change it there rather than adding a second formatter.
3. T5/T6's probe should map a bounded-read overrun to `media_probe_budget` and a network
   timeout to `storage_unavailable`; the split is encoded in `types.ts` but unused so far.
4. Two judgment calls worth a second look: a numeric confirmed time is rounded to
   milliseconds while a string with a fourth fractional digit is refused rather than
   silently rounded; and a zero point duration counts as "unknown end" except on the final
   point, where it still refuses.
