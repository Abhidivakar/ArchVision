import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export async function POST(request: NextRequest) {
  try {
    const { files, docType, environment } = await request.json();

    if (!files || typeof files !== "object") {
      return NextResponse.json({ detail: "No files provided for download" }, { status: 400 });
    }

    const zip = new JSZip();
    for (const [filename, content] of Object.entries(files)) {
      zip.file(filename, content as string);
    }

    const content = await zip.generateAsync({ type: "uint8array" });

    const filename = `Terraform_${docType}_${environment}.zip`.replace(/\s+/g, "_");

    return new NextResponse(content as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });

  } catch (error: any) {
    console.error("Terraform Download API Error:", error);
    return NextResponse.json({ detail: `Download failed: ${error.message}` }, { status: 500 });
  }
}
