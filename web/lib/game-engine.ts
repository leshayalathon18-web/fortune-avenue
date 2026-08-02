import {
  BOT_NAMES,
  DISTRICTS,
  LUCKY_CARDS,
  PAWNS,
  PLAYER_COLORS,
  PLOT_CARDS,
  SPACE_BY_INDEX,
  SPACES,
} from "./game-data";
import type {
  BoardTheme,
  CardDefinition,
  CardDeck,
  FortuneGameState,
  GameEvent,
  GameEventType,
  PlayerState,
  PropertyState,
  RoomAction,
  RoomKind,
  SpaceDefinition,
} from "./game-types";

const BOARD_SIZE = 40;
const MAX_UPGRADES = 3;

export const DEFAULT_SETTINGS = {
  startCash: 1400,
  passBonus: 200,
  targetNetWorth: 5000,
  requiredProperties: 8,
  maxTurns: 180,
} as const;

export interface LobbyOptions {
  code: string;
  kind: RoomKind;
  theme: BoardTheme;
  maxPlayers: number;
  hostPlayerId: string;
  hostName: string;
  pawnSlug: string;
  botCount: number;
  seed: number;
}

function cloneState(state: FortuneGameState): FortuneGameState {
  const cloned = JSON.parse(JSON.stringify(state)) as FortuneGameState;
  cloned.auction ??= null;
  if (cloned.auction) cloned.auction.participantIds ??= activePlayers(cloned).map((player) => player.id);
  cloned.tradeOffer ??= null;
  cloned.landmarkStealChoice ??= null;
  cloned.cardChoice ??= null;
  for (const property of Object.values(cloned.properties)) {
    property.rentDiscountUntilTurn ??= 0;
    property.closedUntilOwnerVisit ??= false;
  }
  cloned.eventSequence ??= cloned.log.length;
  return cloned;
}

function now() {
  return new Date().toISOString();
}

function nextRandom(state: FortuneGameState) {
  state.rngSeed = (Math.imul(state.rngSeed, 1664525) + 1013904223) >>> 0;
  return state.rngSeed / 4294967296;
}

function randomInt(state: FortuneGameState, max: number) {
  return Math.floor(nextRandom(state) * max);
}

function shuffledIndices(state: FortuneGameState, length: number) {
  const values = Array.from({ length }, (_, index) => index);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = randomInt(state, index + 1);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

function eventId(state: FortuneGameState) {
  state.eventSequence = (state.eventSequence ?? 0) + 1;
  return `${state.turnNumber}-${state.eventSequence}-${state.rngSeed.toString(36)}`;
}

function addEvent(
  state: FortuneGameState,
  type: GameEventType,
  title: string,
  message: string,
  extra: Partial<GameEvent> = {},
) {
  const event: GameEvent = {
    id: eventId(state),
    type,
    title,
    message,
    createdAt: now(),
    ...extra,
  };
  state.lastEvent = event;
  state.log = [event, ...state.log].slice(0, 60);
}

export function createPlayer(
  id: string,
  name: string,
  pawnSlug: string,
  index: number,
  isBot = false,
): PlayerState {
  return {
    id,
    name: name.trim().slice(0, 24) || (isBot ? "Avenue Bot" : "Player"),
    pawnSlug: PAWNS.some((pawn) => pawn.slug === pawnSlug) ? pawnSlug : PAWNS[index % PAWNS.length].slug,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    isBot,
    cash: DEFAULT_SETTINGS.startCash,
    position: 0,
    bankrupt: false,
    skipTurns: 0,
    heldCards: [],
    purchaseDiscount: 0,
    upgradeDiscount: 0,
    reverseNext: false,
    luckyRoll: false,
    extraTurns: 0,
    rentBoostUntilTurn: 0,
  };
}

export function createLobbyState(options: LobbyOptions): FortuneGameState {
  const createdAt = now();
  const host = createPlayer(options.hostPlayerId, options.hostName, options.pawnSlug, 0, false);
  const state: FortuneGameState = {
    code: options.code,
    revision: 0,
    kind: options.kind,
    phase: "lobby",
    theme: options.theme,
    maxPlayers: Math.min(6, Math.max(2, options.maxPlayers)),
    hostPlayerId: options.hostPlayerId,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    players: [host],
    properties: {},
    currentPlayerIndex: 0,
    turnNumber: 0,
    roundNumber: 1,
    dice: null,
    rolled: false,
    pendingPurchase: null,
    auction: null,
    tradeOffer: null,
    landmarkStealChoice: null,
    cardChoice: null,
    luckyDeck: [],
    plotDeck: [],
    luckyCursor: 0,
    plotCursor: 0,
    modifiers: {
      freeAdmissionUntilTurn: 0,
      marketDipUntilTurn: 0,
      districtBlackout: null,
    },
    lastEvent: null,
    log: [],
    eventSequence: 0,
    winnerId: null,
    rngSeed: options.seed || 8675309,
    settings: { ...DEFAULT_SETTINGS },
  };

  const usedPawns = new Set([host.pawnSlug]);
  for (let index = 0; index < Math.min(options.botCount, state.maxPlayers - 1); index += 1) {
    const pawn = PAWNS.find((candidate) => !usedPawns.has(candidate.slug)) ?? PAWNS[(index + 1) % PAWNS.length];
    usedPawns.add(pawn.slug);
    state.players.push(
      createPlayer(`bot-${options.code}-${index + 1}`, BOT_NAMES[index % BOT_NAMES.length], pawn.slug, index + 1, true),
    );
  }

  addEvent(state, "room", "Room ready", `${host.name} opened Fortune Avenue room ${options.code}.`, {
    playerId: host.id,
  });
  return state;
}

export function addHumanPlayer(
  source: FortuneGameState,
  playerId: string,
  name: string,
  requestedPawn: string,
) {
  const state = cloneState(source);
  if (state.phase !== "lobby") throw new Error("This game has already started.");
  if (state.players.length >= state.maxPlayers) throw new Error("That room is full.");
  const usedPawns = new Set(state.players.map((player) => player.pawnSlug));
  const pawn = PAWNS.find((candidate) => candidate.slug === requestedPawn && !usedPawns.has(candidate.slug))
    ?? PAWNS.find((candidate) => !usedPawns.has(candidate.slug))
    ?? PAWNS[0];
  const player = createPlayer(playerId, name, pawn.slug, state.players.length, false);
  state.players.push(player);
  state.updatedAt = now();
  addEvent(state, "room", "New arrival", `${player.name} joined with the ${pawn.name}.`, {
    playerId,
  });
  return state;
}

export function startGame(source: FortuneGameState) {
  const state = cloneState(source);
  if (state.phase !== "lobby") throw new Error("The game is already underway.");
  if (state.players.length < 2) throw new Error("Fortune Avenue needs at least two players.");
  state.phase = "playing";
  state.startedAt = now();
  state.currentPlayerIndex = 0;
  state.turnNumber = 1;
  state.roundNumber = 1;
  state.luckyDeck = shuffledIndices(state, LUCKY_CARDS.length);
  state.plotDeck = shuffledIndices(state, PLOT_CARDS.length);
  state.luckyCursor = 0;
  state.plotCursor = 0;
  state.dice = null;
  state.rolled = false;
  state.pendingPurchase = null;
  state.auction = null;
  state.tradeOffer = null;
  state.landmarkStealChoice = null;
  state.cardChoice = null;
  state.updatedAt = now();
  addEvent(
    state,
    "turn",
    "The avenue is open",
    `${state.players[0].name} takes the first turn. Roll in, buy big, cause chaos.`,
    { playerId: state.players[0].id },
  );
  return state;
}

export function currentPlayer(state: FortuneGameState) {
  return state.players[state.currentPlayerIndex] ?? null;
}

export function ownedProperties(state: FortuneGameState, playerId: string) {
  return Object.values(state.properties).filter((property) => property.ownerId === playerId);
}

export function netWorth(state: FortuneGameState, playerId: string) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;
  const propertyValue = ownedProperties(state, playerId).reduce((total, property) => {
    const space = SPACE_BY_INDEX.get(property.spaceIndex);
    if (!space) return total;
    return total + space.price + Math.round(space.upgradeCost * property.upgrades * 0.8);
  }, 0);
  return player.cash + propertyValue;
}

function fullDistrictOwned(state: FortuneGameState, ownerId: string, district: number) {
  const districtSpaces = SPACES.filter((space) => space.district === district);
  return districtSpaces.length > 0
    && districtSpaces.every((space) => state.properties[String(space.index)]?.ownerId === ownerId);
}

export function propertyPostedRent(
  state: FortuneGameState,
  property: PropertyState,
  diceTotal: number,
) {
  const space = SPACE_BY_INDEX.get(property.spaceIndex);
  if (!space) return 0;
  const owner = state.players.find((player) => player.id === property.ownerId);
  if (!owner) return 0;

  let rent = space.baseRent;
  if (space.kind === "landmark") {
    const crownMultipliers = [1, 2.5, 4.5, 8] as const;
    rent = Math.round(rent * crownMultipliers[Math.min(MAX_UPGRADES, property.upgrades)]);
    if (
      property.upgrades === 0
      && space.district !== null
      && fullDistrictOwned(state, property.ownerId, space.district)
    ) rent *= 2;
  } else if (space.kind === "transport") {
    const count = ownedProperties(state, property.ownerId)
      .filter((owned) => SPACE_BY_INDEX.get(owned.spaceIndex)?.kind === "transport").length;
    rent = 45 * 2 ** Math.max(0, count - 1);
  } else if (space.kind === "service") {
    const count = ownedProperties(state, property.ownerId)
      .filter((owned) => SPACE_BY_INDEX.get(owned.spaceIndex)?.kind === "service").length;
    rent = diceTotal * (count >= 2 ? 10 : 4);
  }

  return Math.round(rent);
}

