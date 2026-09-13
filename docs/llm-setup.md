# LLM Setup Guide

This guide explains how to connect a real LLM to the Advantage Intelligence chat tab.

---

## 1. Choose a Provider

| Provider | SDK | Key env var | Model used |
|----------|-----|-------------|------------|
| **Anthropic** | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-opus-4-6` |
| **OpenAI** | `openai` | `OPENAI_API_KEY` | `gpt-4o` |

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

1. Open any match page and click the **Analysis** tab.
2. Type a question in the chat input.
3. The assistant's response should stream in token-by-token.

If you see:

> ⚠️ No LLM provider is configured…

…then either `LLM_PROVIDER` is not set or the corresponding key is missing. Double-check `.env.local` and restart the dev server.

---

## 6. How to Switch Providers

1. Change `LLM_PROVIDER` in `.env.local` to `anthropic` or `openai`.
2. Make sure the corresponding `*_API_KEY` is present.
3. Restart the dev server.

No code changes are needed — the adapter at `src/lib/llm/adapter.ts` handles the switch.

---

## 7. Rough Cost Estimates

Each chat message sends the full match context (~500 tokens) + conversation history + the user's question, and receives ~300 tokens.

| Provider | Input | Output | ~Cost per message |
|----------|-------|--------|-------------------|
| Claude Opus 4.6 | $15 / 1M tokens | $75 / 1M tokens | ~$0.03 |
| GPT-4o | $5 / 1M tokens | $15 / 1M tokens | ~$0.008 |

Prices are approximate and subject to change. Check the provider's pricing page for current rates.

---

## 8. Dev Without a Key (Mock Mode)

If neither `LLM_PROVIDER` nor an API key is set, the adapter automatically uses a mock stream. The chat UI remains fully functional — responses will display the "no provider configured" notice rather than real analysis.

This means the UI can be developed and tested without any credentials.

---

## 9. Optional: Rate Limiting

The `/api/chat` route does not include rate limiting. For production, consider:

- **Upstash Ratelimit** with `@upstash/ratelimit` + Redis — limits per user/IP
- **Vercel Edge Middleware** — token-bucket or sliding-window limiting

The auth guard already ensures only authenticated users can hit the endpoint.
