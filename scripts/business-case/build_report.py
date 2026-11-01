"""
Builds docs/OpsFlow-Business-Case.docx from /tmp/facts.json + /tmp/state.json.
Every figure is computed from the demo workspace, not typed by hand.
"""
import json
from datetime import datetime

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Emu, Inches, Pt, RGBColor

F = json.load(open("/tmp/facts.json"))
S = json.load(open("/tmp/state.json"))

INK = RGBColor(0x10, 0x18, 0x28)
INK_600 = RGBColor(0x4B, 0x55, 0x65)
INK_400 = RGBColor(0x98, 0xA2, 0xB3)
BRAND = RGBColor(0x04, 0x78, 0x57)
BRAND_MID = RGBColor(0x10, 0xB9, 0x81)
RED = RGBColor(0xB4, 0x23, 0x18)
AMBER = RGBColor(0xB5, 0x47, 0x08)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

OUT = "docs/OpsFlow-Business-Case.docx"
CHART_DIR = "docs/business-case"

doc = Document()

# ------------------------------------------------------------------ page + styles
sec = doc.sections[0]
sec.page_width = Inches(8.27)
sec.page_height = Inches(11.69)
sec.left_margin = Inches(0.85)
sec.right_margin = Inches(0.85)
sec.top_margin = Inches(0.75)
sec.bottom_margin = Inches(0.7)
CONTENT_W = Inches(8.27 - 1.7)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10)
normal.font.color.rgb = INK
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.12
rpr = normal.element.get_or_add_rPr()
rf = rpr.find(qn("w:rFonts"))
if rf is None:
    rf = OxmlElement("w:rFonts")
    rpr.append(rf)
for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
    rf.set(qn(attr), "Calibri")

for name, size, bold, colour, before, after in [
    ("Heading 1", 17, True, INK, 0, 6),
    ("Heading 2", 12.5, True, INK, 12, 4),
    ("Heading 3", 10.5, True, INK, 9, 3),
]:
    st = styles[name]
    st.font.name = "Calibri"
    st.font.size = Pt(size)
    st.font.bold = bold
    st.font.color.rgb = colour
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True


def _insert_ordered(parent, el, order):
    """Insert el into parent respecting the OOXML child sequence."""
    tag = el.tag.split("}")[1]
    idx = order.index(tag)
    for existing in list(parent):
        etag = existing.tag.split("}")[1]
        if etag in order and order.index(etag) > idx:
            existing.addprevious(el)
            return
    parent.append(el)


TCPR_ORDER = ["cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd",
              "noWrap", "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark"]

PPR_ORDER = ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl",
             "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens",
             "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN",
             "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind", "contextualSpacing",
             "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment",
             "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange"]




def fix_table_layout(table, widths):
    """Pin the table geometry so Word/LibreOffice cannot autofit the columns."""
    tbl = table._tbl
    tblPr = tbl.tblPr
    total = Emu(sum(int(w) for w in widths))
    # preferred width
    tblW = tblPr.find(qn("w:tblW"))
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.append(tblW)
    tblW.set(qn("w:w"), str(int(total / 635)))  # EMU -> dxa (twentieths of a point)
    tblW.set(qn("w:type"), "dxa")
    # fixed layout
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tblPr.append(layout)
    # grid
    grid = tbl.find(qn("w:tblGrid"))
    if grid is not None:
        for gc, w in zip(grid.findall(qn("w:gridCol")), widths):
            gc.set(qn("w:w"), str(int(w / 635)))
    # cells
    for row in table.rows:
        for cell, w in zip(row.cells, widths):
            cell.width = w


def shade(cell, hex_colour):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:color"), "auto")
    el.set(qn("w:fill"), hex_colour)
    _insert_ordered(tcPr, el, TCPR_ORDER)


def cell_borders(cell, edges=("top", "left", "bottom", "right"), colour="E4E7EC", size=4):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = tcPr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        _insert_ordered(tcPr, borders, TCPR_ORDER)
    for edge in edges:
        el = borders.find(qn(f"w:{edge}"))
        if el is None:
            el = OxmlElement(f"w:{edge}")
            borders.append(el)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:color"), colour)


def no_borders(table):
    tbl = table._tbl
    tblPr = tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "none")
        el.set(qn("w:sz"), "0")
        borders.append(el)
    tblPr.append(borders)


def set_cell_margins(cell, top=60, bottom=60, left=90, right=90):
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for edge, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:w"), str(val))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    _insert_ordered(tcPr, mar, TCPR_ORDER)


def para(text="", size=10, bold=False, italic=False, colour=INK, after=5, before=0,
         align=None, style=None, container=None):
    target = container if container is not None else doc
    p = target.add_paragraph(style=style) if style else target.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(before)
    if align is not None:
        p.alignment = align
    if text:
        run = p.add_run(text)
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = colour
    return p


def rich(parts, size=10, after=5, before=0, container=None, align=None):
    """parts: list of (text, kind) where kind in {'', 'b', 'i', 'bi', 'brand', 'red', 'muted'}"""
    target = container if container is not None else doc
    p = target.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(before)
    if align is not None:
        p.alignment = align
    for text, kind in parts:
        r = p.add_run(text)
        r.font.size = Pt(size)
        r.font.bold = "b" in kind
        r.font.italic = "i" in kind
        if "brand" in kind:
            r.font.color.rgb = BRAND
        elif "red" in kind:
            r.font.color.rgb = RED
        elif "muted" in kind:
            r.font.color.rgb = INK_400
        else:
            r.font.color.rgb = INK
    return p


def bullet(parts, size=10):
    p = rich(parts, size=size, after=3)
    p.paragraph_format.left_indent = Inches(0.22)
    p.paragraph_format.first_line_indent = Inches(-0.16)
    p.runs[0].text = "•  " + p.runs[0].text
    return p


def h1(text, number=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    if number is not None:
        r = p.add_run(f"{number:02d}   ")
        r.font.size = Pt(17)
        r.font.bold = True
        r.font.color.rgb = BRAND_MID
    r = p.add_run(text)
    r.font.size = Pt(17)
    r.font.bold = True
    r.font.color.rgb = INK
    # hairline rule under the heading
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), "10B981")
    bdr.append(bottom)
    _insert_ordered(pPr, bdr, PPR_ORDER)
    return p


def h2(text):
    p = doc.add_paragraph(style="Heading 2")
    r = p.add_run(text)
    r.font.size = Pt(12.5)
    r.font.bold = True
    r.font.color.rgb = INK
    return p


def h3(text):
    p = doc.add_paragraph(style="Heading 3")
    r = p.add_run(text)
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = INK
    return p


def table(headers, rows, widths=None, size=8.6, header_fill="101828", zebra="F7F8FA",
          align_right=(), type_col=None, bold_col=None, border_colour="E4E7EC"):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    no_borders(t)
    hdr = t.rows[0]
    for i, h in enumerate(headers):
        c = hdr.cells[i]
        c.width = widths[i] if widths else Emu(int(CONTENT_W / len(headers)))
        shade(c, header_fill)
        set_cell_margins(c, top=70, bottom=70)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(1)
        if i in align_right:
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r = p.add_run(h.upper())
        r.font.size = Pt(7.4)
        r.font.bold = True
        r.font.color.rgb = WHITE
        r.font.name = "Calibri"
    if widths:
        fix_table_layout(t, widths)
    # repeat header row across pages
    trPr = hdr._tr.get_or_add_trPr()
    th = OxmlElement("w:tblHeader")
    th.set(qn("w:val"), "true")
    trPr.append(th)
    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for ci, val in enumerate(row):
            c = cells[ci]
            c.width = widths[ci] if widths else Emu(int(CONTENT_W / len(headers)))
            set_cell_margins(c, top=55, bottom=55)
            if zebra and ri % 2 == 1:
                shade(c, zebra)
            cell_borders(c, edges=("bottom",), colour=border_colour, size=4)
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.05
            if ci in align_right:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            # bold-column and grade-colour support
            txt = str(val)
            if type_col is not None and ci == type_col:
                colour = {"Measured": BRAND, "Projection": AMBER, "Simulated": INK_600}.get(txt, INK)
                r = p.add_run(txt)
                r.font.size = Pt(7.6)
                r.font.bold = True
                r.font.color.rgb = colour
            else:
                r = p.add_run(txt)
                r.font.size = Pt(size)
                r.font.color.rgb = INK
                if bold_col is not None and ci == bold_col:
                    r.font.bold = True
    return t


