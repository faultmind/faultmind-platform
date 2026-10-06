'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { VoiceRecordButton } from '@/components/VoiceRecordButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, FileText } from 'lucide-react';

export default function MaintenanceChat({ 
  machineId, 
  initialMachineName, 
  sessionId, 
  userId, 
  onDraftSaved 
}) {
  const { messages, input, setInput, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: { machineId, sessionId },
  });

  const [isExtracting, setIsExtracting] = useState(false);

  // Calls the new extraction endpoint and passes the draft to the parent tab
  const handleExport = async () => {
    setIsExtracting(true);
    try {
      const response = await fetch('/api/reports/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          machineId,
          sessionId,
          userId
        })
      });
      
      const data = await response.json();
      
      if (data.success && onDraftSaved) {
        // Trigger the parent component to switch to the Reports tab
        onDraftSaved(data.report); 
      } else {
        console.error('Extraction failed:', data.error);
      }
    } catch (error) {
      console.error("Failed to export report", error);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0F172A] text-slate-100">
      {/* 1. Header with Export Button */}
      <header className="p-3 border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur flex justify-between items-center">
        <div>
          <h1 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            {initialMachineName || 'Diagnostic Session'}
          </h1>
          <p className="text-xs text-slate-400">Live Diagnostic & Shift Handover</p>
        </div>
        
        <Button 
          onClick={handleExport} 
          disabled={isExtracting || messages.length < 2}
          className="bg-slate-800 text-[#D9FF00] hover:bg-slate-700 border border-slate-700 text-xs h-8 px-3"
        >
          {isExtracting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 mr-2" />
          )}
          {isExtracting ? 'Drafting...' : 'Export to Report'}
        </Button>
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
          <div className="text-xs text-[#D9FF00] animate-pulse">Analyzing system state...</div>
        )}
      </div>

      {/* 3. Sticky Bottom Deck (Cleaned up) */}
      <div className="border-t border-slate-800 bg-[#0F172A] p-3">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          
          <VoiceRecordButton 
            onTranscriptionComplete={(text) => {
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