'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu } from 'lucide-react';

export default function MachineNavList({ machines, locale }) {
  const pathname = usePathname();

  if (!machines || machines.length === 0) {
    return <p className="px-5 text-xs text-slate-500 mt-2">No machines added yet.</p>;
  }

  return (
    <div className="space-y-1 px-3">
      {machines.map((machine) => {
        const machineHref = `/${locale}/machines/${machine.id}`;
        const isActive = pathname === machineHref;

        return (
          <Link
            key={machine.id}
            href={machineHref}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all no-underline ${
              isActive
                ? 'bg-slate-800 text-[#D9FF00] font-semibold border border-slate-700 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Cpu
              size={18}
              className={`shrink-0 transition-colors ${
                isActive ? 'text-[#D9FF00]' : 'text-slate-500 group-hover:text-slate-300'
              }`}
            />
            <span className="truncate text-sm">{machine.name}</span>
          </Link>
        );
      })}
    </div>
  );
}