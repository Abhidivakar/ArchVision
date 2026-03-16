import os
import json
import re
from datetime import datetime
from io import BytesIO

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai

from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_root():
    return FileResponse("static/index.html")


# ─────────────────────────────────────────────────────────────────────────────
#  COLOUR CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

BRAND_BLUE      = RGBColor(0x1A, 0x73, 0xE8)
BRAND_DARK      = RGBColor(0x20, 0x21, 0x24)
BRAND_GREY      = RGBColor(0x5F, 0x63, 0x68)
TABLE_HEADER_BG = "1A73E8"
ALT_ROW_BG      = "F1F3F4"
NOTE_BG         = "E8F0FE"
RULE_BLUE       = "1A73E8"
RULE_LIGHT      = "E0E0E0"


# ─────────────────────────────────────────────────────────────────────────────
#  LOW-LEVEL XML HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _set_cell_shading(cell, hex_color: str):
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  hex_color)
    tcPr.append(shd)


def _set_cell_border(cell, color="D0D0D0"):
    tc    = cell._tc
    tcPr  = tc.get_or_add_tcPr()
    tcBdr = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        tag = OxmlElement(f"w:{edge}")
        tag.set(qn("w:val"),   "single")
        tag.set(qn("w:sz"),    "4")
        tag.set(qn("w:space"), "0")
        tag.set(qn("w:color"), color)
        tcBdr.append(tag)
    tcPr.append(tcBdr)


def _add_horizontal_rule(doc: Document, color: str = RULE_BLUE):
    p   = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after  = Pt(0)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    btm  = OxmlElement("w:bottom")
    btm.set(qn("w:val"),   "single")
    btm.set(qn("w:sz"),    "12")
    btm.set(qn("w:space"), "1")
    btm.set(qn("w:color"), color)
    pBdr.append(btm)
    pPr.append(pBdr)
    return p


def _add_formatted_run(para, text: str):
    """Add text to a paragraph; honours **bold** and *italic* markers."""
    segments = re.split(r"(\*\*.*?\*\*|\*.*?\*)", str(text))
    for seg in segments:
        if re.fullmatch(r"\*\*(.+?)\*\*", seg):
            r = para.add_run(seg[2:-2])
            r.bold = True
        elif re.fullmatch(r"\*(.+?)\*", seg):
            r = para.add_run(seg[1:-1])
            r.italic = True
        else:
            para.add_run(seg)


# ─────────────────────────────────────────────────────────────────────────────
#  COVER PAGE
# ─────────────────────────────────────────────────────────────────────────────

def _add_cover_page(doc: Document, title: str, doc_type: str, environment: str):
    for _ in range(7):
        sp = doc.add_paragraph()
        sp.paragraph_format.space_after = Pt(0)

    brand = doc.add_paragraph()
    brand.alignment = WD_ALIGN_PARAGRAPH.CENTER
    br = brand.add_run("Architecture Documentation")
    br.font.size  = Pt(13)
    br.font.color.rgb = BRAND_BLUE
    br.font.bold  = True

    _add_horizontal_rule(doc)

    t_para = doc.add_paragraph()
    t_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t_para.paragraph_format.space_before = Pt(24)
    t_para.paragraph_format.space_after  = Pt(12)
    tr = t_para.add_run(title)
    tr.font.size  = Pt(24)
    tr.font.bold  = True
    tr.font.color.rgb = BRAND_DARK

    badge = doc.add_paragraph()
    badge.alignment = WD_ALIGN_PARAGRAPH.CENTER
    badge.paragraph_format.space_after = Pt(32)
    b1 = badge.add_run(f"  {doc_type} Document  ")
    b1.font.size  = Pt(10)
    b1.font.bold  = True
    b1.font.color.rgb = BRAND_BLUE
    b2 = badge.add_run(f"  ·  Target Environment: {environment}  ")
    b2.font.size  = Pt(10)
    b2.font.color.rgb = BRAND_GREY

    _add_horizontal_rule(doc)

    date_p = doc.add_paragraph()
    date_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_p.paragraph_format.space_before = Pt(14)
    dr = date_p.add_run(
        f"Generated on {datetime.now().strftime('%B %d, %Y')}   ·   Powered by Architecture Document Creator"
    )
    dr.font.size  = Pt(9)
    dr.font.color.rgb = BRAND_GREY

    doc.add_page_break()


# ─────────────────────────────────────────────────────────────────────────────
#  MANUAL TABLE OF CONTENTS  (no Word fields — always works without Update Field)
# ─────────────────────────────────────────────────────────────────────────────

