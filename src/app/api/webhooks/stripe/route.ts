import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { upgradeUserToPro, PRO_ROLE } from "@/lib/user/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!webhookSecret) {
  throw new Error(
    "STRIPE_WEBHOOK_SECRET is not defined in environment variables"
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.metadata?.user_id || session.client_reference_id;

    if (!userId) {
      console.error("No user ID found in session", {
        metadata: session.metadata,
        client_reference_id: session.client_reference_id,
      });
      return NextResponse.json({ error: "No user ID" }, { status: 400 });
    }

    // Update the user's role using the admin client (bypasses RLS)
    const supabase = createAdminClient();

    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (fetchError || !existingUser) {
      console.error("User not found in database:", {
        userId,
        error: fetchError,
      });
      return NextResponse.json(
        { error: "User not found", details: fetchError?.message },
        { status: 404 }
      );
    }

    if (existingUser.role === PRO_ROLE) {
      console.log(`User ${userId} already has Pro, skipping update`);
      return NextResponse.json({ received: true, message: "Already Pro" });
    }

    const result = await upgradeUserToPro(userId);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to update user role", details: result.error },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
