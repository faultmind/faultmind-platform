import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export const maxDuration = 60; 

export async function POST(req) {
  try {
    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'No chat history provided to extract.' }, { status: 400 });
    }

    // 1. Flatten the chat array into a single readable text transcript
    const chatTranscript = messages
      .filter(m => m.content && m.content.trim() !== '')
      .map(m => `${m.role === 'user' ? 'Technician' : 'AI'}: ${m.content}`)
      .join('\n\n');

    // 2. Pass the transcript as a single prompt instead of a message array
    const { object: draftData } = await generateObject({
      model: google('gemini-3.8-flash'), // Or 'gemini-3.8-flash' if that is what works on your tier
      prompt: `You are an industrial maintenance assistant. Extract the requested troubleshooting details from the following chat transcript. If a specific value like part price or downtime is not mentioned, return null.

TRANSCRIPT:
${chatTranscript}`,
      schema: z.object({
        root_cause: z.string().describe('The core reason the machine failed.'),
        resolution: z.string().describe('The exact steps taken to resolve the issue.'),
        parts_replaced: z.string().nullable().describe('Names or part numbers of replaced components.'),
        part_price: z.number().nullable().describe('Cost of the replaced parts, if mentioned.'),
        downtime_minutes: z.number().nullable().describe('Duration the machine was down in minutes.'),
        technicians: z.string().nullable().describe('Names of the engineers who performed the work.')
      }),
    });

    return Response.json({ success: true, report: draftData });

  } catch (error) {
    console.error('Extraction error:', error);
    return Response.json({ 
      error: error.message || 'Unknown extraction failure' 
    }, { status: 500 });
  }
}