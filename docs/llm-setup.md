# LLM Setup Guide

How to connect a real model to the features that call one through the adapter
at `src/lib/llm/adapter.ts`:

- the Focus card's claim line on personal Home (`/api/home-insight`) and Team
  Home (`/api/team-insight`);
- **Ask** (`/api/ask`, `/dashboard/ask`, `/dashboard/team/ask`): the model
  writes the SQL for a question and then the prose over the rows it returned,
  two calls on the common path and up to five with retries
  (`src/lib/services/ask/ask.ts`).

Match-report insights are **not** this adapter: they come from the
`generate-insights` edge function with its own `GEMINI_KEY` (see `AGENTS.md`).

---

## 1. Choose a provider

| `LLM_PROVIDER` | SDK                 | Key env var         | Model                   |
| -------------- | ------------------- | ------------------- | ----------------------- |
| `anthropic`    | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-opus-4-6`       |
| `openai`       | `openai`            | `OPENAI_API_KEY`    | `gemini-3.5-flash-lite` |

`openai` is a misnomer kept for compatibility: the branch drives the OpenAI
SDK against **Gemini's OpenAI-compatible endpoint**
(`generativelanguage.googleapis.com/v1beta/openai/`), so `OPENAI_API_KEY`
holds a **Google AI Studio key**, not an OpenAI one. **Production runs this
branch.** Both SDKs are already dependencies and are imported on demand, so
nothing needs installing.

---

## 2. Get an API key

- **Gemini** (the `openai` branch): https://aistudio.google.com/apikey.
  Gemini 2.5 models are closed to new Google Cloud projects, which is why the
  adapter names a 3.5 model.
- **Anthropic**: https://console.anthropic.com → API Keys → Create key.

---

## 3. Configure `.env.local`

```env
# Select provider: "anthropic" or "openai" (Gemini through the OpenAI SDK)
LLM_PROVIDER=openai

# Google AI Studio key (if using "openai")
OPENAI_API_KEY=AIza...

# Anthropic key (if using "anthropic")
# ANTHROPIC_API_KEY=sk-ant-...
```

`.env.local` is git-ignored. Never commit API keys. `.env.example` documents
every variable.

---

## 4. Run locally and verify

```bash
npm run dev
```

1. Sign in and open **Home** (or **Team Home** from a team workspace). With
   recorded matches, the Focus card's claim line streams in as one sentence.
2. Open **Ask** and ask a question about your matches. The status line walks
   through "Planning the query", "Reading your matches", "Writing the answer".

If the Focus card shows "⚠️ No LLM provider is configured…", or Ask answers
from its fixed mock query, either `LLM_PROVIDER` is unset or its key is
missing. Check `.env.local` and restart the dev server.

A player or program with no recorded matches gets no claim line (the route
answers 204) and Ask shows its day-zero state. That is the product refusing to
invent a judgement, not a misconfiguration.

---

## 5. Switch providers

Change `LLM_PROVIDER`, make sure the matching key is present, restart. No code
changes: `isLLMConfigured()` and `getLLMStream()` in the adapter branch on the
same two conditions, and `tests/ask-prompt.spec.ts` holds them together.

---

## 6. Rough costs

What one call sends, measured 2026-10-14 (`docs/ask-improvement-roadmap.md`):

| Call           | Input         | Output      |
| -------------- | ------------- | ----------- |
| Insight claim  | a few hundred | under 50    |
| Ask plan (SQL) | ~9,000 tokens | ~300 tokens |
| Ask answer     | ~4,500 tokens | ~400 tokens |

List prices per million tokens on that date:

| Model                   | Input | Output | ≈ per Ask question | ≈ per insight |
| ----------------------- | ----- | ------ | ------------------ | ------------- |
| `gemini-3.5-flash-lite` | $0.30 | $2.50  | $0.006             | under $0.001  |
| `claude-opus-4-6`       | $5    | $25    | $0.09              | $0.003        |

Prices change; the roadmap's §1.1 compares the current alternatives. The
actual spend is in PostHog (§7).

---

## 7. Telemetry

Every real call is one `$ai_generation` event in PostHog's LLM analytics,
sent through the `@posthog/ai` wrappers (`posthogPrivacyMode: true`, so no
prompt or reply text leaves the server; only model, tokens, cost and latency).
What the adapter adds so the events can be read:

- **`$ai_span_name`** names the call: `home.insight`, `team.insight`,
  `ask.plan`, `ask.pattern`, `ask.answer`. Pass it as `getLLMStream()`'s
  `options.span`.
- **One trace per request.** `createLLMObservabilityContext()` is created
  once per request and shared by every call in it, so an Ask question's plan,
  pattern and answer calls (and retries) sit under one `$ai_trace_id`.
- **What a call asks for** travels in `getLLMStream()`'s options too:
  `temperature`, `maxTokens`, a `jsonSchema` the reply must hold to
  (`response_format` on the Gemini path, a forced tool on the Anthropic one),
  a `staticPrefixLength` marking the fixed part of the system prompt for the
  Anthropic prompt cache, and the request's `signal` so a closed tab aborts
  the provider call. Ask's plan step uses all of them; its prompts put the
  fixed text first so the prefix is cacheable (`prompts.ts`).
- **Tokens and cost on the Gemini path** come from the stream's final usage
  chunk, which Gemini sends only when asked (the request's
  `stream_options.include_usage`). Before 2026-10-15 every event from this
  path recorded zero tokens and zero cost.

Nothing is sent when the PostHog server config is absent.

---

## 8. Dev without a key (mock mode)

With no provider or key set, `getLLMStream()` yields a fixed warning sentence
and the Focus card shows it in place of a claim. Ask cannot parse that as a
query, so it branches on `isLLMConfigured()` and runs a fixed `scope_sql` /
`sql` pair with a fixed answer template instead (`src/lib/services/ask/mock.ts`).
The query still runs against the real `ask` views, so mock mode exercises
everything but the model. Mock questions do not count against the monthly
limit.

---

## 9. Evaluation

`scripts/ask-eval.ts` grades each question against an optional `expect`
block (error code, planner shape A–D, visual kind, no-advice notice,
call/query/time ceilings, regexes over the answer and the final query —
`scripts/lib/ask-eval-grade.ts`), prints PASS/FAIL per question and a
`## Score` section, and `--grade` exits 1 on any failure.
`.github/workflows/ask-eval.yml` runs the season list that way nightly once
the repository variable `ASK_EVAL_ENABLED` is `"true"` and the seven secrets
it names are set; until then it is off, because it needs a service-role key
and spends real model calls.

