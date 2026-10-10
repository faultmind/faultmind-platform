'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Plus, AlertTriangle, Loader2, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function PartsTab({ machineId }) {
  const [machineParts, setMachineParts] = useState([]);
  const [masterCatalog, setMasterCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchData = useCallback(async () => {
    if (!machineId || machineId === 'unknown') return;
    try {
      // 1. Fetch parts linked to this machine
      const bomRes = await fetch(`/api/parts?machineId=${machineId}`);
      if (bomRes.ok) setMachineParts(await bomRes.json());

      // 2. Fetch the master catalog for the dropdown
      const catalogRes = await fetch('/api/parts-catalog');
      if (catalogRes.ok) setMasterCatalog(await catalogRes.json());
    } catch (error) {
      console.error('Failed to fetch parts data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLinkPart = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!selectedPartId) return;
    setIsLinking(true);

    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, partId: selectedPartId })
      });

      if (res.ok) {
        setSelectedPartId('');
        fetchData(); // Refresh the table
      } else {
        const errData = await res.json();
        setErrorMessage(`Link Error: ${errData.error}`);
      }
    } catch (error) {
      setErrorMessage(`Network Error: ${error.message}`);
    } finally {
      setIsLinking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#D9FF00] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8 text-slate-100">
      <div className="mb-8 border-b border-slate-800 pb-4 flex items-center gap-2">
        <Package className="w-5 h-5 text-[#D9FF00]" />
        <h2 className="text-2xl font-bold text-white tracking-tight">Bill of Materials (BOM)</h2>
      </div>

      {errorMessage && (
        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 text-red-400 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* Link Part Form (Dropdown instead of text inputs) */}
      <div className="bg-[#131C31] border border-slate-800 rounded-xl p-6 mb-8">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Link Master Part to Machine</h3>
        <form onSubmit={handleLinkPart} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[250px]">
            <Label className="text-xs text-slate-400 mb-1 block">Select from Master Catalog</Label>
            <select
              required
              value={selectedPartId}
              onChange={(e) => setSelectedPartId(e.target.value)}
              className="w-full bg-[#0F172A] border border-slate-700 text-sm text-slate-200 rounded-md h-9 px-3 focus:ring-1 focus:ring-[#D9FF00] outline-none"
            >
              <option value="" disabled>-- Choose a part --</option>
              {masterCatalog.map(part => (
                <option key={part.id} value={part.id}>
                  {part.part_name} {part.part_number ? `(${part.part_number})` : ''} - Stock: {part.stock_level}
                </option>
              ))}
            </select>
          </div>
          
          <Button 
            type="submit" 
            disabled={isLinking || !selectedPartId}
            className="bg-[#D9FF00] text-black hover:bg-[#c8eb00] h-9 px-4 font-bold"
          >
            {isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
            Link Part
          </Button>
        </form>
      </div>

      {/* Linked Parts Table */}
      <div className="bg-[#131C31] border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-semibold">Part Description</th>
              <th className="px-6 py-4 font-semibold">Part Number</th>
              <th className="px-6 py-4 font-semibold">Current Plant Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {machineParts.length === 0 ? (
              <tr>
                <td colSpan="3" className="px-6 py-8 text-center text-slate-500">
                  No parts linked to this machine yet.
                </td>
              </tr>
            ) : (
              machineParts.map((part) => (
                <tr key={part.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-200">{part.part_name}</td>
                  <td className="px-6 py-4 text-slate-400 font-mono text-xs">{part.part_number || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {part.stock_level <= part.min_threshold ? (
                      <span className="flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2.5 py-1 rounded-md w-fit font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {part.stock_level} (Low)
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium px-2.5">{part.stock_level}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}