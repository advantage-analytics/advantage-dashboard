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

## 9. Limits and rate limiting

- **Ask** reserves one of the user's monthly questions before any model call
  (`ask_reserve_question()`, 20 a month, unlimited for platform admins) and
  releases it when the answer fails, so a failure never costs a question.
- **The insight routes** have no rate limiting beyond authentication. If that
  changes, Upstash Ratelimit or a token bucket in `src/proxy.ts` are the usual
  places.
