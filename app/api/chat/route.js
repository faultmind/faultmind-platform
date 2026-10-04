import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Allow streaming responses up to 30 seconds (Vercel Hobby limit, adjust if on Pro)
export const maxDuration = 30;

export async function POST(req) {
  try {
    // 1. Authenticate the request using Supabase
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

    // Block unauthorized access to protect your OpenAI credits
    if (!user || authError) {
      return new Response('Unauthorized: Please log in to use FaultMind AI.', { status: 401 });
    }

    // 2. Extract the chat messages sent from the frontend
    const { messages } = await req.json();

    // 3. Define the AI's persona and constraints
    const systemPrompt = `You are FaultMind, an expert AI diagnostic assistant for industrial control, automation, and maintenance engineers. 
    Your goal is to help maintenance engineers eliminate downtime and find the root cause of machine faults rapidly. 
    Provide highly technical, precise troubleshooting steps for industrial machinery, Variable Frequency Drives (VFDs), SCADA systems, and PLCs (including Siemens TIA Portal, WinCC, and Delta).
    Format your responses with clear, actionable bullet points. Avoid generic consumer IT advice.`;

    // 4. Call the OpenAI model and stream the text
    const result = await streamText({
      model: openai('gpt-4o'), // You can change this to 'gpt-4o-mini' for faster/cheaper responses
      system: systemPrompt,
      messages,
    });

    // 5. Return the stream to the Next.js client
    return result.toDataStreamResponse();
    
  } catch (error) {
    console.error("FaultMind Chat API Error:", error);
    // This will send the exact crash reason to your screen instead of a generic "Internal Server Error"
    return new Response(`Server Crash Details: ${error.message}`, { status: 500 });
  }
}