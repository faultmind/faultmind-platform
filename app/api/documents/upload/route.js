import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the Service Role Key to bypass any restrictive RLS policies during server uploads
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const machineId = formData.get('machineId');

    if (!file || !machineId) {
      return NextResponse.json({ error: "Missing file or machine ID" }, { status: 400 });
    }

    const fileName = file.name;
    const filePath = `${machineId}/${Date.now()}_${fileName}`;

    // Convert the File object to a Buffer for Supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // STEP 1: Upload to Storage Bucket FIRST
    const { error: uploadError } = await supabase.storage
      .from('machine-docs')
      .upload(filePath, buffer, {
        contentType: file.type || 'text/plain',
        upsert: false
      });

    if (uploadError) {
      console.error("🚨 Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload to storage" }, { status: 500 });
    }

    // STEP 2: Only insert into the database if the file is physically in the bucket
    const { error: dbError } = await supabase
      .from('machine_documents')
      .insert([{
        machine_id: machineId,
        file_name: fileName,
        storage_path: filePath,
        file_type: fileName.split('.').pop().toUpperCase()
      }]);

    if (dbError) {
      console.error("🚨 Database insert error:", dbError);
      return NextResponse.json({ error: "Failed to create database record" }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("🚨 Upload handler crash:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}