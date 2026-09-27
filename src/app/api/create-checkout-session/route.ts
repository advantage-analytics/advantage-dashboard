import { NextResponse } from "next/server";

/**
 * Retired 2026-09-25: nothing is sold during the beta.
 *
 * This started the $4.99 one-time Pro checkout, whose promise of "unlimited
 * uploads" no video allowance can honour. Settings › Plan no longer calls it;
 * it answers 410 so an old tab or a hand-made request cannot still buy it.
 * `/api/webhooks/stripe` stays, for receipts and any checkout already open.
 * Paid plans are designed for January 2027 and will start their own session.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Advantage is free during the beta, so there is nothing to buy right now.",
    },
    { status: 410 },
  );
}