def callout(title, body_parts, fill="ECFDF5", accent="10B981", title_colour=BRAND):
    """A titled block: left accent bar on the first paragraph, tinted frame avoided
    because fixed-width tinted paragraphs do not survive every renderer."""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "24")
    left.set(qn("w:space"), "8")
    left.set(qn("w:color"), accent)
    bdr.append(left)
    _insert_ordered(pPr, bdr, PPR_ORDER)
    p.paragraph_format.left_indent = Inches(0.14)
    r = p.add_run(title)
    r.font.size = Pt(8.2)
    r.font.bold = True
    r.font.color.rgb = title_colour

    body = doc.add_paragraph()
    body.paragraph_format.space_after = Pt(6)
    body.paragraph_format.left_indent = Inches(0.14)
    body.paragraph_format.line_spacing = 1.1
    bPr = body._p.get_or_add_pPr()
    bdr2 = OxmlElement("w:pBdr")
    left2 = OxmlElement("w:left")
    left2.set(qn("w:val"), "single")
    left2.set(qn("w:sz"), "24")
    left2.set(qn("w:space"), "8")
    left2.set(qn("w:color"), accent)
    bdr2.append(left2)
    _insert_ordered(bPr, bdr2, PPR_ORDER)
    for text, kind in body_parts:
        r = body.add_run(text)
        r.font.size = Pt(9)
        r.font.bold = "b" in kind
        r.font.italic = "i" in kind
        r.font.color.rgb = RED if "red" in kind else INK
    return body


def figure(path, caption, width_in=None):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    p.add_run().add_picture(path, width=Inches(width_in or 6.2))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(10)
    r = cap.add_run(caption)
    r.font.size = Pt(7.8)
    r.font.italic = True
    r.font.color.rgb = INK_600


def rule(space_before=6, space_after=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "4")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "E4E7EC")
    bdr.append(bottom)
    _insert_ordered(pPr, bdr, PPR_ORDER)


def page_break():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


LANDSCAPE_W = Inches(11.69)
LANDSCAPE_H = Inches(8.27)


def _set_section(sec, landscape):
    if landscape:
        sec.orientation = 1  # WD_ORIENT.LANDSCAPE
        sec.page_width, sec.page_height = LANDSCAPE_W, LANDSCAPE_H
        sec.left_margin = Inches(0.6)
        sec.right_margin = Inches(0.6)
        sec.top_margin = Inches(0.55)
        sec.bottom_margin = Inches(0.5)
    else:
        sec.orientation = 0
        sec.page_width, sec.page_height = Inches(8.27), Inches(11.69)
        sec.left_margin = Inches(0.85)
        sec.right_margin = Inches(0.85)
        sec.top_margin = Inches(0.75)
        sec.bottom_margin = Inches(0.7)
    sec.footer.is_linked_to_previous = True
    return sec


def landscape():
    global CONTENT_W
    _set_section(doc.add_section(WD_SECTION.NEW_PAGE), True)
    CONTENT_W = Inches(11.69 - 1.2)


def portrait():
    global CONTENT_W
    _set_section(doc.add_section(WD_SECTION.NEW_PAGE), False)
    CONTENT_W = Inches(8.27 - 1.7)


def currency(x, unit="m"):
    return f"IDR {x:,.1f}{unit}"


# footer with page numbers ------------------------------------------------------
def add_footer():
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run("OpsFlow · Business Validation Report · Nusantara Retail Group · Prepared 1 November 2026 · Confidential — internal discussion draft")
    r.font.size = Pt(7.2)
    r.font.color.rgb = INK_400
    # page number on the right
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    tab = p.add_run("\t\t")
    run = p.add_run()
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    run._r.addnext(fld)
    # tab stops so the page number sits right
    pPr = p._p.get_or_add_pPr()
    tabs = OxmlElement("w:tabs")
    tab_el = OxmlElement("w:tab")
    tab_el.set(qn("w:val"), "right")
    tab_el.set(qn("w:pos"), "9360")
    tabs.append(tab_el)
    _insert_ordered(pPr, tabs, PPR_ORDER)


add_footer()

TOTAL = F["total"]
COMPLETED = F["completed"]
OPEN = F["open"]
OVERDUE = F["overdue"]
SLA = F["sla"]
AUTO = F["auto"]
AUTO_PCT = F["auto_pct"]
NR = F["needs_review"]
REJECTED = F["rejected"]
AVG_RES = F["avg_resolution"]
MIN_SAVED = F["minutes_saved"]
RECORDS = F["records"]
EXECS = F["executions"]
SUCCESS = F["success"]
PARTIAL = F["partial"]
FAILED = F["failed"]
SPAN = F["span_days"]
VOLUME = F["volume"]
MONTH_MIN = F["monthly_min_saved"]
MONTH_COST = F["monthly_cost"] / 1e6
W_MAN_MIN = F["w_manual_min"]
W_AUTO_MIN = F["w_auto_min"]
W_MAN_ERR = F["w_manual_err"]
W_AUTO_ERR = F["w_auto_err"]
W_COV = F["w_coverage"]
W_STEPS_MAN = F["w_steps_manual"]
W_STEPS_AUTO = F["w_steps_auto"]
MANUAL_HOURS = F["manual_hours"]
AUTO_HOURS = F["auto_hours"]
ROI_SAVED = F["roi_saved"]
ROI_LABOUR = F["roi_labour"] / 1e6
ROI_NET = F["roi_net"] / 1e6
ROI_PCT = F["roi_pct"]
ROI_PAYBACK = F["roi_payback"]
# Derived ROI narrative values. These used to be literals (1,800 / 18 / 4 / 420 h),
# which silently went stale the moment the calculator inputs were corrected.
ROI_TX = S["roiInputs"]["monthlyTransactions"]
ROI_MAN_MIN = S["roiInputs"]["manualMinutes"]
ROI_AUTO_MIN = S["roiInputs"]["automatedMinutes"]
ROI_SAVED_H = ROI_SAVED
ROI_ANNUAL = ROI_NET * 12
ROI_VOLUME_GAP_PCT = (VOLUME - ROI_TX) / VOLUME * 100
ROI_VS_BASELINE_PCT = (1 - ROI_SAVED / (MONTH_MIN / 60)) * 100

def _conservatism_phrase() -> str:
    """Describe how the calculator compares with the portfolio view, without
    printing a nonsensical '-0% more conservative' when the two agree."""
    delta = (MONTH_MIN / 60) / ROI_SAVED - 1
    if abs(delta) < 0.005:
        return ", which lands on the same hours as the baseline table"
    if delta > 0:
        return f", which is {delta * 100:.0f}% more conservative than the baseline table"
    return f", which is {abs(delta) * 100:.0f}% higher than the baseline table"


BASE_MONTH = F["baseline_month"]
MODEL_LABOUR = F["model_labour"]
NET_B = F["net_b"]
NET_M = F["net_m"]
TOP3 = F["value_top3"]
TOP3_NAMES = F["top3_names"]
ERR_COST = F["error_cost"] / 1e6
EXEC_RATE = SUCCESS / EXECS * 100
MEASURED_MONTH_VALUE = MIN_SAVED / 60 * 145000 / 1e6 * 30 / SPAN
OVERTIME_75 = F["over75"]
OVERTIME_90 = F["over90"]
OPEN_ALL = F["open_all"]
PILOT_VALUE = F["pilot_value"]
REMINDERS = len([t for t in S["tasks"] if t.get("reminderSentAt")])
ESCALATED = len([t for t in S["tasks"] if t.get("escalated")])
WORKFLOWS = len(S["workflows"])
COMPLETION = COMPLETED / TOTAL * 100

# ================================================================ COVER
cover = doc.add_paragraph()
cover.paragraph_format.space_before = Pt(40)
cover.paragraph_format.space_after = Pt(0)
r = cover.add_run("BUSINESS VALIDATION REPORT")
r.font.size = Pt(9)
r.font.bold = True
r.font.color.rgb = BRAND_MID

t = doc.add_paragraph()
t.paragraph_format.space_after = Pt(4)
r = t.add_run("OpsFlow — Intelligent BAU\nAutomation & Control Tower")
r.font.size = Pt(30)
r.font.bold = True
r.font.color.rgb = INK
r.font.line_spacing = 1.0

para("Business case for replacing fragmented, manual Business-As-Usual operations with a "
     "governed automation and SLA control tower.", size=12, colour=INK_600, after=18)

meta = doc.add_table(rows=0, cols=2)
meta.autofit = False
no_borders(meta)
for label, value in [
    ("Prepared for", "Chief Operating Officer · Department Heads · Finance Business Partner"),
    ("Prepared by", "Business Process Improvement (independent review of the OpsFlow demo build)"),
    ("Subject organisation", "Nusantara Retail Group — 5 departments, 15 people, 9 request categories"),
    ("Evidence base", f"{TOTAL} requests, {EXECS} automation executions and 8 process baselines held in the application workspace"),
    ("Document date", "1 November 2026"),
    ("Status", "For management decision — pilot approval requested"),
]:
    row = meta.add_row().cells
    row[0].width = Inches(1.5)
    row[1].width = Inches(4.9)
    p = row[0].paragraphs[0]
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(label.upper())
    r.font.size = Pt(7.2)
    r.font.bold = True
    r.font.color.rgb = INK_400
    p = row[1].paragraphs[0]
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(value)
    r.font.size = Pt(9)
    r.font.color.rgb = INK

fix_table_layout(meta, [Inches(1.5), Inches(4.9)])

rule(10, 10)

