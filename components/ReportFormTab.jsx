'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function ReportForm({ machineId, sessionId = null, existingReport = null, onSuccess }) {
  const [rootCause, setRootCause] = useState(existingReport?.root_cause || '');
  const [resolution, setResolution] = useState(existingReport?.resolution || '');
  const [downtime, setDowntime] = useState(existingReport?.downtime_minutes || '');
  const [technicians, setTechnicians] = useState(existingReport?.technicians || '');
  
  const [bomParts, setBomParts] = useState([]);
  const [stagedParts, setStagedParts] = useState(existingReport?.used_parts || []);
  
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchBOM() {
      if (!machineId) return;
      try {
        const res = await fetch(`/api/parts?machineId=${machineId}`);
        if (res.ok) setBomParts(await res.json());
      } catch (err) {
        console.error('Failed to load machine BOM:', err);
      }
    }
    fetchBOM();
  }, [machineId]);

  const handleStagePart = (e) => {
    e.preventDefault();
    if (!selectedPartId || selectedQty < 1) return;

    const partDetails = bomParts.find(p => p.id === selectedPartId);
    if (!partDetails) return;

    setStagedParts(prev => {
      const existing = prev.find(p => p.partId === selectedPartId);
      if (existing) {
        return prev.map(p => 
          p.partId === selectedPartId 
            ? { ...p, qty: p.qty + parseInt(selectedQty, 10) } 
            : p
        );
      }
      return [...prev, { 
        partId: partDetails.id, 
        name: partDetails.part_name, 
        number: partDetails.part_number,
        qty: parseInt(selectedQty, 10),
        maxStock: partDetails.stock_level 
      }];
    });

    setSelectedPartId('');
    setSelectedQty(1);
  };

  const handleUpdateStagedQty = (partId, newQty) => {
    const qty = Math.max(1, parseInt(newQty, 10) || 1);
    setStagedParts(prev => prev.map(p => p.partId === partId ? { ...p, qty } : p));
  };

  const handleRemoveStagedPart = (partId) => {
    setStagedParts(prev => prev.filter(p => p.partId !== partId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const payload = {
      id: existingReport?.id,
      machine_id: machineId,
      session_id: sessionId,
      root_cause: rootCause,
      resolution: resolution,
      downtime_minutes: parseInt(downtime, 10) || 0,
      technicians: technicians || 'Duty Engineer',
      used_parts: stagedParts.map(p => ({
        partId: p.partId,
        name: p.name,
        number: p.number,
        qty: p.qty
      }))
    };

    try {
      const method = existingReport ? 'PUT' : 'POST';
      const res = await fetch('/api/reports', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        let message = 'Server error occurred';
        try {
          const parsed = JSON.parse(text);
          message = parsed.error || message;
        } catch {
          message = text.slice(0, 150) || `HTTP error ${res.status}`;
        }
        throw new Error(message);
      }

      if (onSuccess) onSuccess();
      
    } catch (err) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <form onSubmit={handleSubmit} className="space-y-8 text-slate-200">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 text-red-400 rounded-lg flex items-center gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 space-y-2">
            <Label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Root Cause *</Label>
            <Input 
              required 
              value={rootCause} 
              onChange={e => setRootCause(e.target.value)} 
              className="bg-[#0F172A] border-slate-700 h-11 px-3 text-sm focus:border-[#D9FF00]" 
              placeholder="e.g. Inverter drive DC bus overvoltage trip"
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Resolution *</Label>
            <textarea 
              required 
              value={resolution} 
              onChange={e => setResolution(e.target.value)} 
              className="w-full bg-[#0F172A] border border-slate-700 rounded-md p-3 text-sm focus:outline-none focus:border-[#D9FF00] min-h-[110px]" 
              placeholder="Detail actions taken to restore operation..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Downtime (Minutes) *</Label>
            <Input 
              type="number" 
              required 
              value={downtime} 
              onChange={e => setDowntime(e.target.value)} 
              className="bg-[#0F172A] border-slate-700 h-11 px-3 text-sm" 
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Technician(s)</Label>
            <Input 
              value={technicians} 
              placeholder="e.g. Electrical Maintenance Team"
              onChange={e => setTechnicians(e.target.value)} 
              className="bg-[#0F172A] border-slate-700 h-11 px-3 text-sm" 
            />
          </div>
        </div>

        <hr className="border-slate-800 my-8" />

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#D9FF00]" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Parts Replaced</h3>
          </div>

          <div className="flex flex-col sm:flex-row items-end gap-3 bg-[#131C31] p-5 rounded-xl border border-slate-800">
            <div className="flex-1 w-full space-y-2">
              <Label className="text-xs text-slate-400">Select from Machine BOM</Label>
              <select 
                value={selectedPartId} 
                onChange={e => setSelectedPartId(e.target.value)}
                className="w-full bg-[#0F172A] border border-slate-700 rounded-md h-11 px-3 text-sm focus:border-[#D9FF00] outline-none"
              >
                <option value="">-- Choose Part --</option>
                {bomParts.map(part => (
                  <option key={part.id} value={part.id}>
                    {part.part_name} {part.part_number ? `(${part.part_number})` : ''} - [Stock: {part.stock_level}]
                  </option>
                ))}
              </select>
            </div>
            
            <div className="w-full sm:w-28 space-y-2">
              <Label className="text-xs text-slate-400">Qty</Label>
              <Input 
                type="number" 
                min="1" 
                value={selectedQty} 
                onChange={e => setSelectedQty(e.target.value)} 
                className="bg-[#0F172A] border-slate-700 h-11 text-center" 
              />
            </div>

            <Button 
              type="button" 
              onClick={handleStagePart} 
              disabled={!selectedPartId} 
              className="bg-slate-700 hover:bg-slate-600 text-white h-11 px-5 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          {stagedParts.length > 0 && (
            <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden mt-4">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase">
                  <tr>
                    <th className="px-5 py-3">Part Description</th>
                    <th className="px-5 py-3 w-32 text-center">Qty Used</th>
                    <th className="px-5 py-3 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {stagedParts.map(part => (
                    <tr key={part.partId} className="hover:bg-slate-800/20">
                      <td className="px-5 py-3 font-medium">
                        {part.name} <span className="text-slate-500 font-mono text-xs ml-2">{part.number || ''}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Input 
                          type="number" 
                          min="1"
                          value={part.qty} 
                          onChange={e => handleUpdateStagedQty(part.partId, e.target.value)}
                          className="bg-[#131C31] border-slate-700 h-8 text-center w-20 mx-auto"
                        />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button 
                          type="button" 
                          onClick={() => handleRemoveStagedPart(part.partId)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
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

        <Button 
          type="submit" 
          disabled={isSubmitting} 
          className="w-full bg-[#D9FF00] text-black hover:bg-[#c8eb00] font-bold h-11 text-base mt-6"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : existingReport ? (
            'Update Report & Reconcile Inventory'
          ) : (
            'Publish Report & Deduct Inventory'
          )}
        </Button>
      </form>
    </div>
  );
}