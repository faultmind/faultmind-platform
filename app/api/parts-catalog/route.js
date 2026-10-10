import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// GET: Fetch the entire plant inventory
export async function GET() {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('parts_catalog')
      .select('*')
      .order('part_name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Add a new master part to the storeroom
export async function POST(req) {
  try {
    const { partName, partNumber, stockLevel, minThreshold, price, binLocation } = await req.json();
    const adminClient = getAdminClient();

    const { data, error } = await adminClient
      .from('parts_catalog')
      .insert([{
        part_name: partName,
        part_number: partNumber || null,
        stock_level: parseInt(stockLevel, 10) || 0,
        min_threshold: parseInt(minThreshold, 10) || 2,
        price: parseFloat(price) || 0.00,
        bin_location: binLocation || null
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, part: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}