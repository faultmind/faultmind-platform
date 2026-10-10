import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const machineId = searchParams.get('machineId');

  if (!machineId) {
    return NextResponse.json({ error: 'Machine ID is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
      },
    }
  );

  const { data, error } = await supabase
    .from('maintenance_reports')
    .select('*')
    .eq('machine_id', machineId)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: Save a new report and deduct used parts from inventory
export async function POST(req) {
  try {
    const { 
      machine_id, 
      root_cause, 
      resolution, 
      downtime_minutes, 
      technicians,
      used_parts // Array of objects: [{ partId: 'uuid', qty: 2 }]
    } = await req.json();

    // 1. We need the Service Role key to bypass RLS for inventory updates
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 2. Insert the main maintenance report
    const { data: report, error: reportError } = await adminClient
      .from('maintenance_reports')
      .insert([{
        machine_id,
        root_cause,
        resolution,
        downtime_minutes: parseInt(downtime_minutes) || 0,
        technicians,
        status: 'published'
      }])
      .select()
      .single();

    if (reportError) throw new Error(`Report save failed: ${reportError.message}`);

    // 3. Process inventory deductions if parts were used
    if (used_parts && used_parts.length > 0) {
      for (const item of used_parts) {
        // Fetch current stock to calculate new total
        const { data: partData } = await adminClient
          .from('parts_catalog')
          .select('stock_level')
          .eq('id', item.partId)
          .single();

        if (partData) {
          const newStock = Math.max(0, partData.stock_level - item.qty);
          
          await adminClient
            .from('parts_catalog')
            .update({ stock_level: newStock })
            .eq('id', item.partId);
        }
      }
    }

    return NextResponse.json({ success: true, report });

  } catch (error) {
    console.error('Report submission error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}