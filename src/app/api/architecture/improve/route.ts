import { NextRequest, NextResponse } from "next/server";
import { suggestImprovements } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { architectureJson, simulationReport } = await req.json();

    if (!architectureJson) {
      return NextResponse.json({ error: "Missing architecture data" }, { status: 400 });
    }

    const result = await suggestImprovements(architectureJson, simulationReport);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Improve API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
