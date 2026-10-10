import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import MachineHubClient from './MachineHubClient';

export default async function MachinePage({ params }) {
  const { machineId } = await params; 
  
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // Fetch the specific machine details from your database
  const { data: machine, error } = await supabase
    .from('machines')
    .select('*')
    .eq('id', machineId)
    .single();

  if (error || !machine) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Machine not found or access denied.
      </div>
    );
  }

  // Pass the real database data to the interactive UI
  return <MachineHubClient machine={machine} />;
}