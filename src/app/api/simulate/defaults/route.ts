import { NextRequest, NextResponse } from "next/server";
import { generateComponentDefaults } from "@/lib/gemini";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { architectureJson, provider } = await request.json();

    if (!architectureJson) {
      return NextResponse.json({ detail: "Missing architecture JSON" }, { status: 400 });
    }

    const defaults = await generateComponentDefaults(architectureJson, provider);
    return NextResponse.json({ defaults });
  } catch (error: any) {
    console.error("[Sim Defaults] Error:", error);
    return NextResponse.json(
      { detail: `Failed to generate defaults: ${error.message}` },
      { status: 500 }
    );
  }
}
