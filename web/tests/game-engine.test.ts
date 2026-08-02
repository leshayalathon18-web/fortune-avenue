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
  propertyRent,
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

function runBotsAndFoldHostAuctions(source: ReturnType<typeof startGame>) {
  let state = runBotTurns(source);
  let safety = 0;
  while (state.phase === "playing" && state.auction?.currentBidderId === "host" && safety < 80) {
    state = applyRoomAction(state, "host", { type: "auction-pass" });
    state = runBotTurns(state);
    safety += 1;
  }
  return state;
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
  state = runBotsAndFoldHostAuctions(state);
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

  state = runBotsAndFoldHostAuctions(state);

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
    state = runBotsAndFoldHostAuctions(state);
  }
  assert.equal(state.phase, "playing");
  assert.ok(state.turnNumber > 70);
  assert.ok(Object.keys(state.properties).length > 0);
  assert.ok(state.players.every((player) => Number.isFinite(player.cash)));
  assert.ok(state.players.every((player) => Number.isFinite(netWorth(state, player.id))));
  assert.ok(state.log.length <= 60);
  assert.ok(ownedProperties(state, "host").length >= 0);
});

test("runs a live auction through bids, folds, and a final deed sale", () => {
  const withFriend = addHumanPlayer(lobby(0), "friend", "Friend", "fortune-key");
  let state = startGame(withFriend);
  state.rolled = true;
  state.pendingPurchase = 1;

  state = applyRoomAction(state, "host", { type: "start-auction" });
  assert.equal(state.pendingPurchase, null);
  assert.equal(state.auction?.currentBidderId, "friend");

  state = applyRoomAction(state, "friend", { type: "auction-bid", amount: 40 });
  assert.equal(state.auction?.currentBid, 40);
  assert.equal(state.auction?.currentBidderId, "host");

  state = applyRoomAction(state, "host", { type: "auction-pass" });
  assert.equal(state.auction, null);
  assert.equal(state.properties["1"]?.ownerId, "friend");
  assert.equal(state.players[1].cash, 1360);
  assert.equal(state.lastEvent?.title, "Sold!");
});

test("records every dice move for step-by-step pawn travel", () => {
  let state = startGame(lobby(1));
  state = applyRoomAction(state, "host", { type: "roll" });
  const movement = state.log.find((event) => event.type === "roll")?.movement;
  assert.ok(movement);
  assert.equal(movement.from, 0);
  assert.equal(movement.to, state.players[0].position);
  assert.equal(movement.steps, (state.dice?.[0] ?? 0) + (state.dice?.[1] ?? 0));
  assert.equal(movement.direction, 1);
});

test("tags rent with its exact payer, recipient, and collectible amount", () => {
  const withFriend = addHumanPlayer(lobby(0), "friend", "Friend", "fortune-key");
  const initial = startGame(withFriend);
  const probe = applyRoomAction(initial, "host", { type: "roll" });
  const total = (probe.dice?.[0] ?? 0) + (probe.dice?.[1] ?? 0);
  initial.players[0].position = ((1 - total) % SPACES.length + SPACES.length) % SPACES.length;
  initial.properties["1"] = {
    spaceIndex: 1,
    ownerId: "friend",
    upgrades: 0,
    closedUntilTurn: 0,
    rentMultiplierUntilTurn: 0,
    nextVisitorFree: false,
  };

  const state = applyRoomAction(initial, "host", { type: "roll" });
  const payment = state.log.find((event) => event.type === "rent")?.moneyTransfer;
  assert.ok(payment);
  assert.equal(payment.fromPlayerId, "host");
  assert.equal(payment.toPlayerId, "friend");
  assert.ok(payment.amount > 0);
});

test("requires a complete color district, then turns two crowns into a castle", () => {
  const incomplete = startGame(lobby(1));
  incomplete.properties["1"] = {
    spaceIndex: 1,
    ownerId: "host",
    upgrades: 0,
    closedUntilTurn: 0,
    rentMultiplierUntilTurn: 0,
    nextVisitorFree: false,
  };
  assert.throws(
    () => applyRoomAction(incomplete, "host", { type: "upgrade", spaceIndex: 1 }),
    /Own every Strange Beginnings landmark/,
  );

  let state = startGame(lobby(1));
  for (const spaceIndex of [1, 2, 4, 5]) {
    state.properties[String(spaceIndex)] = {
      spaceIndex,
      ownerId: "host",
      upgrades: 0,
      closedUntilTurn: 0,
      rentMultiplierUntilTurn: 0,
      nextVisitorFree: false,
    };
  }
  const fees = [propertyRent(state, state.properties["1"], 7)];
  for (let build = 1; build <= 3; build += 1) {
    state = applyRoomAction(state, "host", { type: "upgrade", spaceIndex: 1 });
    fees.push(propertyRent(state, state.properties["1"], 7));
  }
  assert.ok(fees.every((fee, index) => index === 0 || fee > fees[index - 1]));
  assert.equal(state.properties["1"].upgrades, 3);
  assert.equal(state.lastEvent?.title, "Castle crowned");
  assert.match(state.lastEvent?.message ?? "", /raised a castle/);
});
