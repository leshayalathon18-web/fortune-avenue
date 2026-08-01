import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships the finished Fortune Avenue opening and social metadata", async () => {
  const [game, shared, launch, layout, page, playPage, styles, errorScreen] = await Promise.all([
    readFile(new URL("../app/FortuneAvenueGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/shared.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/launch-screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/play/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/error.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(launch, /Enter the Avenue/);
  assert.match(launch, /href="\/play"/);
  assert.match(launch, /zIndex: 2147483647/);
  assert.match(launch, /background: "#07100d"/);
  assert.match(launch, /foreground build 4/);
  assert.match(layout, /Fortune Avenue — Play with bots or friends/);
  assert.match(layout, /og\.png/);
  assert.match(page, /LaunchScreen/);
  assert.match(playPage, /FortuneAvenueGame/);
  assert.match(game, /function storageGet/);
  assert.doesNotMatch(`${game}${shared}`, /screen === "opening"|OpeningScreen/);
  assert.match(game, /useState<Screen>\(sanitizedInitialRoom\.length === 6 \? "loading" : "home"\)/);
  assert.match(styles, /\.launch-cover/);
  assert.match(styles, /\.home-menu \{[^}]*order: -1/);
  assert.match(errorScreen, /The Avenue needs one more roll/);
  assert.doesNotMatch(`${game}${shared}${launch}${layout}${page}${playPage}`, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
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
