from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "game-data" / "pawns.json"
OUTPUT = ROOT / "output" / "pawns"
SHEET_OUTPUT = OUTPUT / "production-sheets"

CANVAS = (2400, 1800)
INK = (8, 10, 12)
CHARCOAL = (20, 23, 27)
PANEL = (27, 31, 36)
GOLD = (218, 174, 72)
PALE_GOLD = (255, 231, 164)
CREAM = (247, 242, 226)
MUTED = (180, 188, 191)
TEAL = (44, 176, 160)


def load_font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    candidates = {
        "serif_bold": ["C:/Windows/Fonts/georgiab.ttf", "DejaVuSerif-Bold.ttf"],
        "sans_bold": ["C:/Windows/Fonts/arialbd.ttf", "DejaVuSans-Bold.ttf"],
        "sans": ["C:/Windows/Fonts/arial.ttf", "DejaVuSans.ttf"],
    }[kind]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    raise RuntimeError(f"No usable font found for {kind}")


def fit_font(draw: ImageDraw.ImageDraw, text: str, kind: str, max_size: int, max_width: int) -> ImageFont.FreeTypeFont:
    for size in range(max_size, 17, -2):
        typeface = load_font(kind, size)
        if draw.textbbox((0, 0), text, font=typeface)[2] <= max_width:
            return typeface
    raise RuntimeError(f"Could not fit text: {text}")


def wrap(draw: ImageDraw.ImageDraw, text: str, typeface: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=typeface)[2] <= max_width:
            current = candidate
        else:
            if not current:
                raise RuntimeError(f"Word too wide for production sheet: {word}")
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_section_title(draw: ImageDraw.ImageDraw, xy: tuple[int, int], title: str) -> None:
    draw.text(xy, title, font=load_font("sans_bold", 29), fill=PALE_GOLD)
    y = xy[1] + 44
    draw.line((xy[0], y, xy[0] + 250, y), fill=(*TEAL, 220), width=4)


