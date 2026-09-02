# Review — full-name-title-case

**Sign-off: approved** — by the human, 2026-09-02, after the R1b fix and a `ready` receipt at `4817ad3`.

Range reviewed: `fd13c75...HEAD` (`branch-range`, base `splitstep-integration`).

**This gate ran twice.** The first run found a real, user-visible bug and
recorded `4f21fc4` as **not-ready** rather than softening it. The human said fix
it; the fix turned out to need two passes, and the second run of the gate over
the clean tree recorded `4817ad3` as **ready**. Everything below is kept in the
order it happened — the blocked finding, its first fix, and what the re-run found
wrong with that fix — because the sequence is the part worth reading.

## Success criteria, from the brief

| # | Criterion | Result |
|---|---|---|
| 1 | `/claim/[programKey]` headline shows the owner's full name in title case, whatever the stored casing | **Met.** SQL composes the full name (`btrim(coalesce(first,'') \|\| ' ' \|\| coalesce(last,''))`, verified on live), `toResult` title-cases it. |
| 2 | The same person reads identically on the status page, `/request`, `/object`, the search dropdown and the join page | **Met.** All five read through `toResult` or `displayName`; both abbreviations are gone from live, confirmed by query. |
| 3 | `clajerson gimena` / `CLAJERSON GIMENA` → `Clajerson Gimena`; `McCarthy` stays `McCarthy` | **Met**, pinned in `tests/person-name-display.spec.ts`. **But see the open finding** — the rule that protects `McCarthy` cannot protect a two-letter surname. |
| 4 | The footer reads "Notifies <Full Name>." with the doubled period gone | **Met**, as a consequence: the string no longer ends in an abbreviation's period. |
| 5 | Missing-name and not-allowed-to-name states unchanged — no placeholder, no `undefined`, no stray punctuation | **Met.** `\|\| null` survives at both choke points; verified `[null, null].join(" ")` → `""` → `null`, so every "Someone" / "Nobody was notified" branch still fires. |
| 6 | Nothing outside the claim/join flow changes | **Met as amended.** The one exception is the `displayName` spillover the human approved at stage 02 — `/onboarding`, `/invitations/[inviteId]`, `invite-offer.tsx`, and the activity tray inherit corrected casing. The guardrails reviewer traced it and found the activity tray does not even render the field. |

## Gate results

Both runs. Where they differ, the second is given after an arrow.

| Stage | Result |
|---|---|
| lint · tsc · test · build | Pass, both runs. 315 → **316** tests (313 before the branch). |
| `simplify` | 4 fixes applied → **3 more** on the re-run, including the incomplete-fix finding. |
| `vercel-react-best-practices` | **Skipped — surface not touched.** The range contains zero `.tsx` files, so none of its three triggers (a `"use client"` added, a new component file, a data-fetching change) fires. |
| `code-review medium` | 1 finding — the open one below. |
| `rls-boundary-reviewer` | Clean. Ran over the whole range, not reported as covered-per-task: seven pipeline and amendment commits in the range never faced the per-task gate, so this ran fail-closed. |
| `pipeline-guardrails-reviewer` | Clean, and ran for the same fail-closed reason even though no dashboard path is touched. Its verdict: the range does not engage the guardrails at all — no wizard input, no attribution path. |
| `supabase:supabase-postgres-best-practices` | No findings. Reasoning below. |

## The finding that blocked sign-off — FIXED in `1a52db6`

> Recorded after the fact, on the human's instruction to fix it. The first fix
> is below; **it was incomplete, and the second gate run caught that** — see
> "What the re-run found" further down.

**`src/lib/data/person-name.ts:159` — R1b uppercases short real surnames.**

The roman-numeral rule fires on any token built only from `i`/`v`/`x`, however it
was typed. R1 cannot protect a two-letter token, because R1 requires an uppercase
letter *after* the first character and `Xi` has none. Verified against the
shipped implementation:

```
Xi -> XI     Vi -> VI     Ivi -> IVI
Vivi -> VIVI Ix -> IX     Iv -> IV
```

So an owner surnamed **Xi** — not a hypothetical surname — gets
"Wei XI manages Advantage here" on a page anonymous visitors can reach, and
"Notifies Wei XI." below it. The doc comment discloses this trade-off for `Vivi`
and `Ivi` only; `Xi` and `Vi` are not named, and `Xi` is far more common than
either.

