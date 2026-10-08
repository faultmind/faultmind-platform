import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    
    // 1. Authenticate user
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Parse form data
    const body = await req.json();
    const { machineId, rootCause, resolution, partsReplaced, partPrice, downtime, technicians } = body;

    if (!machineId) return NextResponse.json({ error: 'Machine ID is required' }, { status: 400 });

// 3. Insert into database using the authenticated client (Passes RLS)
    const { error: dbError } = await authClient
      .from('maintenance_reports')
      .insert([{
        machine_id: machineId,
        user_id: user.id,
        root_cause: rootCause,
        resolution_steps: resolution,
        parts_replaced: partsReplaced,
        part_price: parseFloat(partPrice) || 0,
        downtime_minutes: parseInt(downtime) || 0,
        technicians: technicians
      }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("🚨 Report Publish Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}