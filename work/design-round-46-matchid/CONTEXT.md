# Workspace: design-round-46-matchid

- **Feature**: Implement Claude Design round 46 ("Match Details Final") under the
  `dashboard/matches/[matchId]` route — 1:1 layout copy, wired to real data where
  possible, uncertain items copied as-is and flagged.
- **Branch**: claude/design-round-46-matchid-d97cbd (scaffolded in its worktree)
- **Scaffolded**: 2026-09-01

Rules and invariants: see `.claude/pipeline/CONTEXT.md`. One stage per
`/feature-next design-round-46-matchid` invocation; the human edits `output/`
between runs.
