import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const { messages } = await req.json();
    console.log("1. Received chat request, generating stream...");

    // 1. Generate the raw stream using Gemini
    const result = await streamText({
      model: google('gemini-1.5-pro-latest'),
      system: `You are FaultMind, a highly skilled industrial automation and maintenance assistant. Provide clear, concise, step-by-step troubleshooting advice.`,
      messages: messages,
    });

    console.log("2. Stream successfully opened, encoding to browser...");

    // 2. Bypass Vercel's response formatters entirely.
    // Manually pipe the string stream into a native byte stream.
    const encoder = new TextEncoderStream();
    const byteStream = result.textStream.pipeThrough(encoder);

    // 3. Return a standard, pure Web API Response
    return new Response(byteStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
    
  } catch (error) {
    console.error("🚨 Chat API Fatal Error:", error);
    return new Response(error.message || "Failed to process chat", { status: 500 });
  }
}