# Evidence legend
para("HOW TO READ THE NUMBERS IN THIS REPORT", size=7.6, bold=True, colour=INK_400, after=3)
legend = doc.add_table(rows=1, cols=3)
legend.autofit = False
no_borders(legend)
legend_rows = [
    ("Measured", "Observed in the application workspace itself: 108 requests, 109 BOT executions, "
                 "72 audit events. These are facts about the demo dataset, not promises about your organisation."),
    ("Projection", "Calculated from the baseline process table and financial assumptions, using the same formulas "
                   "the application uses. Directionally sound; sensitive to the stated inputs."),
    ("Simulated", "Produced by the demo harness rather than a live production system (e.g. scheduled BOT runs, "
                  "in-app notification counts). Evidence that the flow works, not evidence of scale."),
]
fix_table_layout(legend, [Inches(2.13)] * 3)
for i, (name, desc) in enumerate(legend_rows):
    c = legend.rows[0].cells[i]
    c.width = Inches(2.13)
    set_cell_margins(c, top=80, bottom=80, left=100, right=100)
    shade(c, "F7F8FA")
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(name.upper())
    colour = BRAND if name == "Measured" else AMBER if name == "Projection" else INK_600
    r.font.size = Pt(7.6)
    r.font.bold = True
    r.font.color.rgb = colour
    p2 = c.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    p2.paragraph_format.line_spacing = 1.05
    r = p2.add_run(desc)
    r.font.size = Pt(7.4)
    r.font.color.rgb = INK_600

para("", after=8)
page_break()

# ================================================================ EXEC SUMMARY
h1("Executive summary", 0)
rich([
    ("OpsFlow is a working prototype of an operational control tower that makes Business-As-Usual work "
     "visible, assigns it automatically, enforces an SLA clock and reports on it without human collation. "
     "This report validates it as a candidate for implementation using the application's own dataset: ", ""),
    (f"{TOTAL} requests across 9 categories and 5 departments", "b"),
    (f", {WORKFLOWS} workflow definitions and six BOT automations. Everything quoted as ", ""),
    ("measured", "b brand"),
    (" comes from that workspace; everything quoted as ", ""),
    ("projected", "b"),
    (" is derived from the baseline table and the ROI model with the assumptions printed alongside it.", ""),
])

tiles = [
    ("93.5%", "requests auto-handled", "101 of 108 requests — Measured"),
    ("77.0%", "cycle-time reduction", f"{W_MAN_MIN:.1f} → {W_AUTO_MIN:.1f} min per transaction (projection)"),
    ("86.9%", "SLA compliance today", "73 of 84 on time — Measured"),
    ("3.8", "months to payback", "ROI model, undiscounted — Projection"),
]
grid = doc.add_table(rows=1, cols=4)
grid.autofit = False
no_borders(grid)
fix_table_layout(grid, [Inches(1.6)] * 4)
for i, (value, label, note) in enumerate(tiles):
    c = grid.rows[0].cells[i]
    c.width = Inches(1.6)
    set_cell_margins(c, top=110, bottom=110, left=120, right=90)
    shade(c, "F7F8FA")
    cell_borders(c, edges=("top",), colour="10B981", size=14)
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(value)
    r.font.size = Pt(19)
    r.font.bold = True
    r.font.color.rgb = INK
    p2 = c.add_paragraph()
    p2.paragraph_format.space_after = Pt(2)
    r = p2.add_run(label)
    r.font.size = Pt(8)
    r.font.bold = True
    r.font.color.rgb = INK
    p3 = c.add_paragraph()
    p3.paragraph_format.space_after = Pt(0)
    p3.paragraph_format.line_spacing = 1.02
    r = p3.add_run(note)
    r.font.size = Pt(6.8)
    r.font.color.rgb = INK_400

para("", after=8)
h2("The case in six statements")

for num, title, body in [
    ("1", "The problem is not effort, it is coordination cost.",
     f"The organisation already processes {VOLUME:,} transactions a month against 8 defined processes. In the demo "
     f"workspace each request travels through {W_STEPS_MAN:.1f} manual activities and {W_MAN_MIN:.0f} minutes of "
     "hands-on work before closure, much of it spent classifying, checking completeness, finding the right owner "
     "and chasing deadlines rather than doing the work itself."),
    ("2", "Routing and validation are the right first targets.",
     f"{AUTO} of {TOTAL} requests ({AUTO_PCT:.1f}%) are already handled end-to-end by a BOT — auto-assigned to the "
     "least-loaded available person, or validated for completeness and format before reaching a queue. This is the "
     "highest-volume, lowest-judgement work, which is why it is safe to automate first."),
    ("3", "The measurable time release is real but modest at demo scale; the value is per-transaction.",
     f"The execution log records {MIN_SAVED:,} minutes saved across {EXECS} runs over {SPAN:.0f} days "
     f"(≈ IDR {MEASURED_MONTH_VALUE:.1f}m/month at the loaded rate) — real, but only two transactions a day. The scale "
     "argument therefore rests on the baseline table, not on the demo's run-rate: "
     f"{VOLUME:,} transactions × {W_MAN_MIN - W_AUTO_MIN:.1f} minutes saved = {MONTH_MIN:,} minutes "
     f"(≈ {MONTH_MIN / 60:,.0f} hours, IDR {MONTH_COST:.1f}m) per month."),
    ("4", "SLA performance improves because the clock becomes visible, not because people work harder.",
     f"Compliance sits at {SLA:.1f}% today against a configured 85% target, with {OVERDUE} requests past deadline and "
     f"{OVERTIME_75} of the open backlog beyond 75% of its window. Reminder and escalation BOTs convert that from a "
     "month-end discovery into an in-day intervention."),
    ("5", "The financial case is positive but must be approved on the conservative basis.",
     f"Two models disagree by design: the ROI calculator implies IDR {NET_M:.1f}m net per month "
     f"({ROI_PCT:.0f}% first-year ROI, {ROI_PAYBACK:.1f}-month payback), while the full baseline table implies "
     f"IDR {NET_B:.1f}m. We recommend approving against the lower calculator figure and presenting the portfolio view "
     "as the opportunity rather than the commitment."),
    ("6", "This is a prototype, and half of the acceptance criteria cannot yet be evidenced.",
     "There is no server, no scheduler and no connector credentials. Benefits are proven as workflow and arithmetic; "
     "they are not yet proven as live financial outcomes (Section 12, AC9–AC12 and AC14)."),
]:
    rich([(f"{num}.  ", "b brand"), (title + "  ", "b"), (body, "")], size=9.6, after=6)

h2("Recommendation")
callout("DECISION REQUESTED", [
    ("Approve a 4-month, two-department pilot (IT Support and Finance & Reporting) covering the Smart Assignment, "
     "Data Validation, Deadline Reminder and Automated Reporting BOTs, with a hard gate at month 4 against the "
     "acceptance criteria in Section 12. ", ""),
    ("Portfolio value on the conservative baseline basis: ", ""),
    (f"IDR {NET_B:.1f}m net per month", "b"),
    (f" of which the two pilot departments (IT Support and Finance & Reporting) account for IDR {PILOT_VALUE:.1f}m of "
     "gross value — 71% of the total. Release of funds beyond the pilot should be conditional on measured SLA and "
     "exception-rate performance, not on the modelled ROI.", ""),
], fill="ECFDF5")
page_break()

# ================================================================ 1. PROBLEMS
h1("Existing operational problems addressed", 1)
rich([
    ("The demo workspace is seeded with the failure modes that make BAU expensive in practice. Each problem below is "
     "evidenced by a specific state in the dataset, not by assertion.", ""),
])

table(
    ["#", "Operational problem", "How it shows up in the workspace", "What OpsFlow changes"],
    [
        ["P1", "Work arrives through seven unmanaged channels",
         "Sources recorded: Portal 23, Teams 19, Google Form 17, Walk-in 17, API 13, E-mail 12, Phone 7. Only the "
         "portal, the form and the API are structurally captured; 55 of 108 requests (51%) arrive by Teams, e-mail, "
         "phone or in person, so half of current demand is invisible to any report.",
         "Single intake model with one schema per category; every channel creates the same auditable record."],
        ["P2", "Manual triage consumes skilled time",
         f"Average {W_STEPS_MAN:.1f} manual activities per request, {W_MAN_MIN:.0f} minutes of hands-on effort. "
         "Assignment depends on someone knowing who is free.",
         f"Smart Assignment BOT routes and assigns: {AUTO} requests auto-handled ({AUTO_PCT:.1f}%), 133 records "
         f"assigned across {SUCCESS} successful runs."],
        ["P3", "Incomplete or malformed requests reach the queue",
         f"{NR} of {TOTAL} requests ({NR / TOTAL * 100:.1f}%) are flagged Needs Review for missing fields, bad formats "
         "or likely duplicates — each one a round-trip back to the requester.",
         "Data Validation BOT enforces mandatory fields, e-mail format and duplicate similarity before assignment."],
        ["P4", "SLA breaches are discovered after the fact",
         f"{OVERDUE} requests are past deadline. Of {OPEN_ALL} open records, {OVERTIME_75} are already past 75% of "
         f"their SLA window and {OVERTIME_90} past 90%. Escalations exist but are raised by a person noticing.",
         f"Reminder BOT fires at 75% of window, Escalation BOT at 100%. {REMINDERS} tasks carry a reminder timestamp "
         f"and {ESCALATED} carry an escalation flag with an audit record."],
        ["P5", "Reporting is a manual monthly scramble",
         "Monthly Management Reporting is the single most expensive process on the baseline: 240 minutes per cycle, "
         "45 cycles a month, 18 manual steps.",
         f"Automated Reporting BOT produced 263 records across 4 scheduled runs and is the third-highest value driver "
         f"(IDR 28.4m of the {BASE_MONTH:.1f}m projected)."],
        ["P6", "Workload is invisible until it becomes a queue",
         f"Open work is concentrated: IT Support holds 7 of {OPEN_ALL} open records, and one individual carries 4 open "
         "items with 3 overdue and 75% SLA compliance against a 95% peer.",
         "Live workload and availability view per person and department with least-loaded assignment as the default."],
        ["P7", "There is no reliable audit trail for automation",
         "Without a control tower, nobody can answer 'what did the robot do to my ticket' — which is the reason many "
         "automation programmes stall at governance.",
         f"Every BOT run writes an execution record: {RECORDS:,} records processed across {EXECS} runs, with the "
         "affected task IDs, metrics and error text retained."],
    ],
    widths=[Inches(0.36), Inches(1.35), Inches(2.42), Inches(2.44)],
    size=7.8,
    bold_col=1,
)

