import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

// Initialize Supabase admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Paddle Node SDK for signature verification
const paddle = new Paddle(process.env.PADDLE_API_KEY || "", {
  environment: Environment.sandbox,
});

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("paddle-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // Verify webhook authenticity
    const secretKey = process.env.PADDLE_WEBHOOK_SECRET_KEY;
    const event = paddle.webhooks.unmarshal(rawBody, secretKey, signature);

    const eventType = event?.eventType;
    const data = event?.data;

    // Extract the Supabase User UID from custom_data
    const userId = data?.customData?.userId;

    if (!userId) {
      return NextResponse.json({ message: "No userId in customData, ignored" }, { status: 200 });
    }

    // Handle Subscription Events
    if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.activated"
    ) {
      const subscriptionId = data.id;
      const status = data.status; // 'active', 'trialing', 'past_due', etc.
      const priceId = data.items?.[0]?.price?.id || null;

      const { error: dbError } = await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        subscription_id: subscriptionId,
        status: status,
        price_id: priceId,
        updated_at: new Date().toISOString(),
      });

      if (dbError) {
        console.error("Supabase Upsert Error:", dbError.message);
        return NextResponse.json({ error: dbError.message, details: dbError }, { status: 500 });
      }
    }

    // Handle Subscription Cancellation
    if (eventType === "subscription.canceled") {
      const { error: dbError } = await supabaseAdmin.from("subscriptions").update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      if (dbError) {
        console.error("Supabase Update Error:", dbError.message);
        return NextResponse.json({ error: dbError.message, details: dbError }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Paddle Webhook Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