def _add_manual_toc(doc: Document, section_headings: list):
    toc_h = doc.add_heading("Table of Contents", level=1)
    _style_heading(toc_h, 1)
    toc_h.paragraph_format.space_after = Pt(14)

    # Fixed items that always appear
    fixed_items = ["Architecture Diagram"]
    all_items   = fixed_items + section_headings

    for i, heading in enumerate(all_items, 1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent  = Inches(0.15)
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after  = Pt(5)

        num_run = p.add_run(f"{i}.  ")
        num_run.font.color.rgb = BRAND_BLUE
        num_run.font.bold  = True
        num_run.font.size  = Pt(11)

        txt_run = p.add_run(heading)
        txt_run.font.size  = Pt(11)
        txt_run.font.color.rgb = BRAND_DARK

    doc.add_page_break()


# ─────────────────────────────────────────────────────────────────────────────
#  PAGE HEADER & FOOTER
# ─────────────────────────────────────────────────────────────────────────────

def _add_page_numbers(doc: Document, title: str):
    section = doc.sections[0]

    # Header – doc title right-aligned
    header = section.header
    header.is_linked_to_previous = False
    h_para = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    h_para.clear()
    h_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = h_para.add_run(title)
    r.font.size  = Pt(8)
    r.font.color.rgb = BRAND_GREY

    # Footer – "Page X of Y" centred
    footer = section.footer
    footer.is_linked_to_previous = False
    f_para = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    f_para.clear()
    f_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    def _field(run, fld_name):
        for tag, ftype in [("begin", None), (None, fld_name), ("end", None)]:
            if tag:
                el = OxmlElement("w:fldChar")
                el.set(qn("w:fldCharType"), tag)
                run._r.append(el)
            else:
                instr = OxmlElement("w:instrText")
                instr.text = ftype
                run._r.append(instr)

    r1 = f_para.add_run("Page ")
    r1.font.size = Pt(9); r1.font.color.rgb = BRAND_GREY
    _field(r1, "PAGE")
    r2 = f_para.add_run(" of ")
    r2.font.size = Pt(9); r2.font.color.rgb = BRAND_GREY
    _field(r2, "NUMPAGES")


# ─────────────────────────────────────────────────────────────────────────────
#  ARCHITECTURE DIAGRAM SECTION
# ─────────────────────────────────────────────────────────────────────────────

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp"}

def _add_architecture_diagram(doc: Document, file_bytes: bytes, mime_type: str):
    h2 = doc.add_heading("Architecture Diagram", level=2)
    _style_heading(h2, 2)
    h2.paragraph_format.space_before = Pt(12)
    h2.paragraph_format.space_after  = Pt(10)

    if mime_type in IMAGE_MIME_TYPES:
        # Centre the image and constrain to page width
        img_para = doc.add_paragraph()
        img_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        img_para.paragraph_format.space_before = Pt(8)
        img_para.paragraph_format.space_after  = Pt(8)
        run = img_para.add_run()
        run.add_picture(BytesIO(file_bytes), width=Inches(5.8))

        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cr = cap.add_run("Figure 1 – Uploaded Architecture Diagram")
        cr.font.size     = Pt(9)
        cr.font.italic   = True
        cr.font.color.rgb = BRAND_GREY
    else:
        # PDF – cannot embed directly
        note_p = doc.add_paragraph()
        note_p.paragraph_format.left_indent  = Inches(0.3)
        note_p.paragraph_format.space_before = Pt(6)
        note_p.paragraph_format.space_after  = Pt(6)
        pPr = note_p._p.get_or_add_pPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), NOTE_BG)
        pPr.append(shd)
        lbl = note_p.add_run("ℹ  Note: ")
        lbl.bold = True; lbl.font.color.rgb = BRAND_BLUE; lbl.font.size = Pt(10)
        note_p.add_run(
            "The uploaded file is a PDF and cannot be embedded directly as an image. "
            "Please refer to the original uploaded file for the architecture diagram."
        )

    _add_horizontal_rule(doc, RULE_LIGHT)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


# ─────────────────────────────────────────────────────────────────────────────
#  HEADING STYLE HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _style_heading(para, level: int):
    # Prevent heading from being orphaned at the bottom of a page
    para.paragraph_format.keep_with_next = True
    para.paragraph_format.keep_together  = True
    for run in para.runs:
        if level == 1:
            run.font.color.rgb = BRAND_DARK
            run.font.size = Pt(18)
        elif level == 2:
            run.font.color.rgb = BRAND_BLUE
            run.font.size = Pt(14)
        elif level == 3:
            run.font.color.rgb = BRAND_DARK
            run.font.size = Pt(11)
            run.font.bold = True