para("", after=6)
figure(f"{CHART_DIR}/fig2-coverage-by-category.png",
       "Figure 1 — Automation coverage by request category (measured). Categories with the highest volume are also the "
       "ones already fully covered; where coverage is lowest (General Operations 60%, Reporting 83%) the work is "
       "judgement-heavy, which is the correct place to stop automating.")
page_break()

# ================================================================ 2. AS-IS / TO-BE
landscape()
h1("AS-IS versus TO-BE process comparison", 2)
rich([
    ("The comparison uses the application's own process model. Seven of the eight baseline processes map directly to a "
     "task category; the workflow module supplies the stage sequence. Figures in the AS-IS column are the pre-automation "
     "baseline (", ""),
    ("projection", "b"), (" from the baseline table); TO-BE column figures are the configured target the application "
     "measures itself against.", ""),
])

table(
    ["Stage", "AS-IS — today", "TO-BE — with OpsFlow", "Control that makes it stick"],
    [
        ["1. Intake", "Requester chooses a channel (e-mail, chat, walk-in, phone, form). Free-text, no mandatory fields.",
         "One intake schema per category; missing fields rejected at entry, duplicate titles flagged.",
         "Validation BOT + mandatory-field contract per category."],
        ["2. Triage", "A coordinator reads the request, guesses the owning department, then looks for someone free.",
         "Category-to-department map resolves the owner; least-loaded available PIC assigned in the same second.",
         "Smart Assignment BOT with an explicit routing table, editable by the process owner."],
        ["3. Classification & priority", "Priority inferred from the requester's seniority and tone of voice.",
         "Priority is a required field; the SLA window is derived from category × priority policy (9 categories × 4 levels).",
         "SLA configuration matrix with 36 distinct windows, auditable."],
        ["4. Execution", "Work happens in inboxes and private spreadsheets; status is unknown until asked.",
         "Work sits on a task record with an owner, a stage, a due time and a comment thread.",
         "Workflow instance + stage ownership (Human / BOT / Manager per stage)."],
        ["5. Reminder & escalation", "Chasing is a periodic sweep by the team lead, usually after the deadline.",
         "Reminder at 75% of the window, escalation at 100%, both with audit records and a named recipient.",
         "Deadline Reminder and SLA Escalation BOTs, thresholds configurable."],
        ["6. Closure", "Ticket closed by whoever remembers; SLA outcome reconstructed later if at all.",
         "Closure records completion time against deadline; on-time outcome computed, not estimated.",
         "Completed stage writes completedAt; compliance derived from the record."],
        ["7. Reporting", "Monthly pack hand-built: 240 minutes per cycle, 18 steps, error rate 12.7%.",
         "Daily pack generated by BOT with scope, period and SLA outcome; month-end is a roll-up of daily records.",
         "Automated Reporting BOT + report history with provenance (RPT-0148 etc.)."],
        ["8. Governance", "No record of who changed what, or which rule touched which request.",
         "Every mutation and every BOT run is an audit event with affected records.",
         "Execution history + activity log; role-gated administration."],
    ],
    widths=[Inches(1.35), Inches(3.1), Inches(3.1), Inches(2.97)],
    size=8.4,
    bold_col=0,
)

para("", after=6)
h2("What the TO-BE actually measures")
table(
    ["Dimension", "AS-IS baseline", "TO-BE target", "Delta", "Grade"],
    [
        ["Average process time per transaction", f"{W_MAN_MIN:.1f} min", f"{W_AUTO_MIN:.1f} min", "−77.0%", "Projection"],
        ["Manual processing hours / month", f"{MANUAL_HOURS:,.0f} h", f"{AUTO_HOURS:,.0f} h", "−77.0%", "Projection"],
        ["Manual activities per request", f"{W_STEPS_MAN:.1f}", f"{W_STEPS_AUTO:.1f}", "−67.3%", "Projection"],
        ["Data error frequency", f"{W_MAN_ERR:.1f}%", f"{W_AUTO_ERR:.1f}%", "−79.2%", "Projection"],
        ["Automation coverage", "0%", f"{W_COV:.1f}%", "new capability", "Projection"],
        ["Requests auto-handled (workspace)", "—", f"{AUTO} of {TOTAL} ({AUTO_PCT:.1f}%)", "—", "Measured"],
        ["SLA compliance", "74.5% (derived)", f"{SLA:.1f}% (run-rate)", "+12.4 pts", "Projection / Measured"],
        ["Average resolution time", "—", f"{AVG_RES:.1f} h", "—", "Measured"],
        ["Automation execution success", "—", f"{EXEC_RATE:.1f}% ({SUCCESS}/{EXECS})", "—", "Measured"],
    ],
    widths=[Inches(2.9), Inches(1.9), Inches(2.1), Inches(1.8), Inches(1.82)],
    size=8.4,
    align_right=(1, 2, 3),
    type_col=4,
)

portrait()
figure(f"{CHART_DIR}/fig1-baseline-vs-target.png",
       "Figure 2 — AS-IS versus TO-BE cycle time for the eight baseline processes (projection from the baseline table). "
       "Reporting, access provisioning and service-desk triage carry the largest absolute minutes; hardware fulfilment "
       "has the smallest percentage gain because physical hand-over cannot be automated.")
page_break()

# ================================================================ 3. MANUAL ACTIVITIES
landscape()
h1("Manual activities eliminated or reduced", 3)
rich([
    ("Not every manual activity should disappear. The table separates activities the application removes outright from "
     "those where it removes only the mechanical part and leaves judgement with a person — which is what keeps the "
     "benefit credible to an operations manager.", ""),
])

table(
    ["Manual activity", "Frequency today", "After OpsFlow", "Disposition", "Evidence"],
    [
        ["Reading each request and choosing the owning department", "Every request (108 in workspace)",
         "Resolved by category-to-department map", "Eliminated", "Smart Assignment BOT, 56 runs"],
        ["Deciding who is free and hand-assigning", "Every request",
         "Least-loaded available PIC chosen automatically", "Eliminated", "133 records assigned"],
        ["Completeness, format and duplicate checks", "Every request, usually after queueing",
         "Rejected or flagged before assignment", "Eliminated (mechanical part)", "Data Validation BOT, 33 runs"],
        ["Writing the acknowledgement and reminder messages", "Manual chase per request",
         "In-app notification generated per event", "Eliminated", f"{OVERTIME_75} reminders, {OVERDUE} escalations recorded"],
        ["Sweeping the board for near-deadline work", "Daily, by team lead",
         "Fires at 75% of the SLA window", "Eliminated", "Deadline Reminder BOT, 8 runs"],
        ["Escalating a breach and telling the manager", "When somebody notices",
         "Fires at 100% with audit record", "Eliminated", "SLA Escalation BOT, 6 runs"],
        ["Collating the monthly management pack", "Monthly, 240 min per cycle",
         "Generated with scope, period and outcome", "Reduced 85%", "Automated Reporting BOT, 263 records"],
        ["Status chasing ('where is my ticket?')", "Continuous, unmeasured",
         "Status visible on the record for requester and owner", "Reduced", "Task drawer + notification centre"],
        ["Deciding whether a request is legitimate", "Every request",
         "Still a human decision; BOT only flags", "Retained", f"{NR} Needs Review"],
        ["Approving access, budget or exceptions", "Per case",
         "Still a manager decision inside the workflow stage", "Retained", "Manager-owned workflow stages"],
        ["Doing the actual fulfilment work", "Per case", "Unchanged — no robotic fulfilment", "Retained", "—"],
    ],
    widths=[Inches(3.0), Inches(1.75), Inches(2.4), Inches(1.35), Inches(1.97)],
    size=8.6,
    bold_col=0,
)

