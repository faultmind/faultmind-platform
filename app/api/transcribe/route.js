import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('audio');

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Using Gemini 3.5 Transcribe for high-accuracy, bilingual technical dictation
    const { text } = await generateText({
      model: google('gemini-3.5-transcribe'),
      system: `You are a technical transcriber for industrial automation. 
      The audio frequently mixes Arabic and English. 
      Clean up pauses and filler words. 
      Ensure terms like Siemens, TIA Portal, WinCC, Delta PLC, VFD, and Supabase are spelled correctly.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this maintenance report.' },
            { type: 'file', data: buffer, mimeType: file.type },
          ],
        },
      ],
      temperature: 0.0,
    });

    return NextResponse.json({ text: text.trim() });

  } catch (error) {
    console.error("Transcription Error:", error);
    return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 });
  }
}