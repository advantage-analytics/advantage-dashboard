import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { STRIPE_CONFIG } from "@/lib/stripe/config";
import { PRO_ROLE } from "@/lib/user/roles";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if the user has already purchased Pro
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userError) {
      return NextResponse.json(
        { error: "Failed to fetch user data", details: userError.message },
        { status: 500 }
      );
    }

    if (userData?.role === PRO_ROLE) {
      return NextResponse.json(
        { error: "You already have the Pro plan" },
        { status: 400 }
      );
    }

    const baseUrl =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

    // Create the Stripe Checkout Session (one-time payment)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: STRIPE_CONFIG.PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "payment",
      billing_address_collection: "required",
      customer_email: user.email,
      custom_text: {
        submit: {
          message:
            "Thank you for upgrading to Pro! You'll get unlimited access to all features.",
        },
      },
      success_url: `${baseUrl}/dashboard/settings/subscription?success=true`,
      cancel_url: `${baseUrl}/dashboard/settings/subscription?canceled=true`,
      invoice_creation: {
        enabled: true,
      },
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        upgrade_type: "pro",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session", details: message },
      { status: 500 }
    );
  }
}
