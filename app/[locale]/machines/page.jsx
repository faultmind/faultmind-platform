import { Cpu } from 'lucide-react';

export default function MachinesRootPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-400">
        <Cpu size={24} />
      </div>
      <p className="text-sm font-medium">Select a machine from the sidebar to inspect diagnostics or start a chat.</p>
    </div>
  );
}