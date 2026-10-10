import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// GET: Fetch published reports for a machine
export async function GET(request) {
  try {
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
          getAll() {
            return cookieStore.getAll();
          },
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
    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Save new report & deduct inventory
export async function POST(req) {
  try {
    const { 
      machine_id, 
      root_cause, 
      resolution, 
      downtime_minutes, 
      technicians, 
      used_parts 
    } = await req.json();

    const adminClient = getAdminClient();

    // 1. Insert maintenance report
    const { data: report, error: reportError } = await adminClient
      .from('maintenance_reports')
      .insert([{
        machine_id,
        root_cause,
        resolution,
        downtime_minutes: parseInt(downtime_minutes, 10) || 0,
        technicians: technicians || 'Duty Engineer',
        used_parts: used_parts || [],
        status: 'published'
      }])
      .select()
      .single();

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    // 2. Deduct inventory from master catalog
    if (used_parts && Array.isArray(used_parts) && used_parts.length > 0) {
      for (const item of used_parts) {
        const { data: partData } = await adminClient
          .from('parts_catalog')
          .select('stock_level')
          .eq('id', item.partId)
          .single();

        if (partData) {
          const newStock = Math.max(0, (partData.stock_level || 0) - (parseInt(item.qty, 10) || 0));
          await adminClient
            .from('parts_catalog')
            .update({ stock_level: newStock })
            .eq('id', item.partId);
        }
      }
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Edit report (Refund old parts, deduct new parts, update text)
export async function PUT(req) {
  try {
    const { id, root_cause, resolution, downtime_minutes, technicians, used_parts } = await req.json();
    const adminClient = getAdminClient();

    // 1. Fetch original report to refund previous parts
    const { data: oldReport } = await adminClient
      .from('maintenance_reports')
      .select('used_parts')
      .eq('id', id)
      .single();

    if (oldReport?.used_parts?.length > 0) {
      for (const item of oldReport.used_parts) {
        const { data: part } = await adminClient
          .from('parts_catalog')
          .select('stock_level')
          .eq('id', item.partId)
          .single();

        if (part) {
          await adminClient
            .from('parts_catalog')
            .update({ stock_level: part.stock_level + item.qty })
            .eq('id', item.partId);
        }
      }
    }

    // 2. Deduct new parts
    if (used_parts?.length > 0) {
      for (const item of used_parts) {
        const { data: part } = await adminClient
          .from('parts_catalog')
          .select('stock_level')
          .eq('id', item.partId)
          .single();

        if (part) {
          await adminClient
            .from('parts_catalog')
            .update({ stock_level: Math.max(0, part.stock_level - item.qty) })
            .eq('id', item.partId);
        }
      }
    }

    // 3. Update report record
    const { data, error } = await adminClient
      .from('maintenance_reports')
      .update({
        root_cause,
        resolution,
        downtime_minutes: parseInt(downtime_minutes, 10) || 0,
        technicians,
        used_parts
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, report: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove report and refund its parts
export async function DELETE(req) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');
    const adminClient = getAdminClient();

    const { data: oldReport } = await adminClient
      .from('maintenance_reports')
      .select('used_parts')
      .eq('id', id)
      .single();

    if (oldReport?.used_parts?.length > 0) {
      for (const item of oldReport.used_parts) {
        const { data: part } = await adminClient
          .from('parts_catalog')
          .select('stock_level')
          .eq('id', item.partId)
          .single();

        if (part) {
          await adminClient
            .from('parts_catalog')
            .update({ stock_level: part.stock_level + item.qty })
            .eq('id', item.partId);
        }
      }
    }

    const { error } = await adminClient
      .from('maintenance_reports')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}