# ─────────────────────────────────────────────────────────────────────────────
#  TABLE RENDERER  (styled header + alternating rows)
# ─────────────────────────────────────────────────────────────────────────────

def _no_split_row(row):
    """Prevent a table row from splitting across pages."""
    tr   = row._tr
    trPr = tr.get_or_add_trPr()
    cant = OxmlElement("w:cantSplit")
    cant.set(qn("w:val"), "1")
    trPr.append(cant)


def _render_table(doc: Document, headers: list, rows: list,
                  add_total_row: bool = False):
    """
    Render a styled table.
    add_total_row=True appends a bold Total row that sums numeric cost cells.
    """
    if not headers:
        return
    cols = len(headers)

    # Filter out AI-generated "Total" rows (we add our own correctly-formatted Total row)
    filtered_rows = []
    for r in rows:
        if r and isinstance(r[0], str) and "total" in r[0].lower():
            continue
        filtered_rows.append(r)
    rows = filtered_rows

    table = doc.add_table(rows=1 + len(rows), cols=cols)
    table.style     = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT

    # Header row
    hdr_row = table.rows[0]
    _no_split_row(hdr_row)
    for i, h in enumerate(headers):
        cell = hdr_row.cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(str(h))
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(9.5)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        _set_cell_shading(cell, TABLE_HEADER_BG)
        _set_cell_border(cell, color="1A73E8")

    # Data rows
    for r_idx, row_data in enumerate(rows):
        bg  = ALT_ROW_BG if r_idx % 2 == 0 else "FFFFFF"
        row = table.rows[r_idx + 1]
        _no_split_row(row)
        for c_idx, val in enumerate(row_data):
            cell = row.cells[c_idx]
            cell.text = ""
            p = cell.paragraphs[0]
            _add_formatted_run(p, str(val))
            if p.runs:
                p.runs[0].font.size = Pt(9.5)
            _set_cell_shading(cell, bg)
            _set_cell_border(cell, color="D0D0D0")

    # ── Optional Total row ─────────────────────────────────────────────────
    if add_total_row and rows:
        # Find the cost column index (first header containing 'cost' or 'estimate')
        cost_col = next(
            (i for i, h in enumerate(headers)
             if any(k in str(h).lower() for k in ("cost", "estimate", "monthly"))),
            None
        )
        total_row_idx = table.add_row()
        _no_split_row(total_row_idx)
        for c_idx in range(cols):
            cell = total_row_idx.cells[c_idx]
            cell.text = ""
            if c_idx == 0:
                lbl = cell.paragraphs[0].add_run("TOTAL (Estimated Dev Month)")
                lbl.bold = True
                lbl.font.size = Pt(9.5)
                lbl.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            elif c_idx == cost_col:
                # Sum range from cost cells.
                # AI may return "$7 – $15" (range) or "$30" (single value).
                # For single values, apply ±15% to produce a realistic range.
                total_low, total_high = 0.0, 0.0
                for data_row in rows:
                    val_str = str(data_row[c_idx]) if c_idx < len(data_row) else ""
                    nums = re.findall(r"\d+\.?\d*", val_str.replace(",", ""))
                    nums = [float(n) for n in nums]
                    if len(nums) >= 2:
                        total_low  += nums[0]
                        total_high += nums[-1]
                    elif len(nums) == 1:
                        # Single-value: use -15% / +15% to produce a range
                        total_low  += nums[0] * 0.85
                        total_high += nums[0] * 1.15
                # If low and high are still too close, widen slightly
                if abs(total_high - total_low) < 5:
                    total_low  *= 0.85
                    total_high *= 1.15
                summary = f"~${int(total_low):,} – ${int(total_high):,} / month"
                run = cell.paragraphs[0].add_run(summary)
                run.bold = True
                run.font.size = Pt(9.5)
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            else:
                run = cell.paragraphs[0].add_run("—")
                run.font.size = Pt(9.5)
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            _set_cell_shading(cell, "0D47A1")   # darker blue for total row
            _set_cell_border(cell, color="0D47A1")

    doc.add_paragraph().paragraph_format.space_after = Pt(6)


# ─────────────────────────────────────────────────────────────────────────────
#  BLOCK RENDERER  (typed blocks → Word elements)
# ─────────────────────────────────────────────────────────────────────────────

