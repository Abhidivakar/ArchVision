import { NextRequest, NextResponse } from "next/server";
import { generateImprovedImage } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing image generation prompt" }, { status: 400 });
    }

    console.log("Generating architecture image with prompt:", prompt);
    const base64Image = await generateImprovedImage(prompt);

    return NextResponse.json({ imageUrl: base64Image });
  } catch (error: any) {
    if (error.message === "IMAGEN_QUOTA_EXCEEDED") {
      return NextResponse.json({ error: "AI Image Quota Exceeded. Using original diagram fallback." }, { status: 429 });
    }
    return NextResponse.json({ error: error.message || "Failed to generate architecture image" }, { status: 500 });
  }
}