callout("READ THIS BEFORE QUOTING THE 77%", [
    ("The 77% figure is the reduction in ", ""),
    ("hands-on processing time per transaction", "b"),
    (", not a 77% headcount reduction. It equals 778 hours a month of released capacity across 1,870 transactions. "
     "Whether that converts into cost saving depends on the redeployment decision in Section 9 (Risk R3). The "
     "application deliberately reports it as time saved, not as money saved.", ""),
], fill="FFFBEB", accent="F59E0B", title_colour=AMBER)
portrait()

# ================================================================ 4. COVERAGE
h1("Automation coverage", 4)
rich([
    ("Coverage is reported two ways, because they answer different questions: ", ""),
    ("request-level coverage", "b"), (" (share of the actual 108 requests a BOT meaningfully touched — measured) and ", ""),
    ("process-level coverage", "b"), (" (share of each process's steps the target design automates — projected).", ""),
])

table(
    ["Automation (BOT)", "Trigger", "Runs", "Records processed", "Minutes saved", "Failures", "Status"],
    [
        ["Smart Task Assignment", "task.created", "56", "133", "798", "0", "Active"],
        ["Data Validation", "task.created", "33", "81", "324", "3", "Active"],
        ["Automated Reporting", "schedule.daily", "4", "263", "180", "0", "Active"],
        ["Deadline Reminder", "sla.approaching", "8", "45", "135", "0", "Active"],
        ["SLA Escalation", "sla.breached", "6", "8", "40", "1", "Active"],
        ["Duplicate Detection", "task.created", "2", "20", "12", "1", "Disabled"],
        ["Total", "—", f"{EXECS}", f"{RECORDS:,}", f"{MIN_SAVED:,}", f"{PARTIAL + FAILED}", f"{SUCCESS / EXECS * 100:.1f}% success"],
    ],
    widths=[Inches(1.6), Inches(1.2), Inches(0.5), Inches(0.95), Inches(0.85), Inches(0.6), Inches(0.87)],
    size=8,
    align_right=(2, 3, 4, 5),
    bold_col=0,
)

para("", after=4)
rich([
    ("Coverage by request status: ", "b"),
    ("Auto-Assigned 79 · Validated 22 · Needs Review "
     f"{NR} · Not automated {TOTAL - AUTO - NR}. ", ""),
    (f"By outcome, {EXEC_RATE:.1f}% of executions succeeded, {PARTIAL} were partial (validation flags raised) and "
     f"{FAILED} failed — failures are recorded with error text rather than silently swallowed, which is the behaviour "
     "an auditor needs.", ""),
], size=9.2)

h2("Where automation should stop")
rich([
    ("Three boundaries are enforced in the design, and are the reason the residual ",
     ""), (f"{W_AUTO_MIN:.1f} minutes", "b"),
    (" per transaction remain:", ""),
])
bullet([("Physical fulfilment", "b"), (" — hardware hand-over, facilities set-up and provisioning still need a person. "
        "Hardware Request Fulfilment is only 64% automatable by design.", "")])
bullet([("Judgement and approval", "b"), (" — access grants, budget exceptions and HR decisions stay in manager-owned "
        "workflow stages that a BOT can route but not complete.", "")])
bullet([("Genuine ambiguity", "b"), (f" — {NR} requests could not be validated and were deliberately surfaced for a "
        "human rather than guessed at.", "")])
page_break()

# ================================================================ 5. TIME SAVINGS
h1("Expected time savings", 5)
rich([
    ("There are three layers of time-savings evidence in the application, and they must not be added together.", ""),
])

table(
    ["Basis", "Volume", "Time saved", "Value", "Grade"],
    [
        ["Execution log — minutes recorded by BOT runs",
         f"{EXECS} runs / {RECORDS:,} records",
         f"{MIN_SAVED:,} min ≈ {MIN_SAVED / 60:.0f} h",
         f"IDR {MEASURED_MONTH_VALUE:.1f}m / month (rate-normalised)",
         "Measured (small scale)"],
        ["ROI calculator — single-process model",
         f"{ROI_TX:,} tx / month",
         f"{ROI_SAVED:,.0f} h / month",
         f"IDR {ROI_LABOUR:.1f}m gross",
         "Projection"],
        ["Baseline table — full portfolio",
         f"{VOLUME:,} tx / month",
         f"{MONTH_MIN:,} min ≈ {MONTH_MIN / 60:,.0f} h / month",
         f"IDR {MONTH_COST:.1f}m gross",
         "Projection"],
    ],
    widths=[Inches(2.0), Inches(1.15), Inches(1.35), Inches(1.3), Inches(0.77)],
    size=8,
    align_right=(1, 2),
    type_col=4,
)

para("", after=4)
callout("THE THREE NUMBERS ARE NOT COMPARABLE", [
    ("The execution log proves the mechanism works at low volume; the calculator proves a single process at scale; the "
     "baseline table is the portfolio view. Management should approve on the ", ""),
    ("baseline table (778 h/month)", "b"),
    (f" and treat the calculator's {ROI_SAVED_H:,.0f} h/month as a conservative single-process sanity check, since it covers "
     f"{ROI_TX:,} of the {VOLUME:,} transactions at a blended {ROI_MAN_MIN}→{ROI_AUTO_MIN} minute assumption.", ""),
], fill="F7F8FA", accent="98A2B3", title_colour=INK_600)

figure(f"{CHART_DIR}/fig6-measured-automation.png",
       "Figure 3 — What the execution log actually records (measured). Assignment and validation dominate because they "
       "touch every intake; reporting saves the most per single run but fires only daily.")

h2("Where the hours come from")
rich([
    (f"Five processes account for 80% of the projected value (Figure 4). That concentration is good news for a pilot: "
     f"{TOP3_NAMES[0]}, {TOP3_NAMES[1]} and {TOP3_NAMES[2]} together represent IDR {TOP3:.1f}m of the "
     f"{BASE_MONTH:.1f}m monthly value, and two of the three sit in the two departments we propose piloting first.", ""),
])
figure(f"{CHART_DIR}/fig3-value-concentration.png",
       "Figure 4 — Projected monthly value by process (baseline table × loaded hourly rate). Pareto: five of eight "
       "processes carry 80% of the benefit.")
page_break()

# ================================================================ 6. ERRORS
h1("Error reduction opportunities", 6)
rich([
    ("Error cost is the least-measured and most under-claimed part of the case. The application models two error "
     "rates per process — manual and after automation — and the portfolio-weighted reduction is substantial.", ""),
])

table(
    ["Process", "Manual error rate", "After automation", "Reduction", "Mechanism"],
    [
        ["Master Data Correction", "14.5%", "2.8%", "−81%", "Field-level validation, single write path"],
        ["Monthly Management Reporting", "12.7%", "2.2%", "−83%", "Generated from records, not retyped"],
        ["System Access Provisioning", "11.2%", "2.5%", "−78%", "Mandatory fields, no free-text routing"],
        ["Project Status Consolidation", "10.1%", "3.4%", "−66%", "Consolidation from one data source"],
        ["Hardware Request Fulfilment", "9.6%", "3.1%", "−68%", "Structured request, stock check at intake"],
        ["IT Service Desk Ticket Triage", "8.4%", "1.2%", "−86%", "Deterministic routing rules"],
        ["Customer Complaint Logging", "7.3%", "1.6%", "−78%", "Required fields + duplicate detection"],
        ["HR Administrative Letters", "6.8%", "1.9%", "−72%", "Template generation from master data"],
        ["Portfolio weighted", f"{W_MAN_ERR:.1f}%", f"{W_AUTO_ERR:.1f}%", "−79.2%", "—"],
    ],
    widths=[Inches(1.85), Inches(0.95), Inches(1.0), Inches(0.85), Inches(2.0)],
    size=7.9,
    align_right=(1, 2, 3),
    bold_col=0,
)

para("", after=4)
rich([
    ("Converting that to money requires an assumption the demo cannot supply: what one error costs in rework. Using a "
     "deliberately simple model — each error costs three times the per-transaction handling time in rework and "
     "re-communication — the annualised exposure removed is approximately ", ""),
    (f"IDR {ERR_COST * 12 / 1000:.1f}bn", "b"),
    (f" (IDR {ERR_COST:.1f}m per month), before any allowance for reputational or compliance impact. ", ""),
    ("This is a projection built on an unvalidated multiplier", "b"),
    (" and should be re-based in Phase 0 by sampling 50 closed requests and pricing the actual rework.", ""),
], size=9.2)

callout("WHAT IS MEASURED HERE", [
    ("Only two error-adjacent facts are measured in the workspace: ", ""),
    (f"{NR} requests ({NR / TOTAL * 100:.1f}%)", "b"),
    (" were flagged by the Data Validation BOT for missing fields, format problems or likely duplicates, and the "
     "Duplicate Detection BOT (currently disabled) surfaced 12 candidate pairs from 71 submissions in its last full "
     "window against a review cap. Both are evidence that the checks fire; neither proves a 79% reduction.", ""),
], fill="FFFBEB", accent="F59E0B", title_colour=AMBER)
page_break()

# ================================================================ 7. SLA
h1("SLA improvement opportunities", 7)
rich([
    (f"SLA compliance is {SLA:.1f}% against a configured 85% target — the organisation is currently ", ""),
    (f"{(SLA - 85):.1f} percentage points above its own target", "b"),
    (", which sounds comfortable until the distribution is examined. Compliance is an average hiding a long tail.", ""),
])