def _render_blocks(doc: Document, blocks: list, section_heading: str = ""):
    """
    Render typed content blocks into the document.
    section_heading is used to decide if a Total row should be added to tables.
    """
    is_cost_section = any(
        k in section_heading.lower()
        for k in ("cost", "pricing", "budget", "financ")
    )

    # Start True: _render_blocks is always called right after a Heading 2,
    # so the very first block must stay glued to that heading.
    prev_was_heading = True

    for block in blocks:
        btype = block.get("type", "paragraph")

        if btype == "paragraph":
            p = doc.add_paragraph()
            p.paragraph_format.space_after  = Pt(7)
            p.paragraph_format.keep_together = True
            # Glue intro paragraph to its preceding heading
            if prev_was_heading:
                p.paragraph_format.keep_with_next = True
            _add_formatted_run(p, block.get("text", ""))
            prev_was_heading = False

        elif btype == "subheading":
            h = doc.add_heading(block.get("text", ""), level=3)
            _style_heading(h, 3)   # keep_with_next already set inside
            h.paragraph_format.space_before = Pt(10)
            h.paragraph_format.space_after  = Pt(4)
            prev_was_heading = True

        elif btype == "bullet_list":
            items = block.get("items", [])
            for idx, item in enumerate(items):
                p = doc.add_paragraph(style="List Bullet")
                p.paragraph_format.space_after  = Pt(3)
                p.paragraph_format.keep_together = True
                # All items except the very last get keep_with_next so the
                # list stays together, but we don't over-constrain the last item.
                if idx < len(items) - 1:
                    p.paragraph_format.keep_with_next = True
                elif prev_was_heading:   # single-item list right after heading
                    p.paragraph_format.keep_with_next = True
                _add_formatted_run(p, str(item))
            prev_was_heading = False

        elif btype == "numbered_list":
            items = block.get("items", [])
            for idx, item in enumerate(items):
                # Use 'List Paragraph' without auto-numbering to prevent Word from
                # continuing numbers across different sections (Phase 1 vs Phase 2).
                p = doc.add_paragraph(style="List Paragraph")
                p.paragraph_format.space_after  = Pt(3)
                p.paragraph_format.keep_together = True
                if idx < len(items) - 1:
                    p.paragraph_format.keep_with_next = True
                elif prev_was_heading:
                    p.paragraph_format.keep_with_next = True
                
                # Manually prefix "1. ", "2. "
                _add_formatted_run(p, f"{idx + 1}. {str(item)}")
            prev_was_heading = False

        elif btype == "table":
            _render_table(
                doc,
                block.get("headers", []),
                block.get("rows", []),
                add_total_row=is_cost_section,
            )
            prev_was_heading = False

        elif btype == "note":
            p = doc.add_paragraph()
            p.paragraph_format.left_indent  = Inches(0.3)
            p.paragraph_format.right_indent = Inches(0.3)
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after  = Pt(6)
            p.paragraph_format.keep_together = True
            pPr = p._p.get_or_add_pPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), NOTE_BG)
            pPr.append(shd)
            lbl = p.add_run("ℹ  Note: ")
            lbl.bold = True; lbl.font.color.rgb = BRAND_BLUE; lbl.font.size = Pt(10)
            _add_formatted_run(p, block.get("text", ""))
            prev_was_heading = False

        else:
            p = doc.add_paragraph()
            _add_formatted_run(p, block.get("text", str(block)))
            prev_was_heading = False


# ─────────────────────────────────────────────────────────────────────────────
#  MARKDOWN FALLBACK  (if AI ignores the typed-block format)
# ─────────────────────────────────────────────────────────────────────────────

def _markdown_to_blocks(text: str) -> list:
    blocks = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("### ") or s.startswith("## "):
            prefix = "### " if s.startswith("### ") else "## "
            blocks.append({"type": "subheading", "text": s[len(prefix):]})
        elif s.startswith("- ") or s.startswith("* "):
            if blocks and blocks[-1]["type"] == "bullet_list":
                blocks[-1]["items"].append(s[2:])
            else:
                blocks.append({"type": "bullet_list", "items": [s[2:]]})
        else:
            blocks.append({"type": "paragraph", "text": s})
    return blocks


# ─────────────────────────────────────────────────────────────────────────────
#  PROMPT BUILDER
# ─────────────────────────────────────────────────────────────────────────────

