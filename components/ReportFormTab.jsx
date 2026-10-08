'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VoiceRecordButton } from './VoiceRecordButton';
import { Loader2 } from 'lucide-react';

export default function ReportFormTab({ draftData, machineId }) {
  const [formData, setFormData] = useState({
    id: '',
    root_cause: '',
    resolution: '',
    parts_replaced: '',
    part_price: '',
    downtime_minutes: '',
    technicians: '',
  });
  const [isPublishing, setIsPublishing] = useState(false);

  // Pre-fill the form whenever new draft data arrives from the AI extraction
  useEffect(() => {
    if (draftData) {
      setFormData({
        id: draftData.id || '',
        root_cause: draftData.root_cause || '',
        resolution: draftData.resolution || '',
        parts_replaced: draftData.parts_replaced || '',
        part_price: draftData.part_price || '',
        downtime_minutes: draftData.downtime_minutes || '',
        technicians: draftData.technicians || '',
      });
    }
  }, [draftData]);

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!machineId) return alert('Machine ID is missing.');
    
    setIsPublishing(true);
    try {
      // Map the frontend state to match the exact keys expected by the backend
      const payload = {
        machineId: machineId,
        rootCause: formData.root_cause,
        resolution: formData.resolution,
        partsReplaced: formData.parts_replaced,
        partPrice: formData.part_price,
        downtime: formData.downtime_minutes,
        technicians: formData.technicians
      };

      const response = await fetch('/api/reports/publish', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        alert('Shift report officially logged!');
        // Clear the form after successful submission
        setFormData({
          id: '', root_cause: '', resolution: '', parts_replaced: '', 
          part_price: '', downtime_minutes: '', technicians: ''
        });
      } else {
        const errorData = await response.json();
        alert(`Failed to publish: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to publish', error);
      alert(`Network Error: ${error.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 text-slate-100">
      <div className="mb-8 border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-bold text-white tracking-tight">Shift Maintenance Log</h2>
        <p className="text-sm text-slate-400 mt-1">Review AI-extracted details or manually dictate your repair report.</p>
      </div>

      <form onSubmit={handlePublish} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-5">
            <div>
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Root Cause</Label>
              <Input 
                value={formData.root_cause}
                onChange={e => setFormData({...formData, root_cause: e.target.value})}
                className="bg-[#131C31] border-slate-700 mt-1.5 focus-visible:ring-[#D9FF00]" 
                placeholder="e.g., VFD Overvoltage Trip"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Resolution Steps</Label>
                <VoiceRecordButton 
                  onTranscriptionComplete={(text) => 
                    setFormData(prev => ({ ...prev, resolution: (prev.resolution + ' ' + text).trim() }))
                  } 
                />
              </div>
              <Textarea 
                value={formData.resolution}
                onChange={e => setFormData({...formData, resolution: e.target.value})}
                className="bg-[#131C31] border-slate-700 min-h-[120px] focus-visible:ring-[#D9FF00] resize-y" 
                placeholder="Describe the steps taken to fix the issue..."
              />
            </div>
            
            <div>
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Parts Replaced</Label>
              <Input 
                value={formData.parts_replaced}
                onChange={e => setFormData({...formData, parts_replaced: e.target.value})}
                className="bg-[#131C31] border-slate-700 mt-1.5 focus-visible:ring-[#D9FF00]" 
                placeholder="e.g., Cooling Fan 24V"
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            <div>
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Part Price</Label>
              <Input 
                type="number"
                step="0.01"
                value={formData.part_price}
                onChange={e => setFormData({...formData, part_price: e.target.value})}
                className="bg-[#131C31] border-slate-700 mt-1.5 focus-visible:ring-[#D9FF00]" 
                placeholder="0.00"
              />
            </div>

            <div>
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Downtime (Minutes)</Label>
              <Input 
                type="number"
                value={formData.downtime_minutes}
                onChange={e => setFormData({...formData, downtime_minutes: e.target.value})}
                className="bg-[#131C31] border-slate-700 mt-1.5 focus-visible:ring-[#D9FF00]" 
                placeholder="45"
              />
            </div>

            <div>
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Technicians</Label>
              <Input 
                value={formData.technicians}
                onChange={e => setFormData({...formData, technicians: e.target.value})}
                className="bg-[#131C31] border-slate-700 mt-1.5 focus-visible:ring-[#D9FF00]" 
                placeholder="e.g., M. Madi, Ali"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-6 border-t border-slate-800">
          <Button 
            type="submit" 
            disabled={isPublishing || !machineId}
            className="bg-[#D9FF00] text-black hover:bg-[#c8eb00] font-bold px-8 h-11"
          >
            {isPublishing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
            Publish Official Log
          </Button>
        </div>
      </form>
    </div>
  );
}