export function propertyRentPauseReason(
  state: FortuneGameState,
  property: PropertyState,
) {
  const space = SPACE_BY_INDEX.get(property.spaceIndex);
  if (!space) return null;
  if (state.modifiers.freeAdmissionUntilTurn >= state.turnNumber) return "Free Admission Day";
  if (property.closedUntilTurn >= state.turnNumber) return "Inspection closure";
  if (property.closedUntilOwnerVisit) return "Sudden Rebrand";
  if (
    space.district !== null
    && state.modifiers.districtBlackout
    && state.modifiers.districtBlackout.untilTurn >= state.turnNumber
    && state.modifiers.districtBlackout.district === space.district
  ) return "Neighborhood Blackout";
  return null;
}

export function propertyRent(
  state: FortuneGameState,
  property: PropertyState,
  diceTotal: number,
) {
  const owner = state.players.find((player) => player.id === property.ownerId);
  if (!owner || propertyRentPauseReason(state, property)) return 0;

  let rent = propertyPostedRent(state, property, diceTotal);
  if (property.rentMultiplierUntilTurn >= state.turnNumber) rent *= 2;
  if (owner.rentBoostUntilTurn >= state.turnNumber) rent *= 2;
  if ((property.rentDiscountUntilTurn ?? 0) >= state.turnNumber) rent *= 0.5;
  if (state.modifiers.marketDipUntilTurn >= state.turnNumber) rent = Math.max(0, rent - 10);
  return Math.round(rent);
}

function activePlayers(state: FortuneGameState) {
  return state.players.filter((player) => !player.bankrupt);
}

function releaseProperties(state: FortuneGameState, playerId: string) {
  for (const [key, property] of Object.entries(state.properties)) {
    if (property.ownerId === playerId) delete state.properties[key];
  }
}

function markBankrupt(state: FortuneGameState, player: PlayerState) {
  if (player.bankrupt) return;
  player.bankrupt = true;
  player.cash = 0;
  releaseProperties(state, player.id);
  addEvent(state, "warning", "Bankrupt!", `${player.name} is out; their deeds return to the Avenue.`, {
    playerId: player.id,
  });
}

function debit(state: FortuneGameState, player: PlayerState, amount: number) {
  const paid = Math.min(player.cash, Math.max(0, Math.round(amount)));
  player.cash -= paid;
  if (player.cash <= 0 && amount > paid - 1) markBankrupt(state, player);
  return paid;
}

function transfer(
  state: FortuneGameState,
  from: PlayerState,
  to: PlayerState,
  amount: number,
) {
  const paid = debit(state, from, amount);
  to.cash += paid;
  return paid;
}

function nearestSpace(position: number, predicate: (space: SpaceDefinition) => boolean) {
  for (let step = 1; step <= BOARD_SIZE; step += 1) {
    const candidate = SPACES[(position + step) % BOARD_SIZE];
    if (predicate(candidate)) return candidate;
  }
  return SPACES[0];
}

