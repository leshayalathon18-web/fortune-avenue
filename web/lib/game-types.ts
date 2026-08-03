export type BoardTheme = "emerald" | "crimson";
export type RoomKind = "bots" | "friends";
export type RoomPhase = "lobby" | "playing" | "finished";
export type CardDeck = "lucky-break" | "plot-twist";
export type MatchMode = "classic" | "party" | "grand-finale";
export type SessionRole = "player" | "spectator";

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

export interface PlayerGameStats {
  deedsBought: number;
  auctionsWon: number;
  tradesCompleted: number;
  largestFeePaid: number;
  largestFeeCollected: number;
  castlesBuilt: number;
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
  gameStats?: PlayerGameStats;
}

export interface PropertyState {
  spaceIndex: number;
  ownerId: string;
  purchasePrice?: number;
  upgrades: number;
  mortgaged?: boolean;
  closedUntilTurn: number;
  rentMultiplierUntilTurn: number;
  rentDiscountUntilTurn?: number;
  closedUntilOwnerVisit?: boolean;
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
  participantIds: string[];
  eligibleBidderIds: string[];
  currentBidderId: string;
  minimumIncrement: number;
  initiatedById: string;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  offeredSpaceIndexes: number[];
  requestedSpaceIndexes: number[];
  offeredCash: number;
  requestedCash: number;
  createdTurn: number;
}

export interface BankruptcyDebt {
  id: string;
  playerId: string;
  creditorId: string | null;
  originalAmount: number;
  remainingAmount: number;
  reason: string;
}

export interface LandmarkStealChoice {
  playerId: string;
  eligibleSpaceIndexes: number[];
}

export type CardChoiceKind = "space" | "district" | "player" | "decision" | "penalty";

export interface CardChoice {
  playerId: string;
  cardTitle: string;
  deck: CardDeck;
  kind: CardChoiceKind;
  eligibleSpaceIndexes: number[];
  eligiblePlayerIds: string[];
  eligibleDistricts: number[];
  options: string[];
}

export type GameEventType =
  | "room"
  | "turn"
  | "roll"
  | "space"
  | "purchase"
  | "auction"
  | "trade"
  | "rent"
  | "upgrade"
  | "mortgage"
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
  matchMode: MatchMode;
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
  tradeOffer: TradeOffer | null;
  bankruptcyQueue: BankruptcyDebt[];
  landmarkStealChoice: LandmarkStealChoice | null;
  cardChoice: CardChoice | null;
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
  | { type: "auction-tick" }
  | { type: "propose-trade"; toPlayerId: string; offeredSpaceIndexes: number[]; requestedSpaceIndexes: number[]; offeredCash: number; requestedCash: number }
  | { type: "trade-accept" }
  | { type: "trade-decline" }
  | { type: "steal-landmark"; spaceIndex: number }
  | { type: "resolve-card-choice"; selection: string }
  | { type: "upgrade"; spaceIndex: number }
  | { type: "sell-upgrade"; spaceIndex: number }
  | { type: "mortgage"; spaceIndex: number }
  | { type: "unmortgage"; spaceIndex: number }
  | { type: "settle-debt" }
  | { type: "declare-bankruptcy" }
  | { type: "use-card"; cardId: string }
  | { type: "end-turn" };

export interface RoomCredentials {
  roomCode: string;
  playerId: string;
  resumeToken: string;
  role?: SessionRole;
}

export interface RoomPayload {
  state: FortuneGameState;
  you: {
    playerId: string;
    isHost: boolean;
    isSpectator?: boolean;
  } | null;
}

export interface ProfileCredentials {
  profileId: string;
  profileToken: string;
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  favoritePawnSlug: string;
  gamesPlayed: number;
  wins: number;
  biggestFortune: number;
  districtsCompleted: number;
  castlesBuilt: number;
  achievements: string[];
}
