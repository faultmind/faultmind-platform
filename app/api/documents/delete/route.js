import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    
    // 1. Verify User (Security Check)
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized: Please log in again.' }, { status: 401 });
    }

    const { docId, storagePath } = await req.json();

    if (!docId) {
      return NextResponse.json({ error: "Missing document ID." }, { status: 400 });
    }

    // 2. Admin Client (Bypasses RLS to guarantee deletion)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // 3. Delete physical file from Bucket
    if (storagePath) {
      const { error: storageError } = await adminClient.storage
        .from('machine-docs')
        .remove([storagePath]);

      if (storageError) {
        console.error("🚨 Storage delete error:", storageError);
      }
    }

    // 4. Delete row from Database (Restricted safely to this specific user's ID)
    const { error: dbError } = await adminClient
      .from('machine_documents')
      .delete()
      .eq('id', docId)
      .eq('user_id', user.id); 

    if (dbError) {
      return NextResponse.json({ error: `Database Error: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: `Server Error: ${error.message}` }, { status: 500 });
  }
}