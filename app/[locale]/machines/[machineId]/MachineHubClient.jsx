'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Paperclip, Mic, Send, Activity, FileText, Wrench, Package, 
  MessageSquare, Bot, User, UploadCloud, Loader2, CheckCircle2, AlertCircle,
  ClipboardList, Square
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
  const abortControllerRef = useRef(null);

  // 1. Rock-solid Local State (No buggy hooks)
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Documents & Reports State
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); 
  const [uploadMsg, setUploadMsg] = useState('');
  const [draftReport, setDraftReport] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Fetch Chat History
  useEffect(() => {
    const fetchHistory = async () => {
      if (!machine?.id) return;
      try {
        const res = await fetch(`/api/chat/history?machineId=${machine.id}`);
        if (res.ok) {
          const history = await res.json();
          if (Array.isArray(history) && history.length > 0) setMessages(history);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };
    fetchHistory();
  }, [machine?.id]);

  // Fetch Documents
  const fetchDocs = useCallback(async () => {
    if (!machine?.id) return;
    try {
      const res = await fetch(`/api/documents?machineId=${machine.id}`);
      if (res.ok) {
        setDocuments(await res.json());
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

  // Document Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !machine?.id) return;

    setIsUploading(true);
    setUploadStatus(null);
    setUploadMsg('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('machineId', machine.id);
    formData.append('userId', 'e6296182-1d7b-4c81-8b63-a680466b52f4');

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
// Document Remove
  const handleDeleteDoc = async (docId, storagePath) => {
    const isConfirmed = window.confirm("Are you sure you want to delete this document?");
    if (!isConfirmed) return;

    try {
      const res = await fetch('/api/documents/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ docId, storagePath }),
      });

      if (res.ok) {
        // Refresh the document list after successful deletion
        fetchDocs(); 
      } else {
        alert("Failed to delete document. Check the console.");
      }
    } catch (error) {
      console.error("🚨 Delete request failed:", error);
    }
  };

  // Export Report
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

  // 2. Custom Native Fetch Handler (Your original working logic)
  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!text.trim() || isLoading) return;
    
    const userText = text;
    setText(''); // Instantly clear input
    setIsLoading(true);

    const userMessage = { id: Date.now(), role: 'user', content: userText };
    const botMessageId = Date.now() + 1;

    // Optimistically push the user message and an empty bot bubble to the UI
    setMessages((prev) => [...prev, userMessage, { id: botMessageId, role: 'assistant', content: '' }]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({ 
          machineId: machine?.id || 'unknown',
          sessionId: sessionId,
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })) 
        })
      });
      
      // If the backend crashes, throw the exact error message
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedText = ''; // <--- THE FIX: Build the string outside of React state
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          accumulatedText += chunk; 
          
          // Push the fully built string to the UI
          setMessages((prev) => prev.map(msg => 
            msg.id === botMessageId ? { ...msg, content: accumulatedText } : msg
          ));
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Frontend Stream Error:", err);
        // Print the exact error DIRECTLY into the AI chat bubble
        setMessages((prev) => prev.map(msg => 
          msg.id === botMessageId ? { ...msg, content: `🚨 ERROR: ${err.message}` } : msg
        ));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stopChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
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
                onSubmit={handleSend}
                className="relative flex items-end bg-[#1E293B] border border-slate-700 rounded-2xl p-2 shadow-lg focus-within:border-slate-500 transition-colors"
              >
                <button type="button" onClick={() => setActiveTab('documents')} className="p-3 text-slate-400 hover:text-[#D9FF00] transition-colors rounded-xl hover:bg-slate-800">
                  <Paperclip size={20} />
                </button>
                
                <textarea 
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Describe the fault..."
                  className="w-full max-h-48 bg-transparent text-slate-200 placeholder-slate-500 resize-none outline-none py-3 px-2 font-sans"
                />

                <div className="flex items-center gap-1 pb-1 pr-1">
                  <div className="mr-1">
                    <VoiceRecordButton 
                      onTranscriptionComplete={(transcript) => setText((prev) => (prev + ' ' + transcript).trim())} 
                    />
                  </div>
                  
                  {isLoading ? (
                    <button 
                      type="button" 
                      onClick={stopChat}
                      className="p-2.5 bg-red-500/20 hover:bg-red-500/40 text-red-500 border border-red-500/50 rounded-xl transition-colors"
                      title="Stop AI Generation"
                    >
                      <Square size={18} fill="currentColor" />
                    </button>
                  ) : (
                    <button 
                      type="submit" 
                      disabled={!text.trim()} 
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

        {activeTab === 'documents' && ( 
        <div className="p-8 text-slate-400">
        {activeTab === 'documents' && (
  <div className="p-6 space-y-6 max-w-4xl">
    {/* Upload Box */}
    <div className="border-2 border-dashed border-slate-700 hover:border-yellow-400/50 rounded-xl p-8 text-center transition-colors bg-slate-900/50">
      <input
        type="file"
        id="doc-upload"
        className="hidden"
        accept=".pdf,.txt,.doc,.docx"
        onChange={handleFileUpload}
      />
      <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center gap-2">
        <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <span className="text-sm font-medium text-slate-200">
          Click to upload machine manuals, wiring diagrams, or STL logic
        </span>
        <span className="text-xs text-slate-500">PDF, TXT, DOCX up to 25MB</span>
      </label>
    </div>

    {/* Document List */}
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h3 className="font-semibold text-sm text-slate-200">Indexed Machine Documents</h3>
        <span className="text-xs text-slate-500">{documents?.length || 0} files</span>
      </div>

      {documents?.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          No documents uploaded for this machine yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-800">
          {documents?.map((doc) => (
            <li key={doc.id} className="p-4 flex items-center justify-between hover:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-yellow-400 font-mono">
                  {doc.file_type || 'TXT'}
                </span>
                <span className="text-sm text-slate-200 font-medium">{doc.file_name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                <button 
                  onClick={() => handleDeleteDoc(doc.id, doc.storage_path)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
)}
        </div> )}
        {activeTab === 'reports' && ( <div className="h-full overflow-y-auto"><ReportFormTab draftData={draftReport} machineId={machine?.id} /></div> )}
      </div>
    </div>
  );
}