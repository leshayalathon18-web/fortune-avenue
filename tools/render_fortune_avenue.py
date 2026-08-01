from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "game-data" / "fortune-avenue.json"
BOARD_OUT = ROOT / "output" / "boards"
CARD_OUT = ROOT / "output" / "cards"

FONT_SERIF = Path(r"C:\Windows\Fonts\georgia.ttf")
FONT_SERIF_BOLD = Path(r"C:\Windows\Fonts\georgiab.ttf")
FONT_SANS = Path(r"C:\Windows\Fonts\arial.ttf")
FONT_SANS_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")

GOLD = (224, 181, 74)
PALE_GOLD = (255, 228, 151)
CREAM = (250, 244, 226)
INK = (7, 8, 10)


THEMES = {
    "emerald": {
        "edition": "EMERALD EDITION",
        "background": (4, 13, 11),
        "panel": (5, 34, 27),
        "panel_alt": (8, 51, 39),
        "accent": (20, 116, 78),
        "accent_light": (70, 198, 135),
        "tint": (0, 54, 35),
        "tint_strength": 0.08,
    },
    "crimson": {
        "edition": "CRIMSON FANTASY EDITION",
        "background": (17, 4, 8),
        "panel": (57, 8, 19),
        "panel_alt": (88, 13, 29),
        "accent": (151, 22, 45),
        "accent_light": (224, 66, 84),
        "tint": (104, 0, 22),
        "tint_strength": 0.22,
    },
}


def load_data() -> dict:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    assert data["space_count"] == 40
    assert len(data["spaces"]) == 40
    assert [space["index"] for space in data["spaces"]] == list(range(40))
    assert data["card_count"] == 48
    assert len(data["decks"]["lucky_break"]["cards"]) == 24
    assert len(data["decks"]["plot_twist"]["cards"]) == 24
    for space in data["spaces"]:
        path = ROOT / space["asset"]
        if not path.exists():
            raise FileNotFoundError(path)
    for deck in data["decks"].values():
        path = ROOT / deck["asset"]
        if not path.exists():
            raise FileNotFoundError(path)
    return data


def get_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def cover_crop(
    image: Image.Image,
    size: tuple[int, int],
    focal: tuple[float, float] = (0.5, 0.5),
) -> Image.Image:
    target_w, target_h = size
    source = image.convert("RGB")
    scale = max(target_w / source.width, target_h / source.height)
    resized = source.resize(
        (max(target_w, round(source.width * scale)), max(target_h, round(source.height * scale))),
        Image.Resampling.LANCZOS,
    )
    max_x = resized.width - target_w
    max_y = resized.height - target_h
    left = round(max_x * min(1.0, max(0.0, focal[0])))
    top = round(max_y * min(1.0, max(0.0, focal[1])))
    return resized.crop((left, top, left + target_w, top + target_h))


def color_grade(image: Image.Image, theme_key: str) -> Image.Image:
    theme = THEMES[theme_key]
    source = ImageEnhance.Contrast(image.convert("RGB")).enhance(1.07)
    tint = Image.new("RGB", source.size, theme["tint"])
    return Image.blend(source, tint, theme["tint_strength"])


def wrap_lines(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    max_width: int,
) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    line = words[0]
    for word in words[1:]:
        trial = f"{line} {word}"
        if draw.textbbox((0, 0), trial, font=font)[2] <= max_width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    box: tuple[int, int, int, int],
    font_path: Path,
    max_size: int,
    min_size: int,
    max_lines: int,
    spacing_ratio: float = 0.18,
) -> tuple[ImageFont.FreeTypeFont, list[str], int]:
    x0, y0, x1, y1 = box
    max_width = x1 - x0
    max_height = y1 - y0
    for size in range(max_size, min_size - 1, -1):
        font = get_font(font_path, size)
        lines = wrap_lines(draw, text, font, max_width)
        if len(lines) > max_lines:
            continue
        spacing = max(2, round(size * spacing_ratio))
        line_heights = []
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            line_heights.append(bbox[3] - bbox[1])
        total_height = sum(line_heights) + spacing * (len(lines) - 1)
        if total_height <= max_height:
            return font, lines, spacing
    raise ValueError(f"Text does not fit without clipping: {text!r} in {box}")


