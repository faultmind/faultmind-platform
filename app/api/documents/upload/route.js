import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Allow up to 60 seconds for large file uploads
export const maxDuration = 60;

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    
    // Initialize Supabase with cookies for secure auth
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

    // 1. Securely identify the user (No need to send this from the frontend)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    // 2. Upload the heavy file natively to the Storage Bucket
    const { error: uploadError } = await supabase.storage
      .from('machine-docs')
      .upload(filePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (uploadError) {
      console.error('🚨 Bucket Upload Error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 3. Save only the lightweight metadata to the database table
    const { error: dbError } = await supabase
      .from('machine_documents')
      .insert([{
        machine_id: machineId,
        user_id: user.id, // Applied securely from the server session
        file_name: fileName,
        storage_path: filePath, // Tells the Chat API where to find it in the bucket
        file_type: fileName.split('.').pop().toUpperCase()
      }]);

    if (dbError) {
      console.error('🚨 Database Insert Error:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('🚨 Upload handler crash:', error);
    return NextResponse.json({ error: error.message || 'Unknown server error' }, { status: 500 });
  }
}