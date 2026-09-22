import { NextResponse } from "next/server";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

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

    const secretKey = process.env.PADDLE_WEBHOOK_SECRET_KEY;
    paddle.webhooks.unmarshal(rawBody, secretKey, signature);

    const payload = JSON.parse(rawBody);
    const eventType = payload.event_type;
    const data = payload.data;
    const userId = data?.custom_data?.userId;

    if (!userId) {
      return NextResponse.json({ message: "No userId in customData, ignored" }, { status: 200 });
    }

    if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.activated" ||
      eventType === "transaction.completed"
    ) {
      const subscriptionId = data.subscription_id || data.id;
      const status = eventType === "transaction.completed" ? "active" : data.status;
      const priceId = data.items?.[0]?.price?.id || null;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

      // --- DIAGNOSTIC INJECTION: Decode the JWT to reveal its true role ---
      let decodedRole = "unknown";
      try {
         if (serviceRoleKey) {
             // Split the JWT and decode the payload body
             const jwtPayload = JSON.parse(Buffer.from(serviceRoleKey.split('.')[1], 'base64').toString());
             decodedRole = jwtPayload.role;
         } else {
             decodedRole = "KEY_IS_EMPTY";
         }
      } catch (e) {
         decodedRole = "INVALID_JWT_FORMAT";
      }
      // -------------------------------------------------------------------

      const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates",
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
        // Return the exact role Netlify is using inside the error response
        return NextResponse.json({
            error: "Database insertion failed",
            diagnostic_role_detected: decodedRole,
            supabase_error: JSON.parse(errorText)
        }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