function moveBy(
  state: FortuneGameState,
  player: PlayerState,
  amount: number,
  collectPassBonus = true,
) {
  const oldPosition = player.position;
  const rawPosition = oldPosition + amount;
  if (collectPassBonus && amount > 0 && rawPosition >= BOARD_SIZE) {
    player.cash += state.settings.passBonus;
    addEvent(state, "fortune", "Grand Entrance bonus", `${player.name} collected F${state.settings.passBonus}.`, {
      playerId: player.id,
      spaceIndex: 0,
    });
  }
  player.position = ((rawPosition % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
}

function propertyFor(state: FortuneGameState, spaceIndex: number) {
  return state.properties[String(spaceIndex)] ?? null;
}

function consumeVipIfAvailable(player: PlayerState) {
  const index = player.heldCards.findIndex((card) => card.title === "VIP Wristband");
  if (index < 0) return false;
  player.heldCards.splice(index, 1);
  return true;
}

function resolveOwnable(
  state: FortuneGameState,
  visitor: PlayerState,
  space: SpaceDefinition,
  diceTotal: number,
) {
  const property = propertyFor(state, space.index);
  if (!property) {
    state.pendingPurchase = space.index;
    addEvent(
      state,
      "space",
      "Available deed",
      `${space.name} is unowned. ${visitor.name} may buy it for F${Math.max(0, space.price - visitor.purchaseDiscount)}.`,
      { playerId: visitor.id, spaceIndex: space.index },
    );
    return;
  }
  if (property.ownerId === visitor.id) {
    if (property.closedUntilOwnerVisit) {
      property.closedUntilOwnerVisit = false;
      addEvent(state, "fortune", "Rebrand complete", `${visitor.name} reopened ${space.name} by visiting it.`, {
        playerId: visitor.id,
        spaceIndex: space.index,
      });
      return;
    }
    addEvent(state, "space", "Back on your block", `${visitor.name} landed on their own ${space.name}.`, {
      playerId: visitor.id,
      spaceIndex: space.index,
    });
    return;
  }
  const owner = state.players.find((player) => player.id === property.ownerId);
  if (!owner || owner.bankrupt) return;
  if (property.nextVisitorFree) {
    property.nextVisitorFree = false;
    addEvent(state, "fortune", "Celebrity entourage", `${visitor.name} entered ${space.name} free.`, {
      playerId: visitor.id,
      spaceIndex: space.index,
    });
    return;
  }
  const rent = propertyRent(state, property, diceTotal);
  if (rent <= 0) {
    addEvent(state, "fortune", "Free admission", `${space.name} charged no entry fee this turn.`, {
      playerId: visitor.id,
      spaceIndex: space.index,
    });
    return;
  }
  if (consumeVipIfAvailable(visitor)) {
    addEvent(state, "fortune", "VIP Wristband", `${visitor.name} skipped an F${rent} entry fee at ${space.name}.`, {
      playerId: visitor.id,
      spaceIndex: space.index,
    });
    return;
  }
  const paid = transfer(state, visitor, owner, rent);
  addEvent(state, "rent", "Entry fee", `${visitor.name} paid ${owner.name} F${paid} at ${space.name}.`, {
    playerId: visitor.id,
    spaceIndex: space.index,
    moneyTransfer: {
      fromPlayerId: visitor.id,
      toPlayerId: owner.id,
      amount: paid,
    },
  });
}

function resolveCorner(state: FortuneGameState, player: PlayerState, space: SpaceDefinition) {
  if (space.index === 20) {
    const paid = debit(state, player, 60);
    addEvent(state, "warning", "City Hall fee", `${player.name} paid F${paid} in mysterious municipal fees.`, {
      playerId: player.id,
      spaceIndex: space.index,
    });
  } else if (space.index === 30) {
    player.cash += 90;
    addEvent(state, "fortune", "Street Festival", `${player.name} collected F90 from the festival crowd.`, {
      playerId: player.id,
      spaceIndex: space.index,
    });
  } else if (space.index === 10) {
    addEvent(state, "space", "Just visiting", `${player.name} found the Wrong Turn, but keeps moving next round.`, {
      playerId: player.id,
      spaceIndex: space.index,
    });
  } else {
    addEvent(state, "space", "Grand Entrance", `${player.name} landed beneath the gold marquee.`, {
      playerId: player.id,
      spaceIndex: space.index,
    });
  }
}

function highestOwnedProperty(state: FortuneGameState, playerId: string) {
  return ownedProperties(state, playerId)
    .map((property) => ({ property, space: SPACE_BY_INDEX.get(property.spaceIndex) }))
    .filter((entry): entry is { property: PropertyState; space: SpaceDefinition } => Boolean(entry.space))
    .sort((a, b) => b.space.price - a.space.price)[0] ?? null;
}

function lowestOwnedProperty(state: FortuneGameState, playerId: string) {
  return ownedProperties(state, playerId)
    .map((property) => ({ property, space: SPACE_BY_INDEX.get(property.spaceIndex) }))
    .filter((entry): entry is { property: PropertyState; space: SpaceDefinition } => Boolean(entry.space))
    .sort((a, b) => a.space.price - b.space.price)[0] ?? null;
}

function ownedLandmarkIndexes(state: FortuneGameState, playerId: string) {
  return ownedProperties(state, playerId)
    .filter((property) => SPACE_BY_INDEX.get(property.spaceIndex)?.kind === "landmark")
    .map((property) => property.spaceIndex);
}

function freeUpgradeIndexes(state: FortuneGameState, player: PlayerState) {
  return ownedProperties(state, player.id)
    .flatMap((property) => {
      const space = SPACE_BY_INDEX.get(property.spaceIndex);
      return space ? [{ property, space }] : [];
    })
    .filter(
      (entry) => entry.space.kind === "landmark"
        && entry.space.district !== null
        && fullDistrictOwned(state, player.id, entry.space.district)
        && entry.property.upgrades < MAX_UPGRADES,
    )
    .map((entry) => entry.space.index);
}

function districtAtPosition(position: number) {
  for (let offset = 0; offset < BOARD_SIZE; offset += 1) {
    const space = SPACE_BY_INDEX.get((position - offset + BOARD_SIZE) % BOARD_SIZE);
    if (space?.kind === "landmark" && space.district !== null) return space.district;
  }
  return 0;
}

function beginCardChoice(
  state: FortuneGameState,
  player: PlayerState,
  card: CardDefinition,
  choice: Partial<Omit<NonNullable<FortuneGameState["cardChoice"]>, "playerId" | "cardTitle" | "deck">>
    & Pick<NonNullable<FortuneGameState["cardChoice"]>, "kind">,
) {
  state.cardChoice = {
    playerId: player.id,
    cardTitle: card.title,
    deck: card.deck,
    kind: choice.kind,
    eligibleSpaceIndexes: choice.eligibleSpaceIndexes ?? [],
    eligiblePlayerIds: choice.eligiblePlayerIds ?? [],
    eligibleDistricts: choice.eligibleDistricts ?? [],
    options: choice.options ?? [],
  };
  return `${player.name} must make the choice on the table.`;
}

function stealableLandmarks(state: FortuneGameState, player: PlayerState) {
  return Object.values(state.properties)
    .flatMap((property) => {
      const space = SPACE_BY_INDEX.get(property.spaceIndex);
      const owner = state.players.find((candidate) => candidate.id === property.ownerId);
      return space && owner ? [{ property, space, owner }] : [];
    })
    .filter(({ property, space, owner }) => (
      space.kind === "landmark"
      && owner.id !== player.id
      && !owner.bankrupt
      && property.upgrades === 0
      && !districtHasImprovements(state, owner.id, space)
      && (property.purchasePrice ?? space.price) <= player.cash
    ));
}

function bestBotStealTarget(state: FortuneGameState, player: PlayerState) {
  return stealableLandmarks(state, player)
    .sort((a, b) => {
      const ownedA = ownedProperties(state, player.id).filter((property) => SPACE_BY_INDEX.get(property.spaceIndex)?.district === a.space.district).length;
      const ownedB = ownedProperties(state, player.id).filter((property) => SPACE_BY_INDEX.get(property.spaceIndex)?.district === b.space.district).length;
      return ownedB - ownedA || b.space.price - a.space.price;
    })[0] ?? null;
}

function chooseLandmarkSteal(state: FortuneGameState, playerId: string, spaceIndex: number) {
  const choice = state.landmarkStealChoice;
  if (!choice) throw new Error("There is no landmark waiting to be chosen.");
  if (choice.playerId !== playerId) throw new Error("Only the player who drew the card can choose the landmark.");
  if (!choice.eligibleSpaceIndexes.includes(spaceIndex)) throw new Error("That landmark is not eligible for this Plot Twist.");
  const player = state.players.find((candidate) => candidate.id === playerId);
  const property = propertyFor(state, spaceIndex);
  const space = SPACE_BY_INDEX.get(spaceIndex);
  const owner = property ? state.players.find((candidate) => candidate.id === property.ownerId) : null;
  if (!player || !property || !space || !owner || owner.id === player.id) throw new Error("That landmark is no longer available to take.");
  const eligibleNow = stealableLandmarks(state, player).some((entry) => entry.space.index === spaceIndex);
  if (!eligibleNow) throw new Error("That landmark is no longer eligible or affordable.");
  const price = property.purchasePrice ?? space.price;
  player.cash -= price;
  owner.cash += price;
  property.ownerId = player.id;
  property.purchasePrice = price;
  state.landmarkStealChoice = null;
  addEvent(state, "trade", "Landmark taken!", `${player.name} paid ${owner.name} F${price} and claimed ${space.name}.`, {
    playerId: player.id,
    spaceIndex,
    moneyTransfer: { fromPlayerId: player.id, toPlayerId: owner.id, amount: price },
  });
}

function chosenSpace(
  state: FortuneGameState,
  choice: NonNullable<FortuneGameState["cardChoice"]>,
  selection: string,
) {
  const match = /^space:(\d+)$/.exec(selection);
  const spaceIndex = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(spaceIndex) || !choice.eligibleSpaceIndexes.includes(spaceIndex)) {
    throw new Error("Choose one of the highlighted spaces for this card.");
  }
  const space = SPACE_BY_INDEX.get(spaceIndex);
  if (!space) throw new Error("That space is no longer available.");
  return space;
}

function addCardMovement(
  state: FortuneGameState,
  player: PlayerState,
  destination: number,
  title: string,
  message: string,
  resolveDestination: boolean,
) {
  const from = player.position;
  const steps = (destination - from + BOARD_SIZE) % BOARD_SIZE;
  moveBy(state, player, steps);
  addEvent(state, "card", title, message, {
    playerId: player.id,
    spaceIndex: destination,
    movement: { from, to: destination, steps, direction: 1 },
  });
  if (resolveDestination) resolveSpace(state, player, 7, 1);
}

function resolveCardChoice(state: FortuneGameState, playerId: string, selection: string) {
  const choice = state.cardChoice;
  if (!choice) throw new Error("There is no card choice waiting on the table.");
  if (choice.playerId !== playerId) throw new Error("Only the player who drew the card can make this choice.");
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.bankrupt) throw new Error("That player is no longer available.");
  const turnsToNext = Math.max(2, activePlayers(state).length);

  switch (choice.cardTitle) {
    case "Scenic Shortcut": {
      const space = chosenSpace(state, choice, selection);
      state.cardChoice = null;
      addCardMovement(state, player, space.index, "Shortcut chosen", `${player.name} picked ${space.name} and cruised there.`, true);
      return;
    }
    case "Grand Reopening": {
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id) throw new Error("You no longer own that landmark.");
      property.rentMultiplierUntilTurn = state.turnNumber + turnsToNext;
      state.cardChoice = null;
      addEvent(state, "card", "Grand reopening selected", `${space.name} is charging double until ${player.name}'s next turn.`, { playerId, spaceIndex: space.index });
      return;
    }
    case "Friendly Inspector": {
      if (selection === "skip-turn" && choice.options.includes(selection)) {
        player.skipTurns = 0;
        state.cardChoice = null;
        addEvent(state, "card", "Timeout cleared", `${player.name}'s missed-turn penalty was removed.`, { playerId });
        return;
      }
      if (selection === "reverse-next" && choice.options.includes(selection)) {
        player.reverseNext = false;
        state.cardChoice = null;
        addEvent(state, "card", "Route restored", `${player.name}'s counterclockwise penalty was removed.`, { playerId });
        return;
      }
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id) throw new Error("That penalty is no longer attached to your deed.");
      property.closedUntilTurn = 0;
      property.closedUntilOwnerVisit = false;
      property.rentDiscountUntilTurn = 0;
      state.cardChoice = null;
      addEvent(state, "card", "Inspection passed", `${space.name}'s closure and fee penalty were removed.`, { playerId, spaceIndex: space.index });
      return;
    }
    case "Free Upgrade": {
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id || !freeUpgradeIndexes(state, player).includes(space.index)) {
        throw new Error("That landmark is no longer eligible for a free crown.");
      }
      property.upgrades += 1;
      state.cardChoice = null;
      addEvent(state, "upgrade", property.upgrades === MAX_UPGRADES ? "Free castle!" : "Free crown!", `${player.name} upgraded ${space.name} at no cost.`, { playerId, spaceIndex: space.index });
      return;
    }
    case "Influencer Visit": {
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id) throw new Error("You no longer own that landmark.");
      let collected = 0;
      for (const other of activePlayers(state).filter((candidate) => candidate.id !== player.id)) {
        collected += transfer(state, other, player, 15);
      }
      state.cardChoice = null;
      addEvent(state, "card", "Influencer booked", `${player.name} sent the crowd to ${space.name} and collected F${collected}.`, { playerId, spaceIndex: space.index });
      return;
    }
    case "Midnight Pass": {
      const space = chosenSpace(state, choice, selection);
      if (space.kind !== "transport") throw new Error("Choose one of the two transport spaces.");
      state.cardChoice = null;
      addCardMovement(state, player, space.index, "Midnight ride", `${player.name} chose ${space.name} and rode there free.`, false);
      return;
    }
    case "Position Upgrade": {
      const match = /^player:(.+)$/.exec(selection);
      const targetId = match?.[1] ?? "";
      if (!choice.eligiblePlayerIds.includes(targetId)) throw new Error("Choose one of the available players.");
      const target = state.players.find((candidate) => candidate.id === targetId && !candidate.bankrupt);
      if (!target) throw new Error("That player is no longer available.");
      const playerFrom = player.position;
      const targetFrom = target.position;
      player.position = targetFrom;
      target.position = playerFrom;
      target.cash += 20;
      state.cardChoice = null;
      addEvent(state, "card", "Positions swapped", `${player.name} traded places with ${target.name}; ${target.name} collected F20.`, {
        playerId: player.id,
        spaceIndex: player.position,
        movement: { from: playerFrom, to: player.position, steps: (player.position - playerFrom + BOARD_SIZE) % BOARD_SIZE, direction: 1 },
      });
      addEvent(state, "card", "Swap complete", `${target.name} arrived at ${SPACE_BY_INDEX.get(target.position)?.name ?? "the Avenue"}.`, {
        playerId: target.id,
        spaceIndex: target.position,
        movement: { from: targetFrom, to: target.position, steps: (target.position - targetFrom + BOARD_SIZE) % BOARD_SIZE, direction: 1 },
      });
      return;
    }
    case "Big Break": {
      if (!choice.options.includes(selection)) throw new Error("Choose cash or the six-space move.");
      state.cardChoice = null;
      if (selection === "cash") {
        player.cash += 60;
        addEvent(state, "card", "Cash break", `${player.name} chose the guaranteed F60.`, { playerId });
      } else {
        const destination = (player.position + 6) % BOARD_SIZE;
        addCardMovement(state, player, destination, "Six-space break", `${player.name} chose to move exactly six spaces.`, true);
      }
      return;
    }
    case "Surprise Inspection": {
      if (selection === "pay-20" && choice.options.includes(selection)) {
        const paid = debit(state, player, 20);
        state.cardChoice = null;
        addEvent(state, "card", "Inspection paid", `${player.name} paid F${paid} and kept every landmark open.`, { playerId });
        return;
      }
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id) throw new Error("You no longer own that landmark.");
      property.closedUntilTurn = state.turnNumber + turnsToNext;
      state.cardChoice = null;
      addEvent(state, "card", "Inspection closure", `${player.name} closed ${space.name} instead of paying F20.`, { playerId, spaceIndex: space.index });
      return;
    }
    case "Review Bomb": {
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id) throw new Error("You no longer own that landmark.");
      property.rentDiscountUntilTurn = state.turnNumber + turnsToNext;
      state.cardChoice = null;
      addEvent(state, "card", "Review target selected", `${space.name}'s entry fee is halved until ${player.name}'s next turn.`, { playerId, spaceIndex: space.index });
      return;
    }
    case "Neighborhood Blackout": {
      const match = /^district:(\d+)$/.exec(selection);
      const district = match ? Number(match[1]) : Number.NaN;
      if (!Number.isInteger(district) || !choice.eligibleDistricts.includes(district)) {
        throw new Error("Choose one of the six districts.");
      }
      state.modifiers.districtBlackout = { district, untilTurn: state.turnNumber + turnsToNext };
      state.cardChoice = null;
      addEvent(state, "card", "District blacked out", `${DISTRICTS[district]} collects no entry fees until ${player.name}'s next turn.`, { playerId });
      return;
    }
    case "Celebrity Entourage": {
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id) throw new Error("You no longer own that landmark.");
      property.nextVisitorFree = true;
      player.cash += 50;
      state.cardChoice = null;
      addEvent(state, "card", "Guest list chosen", `${space.name}'s next visitor enters free; ${player.name} collected F50.`, { playerId, spaceIndex: space.index });
      return;
    }
    case "Lost Luggage": {
      if (!choice.options.includes(selection)) throw new Error("Choose the F40 fee or the Midnight Express move.");
      state.cardChoice = null;
      if (selection === "pay-40") {
        const paid = debit(state, player, 40);
        addEvent(state, "card", "Luggage fee paid", `${player.name} paid F${paid} and stayed put.`, { playerId });
        return;
      }
      const destination = SPACES.find((space) => space.kind === "transport")?.index ?? 6;
      addCardMovement(state, player, destination, "Luggage recovered", `${player.name} moved to The Midnight Express and ended the turn.`, false);
      endTurn(state, player);
      return;
    }
    case "Sudden Rebrand": {
      const space = chosenSpace(state, choice, selection);
      const property = propertyFor(state, space.index);
      if (!property || property.ownerId !== player.id) throw new Error("You no longer own that landmark.");
      property.closedUntilOwnerVisit = true;
      state.cardChoice = null;
      addEvent(state, "card", "Rebrand selected", `${space.name} collects no fee until ${player.name} visits it.`, { playerId, spaceIndex: space.index });
      return;
    }
    default:
      throw new Error("That card choice is not supported.");
  }
}

