import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// GET: Fetch all parts for a machine
export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const machineId = searchParams.get('machineId');

    const adminClient = getAdminClient();

    let query = adminClient
      .from('spare_parts')
      .select('*')
      .order('part_name', { ascending: true });

    // Only filter if machineId is a valid non-empty value and not 'unknown'
    if (machineId && machineId !== 'unknown' && machineId !== 'null') {
      query = query.eq('machine_id', machineId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Parts GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Parts GET route crash:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Add a new spare part
export async function POST(req) {
  try {
    const { machineId, partName, partNumber, stockLevel, price } = await req.json();

    const validMachineId =
      machineId && machineId !== 'unknown' && machineId !== 'null' ? machineId : null;

    const adminClient = getAdminClient();

    const { data, error } = await adminClient
      .from('spare_parts')
      .insert([
        {
          machine_id: validMachineId,
          part_name: partName,
          part_number: partNumber || null,
          stock_level: parseInt(stockLevel, 10) || 0,
          price: parseFloat(price) || 0.0,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Parts POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, part: data });
  } catch (error) {
    console.error('Parts POST route crash:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}