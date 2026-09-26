---
name: widget-states
description: Audit and fix a dashboard widget's loading and empty states (Carbon loading pattern + the design system's empty-and-loading rules) before it is committed or pushed. Use whenever a widget/card/region under src/components/dashboard or src/app/dashboard is added or edited — the widget-states hooks invoke this automatically on edit and on git commit/push.
---

# Widget states gate

Every dashboard widget has **four** states, and an edit that touches one
usually breaks another nobody looked at. Before a widget change is committed
or pushed, walk this checklist for **every widget the diff touches** — and for
each widget whose props, data loader or Suspense region changed.

Sources of truth, in precedence order:

1. `.skills/advantage-analytics-design/reference/empty-and-loading.md`
   (read `SKILL.md` in that directory first — it carries the precedence rule)
2. [Carbon loading pattern](https://carbondesignsystem.com/patterns/loading-pattern/)
   and [Carbon empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/)

## 1. Find the widgets

```bash
git diff --name-only HEAD -- 'src/components/dashboard/**/*.tsx' 'src/app/dashboard/**/*.tsx'
```

For each file, use the `trace-route` skill to find the page(s) that render it
and the `region(label, fallback, content)` / `<Suspense>` that wraps it.
Several widgets share a name across routes (e.g. Advantage Intelligence is
`FocusCard` on Home and Team Home, `RailInsightCard` on match detail) —
check every caller.

## 2. Loading state (Carbon: skeleton for containers, never a blank)

- [ ] **No `null` Suspense fallback.** A `region("…", null, …)` makes the card
      pop in after its siblings and shifts layout. The fallback is a
      `*Pending` component in `src/components/dashboard/loading/`.
- [ ] **Skeleton mirrors the loaded layout**: same frame/chrome (real title,
      eyebrow, engine mark render immediately — Carbon: show what you already
      know), bars at the loaded content's positions and proportions.
- [ ] Tokens, not hex: `bg-[var(--surface-skeleton)]`, `motion-safe:animate-pulse`.
- [ ] Wrapper has `role="status"` + `aria-label="Loading <widget>"`; the bars
      are `aria-hidden="true"`.
- [ ] **Client-side streams settle.** Any skeleton driven by a fetch must stop
      on every exit path — success, error, **204/empty**, abort. A skeleton
      that never resolves is a false status message.
- [ ] No spinners inside cards (Carbon reserves the loading indicator for
      whole-page/blocking operations and inline actions).

## 3. Empty state (honest zero, never skeleton, never sample data)

- [ ] Every `return null` in the widget and its server wrapper is justified.
      "No data yet" is **not** a justification — render the card's own
      anatomy empty plus one line saying what arrives and when.
- [ ] Distinguish the causes: no matches at all (day zero) vs. matches but
      nothing analysed vs. analysing (progress, not empty) vs. not built
      (`ComingSoonPage`). Each gets its own copy.
- [ ] Unmeasured values render `—`, never `0` / `0%`.
- [ ] Day-zero previews hide destinations (`showStatisticsLink={false}` etc.)
      and dimmed shapes are `inert`/`aria-hidden`.
- [ ] No invented figures or sentences (see empty-and-loading.md → Sample data).

## 4. Error state

- [ ] The region sits inside `WidgetBoundary` (via `region()`), so a thrown
      loader shows the retry, not a blank.
- [ ] Client fetch errors render a one-line message; computed evidence still
      renders beside it.

## 5. Verify

- [ ] `npm run typecheck` and `npx eslint <files>`.
- [ ] Look at each state: the unauthenticated preview harness
      (see memory `reference_unauth_preview_harness`) with fixtures for
      loading (a never-resolving promise), empty and populated.
- [ ] Report per widget: `loading ✓/fixed`, `empty ✓/fixed`, `error ✓` — and
      list any `return null` you kept and why.

When done, record the check so the commit gate lets the commit through:

```bash
.claude/hooks/widget-states-gate.sh mark
```
