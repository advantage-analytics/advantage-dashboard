# Advantage Analytics

Advantage Analytics turns raw match data into actionable performance analytics. Players upload match **video** (processed by a third-party vendor) or **SwingVision `.xlsx`** exports and get statistical breakdowns, court visualizations, shot-by-shot analysis, and AI-powered match commentary.

Built with Next.js (App Router), Supabase, and Tailwind CSS.

## Getting Started

Install dependencies, then start the dev server:

```bash
npm install
npm run dev
```

`npm install` is the only setup step. Its `prepare` script points git at this
repo's hooks (`.githooks/`) and at `.git-blame-ignore-revs`, so formatting and
commit checks work the same whether you use Claude Code, Codex, Gemini, an IDE,
or plain `git`.

Open [http://localhost:3000](http://localhost:3000) to see the result.

Build for production:

```bash
npm run build
```

### Environment variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`.env.example` is the source of truth — it documents every variable, which are
optional, and what leaving one unset actually does.

## Checks

| Command             | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `npm run format`    | Prettier, writing in place. `format:check` is what CI runs                      |
| `npm run lint`      | ESLint (flat config)                                                            |
| `npm run typecheck` | `tsc --noEmit`                                                                  |
| `npm test`          | Playwright. Specs needing the live database skip themselves without credentials |

Run automatically:

- **pre-commit** — refuses staged secrets, formats staged files, regenerates
  `MAP.md` when routes change
- **pre-push** — typecheck, format check, lint
- **CI** (`.github/workflows/ci.yml`) — all four, on every PR. No secrets needed

Both git hooks can be bypassed with `--no-verify`; CI cannot. `git commit`
inside a Claude Code agent worktree does not run them either — the harness pins
`core.hooksPath` there — which is why CI is the real gate.

### Optional tooling

Neither is required; the things that use them degrade silently when absent.

```bash
brew install shfmt        # formats shell scripts (10 files)
az login                  # for the azure-storage skill
stripe login              # for the stripe-cli skill
```

`skills-lock.json` is **not** part of setup. It is one maintainer's optional
design-review skills, restorable with `npx skills experimental_install`. The
skills it names are gitignored, so a clone does not get them and nothing in this
repo — no script, no CI step — reads the file. Ignore it unless you specifically
want that tooling. (`designpass`, `layout` and `shape` are installed locally but
absent from the lock; add them with `npx skills add` if the lock should restore
them too.)

## Where to go next

- [`AGENTS.md`](AGENTS.md) — **how to work here** (architecture, conventions, commands).
  The single source for every coding agent; `CLAUDE.md` and `GEMINI.md` both point at it.
- [`MAP.md`](MAP.md) — where things are in this codebase (route table, source layout). Generated: run `npm run map` after adding a route.
- [`docs/README.md`](docs/README.md) — index of deeper docs (pipeline, onboarding, LLM setup).