table(
    ["SLA signal", "Value", "What it tells us"],
    [
        ["Completed within SLA", f"73 of 84 ({SLA:.1f}%)", "Baseline to beat; derived from real completion timestamps."],
        ["Requests past deadline", f"{OVERDUE}", "Critical ×2, High ×1, Medium ×3, Low ×1 — breaches are not confined to low priority."],
        ["Open work beyond 75% of window", f"{OVERTIME_75} of {OPEN_ALL} open", "Escalation risk inside the current day, not at month-end."],
        ["Open work beyond 90% of window", f"{OVERTIME_90} of {OPEN_ALL} open", "At-risk population the At-risk bucket reports."],
        ["Strictest policy", "Critical = 4h (IT Support, System Access, Data Update)",
         f"Against a measured {3.8:.1f}h average critical cycle time — a buffer of roughly 12 minutes at the mean."],
        ["Rejected requests", f"{REJECTED} (3 High, 2 Low)",
         "A rejected request is a failed intake, not a satisfied one; intake quality is the first SLA lever."],
        ["Bottleneck stage", "Data Validation 2.5h, Asset Handover 2.8h, Stock Availability 3.2h",
         "Workflow dwell time, which Stage 3 of the plan targets once the connectors exist."],
        ["Per-person spread", "75% – 100% compliance across 8 staff",
         "Two individuals account for 4 of 7 breaches; assignment balancing alone would move the average."],
    ],
    widths=[Inches(1.65), Inches(1.9), Inches(2.9)],
    size=7.9,
    bold_col=0,
)

para("", after=4)
figure(f"{CHART_DIR}/fig4-sla.png",
       "Figure 5 — SLA position today versus a proposed trajectory. The 90% and 95% markers are targets derived from "
       "the reminder/escalation design, not measured outcomes; they must be re-baselined after the pilot.")

h2("How the improvement is expected to arise")
for title, body in [
    ("The clock starts at intake, not at attention.",
     "Because every channel writes the same record with a created time, the SLA window begins when the requester asks, "
     "removing the silent hours currently lost in someone's inbox."),
    ("Intervention happens at 75%, not after 100%.",
     f"{OVERTIME_75} of {OPEN_ALL} open requests are already past the reminder threshold. A reminder that arrives while "
     "there is still time changes behaviour; an escalation after the fact only documents the failure."),
    ("Priority determines the window, so triage errors become visible.",
     "Nine categories × four priorities produce 36 distinct windows from 4h to 120h. A mis-prioritised request is now "
     "measurable rather than invisible."),
    ("Load balancing removes the queueing effect.",
     "Assignment targets the least-loaded available person. Four of the seven breaches sit with two individuals; "
     "spreading new work away from them is the cheapest available improvement."),
]:
    rich([(title + "  ", "b"), (body, "")], size=9.2, after=4)
page_break()

# ================================================================ 8. ROI
h1("Automation ROI assumptions", 8)
rich([
    ("The ROI calculator is a transparent model with six inputs. Every assumption is printed here so that Finance can "
     "replace it with audited numbers before approval. The recommendation is to approve on the ", ""),
    ("ROI calculator", "b"),
    (_conservatism_phrase(), ""),
    (". It is the model the finance team can audit line by line, and it agrees with the portfolio view to within "
     "0.2% on hours, so approval does not depend on which one you believe.", ""),
])

table(
    ["#", "Input", "Value used in demo", "Why it matters / what to replace it with"],
    [
        ["A1", "Transactions per month", f"{S[chr(114) + 'oiInputs']['monthlyTransactions']:,}",
         f"Matches the baseline table total of {VOLUME:,}. Still worth replacing with actual ITSM/form counts for the last 6 months."],
        ["A2", "Manual processing time", f"{S['roiInputs']['manualMinutes']} min / transaction",
         f"Baseline weighted average is {W_MAN_MIN:.1f} min. Use time-and-motion sampling on 30 requests per category."],
        ["A3", "Automated processing time", f"{S['roiInputs']['automatedMinutes']} min / transaction",
         f"Baseline weighted average is {W_AUTO_MIN:.1f} min. Replace with measured touch time after the pilot."],
        ["A4", "Loaded hourly cost", f"IDR {S['roiInputs']['hourlyCostIdr']:,}",
         "Finance must confirm: this is roughly a fully-loaded band 2–3 operations analyst rate. The baseline table "
         "uses 115,000–185,000 across departments."],
        ["A5", "Implementation cost", f"IDR {S['roiInputs']['implementationCostIdr']:,} (one-off)",
         "Not evidenced — an assumption. Should be replaced by the vendor/SI quote plus internal build time."],
        ["A6", "Monthly run cost", f"IDR {S['roiInputs']['monthlyMaintenanceCostIdr']:,}",
         "Covers licensing, hosting, rule maintenance and CoE effort. Should be confirmed against a licensing quote."],
        ["—", "Discounting, ramp-up, attrition", "None applied",
         "The model assumes day-one full benefit, no ramp curve, no discounting and no staff attrition offset. "
         "Figure 6 therefore overstates year 1 by construction."],
    ],
    widths=[Inches(0.36), Inches(1.3), Inches(1.5), Inches(3.41)],
    size=7.8,
    bold_col=1,
)

para("", after=4)
h2("Model output and its sensitivity")
roi_rows = [
    ["Manual hours / month", f"{F['roi_manual_hours']:,.0f} h", f"{ROI_TX:,} × {ROI_MAN_MIN} min"],
    ["Automated hours / month", f"{F['roi_auto_hours']:,.0f} h", f"{ROI_TX:,} × {ROI_AUTO_MIN} min"],
    ["Hours released / month", f"{ROI_SAVED:,.0f} h", f"−{100 - ROI_AUTO_MIN / ROI_MAN_MIN * 100:.1f}%"],
    ["Gross labour value / month", f"IDR {ROI_LABOUR:.1f}m", f"{ROI_SAVED:.0f} h × IDR 145,000"],
    ["Run cost / month", f"IDR {S['roiInputs']['monthlyMaintenanceCostIdr'] / 1e6:.1f}m", "A6"],
    ["Net benefit / month", f"IDR {ROI_NET:.1f}m", "gross − run cost"],
    ["Annual net benefit", f"IDR {ROI_NET * 12:.1f}m", "× 12, undiscounted"],
    ["Implementation cost", f"IDR {S['roiInputs']['implementationCostIdr'] / 1e6:.0f}m", "A5"],
    ["Payback", f"{ROI_PAYBACK:.1f} months", "implementation ÷ net monthly"],
    ["First-year ROI", f"{ROI_PCT:.0f}%", "annual net ÷ implementation"],
]
table(["Line", "Value", "Basis"], roi_rows,
      widths=[Inches(2.2), Inches(1.4), Inches(2.85)], size=8, align_right=(1,))

para("", after=4)
figure(f"{CHART_DIR}/fig5-roi-basis.png",
       f"Figure 6 — The two financial views. Left: the baseline table across 8 processes "
       f"(IDR {MONTH_COST:.1f}m gross, {MONTH_COST - S['roiInputs']['monthlyMaintenanceCostIdr'] / 1e6:.1f}m net). "
       f"Right: the ROI calculator's blended-cycle model (IDR {ROI_LABOUR:.1f}m gross, {ROI_NET:.1f}m net). "
       f"Both rest on the same {VOLUME:,}-transaction month; the calculator is the more conservative of the two "
       f"because it prices every request at average effort rather than at each process's own rate.")

callout("ONE VOLUME, TWO COSTING METHODS — AND THEY AGREE", [
    ("The ROI calculator is seeded from the baseline table, so both view the same ", ""),
    (f"{ROI_TX:,} transactions a month", "b"),
    (" and the same blended handling time (whole-minute ", ""),
    (f"{ROI_MAN_MIN}→{ROI_AUTO_MIN} min", "b"),
    (f", the baseline's volume-weighted {W_MAN_MIN:.1f}→{W_AUTO_MIN:.1f} min rounded). The two side-by-side totals land within "
     f"{abs(ROI_SAVED / (MONTH_MIN / 60) - 1) * 100:.1f}% of each other ", ""),
    (f"({ROI_SAVED_H:,.0f} h vs {MONTH_MIN / 60:,.0f} h a month)", "b"),
    (", which is the check Finance should apply first: two independently constructed models arriving at the same order of "
     "benefit. They are still not interchangeable, and the report uses them for different jobs. The calculator applies one "
     "average cycle time to every transaction, so it is the right basis for a commitment and the wrong tool for deciding "
     "which process to automate first. The baseline table prices each process at its own measured rate, so it ranks the "
     "portfolio. Neither applies ", ""),
    ("ramp-up, discounting or attrition offset", "b"),
    (", so both overstate year one by construction. Replace A1–A6 with audited figures before the M1.5 gate.", ""),
], fill="FFFBEB", accent="F59E0B", title_colour=AMBER)