function drawCard(state: FortuneGameState, player: PlayerState, deck: CardDeck, depth: number) {
  const cards = deck === "lucky-break" ? LUCKY_CARDS : PLOT_CARDS;
  const order = deck === "lucky-break" ? state.luckyDeck : state.plotDeck;
  let cursor = deck === "lucky-break" ? state.luckyCursor : state.plotCursor;
  if (cursor >= order.length) {
    const reshuffled = shuffledIndices(state, cards.length);
    if (deck === "lucky-break") state.luckyDeck = reshuffled;
    else state.plotDeck = reshuffled;
    cursor = 0;
  }
  const cardIndex = order[cursor] ?? 0;
  if (deck === "lucky-break") state.luckyCursor = cursor + 1;
  else state.plotCursor = cursor + 1;
  const card = cards[cardIndex];
  const result = applyCardEffect(state, player, card, depth);
  addEvent(state, "card", card.title, `${card.effect}${result ? ` ${result}` : ""}`, {
    playerId: player.id,
    card: {
      deck,
      index: card.index,
      title: card.title,
      effect: card.effect,
      image: card.image,
    },
  });
}

function applyCardEffect(
  state: FortuneGameState,
  player: PlayerState,
  card: CardDefinition,
  depth: number,
) {
  const others = activePlayers(state).filter((candidate) => candidate.id !== player.id);
  const owned = ownedProperties(state, player.id);
  const turnsToNext = Math.max(2, activePlayers(state).length);
  const moveAndResolve = (position: number, resolve = true) => {
    player.position = position;
    if (resolve) resolveSpace(state, player, 7, depth + 1);
  };

  switch (card.title) {
    case "Viral Overnight":
      player.cash += 80;
      return `${player.name} collected F80.`;
    case "Scenic Shortcut": {
      const currentDistrict = districtAtPosition(player.position);
      const eligibleSpaceIndexes = SPACES
        .filter((space) => space.kind === "landmark" && space.district === currentDistrict)
        .map((space) => space.index);
      return beginCardChoice(state, player, card, { kind: "space", eligibleSpaceIndexes });
    }
    case "Tip Jar Overflow": {
      let collected = 0;
      for (const other of others) collected += transfer(state, other, player, 20);
      return `${player.name} collected F${collected}.`;
    }
    case "Tax Refund Confetti":
      player.cash += 100;
      moveBy(state, player, 1);
      resolveSpace(state, player, 7, depth + 1);
      return `${player.name} pocketed F100 and moved ahead.`;
    case "Grand Reopening": {
      const eligibleSpaceIndexes = ownedLandmarkIndexes(state, player.id);
      return eligibleSpaceIndexes.length > 0
        ? beginCardChoice(state, player, card, { kind: "space", eligibleSpaceIndexes })
        : "No owned landmark was available to boost.";
    }
    case "Friendly Inspector": {
      const eligibleSpaceIndexes = owned
        .filter((property) => (
          property.closedUntilTurn >= state.turnNumber
          || property.closedUntilOwnerVisit
          || (property.rentDiscountUntilTurn ?? 0) >= state.turnNumber
        ))
        .map((property) => property.spaceIndex);
      const options = [
        ...(player.skipTurns > 0 ? ["skip-turn"] : []),
        ...(player.reverseNext ? ["reverse-next"] : []),
      ];
      return eligibleSpaceIndexes.length > 0 || options.length > 0
        ? beginCardChoice(state, player, card, { kind: "penalty", eligibleSpaceIndexes, options })
        : `${player.name} had no closure or penalty to remove.`;
    }
    case "Free Upgrade": {
      const eligibleSpaceIndexes = freeUpgradeIndexes(state, player);
      return eligibleSpaceIndexes.length > 0
        ? beginCardChoice(state, player, card, { kind: "space", eligibleSpaceIndexes })
        : "Complete a matching-color district before placing a crown.";
    }
    case "VIP Wristband":
      player.heldCards.push({ id: `vip-${state.turnNumber}-${state.rngSeed}`, title: card.title, effect: card.effect });
      return "The wristband was saved for a future entry fee.";
    case "Perfect Timing":
      player.extraTurns += 1;
      return `${player.name} earned another turn.`;
    case "Neighborhood Grant": {
      const districts = new Set(
        owned.map((property) => SPACE_BY_INDEX.get(property.spaceIndex)?.district).filter((value) => value !== null),
      );
      const award = districts.size * 30;
      player.cash += award;
      return `${player.name} collected F${award}.`;
    }
    case "Flash Sale":
      player.purchaseDiscount += 25;
      return "The next available deed is F25 cheaper.";
    case "Found Wallet":
      player.cash += 50;
      return `${player.name} collected F50.`;
    case "Influencer Visit": {
      const eligibleSpaceIndexes = ownedLandmarkIndexes(state, player.id);
      return eligibleSpaceIndexes.length > 0
        ? beginCardChoice(state, player, card, { kind: "space", eligibleSpaceIndexes })
        : "No owned landmark was available for the visit.";
    }
    case "Festival Sponsor":
      moveAndResolve(30, false);
      player.cash += 70;
      return `${player.name} arrived at Street Festival with F70.`;
    case "Midnight Pass":
      return beginCardChoice(state, player, card, {
        kind: "space",
        eligibleSpaceIndexes: SPACES.filter((space) => space.kind === "transport").map((space) => space.index),
      });
    case "Position Upgrade": {
      const eligiblePlayerIds = others.map((candidate) => candidate.id);
      return eligiblePlayerIds.length > 0
        ? beginCardChoice(state, player, card, { kind: "player", eligiblePlayerIds })
        : "No player was available to swap.";
    }
    case "Lucky Coin":
      player.heldCards.push({ id: `coin-${state.turnNumber}-${state.rngSeed}`, title: card.title, effect: card.effect });
      return "The coin was saved for a future roll.";
    case "Golden Hour":
      player.rentBoostUntilTurn = state.turnNumber + turnsToNext;
      return `${player.name}'s entry fees are doubled until their next turn.`;
    case "Clean Inspection":
      player.upgradeDiscount += 20;
      return "The next upgrade is F20 cheaper.";
    case "Crowd Favorite": {
      const target = highestOwnedProperty(state, player.id);
      if (target) moveAndResolve(target.space.index, false);
      player.cash += 40;
      return target ? `${player.name} returned to ${target.space.name} and collected F40.` : `${player.name} collected F40.`;
    }
    case "Unexpected Inheritance": {
      const fee = owned.reduce((total, property) => total + property.upgrades * 20, 0);
      player.cash += 120;
      debit(state, player, fee);
      return `${player.name} netted F${120 - fee}.`;
    }
    case "Community Tip Jar": {
      let collected = 0;
      for (const other of others) collected += transfer(state, other, player, 10);
      player.cash += collected;
      return `The bank matched the crowd; ${player.name} gained F${collected * 2}.`;
    }
    case "Big Break":
      return beginCardChoice(state, player, card, { kind: "decision", options: ["cash", "move-six"] });
    case "Fortune Smiles":
      player.position = 0;
      player.cash += state.settings.passBonus;
      return `${player.name} returned to Grand Entrance and collected F${state.settings.passBonus}.`;
    case "Parade Blockade":
      for (const candidate of activePlayers(state)) moveBy(state, candidate, -3, false);
      return "Everybody shuffled backward three spaces.";
    case "Surprise Inspection":
      return beginCardChoice(state, player, card, {
        kind: "decision",
        eligibleSpaceIndexes: ownedLandmarkIndexes(state, player.id),
        options: ["pay-20"],
      });
    case "Free Admission Day":
      state.modifiers.freeAdmissionUntilTurn = state.turnNumber + turnsToNext;
      return "Entry fees are paused until this player returns.";
    case "Sudden Sinkhole":
      player.position = 10;
      player.skipTurns = Math.max(player.skipTurns, 1);
      return `${player.name} is stuck at Wrong Turn for one turn.`;
    case "Review Bomb": {
      const eligibleSpaceIndexes = ownedLandmarkIndexes(state, player.id);
      return eligibleSpaceIndexes.length > 0
        ? beginCardChoice(state, player, card, { kind: "space", eligibleSpaceIndexes })
        : "The review found no owned landmark.";
    }
    case "Parking Disaster": {
      const paid = debit(state, player, 30);
      return `${player.name} paid F${paid}.`;
    }
    case "Power Flicker":
      moveAndResolve(16);
      return `${player.name} moved to Fortune Power & Light.`;
    case "Water Main Burst":
      moveAndResolve(36);
      return `${player.name} moved to Avenue Waterworks.`;
    case "Wrong Address": {
      const playerIndex = state.players.findIndex((candidate) => candidate.id === player.id);
      const target = state.players[(playerIndex + 1) % state.players.length];
      if (target && target.id !== player.id) [player.position, target.position] = [target.position, player.position];
      return target ? `${player.name} swapped places with ${target.name}.` : "Nobody was next door.";
    }
    case "Double Detour":
      moveAndResolve(26, false);
      return `${player.name} ended up at The Scenic Detour.`;
    case "Missing Permit": {
      const fee = owned.reduce((total, property) => total + property.upgrades * 15, 0);
      const paid = debit(state, player, fee);
      return `${player.name} paid F${paid}.`;
    }
    case "Flash Flood": {
      const target = lowestOwnedProperty(state, player.id);
      if (target) target.property.closedUntilTurn = state.turnNumber + turnsToNext;
      return target ? `${target.space.name} is closed until ${player.name}'s next turn.` : "No landmark was flooded.";
    }
    case "Mystery Buyer": {
      const unowned = SPACES.filter((space) => space.kind === "landmark" && !propertyFor(state, space.index));
      const space = unowned[randomInt(state, Math.max(1, unowned.length))];
      if (!space) return "The mystery buyer found no unowned landmark to auction.";
      state.pendingPurchase = space.index;
      startAuction(state, player);
      return `${space.name} is now in a live deed auction.`;
    }
    case "Neighborhood Blackout": {
      return beginCardChoice(state, player, card, {
        kind: "district",
        eligibleDistricts: DISTRICTS.map((_, district) => district),
      });
    }
    case "Weather Nonsense":
      for (const candidate of activePlayers(state)) {
        const corner = nearestSpace(candidate.position, (space) => space.kind === "corner");
        candidate.position = corner.index;
        resolveCorner(state, candidate, corner);
      }
      return "Everybody blew to the next corner.";
    case "Celebrity Entourage": {
      const eligibleSpaceIndexes = ownedLandmarkIndexes(state, player.id);
      if (eligibleSpaceIndexes.length === 0) {
        player.cash += 50;
        return `${player.name} collected F50; no owned landmark needed a guest list.`;
      }
      return beginCardChoice(state, player, card, { kind: "space", eligibleSpaceIndexes });
    }
    case "GPS Glitch":
      player.reverseNext = true;
      return `${player.name}'s next roll runs counterclockwise.`;
    case "Construction Season":
      moveBy(state, player, 2);
      return `${player.name} moved two spaces without resolving the stop.`;
    case "Steal a Landmark": {
      const eligible = stealableLandmarks(state, player);
      if (eligible.length === 0) return "No affordable rival landmark was eligible, so the twist fizzled.";
      state.landmarkStealChoice = { playerId: player.id, eligibleSpaceIndexes: eligible.map((entry) => entry.space.index) };
      return `${player.name} may choose the exact rival landmark to buy and take.`;
    }
    case "Lost Luggage":
      return beginCardChoice(state, player, card, { kind: "decision", options: ["pay-40", "midnight-express"] });
    case "Festival Cleanup": {
      const paid = debit(state, player, owned.length * 10);
      return `${player.name} paid F${paid}.`;
    }
    case "Market Dip":
      state.modifiers.marketDipUntilTurn = state.turnNumber + turnsToNext;
      return "Every entry fee drops by F10 for one circuit.";
    case "Sudden Rebrand": {
      const eligibleSpaceIndexes = ownedLandmarkIndexes(state, player.id);
      return eligibleSpaceIndexes.length > 0
        ? beginCardChoice(state, player, card, { kind: "space", eligibleSpaceIndexes })
        : "No owned landmark needed a rebrand.";
    }
    case "Final Twist": {
      const roll = randomInt(state, 6) + 1;
      if (roll <= 3) debit(state, player, 60);
      else player.cash += 60;
      return `${player.name} rolled ${roll} and ${roll <= 3 ? "paid" : "collected"} F60.`;
    }
    default:
      return "The Avenue handled the twist automatically.";
  }
}

