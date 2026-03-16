import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, ShadingType, VerticalAlign, PageNumber, NumberFormat, Footer, Header, ExternalHyperlink } from "docx";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

// --- CONSTANTS ---
const BRAND_BLUE = "1A73E8";
const BRAND_DARK = "202124";
const BRAND_GREY = "5F6368";
const TABLE_HEADER_BG = "1A73E8";
const ALT_ROW_BG = "F1F3F4";
const NOTE_BG = "E8F0FE";
const RULE_LIGHT = "E0E0E0";

// --- SCHEMAS ---
const BLOCK_SCHEMA = `
Each section's "content" MUST be a JSON array of typed block objects. ONLY these types are allowed:

  { "type": "paragraph",     "text": "One or two sentences of essential context only." }
  { "type": "subheading",    "text": "Sub-section title" }
  { "type": "bullet_list",   "items": ["Concise item 1", "Concise item 2", "Concise item 3"] }
  { "type": "numbered_list", "items": ["Step 1", "Step 2", "Step 3"] }
  { "type": "table",         "headers": ["Col A", "Col B", "Col C"], "rows": [["r1c1","r1c2","r1c3"]] }
  { "type": "note",          "text": "Important advisory or key takeaway." }

STRICT CONTENT RULES:
  1. Do NOT use long prose paragraphs. Most information should be in bullet_list or table blocks.
  2. A "paragraph" block must be at most 2 sentences. Long essays are forbidden.
  3. Each main section MUST start with a "paragraph" (2-sentence overview) then immediately use "subheading" + "bullet_list" or "table" blocks for ALL details.
  4. Every section MUST contain at least 2 "subheading" blocks and at least 3 "bullet_list" blocks.
  5. Do NOT embed markdown (**, ##, ---) inside text strings.
  6. Bullet list items may use **bold** for a keyword at the start.
`;

const SECTION_TABLE_HINTS: Record<string, any> = {
  "Standard": {
    "Architecture Analysis": {
      "headers": ["Component", "GCP Service", "Role / Purpose", "Tier"],
      "note": "Add one row per component visible in the architecture diagram."
    },
    "Detailed Cost Analysis and Optimization": {
      "headers": ["Component", "GCP Service", "Est. Monthly Cost (Dev)", "Optimization Action"],
      "note": "Provide REALISTIC cost estimates. Use ranges like '$5 – $15'."
    }
  }
};

// --- HELPERS ---
function buildPrompt(docType: string, environment: string, sections: string, focus: string, tableHints: any) {
  return `
    You are an expert Cloud Solutions Architect specializing in architecture documentation.
    Analyze the provided architecture diagram.
    Your task is to generate the full content for an architecture document.
    
    DOCUMENT METADATA:
    - Type: ${docType}
    - Environment: ${environment}
    - Focus Area: ${focus}
    
    REQUIRED SECTIONS:
    ${sections}
    
    ${BLOCK_SCHEMA}
    
    SECTION-SPECIFIC TABLE HINTS:
    ${JSON.stringify(tableHints, null, 2)}
    
    Return a STRICT JSON response:
    {
      "title": "A professional name for this architecture",
      "sections": [
        {
          "heading": "Section Name (Must match one of the Required Sections)",
          "content": [ ...blocks... ]
        }
      ]
    }
    
    CRITICAL: Ensure the JSON is valid and perfectly structured. Do not include any text outside the JSON.
  `;
}

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

    let focus = "Balanced, thorough documentation.";
    let sections = "- Executive Summary\n- Architecture Analysis\n- Security Implementation";
    
    if (docType === "Standard") {
      focus = "Cost-efficiency, flexibility, and comprehensive documentation.";
      sections = "- Executive Summary\n- Business Requirements\n- Architecture Analysis\n- Security Implementation\n- Detailed Cost Analysis\n- Performance and Scalability\n- Deployment and Operations\n- Monitoring and Maintenance\n- Risk Assessment\n- Implementation Roadmap";
    } else if (docType === "Technical") {
      focus = "Engineering depth: patterns, network, security, and bottlenecks.";
      sections = "- Architecture Analysis\n- Security Implementation\n- Performance and Scalability\n- Deployment and Operations\n- Monitoring and Maintenance";
    } else if (docType === "Business") {
      focus = "Business value, cost, risks, and strategic roadmap.";
      sections = "- Executive Summary\n- Business Requirements\n- Detailed Cost Analysis\n- Risk Assessment\n- Implementation Roadmap";
    }

    const tableHints = SECTION_TABLE_HINTS[docType] || {};
    const prompt = buildPrompt(docType, environment, sections, focus, tableHints);

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent([prompt, imagePart]);
    let text = result.response.text();
    text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    const parsedData = JSON.parse(text);

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
