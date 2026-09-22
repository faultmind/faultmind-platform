import { NextResponse } from "next/server";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

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

    // 1. Verify webhook authenticity
    const secretKey = process.env.PADDLE_WEBHOOK_SECRET_KEY;
    paddle.webhooks.unmarshal(rawBody, secretKey, signature);

    // 2. Parse payload data
    const payload = JSON.parse(rawBody);
    const eventType = payload.event_type;
    const data = payload.data;

    const userId = data?.custom_data?.userId;

    if (!userId) {
      return NextResponse.json({ message: "No userId in customData, ignored" }, { status: 200 });
    }

    // 3. Handle Subscription and Transaction Events
    if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.activated" ||
      eventType === "transaction.completed"
    ) {
      const subscriptionId = data.subscription_id || data.id;
      const status = eventType === "transaction.completed" ? "active" : data.status;
      const priceId = data.items?.[0]?.price?.id || null;

      // Use a direct REST API call with the Service Role Key to bypass all client limitations
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates", // Acts as an upsert based on primary key/constraints
        },
        body: JSON.stringify({
          user_id: userId,
          subscription_id: subscriptionId,
          status: status,
          price_id: priceId,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Direct Supabase REST Error:", errorText);
        return NextResponse.json({ error: errorText }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Paddle Webhook Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
