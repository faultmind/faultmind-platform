import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const { messages } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("API Key is missing from environment variables.");
    }

    // generateText forces the server to wait for Google's complete response,
    // guaranteeing that any hidden API rejections are successfully caught.
    const result = await generateText({
      model: google('gemini-3.8-flash'), 
      system: `You are FaultMind, an industrial automation and maintenance assistant. Provide concise, step-by-step troubleshooting advice.`,
      messages: messages,
    });

    // Send the raw text back to your frontend TextDecoder loop
    return new Response(result.text, { 
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
    
  } catch (error) {
    console.error("🚨 TRAPPED API ERROR:", error);
    // This will force the red error bubble to appear in your UI
    return new Response(error.message || error.toString(), { status: 500 });
  }
}