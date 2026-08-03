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
  assert.match(opening, /href="\/play\?release=17"/);
  assert.match(opening, /z-index: 2147483647/);
  assert.match(opening, /\.panel \{[^}]*opacity: 1;[^}]*visibility: visible;/);
  assert.match(opening, /url\("\/og\.png\?cover=2"\)/);
  assert.match(opening, /2–6 players/);
  assert.doesNotMatch(opening, /<script\b/i);
  assert.match(layout, /Fortune Avenue.+Play with bots or friends/);
  assert.match(layout, /og\.png/);
  assert.match(page, /redirect\("\/opening\.html\?release=17"\)/);
  assert.match(launchPage, /redirect\("\/opening\.html\?release=17"\)/);
  assert.match(playPage, /FortuneAvenueGame/);
  assert.match(game, /function storageGet/);
  assert.match(game, /seenCardEvents/);
  assert.match(game, /setCardQueue/);
  assert.match(shared, /src="\/og\.png\?cover=2"[\s\S]*unoptimized/);
  assert.match(shared, /import \{ Crown, Dices, Eye, KeyRound, Trophy, UserRound \} from "lucide-react"/);
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
  assert.match(gameTable, /mobile-shake-only/);
  assert.match(gameTable, /Enable shake dice/);
  assert.match(gameTable, /Shake phone - stop to splat/);
  assert.match(gameTable, /className="dice-impact"/);
  assert.match(gameTable, /aria-label="Click dice to roll"/);
  assert.doesNotMatch(gameTable, /Shake phone or tap dice to roll|Tap dice to roll/);
  assert.match(gameTable, /export function CashCollection/);
  assert.match(gameTable, /Cash to spend/);
  assert.match(gameTable, /className="player-cash"/);
  assert.match(gameTable, /function DistrictMark/);
  assert.match(gameTable, /function DistrictCollectionTracker/);
  assert.match(gameTable, /Match the D-number \+ symbol/);
  assert.match(gameTable, /Completes your 4\/4 district set/);
  assert.match(gameTable, /<Castle aria-hidden="true" \/>/);
  assert.match(shared, /Classic: 180 turns/);
  assert.doesNotMatch(`${game}${shared}`, /screen === "opening"|OpeningScreen/);
  assert.match(game, /useState<Screen>\(sanitizedInitialRoom\.length === 6 \? "loading" : "home"\)/);
  assert.match(styles, /\.home-menu \{[^}]*order: -1/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.home-cover-card \{[^}]*aspect-ratio: 3 \/ 2/);
  assert.match(styles, /\.menu-button-icon \{[\s\S]*place-items: center/);
  assert.match(styles, /\.menu-button-icon svg \{/);
  assert.match(styles, /\.emerald-action \.menu-button-icon/);
  assert.match(styles, /\.crimson-action \.menu-button-icon/);
  assert.match(styles, /\.dark-action \.menu-button-icon/);
  assert.match(styles, /\.space-name[\s\S]*overflow-wrap: normal/);
  assert.match(styles, /\.auction-house/);
  assert.match(styles, /\.trade-table/);
  assert.match(styles, /\.board-dice-control/);
  assert.match(styles, /@keyframes mobile-dice-splat-left/);
  assert.match(styles, /\.mobile-shake-only\.is-landed \.dice-impact/);
  assert.match(styles, /\.cash-stack/);
  assert.match(styles, /\.spendable-balance \{/);
  assert.match(styles, /\.player-cash \{/);
  assert.match(styles, /\.district-mark \{/);
  assert.match(styles, /\.collection-tracker \{/);
  assert.match(styles, /\[data-district="5"\]/);
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

test("ships the Avenue expansion with profiles, spectators, rescue tools, and polished controls", async () => {
  const [
    game,
    gameTable,
    shared,
    playerExperience,
    engine,
    gameTypes,
    profileStorage,
    profileRoute,
    spectatorRoute,
    roomStorage,
    migration,
    styles,
    manifest,
  ] = await Promise.all([
    readFile(new URL("../app/FortuneAvenueGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/game-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/shared.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/player-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/profile-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[code]/spectate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/room-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_spooky_imperial_guard.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);

  assert.match(shared, /Match style/);
  assert.match(shared, /Object\.keys\(MATCH_MODES\)/);
  assert.match(shared, /Watch live/);
  assert.match(shared, /Avenue profile/);
  assert.match(playerExperience, /Achievement cabinet/);
  assert.match(playerExperience, /Step 6 of 6/);
  assert.match(playerExperience, /Rescue a bad fortune/);
  assert.match(gameTable, /function DeedManager/);
  assert.match(gameTable, /function BankruptcyRescue/);
  assert.match(gameTable, /Mortgage deed/);
  assert.match(gameTable, /Sell castle/);
  assert.match(gameTable, /Settle \{money\(debt\.remainingAmount\)\}/);
  assert.match(gameTable, /function PawnReaction/);
  assert.match(gameTable, /pawn-victory-stage/);
  assert.match(gameTypes, /type MatchMode = "classic" \| "party" \| "grand-finale"/);
  assert.match(gameTypes, /type: "sell-upgrade"/);
  assert.match(gameTypes, /type: "mortgage"/);
  assert.match(gameTypes, /type: "declare-bankruptcy"/);
  assert.match(engine, /function botRescueAction/);
  assert.match(engine, /export function normalizeGameState/);
  assert.match(engine, /mortgaged deed/i);
  assert.match(game, /navigator\.vibrate/);
  assert.match(game, /createOscillator/);
  assert.match(game, /ProfilePanel/);
  assert.match(game, /TutorialOverlay/);
  assert.match(profileRoute, /createProfile/);
  assert.match(profileStorage, /recordFinishedProfiles/);
  assert.match(spectatorRoute, /role: "spectator"/);
  assert.match(roomStorage, /normalizeGameState/);
  assert.match(migration, /CREATE TABLE `fortune_profiles`/);
  assert.match(migration, /CREATE TABLE `fortune_profile_games`/);
  assert.match(migration, /ADD `role` text DEFAULT 'player'/);
  assert.match(styles, /\.deed-manager \{/);
  assert.match(styles, /\.rescue-house \{/);
  assert.match(styles, /\.profile-panel \{/);
  assert.match(styles, /\.tutorial-card \{/);
  assert.match(styles, /@keyframes reaction-pop/);
  assert.match(manifest, /"start_url": "\/opening\.html\?release=17"/);
});
