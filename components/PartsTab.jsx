'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function PartsTab({ machineId }) {
  const [parts, setParts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  const [formData, setFormData] = useState({
    partName: '', partNumber: '', stockLevel: '', price: ''
  });

  const fetchParts = useCallback(async () => {
    if (!machineId) return;
    try {
      const res = await fetch(`/api/parts?machineId=${machineId}`);
      if (res.ok) setParts(await res.json());
    } catch (error) {
      console.error('Failed to fetch parts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  const handleAddPart = async (e) => {
    e.preventDefault();
    if (!formData.partName) return;
    setIsAdding(true);

    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, machineId })
      });

      if (res.ok) {
        setFormData({ partName: '', partNumber: '', stockLevel: '', price: '' });
        fetchParts(); // Refresh table
      }
    } catch (error) {
      console.error('Add part error:', error);
    } finally {
      setIsAdding(false);
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
        <h2 className="text-2xl font-bold text-white tracking-tight">Parts Inventory</h2>
      </div>

      {/* Quick Add Form */}
      <div className="bg-[#131C31] border border-slate-800 rounded-xl p-6 mb-8">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Add New Part</h3>
        <form onSubmit={handleAddPart} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-slate-400 mb-1 block">Part Name *</Label>
            <Input 
              required
              value={formData.partName}
              onChange={e => setFormData({...formData, partName: e.target.value})}
              className="bg-[#0F172A] border-slate-700 h-9" 
              placeholder="e.g. Proximity Sensor"
            />
          </div>
          <div className="w-40">
            <Label className="text-xs text-slate-400 mb-1 block">Part Number</Label>
            <Input 
              value={formData.partNumber}
              onChange={e => setFormData({...formData, partNumber: e.target.value})}
              className="bg-[#0F172A] border-slate-700 h-9" 
              placeholder="PRX-900"
            />
          </div>
          <div className="w-24">
            <Label className="text-xs text-slate-400 mb-1 block">Qty</Label>
            <Input 
              type="number"
              value={formData.stockLevel}
              onChange={e => setFormData({...formData, stockLevel: e.target.value})}
              className="bg-[#0F172A] border-slate-700 h-9" 
              placeholder="0"
            />
          </div>
          <div className="w-32">
            <Label className="text-xs text-slate-400 mb-1 block">Unit Price ($)</Label>
            <Input 
              type="number"
              step="0.01"
              value={formData.price}
              onChange={e => setFormData({...formData, price: e.target.value})}
              className="bg-[#0F172A] border-slate-700 h-9" 
              placeholder="0.00"
            />
          </div>
          <Button 
            type="submit" 
            disabled={isAdding || !formData.partName}
            className="bg-[#D9FF00] text-black hover:bg-[#c8eb00] h-9 px-4 font-bold"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add Part
          </Button>
        </form>
      </div>

      {/* Inventory Table */}
      <div className="bg-[#131C31] border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-semibold">Part Description</th>
              <th className="px-6 py-4 font-semibold">Part Number</th>
              <th className="px-6 py-4 font-semibold">Stock Level</th>
              <th className="px-6 py-4 font-semibold">Unit Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {parts.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                  No parts indexed for this machine yet.
                </td>
              </tr>
            ) : (
              parts.map((part) => (
                <tr key={part.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-200">{part.part_name}</td>
                  <td className="px-6 py-4 text-slate-400 font-mono text-xs">{part.part_number || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {part.stock_level <= 2 ? (
                      <span className="flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2.5 py-1 rounded-md w-fit font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {part.stock_level} (Low)
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium px-2.5">{part.stock_level}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    {part.price ? `$${parseFloat(part.price).toFixed(2)}` : '-'}
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