function resolveSpace(
  state: FortuneGameState,
  player: PlayerState,
  diceTotal: number,
  depth = 0,
) {
  if (depth > 4 || player.bankrupt) return;
  const space = SPACE_BY_INDEX.get(player.position);
  if (!space) return;
  state.pendingPurchase = null;
  if (space.kind === "landmark" || space.kind === "transport" || space.kind === "service") {
    resolveOwnable(state, player, space, diceTotal);
  } else if (space.kind === "lucky") {
    drawCard(state, player, "lucky-break", depth);
  } else if (space.kind === "plot") {
    drawCard(state, player, "plot-twist", depth);
  } else {
    resolveCorner(state, player, space);
  }
}

function rollDice(state: FortuneGameState, player: PlayerState) {
  const rollPair = (): [number, number] => [randomInt(state, 6) + 1, randomInt(state, 6) + 1];
  let dice = rollPair();
  if (player.luckyRoll) {
    const second = rollPair();
    if (second[0] + second[1] > dice[0] + dice[1]) dice = second;
    player.luckyRoll = false;
  }
  state.dice = dice;
  state.rolled = true;
  state.pendingPurchase = null;
  if (player.skipTurns > 0) {
    player.skipTurns -= 1;
    addEvent(state, "warning", "Wrong Turn timeout", `${player.name} misses this movement roll.`, {
      playerId: player.id,
      spaceIndex: player.position,
    });
    return;
  }
  const total = dice[0] + dice[1];
  const direction = player.reverseNext ? -1 : 1;
  player.reverseNext = false;
  const from = player.position;
  moveBy(state, player, total * direction, direction > 0);
  const space = SPACE_BY_INDEX.get(player.position);
  addEvent(state, "roll", `${dice[0]} + ${dice[1]} = ${total}`, `${player.name} rolled to ${space?.name ?? "the avenue"}.`, {
    playerId: player.id,
    spaceIndex: player.position,
    movement: {
      from,
      to: player.position,
      steps: total,
      direction,
    },
  });
  resolveSpace(state, player, total);
}

function buyPending(state: FortuneGameState, player: PlayerState) {
  if (state.pendingPurchase === null) throw new Error("There is no deed waiting to be purchased.");
  const space = SPACE_BY_INDEX.get(state.pendingPurchase);
  if (!space || space.price <= 0) throw new Error("That space cannot be purchased.");
  if (propertyFor(state, space.index)) throw new Error("That deed is no longer available.");
  const price = Math.max(0, space.price - player.purchaseDiscount);
  if (player.cash < price) throw new Error(`You need F${price} to buy ${space.name}.`);
  player.cash -= price;
  player.purchaseDiscount = 0;
  state.properties[String(space.index)] = {
    spaceIndex: space.index,
    ownerId: player.id,
    purchasePrice: price,
    upgrades: 0,
    closedUntilTurn: 0,
    rentMultiplierUntilTurn: 0,
    nextVisitorFree: false,
  };
  state.pendingPurchase = null;
  addEvent(state, "purchase", "Deed claimed", `${player.name} bought ${space.name} for F${price}.`, {
    playerId: player.id,
    spaceIndex: space.index,
  });
}

function nextAuctionBidder(
  state: FortuneGameState,
  afterPlayerId: string,
  eligibleBidderIds: string[],
  highBidderId: string | null,
) {
  const startIndex = Math.max(0, state.players.findIndex((player) => player.id === afterPlayerId));
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(startIndex + offset) % state.players.length];
    if (
      !candidate.bankrupt
      && eligibleBidderIds.includes(candidate.id)
      && candidate.id !== highBidderId
    ) return candidate.id;
  }
  return null;
}

function settleAuction(state: FortuneGameState) {
  const auction = state.auction;
  if (!auction) return;
  const space = SPACE_BY_INDEX.get(auction.spaceIndex);
  const winner = auction.highBidderId
    ? state.players.find((player) => player.id === auction.highBidderId) ?? null
    : null;
  state.auction = null;
  if (!space || !winner || auction.currentBid <= 0 || winner.cash < auction.currentBid) {
    addEvent(state, "auction", "Auction closed", `${space?.name ?? "The deed"} returns to the Avenue unclaimed.`, {
      spaceIndex: auction.spaceIndex,
    });
    return;
  }
  winner.cash -= auction.currentBid;
  state.properties[String(space.index)] = {
    spaceIndex: space.index,
    ownerId: winner.id,
    purchasePrice: auction.currentBid,
    upgrades: 0,
    closedUntilTurn: 0,
    rentMultiplierUntilTurn: 0,
    nextVisitorFree: false,
  };
  addEvent(state, "auction", "Sold!", `${winner.name} won ${space.name} for F${auction.currentBid}.`, {
    playerId: winner.id,
    spaceIndex: space.index,
  });
}

