import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the Service Role Key to bypass RLS restrictions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { docId, storagePath } = await req.json();

    if (!docId) {
      return NextResponse.json({ error: "Missing document ID" }, { status: 400 });
    }

    // STEP 1: Delete the physical file from the storage bucket
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from('machine-docs')
        .remove([storagePath]);

      if (storageError) {
        console.error("🚨 Storage delete error:", storageError);
        // We continue even if storage fails, just in case the file is already gone
      }
    }

    // STEP 2: Delete the record from the database table
    const { error: dbError } = await supabase
      .from('machine_documents')
      .delete()
      .eq('id', docId);

    if (dbError) {
      console.error("🚨 Database delete error:", dbError);
      return NextResponse.json({ error: "Failed to delete database record" }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("🚨 Delete handler crash:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}