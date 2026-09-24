#!/usr/bin/env python3
"""Render the avocadomini business design Markdown into a branded PDF."""

from __future__ import annotations

import argparse
import html
import re
import tempfile
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#10283B")
NAVY_2 = colors.HexColor("#183A52")
INK = colors.HexColor("#15242E")
MUTED = colors.HexColor("#63717A")
ORANGE = colors.HexColor("#F39A3D")
ORANGE_LIGHT = colors.HexColor("#FFF0DD")
GREEN = colors.HexColor("#2D8066")
GREEN_LIGHT = colors.HexColor("#E7F3EE")
BLUE_LIGHT = colors.HexColor("#EAF1F6")
CREAM = colors.HexColor("#FBF8F2")
GRID = colors.HexColor("#D8E0E5")
WHITE = colors.white


def register_fonts(temp_dir: Path) -> tuple[str, str]:
    del temp_dir
    # Arial Unicode MS contains Japanese TrueType outlines and can be embedded by
    # ReportLab. macOS Hiragino fonts use PostScript outlines, which ReportLab's
    # TTFont loader cannot embed directly.
    font_path = Path("/Library/Fonts/Arial Unicode.ttf")
    pdfmetrics.registerFont(TTFont("Hiragino", str(font_path)))
    pdfmetrics.registerFont(TTFont("Hiragino-Bold", str(font_path)))
    pdfmetrics.registerFontFamily(
        "Hiragino",
        normal="Hiragino",
        bold="Hiragino-Bold",
        italic="Hiragino",
        boldItalic="Hiragino-Bold",
    )
    return "Hiragino", "Hiragino-Bold"


class SectionMarker(Flowable):
    def __init__(self, label: str, width: float = 28 * mm, height: float = 5 * mm):
        super().__init__()
        self.label = label
        self.width = width
        self.height = height

    def draw(self) -> None:
        self.canv.setFillColor(ORANGE)
        self.canv.roundRect(0, 0, self.width, self.height, 2.5 * mm, fill=1, stroke=0)
        self.canv.setFillColor(NAVY)
        self.canv.setFont("Hiragino-Bold", 7.4)
        self.canv.drawCentredString(self.width / 2, 1.35 * mm, self.label)


class BusinessDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, pagesize=A4, **kwargs)
        cover = Frame(
            18 * mm,
            20 * mm,
            PAGE_W - 36 * mm,
            PAGE_H - 40 * mm,
            leftPadding=0,
            bottomPadding=0,
            rightPadding=0,
            topPadding=0,
            id="cover-frame",
        )
        content = Frame(
            18 * mm,
            17 * mm,
            PAGE_W - 36 * mm,
            PAGE_H - 33 * mm,
            leftPadding=0,
            bottomPadding=0,
            rightPadding=0,
            topPadding=0,
            id="content-frame",
        )
        self.addPageTemplates(
            [
                PageTemplate(id="cover", frames=cover, onPage=self.draw_cover),
                PageTemplate(id="content", frames=content, onPage=self.draw_content),
            ]
        )

    @staticmethod
    def draw_cover(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(NAVY_2)
        canvas.circle(PAGE_W - 18 * mm, PAGE_H - 22 * mm, 42 * mm, fill=1, stroke=0)
        canvas.setFillColor(ORANGE)
        canvas.circle(PAGE_W - 9 * mm, 28 * mm, 37 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor("#224961"))
        canvas.roundRect(16 * mm, 15 * mm, 64 * mm, 8 * mm, 4 * mm, fill=1, stroke=0)
        canvas.restoreState()

    @staticmethod
    def draw_content(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(CREAM)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setStrokeColor(GRID)
        canvas.setLineWidth(0.6)
        canvas.line(18 * mm, PAGE_H - 11 * mm, PAGE_W - 18 * mm, PAGE_H - 11 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Hiragino", 7.4)
        canvas.drawString(18 * mm, PAGE_H - 8.4 * mm, "AVOCADOMINI BUSINESS DESIGN / TWO-BOT OPERATING MODEL")
        canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 8.4 * mm, "2026.09.05")
        canvas.setFillColor(NAVY)
        canvas.setFont("Hiragino-Bold", 7.8)
        canvas.drawString(18 * mm, 8.7 * mm, "ROCKSTAR_IBOT CORE")
        canvas.setFillColor(MUTED)
        canvas.setFont("Hiragino", 7.4)
        canvas.drawRightString(PAGE_W - 18 * mm, 8.7 * mm, f"{doc.page - 1:02d}")
        canvas.restoreState()


def inline_markup(text: str) -> str:
    text = html.escape(text.strip())
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<link href="\2" color="#2D8066">\1</link>', text)
    text = re.sub(r"`([^`]+)`", r'<font name="Hiragino-Bold" color="#183A52">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover-kicker": ParagraphStyle(
            "cover-kicker",
            parent=base["Normal"],
            fontName="Hiragino-Bold",
            fontSize=9,
            leading=13,
            textColor=ORANGE,
            spaceAfter=8 * mm,
            tracking=1.6,
        ),
        "cover-title": ParagraphStyle(
            "cover-title",
            parent=base["Title"],
            fontName="Hiragino-Bold",
            fontSize=30,
            leading=39,
            textColor=WHITE,
            alignment=TA_LEFT,
            spaceAfter=7 * mm,
        ),
        "cover-sub": ParagraphStyle(
            "cover-sub",
            parent=base["Normal"],
            fontName="Hiragino",
            fontSize=12,
            leading=20,
            textColor=colors.HexColor("#D8E5EC"),
            spaceAfter=18 * mm,
        ),
        "cover-meta": ParagraphStyle(
            "cover-meta",
            parent=base["Normal"],
            fontName="Hiragino",
            fontSize=8.5,
            leading=15,
            textColor=colors.HexColor("#C7D8E2"),
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Hiragino-Bold",
            fontSize=21,
            leading=29,
            textColor=NAVY,
            spaceBefore=4 * mm,
            spaceAfter=5 * mm,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Hiragino-Bold",
            fontSize=13.2,
            leading=19,
            textColor=GREEN,
            spaceBefore=4.5 * mm,
            spaceAfter=2.5 * mm,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="Hiragino-Bold",
            fontSize=10.5,
            leading=15,
            textColor=NAVY_2,
            spaceBefore=3.2 * mm,
            spaceAfter=1.5 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="Hiragino",
            fontSize=8.8,
            leading=15.3,
            textColor=INK,
            spaceAfter=2.4 * mm,
            wordWrap="CJK",
            allowWidows=0,
            allowOrphans=0,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["BodyText"],
            fontName="Hiragino",
            fontSize=8.5,
            leading=14.2,
            textColor=INK,
            leftIndent=0,
            firstLineIndent=0,
            wordWrap="CJK",
        ),
        "quote": ParagraphStyle(
            "quote",
            parent=base["BodyText"],
            fontName="Hiragino-Bold",
            fontSize=11.2,
            leading=18,
            textColor=NAVY,
            leftIndent=8 * mm,
            rightIndent=7 * mm,
            borderColor=ORANGE,
            borderWidth=0,
            borderPadding=5 * mm,
            backColor=ORANGE_LIGHT,
            spaceBefore=3 * mm,
            spaceAfter=4 * mm,
            wordWrap="CJK",
        ),
        "code": ParagraphStyle(
            "code",
            parent=base["Code"],
            fontName="Hiragino",
            fontSize=7.7,
            leading=12.4,
            textColor=colors.HexColor("#E5EEF3"),
            backColor=NAVY,
            leftIndent=0,
            rightIndent=0,
            borderPadding=4.5 * mm,
            spaceBefore=2.5 * mm,
            spaceAfter=4 * mm,
            wordWrap="CJK",
        ),
        "table-head": ParagraphStyle(
            "table-head",
            parent=base["BodyText"],
            fontName="Hiragino-Bold",
            fontSize=7.7,
            leading=11.2,
            textColor=WHITE,
            wordWrap="CJK",
        ),
        "table-cell": ParagraphStyle(
            "table-cell",
            parent=base["BodyText"],
            fontName="Hiragino",
            fontSize=7.35,
            leading=11.3,
            textColor=INK,
            wordWrap="CJK",
        ),
        "table-cell-bold": ParagraphStyle(
            "table-cell-bold",
            parent=base["BodyText"],
            fontName="Hiragino-Bold",
            fontSize=7.35,
            leading=11.3,
            textColor=NAVY,
            wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="Hiragino",
            fontSize=7.4,
            leading=12,
            textColor=MUTED,
            wordWrap="CJK",
        ),
        "section-badge": ParagraphStyle(
            "section-badge",
            parent=base["Normal"],
            fontName="Hiragino-Bold",
            fontSize=7.2,
            leading=8,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
    }


def col_widths(rows: list[list[str]], available: float) -> list[float]:
    count = max(len(row) for row in rows)
    if count == 2:
        return [available * 0.28, available * 0.72]
    if count == 3:
        return [available * 0.20, available * 0.37, available * 0.43]
    if count == 4:
        first_header = rows[0][0].strip() if rows and rows[0] else ""
        if first_header == "Bot":
            return [available * 0.18, available * 0.18, available * 0.32, available * 0.32]
        if first_header == "#":
            return [available * 0.07, available * 0.20, available * 0.35, available * 0.38]
        return [available * 0.16, available * 0.22, available * 0.29, available * 0.33]
    if count == 5:
        return [available * 0.06, available * 0.18, available * 0.24, available * 0.29, available * 0.23]
    return [available / count] * count


def build_table(raw_rows: list[list[str]], styles: dict[str, ParagraphStyle], available: float) -> Table:
    count = max(len(row) for row in raw_rows)
    normalized = [row + [""] * (count - len(row)) for row in raw_rows]
    data = []
    for row_index, row in enumerate(normalized):
        rendered = []
        for col_index, cell in enumerate(row):
            style = styles["table-head"] if row_index == 0 else (
                styles["table-cell-bold"] if col_index == 0 else styles["table-cell"]
            )
            rendered.append(Paragraph(inline_markup(cell), style))
        data.append(rendered)
    table = Table(
        data,
        colWidths=col_widths(normalized, available),
        repeatRows=1,
        hAlign="LEFT",
        splitByRow=1,
    )
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("GRID", (0, 0), (-1, -1), 0.45, GRID),
    ]
    for row_index in range(1, len(data)):
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), WHITE if row_index % 2 else BLUE_LIGHT))
    table.setStyle(TableStyle(commands))
    table.spaceBefore = 2 * mm
    table.spaceAfter = 4 * mm
    return table


