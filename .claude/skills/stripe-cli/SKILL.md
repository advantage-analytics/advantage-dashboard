---
name: stripe-cli
description: Inspect Stripe payments and test the webhook using the `stripe` CLI. Use when bought credit hours did not appear, when checking whether a checkout session completed, or when changing /api/webhooks/stripe. Replaces the stripe MCP and adds local webhook forwarding, which the MCP cannot do.
---

# Stripe — credit packs

This repo's Stripe surface is small and worth stating exactly:

|          |                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product  | **Credit packs** — "Advantage Intelligence — 1 video hour" ($14) and "— 5 video hours" ($60), **one-time** (`mode: "payment"`), Stripe Tax on, sales final   |
| Checkout | `POST /api/create-checkout-session {kind:"credits", pack}` → **Embedded** Checkout (`ui_mode: "embedded"`, `redirect_on_completion: "never"`)                |
| Fulfil   | `fulfilCreditCheckout()` in `src/lib/services/credits/checkout.ts`, called by the webhook and by `/api/credits/confirm`; one `video_credits` row per session |
| Webhook  | `src/app/api/webhooks/stripe/route.ts` — `checkout.session.completed` and `async_payment_succeeded`, branching on `metadata.kind === "credits"`              |
| Env      | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, optional `STRIPE_PRICE_CREDITS_1H` / `_5H`                               |

There is **no subscription object** in stage 1 — do not reason about
`customer.subscription.*`. A purchase is a `video_credits` row keyed by
`stripe_checkout_session`; the retired $4.99 Lifetime Pro is why one legacy
account has `users.plan = 'pro'`, and nothing sets it any more.

## Auth

```bash
stripe login          # once per machine; opens a browser
stripe config --list  # confirm which account is active
```

Never pass `--api-key` on the command line — it lands in shell history and the
transcript. `STRIPE_SECRET_KEY` lives in `.env.local`, which
`.claude/hooks/guard-secrets.sh` denies reading on purpose.

**Check you are on test mode before anything that writes.** A live-mode
`trigger` creates real records.

## The thing the MCP could not do: local webhook forwarding

This is the main reason to prefer the CLI. To work on the webhook handler:

```bash
# Terminal 1 — forwards live Stripe events to the local route and prints the
# signing secret to use as STRIPE_WEBHOOK_SECRET for this session.
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Terminal 2 — a triggered session has no credits metadata, so the webhook
# acknowledges it and inserts nothing. To test fulfilment, buy a pack through
# the app with a test card (4242 4242 4242 4242) instead.
stripe trigger checkout.session.completed
```

Signature verification fails unless `STRIPE_WEBHOOK_SECRET` matches the secret
`stripe listen` prints — it is a per-session value, not the dashboard's.

## Recipes

**Did this user's payment go through**

```bash
stripe checkout sessions list --limit 10
stripe checkout sessions retrieve "$SESSION_ID"
```

**A payment succeeded but no hours appeared** — the usual cause is the
webhook, not the charge (and `/api/credits/confirm` should have recorded it
anyway). Look at delivery attempts:

```bash
stripe events list --limit 20 --type checkout.session.completed
stripe events retrieve "$EVENT_ID"
```

Then confirm the database side: `video_credits` where `stripe_checkout_session`
is the session id. A delivered event with no row means the handler failed.

**Recent payments**

```bash
stripe payment_intents list --limit 10
stripe charges list --limit 10
```

**Tail activity while reproducing something**

```bash
stripe logs tail
```

## Cautions

- Never run a command that moves money, issues a refund, or mutates a live
  customer. Read and test-mode operations only; hand anything else to the user.
- `stripe trigger` writes real test-mode objects. Harmless in test, never in live.
- Plan gating is deliberately unenforced today and a new tier structure is
  planned — do not "fix" the absence of gating as if it were a bug.
