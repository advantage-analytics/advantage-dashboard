# Advantage Analytics

Advantage Analytics turns raw SwingVision match data into actionable performance analytics. Players upload `.xlsx` exports and get statistical breakdowns, court visualizations, shot-by-shot analysis, and AI-powered match commentary.

Built with Next.js (App Router), Supabase, and Tailwind CSS.

## Getting Started

Install dependencies, then start the dev server:

```bash
npm install
npm run dev
```

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

See `CLAUDE.md` for optional LLM provider variables.

## Where to go next

- [`MAP.md`](MAP.md) — where things are in this codebase (route table, source layout).
- [`CLAUDE.md`](CLAUDE.md) — how to work here (architecture, conventions, commands).
- [`docs/README.md`](docs/README.md) — index of deeper docs (pipeline, onboarding, LLM setup).
