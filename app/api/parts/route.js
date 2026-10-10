import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// GET: Fetch all parts for a machine
export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const machineId = searchParams.get('machineId');

  if (!machineId) return NextResponse.json({ error: 'Machine ID is required' }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data, error } = await supabase
    .from('spare_parts')
    .select('*')
    .eq('machine_id', machineId)
    .order('part_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: Add a new spare part
export async function POST(req) {
  try {
    const { machineId, partName, partNumber, stockLevel, price } = await req.json();

    // Use Service Role to bypass RLS blocks
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await adminClient
      .from('spare_parts')
      .insert([{
        machine_id: machineId,
        part_name: partName,
        part_number: partNumber,
        stock_level: parseInt(stockLevel) || 0,
        price: parseFloat(price) || 0.00
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, part: data });

  } catch (error) {
    console.error('Parts Error:', error);
    return NextResponse.json({ error: 'Failed to add part' }, { status: 500 });
  }
}