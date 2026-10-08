import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

// 1. Prevent Vercel from timing out the AI extraction (Allows up to 60 seconds)
export const maxDuration = 60; 

export async function POST(req) {
  try {
    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'No chat history provided to extract.' }, { status: 400 });
    }

    // 2. Filter out any empty messages (Gemini crashes if it receives empty content)
    const cleanMessages = messages.filter(m => m.content && m.content.trim() !== '');

    // 3. Extract the structured data
    const { object: draftData } = await generateObject({
      model: google('gemini-3.8-flash'), 
      system: 'You are an industrial maintenance assistant. Extract the requested troubleshooting details from the provided chat transcript. If a specific value like part price or downtime is not mentioned in the chat, return null.',
      messages: cleanMessages,
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
    // 4. Send the EXACT error back to the frontend instead of a generic message
    return Response.json({ 
      error: error.message || 'Unknown extraction failure' 
    }, { status: 500 });
  }
}