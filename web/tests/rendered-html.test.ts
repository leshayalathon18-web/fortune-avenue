import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships the finished Fortune Avenue opening and social metadata", async () => {
  const [game, shared, layout, page, styles, errorScreen] = await Promise.all([
    readFile(new URL("../app/FortuneAvenueGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/shared.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/error.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(shared, /Enter the Avenue/);
  assert.match(shared, /href=\{enterHref\}/);
  assert.match(shared, /Read the rules/);
  assert.match(shared, /GAME_TAGLINE/);
  assert.match(layout, /Fortune Avenue — Play with bots or friends/);
  assert.match(layout, /og\.png/);
  assert.match(page, /FortuneAvenueGame/);
  assert.match(page, /autoEnter/);
  assert.match(game, /function storageGet/);
  assert.match(styles, /\.opening-cover[\s\S]*?z-index: 0/);
  assert.match(styles, /from \{ opacity: 0\.92/);
  assert.doesNotMatch(styles, /\.opening-curtain[\s\S]{0,300}width: 51%/);
  assert.match(errorScreen, /The Avenue needs one more roll/);
  assert.doesNotMatch(`${game}${shared}${layout}${page}`, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});

test("ships the bespoke cover, game art, and persistent-room migration", async () => {
  await Promise.all([
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/cover.webp", import.meta.url)),
    access(new URL("../public/art/boards/emerald-board.webp", import.meta.url)),
    access(new URL("../public/art/pawns/09-fortune-penguin-turnaround-source.webp", import.meta.url)),
    access(new URL("../drizzle/0000_chemical_forge.sql", import.meta.url)),
  ]);
  const migration = await readFile(new URL("../drizzle/0000_chemical_forge.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `fortune_rooms`/);
  assert.match(migration, /CREATE TABLE `fortune_room_sessions`/);
  assert.match(migration, /idx_fortune_rooms_updated_at/);
  assert.doesNotMatch(await readFile(new URL("../package.json", import.meta.url), "utf8"), /react-loading-skeleton/);
});