def draw_fitted_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    box: tuple[int, int, int, int],
    *,
    font_path: Path,
    max_size: int,
    min_size: int,
    max_lines: int,
    fill: tuple[int, int, int] | tuple[int, int, int, int],
    align: str = "center",
    stroke_width: int = 0,
    stroke_fill: tuple[int, int, int] | None = None,
) -> None:
    font, lines, spacing = fit_text(
        draw,
        text,
        box,
        font_path,
        max_size,
        min_size,
        max_lines,
    )
    x0, y0, x1, y1 = box
    heights = []
    widths = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font, stroke_width=stroke_width)
        widths.append(bbox[2] - bbox[0])
        heights.append(bbox[3] - bbox[1])
    total_height = sum(heights) + spacing * (len(lines) - 1)
    cursor_y = y0 + (y1 - y0 - total_height) // 2
    for line, width, height in zip(lines, widths, heights):
        if align == "left":
            cursor_x = x0
        elif align == "right":
            cursor_x = x1 - width
        else:
            cursor_x = x0 + (x1 - x0 - width) // 2
        draw.text(
            (cursor_x, cursor_y),
            line,
            font=font,
            fill=fill,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )
        cursor_y += height + spacing


def add_vertical_gradient(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    top: tuple[int, int, int, int],
    bottom: tuple[int, int, int, int],
) -> None:
    x0, y0, x1, y1 = box
    height = max(1, y1 - y0)
    strip = Image.new("RGBA", (1, height), (0, 0, 0, 0))
    pixels = strip.load()
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        pixels[0, y] = color
    overlay = strip.resize((x1 - x0, height))
    canvas.alpha_composite(overlay, (x0, y0))


def board_rectangles() -> dict[int, tuple[int, int, int, int]]:
    size = 6000
    corner = 840
    cell = 480
    rects: dict[int, tuple[int, int, int, int]] = {
        0: (size - corner, size - corner, size, size),
        10: (0, size - corner, corner, size),
        20: (0, 0, corner, corner),
        30: (size - corner, 0, size, corner),
    }
    for offset in range(1, 10):
        rects[offset] = (size - corner - offset * cell, size - corner, size - corner - (offset - 1) * cell, size)
        rects[10 + offset] = (0, size - corner - offset * cell, corner, size - corner - (offset - 1) * cell)
        rects[20 + offset] = (corner + (offset - 1) * cell, 0, corner + offset * cell, corner)
        rects[30 + offset] = (size - corner, corner + (offset - 1) * cell, size, corner + offset * cell)
    assert len(rects) == 40
    return rects


def kind_label(kind: str) -> str:
    return {
        "landmark": "LANDMARK",
        "lucky": "DRAW A CARD",
        "plot": "DRAW A CARD",
        "transport": "TRANSPORT",
        "service": "CITY SERVICE",
        "corner": "CORNER",
    }[kind]


