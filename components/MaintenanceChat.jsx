'use client';

import { VoiceRecordButton } from '@/components/VoiceRecordButton';
import { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MaintenanceChat({ machineId, initialMachineName }) {
  const { messages, input, setInput, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: { machineId },
  });

  // Local editable form state
  const [formData, setFormData] = useState({
    machine_id: initialMachineName || '',
    root_cause: '',
    parts_replaced: '',
    downtime_minutes: '',
    technicians: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync AI tool call arguments directly into the form fields
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.toolInvocations) {
      for (const invocation of lastMessage.toolInvocations) {
        if (invocation.toolName === 'updateReportForm' && invocation.args) {
          const args = invocation.args;
          setFormData((prev) => ({
            ...prev,
            machine_id: args.machine_id ?? prev.machine_id,
            root_cause: args.root_cause ?? prev.root_cause,
            parts_replaced: Array.isArray(args.parts_replaced)
              ? args.parts_replaced.join(', ')
              : (args.parts_replaced ?? prev.parts_replaced),
            downtime_minutes: args.downtime_minutes !== undefined
              ? String(args.downtime_minutes)
              : prev.downtime_minutes,
            technicians: Array.isArray(args.technicians)
              ? args.technicians.join(', ')
              : (args.technicians ?? prev.technicians),
          }));
        }
      }
    }
  }, [messages]);

  // Calculate field completion count for the visual progress pill
  const filledFieldsCount = [
    formData.machine_id,
    formData.root_cause,
    formData.parts_replaced,
    formData.downtime_minutes,
    formData.technicians,
  ].filter((val) => val && String(val).trim().length > 0).length;

  // Final direct save to Supabase
  const handleSaveReport = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/reports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: machineId,
          machine_name: formData.machine_id,
          root_cause: formData.root_cause,
          parts_replaced: formData.parts_replaced
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean),
          downtime_minutes: Number(formData.downtime_minutes) || 0,
          technicians: formData.technicians
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (response.ok) {
        setDrawerOpen(false);
        // Clear or show success toast
      }
    } catch (err) {
      console.error('Report submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0F172A] text-slate-100">
      {/* 1. Header */}
      <header className="p-3 border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur flex justify-between items-center">
        <div>
          <h1 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            {initialMachineName || 'Diagnostic Session'}
          </h1>
          <p className="text-xs text-slate-400">Live Diagnostic & Shift Handover</p>
        </div>
      </header>

      {/* 2. Chat Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'bg-slate-900/90 text-slate-200 border border-slate-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="text-xs text-yellow-400 animate-pulse">Analyzing system state...</div>
        )}
      </div>

      {/* 3. Sticky Bottom Deck */}
      <div className="border-t border-slate-800 bg-[#0F172A] p-3 space-y-2">
        {/* Progress Pill Drawer Trigger */}
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <button className="w-full py-2 px-3 rounded-md bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex justify-between items-center text-xs font-medium transition-colors">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#D9FF00]" />
                <span className="text-slate-300">Shift Log Draft</span>
              </span>
              <span className="text-[#D9FF00] font-mono">
                {filledFieldsCount}/5 fields ready ▲
              </span>
            </button>
          </DrawerTrigger>

          <DrawerContent className="bg-[#0F172A] border-slate-800 text-slate-100 p-4 max-h-[85vh]">
            <DrawerHeader className="p-0 mb-4 text-left">
              <DrawerTitle className="text-base text-[#D9FF00]">
                Verify Maintenance Report
              </DrawerTitle>
              <DrawerDescription className="text-xs text-slate-400">
                Review extracted parameters before committing to the plant database.
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-3 overflow-y-auto pr-1">
              <div>
                <Label className="text-xs text-slate-300">Target Machine / Line</Label>
                <Input
                  value={formData.machine_id}
                  onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
                  placeholder="e.g., Extruder Line 3"
                  className="bg-slate-900 border-slate-700 text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs text-slate-300">Root Cause & Resolution</Label>
                <Input
                  value={formData.root_cause}
                  onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })}
                  placeholder="e.g., Overload relay trip reset, adjusted tension"
                  className="bg-slate-900 border-slate-700 text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs text-slate-300">Parts Swapped (SKU / Description)</Label>
                <Input
                  value={formData.parts_replaced}
                  onChange={(e) => setFormData({ ...formData, parts_replaced: e.target.value })}
                  placeholder="e.g., Siemens 3RT2026-1BB40, 24V PSU"
                  className="bg-slate-900 border-slate-700 text-sm mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-300">Downtime (Minutes)</Label>
                  <Input
                    type="number"
                    value={formData.downtime_minutes}
                    onChange={(e) => setFormData({ ...formData, downtime_minutes: e.target.value })}
                    placeholder="25"
                    className="bg-slate-900 border-slate-700 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-300">Technicians</Label>
                  <Input
                    value={formData.technicians}
                    onChange={(e) => setFormData({ ...formData, technicians: e.target.value })}
                    placeholder="e.g., M. Madi, Ali"
                    className="bg-slate-900 border-slate-700 text-sm mt-1"
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveReport}
                disabled={isSubmitting}
                className="w-full bg-[#D9FF00] hover:bg-[#c8eb00] text-slate-950 font-bold text-sm mt-2"
              >
                {isSubmitting ? 'Saving...' : 'Confirm & Commit to Database'}
              </Button>
            </div>
          </DrawerContent>
        </Drawer>

        {/* Text Submission Bar */}
        {/* Text Submission Bar */}
<form onSubmit={handleSubmit} className="flex gap-2 items-center">
  
  {/* The new Voice Record Button */}
  <VoiceRecordButton 
    onTranscriptionComplete={(text) => {
      // Appends the transcribed text to anything already in the input box
      setInput((prev) => (prev + ' ' + text).trim());
    }} 
  />

  <Input
    value={input}
    onChange={handleInputChange}
    placeholder="Type or dictate fault..."
    className="flex-1 bg-slate-900 border-slate-700 text-sm focus-visible:ring-[#D9FF00]"
  />
  
  <Button
    type="submit"
    disabled={isLoading || !input?.trim()}
    className="bg-[#D9FF00] hover:bg-[#c8eb00] text-slate-950 font-semibold px-4 text-xs"
  >
    Send
  </Button>
</form>
      </div>
    </div>
  );
}