import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase backend client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for backend admin inserts
);

export async function POST(req) {
  try {
    const { messages, machineId, sessionId, userId } = await req.json();

    // 1. Extract the structured data using Gemini
    const { object: draftData } = await generateObject({
      model: google('gemini-1.5-pro-latest'),
      system: 'You are an industrial maintenance assistant. Extract the requested troubleshooting details from the provided chat transcript. If a specific value like part price or downtime is not mentioned in the chat, return null.',
      messages: messages,
      schema: z.object({
        root_cause: z.string().describe('The core reason the machine failed.'),
        resolution: z.string().describe('The exact steps taken to resolve the issue.'),
        parts_replaced: z.string().nullable().describe('Names or part numbers of replaced components.'),
        part_price: z.number().nullable().describe('Cost of the replaced parts, if mentioned.'),
        downtime_minutes: z.number().nullable().describe('Duration the machine was down in minutes.'),
        technicians: z.string().nullable().describe('Names of the engineers who performed the work.')
      }),
    });

    // 2. Insert the extracted data directly into Supabase as a draft
    const { data, error } = await supabase
      .from('maintenance_reports')
      .insert({
        machine_id: machineId,
        session_id: sessionId,
        user_id: userId,
        status: 'draft',
        root_cause: draftData.root_cause,
        resolution: draftData.resolution,
        parts_replaced: draftData.parts_replaced,
        part_price: draftData.part_price,
        downtime_minutes: draftData.downtime_minutes,
        technicians: draftData.technicians
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insertion error:', error);
      return Response.json({ error: 'Failed to save draft to database.' }, { status: 500 });
    }

    // 3. Return the saved database record to the frontend
    return Response.json({ success: true, report: data });

  } catch (error) {
    console.error('Extraction error:', error);
    return Response.json({ error: 'Failed to extract report data.' }, { status: 500 });
  }
}