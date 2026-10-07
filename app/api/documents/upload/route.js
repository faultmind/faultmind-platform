import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const machineId = formData.get('machineId');
    const userId = formData.get('userId');

    if (!file || !machineId) {
      return NextResponse.json({ error: "Missing file or machine ID" }, { status: 400 });
    }

    const fileName = file.name;
    const filePath = `${machineId}/${Date.now()}_${fileName}`;

    // STEP 1: Pass the raw native 'file' object directly. 
    // Do not convert to Buffer.
    const { error: uploadError } = await supabase.storage
      .from('machine-docs')
      .upload(filePath, file, {
        contentType: file.type || 'text/plain',
        upsert: false
      });

    if (uploadError) {
      console.error("🚨 Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // STEP 2: Database insert
    const { error: dbError } = await supabase
      .from('machine_documents')
      .insert([{
        machine_id: machineId,
        user_id: userId,
        file_name: fileName,
        storage_path: filePath,
        file_type: fileName.split('.').pop().toUpperCase()
      }]);

    if (dbError) {
      console.error("🚨 Database insert error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("🚨 Upload handler crash:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}