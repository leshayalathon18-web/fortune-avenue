import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships the finished Fortune Avenue opening and social metadata", async () => {
  const [game, shared, gameTable, opening, layout, page, launchPage, playPage, styles, errorScreen] = await Promise.all([
    readFile(new URL("../app/FortuneAvenueGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/shared.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/game-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/opening.html", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/launch/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/play/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/error.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(opening, /Enter the Avenue/);
  assert.match(opening, /href="\/play\?release=9"/);
  assert.match(opening, /z-index: 2147483647/);
  assert.match(opening, /\.panel \{[^}]*opacity: 1;[^}]*visibility: visible;/);
  assert.match(opening, /url\("\/og\.png"\)/);
  assert.match(opening, /2–6 players/);
  assert.doesNotMatch(opening, /<script\b/i);
  assert.match(layout, /Fortune Avenue.+Play with bots or friends/);
  assert.match(layout, /og\.png/);
  assert.match(page, /redirect\("\/opening\.html\?release=9"\)/);
  assert.match(launchPage, /redirect\("\/opening\.html\?release=9"\)/);
  assert.match(playPage, /FortuneAvenueGame/);
  assert.match(game, /function storageGet/);
  assert.match(game, /seenCardEvents/);
  assert.match(game, /setCardQueue/);
  assert.match(shared, /src="\/og\.png"[\s\S]*unoptimized/);
  assert.match(shared, /import \{ Crown, Dices, KeyRound \} from "lucide-react"/);
  assert.match(shared, /<Dices \/>/);
  assert.match(shared, /<Crown \/>/);
  assert.match(shared, /<KeyRound \/>/);
  assert.doesNotMatch(shared, /dice-mark|link-mark|key-mark/);
  assert.match(gameTable, /event\.card\.image[\s\S]*unoptimized/);
  assert.match(gameTable, /const BOARD_LABELS/);
  assert.match(gameTable, /type: "start-auction"/);
  assert.match(gameTable, /type: "skip-purchase"/);
  assert.match(gameTable, /type: "propose-trade"/);
  assert.match(gameTable, /type: "auction-tick"/);
  assert.match(gameTable, /type: "steal-landmark"/);
  assert.match(gameTable, /Steal a Landmark/);
  assert.match(gameTable, /src="\/app-icon-192\.png"/);
  assert.match(gameTable, /ShakeDiceControl/);
  assert.match(gameTable, /requestPermission/);
  assert.match(gameTable, /export function CashCollection/);
  assert.match(gameTable, /<Castle aria-hidden="true" \/>/);
  assert.match(shared, /after 180 turns/);
  assert.doesNotMatch(`${game}${shared}`, /screen === "opening"|OpeningScreen/);
  assert.match(game, /useState<Screen>\(sanitizedInitialRoom\.length === 6 \? "loading" : "home"\)/);
  assert.match(styles, /\.home-menu \{[^}]*order: -1/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.home-cover-card \{[^}]*aspect-ratio: 40 \/ 21/);
  assert.match(styles, /\.menu-button-icon \{[\s\S]*place-items: center/);
  assert.match(styles, /\.menu-button-icon svg \{/);
  assert.match(styles, /\.emerald-action \.menu-button-icon/);
  assert.match(styles, /\.crimson-action \.menu-button-icon/);
  assert.match(styles, /\.dark-action \.menu-button-icon/);
  assert.match(styles, /\.space-name[\s\S]*overflow-wrap: normal/);
  assert.match(styles, /\.auction-house/);
  assert.match(styles, /\.trade-table/);
  assert.match(styles, /\.board-dice-control/);
  assert.match(styles, /\.cash-stack/);
  assert.match(styles, /@keyframes pawn-step/);
  assert.match(styles, /\.setup-card,[\s\S]*max-width: 980px;[\s\S]*min-width: 0;/);
  assert.match(errorScreen, /The Avenue needs one more roll/);
  assert.doesNotMatch(`${game}${shared}${gameTable}${opening}${layout}${page}${launchPage}${playPage}`, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});

test("ships the bespoke cover, game art, and persistent-room migration", async () => {
  await Promise.all([
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/cover.webp", import.meta.url)),
    access(new URL("../public/app-icon-192.png", import.meta.url)),
    access(new URL("../public/app-icon-512.png", import.meta.url)),
    access(new URL("../public/apple-touch-icon.png", import.meta.url)),
    access(new URL("../public/manifest.webmanifest", import.meta.url)),
    access(new URL("../public/art/cards/plot-twist/19-steal-a-landmark.webp", import.meta.url)),
    access(new URL("../public/art/boards/emerald-board.webp", import.meta.url)),
    access(new URL("../public/art/pawns/09-fortune-penguin-turnaround-source.webp", import.meta.url)),
    access(new URL("../drizzle/0000_chemical_forge.sql", import.meta.url)),
  ]);
  const migration = await readFile(new URL("../drizzle/0000_chemical_forge.sql", import.meta.url), "utf8");
  const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `fortune_rooms`/);
  assert.match(migration, /CREATE TABLE `fortune_room_sessions`/);
  assert.match(migration, /idx_fortune_rooms_updated_at/);
  assert.match(nextConfig, /images:\s*\{\s*unoptimized: true/);
  assert.doesNotMatch(await readFile(new URL("../package.json", import.meta.url), "utf8"), /react-loading-skeleton/);
});