def paste_space(
    board: Image.Image,
    space: dict,
    rect: tuple[int, int, int, int],
    theme_key: str,
) -> None:
    x0, y0, x1, y1 = rect
    width, height = x1 - x0, y1 - y0
    theme = THEMES[theme_key]
    source = Image.open(ROOT / space["asset"]).convert("RGB")
    focal_y = 0.44 if space["kind"] == "corner" else 0.5
    art = color_grade(cover_crop(source, (width, height), (0.5, focal_y)), theme_key)
    board.paste(art.convert("RGBA"), (x0, y0))

    label_height = 190 if space["kind"] == "corner" else (185 if height > width else 122)
    label_top = y1 - label_height
    add_vertical_gradient(
        board,
        (x0, max(y0, label_top - 65), x1, y1),
        (0, 0, 0, 0),
        (*theme["background"], 246),
    )
    draw = ImageDraw.Draw(board)
    draw.rectangle((x0 + 3, y0 + 3, x1 - 4, y1 - 4), outline=GOLD, width=7)
    draw.rectangle((x0 + 14, y0 + 14, x1 - 15, y1 - 15), outline=(*theme["accent_light"], 255), width=2)
    draw.line((x0 + 8, label_top, x1 - 8, label_top), fill=GOLD, width=4)

    badge_radius = 31 if width > 500 else 27
    badge_x = x0 + 19 + badge_radius
    badge_y = y0 + 19 + badge_radius
    draw.ellipse(
        (badge_x - badge_radius, badge_y - badge_radius, badge_x + badge_radius, badge_y + badge_radius),
        fill=(*theme["background"], 230),
        outline=GOLD,
        width=4,
    )
    number_font = get_font(FONT_SANS_BOLD, 29 if width > 500 else 25)
    number = str(space["index"])
    bbox = draw.textbbox((0, 0), number, font=number_font)
    draw.text(
        (badge_x - (bbox[2] - bbox[0]) // 2, badge_y - (bbox[3] - bbox[1]) // 2 - 2),
        number,
        font=number_font,
        fill=PALE_GOLD,
    )

    kind_font = get_font(FONT_SANS_BOLD, 18 if width < 600 else 21)
    kind = kind_label(space["kind"])
    kind_bbox = draw.textbbox((0, 0), kind, font=kind_font)
    kind_x = x0 + (width - (kind_bbox[2] - kind_bbox[0])) // 2
    draw.text((kind_x, label_top + 10), kind, font=kind_font, fill=theme["accent_light"])
    name_box = (x0 + 24, label_top + 35, x1 - 24, y1 - 17)
    max_size = 50 if space["kind"] == "corner" else (41 if height > width else 34)
    draw_fitted_text(
        draw,
        space["name"],
        name_box,
        font_path=FONT_SERIF_BOLD,
        max_size=max_size,
        min_size=22,
        max_lines=3 if height > width else 2,
        fill=CREAM,
        stroke_width=2,
        stroke_fill=INK,
    )


def draw_centered(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] | tuple[int, int, int, int],
    *,
    stroke_width: int = 0,
    stroke_fill: tuple[int, int, int] | None = None,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    draw.text(
        (xy[0] - (bbox[2] - bbox[0]) // 2, xy[1] - (bbox[3] - bbox[1]) // 2),
        text,
        font=font,
        fill=fill,
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )


def draw_deck_zone(
    board: Image.Image,
    deck: dict,
    box: tuple[int, int, int, int],
    theme_key: str,
    tilt: float,
) -> None:
    x0, y0, x1, y1 = box
    width, height = x1 - x0, y1 - y0
    theme = THEMES[theme_key]
    art = Image.open(ROOT / deck["asset"]).convert("RGB")
    card = color_grade(cover_crop(art, (width, height)), theme_key).convert("RGBA")
    add_vertical_gradient(card, (0, 0, width, height), (0, 0, 0, 5), (*theme["background"], 232))
    card_draw = ImageDraw.Draw(card)
    card_draw.rectangle((5, 5, width - 6, height - 6), outline=GOLD, width=10)
    card_draw.rectangle((26, 26, width - 27, height - 27), outline=theme["accent_light"], width=3)
    draw_fitted_text(
        card_draw,
        deck["name"],
        (55, height - 300, width - 55, height - 145),
        font_path=FONT_SERIF_BOLD,
        max_size=78,
        min_size=50,
        max_lines=2,
        fill=PALE_GOLD,
        stroke_width=3,
        stroke_fill=INK,
    )
    draw_centered(
        card_draw,
        (width // 2, height - 84),
        "24 CARDS",
        get_font(FONT_SANS_BOLD, 32),
        CREAM,
        stroke_width=2,
        stroke_fill=INK,
    )
    rotated = card.rotate(tilt, resample=Image.Resampling.BICUBIC, expand=True)
    board.alpha_composite(rotated, (x0 + (width - rotated.width) // 2, y0 + (height - rotated.height) // 2))


def render_board(data: dict, theme_key: str) -> Path:
    theme = THEMES[theme_key]
    size = 6000
    board = Image.new("RGBA", (size, size), (*theme["background"], 255))
    draw = ImageDraw.Draw(board)

    draw.rectangle((0, 0, size - 1, size - 1), fill=(*theme["background"], 255), outline=GOLD, width=18)
    draw.rectangle((35, 35, size - 36, size - 36), outline=theme["accent_light"], width=5)

    inner = (840, 840, 5160, 5160)
    draw.rectangle(inner, fill=(*theme["panel"], 255), outline=GOLD, width=10)
    for offset in range(-3600, 4600, 105):
        draw.line(
            (inner[0], inner[1] + offset, inner[2], inner[1] + offset + 4320),
            fill=(*theme["panel_alt"], 150),
            width=2,
        )
    for radius in (580, 780, 990):
        draw.ellipse(
            (3000 - radius, 1820 - radius // 3, 3000 + radius, 1820 + radius // 3),
            outline=(*theme["accent"], 130),
            width=3,
        )

    rects = board_rectangles()
    for space in data["spaces"]:
        paste_space(board, space, rects[space["index"]], theme_key)

    draw = ImageDraw.Draw(board)
    draw_centered(
        draw,
        (3000, 1530),
        data["title"].upper(),
        get_font(FONT_SERIF_BOLD, 248),
        PALE_GOLD,
        stroke_width=8,
        stroke_fill=INK,
    )
    draw_centered(
        draw,
        (3000, 1805),
        data["tagline"].upper(),
        get_font(FONT_SANS_BOLD, 58),
        CREAM,
        stroke_width=3,
        stroke_fill=INK,
    )
    draw.line((1920, 1925, 4080, 1925), fill=GOLD, width=5)
    draw_centered(
        draw,
        (3000, 2035),
        theme["edition"],
        get_font(FONT_SANS_BOLD, 45),
        theme["accent_light"],
    )

    draw_deck_zone(board, data["decks"]["lucky_break"], (1320, 2520, 2750, 4490), theme_key, -5)
    draw_deck_zone(board, data["decks"]["plot_twist"], (3250, 2520, 4680, 4490), theme_key, 5)

    draw = ImageDraw.Draw(board)
    draw.rounded_rectangle((2785, 2800, 3215, 4200), radius=190, fill=(*theme["background"], 220), outline=GOLD, width=7)
    draw.line((3000, 3000, 3000, 3990), fill=GOLD, width=20)
    for y in (3140, 3380, 3620, 3860):
        draw.polygon(((3000, y - 75), (3070, y), (3000, y + 75), (2930, y)), fill=theme["accent_light"], outline=GOLD)
    draw_centered(draw, (3000, 4380), "DRAW • RESOLVE • KEEP MOVING", get_font(FONT_SANS_BOLD, 34), CREAM)
    draw_centered(draw, (3000, 4770), "40 SPACES  •  24 LANDMARKS  •  48 EVENT CARDS", get_font(FONT_SANS_BOLD, 36), PALE_GOLD)

    output = BOARD_OUT / f"fortune-avenue-{theme_key}-board.png"
    board.convert("RGB").save(output, quality=95)
    return output


def deck_palette(deck_key: str) -> dict:
    if deck_key == "lucky_break":
        return {
            "background": (3, 24, 18),
            "panel": (7, 54, 38),
            "accent": (61, 191, 125),
            "code": "LB",
        }
    return {
        "background": (26, 5, 31),
        "panel": (63, 15, 73),
        "accent": (199, 68, 190),
        "code": "PT",
    }


def render_card(deck_key: str, deck: dict, card: dict, index: int) -> Image.Image:
    width, height = 720, 1000
    palette = deck_palette(deck_key)
    image = Image.new("RGBA", (width, height), (*palette["background"], 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((4, 4, width - 5, height - 5), radius=38, fill=(*palette["background"], 255), outline=GOLD, width=10)
    draw.rounded_rectangle((22, 22, width - 23, height - 23), radius=28, outline=palette["accent"], width=3)

    source = Image.open(ROOT / deck["asset"]).convert("RGB")
    focal_x = (index % 5) / 4
    focal_y = ((index * 3) % 7) / 6
    art = cover_crop(source, (width - 52, 410), (focal_x, focal_y))
    if deck_key == "plot_twist":
        art = Image.blend(art, Image.new("RGB", art.size, (88, 0, 76)), 0.22)
    art_mask = Image.new("L", art.size, 255)
    image.paste(art.convert("RGBA"), (26, 26), art_mask)
    add_vertical_gradient(image, (26, 240, width - 26, 456), (0, 0, 0, 0), (*palette["background"], 255))

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((42, 43, 160, 105), radius=18, fill=(*palette["background"], 230), outline=GOLD, width=3)
    code = f"{palette['code']} {index:02d}"
    draw_centered(draw, (101, 74), code, get_font(FONT_SANS_BOLD, 26), PALE_GOLD)
    draw_fitted_text(
        draw,
        deck["name"],
        (180, 43, width - 45, 108),
        font_path=FONT_SANS_BOLD,
        max_size=34,
        min_size=25,
        max_lines=1,
        fill=CREAM,
        align="right",
        stroke_width=2,
        stroke_fill=INK,
    )

    draw.rounded_rectangle((42, 410, width - 43, height - 54), radius=28, fill=(*palette["panel"], 244), outline=GOLD, width=4)
    draw_fitted_text(
        draw,
        card["title"],
        (72, 446, width - 72, 575),
        font_path=FONT_SERIF_BOLD,
        max_size=45,
        min_size=29,
        max_lines=2,
        fill=PALE_GOLD,
        stroke_width=2,
        stroke_fill=INK,
    )
    draw.line((90, 598, width - 90, 598), fill=palette["accent"], width=4)
    draw_fitted_text(
        draw,
        card["effect"],
        (82, 625, width - 82, 892),
        font_path=FONT_SANS,
        max_size=33,
        min_size=24,
        max_lines=7,
        fill=CREAM,
        align="center",
    )
    draw_centered(draw, (width // 2, 942), "FORTUNE AVENUE", get_font(FONT_SANS_BOLD, 21), palette["accent"])
    return image


def render_card_sheet(deck_key: str, deck: dict) -> Path:
    cards = deck["cards"]
    assert len(cards) == 24
    sheet_w, sheet_h = 4800, 4800
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (5, 7, 9, 255))
    draw = ImageDraw.Draw(sheet)
    palette = deck_palette(deck_key)
    for offset in range(-sheet_h, sheet_w, 90):
        draw.line((offset, 0, offset + sheet_h, sheet_h), fill=(*palette["panel"], 140), width=2)
    draw_centered(draw, (sheet_w // 2, 140), f"{deck['name'].upper()} — ALL 24 CARDS", get_font(FONT_SERIF_BOLD, 96), PALE_GOLD, stroke_width=4, stroke_fill=INK)
    draw_centered(draw, (sheet_w // 2, 240), "FORTUNE AVENUE • AMOUNTS USE AVENUE CASH", get_font(FONT_SANS_BOLD, 32), CREAM)

    card_w, card_h = 720, 1000
    gap_x, gap_y = 54, 48
    total_w = 6 * card_w + 5 * gap_x
    total_h = 4 * card_h + 3 * gap_y
    start_x = (sheet_w - total_w) // 2
    start_y = 350
    individual_dir = CARD_OUT / deck_key
    individual_dir.mkdir(parents=True, exist_ok=True)
    for i, card_data in enumerate(cards, 1):
        card = render_card(deck_key, deck, card_data, i)
        col = (i - 1) % 6
        row = (i - 1) // 6
        x = start_x + col * (card_w + gap_x)
        y = start_y + row * (card_h + gap_y)
        sheet.alpha_composite(card, (x, y))
        card.convert("RGB").save(individual_dir / f"{i:02d}-{card_data['title'].lower().replace(' ', '-')}.png")

    output = CARD_OUT / f"{deck_key}-all-24-cards.png"
    sheet.convert("RGB").save(output, quality=95)
    return output


def render_overview(paths: Iterable[Path]) -> Path:
    paths = list(paths)
    assert len(paths) == 4
    canvas = Image.new("RGB", (5200, 5200), (5, 6, 8))
    draw = ImageDraw.Draw(canvas)
    draw_centered(draw, (2600, 115), "FORTUNE AVENUE — COMPLETE VISUAL OVERVIEW", get_font(FONT_SERIF_BOLD, 92), PALE_GOLD, stroke_width=4, stroke_fill=INK)
    labels = ("EMERALD BOARD", "CRIMSON FANTASY BOARD", "LUCKY BREAK — 24 CARDS", "PLOT TWIST — 24 CARDS")
    positions = ((120, 300), (2660, 300), (120, 2780), (2660, 2780))
    panel_size = (2420, 2320)
    for path, label, position in zip(paths, labels, positions):
        source = Image.open(path).convert("RGB")
        preview = ImageOps.contain(source, (panel_size[0], panel_size[1] - 100), Image.Resampling.LANCZOS)
        x = position[0] + (panel_size[0] - preview.width) // 2
        y = position[1] + 92
        canvas.paste(preview, (x, y))
        draw.rectangle((position[0], position[1], position[0] + panel_size[0], position[1] + panel_size[1]), outline=GOLD, width=6)
        draw_centered(draw, (position[0] + panel_size[0] // 2, position[1] + 48), label, get_font(FONT_SANS_BOLD, 38), CREAM)
    output = ROOT / "output" / "fortune-avenue-complete-overview.png"
    canvas.save(output, quality=95)
    return output


def main() -> None:
    BOARD_OUT.mkdir(parents=True, exist_ok=True)
    CARD_OUT.mkdir(parents=True, exist_ok=True)
    data = load_data()
    emerald = render_board(data, "emerald")
    crimson = render_board(data, "crimson")
    lucky = render_card_sheet("lucky_break", data["decks"]["lucky_break"])
    plot = render_card_sheet("plot_twist", data["decks"]["plot_twist"])
    overview = render_overview((emerald, crimson, lucky, plot))
    print(f"Rendered: {emerald}")
    print(f"Rendered: {crimson}")
    print(f"Rendered: {lucky}")
    print(f"Rendered: {plot}")
    print(f"Rendered: {overview}")


if __name__ == "__main__":
    main()
