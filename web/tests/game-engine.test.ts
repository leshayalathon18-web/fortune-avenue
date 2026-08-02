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

function firstCardChoiceSelection(state: ReturnType<typeof startGame>) {
  const choice = state.cardChoice;
  if (!choice) throw new Error("No card choice is open.");
  if (choice.cardTitle === "Big Break") return "cash";
  if (choice.cardTitle === "Surprise Inspection") return "pay-20";
  if (choice.cardTitle === "Lost Luggage") return "pay-40";
  if (choice.options.length > 0) return choice.options[0];
  if (choice.eligibleSpaceIndexes.length > 0) return `space:${choice.eligibleSpaceIndexes[0]}`;
  if (choice.eligiblePlayerIds.length > 0) return `player:${choice.eligiblePlayerIds[0]}`;
  if (choice.eligibleDistricts.length > 0) return `district:${choice.eligibleDistricts[0]}`;
  throw new Error(`No selectable option for ${choice.cardTitle}.`);
}

function resolveOpenHostChoices(source: ReturnType<typeof startGame>) {
  let state = source;
  let safety = 0;
  while (state.cardChoice?.playerId === "host" && safety < 10) {
    state = applyRoomAction(state, "host", { type: "resolve-card-choice", selection: firstCardChoiceSelection(state) });
    safety += 1;
  }
  if (state.landmarkStealChoice?.playerId === "host") {
    state = applyRoomAction(state, "host", { type: "steal-landmark", spaceIndex: state.landmarkStealChoice.eligibleSpaceIndexes[0] });
  }
  return state;
}

function drawSpecificCard(source: ReturnType<typeof startGame>, deck: "lucky-break" | "plot-twist", title: string) {
  const cards = deck === "lucky-break" ? LUCKY_CARDS : PLOT_CARDS;
  const index = cards.findIndex((card) => card.title === title);
  assert.notEqual(index, -1, `${title} should exist`);
  const probe = applyRoomAction(source, "host", { type: "roll" });
  const total = (probe.dice?.[0] ?? 0) + (probe.dice?.[1] ?? 0);
  const cardSpace = deck === "lucky-break" ? 3 : 9;
  source.players[0].position = ((cardSpace - total) % SPACES.length + SPACES.length) % SPACES.length;
  if (deck === "lucky-break") {
    source.luckyDeck = [index];
    source.luckyCursor = 0;
  } else {
    source.plotDeck = [index];
    source.plotCursor = 0;
  }
  return applyRoomAction(source, "host", { type: "roll" });
}

function choiceReadyState() {
  const withFriend = addHumanPlayer(lobby(0), "friend", "Friend", "fortune-key");
  const state = startGame(withFriend);
  for (const spaceIndex of [1, 2, 4, 5]) {
    state.properties[String(spaceIndex)] = {
      spaceIndex,
      ownerId: "host",
      purchasePrice: SPACE_BY_INDEX.get(spaceIndex)?.price ?? 100,
      upgrades: 0,
      closedUntilTurn: 0,
      rentMultiplierUntilTurn: 0,
      nextVisitorFree: false,
    };
  }
  state.properties["7"] = {
    spaceIndex: 7,
    ownerId: "friend",
    purchasePrice: SPACE_BY_INDEX.get(7)?.price ?? 140,
    upgrades: 0,
    closedUntilTurn: 0,
    rentMultiplierUntilTurn: 0,
    nextVisitorFree: false,
  };
  return state;
}