def render_sheet(pawn: dict) -> Path:
    width, height = CANVAS
    canvas = Image.new("RGB", CANVAS, INK)
    draw = ImageDraw.Draw(canvas, "RGBA")

    for offset in range(-height, width, 120):
        draw.line((offset, 0, offset + height, height), fill=(*GOLD, 12), width=2)
    draw.rounded_rectangle((28, 28, width - 28, height - 28), radius=28, outline=(*GOLD, 235), width=5)
    draw.rounded_rectangle((45, 45, width - 45, height - 45), radius=22, outline=(*PALE_GOLD, 80), width=2)

    title_font = fit_font(draw, pawn["name"].upper(), "serif_bold", 76, 1680)
    draw.text((90, 64), pawn["name"].upper(), font=title_font, fill=PALE_GOLD)
    draw.text((92, 145), "COLORFUL RESIN PLAYER PAWN  •  SCULPT TURNAROUND", font=load_font("sans_bold", 27), fill=CREAM)
    draw.text((width - 95, 86), pawn["code"], font=load_font("sans_bold", 44), fill=GOLD, anchor="ra")
    draw.text((width - 95, 144), "APPROVED CONCEPT / PRE-PRODUCTION", font=load_font("sans_bold", 22), fill=MUTED, anchor="ra")

    image_panel = (70, 205, width - 70, 1090)
    draw.rounded_rectangle(image_panel, radius=24, fill=(*CHARCOAL, 255), outline=(*GOLD, 170), width=3)
    source_path = ROOT / pawn["source"]
    if not source_path.exists():
        raise FileNotFoundError(source_path)
    with Image.open(source_path) as opened:
        source = opened.convert("RGB")
        source = ImageOps.contain(source, (image_panel[2] - image_panel[0] - 28, image_panel[3] - image_panel[1] - 28), Image.Resampling.LANCZOS)
        source = source.filter(ImageFilter.UnsharpMask(radius=0.6, percent=108, threshold=3))
    source_x = (width - source.width) // 2
    source_y = image_panel[1] + (image_panel[3] - image_panel[1] - source.height) // 2
    canvas.paste(source, (source_x, source_y))

    label_y = 1134
    for x, label in zip((430, 1200, 1970), pawn["views"]):
        draw.text((x, label_y), label, font=load_font("sans_bold", 29), fill=CREAM, anchor="mm")
        draw.line((x - 145, label_y + 26, x + 145, label_y + 26), fill=(*GOLD, 190), width=2)

    info_box = (70, 1195, width - 70, 1658)
    draw.rounded_rectangle(info_box, radius=22, fill=(*PANEL, 248), outline=(*GOLD, 150), width=3)
    draw.line((720, 1228, 720, 1625), fill=(*GOLD, 90), width=2)
    draw.line((1515, 1228, 1515, 1625), fill=(*GOLD, 90), width=2)

    draw_section_title(draw, (110, 1230), "TARGET DIMENSIONS")
    draw.text((112, 1305), f"{pawn['height_mm']} mm", font=load_font("serif_bold", 66), fill=CREAM)
    draw.text((114, 1386), "FINISHED HEIGHT", font=load_font("sans_bold", 23), fill=MUTED)
    draw.text((112, 1460), pawn["base"], font=fit_font(draw, pawn["base"], "serif_bold", 45, 520), fill=CREAM)
    draw.text((114, 1522), "INTEGRAL BASE", font=load_font("sans_bold", 23), fill=MUTED)
    draw.text((114, 1585), "Tolerance target: ±0.5 mm", font=load_font("sans", 23), fill=MUTED)

    draw_section_title(draw, (765, 1230), "COLOR & MATERIAL")
    color_font = load_font("sans", 23)
    color_y = 1295
    for color in pawn["colors"]:
        rgb = ImageColor.getrgb(color["hex"])
        draw.rounded_rectangle((770, color_y, 808, color_y + 30), radius=6, fill=rgb, outline=(*CREAM, 150), width=1)
        draw.text((825, color_y + 2), f"{color['name']}  {color['hex']}", font=color_font, fill=CREAM)
        color_y += 43
    material_font = load_font("sans", 21)
    material_lines = wrap(draw, pawn["material"], material_font, 680)
    material_y = max(1534, color_y + 8)
    if material_y + len(material_lines) * 27 > 1628:
        material_font = load_font("sans", 19)
        material_lines = wrap(draw, pawn["material"], material_font, 680)
    for line in material_lines:
        draw.text((770, material_y), line, font=material_font, fill=MUTED)
        material_y += 27

    draw_section_title(draw, (1560, 1230), "SCULPT NOTES")
    note_font = load_font("sans", 23)
    note_y = 1296
    for note in pawn["notes"]:
        lines = wrap(draw, note, note_font, 700)
        draw.text((1563, note_y), "•", font=load_font("sans_bold", 24), fill=TEAL)
        for line in lines:
            draw.text((1593, note_y), line, font=note_font, fill=CREAM)
            note_y += 31
        note_y += 14
    if note_y > 1628:
        raise RuntimeError(f"Sculpt notes overflow for {pawn['name']}: {note_y}")

    footer = "FORTUNE AVENUE  •  TEST PRINT AND DROP-TEST BEFORE FINAL TOOLING  •  COLOR VALUES ARE DIGITAL TARGETS"
    footer_font = fit_font(draw, footer, "sans_bold", 24, width - 180)
    draw.text((width // 2, 1724), footer, font=footer_font, fill=GOLD, anchor="mm")

    destination = SHEET_OUTPUT / f"{pawn['code'].lower()}-{pawn['slug']}-production-sheet.png"
    canvas.save(destination, optimize=True)
    return destination


def render_overview(paths: list[Path]) -> tuple[Path, Path]:
    width, height = 3600, 3000
    canvas = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(canvas, "RGBA")
    for offset in range(-height, width, 150):
        draw.line((offset, 0, offset + height, height), fill=(*GOLD, 12), width=2)
    draw.rounded_rectangle((30, 30, width - 30, height - 30), radius=34, outline=(*GOLD, 235), width=6)
    draw.text((width // 2, 95), "FORTUNE AVENUE", font=load_font("serif_bold", 82), fill=PALE_GOLD, anchor="mm")
    draw.text((width // 2, 174), "APPROVED COLORFUL RESIN PAWNS  •  NINE-PIECE PRODUCTION PACKAGE", font=load_font("sans_bold", 30), fill=CREAM, anchor="mm")

    thumb_w, thumb_h = 1100, 825
    gap_x, gap_y = 50, 42
    start_x, start_y = 100, 245
    for index, path in enumerate(paths):
        row, col = divmod(index, 3)
        with Image.open(path) as opened:
            thumb = opened.convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            thumb = thumb.filter(ImageFilter.UnsharpMask(radius=0.5, percent=105, threshold=3))
        x = start_x + col * (thumb_w + gap_x)
        y = start_y + row * (thumb_h + gap_y)
        canvas.paste(thumb, (x, y))
        draw.rounded_rectangle((x, y, x + thumb_w, y + thumb_h), radius=12, outline=(*GOLD, 170), width=3)

    draw.text((width // 2, height - 56), "FRONT • SIDE • BACK  |  TARGET DIMENSIONS • PAINT PALETTES • SCULPT NOTES", font=load_font("sans_bold", 25), fill=GOLD, anchor="mm")
    png_path = OUTPUT / "fortune-avenue-all-nine-pawn-production-sheets.png"
    mobile_path = OUTPUT / "fortune-avenue-all-nine-pawns-mobile.jpg"
    canvas.save(png_path, optimize=True)
    mobile = canvas.resize((1800, 1500), Image.Resampling.LANCZOS)
    mobile = mobile.filter(ImageFilter.UnsharpMask(radius=0.6, percent=108, threshold=3))
    mobile.save(mobile_path, format="JPEG", quality=84, optimize=True, progressive=True, subsampling=1)
    return png_path, mobile_path


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    SHEET_OUTPUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    pawns = data["pawns"]
    if len(pawns) != 9:
        raise RuntimeError(f"Expected exactly 9 approved pawns, found {len(pawns)}")
    codes = [pawn["code"] for pawn in pawns]
    if len(codes) != len(set(codes)):
        raise RuntimeError("Pawn codes must be unique")

    paths = [render_sheet(pawn) for pawn in pawns]
    overview, mobile = render_overview(paths)
    for path in paths:
        print(f"Rendered: {path}")
    print(f"Rendered: {overview}")
    print(f"Rendered: {mobile}")


if __name__ == "__main__":
    main()
