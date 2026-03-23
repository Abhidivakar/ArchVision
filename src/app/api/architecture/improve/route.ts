import { NextRequest, NextResponse } from "next/server";
import { suggestImprovements } from "@/lib/gemini";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(" "));
      const intervalId = setInterval(() => controller.enqueue(encoder.encode(" ")), 10000);

      try {
        const { architectureJson, simulationReport } = await req.clone().json();

        if (!architectureJson) {
          throw new Error("Missing architecture data");
        }

        const result = await suggestImprovements(architectureJson, simulationReport);

        clearInterval(intervalId);
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      } catch (error: any) {
        clearInterval(intervalId);
        console.error("Improve API Error:", error);
        controller.enqueue(encoder.encode(JSON.stringify({ error: error.message })));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive'
    }
  });
}
