'use client';

import { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, Send, Activity, FileText, Wrench, Package, MessageSquare, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function MachineHubClient({ machine }) {
  const [activeTab, setActiveTab] = useState('chat');
  const chatBottomRef = useRef(null);

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
    
    const userMessage = { id: Date.now(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setText('');
    setIsLoading(true);

    const botMessageId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: botMessageId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          machineId: machine?.id || 'unknown',
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })) 
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        alert(`🚨 BACKEND ERROR:\n\n${errorText.substring(0, 150)}`);
        setIsLoading(false);
        return;
      }

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
<header className="px-6 pt-3 pb-0 bg-[#131C31] border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white tracking-tight">
              {machine?.name || 'Machine'}
            </h1>
            <span className="px-1.5 py-0.5 rounded bg-[#D9FF00]/10 text-[#D9FF00] text-[10px] font-bold uppercase tracking-wider border border-[#D9FF00]/20 flex items-center gap-1">
              <Activity size={10} /> Online
            </span>
            <span className="text-xs text-slate-400 font-mono border-l border-slate-700 pl-3 ml-1">
              {machine?.brand_model || 'Not specified'}
            </span>
          </div>
        </div>

        <nav className="flex gap-6">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-2.5 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                  isActive ? 'text-[#D9FF00]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
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
                  
                  <div className={`max-w-[80%] p-4 rounded-2xl leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#D9FF00] text-slate-900 font-medium rounded-tr-none whitespace-pre-wrap'
                      : 'bg-[#131C31] text-slate-200 border border-slate-800 rounded-tl-none overflow-x-auto'
                  }`}>
                    {m.role === 'user' ? (
                      m.content
                    ) : (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />,
                          li: ({node, ...props}) => <li className="mb-1" {...props} />,
                          h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 text-white mt-6" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-3 text-white mt-5" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-md font-bold mb-2 text-white mt-4" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-semibold text-[#D9FF00]" {...props} />,
                          table: ({node, ...props}) => <div className="overflow-x-auto mb-4"><table className="min-w-full text-sm border-collapse" {...props} /></div>,
                          th: ({node, ...props}) => <th className="border border-slate-700 bg-slate-800 px-3 py-2 text-left font-semibold text-white" {...props} />,
                          td: ({node, ...props}) => <td className="border border-slate-700 px-3 py-2" {...props} />,
                          code({node, inline, className, children, ...props}) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-lg border border-slate-700 !my-4 !bg-[#0F172A]"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="bg-slate-800 text-[#D9FF00] px-1.5 py-0.5 rounded-md text-sm font-mono" {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    )}
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