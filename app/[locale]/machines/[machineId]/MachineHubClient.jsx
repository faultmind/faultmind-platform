'use client';

import { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, Send, Activity, FileText, Wrench, Package, MessageSquare, Bot, User } from 'lucide-react';

export default function MachineHubClient({ machine }) {
  const [activeTab, setActiveTab] = useState('chat');
  const chatBottomRef = useRef(null);

  // Native React state replaces useChat
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'work-orders', label: 'Work Orders', icon: Wrench },
    { id: 'parts', label: 'Spare Parts', icon: Package },
  ];

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!text.trim() || isLoading) return;
    
    // Add user message to UI immediately
    const userMessage = { id: Date.now(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setText('');
    setIsLoading(true);

    // Create a blank placeholder for the AI's incoming response
    const botMessageId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: botMessageId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          machineId: machine?.id || 'unknown',
          // Send only standard roles and content to backend
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })) 
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        alert(`🚨 BACKEND ERROR:\n\n${errorText.substring(0, 150)}`);
        setIsLoading(false);
        return;
      }

      // Natively parse the raw text stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) => prev.map(msg => 
            msg.id === botMessageId ? { ...msg, content: msg.content + chunk } : msg
          ));
        }
      }
    } catch (err) {
      alert(`🚨 STREAM ERROR:\n\n${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0F172A]">
      <header className="px-8 pt-8 pb-0 bg-[#131C31] border-b border-slate-800 shrink-0">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {machine?.name || 'Machine'}
              </h1>
              <span className="px-2.5 py-1 rounded-md bg-[#D9FF00]/10 text-[#D9FF00] text-xs font-semibold border border-[#D9FF00]/20 flex items-center gap-1.5">
                <Activity size={12} /> Online
              </span>
            </div>
            <p className="text-sm text-slate-400 font-mono mt-2">
              Controller: {machine?.brand_model || 'Not specified'}
            </p>
          </div>
        </div>

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

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#131C31] border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                  <Activity size={16} className="text-[#D9FF00]" />
                </div>
                <div className="flex-1 text-slate-300 leading-relaxed bg-[#131C31] p-4 rounded-2xl rounded-tl-none border border-slate-800">
                  <p>I have loaded the diagnostic context for <span className="font-semibold text-white">{machine?.name}</span> ({machine?.brand_model || 'Standard Controller'}). What issue or fault code are you seeing on the floor?</p>
                </div>
              </div>

              {messages.map((m) => (
                <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role !== 'user' && (
                    <div className="w-8 h-8 rounded-full bg-[#131C31] border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                      <Bot size={16} className="text-[#D9FF00]" />
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] p-4 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#D9FF00] text-slate-900 font-medium rounded-tr-none'
                      : 'bg-[#131C31] text-slate-200 border border-slate-800 rounded-tl-none'
                  }`}>
                    {m.content}
                  </div>

                  {m.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                      <User size={16} className="text-slate-300" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-4 items-center">
                  <div className="w-8 h-8 rounded-full bg-[#131C31] border border-slate-700 flex items-center justify-center shrink-0">
                    <Activity size={16} className="text-[#D9FF00] animate-spin" />
                  </div>
                  <span className="text-xs text-slate-500 font-mono animate-pulse">
                    FaultMind is analyzing schematics and fault trees...
                  </span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            <div className="p-6 shrink-0 bg-[#0F172A]">
              <form 
                onSubmit={handleSend}
                className="relative flex items-end bg-[#1E293B] border border-slate-700 rounded-2xl p-2 shadow-lg focus-within:border-slate-500 transition-colors"
              >
                <button type="button" className="p-3 text-slate-400 hover:text-[#D9FF00] transition-colors rounded-xl hover:bg-slate-800">
                  <Paperclip size={20} />
                </button>
                
                <textarea 
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the fault, upload a schematic, or paste PLC logic..."
                  className="w-full max-h-48 bg-transparent text-slate-200 placeholder-slate-500 resize-none outline-none py-3 px-2 font-sans"
                />

                <div className="flex items-center gap-1 pb-1 pr-1">
                  <button type="button" className="p-2.5 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-slate-800">
                    <Mic size={20} />
                  </button>
                  <button 
                    type="submit"
                    disabled={!text.trim() || isLoading}
                    className="p-2.5 bg-[#D9FF00] hover:bg-[#c2e600] disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Send size={18} className="translate-x-0.5" />
                  </button>
                </div>
              </form>

              <div className="text-center mt-3">
                <span className="text-xs text-slate-500">
                  FaultMind AI can make mistakes. Verify critical logic before forcing I/O.
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && <div className="p-8 text-slate-400">Indexed manuals and schematics will appear here.</div>}
        {activeTab === 'work-orders' && <div className="p-8 text-slate-400">Maintenance history and voice-logged reports will appear here.</div>}
        {activeTab === 'parts' && <div className="p-8 text-slate-400">Compatible spare parts and inventory counts will appear here.</div>}
      </div>
    </div>
  );
}