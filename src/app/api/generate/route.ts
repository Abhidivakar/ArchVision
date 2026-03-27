import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, ShadingType } from "docx";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BRAND_BLUE = "1A73E8";
const BRAND_DARK = "202124";
const NOTE_BG = "E8F0FE";

// --- HELPERS ---
function createFormattedText(text: string): TextRun[] {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/);
  return parts.map(part => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return new TextRun({ text: part.substring(2, part.length - 2), bold: true });
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return new TextRun({ text: part.substring(1, part.length - 1), italics: true });
    }
    return new TextRun({ text: part });
  });
}

async function buildAndReturnDocx(title: string, docType: string, environment: string, sectionsData: any[]) {
  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1700, right: 1440 } }
      },
      children: [
        // Cover Page
        new Paragraph({ text: "", spacing: { after: 1440 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Architecture Documentation", size: 26, color: BRAND_BLUE, bold: true })]
        }),
        new Paragraph({
          border: { bottom: { color: BRAND_BLUE, size: 6, style: BorderStyle.SINGLE } },
          spacing: { before: 200, after: 400 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 240 },
          children: [new TextRun({ text: title, size: 48, bold: true, color: BRAND_DARK })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 640 },
          children: [
            new TextRun({ text: `  ${docType} Document  `, size: 20, bold: true, color: BRAND_BLUE }),
            new TextRun({ text: `  ·  Target Environment: ${environment}  `, size: 20 })
          ]
        }),

        // Page Break
        new Paragraph({ text: "", pageBreakBefore: true }),

        // Title + Content
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, spacing: { after: 320 } }),

        ...sectionsData.flatMap((section: any) => [
          new Paragraph({
            text: section.heading,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          ...(section.content || []).flatMap((block: any) => {
            if (block.type === "paragraph") {
              return [new Paragraph({ children: createFormattedText(block.text), spacing: { after: 140 } })];
            }
            if (block.type === "subheading") {
              return [new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } })];
            }
            if (block.type === "bullet_list") {
              return (block.items || []).map((item: string) => new Paragraph({
                children: createFormattedText(item),
                bullet: { level: 0 },
                spacing: { after: 60 }
              }));
            }
            if (block.type === "numbered_list") {
              return (block.items || []).map((item: string, idx: number) => new Paragraph({
                children: [new TextRun({ text: `${idx + 1}. ${item}` })],
                spacing: { after: 60 }
              }));
            }
            if (block.type === "note") {
              return [new Paragraph({
                children: [
                  new TextRun({ text: "ℹ  Note: ", bold: true, color: BRAND_BLUE }),
                  ...createFormattedText(block.text)
                ],
                shading: { fill: NOTE_BG, type: ShadingType.CLEAR, color: "auto" },
                spacing: { before: 120, after: 120 }
              })];
            }
            if (block.type === "table") {
              return [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      children: (block.headers || []).map((h: string) => new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: h, color: "FFFFFF", bold: true })] })],
                        shading: { fill: BRAND_BLUE }
                      }))
                    }),
                    ...(block.rows || []).map((row: string[]) => new TableRow({
                      children: row.map((cell: string) => new TableCell({
                        children: [new Paragraph({ text: cell })]
                      }))
                    }))
                  ]
                }),
                new Paragraph({ text: "", spacing: { after: 200 } })
              ];
            }
            return [new Paragraph({ text: JSON.stringify(block) })];
          })
        ])
      ]
    }]
  });

  const docBuffer = await Packer.toBuffer(doc);
  return new NextResponse(docBuffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Architecture_${docType}_${environment}.docx"`
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // ─── Mode A: Dashboard — JSON body with pre-analyzed architectureJson ───────
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { architectureJson, docType = "Standard", environment = "Development", provider = "GCP" } = body;
      if (!architectureJson) return NextResponse.json({ detail: "No architecture data" }, { status: 400 });

      const { generateDocumentFromJson } = await import("@/lib/gemini");
      const parsedData = await generateDocumentFromJson(architectureJson, docType, environment, provider);
      const title = parsedData.title || `${docType} Architecture – ${environment}`;
      return await buildAndReturnDocx(title, docType, environment, parsedData.sections || []);
    }

    // ─── Mode B: Landing page — multipart formData with raw image ───────────────
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const docType = (formData.get("docType") as string) || "Standard";
    const environment = (formData.get("environment") as string) || "Development";

    if (!file) return NextResponse.json({ detail: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { generateDocumentContent } = await import("@/lib/gemini");
    const parsedData = await generateDocumentContent(buffer, file.type || "image/png", docType, environment);
    const title = parsedData.title || `${docType} Architecture – ${environment}`;
    return await buildAndReturnDocx(title, docType, environment, parsedData.sections || []);

  } catch (error: any) {
    console.error("Generate API Error:", error);
    return NextResponse.json({ detail: `Generation failed: ${error.message}` }, { status: 500 });
  }
}
