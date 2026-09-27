# LLM Setup Guide

This guide explains how to connect a real LLM to the dashboard's AI-generated insight
claims: the Focus card's headline sentence on personal Home (`/api/home-insight`) and
Team Home (`/api/team-insight`).

---

## 1. Choose a Provider

| Provider      | SDK                 | Key env var         | Model used        |
| ------------- | ------------------- | ------------------- | ----------------- |
| **Anthropic** | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-opus-4-6` |
| **OpenAI**    | `openai`            | `OPENAI_API_KEY`    | `gpt-4o`          |

Pick one and follow the steps below.

---

## 2. Install the SDK

Run **one** of:

```bash
# Anthropic
npm install @anthropic-ai/sdk

# OpenAI
npm install openai
```

---

## 3. Get an API Key

- **Anthropic**: https://console.anthropic.com → API Keys → Create key
- **OpenAI**: https://platform.openai.com/api-keys → Create new secret key

---

## 4. Configure `.env.local`

Add these lines to `.env.local` in the project root (create it if it doesn't exist):

```env
# Select provider: "anthropic" or "openai"
LLM_PROVIDER=anthropic

# Anthropic key (if using Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI key (if using OpenAI)
# OPENAI_API_KEY=sk-...
```

> `.env.local` is git-ignored. Never commit API keys.

---

## 5. Run Locally and Verify

```bash
npm run dev
```

1. Sign in and open the dashboard **Home** page (or **Team Home**, from a team
   workspace).
2. If you (or the program) have recorded matches, the Focus card's claim line
   should stream in as one short sentence, generated from recent performance.

If you see:

> ⚠️ No LLM provider is configured…

…then either `LLM_PROVIDER` is not set or the corresponding key is missing —
double-check `.env.local` and restart the dev server.

A player or program with no recorded matches gets no claim line at all — the
route answers with an empty 204, regardless of provider configuration. That's
the route refusing to invent a judgement, not a misconfiguration.

---

## 6. How to Switch Providers

1. Change `LLM_PROVIDER` in `.env.local` to `anthropic` or `openai`.
2. Make sure the corresponding `*_API_KEY` is present.
3. Restart the dev server.

No code changes are needed — the adapter at `src/lib/llm/adapter.ts` handles the switch.

---

## 7. Rough Cost Estimates

Each insight request sends a compact summary of recent performance (a few hundred
tokens of prompt) and receives one short sentence back (well under 50 tokens).

| Provider        | Input           | Output          | ~Cost per insight |
| --------------- | --------------- | --------------- | ----------------- |
| Claude Opus 4.6 | $15 / 1M tokens | $75 / 1M tokens | ~$0.01            |
| GPT-4o          | $5 / 1M tokens  | $15 / 1M tokens | ~$0.003           |

Prices are approximate and subject to change. Check the provider's pricing page for current rates.

---

## 8. Dev Without a Key (Mock Mode)

If neither `LLM_PROVIDER` nor an API key is set, the adapter automatically uses a mock stream. The Focus card remains fully functional — it displays a "no provider configured" notice in place of a real claim.

This means the UI can be developed and tested without any credentials.

---

## 9. Optional: Rate Limiting

Neither `/api/home-insight` nor `/api/team-insight` includes rate limiting. For production, consider:

- **Upstash Ratelimit** with `@upstash/ratelimit` + Redis — limits per user/IP
- **Vercel Edge Middleware** — token-bucket or sliding-window limiting

The auth guard already ensures only authenticated (and, for the team route, workspace-scoped) users can hit either endpoint.
