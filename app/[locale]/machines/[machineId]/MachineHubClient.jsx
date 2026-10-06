'use client';

const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, setMessages, stop } = useChat({
  api: '/api/chat',
  body: { machineId: machine?.id, sessionId },
  onError: (err) => alert(`Chat Error: ${err.message}`)
});

import { 
  // ... your existing imports
  Square 
} from 'lucide-react';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { 
  Paperclip, Mic, Send, Activity, FileText, Wrench, Package, 
  MessageSquare, Bot, User, UploadCloud, Loader2, CheckCircle2, AlertCircle,
  ClipboardList
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { VoiceRecordButton } from '@/components/VoiceRecordButton';
import ReportFormTab from '@/components/ReportFormTab';

export default function MachineHubClient({ machine }) {
  const [activeTab, setActiveTab] = useState('chat');
  const chatBottomRef = useRef(null);
  const sessionId = useRef(typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now().toString()).current;

  // --- Official AI SDK Hook replacing custom fetch loop ---
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, setMessages } = useChat({
    api: '/api/chat',
    body: { machineId: machine?.id, sessionId },
    onError: (err) => alert(`Chat Error: ${err.message}`)
  });

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); 
  const [uploadMsg, setUploadMsg] = useState('');

  // Reporting State
  const [draftReport, setDraftReport] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Fetch Chat History on mount
  useEffect(() => {
    const fetchHistory = async () => {
      if (!machine?.id) return;
      try {
        const res = await fetch(`/api/chat/history?machineId=${machine.id}`);
        if (res.ok) {
          const history = await res.json();
          if (Array.isArray(history) && history.length > 0) {
            setMessages(history);
          }
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };
    fetchHistory();
  }, [machine?.id, setMessages]);

  // Fetch Documents
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
    if (activeTab === 'documents') fetchDocs();
  }, [activeTab, fetchDocs]);

  // Scroll to bottom
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
    { id: 'reports', label: 'Reports', icon: ClipboardList },
  ];

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !machine?.id) return;

    setIsUploading(true);
    setUploadStatus(null);
    setUploadMsg('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('machineId', machine.id);

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
      if (res.ok) {
        setUploadStatus('success');
        setUploadMsg(`Successfully indexed ${file.name}`);
        fetchDocs();
      } else {
        setUploadStatus('error');
        setUploadMsg('Failed to process document.');
      }
    } catch (err) {
      setUploadStatus('error');
      setUploadMsg('Network upload error.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleExportReport = async () => {
    setIsExtracting(true);
    try {
      const response = await fetch('/api/reports/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          machineId: machine?.id,
          sessionId: sessionId
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setDraftReport(data.report);
        setActiveTab('reports'); 
      } else {
        alert('Extraction failed: ' + data.error);
      }
    } catch (error) {
      alert('Network error while extracting report.');
    } finally {
      setIsExtracting(false);
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
          </div>

          {activeTab === 'chat' && messages.length > 0 && (
            <button
              onClick={handleExportReport}
              disabled={isExtracting}
              className="flex items-center gap-2 bg-slate-800 text-[#D9FF00] hover:bg-slate-700 border border-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
              {isExtracting ? 'Drafting Report...' : 'Export to Report'}
            </button>
          )}
        </div>

        <nav className="flex gap-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-2.5 text-sm font-medium transition-colors relative flex items-center gap-2 whitespace-nowrap ${
                  isActive ? 'text-[#D9FF00]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                {tab.label}
                {isActive && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#D9FF00] shadow-[0_0_8px_rgba(217,255,0,0.5)]"></div>}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#131C31] border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                  <Activity size={16} className="text-[#D9FF00]" />
                </div>
                <div className="flex-1 text-slate-300 leading-relaxed bg-[#131C31] p-4 rounded-2xl rounded-tl-none border border-slate-800">
                  <p>I have loaded the diagnostic context for <span className="font-semibold text-white">{machine?.name}</span>. What issue or fault code are you seeing on the floor?</p>
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
                          code({node, inline, className, children, ...props}) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-lg border border-slate-700 !my-4 !bg-[#0F172A]" {...props}>
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="bg-slate-800 text-[#D9FF00] px-1.5 py-0.5 rounded-md text-sm font-mono" {...props}>{children}</code>
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
                  <span className="text-xs text-slate-500 font-mono animate-pulse">Analyzing...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <div className="p-6 shrink-0 bg-[#0F172A]">
              <form 
                onSubmit={handleSubmit}
                className="relative flex items-end bg-[#1E293B] border border-slate-700 rounded-2xl p-2 shadow-lg focus-within:border-slate-500 transition-colors"
              >
                <button type="button" onClick={() => setActiveTab('documents')} className="p-3 text-slate-400 hover:text-[#D9FF00] transition-colors rounded-xl hover:bg-slate-800">
                  <Paperclip size={20} />
                </button>
                
                <textarea 
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Describe the fault..."
                  className="w-full max-h-48 bg-transparent text-slate-200 placeholder-slate-500 resize-none outline-none py-3 px-2 font-sans"
                />

                <div className="flex items-center gap-1 pb-1 pr-1">
  <div className="mr-1">
    <VoiceRecordButton 
      onTranscriptionComplete={(transcript) => setInput((input + ' ' + transcript).trim())} 
    />
  </div>

  {isLoading ? (
    <button 
      type="button" 
      onClick={stop}
      className="p-2.5 bg-red-500/20 hover:bg-red-500/40 text-red-500 border border-red-500/50 rounded-xl transition-colors"
      title="Stop AI Generation"
    >
      <Square size={18} fill="currentColor" />
    </button>
  ) : (
    <button 
      type="submit" 
      disabled={!input?.trim()} 
      className="p-2.5 bg-[#D9FF00] hover:bg-[#c2e600] disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
    >
      <Send size={18} className="translate-x-0.5" />
    </button>
  )}
</div>
              </form>
            </div>
          </div>
        )}

        {/* Other Tabs Rendering unchanged ... */}
        {activeTab === 'documents' && ( <div className="p-8 text-slate-400">Document Upload Active</div> )}
        {activeTab === 'reports' && ( <div className="h-full overflow-y-auto"><ReportFormTab draftData={draftReport} machineId={machine?.id} /></div> )}
      </div>
    </div>
  );
}