**Fix, verified, preserving the stage-04 decision exactly.** Apply R1b only to a
uniformly-cased token — a generational suffix is typed `III` or `iii`, while a
name is typed `Xi`, `Vi`, `Vivi`, never uniform:

```ts
const uniform = token === token.toUpperCase() || token === token.toLowerCase();
if (uniform && ROMAN_NUMERAL_TOKEN.test(token)) return token.toUpperCase();
```

Checked by running both variants: `III`→`III`, `iii`→`III`, `ii`→`II`,
`xii`→`XII` all still hold, **all 15 cases pinned by the spec still pass**, and
every name above is left as typed.

This was left rather than applied because the roman-numeral rule was the human's
explicit choice at stage 04, in answer to a direct question. The narrowing serves
that choice more precisely rather than reversing it — but it was still their
call, and they made it: **fix it.**

### How it was fixed — `1a52db6`

`titleCasedToken` now gates R1b behind a new `isUniformlyCased` predicate, so
the rule fires only on a token that is all-upper or all-lower. `III` and `iii`
are unaffected; `Xi`, `Vi`, `Ivi`, `Vivi`, `Ix` and `Iv` fall through to R2 and
survive as typed. The R1b doc paragraph now states the uniform-casing half and
why it exists.

A new spec case, `a surname spelled from the same letters is NOT a suffix`, pins
all six surnames as identity plus `Wei Xi`. Suite 315 → 316; lint, `tsc` and
`npm run build` all green after the change.

**The residue, pinned rather than papered over.** A uniformly cased token still
carries nothing that separates the two readings, so a name typed in ONE CASE
THROUGHOUT still reads as a suffix: `titleCaseName('wei xi')` returns
`'Wei XI'`. The spec asserts exactly that, and the doc's "Known and accepted"
paragraph was rewritten to describe this narrower residue instead of the old
`Vivi`/`Ivi` claim, which is no longer true. Typed the ordinary way — one
capital, the rest lower — the name is safe, and that is the case that occurs.

## What the re-run found — the first fix was incomplete, `4817ad3`

Re-running the gate on the fixed code is the reason to re-run it at all, and it
paid for itself. `simplify`'s altitude agent found that **the fix closed the bug
in one token position only.** R1b was gated on casing but not on where the token
sat, so an i/v/x name anywhere but last still went through it:

```
xi wei      -> XI Wei
vivi chen   -> VIVI Chen
VIVI CHEN   -> VIVI Chen
```

That is the same shouted-name bug, in the other slot — and `xi` as a given name
in Chinese order is exactly what a collegiate roster will see. A generational
suffix is terminal, so the second fix gates on that as well. Verified against
every case the spec pins: no churn, and all three above come back correct.

With position carrying half the rule, the case-uniformity half folded into the
regex it was correcting — `/^(?:[ivx]{2,}|[IVX]{2,})$/` rather than an `/i` flag
plus a helper narrowing it back — which `simplify`'s reuse and simplification
agents both flagged independently. R1b is one rule and now reads as one.

**Two doc statements were wrong, not merely thin, and both were corrected:**

- The residue paragraph claimed all-caps entry "was already going to be re-cased
  by some rule or other". It is not: R1b intercepts first, so `WEI XI` keeps its
  shouted surname where `CLAJERSON GIMENA` — the case R2 exists for — is re-cased
  normally. The spec now pins both directions.
- The spec's R1 identity loop contained `'III'` under a comment asserting every
  member holds an uppercase after its first character *and a lowercase*. `III`
  has no lowercase and never reaches R1. Moved to the R1b test, which gained
  coverage rather than losing it.

**One low finding from `code-review`, closed by documenting it.** The position
gate has a price: a suffix with anything after it is no longer terminal, so
`sam reid iii jr` renders `Sam Reid Iii Jr`. The trade is right — a shouted given
name is commoner and worse — but it is a real edge, and the R1b doc now names it
so the next reader recognises a boundary rather than a bug.

## Findings fixed during the review

From `simplify`, four applied and re-gated green:

