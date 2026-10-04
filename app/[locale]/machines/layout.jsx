import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Cpu, Plus, Settings, LogOut } from 'lucide-react';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MachinesLayout({ children, params }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale || 'en';

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Fetch machines for this specific engineer
  const { data: machines } = await supabase
    .from('machines')
    .select('id, name, brand_model')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (
    <div className="flex h-screen w-full bg-[#0B0F19] text-slate-300 font-sans overflow-hidden">
      
      {/* Dynamic Sidebar */}
      <aside className="w-64 bg-[#131C31] border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <span className="font-bold text-xl text-white tracking-tight">FaultMind</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6">
          <div className="px-5 mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Your Machines
          </div>
          <div className="space-y-1 px-3">
            {machines?.map((machine) => (
              <Link 
                key={machine.id} 
                href={`/${locale}/machines/${machine.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors group"
              >
                <Cpu size={18} className="text-slate-500 group-hover:text-[#D9FF00]" />
                <span className="truncate text-sm font-medium">{machine.name}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-1">
           <button className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-800 text-slate-400 hover:text-[#D9FF00] transition-colors text-sm font-medium">
              <Plus size={18} /> Add Machine
           </button>
           <button className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-sm font-medium">
              <Settings size={18} /> Settings
           </button>
        </div>
      </aside>

      {/* Main Workspace (MachineHubClient) */}
      <main className="flex-1 relative h-full">
        {children}
      </main>
    </div>
  );
}