BLOCK_SCHEMA = """
Each section's "content" MUST be a JSON array of typed block objects. ONLY these types are allowed:

  { "type": "paragraph",     "text": "One or two sentences of essential context only." }
  { "type": "subheading",    "text": "Sub-section title" }
  { "type": "bullet_list",   "items": ["Concise item 1", "Concise item 2", "Concise item 3"] }
  { "type": "numbered_list", "items": ["Step 1", "Step 2", "Step 3"] }
  { "type": "table",         "headers": ["Col A", "Col B", "Col C"], "rows": [["r1c1","r1c2","r1c3"]] }
  { "type": "note",          "text": "Important advisory or key takeaway." }

STRICT CONTENT RULES — violations will make the document useless:
  1. Do NOT use long prose paragraphs. Most information should be in bullet_list or table blocks.
  2. A "paragraph" block must be at most 2 sentences. Long essays are forbidden.
  3. Each main section MUST start with a "paragraph" (2-sentence overview) then immediately
     use "subheading" + "bullet_list" or "table" blocks for ALL details.
  4. Every section MUST contain at least 2 "subheading" blocks and at least 3 "bullet_list" blocks.
  5. Do NOT embed markdown (**, ##, ---) inside text strings — use the block types instead.
  6. Bullet list items may use **bold** for a keyword at the start, e.g. "**Cloud SQL:** Managed relational DB."
  7. Be specific and technical. Reference actual services, configs, and values visible in the diagram.
"""

SECTION_TABLE_HINTS = {
    "Standard": {
        "Architecture Analysis": {
            "headers": ["Component", "GCP Service", "Role / Purpose", "Tier"],
            "note": "Add one row per component visible in the architecture diagram. Be specific about service names."
        },
        "Detailed Cost Analysis and Optimization": {
            "headers": ["Component", "GCP Service", "Est. Monthly Cost (Dev)", "Optimization Action"],
            "note": (
                "Provide REALISTIC cost estimates for a DEVELOPMENT environment using SMALL instance types. "
                "ALWAYS write cost as a low–high range (e.g. '$5 – $15'), NEVER a single number. "
                "Use these GCP reference prices as anchors: "
                "Compute Engine e2-micro ~$7–$9/mo, e2-small ~$14–$18/mo; "
                "Cloud SQL db-f1-micro ~$8–$12/mo, db-g1-small ~$25–$35/mo; "
                "Memorystore Redis 1GB ~$35–$50/mo; "
                "App Engine F1 instance ~$5–$20/mo (schedule to 0 instances off-hours); "
                "Cloud CDN ~$1–$10/mo dev; Cloud Armor Standard ~$0–$5/mo; "
                "Cloud Storage ~$0–$5/mo; VPC/Networking ~$0–$5/mo; "
                "Cloud Logging/Monitoring ~$0–$10/mo; IAM $0. "
                "Optimization actions must be specific (e.g. 'use e2-micro', 'disable read replica in dev')."
            )
        },
        "Risk Assessment and Mitigation": {
            "headers": ["Risk", "Category", "Likelihood", "Impact", "Mitigation Strategy"],
            "note": "List at least 6 risks. Likelihood and Impact should be High / Medium / Low."
        },
        "Security Implementation": {
            "headers": ["Security Control", "GCP Mechanism", "Scope", "Status"],
            "note": "One row per security control (IAM, Cloud Armor, VPC, SSL, etc.)"
        },
    },
    "Technical": {
        "Architecture Analysis (Deep Dive)": {
            "headers": ["Component", "GCP Service", "Configuration Notes", "Dependencies"],
            "note": "Deep-dive table for every component in the diagram."
        },
        "Performance and Scalability (Deep Dive)": {
            "headers": ["Component", "Metric", "Baseline (Dev)", "Scale-Out Strategy", "Bottleneck Risk"],
            "note": "Cover CPU, memory, throughput, and DB connection metrics."
        },
    },
    "Business": {
        "Detailed Cost Analysis and Optimization": {
            "headers": ["Service Category", "GCP Service", "Monthly Estimate (USD)", "Annual Estimate (USD)", "Business Justification"],
            "note": (
                "Business-level cost table with annual projections and justification. "
                "ALWAYS write 'Monthly Estimate (USD)' as a low–high range (e.g. '$5 – $15'), NEVER a single number. "
                "Annual estimate = monthly range × 12 (e.g. '$60 – $180'). "
                "Use these GCP reference prices as anchors for a DEVELOPMENT environment: "
                "Compute Engine e2-micro ~$7–$9/mo, e2-small ~$14–$18/mo; "
                "Cloud SQL db-f1-micro ~$8–$12/mo, db-g1-small ~$25–$35/mo; "
                "Memorystore Redis 1GB ~$35–$50/mo; "
                "App Engine F1 instance ~$5–$20/mo; "
                "Cloud CDN ~$1–$10/mo; Cloud Armor Standard ~$0–$5/mo; "
                "Cloud Storage ~$0–$5/mo; VPC/Networking ~$0–$5/mo; "
                "Cloud Logging/Monitoring ~$0–$10/mo; IAM $0. "
                "Each row must include a clear business justification."
            )
        },
        "Risk Assessment and Mitigation": {
            "headers": ["Risk", "Business Impact", "Likelihood", "Mitigation", "Owner"],
            "note": "List at least 5 risks from a business perspective."
        },
    },
}


