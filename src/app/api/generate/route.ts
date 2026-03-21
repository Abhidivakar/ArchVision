import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, ShadingType, VerticalAlign, PageNumber, NumberFormat, Footer, Header, ExternalHyperlink } from "docx";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

const BRAND_BLUE = "1A73E8";
const BRAND_DARK = "202124";
const BRAND_GREY = "5F6368";
const TABLE_HEADER_BG = "1A73E8";
const ALT_ROW_BG = "F1F3F4";
const NOTE_BG = "E8F0FE";
const RULE_LIGHT = "E0E0E0";

// --- HELPERS ---
function parseMarkdown(text: string): any[] {
  const blocks: any[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    if (s.startsWith("### ") || s.startsWith("## ")) {
      blocks.push({ type: "subheading", text: s.replace(/^###\s*|^##\s*/, "") });
    } else if (s.startsWith("- ") || s.startsWith("* ")) {
      if (blocks.length > 0 && blocks[blocks.length - 1].type === "bullet_list") {
        blocks[blocks.length - 1].items.push(s.substring(2));
      } else {
        blocks.push({ type: "bullet_list", items: [s.substring(2)] });
      }
    } else {
      blocks.push({ type: "paragraph", text: s });
    }
  }
  return blocks;
}

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const docType = formData.get("docType") as string;
    const environment = formData.get("environment") as string;

    if (!file) return NextResponse.json({ detail: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const imagePart = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: file.type || "image/png"
      }
    };

    const { generateDocumentContent } = await import("@/lib/gemini");
    const parsedData = await generateDocumentContent(buffer, file.type || "image/png", docType, environment);

    const title = parsedData.title || `${docType} Architecture – ${environment}`;
    const sectionsData = parsedData.sections || [];

    // --- Create Word Document ---
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1700, right: 1440 }
          }
        },
        children: [
          // Cover Page
          new Paragraph({ text: "", spacing: { after: 1440 } }), // spacer
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Architecture Documentation", size: 26, color: BRAND_BLUE, bold: true })
            ]
          }),
          new Paragraph({
            border: { bottom: { color: BRAND_BLUE, size: 6, style: BorderStyle.SINGLE } },
            spacing: { before: 200, after: 400 }
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            children: [
              new TextRun({ text: title, size: 48, bold: true, color: BRAND_DARK })
            ]
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

          // TOC and Content
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 320 }
          }),

          ...sectionsData.flatMap((section: any) => [
            new Paragraph({
              text: section.heading,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            }),
            ...(section.content || []).map((block: any) => {
              if (block.type === "paragraph") {
                return new Paragraph({ children: createFormattedText(block.text), spacing: { after: 140 } });
              }
              if (block.type === "subheading") {
                return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } });
              }
              if (block.type === "bullet_list") {
                return (block.items || []).map((item: string) => new Paragraph({
                  children: createFormattedText(item),
                  bullet: { level: 0 },
                  spacing: { after: 60 }
                }));
              }
              if (block.type === "note") {
                return new Paragraph({
                  children: [
                    new TextRun({ text: "ℹ  Note: ", bold: true, color: BRAND_BLUE }),
                    ...createFormattedText(block.text)
                  ],
                  shading: { fill: NOTE_BG, type: ShadingType.CLEAR, color: "auto" },
                  spacing: { before: 120, after: 120 }
                });
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
                        children: row.map(cell => new TableCell({
                          children: [new Paragraph({ text: cell })]
                        }))
                      }))
                    ]
                  }),
                  new Paragraph({ text: "", spacing: { after: 200 } })
                ];
              }
              return new Paragraph({ text: JSON.stringify(block) });
            }).flat()
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

  } catch (error: any) {
    console.error("Generate API Error:", error);
    return NextResponse.json({ detail: `Generation failed: ${error.message}` }, { status: 500 });
  }
}
