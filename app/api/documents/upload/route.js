import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// REQUIRED for Next.js to handle heavy file buffers properly
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  console.log("\n========================================");
  console.log("🚀 UPLOAD PIPELINE STARTED");
  console.log("========================================");

  try {
    const cookieStore = await cookies();
    
    // STEP 1: Verify Auth
    console.log("⏳ [1/4] Checking User Auth...");
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!user || authError) {
      console.log("❌ AUTH FAILED:", authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("✅ USER VERIFIED:", user.id);

    // STEP 2: Parse File
    console.log("⏳ [2/4] Parsing Form Data...");
    const formData = await req.formData();
    const file = formData.get('file');
    const machineId = formData.get('machineId');

    if (!file || !machineId) {
      console.log("❌ MISSING DATA: file or machineId is null");
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }
    
    const fileName = file.name;
    const filePath = `${machineId}/${Date.now()}_${fileName}`;
    console.log("✅ FILE RECEIVED:", fileName, "| Machine:", machineId);

    // STEP 3: Upload to Bucket
    console.log("⏳ [3/4] Uploading to Storage Bucket...");
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const arrayBuffer = await file.arrayBuffer();
    const fileBody = Buffer.from(arrayBuffer); // Using Node Buffer safely now

    const { error: uploadError } = await adminClient.storage
      .from('machine-docs')
      .upload(filePath, fileBody, {
        contentType: file.type || 'text/plain',
        upsert: false
      });

    if (uploadError) {
      console.log("❌ BUCKET UPLOAD FAILED:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    console.log("✅ BUCKET UPLOAD SUCCESS!");

    // STEP 4: Insert Database Record
    console.log("⏳ [4/4] Writing to Database Table...");
    const { error: dbError } = await adminClient
      .from('machine_documents')
      .insert([{
        machine_id: machineId,
        user_id: user.id,
        file_name: fileName,
        storage_path: filePath,
        file_type: fileName.split('.').pop().toUpperCase()
      }]);

    if (dbError) {
      console.log("❌ DATABASE INSERT FAILED:", dbError);
      console.log("🧹 Cleaning up stranded bucket file...");
      await adminClient.storage.from('machine-docs').remove([filePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    console.log("🎉 ALL STEPS COMPLETED SUCCESSFULLY!\n");
    return NextResponse.json({ success: true });

  } catch (error) {
    console.log("🔥 FATAL SERVER CRASH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}