def build_prompt(doc_type: str, environment: str, required_sections: str,
                 focus: str, table_hints: dict) -> str:
    table_instructions = ""
    for sec, info in table_hints.items():
        headers = info["headers"]
        note    = info["note"]
        table_instructions += (
            f'\n  - Section "{sec}": MUST include a "table" block with headers {json.dumps(headers)}. {note}'
        )

    return f"""You are a Senior Cloud Solutions Architect and Technical Writer producing a professional architecture document.

Diagram Analysis Instructions:
- Study the uploaded architecture diagram carefully.
- Identify EVERY component, service, and connection shown.
- Reference actual service names, tiers, and relationships from the diagram in all sections.

Document Settings:
- Target Environment: {environment}
- Document Type: {doc_type}
- Focus: {focus}

REQUIRED SECTIONS (include ALL of them, in order):
{required_sections}

CONTENT FORMAT:
{BLOCK_SCHEMA}

MANDATORY TABLE REQUIREMENTS (failing to add these tables is an error):
{table_instructions}

OUTPUT: Return ONLY a valid JSON object — no markdown fences, no preamble, no trailing text.
{{
  "title": "Specific descriptive title referencing the architecture type, cloud provider, and environment",
  "sections": [
    {{
      "heading": "Exact section name from the required list above",
      "content": [ /* array of typed block objects — see rules above */ ]
    }}
  ]
}}

Remember: bullet_list and table blocks MUST dominate the content. Long paragraphs are NOT acceptable.
"""


# ─────────────────────────────────────────────────────────────────────────────
#  API ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/generate")
async def generate_document(
    file:        UploadFile = File(...),
    docType:     str        = Form(...),
    environment: str        = Form(...)
):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API key is not configured")

    genai.configure(api_key=api_key)
    file_bytes = await file.read()
    mime_type  = file.content_type

    image_part = {"mime_type": mime_type, "data": file_bytes}

    # ── Section definitions ──────────────────────────────────────────────────
    if docType == "Standard":
        focus    = "Cost-efficiency, flexibility, and comprehensive documentation for all stakeholders."
        sections = (
            "- Executive Summary\n"
            "- Business Requirements and Solution Context\n"
            "- Architecture Analysis\n"
            "- Security Implementation\n"
            "- Detailed Cost Analysis and Optimization\n"
            "- Performance and Scalability\n"
            "- Deployment and Operations\n"
            "- Monitoring and Maintenance\n"
            "- Risk Assessment and Mitigation\n"
            "- Implementation Roadmap"
        )
        table_hints = SECTION_TABLE_HINTS.get("Standard", {})

    elif docType == "Technical":
        focus    = "Engineering depth: architecture patterns, network configs, security mechanisms, scaling, and bottlenecks."
        sections = (
            "- Architecture Analysis (Deep Dive)\n"
            "- Security Implementation (Deep Dive)\n"
            "- Performance and Scalability (Deep Dive)\n"
            "- Deployment and Operations\n"
            "- Monitoring and Maintenance"
        )
        table_hints = SECTION_TABLE_HINTS.get("Technical", {})

    elif docType == "Business":
        focus    = "Business value, cost, risks, compliance, and strategic roadmap. Minimise technical jargon."
        sections = (
            "- Executive Summary\n"
            "- Business Requirements and Solution Context\n"
            "- Detailed Cost Analysis and Optimization\n"
            "- Risk Assessment and Mitigation\n"
            "- Implementation Roadmap"
        )
        table_hints = SECTION_TABLE_HINTS.get("Business", {})

    else:
        focus       = "Balanced, thorough documentation."
        sections    = "- Executive Summary\n- Architecture Analysis\n- Security Implementation"
        table_hints = {}

    prompt = build_prompt(docType, environment, sections, focus, table_hints)

    # temperature=0 → deterministic output; consistent cost estimates across runs
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(temperature=0.0)
    )

    try:
        response   = model.generate_content([prompt, image_part])
        clean_text = response.text.strip()
        clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
        clean_text = re.sub(r"\s*```$",           "", clean_text)
        parsed_data = json.loads(clean_text)
    except Exception as e:
        print(f"AI generation/parse error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI generation failed or returned invalid format: {e}"
        )

    title    = parsed_data.get("title", f"{docType} Architecture – {environment}")
    sections_data = parsed_data.get("sections", [])
    section_headings = [s.get("heading", "") for s in sections_data]

    # ── Build Word Document ──────────────────────────────────────────────────
    doc = Document()

    for section in doc.sections:
        section.top_margin    = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin   = Cm(3.0)
        section.right_margin  = Cm(2.5)

    # 1. Cover page
    _add_cover_page(doc, title, docType, environment)

    # 2. Page header / footer
    _add_page_numbers(doc, title)

    # 3. Table of Contents (manual — works immediately, no "Update Field" needed)
    _add_manual_toc(doc, section_headings)

    # 4. Architecture Diagram section
    _add_architecture_diagram(doc, file_bytes, mime_type)

    # 5. Main document title
    h1 = doc.add_heading(title, level=1)
    _style_heading(h1, 1)
    h1.paragraph_format.space_after = Pt(16)

    # 6. Content sections
    for sec in sections_data:
        heading_text = sec.get("heading", "Section")
        h2 = doc.add_heading(heading_text, level=2)
        _style_heading(h2, 2)   # sets keep_with_next=True internally
        h2.paragraph_format.space_before = Pt(20)
        h2.paragraph_format.space_after  = Pt(10)

        content = sec.get("content", [])
        if isinstance(content, str):
            content = _markdown_to_blocks(content)

        _render_blocks(doc, content, section_heading=heading_text)

        _add_horizontal_rule(doc, RULE_LIGHT)
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # ── Serialise ────────────────────────────────────────────────────────────
    buf = BytesIO()
    doc.save(buf)
    buf.seek(0)

    filename = f"Architecture_{docType}_{environment}.docx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.post("/api/interactive")
