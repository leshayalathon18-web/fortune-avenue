# Fortune Avenue

> Roll in. Buy big. Cause chaos.

![Fortune Avenue complete visual overview](output/mobile/fortune-avenue-overview-mobile.jpg)

Fortune Avenue is an original physical board-game concept built around strange roadside landmarks, playful chaos, and two premium visual editions.

## What's included

- Two complete 40-space boards using the same gameplay layout
  - Emerald Edition — black, emerald, and gold
  - Crimson Fantasy Edition — black, crimson, and gold
- 24 original landmark spaces
- 48 event cards
  - 24 Lucky Break cards
  - 24 Plot Twist cards
- Nine approved colorful resin player pawns with front, side, and back sculpt turnarounds
- Original artwork for landmarks, transportation, services, corners, and event spaces
- Individual card exports, full deck sheets, high-resolution boards, and phone-friendly previews
- Structured game and pawn data with reproducible Python rendering tools

## View the game

### Boards

- [Emerald Edition — full resolution](output/boards/fortune-avenue-emerald-board.png)
- [Crimson Fantasy Edition — full resolution](output/boards/fortune-avenue-crimson-board.png)
- [Emerald Edition — phone preview](output/mobile/fortune-avenue-emerald-board-mobile.jpg)
- [Crimson Fantasy Edition — phone preview](output/mobile/fortune-avenue-crimson-board-mobile.jpg)

### Event cards

- [All 24 Lucky Break cards](output/cards/lucky_break-all-24-cards.png)
- [All 24 Plot Twist cards](output/cards/plot_twist-all-24-cards.png)
- [Lucky Break cards 01–12 — phone page](output/mobile/lucky-break-cards-01-12-mobile.jpg)
- [Lucky Break cards 13–24 — phone page](output/mobile/lucky-break-cards-13-24-mobile.jpg)
- [Plot Twist cards 01–12 — phone page](output/mobile/plot-twist-cards-01-12-mobile.jpg)
- [Plot Twist cards 13–24 — phone page](output/mobile/plot-twist-cards-13-24-mobile.jpg)

### Colorful resin pawns

![Fortune Avenue nine-pawn concept lineup](assets/pawns/fortune-avenue-colorful-resin-pawns-concept-v2-heart-rig.png)

- [All nine production sheets — high resolution](output/pawns/fortune-avenue-all-nine-pawn-production-sheets.png)
- [All nine production sheets — phone preview](output/pawns/fortune-avenue-all-nine-pawns-mobile.jpg)
- [Individual sculpt production sheets](output/pawns/production-sheets)
- [Pawn dimensions and manufacturing guidance](docs/pawn-production-spec.md)

Individual print-card images are available under [`output/cards`](output/cards), and the complete landmark artwork collection is under [`assets/landmarks`](assets/landmarks).

## Project structure

```text
assets/       Landmark, board-concept, special-space, and pawn artwork
docs/         Landmark roster, pawn specifications, and naming notes
game-data/    Canonical board, event-card, and pawn production data
output/       Boards, cards, mobile previews, and pawn production sheets
tools/        Deterministic board, card, and pawn production renderers
```

## Rebuild the exports

Requires Python 3.10 or newer.

```powershell
python -m pip install -r requirements.txt
python tools/render_fortune_avenue.py
python tools/make_mobile_previews.py
python tools/render_pawn_production_sheets.py
```

The renderers validate the expected 40 board spaces, 24 cards per event deck, nine approved pawns, required artwork paths, and text-fitting constraints before finishing.

## Canonical production notes

- “Bicth Valley” is the confirmed intentional Vine/meme spelling.
- `assets/landmarks/06-dab-valley.png` is the selected main Dab Valley artwork.
- `assets/landmarks/01-sheboygan-wisconsin.png` is the selected Sheboygan artwork.
- Earlier visual explorations remain archived beside the canonical landmark files.