test("uses the complete approved game collection", () => {
  assert.equal(SPACES.length, 40);
  assert.equal(new Set(SPACES.map((space) => space.index)).size, 40);
  assert.equal(SPACES.filter((space) => space.kind === "landmark").length, 24);
  assert.equal(LUCKY_CARDS.length, 24);
  assert.equal(PLOT_CARDS.length, 24);
  assert.equal(PLOT_CARDS[18].title, "Steal a Landmark");
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
    state = resolveOpenHostChoices(state);
    if (currentPlayer(state)?.id !== "host") {
      state = runBotsAndFoldHostAuctions(state);
      continue;
    }
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

test("lets a player skip an auction and continue the turn", () => {
  let state = startGame(lobby(1));
  state.rolled = true;
  state.pendingPurchase = 1;

  state = applyRoomAction(state, "host", { type: "skip-purchase" });

  assert.equal(state.pendingPurchase, null);
  assert.equal(state.auction, null);
  assert.equal(state.lastEvent?.title, "Deed passed");
  state = applyRoomAction(state, "host", { type: "end-turn" });
  assert.equal(currentPlayer(state)?.isBot, true);
});

test("paces bot auction decisions one visible bid or fold at a time", () => {
  let state = startGame(lobby(3));
  state.rolled = true;
  state.pendingPurchase = 1;
  state = applyRoomAction(state, "host", { type: "start-auction" });
  const firstBidder = state.auction?.currentBidderId;
  const auctionEvents = state.log.filter((event) => event.type === "auction").length;

  state = runBotTurns(state, { singleAuctionStep: true });

  assert.ok(state.auction);
  assert.notEqual(state.auction?.currentBidderId, firstBidder);
  assert.equal(state.log.filter((event) => event.type === "auction").length, auctionEvents + 1);
});

test("trades landmarks and cash only after the receiving player approves", () => {
  const withFriend = addHumanPlayer(lobby(0), "friend", "Friend", "fortune-key");
  let state = startGame(withFriend);
  state.properties["1"] = { spaceIndex: 1, ownerId: "host", upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  state.properties["2"] = { spaceIndex: 2, ownerId: "friend", upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };

  state = applyRoomAction(state, "host", {
    type: "propose-trade",
    toPlayerId: "friend",
    offeredSpaceIndexes: [1],
    requestedSpaceIndexes: [2],
    offeredCash: 200,
    requestedCash: 0,
  });
  assert.equal(state.tradeOffer?.toPlayerId, "friend");
  assert.equal(state.properties["1"].ownerId, "host");
  assert.equal(state.players[0].cash, 1400);

  state = applyRoomAction(state, "friend", { type: "trade-accept" });
  assert.equal(state.tradeOffer, null);
  assert.equal(state.properties["1"].ownerId, "friend");
  assert.equal(state.properties["2"].ownerId, "host");
  assert.equal(state.players[0].cash, 1200);
  assert.equal(state.players[1].cash, 1600);
  assert.equal(state.lastEvent?.title, "Deal accepted");
});

test("leaves deeds and cash untouched when a trade is declined", () => {
  const withFriend = addHumanPlayer(lobby(0), "friend", "Friend", "fortune-key");
  let state = startGame(withFriend);
  state.properties["1"] = { spaceIndex: 1, ownerId: "host", upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  state.properties["2"] = { spaceIndex: 2, ownerId: "friend", upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  state = applyRoomAction(state, "host", { type: "propose-trade", toPlayerId: "friend", offeredSpaceIndexes: [1], requestedSpaceIndexes: [2], offeredCash: 50, requestedCash: 0 });
  state = applyRoomAction(state, "friend", { type: "trade-decline" });

  assert.equal(state.tradeOffer, null);
  assert.equal(state.properties["1"].ownerId, "host");
  assert.equal(state.properties["2"].ownerId, "friend");
  assert.equal(state.players[0].cash, 1400);
  assert.equal(state.players[1].cash, 1400);
  assert.equal(state.lastEvent?.title, "Trade declined");
});

test("bots approve strong offers and decline bad ones", () => {
  let generous = startGame(lobby(1));
  const botId = generous.players[1].id;
  generous.properties["1"] = { spaceIndex: 1, ownerId: "host", upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  generous.properties["2"] = { spaceIndex: 2, ownerId: botId, upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  generous = applyRoomAction(generous, "host", { type: "propose-trade", toPlayerId: botId, offeredSpaceIndexes: [1], requestedSpaceIndexes: [2], offeredCash: 800, requestedCash: 0 });
  generous = runBotTurns(generous);
  assert.equal(generous.properties["1"].ownerId, botId);
  assert.equal(generous.properties["2"].ownerId, "host");
  assert.equal(generous.lastEvent?.title, "Deal accepted");

  let stingy = startGame(lobby(1));
  const stingyBotId = stingy.players[1].id;
  stingy.properties["2"] = { spaceIndex: 2, ownerId: stingyBotId, upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  stingy = applyRoomAction(stingy, "host", { type: "propose-trade", toPlayerId: stingyBotId, offeredSpaceIndexes: [], requestedSpaceIndexes: [2], offeredCash: 10, requestedCash: 0 });
  stingy = runBotTurns(stingy);
  assert.equal(stingy.properties["2"].ownerId, stingyBotId);
  assert.equal(stingy.tradeOffer, null);
  assert.equal(stingy.lastEvent?.title, "Trade declined");
});

test("protects crowned districts from being broken by a trade", () => {
  const withFriend = addHumanPlayer(lobby(0), "friend", "Friend", "fortune-key");
  const state = startGame(withFriend);
  state.properties["1"] = { spaceIndex: 1, ownerId: "host", upgrades: 1, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  state.properties["2"] = { spaceIndex: 2, ownerId: "friend", upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  assert.throws(
    () => applyRoomAction(state, "host", { type: "propose-trade", toPlayerId: "friend", offeredSpaceIndexes: [1], requestedSpaceIndexes: [2], offeredCash: 0, requestedCash: 0 }),
    /crowns or a castle/,
  );
});

test("Steal a Landmark lets the drawer select an exact rival deed and pays its recorded price", () => {
  const withFriend = addHumanPlayer(lobby(0), "friend", "Friend", "fortune-key");
  const initial = startGame(withFriend);
  const probe = applyRoomAction(initial, "host", { type: "roll" });
  const total = (probe.dice?.[0] ?? 0) + (probe.dice?.[1] ?? 0);
  initial.players[0].position = ((9 - total) % SPACES.length + SPACES.length) % SPACES.length;
  initial.plotDeck = [18];
  initial.plotCursor = 0;
  initial.properties["1"] = { spaceIndex: 1, ownerId: "host", purchasePrice: 90, upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  initial.properties["2"] = { spaceIndex: 2, ownerId: "host", purchasePrice: 110, upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  initial.properties["4"] = { spaceIndex: 4, ownerId: "friend", purchasePrice: 73, upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };
  initial.properties["5"] = { spaceIndex: 5, ownerId: "friend", purchasePrice: 150, upgrades: 0, closedUntilTurn: 0, rentMultiplierUntilTurn: 0, nextVisitorFree: false };

  let state = applyRoomAction(initial, "host", { type: "roll" });
  assert.equal(state.log.find((event) => event.card)?.card?.title, "Steal a Landmark");
  assert.deepEqual(state.landmarkStealChoice?.eligibleSpaceIndexes.sort((a, b) => a - b), [4, 5]);
  assert.throws(() => applyRoomAction(state, "host", { type: "end-turn" }), /Choose the landmark/);

  state = applyRoomAction(state, "host", { type: "steal-landmark", spaceIndex: 4 });
  assert.equal(state.landmarkStealChoice, null);
  assert.equal(state.properties["4"].ownerId, "host");
  assert.equal(state.players[0].cash, 1327);
  assert.equal(state.players[1].cash, 1473);
  assert.equal(state.lastEvent?.title, "Landmark taken!");
  assert.equal(state.lastEvent?.moneyTransfer?.amount, 73);
});

test("every card that promises a player decision opens real selectable options", () => {
  const decisionCards = [
    ["lucky-break", "Scenic Shortcut"],
    ["lucky-break", "Grand Reopening"],
    ["lucky-break", "Friendly Inspector"],
    ["lucky-break", "Free Upgrade"],
    ["lucky-break", "Influencer Visit"],
    ["lucky-break", "Midnight Pass"],
    ["lucky-break", "Position Upgrade"],
    ["lucky-break", "Big Break"],
    ["plot-twist", "Surprise Inspection"],
    ["plot-twist", "Review Bomb"],
    ["plot-twist", "Neighborhood Blackout"],
    ["plot-twist", "Celebrity Entourage"],
    ["plot-twist", "Lost Luggage"],
    ["plot-twist", "Sudden Rebrand"],
  ] as const;

  for (const [deck, title] of decisionCards) {
    const initial = choiceReadyState();
    if (title === "Friendly Inspector") initial.properties["1"].closedUntilTurn = 99;
    const state = drawSpecificCard(initial, deck, title);
    assert.equal(state.cardChoice?.cardTitle, title, `${title} should wait for the drawer's choice`);
    assert.equal(state.cardChoice?.playerId, "host");
    assert.ok(
      (state.cardChoice?.eligibleSpaceIndexes.length ?? 0) > 0
        || (state.cardChoice?.eligiblePlayerIds.length ?? 0) > 0
        || (state.cardChoice?.eligibleDistricts.length ?? 0) > 0
        || (state.cardChoice?.options.length ?? 0) > 0,
      `${title} should expose at least one selectable option`,
    );
  }
});

test("Neighborhood Blackout waits for the exact district selected by the drawer", () => {
  let state = drawSpecificCard(choiceReadyState(), "plot-twist", "Neighborhood Blackout");
  assert.equal(state.modifiers.districtBlackout, null);
  assert.deepEqual(state.cardChoice?.eligibleDistricts, [0, 1, 2, 3, 4, 5]);
  assert.throws(() => applyRoomAction(state, "host", { type: "end-turn" }), /Neighborhood Blackout choice/);

  state = applyRoomAction(state, "host", { type: "resolve-card-choice", selection: "district:4" });
  assert.equal(state.cardChoice, null);
  assert.equal(state.modifiers.districtBlackout?.district, 4);
  assert.match(state.lastEvent?.message ?? "", /Midnight Commerce/);
});

test("landmark card choices apply only to the deed the player taps", () => {
  let reopening = drawSpecificCard(choiceReadyState(), "lucky-break", "Grand Reopening");
  reopening = applyRoomAction(reopening, "host", { type: "resolve-card-choice", selection: "space:4" });
  assert.equal(reopening.properties["1"].rentMultiplierUntilTurn, 0);
  assert.ok(reopening.properties["4"].rentMultiplierUntilTurn >= reopening.turnNumber);

  let review = drawSpecificCard(choiceReadyState(), "plot-twist", "Review Bomb");
  const fullFee = propertyRent(review, review.properties["2"], 7);
  review = applyRoomAction(review, "host", { type: "resolve-card-choice", selection: "space:2" });
  assert.equal(propertyRent(review, review.properties["2"], 7), Math.round(fullFee / 2));
  assert.equal(review.properties["1"].rentDiscountUntilTurn ?? 0, 0);

  let rebrand = drawSpecificCard(choiceReadyState(), "plot-twist", "Sudden Rebrand");
  rebrand = applyRoomAction(rebrand, "host", { type: "resolve-card-choice", selection: "space:5" });
  assert.equal(rebrand.properties["5"].closedUntilOwnerVisit, true);
  assert.equal(propertyRent(rebrand, rebrand.properties["5"], 7), 0);
});

test("Big Break honors the six-space option and resolves its destination", () => {
  let state = drawSpecificCard(choiceReadyState(), "lucky-break", "Big Break");
  assert.equal(state.players[0].position, 3);
  const cashBefore = state.players[0].cash;
  state.plotDeck = [PLOT_CARDS.findIndex((card) => card.title === "GPS Glitch")];
  state.plotCursor = 0;
  state = applyRoomAction(state, "host", { type: "resolve-card-choice", selection: "move-six" });
  assert.equal(state.players[0].position, 9);
  assert.equal(state.players[0].cash, cashBefore);
  assert.ok(state.log.some((event) => event.title === "Six-space break" && event.movement?.steps === 6));
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
