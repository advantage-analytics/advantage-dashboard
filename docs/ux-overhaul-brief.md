# Advantage Analytics — UX Overhaul Brief

**Date:** 2026-08-06 · **Branch audited:** `splitstep-integration` · **Author:** UX audit (Claude Code) for handoff to Claude Design
**Read alongside:** `DESIGN.md`, `.skills/advantage-analytics-design/SKILL.md`, `docs/r2-and-webhook-overview.md`, `docs/splitstep-integration-spec.md` (`PRODUCT.md` and `DATABASE_PRD.md`, cited when this was written, are since deleted — product context is folded into `DESIGN.md`; schema comes from the live database via the Supabase MCP)

---

> ## ⚠ Status: point-in-time (2026-08-06). Still the best statement of WHAT to build; its current-state audit has aged.
>
> This is a snapshot, not a living doc. The product thesis, personas, IA, flows,
> sequencing and open decisions all stand. **§2's audit of what exists does not.**
> Corrections, as of 2026-08-15 — full detail in
> [`ui-revamp-guardrails.md`](ui-revamp-guardrails.md) §6:
>
> **The video pipeline is built and proven.** §2.4 says the flow "dead-ends after
> Confirm" with "no bytes upload"; §8 lists Phase 1 as unbuilt; §10 warns "nothing
> has round-tripped yet." All obsolete — a real 86-minute match went
> browser → Azure → vendor → signed webhook → results JSON + trimmed video, and
> the source was reclaimed. Read the guardrails doc before designing the F2
> lifecycle.
>
> **R2 and the Cloudflare Worker are retired.** Source video is Azure Blob with an
> account-key SAS. This matters to design, not just plumbing: §1 and §5 F2 build
> the waiting experience on `vendor_first_downloaded_at` from the Worker's
> download log as the "processing started" signal. **That signal no longer
> exists.** F2's status model needs a Processing state that does not depend on it
> — the vendor's `GET /jobs/{job_id}` is the candidate, currently unwired.
>
> **Four §2.2 bugs are fixed:** the `getMatchAnalysis` mock (#1) now reads real
> `processing_jobs`; CLAUDE.md and the dead breadcrumb code (#3) are corrected;
> ⌘U and the "modal" wording (#5) are fixed. The role collision (#2) is **half**
> fixed — the migration is applied, the code is on branch `plan-role-split`.
>
> **Also now true:** a completed job rests at "Stats pending" until Phase 2
> derivation is ungated, exactly as §5 F2 step 8 anticipated — that state is real
> today, not hypothetical. `match-video-panel.tsx` and `use-video-upload.ts`
> (Appendix A → Film Room) are currently unreachable dead code; reuse them
> deliberately or delete them, but do not assume they work.
>
> **Open and unresolved: D1 (visual language).** §0 lists the design language
> under "Fixed (do not redesign)" and D1 recommends keeping it. A newer design
> system exists outside this repo and has not been reconciled with `DESIGN.md` or
> the design SKILL.md. **Until it is, treat §0's "Fixed" as provisional** — it
> reflects the state on 2026-08-06, not a decision that survived.

---

## 0. How to use this document

This is an **information-architecture and flow brief**, not a visual spec. It tells the designer what the product must do, for whom, on which pages, in which states — and which questions are still open.

**Fixed (do not redesign):**
- The design language. `DESIGN.md` and the design SKILL.md define a closed, deliberate system — "The Pro Training Room": Inter only, light mode only, Signal Blue `#3B82F6` as the single accent, outcome-only green/red, hairline hierarchy, eyebrow+rule section pattern, no gamification. This is brand equity, not a default. The overhaul is structural, not tonal. (If the founder wants to revisit the visual language, that is decision **D1** — until answered, tokens stand.)
- The provider name. The video-analysis product is **"Advantage Intelligence"** in every user-visible string. The vendor (SplitStep) is never named. Pilot terms: free through 2026-12-31, capped at 2 processing-hours/month per individual and 75/month per collegiate program. Caps are enforced in code and must be visible in UX.

**Open (founder must answer before high-fidelity design):** the decisions table in §9. Every recommendation below marked *(rec)* is a recommendation with a default, not a settled fact.

---

## 1. Product thesis and hard constraints

**Thesis for the overhaul:** move from "a viewer for SwingVision exports" to **the analysis room** — upload anything (video or data file), get a trustworthy story at three depths (glance → numbers → film), track it over time, and scale the same experience from one player to a college program with coaches.

**Stated product goal (founder):** insights and analyses easily digestible and easy to understand, while still showing complex stats you wouldn't see watching a match in person.

**Constraints that shape the UX — none of these are negotiable by design:**

| Constraint | UX consequence |
|---|---|
| Vendor processes video **asynchronously with no ETA, no status polling, no processing-started webhook** (they fetch lazily; our Cloudflare Worker's download log is the only "started" signal) | The waiting experience is a first-class design problem. No turnaround promises anywhere. Notification on completion is mandatory, not optional. |
| Derivation engine (video → points/shots/stats) is **hard-gated on vendor answers** (`docs/r2-and-webhook-overview.md` §11) | A match can exist in "video processed, analysis pending" for an extended period. That state must feel intentional, and the video itself must be watchable in it. |
| `derivation_confidence` (`high`/`medium`/`low`) is computed by reconciling derived scores against the user-entered final score | Low-confidence stats must be visibly flagged as estimates, with a path to correct the score and re-run. Trust is the product; never present uncertain numbers as fact. |
| Advantage Intelligence is **singles only, ≥1080p, ≥30fps** | Rejection happens at file-pick, before any bytes move. Doubles teams still need the SwingVision import path — position accordingly. |
| Quotas: 2h/mo individual, 75h/mo program | Quota meters at submit time and in settings; program quota is a shared budget coaches must be able to see and steward. |
| Collegiate program accounts are **needed before September onboarding** (spec §3.1) but no `programs` table exists yet | Team features are the next structural layer, not a someday. Sequencing in §8 is anchored on this. |
| Vercel Hobby, public repo, Stripe wired ($4.99 one-time Pro) | Entitlement UX exists today and must survive the overhaul (see the role-collision bug, §2.2). |
| Dashboard is **blocked below 768px** (`MobileGate`) | Decision D2. College players and courtside coaches are phone-first; the current gate contradicts the team ambition. |

---

## 2. Current-state audit

Code-grounded: every claim below was verified by reading the route files and components on this branch (authenticated pages were not driven in a live browser — no test credentials; nothing here required it).

### 2.1 Strong foundations (keep and build on)

- **The design system.** Fully documented, token-complete, consistently applied on the surfaces that exist. Rare asset for a redesign — the designer can spend 100% of effort on structure.
- **Match detail page** (`src/app/dashboard/matches/[matchId]/page.tsx`) was already consolidated to a single canonical page (commit `752f12e`): hero → summary → KPI row → two-column body (performance chart, statistics card, serve placement | AI insight, radar, key moments), with six scroll anchors. Right general shape; missing an anchor-nav rail and the deeper altitudes (§5 F3).
- **Upload wizard as a page** (`/dashboard/matches/new`), provider-strategy pattern, branching step order (`import: provider→match→confirm`; `processing: provider→video→match→confirm`), local video probe/trim, draft persistence. Phase 3a of the Advantage Intelligence flow is genuinely built.
- **Backend spine for Advantage Intelligence**: `processing_jobs` state machine, quota ledger (`processing_usage`), forensic webhook log, results bucket, R2/Worker design. The UX work rides on real infrastructure.
- **Command palette (⌘K)**, unsaved-changes guard, keyboard-navigable sidebar and menus, error states with escalating retry → support. Accessibility instincts are already good.
- **Stripe + subscription page** wired end to end.

### 2.2 Broken or misleading (fix regardless of redesign)

1. **`getMatchAnalysis` is a mock** (`src/lib/data/match-analysis.ts` — header says "MOCK. Nothing here reads Supabase."). Every SplitStep-provider match has a 3-in-5 chance of rendering a **fabricated** in-progress screen (fake filenames, fake percentages) or a fake failure ("Camera moved at 00:41:18") instead of its real state. This will burn the first real pilot user. Must read `processing_jobs` before any Advantage Intelligence launch.
2. **`users.role` carries three incompatible vocabularies.** The profile form writes `player|coach|parent|academy`; the paywall and Stripe webhook read/write `founder` (`PRO_ROLE`, `src/app/dashboard/settings/subscription/page.tsx`); `DATABASE_PRD.md` (since deleted) documented "free/premium". `saveProfile()` (`src/components/dashboard/settings/actions.ts`) unconditionally overwrites the column — **saving your profile silently deletes your Pro entitlement.** Persona and entitlement must become separate columns before any team-role work begins.
3. **CLAUDE.md describes a deleted app.** Match sub-routes (`insights/`, `performance/`, `statistics/`, `video/`, `visuals/`), the ToC sidebar, and the matches gallery/list toggle no longer exist. Breadcrumb code for the sub-routes survives, unreachable (`header.tsx`). Any agent or designer reading repo docs will design against ghosts.
4. **Auth protection is uneven and there is no root `middleware.ts`.** `updateSession()` exists but is never imported. `/dashboard/matches` renders (empty) to anonymous users; `matches/[matchId]`, `matches/new`, `settings/*`, `help` have no server guard at all. Also documented in `docs/r2-and-webhook-overview.md` §14 (webhook reachability depends on this staying conscious, not accidental).
5. **⌘U is documented as global but only works where `CreateMatchButton` mounts**; the help center still calls the upload flow a "modal."
6. **Statistics nav item leads to a coming-soon card** while a complete implementation sits unwired (§2.3). Shipping nav to a placeholder erodes exactly the trust the brand promises.
7. **`matches.private` is forced `true` by a beta gate** (`PATCH /api/matches/[matchId]`) with no UI toggle — sharing exists in schema only.

### 2.3 The orphan shelf — built, unwired, and central to the founder's asks

This is the audit's biggest finding: **most of what the founder wants a redesign to add already exists as orphaned code.** The overhaul is less "build new" than "give homes to what's built."

| Orphan (no route/caller today) | Maps to |
|---|---|
| Full statistics page: `statistics-page-content.tsx` + `MatchSelector`, `PeriodToggle`, `RollingFormStrip`, `StatProgressionChart`, `OpponentLedger`, `SurfaceDna`, `EfficiencyMatrix`, + server/client data layer (`statistics-server.ts` / `statistics-client.ts`, `stat-configs.ts` with 24 stats) | **Trends** (§6) — the "trends over multiple matches" ask |
| `/api/chat` — streaming, auth-guarded, provider-abstracted, `MatchContext` prompt builder | **Ask (chatbot)** (§5 F5) — zero UI callers today |
| Video review subsystem: `match-video-panel.tsx`, `match-video-sidebar.tsx`, `video-filter-bar.tsx`, `use-video-auto-advance.ts` | **Film Room** altitude of the match report — indispensable once video is the source |
| `court-visualization.tsx` (~730 lines, serve/return modes, filters) + `visuals/configs/` | Match report court section / Film Room |
| `analysis-sidebar.tsx` (320px rail with status + stat rows) | Basis for the match report's anchor nav rail |
| `KpiTile` `href` support (unused), `ui/tabs.tsx` and other unused primitives | Deep-linking KPIs; report altitude tabs |

### 2.4 IA problems in one paragraph

Navigation is three destinations (Home, Matches, Statistics→placeholder) plus Settings/Help. There is no surface for AI beyond two dismissible insight cards; no processing/job visibility outside a fragile session toast (deliberately disabled for video uploads because it would spin forever); no team dimension; no customization beyond a localStorage KPI picker on Home; and the product's most differentiating flow (video → analysis) currently dead-ends after Confirm — a `processing_jobs` row is created and **no bytes upload** ("Storage is not wired yet," `useUploadMatchWizard.ts`). The redesign must give the app a spine that these features slot into rather than accrete onto.

---

## 3. Personas and jobs

`users.role` options already collected at onboarding: Player / Coach / Parent / Academy — the product asks, then ignores the answer. The redesign should honor it.

**P1 — Competitive individual** (current core; club/tournament/junior). *Jobs:* upload a match with minimum friction; in 30 seconds know what decided it; before practice, know the one pattern to drill; watch the moments that mattered; see whether last month's work moved a number.
**P2 — College player** (team member). Everything P1 wants, plus: see what the coach flagged; compare against own baseline; personal uploads under their own quota vs team matches under the program's.
**P3 — Coach / program staff** (new, September-anchored). *Jobs:* get the roster analyzed without doing 12 uploads themself; Monday morning, see the weekend's dual-match results across all courts; open one player and speak to specifics; compare two players for a lineup spot; steward 75 shared hours; set what the team's dashboards emphasize.
**P4 — Parent/Academy** (defer; design nothing bespoke, but don't paint them out — a parent is a read-only viewer of a junior's data in a later phase).

---

## 4. Recommended information architecture

### 4.1 Sitemap

**Personal workspace** (every account):

```
/dashboard                    Home — "today" view
/dashboard/matches            Match library (+ processing states inline)
/dashboard/matches/new        Upload wizard (existing, extended)
/dashboard/matches/[id]       Match Report — single canonical page, 3 altitudes
/dashboard/trends             Trends (renamed from Statistics; wire the orphaned page)
/dashboard/ask                Ask — chat with your data (new; wires /api/chat)
/dashboard/settings/…         profile · account · subscription · preferences (new: analysis presets, notifications)
/dashboard/help               Help (existing; glossary becomes a system-wide service, §7.1)
```

**Team workspace** (members of a program; hidden otherwise):

```
/team                         Team Home — roster snapshot, recent team matches, quota meter
/team/roster                  Roster → /team/roster/[playerId] (coach view of a player)
/team/matches                 All matches across the roster (dual-match grouping)
/team/compare                 Side-by-side players (phase 3+)
/team/settings                Members & invites, roles, quota policy, team default analysis view
```

*(rec)* One shell, one sidebar, a **workspace switcher** at the top of the sidebar (Personal ⇄ program name) — the Linear/Vercel pattern. A coach's "personal" workspace is simply their own matches. This is decision **D3**.

### 4.2 Navigation spec

- **Sidebar (personal):** Home · Matches · Trends · Ask · — · Settings · Help. Five destinations, one new (Ask), one renamed (Trends). Add **New match** as a persistent primary action in the sidebar header area so ⌘U can be truly global and the empty-page dead zones disappear.
- **Sidebar (team):** Team Home · Roster · Matches · Compare · — · Team Settings.
- **Header:** breadcrumbs (extend to settings sub-pages; delete the dead sub-route branch) · ⌘K search · **Jobs tray** (new, §7.3) · profile menu.
- **Match report in-page nav:** resurrect `analysis-sidebar.tsx` as a sticky anchor rail over the existing six anchors; grows with the new sections. On <1280px it collapses into a top chip row.

### 4.3 Roles, permissions, and account model *(rec — schema sketch for D4/D5)*

- `programs` (id, name, school, created_by) · `program_members` (program_id, user_id, role: `coach | assistant | player`, status: invited/active) · invite by email with pending state.
- Matches gain `program_id nullable`. Uploaded in team context → visible to program coaches + the player; counts against program quota. Personal uploads → private, individual quota, **opt-in shareable to the program per match** (finally giving `matches.private` its UI). Default posture is decision **D5**.
- Entitlement: new `plan` column (`free | pro`) sourced from Stripe; `users.role` reverts to persona only; program membership is entitlement-like for team features. Fixes §2.2 #2 structurally.
- Quota resolution: submitting in team context reserves against the program ledger (`processing_usage.account_type = 'program'`), else individual — the config module already anticipates exactly this (`getMonthlyCapSeconds`).

---

## 5. Key flows

### F1 — First run (role-aware)
Sign-up already collects role. Branch the empty state: **Player** → current "See where your game stands" + provider choice framed as *Record & analyze (Advantage Intelligence)* vs *Import from SwingVision*; **Coach** → "Set up your program": name program → invite roster → first upload. Zero-data dashboards never show empty chart grids — they show the two paths to first data. (Empty states exist today and are good; they need the team branch.)

### F2 — Advantage Intelligence upload and the wait (the flagship flow)

The wizard's front half exists. The redesign owns the **entire lifecycle**:

1. **Pick & validate** — instant local rejection (resolution/fps/duration/container, singles-only notice) *before any bytes move*. Requirement chips exist; add plain-language failure reasons ("This video is 720p — Advantage Intelligence needs 1080p. Phone settings → Camera → Record at 1080p/30 or higher.").
2. **Upload runs in background while the user trims and fills metadata** (spec §6 — concurrency is designed; storage wiring is the missing plumbing). Show a persistent upload meter inside the wizard; **warn on tab-close while uploading** (browser→R2 multipart does not survive the tab).
3. **Trim guidance:** the window must cover complete games consistent with the entered score — say so at the trim step, not in a tooltip after failure.
4. **Confirm** — shows quota impact: "This match uses 1h 12m of your 2h monthly analysis time. 0h 48m remains."
5. **Submitted** → route to the Match Report in its **processing state**, not to a toast. The match exists immediately in the library with a status chip.
6. **Status model** (map 1:1 to `processing_jobs`, replacing the mock): Uploading (%) → Uploaded → Queued ("in line — we'll notify you when analysis starts") → Processing (triggered by `vendor_first_downloaded_at` — the Worker gives us this) → Analyzing (`deriving`) → **Ready** | Failed (generic message + support path; never surface raw vendor error text) | stalled >72h → "taking longer than expected" + auto-alert to founder.
7. **Notify on completion** — in-app (jobs tray) **and email** (§7.3). No ETA promises anywhere; show queue position or nothing (spec mandate).
8. **"Processed, analysis pending"** (real state while Phase 2 is vendor-gated): video is playable in the Film Room, scoreline and metadata shown, stats section says analysis is being finalized. Designed, not apologized for.
9. **Confidence surfacing:** `high` → nothing; `medium` → one quiet line on the report ("Derived stats reconciled with your score within one game"); `low` → banner: stats are estimates + **Review score** action → edit score → re-run derivation (re-runnable by design, spec §4.5).

### F3 — Match review at three altitudes (the digestibility thesis)

One page, progressive disclosure, anchor rail. **Altitude 1 — The Story** (30 seconds): hero + score + three AI takeaways written as *claim → evidence → so-what* ("You won 78% of first-serve points but landed only 54% of first serves — the serve, not the rally, decided the 2nd set"), each deep-linking to its evidence below; momentum strip (performance tracker exists). **Altitude 2 — The Numbers** (5 minutes): KPI row → statistics card (Serve/Return/Other, exists) → serve placement & court visuals (resurrect `court-visualization.tsx`) → radar. **Altitude 3 — The Film Room** (deep work): point-by-point log filterable (break points, aces, errors, rallies >8) with **video seek per point** (`video_time`; resurrect the video subsystem). SwingVision matches without video keep the point log; video column simply absent. Custom modules per §7.2.

### F4 — Trends
Wire the orphaned page at `/dashboard/trends`. Existing: match selector, period toggle, rolling form, progression chart, opponent ledger, surface DNA. Add: per-stat drill-down (tap a stat anywhere → its history), date-range presets (season/semester), and win-correlation framing ("You're 9–1 when 1st-serve % ≥ 60"). Later: annotations ("changed serve grip") and UTR-context via `utr_id` + `scripts/user_matches.py`.

### F5 — Ask (chatbot)
Wire `/api/chat` to a UI three ways: **contextual** ("Ask about this match" on the report — `MatchContext` is already the API's input shape; start here), **global** panel from the sidebar/⌘J with conversation history, and **chat-to-widget** later (an answered question can be pinned as a card — the bridge between chat and customization). Grounding rules: only answer from the user's data; every number cited links to the stat row or filtered film-room view that proves it; "I don't have that" beats invention. Persona: the pro-room analyst — terse, specific, no cheerleading (brand: no hand-holding).

### F6 — Coach's Monday (team)
Team Home shows: weekend's matches grouped by dual/event across the roster, each with result + confidence/processing state; quota meter (used/remaining of 75h, per-player breakdown); roster strip with per-player form indicators. Open a player → their profile (coach view = the player's Home/Trends, read-only + coach annotations later). Compare (phase 3+): two players, same stat set, side by side.

### F7 — Team creation & invites
Coach creates program (name/school) → invites by email → invitee lands in personal onboarding with a pending "Join {program}" card → accept → workspace switcher appears. Players see exactly what the program can see of their data at accept time (one screen, plain language — D5 made legible).

---

## 6. Page-by-page requirements (condensed)

| Page | Purpose | Must contain | States to design |
|---|---|---|---|
| Home | Today, at a glance | Greeting; active-jobs strip (only when jobs exist); latest match story card (Altitude-1 condensed); configurable KPI strip (exists — make tiles link, `href` is already supported); recent matches; AI insight; heatmap/activity | empty (role-branched), populated, jobs-active |
| Matches | Library | List (recently redesigned — keep); status chips for processing matches driven by `processing_jobs`; one Filter button w/ count (established pattern) | empty, populated, mixed processing |
| New match | Ingest | Existing wizard + F2 lifecycle; quota preview; tab-close guard | per-step blockers; quota-exceeded; validation failures |
| Match Report | The product | Three altitudes + anchor rail + confidence banner + customization | processing (per-status), pending-analysis, low-confidence, complete, failed |
| Trends | Progress over time | Orphaned page, wired + drill-downs | empty (<2 matches: show what will appear), populated |
| Ask | Analyst on demand | Chat panel + history; contextual entries from report/trends | first-use (suggested questions from real data), streaming, error |
| Settings | Control | Existing 3 + **Preferences** (play-style preset, default report layout, notifications) + **Team** (if member) | — |
| Team Home / Roster / Matches / Compare / Team Settings | Program ops | Per F6/F7; quota stewardship; invites | empty roster, pending invites, quota-warning |

Every stat label everywhere gets a hover/tap definition from the existing help glossary (already written, `help/page.tsx`) — density with on-demand explanation is how "complex but digestible" resolves without dumbing down.

---

## 7. Cross-cutting systems

**7.1 Digestibility.** The three-altitude pattern (F3) is the page-level expression. System-wide: insights follow *claim → evidence-link → so-what*; numbers a player compares are `tabular-nums` (already law); benchmarks are always relative ("vs your 3-month average" — deltas exist in `InsightStatChip`) before absolute; glossary-on-hover everywhere; low confidence always labeled.

**7.2 Customization ("edit what is shown").** *(rec)* Bound it to **module-level** customization, not a query builder: a central **stat/module library** (extend `stat-configs.ts`) where every module is registerable; **play-style presets** as entry point (Serve & Volleyer, Baseliner, Counterpuncher, All-Court — a serve-and-volleyer's preset pins net points won, volley W/L, first-volley errors, approach outcomes; volley data exists in `shots.shot_type` and SplitStep's `stroke_type: volley`); then free pin/hide/reorder on Report and Trends ("Edit view"). Persist **server-side** (new preference storage — the localStorage KPI picker doesn't survive devices, and coaches need to set a **team default layout** players inherit and may override). Chat-to-widget (F5) is the escape hatch for stats the library lacks.

**7.3 Processing & notifications.** A global **jobs tray** in the header (badge with active count; each job: match, status, % where known) replaces the fragile session-toast; the toast remains only as an ephemeral surface driven by the same store (Supabase Realtime on `processing_jobs`, not `sessionStorage`). **Email on completion and failure** is required by the no-ETA constraint (Supabase SMTP is already configured for auth mail). Digest-style, not per-status spam.

**7.4 Monetization surfaces.** Fix entitlement (§4.3) first. Then the natural upgrade moments: quota meter at submit, "priority processing" tier later (the `priority` column exists but **no tier UI ships** until the vendor confirms a priority parameter — spec Q6), program licensing as its own track. Pricing architecture is decision **D7**.

**7.5 Accessibility & responsive.** WCAG 2.1 AA already stated in `DESIGN.md`'s accessibility section — keep. The open question is the **mobile posture (D2)**: *(rec)* replace the hard `MobileGate` with responsive read-first mobile (Home, Matches, Report altitudes 1–2, jobs status, Ask) while keeping upload/trim desktop-recommended. A courtside coach on a phone is a core team scenario; a hard 768px wall contradicts §3.

---

## 8. Sequencing (anchored on the September college deadline)

- **Phase 0 — Hygiene (now, days):** replace the `match-analysis.ts` mock with `processing_jobs` reads · split persona/entitlement · root `middleware.ts` · wire the orphaned Trends page (rename nav) · update CLAUDE.md · make ⌘U global.
- **Phase 1 — Advantage Intelligence GA for individuals:** R2 browser upload + `/api/splitstep/jobs` (spec'd, unbuilt) · F2 lifecycle UI + jobs tray + email notify · "processed, analysis pending" report state. (Derivation itself stays vendor-gated; the UX ships without it.)
- **Phase 2 — College minimum (before September):** programs/members/invites schema · workspace switcher · Team Home + Roster + team matches · shared quota stewardship · D5 privacy posture implemented.
- **Phase 3 — Depth:** Film Room + court viz resurrection into the report · Ask v1 (contextual per-match) · presets + Edit view · confidence UX polish (needs derivation live).
- **Phase 4 — Differentiators:** Compare · chat-to-widget · benchmarks/UTR context · annotations · opponent scouting.

---

## 9. Open decisions — founder input required before high-fidelity design

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Visual language | keep Pro Training Room tokens / evolve | **Keep.** It's distinctive, documented, and on-brand; the overhaul is structural. |
| D2 | Mobile | responsive read-first / keep desktop gate / native later | **Responsive read-first**; upload stays desktop-recommended. |
| D3 | Team nav | workspace switcher, one shell / separate coach app | **Workspace switcher.** |
| D4 | Roles v1 | coach·assistant·player / coach·player only | **Coach·player only** for September; assistant is additive. |
| D5 | Team data ownership | program-owned by default / player-owned, share per match / context-dependent (rec) | **Context-dependent:** team-context uploads visible to program; personal uploads private with per-match share. |
| D6 | Naming | "Trends" vs "Statistics"; chat name ("Ask"?); does "Advantage Intelligence" brand the engine only or all AI (chat + insights)? | **Trends; Ask; Advantage Intelligence = the analysis engine**, chat is "Ask" powered by it. |
| D7 | Pricing architecture | $4.99 lifetime Pro (current) vs subscription vs program licensing tiers | No rec — business call, but it gates quota/priority/seat UI, so decide before Phase 2 design. |
| D8 | Doubles positioning | Hide AI for doubles matches quietly vs explicit "singles only, import doubles via SwingVision" messaging | **Explicit** — college tennis is 3 doubles courts every dual; silence will read as a bug. |

---

## 10. Assessment of the redesign brief itself

**The request is coherent and well-founded.** The stated goal (digestible + deep) resolves cleanly into progressive disclosure; the SplitStep partnership genuinely changes what the product is (source of truth becomes your own video, not another app's export); the serve-and-volleyer example is exactly the right way to brief customization. And much of the wishlist already exists in code, unwired — the overhaul is largely an act of giving built things a coherent home.

**What the brief is missing (add these before handing to Claude Design):**
1. **Persona priority.** Individual-first or college-first? The September deadline and the 75h/mo program pilot say college-first; the current app says individual-first. This ordering changes Home, onboarding, and pricing design. (My sequencing assumes: individual AI GA first because it's nearly plumbed, college layer immediately after — but that's inferred, not stated.)
2. **Mobile posture** — unstated, currently a hard gate, and load-bearing for the coach persona (D2).
3. **Privacy/data-ownership stance for teams** (D5) — this is a product-values question a designer shouldn't decide.
4. **Notifications** — unmentioned, but the async no-ETA pipeline makes them mandatory.
5. **Pricing/entitlement model** (D7) — quota meters, priority tiers, and seats are all UI; they need the business model first.
6. **Bound the customization ask** — "edit what is shown" should be module-level with presets (§7.2), not a free-form query builder, or scope will balloon.
7. **Unclaimed opportunities worth naming:** opponent scouting (the obvious college JTBD nobody listed), doubles reality (D8), season/recruiting exports for coaches, and parent-viewer access.
8. **Success metrics.** Pick 2–3 (e.g., time-to-first-insight after upload; % of matches reviewed within 48h; coach weekly active during season) so the redesign can be judged.

**Risks to carry into design:** vendor unknowns (payload shape, retry behavior, webhook auth — nothing has round-tripped yet, handoff §9); the derivation gate means stats-from-video timing is not ours to promise; quota economics if the pilot converts to paid; the repo is public (never let design mocks embed real athlete video URLs or keys).

---

## Appendix A — Reuse inventory (orphan → destination)

`statistics-page-content.tsx` + 12 siblings + data layer → **/dashboard/trends** · `/api/chat` → **Ask** · `match-video-panel/-sidebar`, `video-filter-bar`, `use-video-auto-advance` → **Film Room** · `court-visualization.tsx` + configs → **Report court section** · `analysis-sidebar.tsx` → **Report anchor rail** · `KpiTile.href` → linked KPIs · `ui/tabs.tsx` → altitude/section chrome · `featured-match-card.tsx` → Home latest-match story card candidate · `matches.private` → per-match share toggle (D5).

## Appendix B — Method

Audited on branch `splitstep-integration` (2026-08-06): every route file under `src/app`, the sidebar/header/navigation components, the full wizard subtree, provider registry, SplitStep services/webhook/migrations, settings pages, home widgets, and both SplitStep docs; findings cross-checked against git history (`752f12e`, `a36aa06`, `50f77b9`). Authenticated UI was not exercised in a live browser session (no credentials available to the audit; conclusions are structural, which code fully determines).