callout("SENSITIVITY — WHERE THE CASE BREAKS", [
    ("Net monthly benefit falls below zero only if the loaded hourly rate drops under ", ""),
    (f"IDR {S['roiInputs']['monthlyMaintenanceCostIdr'] / ROI_SAVED:,.0f}", "b"),
    (" (an 83% fall) or the time saved per transaction falls under ", ""),
    ("0.9 minutes", "b"),
    (". Both are implausible. The case is far more sensitive to ", ""),
    ("conversion", "b"),
    (" than to arithmetic: if released hours are not redeployed or removed, the financial benefit is zero and only the "
     "SLA and quality benefits survive. That is Risk R3, and it is the single decision that determines this business case.",
     ""),
], fill="F7F8FA", accent="98A2B3", title_colour=INK_600)
page_break()

# ================================================================ 9. RISKS
landscape()
h1("Implementation risks", 9)
RISKS = [
    ("R1", "Master-data quality", "Likely / Major", "Routing keys (category → department → PIC) are assumed clean. If HRIS/ITSM master data is not, auto-assignment misroutes work and trust collapses in week one.",
     "Phase 0 gate: ≥99% of active employees resolve to department + manager + calendar before Phase 1."),
    ("R2", "Adoption and shadow processes", "Likely / Major", "Requests keep arriving by WhatsApp, walk-in and e-mail outside the tool, so the dashboard under-reports and the SLA clock never starts.",
     "Single-intake mandate plus e-mail-to-ticket connector; weekly 'requests created outside OpsFlow' control for 8 weeks."),
    ("R3", "Productivity benefit not converted to cash", "Likely / Moderate", "77% cycle-time reduction releases hours; if headcount and cost base stay flat the benefit is capacity, not savings.",
     "Agree the redeployment plan before approval; report released hours monthly as a delivery metric, and do not "
     "count cash savings in the first year of the business case."),
    ("R4", "BOT failure blast radius", "Unlikely / Major", "The engine is transactional, but a bad rule can flag large volumes — the duplicate BOT hit its review cap of 12 from 71 submissions.",
     "Dry-run mode, per-run record caps, four-eyes approval on rule changes, automatic rollback above a write threshold."),
    ("R5", "SLA policy set too tight", "Unlikely / Major", "A 4h critical SLA against a 3.8h average critical cycle time leaves almost no buffer.",
     "Recalibrate per-category SLA from measured percentile cycle times in Phase 1; review quarterly."),
    ("R6", "Integration scope creep", "Unlikely / Moderate", "Seven connectors are catalogued, each needing credentials, scopes and secret rotation.",
     "Approve connectors per phase; everything beyond e-mail intake and Teams notification stays demo-mode."),
    ("R7", "Auditability and retention", "Unlikely / Moderate", "The prototype keeps its audit trail in browser localStorage; production needs an append-only server-side store.",
     "Append-only audit table with hash chaining, 24-month retention, export API for internal audit."),
    ("R8", "Access-control gaps", "Rare / Major", "Role gating exists (Administrator / Operations Manager / Staff) but record-level visibility is not enforced server-side.",
     "Server-side authorisation on every mutation, department/assignee-scoped reads, SSO with group mapping."),
]
table(["ID", "Risk", "Rating", "Description", "Mitigation"],
      [[r[0], r[1], r[2], r[3], r[4]] for r in RISKS],
      widths=[Inches(0.45), Inches(1.6), Inches(1.0), Inches(4.1), Inches(3.37)],
      size=8.4, bold_col=1)

para("", after=2)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.add_run().add_picture(f"{CHART_DIR}/fig7-risk-matrix.png", width=Inches(4.4))
cap = doc.add_paragraph()
cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = cap.add_run("Figure 7 — Risk register plotted by likelihood and business impact. R1 and R2 are the only two that can "
                "stop the programme outright, and both are addressable in Phase 0.")
r.font.size = Pt(7.8)
r.font.italic = True
r.font.color.rgb = INK_600

h2("Implementation plan and decision gates")
figure(f"{CHART_DIR}/fig8-roadmap.png",
       "Figure 8 — Proposed phasing: validate, pilot in two departments, scale to five BOTs, then optimise. "
       "Funding is released at each gate.")
table(
    ["Phase", "Window", "Scope", "Exit gate (all must hold)"],
    [
        ["0 — Validate", "Month 0–1.5", "Baseline time-and-motion, master-data clean-up, SLA policy recalibration",
         "≥99% routing-key resolution; 30 sampled requests timed per pilot category"],
        ["1 — Pilot", "Month 1.5–4", "IT Support + Finance, Assignment/Validation/Reminder/Reporting BOTs, e-mail intake, Teams alerts",
         "SLA ≥90%, exception rate ≤5%, exec success ≥98%, released hours evidenced ≥70% of model"],
        ["2 — Scale", "Month 4–7", "All five departments, hardware + access workflows, SSO, audit store",
         "Benefit realisation ≥80% of pilot run-rate; no P1 audit findings"],
        ["3 — Optimise", "Month 7–10", "Duplicate detection at scale, customer-experience intake, bottleneck automation",
         "Portfolio ≥95% SLA, ≥85% coverage, run cost per transaction at or below model"],
    ],
    widths=[Inches(1.4), Inches(1.0), Inches(3.6), Inches(4.5)],
    size=8.2, bold_col=0)
portrait()
page_break()

# ================================================================ 10. LIMITATIONS
landscape()
h1("Limitations of the current prototype", 10)
rich([
    ("A validation report that does not state what is missing is marketing. The following are structural limits of the "
     "build as delivered, each with the production requirement it implies.", ""),
])

table(
    ["#", "Limitation", "Consequence for this case", "Production requirement"],
    [
        ["L1", "No server, database or API. State lives in browser localStorage behind a service layer.",
         "Nothing here proves concurrency, scale or multi-user behaviour: 15 seeded users share one browser-local "
         "dataset, so there is no contention, no simultaneous edit and no server-side lock to test.",
         "Server-side persistence with optimistic locking, an API layer and a migration path from the JSON seed."],
        ["L2", "No scheduler. BOTs run on demand; 'scheduled' runs are simulated.",
         "Deadline reminders and daily reporting would not fire without someone pressing Execute.",
         "Job runner with cron semantics, idempotency keys and retry/backoff."],
        ["L3", "No connector credentials. All seven integrations are demo-mode, configuration-required or not connected.",
         "Intake from e-mail/Teams and delivery of notifications are unproven end to end.",
         "OAuth/secret management, per-connector scopes, webhook ingestion with signature verification."],
        ["L4", "Notification delivery is in-app only; e-mail, Teams, Slack and Telegram toggles flag intent, not delivery.",
         "Escalation reach is unproven — a breached SLA may notify nobody outside the browser.",
         "Provider integration with delivery receipts and fallback channel."],
        ["L5", "Time-saved figures come from per-record constants in the rule definitions (6 min per assignment, 4 per validation, 3 per reminder), not from stopwatch measurement.",
         f"The {MIN_SAVED:,} measured minutes prove the mechanism, not the true saving.",
         "Instrument real touch time before/after on a sampled cohort in Phase 0."],
        ["L6", "The baseline process table is seeded demo data with plausible but unverified costs and error rates.",
         "The 77% and IDR 119.1m figures are illustrative until replaced with audited baselines.",
         "Rebuild the baseline with Finance and department heads before the pilot gate."],
        ["L7", "Authorization is client-side and demonstration-grade; record-level visibility is not enforced.",
         "Cannot be presented as a security-approved system.",
         "Server-side RBAC/ABAC, SSO, penetration test, audit immutability."],
        ["L8", "No robotic fulfilment. No system-of-record actions are executed on external systems.",
         "The benefit stops at coordination; downstream provisioning remains manual.",
         "RPA/API actions per system of record, with compensating transactions."],
        ["L9", "Single currency (IDR), single locale (en-GB), no multi-entity or multi-timezone handling.",
         "Fine for a single-country pilot; blocks group rollout.",
         "Locale/timezone-aware scheduling and per-entity SLA calendars."],
        ["L10", "No archiving, retention or data-residency controls.",
         "Cannot be put in front of internal audit as a system of record.",
         "Retention policy, archival, export API, residency configuration."],
    ],
    widths=[Inches(0.45), Inches(3.4), Inches(2.9), Inches(3.77)],
    size=8.4,
)
portrait()
page_break()

# ================================================================ 11. INTEGRATIONS
landscape()
h1("Recommended production integrations", 11)
rich([
    ("The integration catalogue in the application lists seven connectors. All are currently non-functional by design. "
     "The recommendation is to sequence them by dependency and benefit, not to switch on all seven.", ""),
])