async def generate_interactive(file: UploadFile = File(...)):
    """
    Analyzes the uploaded architecture diagram and returns a rich JSON payload
    including bounding boxes for an interactive web dashboard.
    """
    try:
        file_bytes = await file.read()
        mime_type = file.content_type

        # If it's a docx, we need to extract the diagram image first
        if file.filename and file.filename.lower().endswith('.docx'):
            doc = Document(BytesIO(file_bytes))
            extracted_bytes = None
            for rel in doc.part.rels.values():
                if "image" in rel.target_ref:
                    extracted_bytes = rel.target_part.blob
                    mime_type = "image/png"  # Default assumption for extracted
                    break
            
            if not extracted_bytes:
                raise ValueError("No architecture diagram found inside the uploaded .docx file.")
            file_bytes = extracted_bytes

        # Fallback MIME if generic
        if mime_type in ["application/octet-stream", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ""]:
            mime_type = "image/png"

        image_part = {"mime_type": mime_type, "data": file_bytes}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file or diagram extraction failed: {e}")

    prompt = """
    You are an expert Cloud Architect. Analyze this architecture diagram.
    Extract the architecture details into a STRICT JSON payload.

    Your task is to locate EVERY single GCP service icon with PIXEL-PERFECT ACCURACY.
    
    GROUNDING RULES (MANDATORY):
    - Use your native [ymin, xmin, ymax, xmax] spatial grounding scale [0-1000].
    - 0 is the ABSOLUTE LEFT EDGE of the image file.
    - 1000 is the ABSOLUTE RIGHT EDGE of the image file.
    - The [ymin, xmin, ymax, xmax] box must surround ONLY the square/rectangular icon of the resource.
    - DO NOT include labels or text in the boxes.
    - CALIBRATION: If there is white space on the left, account for it. 0 is the start of the white space, not the start of the icons.
    
    Structure:
    {
      "cost_estimate": "Concise monthly cost range (e.g., '$150 - $250')",
      "cost_details": "Paragraph explaining the main cost drivers.",
      "security_score": 85,
      "security_summary": "A 2-3 sentence summary of the security posture.",
      "terraform_skeleton": "Valid HCL code for the main resources.",
      "simulation_parameters": [
        {
          "id": "parameter-slug",
          "label": "User-facing label (e.g., Requests per Second)",
          "min": 10,
          "max": 10000,
          "default_value": 100,
          "unit": "req/s"
        }
      ],
      "components": [
        {
          "id": "...",
          "name": "...",
          "service": "...",
          "service_type": "GCP icon type",
          "description": "Short purpose or function of this component.",
          "cost": "Rough cost estimate for this specific item (e.g. $20)",
          "security": "Security capabilities or requirements for this item.",
          "box_2d": [ymin, xmin, ymax, xmax]
        }
      ]
    }
    
    CRITICAL: The 'simulation_parameters' array should contain 3 to 5 relevant metrics that would stress-test THIS specific architecture (e.g., Active Users, Database Queries/sec, Payload Size(MB), Data Ingestion Rate).
    """

    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            temperature=0.0
        )
    )

    try:
        response = model.generate_content([prompt, image_part])
        raw_text = response.text
        # DEBUG: Save raw response
        with open("gemini_debug.json", "w", encoding="utf-8") as f:
            f.write(raw_text)
            
        clean_text = raw_text.strip()
        # Fallback if the model still wraps in markdown despite response_mime_type
        clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
        clean_text = re.sub(r"\s*```$", "", clean_text)
        data = json.loads(clean_text)
        return data
    except Exception as e:
        print(f"Interactive API generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Interactive API failure: {e}")

