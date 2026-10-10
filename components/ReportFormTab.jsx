'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function ReportForm({ machineId, existingReport = null, onSuccess }) {
  // Main form state
  const [rootCause, setRootCause] = useState(existingReport?.root_cause || '');
  const [resolution, setResolution] = useState(existingReport?.resolution || '');
  const [downtime, setDowntime] = useState(existingReport?.downtime_minutes || '');
  
  // Parts Staging State
  const [bomParts, setBomParts] = useState([]); // Master list for this machine
  const [stagedParts, setStagedParts] = useState(existingReport?.used_parts || []);
  
  // Staging Inputs
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch the Machine's BOM for the dropdown
  useEffect(() => {
    async function fetchBOM() {
      if (!machineId) return;
      const res = await fetch(`/api/parts?machineId=${machineId}`);
      if (res.ok) setBomParts(await res.json());
    }
    fetchBOM();
  }, [machineId]);

  // Add part to staging area
  const handleStagePart = (e) => {
    e.preventDefault();
    if (!selectedPartId || selectedQty < 1) return;

    const partDetails = bomParts.find(p => p.id === selectedPartId);
    if (!partDetails) return;

    setStagedParts(prev => {
      // If already staged, just add to the existing quantity
      const existing = prev.find(p => p.partId === selectedPartId);
      if (existing) {
        return prev.map(p => 
          p.partId === selectedPartId 
            ? { ...p, qty: p.qty + parseInt(selectedQty) } 
            : p
        );
      }
      // Otherwise, add new row
      return [...prev, { 
        partId: partDetails.id, 
        name: partDetails.part_name, 
        number: partDetails.part_number,
        qty: parseInt(selectedQty),
        maxStock: partDetails.stock_level 
      }];
    });

    // Reset staging inputs
    setSelectedPartId('');
    setSelectedQty(1);
  };

  // Inline edit quantity in the staging table
  const handleUpdateStagedQty = (partId, newQty) => {
    const qty = Math.max(1, parseInt(newQty) || 1);
    setStagedParts(prev => prev.map(p => p.partId === partId ? { ...p, qty } : p));
  };

  // Remove part from staging table
  const handleRemoveStagedPart = (partId) => {
    setStagedParts(prev => prev.filter(p => p.partId !== partId));
  };

  // Submit the complete report
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const payload = {
      id: existingReport?.id, // Only present if editing
      machine_id: machineId,
      root_cause: rootCause,
      resolution: resolution,
      downtime_minutes: downtime,
      used_parts: stagedParts.map(p => ({ partId: p.partId, qty: p.qty })) // Clean payload
    };

    try {
      const method = existingReport ? 'PUT' : 'POST';
      const res = await fetch('/api/reports', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error((await res.json()).error);
      if (onSuccess) onSuccess();
      
    } catch (err) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-slate-200">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/50 text-red-400 rounded-lg flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Basic Report Details (Root Cause, Resolution, etc.) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label className="text-xs text-slate-400">Root Cause</Label>
          <Input required value={rootCause} onChange={e => setRootCause(e.target.value)} className="bg-[#0F172A] border-slate-700" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs text-slate-400">Resolution</Label>
          <textarea required value={resolution} onChange={e => setResolution(e.target.value)} className="w-full bg-[#0F172A] border border-slate-700 rounded-md p-3 text-sm focus:ring-1 focus:ring-[#D9FF00] min-h-[100px]" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Downtime (Minutes)</Label>
          <Input type="number" required value={downtime} onChange={e => setDowntime(e.target.value)} className="bg-[#0F172A] border-slate-700" />
        </div>
      </div>

      <hr className="border-slate-800" />

      {/* PARTS STAGING SECTION */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="w-4 h-4 text-[#D9FF00]" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Parts Replaced</h3>
        </div>

        {/* Dropdown & Add Button */}
        <div className="flex items-end gap-3 mb-4 bg-[#131C31] p-4 rounded-lg border border-slate-800">
          <div className="flex-1">
            <Label className="text-xs text-slate-400 block mb-1">Select from Machine BOM</Label>
            <select 
              value={selectedPartId} 
              onChange={e => setSelectedPartId(e.target.value)}
              className="w-full bg-[#0F172A] border border-slate-700 rounded-md h-9 px-3 text-sm focus:ring-1 focus:ring-[#D9FF00]"
            >
              <option value="">-- Choose Part --</option>
              {bomParts.map(part => (
                <option key={part.id} value={part.id}>
                  {part.part_name} {part.part_number ? `(${part.part_number})` : ''} - [Stock: {part.stock_level}]
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <Label className="text-xs text-slate-400 block mb-1">Qty</Label>
            <Input type="number" min="1" value={selectedQty} onChange={e => setSelectedQty(e.target.value)} className="bg-[#0F172A] border-slate-700 h-9" />
          </div>
          <Button type="button" onClick={handleStagePart} disabled={!selectedPartId} className="bg-slate-700 hover:bg-slate-600 text-white h-9">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>

        {/* Dynamic Staging Table */}
        {stagedParts.length > 0 && (
          <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900 text-xs text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Part</th>
                  <th className="px-4 py-3 w-32">Qty Used</th>
                  <th className="px-4 py-3 w-16 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {stagedParts.map(part => (
                  <tr key={part.partId} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium">
                      {part.name} <span className="text-slate-500 font-normal text-xs ml-2">{part.number}</span>
                    </td>
                    <td className="px-4 py-3">
                      {/* INLINE QUANTITY EDITING */}
                      <Input 
                        type="number" 
                        min="1"
                        value={part.qty} 
                        onChange={e => handleUpdateStagedQty(part.partId, e.target.value)}
                        className="bg-[#131C31] border-slate-700 h-8 text-center w-20"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        type="button" 
                        onClick={() => handleRemoveStagedPart(part.partId)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 mx-auto" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full bg-[#D9FF00] text-black hover:bg-[#c8eb00] font-bold h-10 mt-6">
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : existingReport ? 'Update Report & Inventory' : 'Publish Report & Deduct Inventory'}
      </Button>
    </form>
  );
}