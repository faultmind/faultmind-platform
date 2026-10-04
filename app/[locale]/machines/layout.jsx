export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { Settings, Wrench, Package, Plus, Cpu } from 'lucide-react';

export default async function MachinesLayout({ children, params }) {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale || 'en';

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Handled safely in Server Components
          }
        },
      },
    }
  );

  // 1. Crash-proof Auth Fetch & Redirect
  const authResponse = await supabase.auth.getUser();
  const user = authResponse?.data?.user || null;
  
  if (!user) {
    redirect(`/${locale}/login`);
  }

  // 2. Fetch *Only* This Engineer's Machines
  const { data: machines, error: dbError } = await supabase
    .from('machines')
    .select('id, name, brand_model')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (
    <div className="flex h-screen w-full bg-[#0F172A] text-slate-300 font-sans">
      <aside className="w-64 bg-[#131C31] border-r border-slate-800 flex flex-col">
        <div className="p-4">
          <Link 
            href={`/${locale}/machines/new`}
            className="w-full flex items-center justify-center gap-2 bg-[#D9FF00] hover:bg-[#c2e600] text-slate-900 font-bold py-2.5 px-4 rounded-lg transition-colors"
          >
            <Plus size={20} strokeWidth={2.5} />
            Add Machine
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <h2 className="px-5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Your Machines
          </h2>
                    
          <nav className="flex flex-col gap-1 px-3">
            {machines && machines.length > 0 ? (
              machines.map((machine) => (
                <Link
                  key={machine.id}
                  href={`/${locale}/machines/${machine.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800/50 transition-colors group"
                >
                  <Cpu size={18} className="text-slate-400 group-hover:text-[#D9FF00]" />
                  <span className="truncate">{machine.name}</span>
                </Link>
              ))
            ) : (
              <p className="px-5 text-xs text-slate-500 mt-2">No machines added yet.</p>
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-2">
          <Link href={`/${locale}/work-orders`} className="flex items-center gap-3 px-3 py-2 text-sm hover:text-white transition-colors">
            <Wrench size={18} /> Master Work Orders
          </Link>
          <Link href={`/${locale}/inventory`} className="flex items-center gap-3 px-3 py-2 text-sm hover:text-white transition-colors">
            <Package size={18} /> Spare Parts Inventory
          </Link>
          <Link href={`/${locale}/settings`} className="flex items-center gap-3 px-3 py-2 text-sm hover:text-white transition-colors">
            <Settings size={18} /> Workspace Settings
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative h-full">
        {children}
      </main>
    </div>
  );
}