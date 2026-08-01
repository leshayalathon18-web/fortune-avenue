from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

TARGETS = {
    PUBLIC / "art" / "landmarks": ((512, 512), 84),
    PUBLIC / "art" / "spaces": ((512, 512), 84),
    PUBLIC / "art" / "cards" / "lucky-break": ((432, 600), 86),
    PUBLIC / "art" / "cards" / "plot-twist": ((432, 600), 86),
    PUBLIC / "art" / "pawns": ((960, 480), 88),
    PUBLIC / "art" / "boards": ((1400, 1400), 86),
}


def convert_directory(directory: Path, max_size: tuple[int, int], quality: int) -> int:
    converted = 0
    for source in sorted(directory.glob("*.png")):
        destination = source.with_suffix(".webp")
        with Image.open(source) as image:
            image = image.convert("RGB")
            image.thumbnail(max_size, Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=quality, method=6)
        source.unlink()
        converted += 1
    return converted


def main() -> None:
    total = 0
    for directory, (max_size, quality) in TARGETS.items():
        total += convert_directory(directory, max_size, quality)

    cover_source = PUBLIC / "og.png"
    cover_destination = PUBLIC / "cover.webp"
    if cover_source.exists():
        with Image.open(cover_source) as cover:
            cover.convert("RGB").save(
                cover_destination,
                "WEBP",
                quality=88,
                method=6,
            )

    print(f"Optimized {total} game images and the opening cover.")


if __name__ == "__main__":
    main()
