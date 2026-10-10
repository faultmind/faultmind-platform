'use client';

import { useState, useEffect, useCallback } from 'react';
import { PackageSearch, Plus, AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

export default function GlobalInventoryPage() {
  const [parts, setParts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [formData, setFormData] = useState({
    partName: '', partNumber: '', stockLevel: '', minThreshold: '2', price: '', binLocation: ''
  });

  const fetchParts = useCallback(async () => {
    try {
      const res = await fetch('/api/parts-catalog');
      if (res.ok) setParts(await res.json());
    } catch (error) {
      console.error('Failed to fetch catalog:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  const handleAddPart = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!formData.partName) return;
    setIsAdding(true);

    try {
      const res = await fetch('/api/parts-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setFormData({ partName: '', partNumber: '', stockLevel: '', minThreshold: '2', price: '', binLocation: '' });
        fetchParts();
      } else {
        const errData = await res.json();
        setErrorMessage(`Database Rejection: ${errData.error}`);
      }
    } catch (error) {
      setErrorMessage(`Network Error: ${error.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] p-8 text-slate-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <PackageSearch className="w-6 h-6 text-[#D9FF00]" />
            <h1 className="text-3xl font-bold text-white tracking-tight">Master Parts Catalog</h1>
          </div>
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            &larr; Back to Dashboard
          </Link>
        </div>

        {errorMessage && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 text-red-400 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        {/* Quick Add Form */}
        <div className="bg-[#131C31] border border-slate-800 rounded-xl p-6 mb-8">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Register New Component</h3>
          <form onSubmit={handleAddPart} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2">
              <Label className="text-xs text-slate-400 mb-1 block">Part Name *</Label>
              <Input required value={formData.partName} onChange={e => setFormData({...formData, partName: e.target.value})} className="bg-[#0F172A] border-slate-700 h-9" placeholder="Siemens 16A Contactor" />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1 block">Part Number</Label>
              <Input value={formData.partNumber} onChange={e => setFormData({...formData, partNumber: e.target.value})} className="bg-[#0F172A] border-slate-700 h-9" placeholder="3RT201" />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1 block">Location</Label>
              <Input value={formData.binLocation} onChange={e => setFormData({...formData, binLocation: e.target.value})} className="bg-[#0F172A] border-slate-700 h-9" placeholder="Cab 4, Bin B" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-slate-400 mb-1 block">Qty</Label>
                <Input type="number" value={formData.stockLevel} onChange={e => setFormData({...formData, stockLevel: e.target.value})} className="bg-[#0F172A] border-slate-700 h-9" placeholder="0" />
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1 block">Min</Label>
                <Input type="number" value={formData.minThreshold} onChange={e => setFormData({...formData, minThreshold: e.target.value})} className="bg-[#0F172A] border-slate-700 h-9" />
              </div>
            </div>
            <Button type="submit" disabled={isAdding || !formData.partName} className="bg-[#D9FF00] text-black hover:bg-[#c8eb00] h-9 font-bold w-full">
              {isAdding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
            </Button>
          </form>
        </div>

        {/* Master Inventory Table */}
        <div className="bg-[#131C31] border border-slate-800 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 text-[#D9FF00] animate-spin" /></div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Part Description</th>
                  <th className="px-6 py-4 font-semibold">Part Number</th>
                  <th className="px-6 py-4 font-semibold">Location</th>
                  <th className="px-6 py-4 font-semibold">Stock Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {parts.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">Master catalog is empty.</td></tr>
                ) : (
                  parts.map((part) => (
                    <tr key={part.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-200">{part.part_name}</td>
                      <td className="px-6 py-4 text-slate-400 font-mono text-xs">{part.part_number || '-'}</td>
                      <td className="px-6 py-4 text-slate-400">
                        {part.bin_location ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {part.bin_location}</span> : '-'}
                      </td>
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
          )}
        </div>
      </div>
    </div>
  );
}