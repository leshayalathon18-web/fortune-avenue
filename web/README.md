# Fortune Avenue — Playable Web Edition

Fortune Avenue is a polished 2–6 player browser board game built from the approved physical-game artwork and rules collection.

## Play modes

- Quick Match: one human player with 1–5 autonomous bots.
- Friend Room: persistent six-character room codes, invite links, optional bots, and automatic reconnection from the same device.
- Emerald After Dark and Crimson Fantasy board themes.

## Included game systems

- Interactive 40-space board with all 24 custom landmarks.
- All 48 Lucky Break and Plot Twist cards.
- Nine approved colorful resin pawns.
- Deed purchasing, entry fees, full-district bonuses, three upgrade levels, bankruptcy, and short-game victory conditions.
- Responsive phone, tablet, desktop, and mobile-landscape layouts.
- Animated opening, card reveals, token movement, particles, button feedback, and procedural sound cues.
- Durable Cloudflare D1 room state; browser storage holds only the private seat-resume credential.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm test
npm run lint
npm run test:live-room
```

The live-room smoke test expects the development server at `http://localhost:3000` unless `FORTUNE_AVENUE_URL` is set.
