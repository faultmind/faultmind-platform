"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize the standard frontend Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function CreditBadge() {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCredits() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Get the user's workspace ID
        const { data: memberData, error: memberErr } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .single();

        if (memberErr || !memberData) return;

        // 2. Fetch the available credits for that workspace
        const { data: workspaceData, error: workspaceErr } = await supabase
          .from("workspaces")
          .select("available_credits")
          .eq("id", memberData.workspace_id)
          .single();

        if (workspaceData && !workspaceErr) {
          setCredits(workspaceData.available_credits);
        }
      } catch (error) {
        console.error("Error fetching credits:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCredits();

    // Optional: Subscribe to real-time changes so the badge updates immediately when credits are spent
    const channel = supabase
      .channel('workspace_updates')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'workspaces' 
      }, (payload) => {
        if (payload.new && payload.new.available_credits !== undefined) {
          setCredits(payload.new.available_credits);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return <div className="animate-pulse bg-[#0F172A] border border-slate-700 h-9 w-28 rounded-md"></div>;
  }

  if (credits === null) return null;

  // Warning state if credits fall below 10
  const isLow = credits < 10;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold border transition-colors ${
      isLow 
        ? "bg-red-950 border-red-500/50 text-red-400" 
        : "bg-[#0F172A] border-slate-700 text-[#D9FF00]" 
    }`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>{credits} {credits === 1 ? 'Credit' : 'Credits'}</span>
    </div>
  );
}