---

## 10. Limits and rate limiting

- **Ask** reserves one of the user's monthly questions before any model call
  (`ask_reserve_question()`, 20 a month, unlimited for platform admins) and
  releases it when the answer fails, so a failure never costs a question.
- **The insight routes** have no rate limiting beyond authentication. If that
  changes, Upstash Ratelimit or a token bucket in `src/proxy.ts` are the usual
  places.

---

## 11. Ask: examples from rated answers (embeddings)

Roadmap 1.6. Beside its fixed worked examples, the plan prompt is shown the
three stored (question → planner reply) pairs nearest to the question being
asked (`src/lib/services/ask/examples.ts`; the section "Similar questions and
how they were planned" in the prompt's dynamic tail, so the cached prefix is
untouched — the measurement is in `prompts.ts`).

- **Embeddings** come from the same Gemini OpenAI-compatible endpoint as the
  chat calls (`src/lib/llm/embeddings.ts`: `gemini-embedding-001`, 768
  dimensions, unit length). There is no new variable: `LLM_PROVIDER=openai`
  and `OPENAI_API_KEY` are what it needs. On the Anthropic path or in mock
  mode no embedding is made and the prompt keeps its fixed examples; a
  failed embedding is the same, never a failed question. Embeddings are not
  recorded in LLM analytics.
- **The store** is `public.ask_examples` (migration
  `20261015094614_ask_examples.sql`, pgvector 0.8.2, an HNSW cosine index).
  RLS on, no policy, no grant: it is reached only through its functions.
  `ask_similar_examples` and `ask_example_upsert` are service_role-only; the
  route calls the first with the session user pinned as `p_viewer` — a
  fourth service-role call beside `database.ts`'s three, made in the route
  before the orchestrator, for the reason `examples.ts` gives.
- **Who sees what.** A row with no owner is shared: the prompts' worked
  examples and the eval lists' pairs, whose names are placeholders
  (`anonymiseAskExample`). A thumbs-up is stored under the rater's id and is
  retrieved for that account alone, so a question naming somebody's opponent
  never reaches another account's prompt.
- **A thumbs-up is learnt as it happens**: `POST /api/ask/feedback` reads the
  pair back (`ask_feedback_pair`), embeds the question and writes it
  (`ask_example_from_feedback`) after the 204, as the user, best effort. A
  thumb taken back or turned down removes the example (a trigger).
- **Seeding and backfill:**

  ```bash
  npx tsx scripts/ask-examples-seed.ts --from-static --from-eval --from-feedback
  npx tsx scripts/ask-examples-seed.ts --from-static --dry-run   # print, write nothing
  ```

  `--from-static` writes the prompts' worked examples (always safe);
  `--from-eval` the eval lists' known-good pairs (a question-level `plan`
  object, or a review question); `--from-feedback` every thumbs-up stored
  before the route learnt them. Needs `SUPABASE_SERVICE_ROLE_KEY` besides the
  two above. Re-running updates rows in place.

## 12. Ask: thread memory as a state object

Roadmap 4.5. Every planner reply carries `state` — four short strings:
`scope`, `measure`, `period`, `subject` — saying what the conversation is
about once the question is answered (`src/lib/services/ask/thread-state.ts`,
the `state` field of `ASK_PLAN_REPLY_SCHEMA`). It is saved inside the
answer's jsonb and read back for the next turn, whose plan prompt shows it
ahead of the raw turns; with a state present the turns shrink from six of
600 characters to the last two of 240. The answer prompt is given the
previous answer's headline so a follow-up reads as one. Conversations saved
before this carry no state and are prompted as before.

## 13. Ask: coach mode (`ASK_COACH_MODE`)

Roadmap 4.3, a product decision not yet taken, so the flag is **off** and
production leaves it unset. Set `ASK_COACH_MODE=1` (or `true`, `on`) and a
TEAM question from the program's **owner or coach** that asks for advice is
answered by the prompt variant that may recommend what to work on
(`src/lib/services/ask/coach.ts`, `ASK_COACH_RULE` in `prompts.ts`): at most
two recommendations, each tied to a cited figure cell — the renderer still
substitutes every number and the model still never types one — and the
`notice` event is `coach` instead of `no_advice`. The role comes from the
server's own workspace read in the route, never from the request. Players
on the roster, staff, personal questions and the flag off are unchanged. A
coached answer is never cached (the cache is keyed by question, tags and
scope, and would replay a recommendation to a player of the same program),
and is saved with `noAdvice: false` and `coach: true`.