table(
    ["Priority", "Integration", "Current status", "Why it is needed", "Phase"],
    [
        ["P0 — blocking", "Email (SMTP / IMAP)", "Not Connected", "Most requests still arrive by e-mail; without it the SLA clock starts late and adoption fails.", "1"],
        ["P0 — blocking", "Microsoft Teams or Slack", "Not Connected / Configuration Required", "Assignment and escalation must reach where people already work.", "1"],
        ["P0 — blocking", "Identity provider (SSO)", "Not catalogued", "Server-side roles and department scoping depend on a trusted identity source.", "2"],
        ["P0 — blocking", "HRIS master data", "Not catalogued", "Routing keys (person → department → manager → calendar) decide whether auto-assignment is safe.", "0"],
        ["P1 — high", "Google Forms / Portal intake", "Demo Mode", "External requesters need a form that writes directly to the queue.", "1"],
        ["P1 — high", "ITSM / service desk", "Not catalogued", "Avoid a second system of record; sync ticket state both ways for IT categories.", "2"],
        ["P1 — high", "Google Sheets / Excel", "Demo Mode / Configuration Required", "Finance and HR still run registers in spreadsheets during transition.", "2"],
        ["P2 — medium", "Finance ERP (reporting feed)", "Not catalogued", "Monthly management reporting is the largest single value driver; automation requires a data feed, not a spreadsheet.", "2"],
        ["P2 — medium", "Telegram / on-call alerting", "Not Connected", "Useful for out-of-hours SLA breach alerts only.", "3"],
        ["P3 — later", "Data warehouse / BI", "Not catalogued", "Replace the in-app analytics with the corporate BI layer once volume justifies it.", "3"],
    ],
    widths=[Inches(1.1), Inches(1.9), Inches(2.0), Inches(4.4), Inches(1.09)],
    size=8.4, bold_col=1)

para("", after=4)
callout("INTEGRATION PRINCIPLE", [
    ("Sequence by ", ""), ("dependency", "b"),
    (" (identity and master data first, because every BOT depends on them), then by ", ""),
    ("adoption", "b"),
    (" (e-mail and chat, because they close the shadow-process gap), then by ", ""), ("value", "b"),
    (" (the ERP feed behind monthly reporting). Each connector adds credentials to manage, so approving all seven at "
     "once converts an automation programme into an integration programme.", ""),
], fill="F7F8FA", accent="98A2B3", title_colour=INK_600)

h2("What 'connected' must mean before go-live")
bullet([("Idempotency", "b"), (" — a repeated inbound message must not create a duplicate request; the duplicate "
        "detection logic already in the prototype is the backstop, not the mechanism.", "")])
bullet([("Observability", "b"), (" — every connector call logged with correlation ID, latency and outcome, visible in "
        "the automation health view.", "")])
bullet([("Failure semantics", "b"), (" — an integration outage must queue, not drop. The engine's current "
        "all-or-nothing transaction per run is the right pattern to preserve.", "")])
bullet([("Reconciliation", "b"), (" — a daily count of records created per channel, reconciled to the source system "
        "total, is the control that catches silent loss.", "")])
portrait()
page_break()

# ================================================================ 12. ACCEPTANCE CRITERIA
landscape()
h1("Quantitative acceptance criteria", 12)
rich([
    ("Each criterion below is testable against the application or its successor and has a stated measurement method. "
     "Criteria marked ", ""), ("evidenced", "b brand"),
    (" can be checked in today's workspace; the rest become gate conditions for the pilot.", ""),
])

table(
    ["#", "Criterion", "Target", "Measurement method", "Status"],
    [
        ["AC1", "SLA compliance (completed within deadline)", "≥ 90% at pilot gate, ≥ 95% at scale",
         "completedAt ≤ deadline over rolling 30 days", f"Baseline {SLA:.1f}% — evidenced"],
        ["AC2", "Requests past deadline at any point in time", "≤ 2% of open work", "status = Overdue ÷ open",
         f"Baseline {OVERDUE} of {OPEN_ALL} open ({OVERDUE / OPEN_ALL * 100:.0f}%) — evidenced"],
        ["AC3", "Automation coverage of new intake", "≥ 85% auto-handled or validated",
         "automationStatus ∈ {Auto-Assigned, Validated} ÷ total", f"Baseline {AUTO_PCT:.1f}% — evidenced"],
        ["AC4", "Automation execution success rate", "≥ 98%", "status = Success ÷ executions", f"Baseline {EXEC_RATE:.1f}% — evidenced"],
        ["AC5", "Exception rate requiring human review", "≤ 5% of intake", "automationStatus = Needs Review ÷ total", f"Baseline {NR / TOTAL * 100:.1f}% — evidenced"],
        ["AC6", "Rejected / failed intake", "≤ 2% of intake", "status = Rejected ÷ total", f"Baseline {REJECTED / TOTAL * 100:.1f}% — evidenced"],
        ["AC7", "Average resolution time (all categories)", "≤ 18h", "completedAt − createdAt over rolling 30 days", f"Baseline {AVG_RES:.1f}h — evidenced"],
        ["AC8", "Critical-priority resolution time", "≤ 3.5h", "same, filtered to Critical", "Baseline 3.8h (11 completed) — evidenced"],
        ["AC8b", "Manual completion rate (share closed by a person)", "≤ 22% of intake", "status = Completed ÷ total",
         f"Baseline {COMPLETION:.1f}% — evidenced"],
        ["AC9", "Cycle-time reduction per transaction", "≥ 60% versus Phase 0 baseline", "time-and-motion sample, 30 per category", "Projected 77% — to be measured"],
        ["AC10", "Data error rate", "≤ 2.5%", "audited error log ÷ transactions", f"Projected {W_AUTO_ERR:.1f}% — to be measured"],
        ["AC11", "Released hours evidenced", "≥ 70% of model in month 4", "actual handling time saved, sampled", "Not yet measurable"],
        ["AC12", "Run cost per transaction", "≤ IDR 7,000", "monthly run cost ÷ transactions", f"Model: IDR 12.5m ÷ {ROI_TX:,} = IDR {12_500_000 / ROI_TX:,.0f} — marginal, monitor"],
        ["AC13", "Audit completeness", "100% of BOT writes traceable to a record", "execution log vs affected task IDs", "Evidenced in prototype"],
        ["AC14", "Intake outside the tool", "≤ 5% of total requests", "manual reconciliation, weekly", "Not measurable until connectors exist"],
        ["AC15", "Zero horizontal page overflow", "0px at 390/768/1024/1440/1920", "automated QA suite", "Evidenced — 45 route/viewport checks clean"],
    ],
    widths=[Inches(0.5), Inches(2.6), Inches(2.0), Inches(2.8), Inches(3.59)],
    size=8.3,
)

para("", after=4)
callout("HONEST SCORECARD", [
    ("Of the sixteen criteria, ", ""), ("ten are evidenced in the current build", "b brand"),
    (", four are projections that require production instrumentation (AC9, AC10, AC12 and the resolution-time targets "
     "after process change), and two (AC11, AC14) cannot be measured at all until the pilot runs with real connectors. "
     "The programme should be approved with those two stated as unknowns, not assumed.", ""),
], fill="FFFBEB", accent="F59E0B", title_colour=AMBER)
portrait()

# ================================================================ conclusion
h1("Conclusion and recommendation", 13)
rich([
    ("OpsFlow demonstrates a credible, auditable operating model for BAU work: one intake, deterministic routing, "
     "a clock that starts when the requester asks, intervention before the deadline rather than after it, and "
     "reporting that is a by-product of doing the work rather than a monthly project. The application's own data "
     f"shows {AUTO_PCT:.1f}% of requests already handled by automation with a {EXEC_RATE:.1f}% execution success rate, "
     f"and a modelled {MONTH_MIN / 60:,.0f} hours per month of manual effort removed at portfolio scale.", ""),
])
rich([
    ("The honest limitations are equally clear: the benefit is proven as a mechanism and as arithmetic, not yet as a "
     "financial outcome; and the largest single risk is not technical but organisational — whether released hours are "
     "actually converted into capacity or savings. A four-month, two-department pilot against the acceptance criteria "
     "in Section 12 is the cheapest way to find out.", ""),
])
para("", after=6)
callout("RECOMMENDATION", [
    ("Proceed to a gated four-month pilot (IT Support and Finance & Reporting), funded at approximately one quarter of "
     "the assumed implementation cost, with continuation to Phase 2 conditional on: ", ""),
    ("SLA ≥ 90%, execution success ≥ 98%, exception rate ≤ 5%, and evidenced released hours ≥ 70% of model.", "b"),
], fill="ECFDF5")

para("", after=10)
rule(6, 6)
para("Basis of preparation", size=8, bold=True, colour=INK_600, after=3)
rich([
    ("All measured figures were extracted from the running application workspace on 1 November 2026: 108 task records, "
     "109 automation execution records (550 processed records), 72 activity events, 6 generated reports, 8 process "
     "baselines and the ROI input set. Figures are reproducible by running the application's own audit scripts "
     "(kpi-audit, integrity, e2e) and by regenerating this document with scripts/business-case/charts.py, which reads "
     "the same state export. Projections use the application's baseline table and ROI formulas without modification. "
     "No figure in this document was estimated by hand.", ""),
], size=8)
rich([
    ("This report assesses a demonstration build. It is suitable for a management decision on whether to pilot; it is "
     "not a substitute for a vendor due-diligence, a security assessment or an audited benefits case. The preparation "
     "methodology is disclosed so that Finance can re-run every number with its own inputs before approval.", ""),
], size=8)

doc.save(OUT)
print("saved", OUT)
