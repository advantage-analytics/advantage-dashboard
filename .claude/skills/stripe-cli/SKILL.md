---
name: stripe-cli
description: Inspect Stripe payments and test the webhook using the `stripe` CLI. Use when a Pro upgrade did not apply, when checking whether a checkout session completed, or when changing /api/webhooks/stripe. Replaces the stripe MCP and adds local webhook forwarding, which the MCP cannot do.
---

# Stripe — one-time Pro upgrade

This repo's Stripe surface is small and worth stating exactly:

|          |                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------ |
| Product  | **Pro**, a **one-time payment** (`mode: "payment"`), not a subscription                          |
| Checkout | `src/app/api/create-checkout-session/route.ts`, price `STRIPE_CONFIG.PRO_PRICE_ID`               |
| Webhook  | `src/app/api/webhooks/stripe/route.ts` — handles exactly one event, `checkout.session.completed` |
| Env      | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                     |

Because it is `mode: "payment"`, there is **no subscription object**. Do not go
looking for one, and do not reason about `customer.subscription.*` events — a
Pro user is someone whose one-time session completed and whose `users.plan` the
webhook then set. `users_plan_check` limits that column to `free|pro`.

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

# Terminal 2 — fire the one event this app handles.
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

**A payment succeeded but the plan never flipped** — the usual cause is the
webhook, not the charge. Look at delivery attempts:

```bash
stripe events list --limit 20 --type checkout.session.completed
stripe events retrieve "$EVENT_ID"
```

Then confirm the database side; the webhook writes `users.plan`, so a delivered
event with an unchanged row means the handler failed, not Stripe.

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
