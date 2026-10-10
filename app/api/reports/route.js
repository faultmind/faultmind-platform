// PUT: Edit a report (Refund old parts, deduct new parts, update text)
export async function PUT(req) {
  try {
    const { id, root_cause, resolution, downtime_minutes, technicians, used_parts } = await req.json();
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // 1. Fetch the original report to see what parts we need to refund
    const { data: oldReport } = await adminClient
      .from('maintenance_reports')
      .select('used_parts')
      .eq('id', id)
      .single();

    // 2. Refund the old parts back to the master catalog
    if (oldReport?.used_parts?.length > 0) {
      for (const item of oldReport.used_parts) {
        const { data: part } = await adminClient.from('parts_catalog').select('stock_level').eq('id', item.partId).single();
        if (part) {
          await adminClient.from('parts_catalog').update({ stock_level: part.stock_level + item.qty }).eq('id', item.partId);
        }
      }
    }

    // 3. Deduct the newly submitted parts
    if (used_parts?.length > 0) {
      for (const item of used_parts) {
        const { data: part } = await adminClient.from('parts_catalog').select('stock_level').eq('id', item.partId).single();
        if (part) {
          await adminClient.from('parts_catalog').update({ stock_level: Math.max(0, part.stock_level - item.qty) }).eq('id', item.partId);
        }
      }
    }

    // 4. Save the updated report
    const { data, error } = await adminClient
      .from('maintenance_reports')
      .update({ root_cause, resolution, downtime_minutes: parseInt(downtime_minutes), technicians, used_parts })
      .eq('id', id)
      .select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, report: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove a report and refund its parts
export async function DELETE(req) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // 1. Fetch the report to refund inventory before deleting
    const { data: oldReport } = await adminClient.from('maintenance_reports').select('used_parts').eq('id', id).single();

    if (oldReport?.used_parts?.length > 0) {
      for (const item of oldReport.used_parts) {
        const { data: part } = await adminClient.from('parts_catalog').select('stock_level').eq('id', item.partId).single();
        if (part) {
          await adminClient.from('parts_catalog').update({ stock_level: part.stock_level + item.qty }).eq('id', item.partId);
        }
      }
    }

    // 2. Delete the report
    const { error } = await adminClient.from('maintenance_reports').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}