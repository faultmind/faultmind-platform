import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const paddle = new Paddle(process.env.PADDLE_API_KEY || "", {
  environment: Environment.sandbox, // Sandbox mode remains active
});

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("paddle-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // 1. Cryptographic Security Check
    const secretKey = process.env.PADDLE_WEBHOOK_SECRET_KEY;
    paddle.webhooks.unmarshal(rawBody, secretKey, signature);

    // 2. Data Extraction
    const payload = JSON.parse(rawBody);
    const eventType = payload.event_type;
    const data = payload.data;
    const userId = data?.custom_data?.userId;

    if (!userId) {
      return NextResponse.json({ message: "No userId in customData, ignored" }, { status: 200 });
    }

    // 3. Find User's Workspace for Credit Assignment
    const { data: memberData, error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .single();
      
    const workspaceId = memberData?.workspace_id;

    // 4. Database Updates
    if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.activated" ||
      eventType === "transaction.completed"
    ) {
      const subscriptionId = data.subscription_id || data.id;
      const status = eventType === "transaction.completed" ? "active" : data.status;
      const priceId = data.items?.[0]?.price?.id || null;

      // A. Update the Subscription Status
      const { error: dbError } = await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        subscription_id: subscriptionId,
        status: status,
        price_id: priceId,
        updated_at: new Date().toISOString(),
      }, { 
        onConflict: 'user_id' // Prevents concurrent webhooks from crashing
      });

      if (dbError) throw dbError; 

      // B. Assign Credits on Successful Payment
      if (eventType === "transaction.completed" && workspaceId) {
        const creditAmount = 500; // Top-up amount per successful transaction

        const { error: rpcError } = await supabaseAdmin.rpc("add_credits", {
          p_workspace_id: workspaceId,
          p_amount: creditAmount,
          p_description: `Paddle Top-up (Transaction: ${data.id})`
        });

        if (rpcError) {
          console.error("Failed to add credits:", rpcError);
        }
      }
    }

    if (eventType === "subscription.canceled") {
      const { error: dbError } = await supabaseAdmin.from("subscriptions").update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      if (dbError) throw dbError;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    // Logs the real error to your private Vercel console, but returns a generic safe message to the web
    console.error("Webhook Error:", error.message);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}