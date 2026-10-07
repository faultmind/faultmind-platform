import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const { messages } = await req.json();
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      throw new Error("API Key is missing from environment variables.");
    }

    // 1. DIAGNOSTIC: Ask Google exactly what models this specific key is allowed to use
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const checkData = await checkRes.json();
    
    console.log("=== APPROVED MODELS FOR YOUR API KEY ===");
    if (checkData.models) {
      checkData.models
        // Filter to only show models that support text generation
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .forEach(m => console.log(m.name));
    } else {
      console.log("API Key issue or no models found:", checkData);
    }
    console.log("========================================");

    // 2. Trying the current generic standard as a fallback
    const result = await streamText({
      model: google('gemini-2.0-flash'), 
      system: `You are FaultMind, an industrial automation and maintenance assistant. Provide concise, step-by-step troubleshooting advice.`,
      messages: messages,
    });

    return result.toTextStreamResponse();
    
  } catch (error) {
    console.error("🚨 BACKEND CRASH:", error);
    return new Response(error.message || error.toString(), { status: 500 });
  }
}