class SimulationRequest(BaseModel):
    architectureJson: dict
    simulationState: dict
    scenarioPreset: str = "custom"
    failureSimulation: list = []
    isMultiRegion: bool = False

@app.post("/api/simulate")
async def simulate_traffic(request: SimulationRequest):
    """
    Takes the extracted architecture, user-selected slider values, and advanced toggles,
    then asks the AI to simulate the infrastructure impact.
    """
    arch_summary = request.architectureJson.get("components", [])
    arch_services = [c.get("service") for c in arch_summary if c.get("service")]
    
    state_str = "\\n".join([f"- {k}: {v}" for k, v in request.simulationState.items()])
    
    # Inject advanced context into the prompt
    context_str = f"Scenario Preset: {request.scenarioPreset}\n"
    context_str += f"Multi-Region Deployment Enabled: {request.isMultiRegion}\n"
    if request.failureSimulation:
        context_str += f"SIMULATED FAILURES: {', '.join(request.failureSimulation)}\n"
        context_str += "CRITICAL: You MUST factor these failures into your response (e.g. show failover latency, degraded capacity scaling, specific bottleneck warnings)."
    
    prompt = f"""
    You are an expert Site Reliability Engineer and Cloud Architect.
    
    Here is an architecture composed of the following services:
    {', '.join(arch_services)}
    
    The user is running a traffic simulation with the following workload parameters:
    {state_str}
    
    ADVANCED CONFIGURATION:
    {context_str}
    
    Analyze the Infrastructure Impact of this specific workload and configuration on this architecture.
    Return a STRICT JSON response exactly matching this structure (fill in the data realistically based on the provided workload):
    
    {{
      "impact_summary": "A high-level 2-3 sentence summary of how the architecture handles this load.",
      "bottlenecks": [
        "A specific bottleneck or point of failure (e.g., 'Cloud SQL read replica might lag behind primary due to high write volume.')"
      ],
      "bottleneck_components": [
        "component-slug-id"  // IDs of components that are stressed (must map to actual components in the architecture)
      ],
      "cost_impact": "Explain how this workload affects the monthly bill (e.g., 'Expect a 3x increase in network egress costs.')",
      "scaling_suggestions": [
        "A concrete actionable step to handle this load (e.g., 'Increase the max instances of the App Engine frontend from 10 to 50.')"
      ],
      "scaling_result": [
        {{ "service": "App Engine", "previous_instances": 4, "new_instances": 18 }}
      ],
      "latency_prediction": [
        {{ "tier": "Frontend", "latency_ms": 120 }},
        {{ "tier": "Database", "latency_ms": 70 }}
      ],
      "cost_breakdown": [
        {{ "service": "Compute Engine", "monthly_cost": 2800 }},
        {{ "service": "Network Egress", "monthly_cost": 3200 }}
      ],
      "optimizations": [
        {{ "title": "Add Cloud CDN", "description": "Reduce egress cost by caching static assets deeper.", "cost_reduction_percentage": 40 }}
      ],
      "carbon_footprint": {{
        "estimated_co2_kg": 480,
        "optimization_suggestion": "Switch to ARM instances for worker nodes.",
        "potential_reduction_percentage": 28
      }},
      "infrastructure_limits": [
        {{ "service": "Cloud SQL", "limit_description": "Connection Limit", "threshold_value": 4000 }}
      ]
    }}
    """
    
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    try:
        response = model.generate_content(prompt)
        clean_text = response.text.strip()
        clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
        clean_text = re.sub(r"\s*```$", "", clean_text)
        data = json.loads(clean_text)
        return {"report": data}
    except Exception as e:
        print(f"Simulation API error: {e}")
        raise HTTPException(status_code=500, detail=f"Simulation API failure: {e}")

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

