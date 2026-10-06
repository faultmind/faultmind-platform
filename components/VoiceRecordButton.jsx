'use client';

import { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

export function VoiceRecordButton({ onTranscriptionComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Collect audio chunks as the user speaks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // On stop, package the audio and send to Gemini 3.5 Transcribe
      mediaRecorder.onstop = async () => {
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Stop microphone tracks to turn off the browser's red recording indicator
        stream.getTracks().forEach((track) => track.stop());

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          
          if (data.text) {
            onTranscriptionComplete(data.text);
          }
        } catch (error) {
          console.error('Transcription failed:', error);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Please allow microphone permissions to dictate reports.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  if (isTranscribing) {
    return (
      <button type="button" disabled className="p-2 rounded-md bg-slate-800 text-[#D9FF00]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={isRecording ? stopRecording : startRecording}
      className={`p-2 rounded-md flex items-center justify-center transition-colors border ${
        isRecording 
          ? 'bg-red-900/50 border-red-500 text-red-500 animate-pulse' 
          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-[#D9FF00]'
      }`}
    >
      {isRecording ? <Square className="w-5 h-5" fill="currentColor" /> : <Mic className="w-5 h-5" />}
    </button>
  );
}