# Stage 02 — Design

## Inputs
- working: `../01_brief/output/brief.md` (as the human left it)
- reference: `MAP.md` (code directory — read before searching for files)
- reference, only when the brief touches dashboard UI:
  `docs/ui-revamp-guardrails.md` and `.skills/advantage-analytics-design/SKILL.md`
- `references/` — anything the human dropped there

## Process
Propose 2–3 approaches with trade-offs and a recommendation, then write the
full design for the recommended one: architecture, components, data flow,
error handling, testing. Follow existing repo patterns. Trace the route
before naming any page component (the trace-route skill); verify schema
against the live database, not `supabase/migrations/`. Verifying a specific
file beyond the declared inputs is fine — list every such file under "Also
consulted". Resolve the brief's open questions or carry them forward
explicitly. YAGNI ruthlessly.

## Outputs
- `output/design.md` — sections: Approaches considered · Chosen design
  (architecture, components, data flow, error handling, testing) ·
  Open questions · Also consulted
