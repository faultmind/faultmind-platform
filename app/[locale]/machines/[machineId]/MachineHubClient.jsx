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
    
    const userMessage = { id: Date.now(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setText(''); // Instantly clear input
    setIsLoading(true);

    const botMessageId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: botMessageId, role: 'assistant', content: '' }]);

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
      
      if (!response.ok) {
        throw new Error(await response.text());
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
      if (err.name !== 'AbortError') {
        console.error(err);
        alert(`🚨 STREAM ERROR:\n\n${err.message}`);
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
              {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14