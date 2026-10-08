import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const maxDuration = 60;

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    
    // 1. Check user auth
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ error: 'Auth Error: Unauthorized or not logged in.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const machineId = formData.get('machineId');

    if (!file || !machineId) {
      return NextResponse.json({ error: 'Validation Error: Missing file or machine ID.' }, { status: 400 });
    }

    const fileName = file.name;
    const filePath = `${machineId}/${Date.now()}_${fileName}`;

    // 2. Admin client to bypass RLS
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Convert to ArrayBuffer explicitly (fixes Node/Vercel File object parsing bugs)
    const arrayBuffer = await file.arrayBuffer();
    const fileBody = new Uint8Array(arrayBuffer);

    // 3. Upload to bucket
    const { error: uploadError } = await adminClient.storage
      .from('machine-docs')
      .upload(filePath, fileBody, {
        contentType: file.type || 'text/plain',
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: `Storage Error: ${uploadError.message}` }, { status: 500 });
    }

    // 4. Insert into database
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
      // Cleanup the stranded file
      await adminClient.storage.from('machine-docs').remove([filePath]);
      return NextResponse.json({ error: `Database Error: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: `Server Crash: ${error.message}` }, { status: 500 });
  }
}