1. **`invite-acceptance.ts`** — `displayName` hand-rolled per-part `?? ""`,
   `.trim()`, `filter(Boolean)`, `join`, then called `titleCaseName`, which trims
   and collapses again. Now `titleCaseName([first, last].join(" ")) || null`.
   This leans on `Array.join` coercing `null` to `""`, which is subtle enough to
   be worth a comment, so it has one — and all four null shapes were verified by
   execution, not by reading.
2. **`person-name.ts`** — `.filter((token) => token.length > 0)` was a verified
   no-op after `.trim()`; removed.
3. **`person-name.ts`** — the doc claimed to be "the one definition of how a name
   is spelled on screen" and cited rosters, but no roster surface calls it. The
   claim is now narrowed to what is actually wired, and names what is not: the
   roster still renders `display_name` as typed, and the invite email still
   prints the inviter's name raw.
4. **`person-name.ts`** — added a comment recording that `titleCasedSegment`'s
   last line is `capitalize()` from `@/lib/utils` spelled out deliberately,
   because that module pulls in `clsx` and `tailwind-merge` and this one is a
   pure data module with no imports.

## Consciously left

- **The invite email prints the inviter's name raw while the join page it links
  to prints it cased.** `team-actions.ts:209` passes `viewer.name` from
  `toViewer`, which does not case. A coach stored as `ELENA`/`VASQUEZ` sends mail
  whose subject reads "ELENA VASQUEZ invited you to…" and whose landing page
  reads "Elena Vasquez invited you to…". This is a seam the branch *created*, and
  it is the most user-visible thing left. It is left because the brief names
  email templates and dashboard settings as explicit non-goals, and
  `team-actions.ts` is a dashboard surface — branch-scope discipline says it gets
  its own branch. **Worth queueing next.**
- **`contact-owner-form.tsx:45`** still documents the old abbreviation. Left for
  the same reason; it is the file whose protection caused T2's block.
- **`displayName` would be the better shared primitive than `titleCaseName`** —
  it composes *and* cases, so it is correct by construction — but it lives in a
  claim/join service module, and `pending-invites-server.ts` already reaches up
  into it from the data layer. Moving it is a refactor across importers, outside
  this range. Roughly nine other places in the tree compose a name by hand and
  two of them case it.
- **The SQL `case when u.id is null then null else btrim(...) end` could be
  `nullif(btrim(...), '')`.** Left: the migration is already applied to live, so
  editing it in place would create drift, and a second migration for a
  behaviourally identical expression is not worth the churn.
- **Widening `titleCaseName` to accept `string | null`** would drop the `?? ""`
  at both call sites. Left: T1 and T2 both pinned the current signature and call
  expression, and the spec asserts against it.
- **Two anon-client constructions** duplicate what `fixtures/live-db.ts` should
  export as `createAnonClient()`. Left: consolidating all three copies touches
  `pending-invites.spec.ts` and `createLogin`, outside this range; a fourth
  half-adopted pattern would be worse than the duplication.
- **Test redundancies** — the spec's fixed-point loop repeats three R1 inputs,
  and the live spec's `not.toContain('.')` is implied by the exact `toBe`. Both
  deliberate: the redundancy documents which regression is being fenced, and T4's
  criteria required the `.` assertion by name.

## Verified directly rather than accepted on report

The `rls-boundary-reviewer` subagent had no Supabase MCP access and asked the
parent to confirm the live definitions rather than infer them from the migration
folder. Done: both functions on live carry the full-name expression, neither
retains any `left(u.*_name, 1)` abbreviation, and `search_programs` still has
**two** `org_type = 'college'` filters — one per query branch. (A first count
said one; that was an arithmetic error in my own query's divisor, not a missing
filter.)

## Also consulted

Beyond the declared inputs (`../05_build/output/build.md`, the range diff,
`../01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- `src/lib/data/person-name.ts`, `src/lib/services/programs/invite-acceptance.ts`,
  `src/lib/data/programs-server.ts` — to apply the quality fixes and verify the
  finding
- `.claude/hooks/pr-check-receipt.sh` — to record the verdict
- `references/security-privileges.md` and `references/security-rls-performance.md`
  from the `supabase-postgres-best-practices` skill
- Live database via Supabase MCP — both function definitions, the `org_type`
  filter count