def parse_table(lines: list[str], index: int) -> tuple[list[list[str]], int]:
    rows: list[list[str]] = []
    while index < len(lines) and lines[index].strip().startswith("|"):
        cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        rows.append(cells)
        index += 1
    if len(rows) >= 2 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in rows[1]):
        rows.pop(1)
    return rows, index


def markdown_story(markdown: str, styles: dict[str, ParagraphStyle]) -> list:
    lines = markdown.splitlines()
    body_start = next(i for i, line in enumerate(lines) if line.startswith("## 0."))
    lines = lines[body_start:]
    story: list = []
    index = 0
    section_number = 0
    available = PAGE_W - 36 * mm

    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()
        if not stripped:
            index += 1
            continue

        if stripped.startswith("## "):
            if story:
                story.append(CondPageBreak(45 * mm))
            title = stripped[3:].strip()
            match = re.match(r"(\d+)\.\s*(.*)", title)
            section_elements = []
            if match:
                section_number = int(match.group(1))
                badge = Table(
                    [[Paragraph(f"SECTION {section_number:02d}", styles["section-badge"])]],
                    colWidths=[28 * mm],
                    rowHeights=[5 * mm],
                    hAlign="LEFT",
                    style=TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), ORANGE),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 0),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                        ]
                    ),
                )
                section_elements.append(badge)
                section_elements.append(Spacer(1, 1.5 * mm))
                title = match.group(2)
            section_elements.append(Paragraph(inline_markup(title), styles["h1"]))
            section_elements.append(HRFlowable(width="100%", thickness=1.2, color=ORANGE, spaceAfter=3 * mm))
            # CondPageBreak above guarantees enough room for the complete heading;
            # keeping the badge inside KeepTogether can misplace narrow tables on
            # a newly opened ReportLab frame.
            story.extend(section_elements)
            index += 1
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:]), styles["h2"]))
            index += 1
            continue

        if stripped.startswith("#### "):
            story.append(Paragraph(inline_markup(stripped[5:]), styles["h3"]))
            index += 1
            continue

        if stripped.startswith("```"):
            index += 1
            code_lines = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index].rstrip())
                index += 1
            index += 1
            code = "<br/>".join(html.escape(part).replace(" ", "&#160;") for part in code_lines)
            story.append(KeepTogether([Paragraph(code, styles["code"])]))
            continue

        if stripped.startswith("|") and index + 1 < len(lines) and lines[index + 1].strip().startswith("|"):
            rows, index = parse_table(lines, index)
            story.append(build_table(rows, styles, available))
            continue

        if stripped.startswith("> "):
            quote_lines = []
            while index < len(lines) and lines[index].strip().startswith("> "):
                quote_lines.append(lines[index].strip()[2:])
                index += 1
            story.append(Paragraph(inline_markup(" ".join(quote_lines)), styles["quote"]))
            continue

        if stripped.startswith("- "):
            items = []
            while index < len(lines) and lines[index].strip().startswith("- "):
                items.append(
                    ListItem(
                        Paragraph(inline_markup(lines[index].strip()[2:]), styles["bullet"]),
                        leftIndent=4 * mm,
                    )
                )
                index += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    start="circle",
                    bulletFontName="Hiragino-Bold",
                    bulletFontSize=6.5,
                    bulletColor=ORANGE,
                    leftIndent=5 * mm,
                    bulletOffsetY=1.5,
                    spaceAfter=3 * mm,
                )
            )
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while index < len(lines) and re.match(r"^\d+\.\s+", lines[index].strip()):
                item_text = re.sub(r"^\d+\.\s+", "", lines[index].strip())
                items.append(ListItem(Paragraph(inline_markup(item_text), styles["bullet"]), leftIndent=5 * mm))
                index += 1
            ordered_list = ListFlowable(
                    items,
                    bulletType="1",
                    bulletFontName="Hiragino-Bold",
                    bulletFontSize=7.2,
                    bulletColor=GREEN,
                    leftIndent=6 * mm,
                    spaceAfter=3 * mm,
                )
            story.append(KeepTogether([ordered_list]))
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate:
                break
            if (
                candidate.startswith(("## ", "### ", "#### ", "```", "|", "> ", "- "))
                or re.match(r"^\d+\.\s+", candidate)
            ):
                break
            paragraph_lines.append(candidate)
            index += 1
        story.append(Paragraph(inline_markup(" ".join(paragraph_lines)), styles["body"]))

    return story