function startAuction(state: FortuneGameState, player: PlayerState) {
  if (state.pendingPurchase === null) throw new Error("There is no deed waiting for auction.");
  const space = SPACE_BY_INDEX.get(state.pendingPurchase);
  if (!space || space.price <= 0 || propertyFor(state, space.index)) {
    throw new Error("That deed is no longer available.");
  }
  const eligibleBidderIds = activePlayers(state).map((bidder) => bidder.id);
  const currentBidderId = nextAuctionBidder(state, player.id, eligibleBidderIds, null);
  state.pendingPurchase = null;
  if (!currentBidderId) {
    addEvent(state, "auction", "Auction closed", `${space.name} returns to the Avenue unclaimed.`, {
      playerId: player.id,
      spaceIndex: space.index,
    });
    return;
  }
  state.auction = {
    spaceIndex: space.index,
    currentBid: 0,
    highBidderId: null,
    participantIds: [...eligibleBidderIds],
    eligibleBidderIds,
    currentBidderId,
    minimumIncrement: 10,
    initiatedById: player.id,
  };
  addEvent(state, "auction", "Bidding is open", `${space.name} is on the block. Opening bid: F10.`, {
    playerId: currentBidderId,
    spaceIndex: space.index,
  });
}

function auctionBid(state: FortuneGameState, playerId: string, amount: number) {
  const auction = state.auction;
  if (!auction) throw new Error("There is no live auction.");
  if (auction.currentBidderId !== playerId) throw new Error("Wait for your bid.");
  const bidder = state.players.find((player) => player.id === playerId);
  const space = SPACE_BY_INDEX.get(auction.spaceIndex);
  if (!bidder || bidder.bankrupt || !space) throw new Error("That bidder is no longer active.");
  const minimum = auction.currentBid + auction.minimumIncrement;
  const bid = Math.round(amount);
  if (!Number.isFinite(bid) || bid < minimum) throw new Error(`The next bid is at least F${minimum}.`);
  if (bid > bidder.cash) throw new Error(`You only have F${bidder.cash} available.`);
  auction.currentBid = bid;
  auction.highBidderId = bidder.id;
  const nextBidderId = nextAuctionBidder(
    state,
    bidder.id,
    auction.eligibleBidderIds,
    auction.highBidderId,
  );
  addEvent(state, "auction", `F${bid} bid`, `${bidder.name} leads the auction for ${space.name}.`, {
    playerId: bidder.id,
    spaceIndex: space.index,
  });
  if (!nextBidderId) {
    settleAuction(state);
    return;
  }
  auction.currentBidderId = nextBidderId;
}

function auctionPass(state: FortuneGameState, playerId: string) {
  const auction = state.auction;
  if (!auction) throw new Error("There is no live auction.");
  if (auction.currentBidderId !== playerId) throw new Error("Wait for your bid.");
  const bidder = state.players.find((player) => player.id === playerId);
  const space = SPACE_BY_INDEX.get(auction.spaceIndex);
  auction.eligibleBidderIds = auction.eligibleBidderIds.filter((id) => id !== playerId);
  addEvent(state, "auction", "Bidder folded", `${bidder?.name ?? "A bidder"} is out of the auction for ${space?.name ?? "the deed"}.`, {
    playerId,
    spaceIndex: auction.spaceIndex,
  });
  const nextBidderId = nextAuctionBidder(
    state,
    playerId,
    auction.eligibleBidderIds,
    auction.highBidderId,
  );
  if (!nextBidderId) {
    settleAuction(state);
    return;
  }
  auction.currentBidderId = nextBidderId;
}

function upgradeProperty(state: FortuneGameState, player: PlayerState, spaceIndex: number) {
  const property = propertyFor(state, spaceIndex);
  const space = SPACE_BY_INDEX.get(spaceIndex);
  if (!property || property.ownerId !== player.id || !space) throw new Error("You do not own that deed.");
  if (space.kind !== "landmark") throw new Error("Only landmarks can be upgraded.");
  if (space.district === null || !fullDistrictOwned(state, player.id, space.district)) {
    throw new Error(`Own every ${space.districtName ?? "matching-color"} landmark before adding crowns.`);
  }
  if (property.upgrades >= MAX_UPGRADES) throw new Error("That landmark already has its castle.");
  const cost = Math.max(0, space.upgradeCost - player.upgradeDiscount);
  if (player.cash < cost) throw new Error(`You need F${cost} for that upgrade.`);
  player.cash -= cost;
  player.upgradeDiscount = 0;
  property.upgrades += 1;
  const becameCastle = property.upgrades === MAX_UPGRADES;
  addEvent(state, "upgrade", becameCastle ? "Castle crowned" : `Crown ${property.upgrades}/2`, `${player.name} ${becameCastle ? "raised a castle at" : "placed a crown on"} ${space.name} for F${cost}.`, {
    playerId: player.id,
    spaceIndex,
  });
}

function activateHeldCard(state: FortuneGameState, player: PlayerState, cardId: string) {
  const index = player.heldCards.findIndex((card) => card.id === cardId);
  if (index < 0) throw new Error("That held card is unavailable.");
  const card = player.heldCards[index];
  if (card.title !== "Lucky Coin") throw new Error("VIP Wristbands activate automatically when needed.");
  if (state.rolled) throw new Error("Use the Lucky Coin before rolling.");
  player.heldCards.splice(index, 1);
  player.luckyRoll = true;
  addEvent(state, "fortune", "Lucky Coin ready", `${player.name} will keep the better of two rolls.`, {
    playerId: player.id,
  });
}

function nextActiveIndex(state: FortuneGameState, fromIndex: number) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    if (!state.players[index].bankrupt) return index;
  }
  return fromIndex;
}

function declareWinner(state: FortuneGameState, player: PlayerState, reason: string) {
  state.phase = "finished";
  state.winnerId = player.id;
  state.pendingPurchase = null;
  state.auction = null;
  state.tradeOffer = null;
  state.landmarkStealChoice = null;
  state.cardChoice = null;
  addEvent(state, "winner", "Fortune Crowned", `${player.name} wins Fortune Avenue — ${reason}`, {
    playerId: player.id,
  });
}

function checkWinner(state: FortuneGameState, candidate?: PlayerState) {
  const active = activePlayers(state);
  if (active.length === 1 && state.players.length > 1) {
    declareWinner(state, active[0], "last player standing.");
    return true;
  }
  if (
    candidate
    && !candidate.bankrupt
    && ownedProperties(state, candidate.id).length >= state.settings.requiredProperties
    && netWorth(state, candidate.id) >= state.settings.targetNetWorth
  ) {
    declareWinner(
      state,
      candidate,
      `F${netWorth(state, candidate.id)} net worth and ${state.settings.requiredProperties} deeds.`,
    );
    return true;
  }
  if (state.turnNumber >= state.settings.maxTurns) {
    const richest = [...active].sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id))[0];
    if (richest) declareWinner(state, richest, "highest fortune at closing time.");
    return Boolean(richest);
  }
  return false;
}

function endTurn(state: FortuneGameState, player: PlayerState) {
  if (!state.rolled) throw new Error("Roll before ending your turn.");
  if (state.pendingPurchase !== null) throw new Error("Buy the deed, auction it, or skip the auction first.");
  if (state.auction) throw new Error("Finish the live auction before ending the turn.");
  if (state.tradeOffer) throw new Error("Finish or withdraw the trade offer before ending the turn.");
  if (state.landmarkStealChoice) throw new Error("Choose the landmark from your Plot Twist before ending the turn.");
  if (state.cardChoice) throw new Error(`Finish the ${state.cardChoice.cardTitle} choice before ending the turn.`);
  if (checkWinner(state, player)) return;

  state.turnNumber += 1;
  state.dice = null;
  state.rolled = false;
  state.pendingPurchase = null;
  state.auction = null;
  state.tradeOffer = null;
  state.landmarkStealChoice = null;
  state.cardChoice = null;

  if (player.extraTurns > 0 && !player.bankrupt) {
    player.extraTurns -= 1;
    addEvent(state, "turn", "Bonus turn", `${player.name} takes another turn.`, { playerId: player.id });
    return;
  }

  const oldIndex = state.currentPlayerIndex;
  state.currentPlayerIndex = nextActiveIndex(state, oldIndex);
  if (state.currentPlayerIndex <= oldIndex) state.roundNumber += 1;
  const next = currentPlayer(state);
  if (next) addEvent(state, "turn", `Round ${state.roundNumber}`, `${next.name}'s turn.`, { playerId: next.id });
}

function ensurePlayingTurn(state: FortuneGameState, playerId: string, allowBankruptCleanup = false) {
  if (state.phase !== "playing") throw new Error("The game is not currently in play.");
  const player = currentPlayer(state);
  if (!player || player.id !== playerId) throw new Error("Wait for your turn.");
  if (player.bankrupt && !allowBankruptCleanup) throw new Error("This player is no longer active.");
  return player;
}

function normalizedTradeCash(value: number) {
  const cash = Math.round(Number(value));
  if (!Number.isFinite(cash) || cash < 0) throw new Error("Trade cash must be a non-negative whole amount.");
  return cash;
}

function normalizedTradeSpaces(value: number[]) {
  if (!Array.isArray(value)) throw new Error("The trade deed list is invalid.");
  const spaces = [...new Set(value.map((index) => Number(index)))];
  if (spaces.length > 20 || spaces.some((index) => !Number.isInteger(index))) {
    throw new Error("The trade deed list is invalid.");
  }
  return spaces;
}

function districtHasImprovements(state: FortuneGameState, ownerId: string, space: SpaceDefinition) {
  if (space.district === null) return false;
  return ownedProperties(state, ownerId).some((property) => (
    property.upgrades > 0 && SPACE_BY_INDEX.get(property.spaceIndex)?.district === space.district
  ));
}

