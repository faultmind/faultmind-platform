import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    
    // 1. Authenticate the request using the engineer's active session cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { docId, storagePath } = await req.json();

    if (!docId) {
      return NextResponse.json({ error: "Missing document ID" }, { status: 400 });
    }

    // 2. Delete the physical file from the storage bucket as the authenticated user
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from('machine-docs')
        .remove([storagePath]);

      if (storageError) {
        console.error("🚨 Storage delete error:", storageError);
      }
    }

    // 3. Delete the metadata record from the database table (secured by user_id)
    const { error: dbError } = await supabase
      .from('machine_documents')
      .delete()
      .eq('id', docId)
      .eq('user_id', user.id); // Extra safety check to ensure ownership

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