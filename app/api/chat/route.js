import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const { messages } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("API Key is missing from environment variables.");
    }

    // THE FIX: Switching to a universally supported model alias
    const result = await streamText({
      model: google('gemini-1.5-flash'), 
      system: `You are FaultMind, an industrial automation and maintenance assistant. Provide concise, step-by-step troubleshooting advice.`,
      messages: messages,
    });

    // Send the stream back to our custom frontend decoder
    return result.toTextStreamResponse();
    
  } catch (error) {
    console.error("🚨 BACKEND CRASH:", error);
    return new Response(error.message || error.toString(), { status: 500 });
  }
}

