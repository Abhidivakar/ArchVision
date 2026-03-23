import { NextRequest, NextResponse } from "next/server";
import { analyzeArchitecture } from "@/lib/gemini";

export const maxDuration = 60;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ detail: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let mimeType = file.type;

    // Basic MIME sniffing / override for docx or generic streams
    if (file.name.endsWith(".docx")) {
      // In the Python version, we extracted the image from the docx.
      // For the first version of the unified backend, we'll suggest users upload the image directly.
      // Or we can try a basic extraction if mammoth is ready.
      // For now, let's treat it as a TODO or fail gracefully with a message.
      return NextResponse.json({ 
        detail: "Word document extraction is currently being ported. Please upload the architecture diagram as an image (PNG/JPG) for now." 
      }, { status: 400 });
    }

    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = "image/png"; // Fallback
    }

    const data = await analyzeArchitecture(buffer, mimeType);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Interactive API Error:", error);
    return NextResponse.json(
      { detail: `Analysis failed: ${error.message}` },
      { status: 500 }
    );
  }
}
