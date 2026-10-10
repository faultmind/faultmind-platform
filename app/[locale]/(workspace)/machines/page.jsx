import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MachinesIndexPage({ params }) {
  // Await params to avoid Next.js 15 sync params warnings
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

  // Fetch the user's oldest/primary machine
  const { data: machines } = await supabase
    .from('machines')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (machines && machines.length > 0) {
    // Instantly drop them into the chat workspace for this machine
    redirect(`/${locale}/machines/${machines[0].id}`);
  } else {
    // If it is a brand new account with no machines yet
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0F172A] text-slate-400">
        No machines configured. Please add a machine to your account.
      </div>
    );
  }
}