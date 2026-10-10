import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// GET: Fetch the Bill of Materials (BOM) for a specific machine
export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const machineId = searchParams.get('machineId');

    if (!machineId || machineId === 'unknown' || machineId === 'null') {
      return NextResponse.json([]); 
    }

    const adminClient = getAdminClient();

    // Query the junction table and pull in the master catalog details
    const { data, error } = await adminClient
      .from('machine_bom')
      .select(`
        part_id,
        parts_catalog (*)
      `)
      .eq('machine_id', machineId);

    if (error) {
      console.error('BOM GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the nested Supabase response so the frontend table can read it easily
    const formattedParts = data
      .filter(row => row.parts_catalog) // Ensure the part still exists in the catalog
      .map(row => row.parts_catalog);

    return NextResponse.json(formattedParts);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Link an existing master part to a machine's BOM
export async function POST(req) {
  try {
    const { machineId, partId } = await req.json();

    if (!machineId || !partId) {
      return NextResponse.json({ error: 'Machine ID and Part ID are required' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    const { error } = await adminClient
      .from('machine_bom')
      .insert([{
        machine_id: machineId,
        part_id: partId
      }]);

    if (error) {
      // Handle the case where the part is already linked to this machine
      if (error.code === '23505') {
         return NextResponse.json({ error: 'Part is already in this machine\'s BOM' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}