def build_pdf(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="avocadomini-fonts-") as temp:
        register_fonts(Path(temp))
        styles = make_styles()
        doc = BusinessDocTemplate(
            str(output),
            title="avocadomini 事業設計書 - 2 Bot運営版",
            author="Kai / Rockstar_ibot",
            subject="事業モデル、2 Bot構成、マネタイズ、90日計画",
            creator="Rockstar_ibot",
        )
        story = [
            Spacer(1, 29 * mm),
            Paragraph("BUSINESS DESIGN / VERSION 2.0", styles["cover-kicker"]),
            Paragraph("avocadomini<br/>事業設計書", styles["cover-title"]),
            Paragraph(
                "2 Botで分ける。<br/>顧客の仕事を、証拠付きで完了する。",
                styles["cover-sub"],
            ),
            Table(
                [
                    [Paragraph("OWNER CONTROL", styles["table-head"]), Paragraph("CUSTOMER & REVENUE", styles["table-head"])],
                    [Paragraph("@Rockstar_ibot", styles["table-cell-bold"]), Paragraph("@avocadominibot", styles["table-cell-bold"])],
                    [Paragraph("Kai専用 / 承認・監視・停止", styles["table-cell"]), Paragraph("顧客向け / 受付・納品・購入", styles["table-cell"])],
                ],
                colWidths=[76 * mm, 76 * mm],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#224961")),
                        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F2F6F8")),
                        ("GRID", (0, 0), (-1, -1), 0.7, colors.HexColor("#7894A5")),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
                    ]
                ),
            ),
            Spacer(1, 14 * mm),
            Paragraph(
                "2026.09.05 JST<br/>k999ln/Mr. main@4240e036<br/>FREE PILOT PRE-READY / PAID GO-LIVE NOT APPROVED",
                styles["cover-meta"],
            ),
            NextPageTemplate("content"),
            PageBreak(),
        ]
        story.extend(markdown_story(source.read_text(encoding="utf-8"), styles))
        doc.build(story)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build_pdf(args.source.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
