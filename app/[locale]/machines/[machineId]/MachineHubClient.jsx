'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Paperclip, Mic, Send, Activity, FileText, Wrench, Package, 
  MessageSquare, Bot, User, UploadCloud, Loader2, CheckCircle2, AlertCircle 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function MachineHubClient({ machine }) {
  const [activeTab, setActiveTab] = useState('chat');
  const chatBottomRef = useRef(null);

  // Chat State
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success' | 'error' | null
  const [uploadMsg, setUploadMsg] = useState('');

  // 1. Fetch Chat History on mount or when machine switches
  useEffect(() => {
    const fetchHistory = async () => {
      if (!machine?.id) return;
      try {
        const res = await fetch(`/api/chat/history?machineId=${machine.id}`);
        if (res.ok) {
          const history = await res.json();
          if (Array.isArray(history) && history.length > 0) {
            setMessages(history);
          } else {
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('Failed to load diagnostic history:', err);
      }
    };

    fetchHistory();
  }, [machine?.id]);

  // 2. Fetch Documents for current machine
  const fetchDocs = useCallback(async () => {
    if (!machine?.id) return;
    try {
      const res = await fetch(`/api/documents?machineId=${machine.id}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, [machine?.id]);

  useEffect(() => {
    if (activeTab === 'documents') {
      fetchDocs();
    }
  }, [activeTab, fetchDocs]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, activeTab]);

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

  // PDF & TXT Upload Handler
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !machine?.id) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.txt')) {
      setUploadStatus('error');
      setUploadMsg('Please upload a valid PDF or TXT document.');
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);
    setUploadMsg('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('machineId', machine.id);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setUploadStatus('success');
        setUploadMsg(`Successfully indexed ${file.name}`);
        fetchDocs();
      } else {
        const errText = await res.text();
        // Catch raw HTML error templates from Next.js / Vercel
        const cleanMsg = errText.trim().startsWith('<')
          ? `Server Error (${res.status}): Check Vercel function runtime logs.`
          : errText;
        setUploadStatus('error');
        setUploadMsg(cleanMsg || 'Failed to process document.');
      }
    } catch (err) {
      setUploadStatus('error');
      setUploadMsg(err.message || 'Network upload error.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0F172A]">
      {/* Header */}
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

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {/* Chat Tab */}
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
                <button 
                  type="button" 
                  onClick={() => setActiveTab('documents')} 
                  title="Upload Documentation"
                  className="p-3 text-slate-400 hover:text-[#D9FF00] transition-colors rounded-xl hover:bg-slate-800"
                >
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

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="p-8 max-w-4xl mx-auto space-y-6 h-full overflow-y-auto">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-white tracking-tight">Machine Documentation</h2>
              <p className="text-xs text-slate-400">
                Upload manuals, wiring diagrams, and parameter lists. FaultMind will index and retrieve them automatically during diagnostic chats.
              </p>
            </div>

            {/* Upload Box */}
            <div className="border-2 border-dashed border-slate-700 hover:border-[#D9FF00]/50 rounded-xl p-8 text-center bg-[#131C31]/50 transition-colors">
              <input
  type="file"
  id="pdf-upload"
  accept=".pdf,.txt,application/pdf,text/plain"
  className="hidden"
  onChange={handleFileUpload}
  disabled={isUploading}
/>
              <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-3">
                {isUploading ? (
                  <Loader2 size={36} className="text-[#D9FF00] animate-spin" />
                ) : (
                  <UploadCloud size={36} className="text-[#D9FF00]" />
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-white font-semibold text-sm">
                    {isUploading ? 'Chunking PDF & generating vector embeddings...' : 'Click to select or drop technical manual (PDF)'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Supports electrical schematics, Siemens/Delta operating manuals, and parameter tables
                  </span>
                </div>
              </label>
            </div>

            {/* Upload Feedback */}
            {uploadStatus === 'success' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-400 text-xs">
                <CheckCircle2 size={16} />
                <span>{uploadMsg}</span>
              </div>
            )}
            {uploadStatus === 'error' && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-xs">
                <AlertCircle size={16} />
                <span>{uploadMsg}</span>
              </div>
            )}

            {/* Documents List */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Indexed Grounding Knowledge ({documents.length})
                </h3>
              </div>

              {documents.length > 0 ? (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-[#131C31] overflow-hidden">
                  {documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={18} className="text-[#D9FF00] shrink-0" />
                        <span className="text-sm font-medium text-white truncate">{doc.file_name}</span>
                      </div>
                      <span className="text-xs text-slate-500 font-mono shrink-0 ml-4">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center border border-slate-800 rounded-lg bg-[#131C31]/40">
                  <p className="text-sm text-slate-500">No manuals indexed for this machine yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Work Orders Tab */}
        {activeTab === 'work-orders' && (
          <div className="p-8 text-slate-400">
            Maintenance history and voice-logged reports will appear here.
          </div>
        )}

        {/* Parts Tab */}
        {activeTab === 'parts' && (
          <div className="p-8 text-slate-400">
            Compatible spare parts and inventory counts will appear here.
          </div>
        )}
      </div>
    </div>
  );
}