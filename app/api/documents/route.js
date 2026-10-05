import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const machineId = url.searchParams.get('machineId');

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    // Retrieve unique document names for this machine
    const { data, error } = await supabase
      .from('machine_documents')
      .select('file_name, created_at')
      .eq('machine_id', machineId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Deduplicate by file_name
    const uniqueFiles = [];
    const seen = new Set();
    data.forEach(item => {
      if (!seen.has(item.file_name)) {
        seen.add(item.file_name);
        uniqueFiles.push(item);
      }
    });

    return Response.json(uniqueFiles);
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}