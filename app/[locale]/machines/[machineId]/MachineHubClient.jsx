'use client';

import { useState } from 'react';
import { Paperclip, Mic, Send, Activity, FileText, Wrench, Package, MessageSquare } from 'lucide-react';

export default function MachineHubClient({ machine }) {
  const [activeTab, setActiveTab] = useState('chat');
  const [input, setInput] = useState('');

  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'work-orders', label: 'Work Orders', icon: Wrench },
    { id: 'parts', label: 'Spare Parts', icon: Package },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#0F172A]">
      
      {/* 1. PINNED MACHINE HEADER */}
      <header className="px-8 pt-8 pb-0 bg-[#131C31] border-b border-slate-800 shrink-0">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {machine.name}
              </h1>
              <span className="px-2.5 py-1 rounded-md bg-[#D9FF00]/10 text-[#D9FF00] text-xs font-semibold border border-[#D9FF00]/20 flex items-center gap-1.5">
                <Activity size={12} /> Online
              </span>
            </div>
            <p className="text-sm text-slate-400 font-mono mt-2">
              Controller: {machine.brand_model || 'Not specified'}
            </p>
          </div>
        </div>

        {/* 2. TAB NAVIGATION */}
        <nav className="flex gap-8">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                  isActive ? 'text-[#D9FF00]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#D9FF00] shadow-[0_0_8px_rgba(217,255,0,0.5)]"></div>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* 3. DYNAMIC CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative">
        
        {/* --- CHAT TAB --- */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
            
            {/* Chat Feed */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#131C31] border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                  <Activity size={16} className="text-[#D9FF00]" />
                </div>
                <div className="flex-1 text-slate-300 leading-relaxed bg-[#131C31] p-4 rounded-2xl rounded-tl-none border border-slate-800">
                  <p>I have loaded the documentation for {machine.name}. What issue are you seeing on the floor?</p>
                </div>
              </div>
            </div>

            {/* Chat Input */}
            <div className="p-6 shrink-0 bg-[#0F172A]">
              <div className="relative flex items-end bg-[#1E293B] border border-slate-700 rounded-2xl p-2 shadow-lg focus-within:border-slate-500 transition-colors">
                
                <button className="p-3 text-slate-400 hover:text-[#D9FF00] transition-colors rounded-xl hover:bg-slate-800">
                  <Paperclip size={20} />
                </button>
                
                <textarea 
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe the fault, upload a schematic, or paste PLC logic..."
                  className="w-full max-h-48 bg-transparent text-slate-200 placeholder-slate-500 resize-none outline-none py-3 px-2 font-sans"
                />

                <div className="flex items-center gap-1 pb-1 pr-1">
                  <button className="p-2.5 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-slate-800">
                    <Mic size={20} />
                  </button>
                  <button 
                    disabled={!input.trim()}
                    className="p-2.5 bg-[#D9FF00] hover:bg-[#c2e600] disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 rounded-xl transition-colors"
                  >
                    <Send size={18} className="translate-x-0.5" />
                  </button>
                </div>
              </div>
              <div className="text-center mt-3">
                <span className="text-xs text-slate-500">FaultMind AI can make mistakes. Verify critical logic before forcing I/O.</span>
              </div>
            </div>
          </div>
        )}

        {/* --- OTHER TABS --- */}
        {activeTab === 'documents' && <div className="p-8 text-slate-400">Indexed manuals and schematics will appear here.</div>}
        {activeTab === 'work-orders' && <div className="p-8 text-slate-400">Maintenance history and voice-logged reports will appear here.</div>}
        {activeTab === 'parts' && <div className="p-8 text-slate-400">Compatible spare parts and inventory counts will appear here.</div>}
      </div>
    </div>
  );
}