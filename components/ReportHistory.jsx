'use client';

import { useState, useEffect } from 'react';
import { Loader2, FileText, Clock, Wrench } from 'lucide-react';

export default function ReportHistory({ machineId }) {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      if (!machineId) return;
      try {
        const res = await fetch(`/api/reports?machineId=${machineId}`);
        if (res.ok) {
          const data = await res.json();
          setReports(data);
        }
      } catch (error) {
        console.error('Failed to fetch reports:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, [machineId]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8 flex justify-center">
        <Loader2 className="w-6 h-6 text-[#D9FF00] animate-spin" />
      </div>
    );
  }

  if (reports.length === 0) return null; // Hide section if no history exists yet

  return (
    <div className="max-w-4xl mx-auto p-8 pt-0 text-slate-100">
      <div className="mb-6 border-b border-slate-800 pb-4 flex items-center gap-2">
        <FileText className="w-5 h-5 text-[#D9FF00]" />
        <h3 className="text-xl font-bold text-white tracking-tight">Log History</h3>
      </div>

      <div className="bg-[#131C31] border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Root Cause</th>
                <th className="px-6 py-4 font-semibold">Resolution</th>
                <th className="px-6 py-4 font-semibold">Downtime</th>
                <th className="px-6 py-4 font-semibold">Techs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                    {new Date(report.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-200">
                    {report.root_cause || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-400 min-w-[250px]">
                    {report.resolution || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {report.downtime_minutes ? (
                      <span className="flex items-center gap-1.5 text-orange-400 bg-orange-400/10 px-2 py-1 rounded-md w-fit">
                        <Clock className="w-3.5 h-3.5" />
                        {report.downtime_minutes} min
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-slate-500" />
                      {report.technicians || '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}