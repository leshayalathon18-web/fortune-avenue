from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output"
MOBILE = OUTPUT / "mobile"

SERIF_BOLD = Path("C:/Windows/Fonts/georgiab.ttf")
SANS_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")

GOLD = (221, 177, 75)
PALE_GOLD = (255, 232, 168)
CREAM = (255, 248, 225)
INK = (5, 6, 8)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def centered_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    typeface: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    *,
    stroke_width: int = 0,
    stroke_fill: tuple[int, int, int] = INK,
) -> None:
    draw.text(
        xy,
        text,
        font=typeface,
        fill=fill,
        anchor="mm",
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )


def save_mobile_copy(source: Path, destination: Path, max_side: int, quality: int) -> None:
    with Image.open(source) as opened:
        image = opened.convert("RGB")
        scale = max_side / max(image.size)
        size = (round(image.width * scale), round(image.height * scale))
        image = image.resize(size, Image.Resampling.LANCZOS)
        image = image.filter(ImageFilter.UnsharpMask(radius=0.8, percent=115, threshold=3))
        image.save(
            destination,
            format="JPEG",
            quality=quality,
            optimize=True,
            progressive=True,
            subsampling=1,
        )


def deck_background(deck_key: str, size: tuple[int, int]) -> Image.Image:
    artwork = ROOT / "assets" / "special-spaces" / f"{deck_key.replace('_', '-')}.png"
    with Image.open(artwork) as opened:
        background = ImageOps.fit(opened.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    background = background.filter(ImageFilter.GaussianBlur(20))
    veil = Image.new("RGBA", size, (*INK, 210))
    background = Image.alpha_composite(background.convert("RGBA"), veil)

    draw = ImageDraw.Draw(background, "RGBA")
    for offset in range(-size[1], size[0], 130):
        draw.line((offset, 0, offset + size[1], size[1]), fill=(*GOLD, 28), width=3)
    draw.rounded_rectangle((28, 28, size[0] - 28, size[1] - 28), radius=34, outline=(*GOLD, 230), width=5)
    draw.rounded_rectangle((45, 45, size[0] - 45, size[1] - 45), radius=27, outline=(*PALE_GOLD, 90), width=2)
    return background


def render_card_page(deck_key: str, deck_name: str, files: list[Path], page: int) -> Path:
    page_width, page_height = 1800, 3360
    card_width, card_height = 520, 722
    gap_x, gap_y = 42, 36
    title_bottom = 270
    total_width = 3 * card_width + 2 * gap_x
    start_x = (page_width - total_width) // 2
    start_y = title_bottom

    canvas = deck_background(deck_key, (page_width, page_height))
    draw = ImageDraw.Draw(canvas)
    number_start = 1 if page == 1 else 13
    number_end = 12 if page == 1 else 24
    centered_text(
        draw,
        (page_width // 2, 112),
        deck_name.upper(),
        font(SERIF_BOLD, 76),
        PALE_GOLD,
        stroke_width=3,
    )
    centered_text(
        draw,
        (page_width // 2, 198),
        f"CARDS {number_start:02d}–{number_end:02d}  •  PAGE {page} OF 2",
        font(SANS_BOLD, 31),
        CREAM,
    )

    for index, card_path in enumerate(files):
        row, col = divmod(index, 3)
        x = start_x + col * (card_width + gap_x)
        y = start_y + row * (card_height + gap_y)
        with Image.open(card_path) as opened:
            card = opened.convert("RGB").resize((card_width, card_height), Image.Resampling.LANCZOS)
            card = card.filter(ImageFilter.UnsharpMask(radius=0.7, percent=110, threshold=2))
        shadow = Image.new("RGBA", (card_width + 30, card_height + 30), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rounded_rectangle((12, 12, card_width + 10, card_height + 10), radius=20, fill=(0, 0, 0, 180))
        shadow = shadow.filter(ImageFilter.GaussianBlur(10))
        canvas.alpha_composite(shadow, (x - 8, y - 5))
        canvas.alpha_composite(card.convert("RGBA"), (x, y))

    centered_text(
        draw,
        (page_width // 2, page_height - 78),
        "FORTUNE AVENUE  •  PINCH TO ZOOM",
        font(SANS_BOLD, 29),
        PALE_GOLD,
    )
    destination = MOBILE / f"{deck_key.replace('_', '-')}-cards-{number_start:02d}-{number_end:02d}-mobile.jpg"
    canvas.convert("RGB").save(
        destination,
        format="JPEG",
        quality=84,
        optimize=True,
        progressive=True,
        subsampling=1,
    )
    return destination


def main() -> None:
    MOBILE.mkdir(parents=True, exist_ok=True)

    copies = (
        (OUTPUT / "fortune-avenue-complete-overview.png", MOBILE / "fortune-avenue-overview-mobile.jpg", 1600, 79),
        (OUTPUT / "boards" / "fortune-avenue-emerald-board.png", MOBILE / "fortune-avenue-emerald-board-mobile.jpg", 2200, 83),
        (OUTPUT / "boards" / "fortune-avenue-crimson-board.png", MOBILE / "fortune-avenue-crimson-board-mobile.jpg", 2200, 83),
    )
    for source, destination, max_side, quality in copies:
        save_mobile_copy(source, destination, max_side, quality)
        print(f"Rendered: {destination}")

    for deck_key, deck_name in (("lucky_break", "Lucky Break"), ("plot_twist", "Plot Twist")):
        files = sorted((OUTPUT / "cards" / deck_key).glob("*.png"))
        if len(files) != 24:
            raise RuntimeError(f"Expected 24 {deck_name} cards, found {len(files)}")
        for page in (1, 2):
            start = (page - 1) * 12
            destination = render_card_page(deck_key, deck_name, files[start : start + 12], page)
            print(f"Rendered: {destination}")


if __name__ == "__main__":
    main()
