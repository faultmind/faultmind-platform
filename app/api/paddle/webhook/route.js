import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

// Initialize Supabase admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Paddle SDK for signature verification
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

    // 1. Verify webhook authenticity (This will throw an error if the signature is invalid)
    const secretKey = process.env.PADDLE_WEBHOOK_SECRET_KEY;
    paddle.webhooks.unmarshal(rawBody, secretKey, signature);

    // 2. Bypass SDK mapping: Extract data directly from the raw JSON
    const payload = JSON.parse(rawBody);
    const eventType = payload.event_type;
    const data = payload.data;

    // 3. Extract the Supabase User UID safely
    const userId = data?.custom_data?.userId;

    if (!userId) {
      return NextResponse.json({ message: "No userId in customData, ignored" }, { status: 200 });
    }

    // 4. Handle Subscription and Transaction Events
    if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.activated" ||
      eventType === "transaction.completed"
    ) {
      // Transactions map the ID as subscription_id, whereas Subscriptions use id
      const subscriptionId = data.subscription_id || data.id;
      
      // If it is a completed transaction, force the status to active
      const status = eventType === "transaction.completed" ? "active" : data.status;
      
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

    // 5. Handle Subscription Cancellation
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
