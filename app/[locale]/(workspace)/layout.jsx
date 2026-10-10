export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { Settings, Plus } from 'lucide-react';
import MachineNavList from '../../../components/MachineNavList';
import { Settings, Plus, PackageSearch } from 'lucide-react';

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
  const { data: machines } = await supabase
    .from('machines')
    .select('id, name, brand_model')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (
    <div className="flex h-screen w-full bg-[#0B0F19] text-slate-300 font-sans overflow-hidden">
      
      {/* Minimalist Sidebar */}
      <aside className="w-64 bg-[#131C31] border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <span className="font-bold text-xl text-white tracking-tight">FaultMind</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6">
          <div className="px-5 mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Your Machines
          </div>
          
          {/* Active-Aware Client Machine Nav */}
          <MachineNavList machines={machines} locale={locale} />
        </div>

        {/* Subtle Bottom Controls */}
        <div className="p-4 border-t border-slate-800 space-y-1">
          <Link 
            href={`/${locale}/inventory`} 
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-800 text-slate-400 hover:text-[#D9FF00] transition-colors text-sm font-medium no-underline"
          >
            <PackageSearch size={18} /> Master Inventory
          </Link>
          <Link 
            href={`/${locale}/machines/new`} 
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-800 text-slate-400 hover:text-[#D9FF00] transition-colors text-sm font-medium no-underline"
          >
            <Plus size={18} /> Add Machine
          </Link>
          <Link 
            href={`/${locale}/settings`} 
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-sm font-medium no-underline"
          >
            <Settings size={18} /> Settings
          </Link>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 relative h-full">
        {children}
      </main>
    </div>
  );
}