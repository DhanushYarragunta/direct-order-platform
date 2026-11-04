"""Build the assessment PDF from its reviewable Markdown source.
Run with a Python environment containing reportlab and Pillow after browser screenshots.
"""
from pathlib import Path
import re
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Flowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from PIL import Image as PILImage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output/pdf/technical-design.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
for name in ["Normal", "BodyText"]:
    styles[name].fontName = "Helvetica"
    styles[name].fontSize = 10
    styles[name].leading = 15
    styles[name].textColor = HexColor("#343b32")
styles.add(ParagraphStyle(name="Copy", parent=styles["BodyText"], spaceAfter=10))
styles.add(ParagraphStyle(name="BulletCopy", parent=styles["Copy"], leftIndent=10, firstLineIndent=-7, fontSize=9.5, leading=14, spaceAfter=7))
styles.add(ParagraphStyle(name="Caption", parent=styles["Copy"], fontSize=8, leading=11, textColor=HexColor("#70756a")))
for name, size, leading in [("Heading1", 25, 29), ("Heading2", 17, 22), ("Heading3", 12, 17)]:
    styles[name].fontName="Helvetica-Bold"
    styles[name].fontSize=size
    styles[name].leading=leading
    styles[name].textColor=HexColor("#222b23")
    styles[name].spaceBefore=12 if name != "Heading1" else 0
    styles[name].spaceAfter=9

class Architecture(Flowable):
    def __init__(self):
        super().__init__(); self.width=487; self.height=160
    def draw(self):
        c=self.canv
        boxes=[(0,110,487,40,"Customer / Kitchen / Manager / Admin", "React screens + shared design system"),
               (0,55,300,42,"Next.js API + domain services", "Sessions, validation, pricing, order workflow"),
               (315,55,172,42,"Persistent job loop", "Payments, expiry, late alerts"),
               (0,0,487,40,"PostgreSQL + Prisma", "Orders, menu, sessions, rewards, catering, audit")]
        for x,y,w,h,title,sub in boxes:
            c.setFillColor(HexColor("#edf0e6"));c.roundRect(x,y,w,h,6,fill=1,stroke=0)
            c.setFillColor(HexColor("#273428"));c.setFont("Helvetica-Bold",10);c.drawCentredString(x+w/2,y+h-16,title)
            c.setFont("Helvetica",8);c.drawCentredString(x+w/2,y+10,sub)
        c.setStrokeColor(HexColor("#bc9a35"));c.setLineWidth(1.3)
        for x,a,b in [(150,110,97),(400,110,97),(150,55,40),(400,55,40)]:
            c.line(x,a,x,b);c.line(x,b,x-3,b+4);c.line(x,b,x+3,b+4)

def inline(text):
    text=text.replace("₹", "INR ").replace("→", " to ")
    text=text.replace("’", "'").replace("–", "-").replace("—", "-")
    text=escape(text)
    return re.sub(r'(https?://[^\s]+)', r'<link href="\1" color="#58744b">\1</link>', text)

story=[]
source=(ROOT/"docs/TECHNICAL_DESIGN.md").read_text()
source=re.sub(r"(<!--.*?-->)", r"\n\n\1\n\n", source)
for block in source.split("\n\n"):
    block=block.strip()
    if not block: continue
    if block=="<!-- page -->": story.append(PageBreak());continue
    if block=="<!-- architecture -->": story.extend([Architecture(),Spacer(1,12)]);continue
    if block.startswith("<!-- snapshot:"):
        name=block.removeprefix("<!-- snapshot:").removesuffix(" -->")
        path=ROOT/".local/screenshots"/name
        if not path.exists(): raise FileNotFoundError(f"Run browser verification first: {path}")
        with PILImage.open(path) as im:
            # Report a viewport crop instead of shrinking a long whole-page screenshot.
            crop=im.crop((0,0,im.width,min(im.height,800)))
            preview=ROOT/"tmp/pdfs"/name;preview.parent.mkdir(parents=True,exist_ok=True);crop.save(preview)
            width=487; height=width*crop.height/crop.width
        story.extend([Image(str(preview),width=width,height=height),Spacer(1,6),Paragraph("Working local application - browser verification capture.",styles["Caption"])]);continue
    if block.startswith("#"):
        for line in block.splitlines():
            depth=len(line)-len(line.lstrip("#"))
            story.append(Paragraph(inline(line.lstrip("# ")),styles[f"Heading{min(depth,3)}"] if depth else styles["Copy"]))
    elif block.startswith("- ") or re.match(r"^\d+\. ",block):
        for line in block.splitlines(): story.append(Paragraph(inline(line),styles["BulletCopy"]))
    else: story.append(Paragraph(inline(block.replace("\n"," ")),styles["Copy"]))

def page(canvas,doc):
    canvas.saveState();w,h=doc.pagesize
    canvas.setFillColor(HexColor("#dfa923"));canvas.rect(0,h-8,w,8,fill=1,stroke=0)
    canvas.setStrokeColor(HexColor("#e1e5db"));canvas.line(54,44,w-54,44)
    canvas.setFillColor(HexColor("#747c6c"));canvas.setFont("Helvetica",8)
    canvas.drawString(54,30,"DECCAN KITCHEN & CO.  /  TECHNICAL DESIGN  /  03 NOV 2026")
    canvas.drawRightString(w-54,30,str(doc.page));canvas.restoreState()

doc=SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),rightMargin=54,leftMargin=54,topMargin=40,bottomMargin=59,title="Deccan Kitchen & Co. - Technical Design",author="ISOCODELABS Project")
doc.build(story,onFirstPage=page,onLaterPages=page)
print(OUT)
