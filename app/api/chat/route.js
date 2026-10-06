import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const { messages } = await req.json();

    // 1. Safety Check
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing from environment variables.");
    }

    // 2. Stream Generation
    const result = await streamText({
      // Using the base model name to prevent 'deprecated alias' errors
      model: google('gemini-1.5-pro'), 
      system: `You are FaultMind, an industrial automation and maintenance assistant. Provide concise, step-by-step troubleshooting advice.`,
      messages: messages,
    });

    // 3. Official Text Stream
    return result.toTextStreamResponse();
    
  } catch (error) {
    console.error("🚨 BACKEND CRASH:", error);
    // Send the raw error string back to the frontend so it prints in the chat bubble
    return new Response(error.message || error.toString(), { status: 500 });
  }
}