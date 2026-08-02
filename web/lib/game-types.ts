export type BoardTheme = "emerald" | "crimson";
export type RoomKind = "bots" | "friends";
export type RoomPhase = "lobby" | "playing" | "finished";
export type CardDeck = "lucky-break" | "plot-twist";

export type SpaceKind =
  | "corner"
  | "landmark"
  | "lucky"
  | "plot"
  | "transport"
  | "service";

export interface SpaceDefinition {
  index: number;
  name: string;
  kind: SpaceKind;
  asset: string;
  district: number | null;
  districtName: string | null;
  districtColor: string;
  price: number;
  baseRent: number;
  upgradeCost: number;
}

export interface CardDefinition {
  index: number;
  deck: CardDeck;
  title: string;
  effect: string;
  image: string;
}

export interface PawnDefinition {
  code: string;
  slug: string;
  name: string;
  image: string;
  accent: string;
}

export interface HeldCard {
  id: string;
  title: string;
  effect: string;
}

export interface PlayerState {
  id: string;
  name: string;
  pawnSlug: string;
  color: string;
  isBot: boolean;
  cash: number;
  position: number;
  bankrupt: boolean;
  skipTurns: number;
  heldCards: HeldCard[];
  purchaseDiscount: number;
  upgradeDiscount: number;
  reverseNext: boolean;
  luckyRoll: boolean;
  extraTurns: number;
  rentBoostUntilTurn: number;
}

export interface PropertyState {
  spaceIndex: number;
  ownerId: string;
  upgrades: number;
  closedUntilTurn: number;
  rentMultiplierUntilTurn: number;
  nextVisitorFree: boolean;
}

export interface GameModifiers {
  freeAdmissionUntilTurn: number;
  marketDipUntilTurn: number;
  districtBlackout: {
    district: number;
    untilTurn: number;
  } | null;
}

export interface CardEvent {
  deck: CardDeck;
  index: number;
  title: string;
  effect: string;
  image: string;
}

export interface MovementEvent {
  from: number;
  to: number;
  steps: number;
  direction: 1 | -1;
}

export interface MoneyTransferEvent {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
}

export interface AuctionState {
  spaceIndex: number;
  currentBid: number;
  highBidderId: string | null;
  eligibleBidderIds: string[];
  currentBidderId: string;
  minimumIncrement: number;
  initiatedById: string;
}

export type GameEventType =
  | "room"
  | "turn"
  | "roll"
  | "space"
  | "purchase"
  | "auction"
  | "rent"
  | "upgrade"
  | "card"
  | "fortune"
  | "warning"
  | "winner";

export interface GameEvent {
  id: string;
  type: GameEventType;
  title: string;
  message: string;
  playerId?: string;
  spaceIndex?: number;
  card?: CardEvent;
  movement?: MovementEvent;
  moneyTransfer?: MoneyTransferEvent;
  createdAt: string;
}

export interface FortuneSettings {
  startCash: number;
  passBonus: number;
  targetNetWorth: number;
  requiredProperties: number;
  maxTurns: number;
}

export interface FortuneGameState {
  code: string;
  revision: number;
  kind: RoomKind;
  phase: RoomPhase;
  theme: BoardTheme;
  maxPlayers: number;
  hostPlayerId: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  players: PlayerState[];
  properties: Record<string, PropertyState>;
  currentPlayerIndex: number;
  turnNumber: number;
  roundNumber: number;
  dice: [number, number] | null;
  rolled: boolean;
  pendingPurchase: number | null;
  auction: AuctionState | null;
  luckyDeck: number[];
  plotDeck: number[];
  luckyCursor: number;
  plotCursor: number;
  modifiers: GameModifiers;
  lastEvent: GameEvent | null;
  log: GameEvent[];
  eventSequence: number;
  winnerId: string | null;
  rngSeed: number;
  settings: FortuneSettings;
}

export type RoomAction =
  | { type: "start" }
  | { type: "roll" }
  | { type: "buy" }
  | { type: "skip-purchase" }
  | { type: "start-auction" }
  | { type: "auction-bid"; amount: number }
  | { type: "auction-pass" }
  | { type: "upgrade"; spaceIndex: number }
  | { type: "use-card"; cardId: string }
  | { type: "end-turn" };

export interface RoomCredentials {
  roomCode: string;
  playerId: string;
  resumeToken: string;
}

export interface RoomPayload {
  state: FortuneGameState;
  you: {
    playerId: string;
    isHost: boolean;
  } | null;
}
