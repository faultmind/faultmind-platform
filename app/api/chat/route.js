import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req) {
  try {
    const { messages, machineId } = await req.json();

    const result = await streamText({
      model: google('gemini-1.5-pro-latest'),
      system: `You are FaultMind, a highly skilled industrial automation and maintenance assistant. Provide clear, concise, step-by-step troubleshooting advice to the maintenance engineer on the floor.`,
      messages: messages,
      
      // IMPORTANT: The `tools` block has been completely removed.
      // Data extraction is now handled on-demand by the /api/reports/extract route.
    });

    // Since we are using our custom native fetch loop on the frontend,
    // we use the raw text stream response.
    return result.toTextStreamResponse();
    
  } catch (error) {
    console.error("Chat API Error:", error);
    return new Response(error.message || "Failed to process chat", { status: 500 });
  }
}