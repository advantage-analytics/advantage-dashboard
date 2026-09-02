# Brief seed — match-details-47f

Captured verbatim from the `/feature-new` invocation (2026-09-02). Edit freely —
stage 01 refines this into the brief. Run `/feature-next match-details-47f`
to start the pipeline.

> Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via
> /design-login) to import this project:
> https://claude.ai/design/p/afde9116-328b-445c-aeff-8b3c2a702d6f?file=Match+Details+Final.dc.html
>
> Focus on these files (the whole project is readable):
> - `Match Details Final.dc.html`
>
> Also read these files the selection imports:
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/_ds_bundle.js`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/base.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/colors.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/effects.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/fonts.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/spacing.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/typography.css`
> - `assets/logo-mark.svg`
> - `assets/tennis-court-icon.svg`
> - `assets/tournament-icon.svg`
> - `support.js`
>
> Implement: `Match Details Final.dc.html` 47f
>
> /featture-new make sure the designs are exact and hookup to the db what is
> tangible, for the rest leave as flags/comments for future implementation

## Scaffold-time findings (session notes — not the human's words)

Checked on 2026-09-02 while scaffolding. Stage 01 should re-verify these, not
trust them.

1. **Round 46 of this artboard already shipped.** Frames 46a–46d plus the 47a
   Shots-header were built 1:1 by the retired `work/design-round-46-matchid/`
   pipeline (T1–T7, gate, review, sign-off) and merged to
   `splitstep-integration` at `32bb5bd`. The live page is
   `src/app/dashboard/matches/[matchId]/page.tsx` → `MatchDetailShell` /
   `MatchRail` / `StatisticsTab` / `shots/shots-tab` / `film/film-tab` under
   `src/components/dashboard/matches/match-detail/`. Its presented-copy flags
   are in `docs/match-detail-v46-flags.md` (open rows: #2 analysis link,
   #3 add-video CTA, #7 court maximize, #9 `"0-0"` score coercion). **This
   feature is the delta frame 47f introduces on top of that — not a rebuild.**
2. **47f is newer than anything in the repo.** The artboard copy round 46 was
   built from (extracted 2026-09-01) contains frames 46a–d and 47a–d only —
   no 47e or 47f. The live artboard must be re-read. Baseline copy for
   diffing what changed:
   `git show 0eec94e:work/design-round-46-matchid/02_design/references/match-details-final.dc.html`
3. **DesignSync was not authorized in the scaffolding session** (non-interactive;
   `/design-login` needs an interactive terminal on this machine), so 47f could
   not be read here. Unblock before stage 02: run `/design-login` once from an
   interactive `claude` session, then `get_file` the artboard into
   `02_design/references/` so build stages read it from disk.
4. The worktree had been cut from `main` (586 commits behind); it was reset to
   `splitstep-integration` (475f940), `npm ci` run, and `.env.local` symlinked
   before scaffolding.
