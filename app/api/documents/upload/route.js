import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const maxDuration = 60;

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    
    // 1. AUTH CLIENT: Securely read cookies to verify the user
    const authClient = createServerClient(
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

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const machineId = formData.get('machineId');

    if (!file || !machineId) {
      return NextResponse.json({ error: 'Missing file or machine ID' }, { status: 400 });
    }

    const fileName = file.name;
    const filePath = `${machineId}/${Date.now()}_${fileName}`;

    // 2. ADMIN CLIENT: Use Service Role Key to bypass RLS for data writing
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // 3. Upload to Bucket
    const { error: uploadError } = await adminClient.storage
      .from('machine-docs')
      .upload(filePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (uploadError) {
      console.error('🚨 Bucket Upload Error:', uploadError);
      return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 });
    }

    // 4. Insert into Database
    const { error: dbError } = await adminClient
      .from('machine_documents')
      .insert([{
        machine_id: machineId,
        user_id: user.id,
        file_name: fileName,
        storage_path: filePath,
        file_type: fileName.split('.').pop().toUpperCase()
      }]);

    // 5. Cleanup if Database fails
    if (dbError) {
      console.error('🚨 Database Insert Error:', dbError);
      // Delete the orphaned file from the bucket so we don't get copies!
      await adminClient.storage.from('machine-docs').remove([filePath]);
      
      return NextResponse.json({ error: 'Database insert failed (Check terminal logs for missing columns)' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('🚨 Upload handler crash:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}