function validateTradeProperties(
  state: FortuneGameState,
  ownerId: string,
  spaceIndexes: number[],
) {
  for (const spaceIndex of spaceIndexes) {
    const property = propertyFor(state, spaceIndex);
    const space = SPACE_BY_INDEX.get(spaceIndex);
    if (!property || property.ownerId !== ownerId || !space) {
      throw new Error("A deed in that offer is no longer owned by the player giving it.");
    }
    if (property.upgrades > 0 || districtHasImprovements(state, ownerId, space)) {
      throw new Error(`A district with crowns or a castle cannot be traded. ${space.name} must stay put.`);
    }
  }
}

function tradeBundleLabel(state: FortuneGameState, spaceIndexes: number[], cash: number) {
  const deedNames = spaceIndexes
    .map((index) => SPACE_BY_INDEX.get(index)?.name)
    .filter((name): name is string => Boolean(name));
  const deedLabel = deedNames.length === 0
    ? "no deeds"
    : deedNames.length <= 2
      ? deedNames.join(" and ")
      : `${deedNames.slice(0, 2).join(", ")} +${deedNames.length - 2} more`;
  return cash > 0 ? `${deedLabel} plus F${cash}` : deedLabel;
}

function proposeTrade(
  state: FortuneGameState,
  player: PlayerState,
  action: Extract<RoomAction, { type: "propose-trade" }>,
) {
  if (state.pendingPurchase !== null) throw new Error("Resolve the landed deed before opening the trade table.");
  const recipient = state.players.find((candidate) => candidate.id === action.toPlayerId);
  if (!recipient || recipient.id === player.id || recipient.bankrupt) throw new Error("Choose another active player for this trade.");
  const offeredSpaceIndexes = normalizedTradeSpaces(action.offeredSpaceIndexes);
  const requestedSpaceIndexes = normalizedTradeSpaces(action.requestedSpaceIndexes);
  const offeredCash = normalizedTradeCash(action.offeredCash);
  const requestedCash = normalizedTradeCash(action.requestedCash);
  if (offeredSpaceIndexes.length === 0 && offeredCash === 0) throw new Error("Add a deed or cash to your side of the trade.");
  if (requestedSpaceIndexes.length === 0 && requestedCash === 0) throw new Error("Ask for a deed or cash in return.");
  if (player.cash < offeredCash) throw new Error(`You only have F${player.cash} available.`);
  if (recipient.cash < requestedCash) throw new Error(`${recipient.name} only has F${recipient.cash} available.`);
  validateTradeProperties(state, player.id, offeredSpaceIndexes);
  validateTradeProperties(state, recipient.id, requestedSpaceIndexes);
  state.tradeOffer = {
    id: `trade-${state.turnNumber}-${state.eventSequence + 1}-${state.rngSeed.toString(36)}`,
    fromPlayerId: player.id,
    toPlayerId: recipient.id,
    offeredSpaceIndexes,
    requestedSpaceIndexes,
    offeredCash,
    requestedCash,
    createdTurn: state.turnNumber,
  };
  addEvent(
    state,
    "trade",
    "Trade proposed",
    `${player.name} offered ${tradeBundleLabel(state, offeredSpaceIndexes, offeredCash)} to ${recipient.name} for ${tradeBundleLabel(state, requestedSpaceIndexes, requestedCash)}.`,
    { playerId: player.id },
  );
}

function acceptTrade(state: FortuneGameState, playerId: string) {
  const offer = state.tradeOffer;
  if (!offer) throw new Error("There is no trade offer to accept.");
  if (offer.toPlayerId !== playerId) throw new Error("Only the player receiving this offer can accept it.");
  const proposer = state.players.find((player) => player.id === offer.fromPlayerId);
  const recipient = state.players.find((player) => player.id === offer.toPlayerId);
  if (!proposer || !recipient || proposer.bankrupt || recipient.bankrupt) throw new Error("One of the traders is no longer active.");
  if (proposer.cash < offer.offeredCash || recipient.cash < offer.requestedCash) throw new Error("The cash in that offer is no longer available.");
  validateTradeProperties(state, proposer.id, offer.offeredSpaceIndexes);
  validateTradeProperties(state, recipient.id, offer.requestedSpaceIndexes);
  proposer.cash = proposer.cash - offer.offeredCash + offer.requestedCash;
  recipient.cash = recipient.cash - offer.requestedCash + offer.offeredCash;
  offer.offeredSpaceIndexes.forEach((spaceIndex) => { state.properties[String(spaceIndex)].ownerId = recipient.id; });
  offer.requestedSpaceIndexes.forEach((spaceIndex) => { state.properties[String(spaceIndex)].ownerId = proposer.id; });
  state.tradeOffer = null;
  addEvent(state, "trade", "Deal accepted", `${recipient.name} shook on the deal with ${proposer.name}. Deeds and cash have changed hands.`, {
    playerId: recipient.id,
  });
}

function declineTrade(state: FortuneGameState, playerId: string) {
  const offer = state.tradeOffer;
  if (!offer) throw new Error("There is no trade offer to decline.");
  if (playerId !== offer.toPlayerId && playerId !== offer.fromPlayerId) throw new Error("Only the two traders can close this offer.");
  const actor = state.players.find((player) => player.id === playerId);
  const withdrawn = playerId === offer.fromPlayerId;
  state.tradeOffer = null;
  addEvent(state, "trade", withdrawn ? "Offer withdrawn" : "Trade declined", `${actor?.name ?? "A player"} ${withdrawn ? "withdrew" : "declined"} the deal.`, {
    playerId,
  });
}

export function applyRoomAction(
  source: FortuneGameState,
  playerId: string,
  action: RoomAction,
) {
  const state = cloneState(source);
  if (action.type === "start") {
    if (playerId !== state.hostPlayerId) throw new Error("Only the room host can start the game.");
    return startGame(state);
  }

  if (state.cardChoice) {
    if (action.type !== "resolve-card-choice") throw new Error(`Finish the ${state.cardChoice.cardTitle} choice before play continues.`);
    resolveCardChoice(state, playerId, action.selection);
    state.updatedAt = now();
    return state;
  }

  if (action.type === "resolve-card-choice") throw new Error("There is no card choice waiting on the table.");

  if (state.landmarkStealChoice) {
    if (action.type !== "steal-landmark") throw new Error("Choose the landmark from the Plot Twist before play continues.");
    chooseLandmarkSteal(state, playerId, action.spaceIndex);
    state.updatedAt = now();
    return state;
  }

  if (action.type === "steal-landmark") throw new Error("There is no landmark waiting to be chosen.");

  if (state.tradeOffer) {
    if (action.type === "trade-accept") acceptTrade(state, playerId);
    else if (action.type === "trade-decline") declineTrade(state, playerId);
    else throw new Error("The trade offer must be accepted, declined, or withdrawn first.");
    state.updatedAt = now();
    return state;
  }

  if (action.type === "trade-accept" || action.type === "trade-decline") {
    throw new Error("There is no open trade offer.");
  }

  if (state.auction) {
    if (action.type === "auction-bid") auctionBid(state, playerId, action.amount);
    else if (action.type === "auction-pass") auctionPass(state, playerId);
    else if (action.type === "auction-tick") {
      const bidder = state.players.find((candidate) => candidate.id === state.auction?.currentBidderId);
      if (!bidder?.isBot) throw new Error("The auction is waiting for a player, not a bot.");
      const botAction = botAuctionAction(state, bidder);
      if (botAction.type === "auction-bid") auctionBid(state, bidder.id, botAction.amount);
      else auctionPass(state, bidder.id);
    }
    else throw new Error("The live auction must finish before the Avenue continues.");
    state.updatedAt = now();
    return state;
  }

  if (action.type === "auction-bid" || action.type === "auction-pass" || action.type === "auction-tick") {
    throw new Error("There is no live auction.");
  }

  const player = ensurePlayingTurn(state, playerId, action.type === "end-turn");
  switch (action.type) {
    case "roll":
      if (state.rolled) throw new Error("You already rolled this turn.");
      rollDice(state, player);
      break;
    case "buy":
      buyPending(state, player);
      break;
    case "skip-purchase":
      if (state.pendingPurchase === null) throw new Error("There is no deed to pass on.");
      state.pendingPurchase = null;
      addEvent(state, "space", "Deed passed", `${player.name} left the deed on the market.`, {
        playerId: player.id,
      });
      break;
    case "start-auction":
      startAuction(state, player);
      break;
    case "propose-trade":
      proposeTrade(state, player, action);
      break;
    case "upgrade":
      upgradeProperty(state, player, action.spaceIndex);
      break;
    case "use-card":
      activateHeldCard(state, player, action.cardId);
      break;
    case "end-turn":
      endTurn(state, player);
      break;
  }
  state.updatedAt = now();
  return state;
}

function botWantsPurchase(state: FortuneGameState, bot: PlayerState, space: SpaceDefinition) {
  const price = Math.max(0, space.price - bot.purchaseDiscount);
  const reserve = 210 + state.roundNumber * 8;
  const districtBonus = space.district === null ? 0 : space.district * 0.055;
  return bot.cash - price >= reserve && nextRandom(state) < 0.74 + districtBonus;
}

function botUpgradeTarget(state: FortuneGameState, bot: PlayerState) {
  return ownedProperties(state, bot.id)
    .flatMap((property) => {
      const space = SPACE_BY_INDEX.get(property.spaceIndex);
      return space ? [{ property, space }] : [];
    })
    .filter(
      (entry) => entry.space.kind === "landmark"
        && entry.space.district !== null
        && fullDistrictOwned(state, bot.id, entry.space.district)
        && entry.property.upgrades < MAX_UPGRADES
        && bot.cash >= Math.max(0, entry.space.upgradeCost - bot.upgradeDiscount) + 300,
    )
    .sort((a, b) => b.space.baseRent - a.space.baseRent)[0] ?? null;
}

