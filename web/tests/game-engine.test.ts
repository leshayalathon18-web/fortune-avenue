import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { LUCKY_CARDS, PAWNS, PLOT_CARDS, SPACE_BY_INDEX, SPACES } from "../lib/game-data";
import {
  addHumanPlayer,
  applyRoomAction,
  createLobbyState,
  currentPlayer,
  netWorth,
  ownedProperties,
  runBotTurns,
  startGame,
} from "../lib/game-engine";

function lobby(botCount = 1) {
  return createLobbyState({
    code: "TEST42",
    kind: botCount ? "bots" : "friends",
    theme: "emerald",
    maxPlayers: Math.max(2, botCount + 1),
    hostPlayerId: "host",
    hostName: "Host",
    pawnSlug: "fortune-penguin",
    botCount,
    seed: 424242,
  });
}

test("uses the complete approved game collection", () => {
  assert.equal(SPACES.length, 40);
  assert.equal(new Set(SPACES.map((space) => space.index)).size, 40);
  assert.equal(SPACES.filter((space) => space.kind === "landmark").length, 24);
  assert.equal(LUCKY_CARDS.length, 24);
  assert.equal(PLOT_CARDS.length, 24);
  assert.equal(PAWNS.length, 9);
  assert.equal(SPACE_BY_INDEX.get(2)?.name, "Bicth Valley");
  assert.ok(SPACES.every((space) => space.asset.endsWith(".webp")));
  assert.ok([...LUCKY_CARDS, ...PLOT_CARDS, ...PAWNS].every((item) => item.image.endsWith(".webp")));
});

test("includes every card image referenced by the game", async () => {
  await Promise.all(
    [...LUCKY_CARDS, ...PLOT_CARDS].map((card) => access(new URL(`../public${card.image}`, import.meta.url))),
  );
});

test("adds a friend to a lobby without mutating the earlier room snapshot", () => {
  const source = lobby(0);
  const joined = addHumanPlayer(source, "friend", "Friend", "fortune-key");
  assert.equal(source.players.length, 1);
  assert.equal(joined.players.length, 2);
  assert.equal(joined.players[1].name, "Friend");
  assert.notEqual(joined.players[0].pawnSlug, joined.players[1].pawnSlug);
});

test("runs a complete human turn followed by autonomous bot turns", () => {
  let state = startGame(lobby(3));
  assert.equal(currentPlayer(state)?.id, "host");
  state = applyRoomAction(state, "host", { type: "roll" });
  assert.equal(state.rolled, true);
  assert.ok(state.dice && state.dice[0] >= 1 && state.dice[0] <= 6);
  if (state.pendingPurchase !== null) {
    const space = SPACE_BY_INDEX.get(state.pendingPurchase)!;
    state = applyRoomAction(state, "host", state.players[0].cash >= space.price ? { type: "buy" } : { type: "skip-purchase" });
  }
  state = applyRoomAction(state, "host", { type: "end-turn" });
  state = runBotTurns(state);
  assert.equal(currentPlayer(state)?.id, "host");
  assert.ok(state.turnNumber >= 5);
  assert.ok(state.log.length > 4);
});

test("advances past a bot that goes bankrupt during its roll", () => {
  let state = startGame(lobby(2));
  state.currentPlayerIndex = 1;
  state.players[1].bankrupt = true;
  state.players[1].cash = 0;
  state.players[2].cash = 100000;
  state.rolled = true;

  state = runBotTurns(state);

  assert.equal(state.phase, "playing");
  assert.equal(currentPlayer(state)?.id, "host");
  assert.equal(state.rolled, false);
});

test("lets a bankrupt human close their turn so the match can finish", () => {
  let state = startGame(lobby(1));
  state.players[0].bankrupt = true;
  state.players[0].cash = 0;
  state.rolled = true;

  state = applyRoomAction(state, "host", { type: "end-turn" });

  assert.equal(state.phase, "finished");
  assert.equal(state.winnerId, state.players[1].id);
});

test("survives repeated six-player rounds with purchases, cards, rent, and bot decisions", () => {
  let state = startGame(lobby(5));
  state.settings.targetNetWorth = 999999;
  state.settings.maxTurns = 9999;
  for (const player of state.players) player.cash = 100000;
  for (let round = 0; round < 18 && state.phase === "playing"; round += 1) {
    assert.equal(currentPlayer(state)?.id, "host");
    state = applyRoomAction(state, "host", { type: "roll" });
    if (state.pendingPurchase !== null) {
      const space = SPACE_BY_INDEX.get(state.pendingPurchase)!;
      const action = state.players[0].cash >= space.price + 150 ? { type: "buy" as const } : { type: "skip-purchase" as const };
      state = applyRoomAction(state, "host", action);
    }
    state = applyRoomAction(state, "host", { type: "end-turn" });
    state = runBotTurns(state);
  }
  assert.equal(state.phase, "playing");
  assert.ok(state.turnNumber > 70);
  assert.ok(Object.keys(state.properties).length > 0);
  assert.ok(state.players.every((player) => Number.isFinite(player.cash)));
  assert.ok(state.players.every((player) => Number.isFinite(netWorth(state, player.id))));
  assert.ok(state.log.length <= 60);
  assert.ok(ownedProperties(state, "host").length >= 0);
});
