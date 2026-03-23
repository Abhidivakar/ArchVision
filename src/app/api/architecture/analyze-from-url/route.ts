import { NextRequest, NextResponse } from "next/server";
import { analyzeArchitecture } from "@/lib/gemini";
import fs from "fs/promises";
import path from "path";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, originalData } = await req.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
    }

    // Strip query parameters for local file reading
    const cleanImageUrl = imageUrl.split('?')[0];

    // In this local environment, the public URL /improved_arch.png maps to d:\Coding\architecture-document-creator\public\improved_arch.png
    const filePath = path.join(process.cwd(), "public", path.basename(cleanImageUrl));
    const imageBuffer = await fs.readFile(filePath);

    // Call the standard Gemini analysis
    const data = await analyzeArchitecture(imageBuffer, "image/png");

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Analysis from URL Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