function botAuctionAction(state: FortuneGameState, bot: PlayerState): RoomAction {
  const auction = state.auction;
  if (!auction) return { type: "auction-pass" };
  const space = SPACE_BY_INDEX.get(auction.spaceIndex);
  if (!space) return { type: "auction-pass" };
  const minimumBid = auction.currentBid + auction.minimumIncrement;
  const reserve = 180 + state.roundNumber * 6;
  const ownsInDistrict = space.district !== null
    && ownedProperties(state, bot.id).some((property) => SPACE_BY_INDEX.get(property.spaceIndex)?.district === space.district);
  const appetite = space.price * (ownsInDistrict ? 1.18 : 0.92) + randomInt(state, 8) * 10;
  if (minimumBid > appetite || bot.cash - minimumBid < reserve) return { type: "auction-pass" };
  const extraSteps = randomInt(state, 3);
  const ambitiousBid = minimumBid + extraSteps * auction.minimumIncrement;
  const affordableBid = Math.min(ambitiousBid, bot.cash - reserve);
  return { type: "auction-bid", amount: Math.max(minimumBid, affordableBid) };
}

function botTradePropertyValue(state: FortuneGameState, bot: PlayerState, spaceIndexes: number[], receiving: boolean) {
  let value = 0;
  for (const spaceIndex of spaceIndexes) {
    const space = SPACE_BY_INDEX.get(spaceIndex);
    if (!space) continue;
    let deedValue = space.price + space.baseRent * 4;
    if (space.district !== null) {
      const districtSpaces = SPACES.filter((candidate) => candidate.district === space.district);
      const currentlyOwned = new Set(ownedProperties(state, bot.id).map((property) => property.spaceIndex));
      if (receiving) spaceIndexes.forEach((index) => currentlyOwned.add(index));
      const completesDistrict = districtSpaces.every((candidate) => currentlyOwned.has(candidate.index));
      const ownsDistrictNow = districtSpaces.every((candidate) => state.properties[String(candidate.index)]?.ownerId === bot.id);
      if (completesDistrict || (!receiving && ownsDistrictNow)) deedValue *= 1.4;
    }
    value += deedValue;
  }
  return value;
}

function botAcceptsTrade(state: FortuneGameState, bot: PlayerState) {
  const offer = state.tradeOffer;
  if (!offer || offer.toPlayerId !== bot.id) return false;
  if (bot.cash - offer.requestedCash + offer.offeredCash < 150) return false;
  const incoming = offer.offeredCash + botTradePropertyValue(state, bot, offer.offeredSpaceIndexes, true);
  const outgoing = offer.requestedCash + botTradePropertyValue(state, bot, offer.requestedSpaceIndexes, false);
  return incoming >= outgoing * 0.92;
}

function botCardChoiceSelection(state: FortuneGameState, bot: PlayerState) {
  const choice = state.cardChoice;
  if (!choice || choice.playerId !== bot.id) return null;
  const spaceEntries = choice.eligibleSpaceIndexes.flatMap((spaceIndex) => {
    const space = SPACE_BY_INDEX.get(spaceIndex);
    const property = propertyFor(state, spaceIndex);
    return space ? [{ space, property }] : [];
  });
  const highValueSpace = [...spaceEntries].sort((a, b) => b.space.price - a.space.price)[0]?.space;
  const lowValueSpace = [...spaceEntries].sort((a, b) => a.space.price - b.space.price)[0]?.space;

  switch (choice.cardTitle) {
    case "Scenic Shortcut": {
      const best = [...spaceEntries].sort((a, b) => {
        const score = (entry: (typeof spaceEntries)[number]) => {
          if (!entry.property) return bot.cash >= entry.space.price ? 2000 + entry.space.price : 250;
          if (entry.property.ownerId === bot.id) return 1200 + entry.space.price;
          return -propertyRent(state, entry.property, 7);
        };
        return score(b) - score(a);
      })[0]?.space;
      return best ? `space:${best.index}` : null;
    }
    case "Grand Reopening":
    case "Free Upgrade":
    case "Influencer Visit":
    case "Celebrity Entourage":
      return highValueSpace ? `space:${highValueSpace.index}` : null;
    case "Review Bomb":
    case "Sudden Rebrand":
      return lowValueSpace ? `space:${lowValueSpace.index}` : null;
    case "Midnight Pass": {
      const best = [...spaceEntries].sort((a, b) => {
        const distanceA = (a.space.index - bot.position + BOARD_SIZE) % BOARD_SIZE;
        const distanceB = (b.space.index - bot.position + BOARD_SIZE) % BOARD_SIZE;
        const ownedA = a.property?.ownerId === bot.id ? -20 : 0;
        const ownedB = b.property?.ownerId === bot.id ? -20 : 0;
        return distanceA + ownedA - (distanceB + ownedB);
      })[0]?.space;
      return best ? `space:${best.index}` : null;
    }
    case "Position Upgrade": {
      const target = state.players
        .filter((candidate) => choice.eligiblePlayerIds.includes(candidate.id) && !candidate.bankrupt)
        .sort((a, b) => b.position - a.position || b.cash - a.cash)[0];
      return target ? `player:${target.id}` : null;
    }
    case "Big Break": {
      const destination = SPACE_BY_INDEX.get((bot.position + 6) % BOARD_SIZE);
      const destinationProperty = destination ? propertyFor(state, destination.index) : null;
      const attractiveMove = destination
        && (destination.kind === "lucky" || destination.kind === "plot" || (!destinationProperty && destination.price > 0 && bot.cash >= destination.price + 180));
      return attractiveMove ? "move-six" : "cash";
    }
    case "Surprise Inspection":
      return bot.cash < 180 && lowValueSpace ? `space:${lowValueSpace.index}` : "pay-20";
    case "Neighborhood Blackout": {
      const bestDistrict = choice.eligibleDistricts
        .map((district) => ({
          district,
          score: Object.values(state.properties).reduce((total, property) => {
            const space = SPACE_BY_INDEX.get(property.spaceIndex);
            return space?.district === district && property.ownerId !== bot.id
              ? total + propertyRent(state, property, 7) + property.upgrades * 25
              : total;
          }, 0),
        }))
        .sort((a, b) => b.score - a.score || a.district - b.district)[0]?.district;
      return bestDistrict === undefined ? null : `district:${bestDistrict}`;
    }
    case "Friendly Inspector":
      if (choice.options.includes("skip-turn")) return "skip-turn";
      if (choice.options.includes("reverse-next")) return "reverse-next";
      return highValueSpace ? `space:${highValueSpace.index}` : null;
    case "Lost Luggage":
      return bot.cash > 180 ? "pay-40" : "midnight-express";
    default:
      return choice.options[0]
        ?? (highValueSpace ? `space:${highValueSpace.index}` : null)
        ?? (choice.eligibleDistricts[0] === undefined ? null : `district:${choice.eligibleDistricts[0]}`);
  }
}

export function runBotTurns(source: FortuneGameState, options: { singleAuctionStep?: boolean } = {}) {
  let state = cloneState(source);
  let safety = 0;
  while (state.phase === "playing" && safety < 160) {
    safety += 1;
    if (state.cardChoice) {
      const chooser = state.players.find((player) => player.id === state.cardChoice?.playerId);
      if (!chooser?.isBot) break;
      const selection = botCardChoiceSelection(state, chooser);
      if (!selection) {
        const title = state.cardChoice.cardTitle;
        state.cardChoice = null;
        addEvent(state, "card", "Choice expired", `${chooser.name} had no valid option left for ${title}.`, { playerId: chooser.id });
        continue;
      }
      state = applyRoomAction(state, chooser.id, { type: "resolve-card-choice", selection });
      continue;
    }
    if (state.landmarkStealChoice) {
      const chooser = state.players.find((player) => player.id === state.landmarkStealChoice?.playerId);
      if (!chooser?.isBot) break;
      const target = bestBotStealTarget(state, chooser);
      if (!target) {
        state.landmarkStealChoice = null;
        addEvent(state, "card", "Twist fizzled", `${chooser.name} had no eligible rival landmark left to choose.`, { playerId: chooser.id });
        continue;
      }
      state = applyRoomAction(state, chooser.id, { type: "steal-landmark", spaceIndex: target.space.index });
      continue;
    }
    if (state.tradeOffer) {
      const recipient = state.players.find((player) => player.id === state.tradeOffer?.toPlayerId);
      if (!recipient?.isBot) break;
      state = applyRoomAction(state, recipient.id, { type: botAcceptsTrade(state, recipient) ? "trade-accept" : "trade-decline" });
      continue;
    }
    if (state.auction) {
      const bidder = state.players.find((player) => player.id === state.auction?.currentBidderId);
      if (!bidder?.isBot) break;
      state = applyRoomAction(state, bidder.id, botAuctionAction(state, bidder));
      if (options.singleAuctionStep) break;
      continue;
    }
    if (!currentPlayer(state)?.isBot) break;
    const bot = currentPlayer(state)!;
    const coin = bot.heldCards.find((card) => card.title === "Lucky Coin");
    if (!state.rolled) {
      if (coin && nextRandom(state) < 0.65) state = applyRoomAction(state, bot.id, { type: "use-card", cardId: coin.id });
      state = applyRoomAction(state, bot.id, { type: "roll" });
      continue;
    }
    if (state.pendingPurchase !== null) {
      const space = SPACE_BY_INDEX.get(state.pendingPurchase);
      const action: RoomAction = space && botWantsPurchase(state, bot, space)
        ? { type: "buy" }
        : nextRandom(state) < 0.3
          ? { type: "start-auction" }
          : { type: "skip-purchase" };
      state = applyRoomAction(
        state,
        bot.id,
        action,
      );
      continue;
    }
    const upgrade = botUpgradeTarget(state, bot);
    if (upgrade && nextRandom(state) < 0.34) {
      state = applyRoomAction(state, bot.id, { type: "upgrade", spaceIndex: upgrade.space.index });
      continue;
    }
    state = applyRoomAction(state, bot.id, { type: "end-turn" });
  }
  return state;
}
