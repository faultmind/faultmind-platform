"use client";
import { useChat } from '@ai-sdk/react';
import { Send } from 'lucide-react';

export default function MachineDiagnosticsPage({ params }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-300">
      
      {/* Top Header */}
      <div className="p-5 border-b border-slate-800 bg-[#131C31]">
        <h1 className="text-xl font-bold text-white">Machine Diagnostics</h1>
        <p className="text-sm text-slate-500">AI Troubleshooting Assistant</p>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 mt-10">
            Describe the machine fault, alarm code, or abnormal behavior to begin diagnostics.
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] p-4 rounded-lg ${
                  m.role === 'user' 
                    ? 'bg-[#D9FF00] text-slate-900 font-medium' 
                    : 'bg-[#1E293B] text-slate-200 border border-slate-700'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="text-sm text-slate-500 animate-pulse">FaultMind is analyzing...</div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-800 bg-[#131C31]">
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto">
          <input
            className="flex-1 bg-[#0B0F19] border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#D9FF00] transition-colors"
            value={input}
            placeholder="e.g., The VFD is throwing an Overvoltage (OV) fault during deceleration..."
            onChange={handleInputChange}
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-[#D9FF00] hover:bg-[#c2e600] text-slate-900 p-3 rounded-lg font-bold disabled:opacity-50 transition-colors flex items-center justify-center"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}