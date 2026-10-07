import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const { messages } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("API Key is missing from environment variables.");
    }

    // We are using generateText instead of streamText to FORCE 
    // any hidden Gemini API errors to be caught before sending the response.
    const result = await generateText({
      model: google('gemini-1.5-flash'), 
      system: `You are FaultMind, an industrial automation and maintenance assistant. Provide concise, step-by-step troubleshooting advice.`,
      messages: messages,
    });

    // Send the complete text back. Your frontend's TextDecoder will still read this perfectly.
    return new Response(result.text, { 
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
    
  } catch (error) {
    console.error("🚨 TRAPPED GEMINI API ERROR:", error);
    
    // This will now trigger the red error bubble in your UI
    return new Response(error.message || error.toString(), { status: 500 });
  }
}