import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const maxDuration = 30;

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return new Response('Unauthorized: Please log in to use FaultMind AI.', { status: 401 });
    }

    const { messages } = await req.json();

    const systemPrompt = `You are FaultMind, an expert AI diagnostic assistant for industrial control, automation, and maintenance engineers. 
    Your goal is to help maintenance engineers eliminate downtime and find the root cause of machine faults rapidly. 
    Provide highly technical, precise troubleshooting steps for industrial machinery, Variable Frequency Drives (VFDs), SCADA systems, and PLCs (including Siemens TIA Portal, WinCC, and Delta).
    Format your responses with clear, actionable bullet points. Avoid generic consumer IT advice.`;

    const result = await streamText({
      model: openai('gpt-4o'), 
      system: systemPrompt,
      messages,
    });

    // Return universal raw text stream, bypassing proprietary SDK formats
    return new Response(result.textStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
    
  } catch (error) {
    console.error("FaultMind Chat API Error:", error);
    return new Response(`Server Crash Details: ${error.message}`, { status: 500 });
  }
}