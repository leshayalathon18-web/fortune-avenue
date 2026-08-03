import rawGameData from "@/game-data/fortune-avenue.json";
import rawPawnData from "@/game-data/pawns.json";
import type {
  CardDefinition,
  CardDeck,
  MatchMode,
  PawnDefinition,
  SpaceDefinition,
  SpaceKind,
} from "./game-types";

export const MATCH_MODES: Record<MatchMode, {
  name: string;
  shortName: string;
  description: string;
  startCash: number;
  passBonus: number;
  targetNetWorth: number;
  requiredProperties: number;
  maxTurns: number;
}> = {
  classic: {
    name: "Classic Long Game",
    shortName: "Classic",
    description: "The full empire-building night: eight deeds, F5,000 fortune, or 180 turns.",
    startCash: 1400,
    passBonus: 200,
    targetNetWorth: 5000,
    requiredProperties: 8,
    maxTurns: 180,
  },
  party: {
    name: "Party Game",
    shortName: "Party",
    description: "A quicker, louder match with six deeds, F3,500 fortune, and a 90-turn closing bell.",
    startCash: 1200,
    passBonus: 200,
    targetNetWorth: 3500,
    requiredProperties: 6,
    maxTurns: 90,
  },
  "grand-finale": {
    name: "Grand Finale",
    shortName: "Finale",
    description: "No early fortune win. Build until turn 140, then the richest empire takes the crown.",
    startCash: 1400,
    passBonus: 225,
    targetNetWorth: Number.MAX_SAFE_INTEGER,
    requiredProperties: 40,
    maxTurns: 140,
  },
};

const DISTRICT_NAMES = [
  "Strange Beginnings",
  "Roadside Wonders",
  "After Hours",
  "Bad Decisions",
  "Midnight Commerce",
  "The Final Stretch",
] as const;

const DISTRICT_COLORS = [
  "#7357b8",
  "#1aa596",
  "#db5b43",
  "#d99028",
  "#b84279",
  "#d2a743",
] as const;

const LANDMARK_BASE_PRICE = [90, 140, 200, 260, 330, 420] as const;
const LANDMARK_STEP_PRICE = [20, 25, 30, 35, 40, 50] as const;
const LANDMARK_BASE_RENT = [12, 20, 34, 52, 75, 105] as const;
const LANDMARK_STEP_RENT = [4, 6, 8, 10, 12, 16] as const;
const UPGRADE_COST = [50, 70, 90, 110, 135, 165] as const;

function filename(path: string) {
  return path.split(/[\\/]/).pop()?.replace(/\.png$/i, ".webp") ?? "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

let landmarkRank = 0;

export const SPACES: SpaceDefinition[] = rawGameData.spaces.map((raw) => {
  const kind = raw.kind as SpaceKind;
  const isLandmark = kind === "landmark";
  const district = isLandmark ? Math.floor(landmarkRank / 4) : null;
  const districtOffset = isLandmark ? landmarkRank % 4 : 0;
  if (isLandmark) landmarkRank += 1;

  let price = 0;
  let baseRent = 0;
  let upgradeCost = 0;

  if (district !== null) {
    price = LANDMARK_BASE_PRICE[district] + LANDMARK_STEP_PRICE[district] * districtOffset;
    baseRent = LANDMARK_BASE_RENT[district] + LANDMARK_STEP_RENT[district] * districtOffset;
    upgradeCost = UPGRADE_COST[district];
  } else if (kind === "transport") {
    price = 220;
    baseRent = 45;
  } else if (kind === "service") {
    price = 180;
    baseRent = 0;
  }

  return {
    index: raw.index,
    name: raw.name,
    kind,
    asset: isLandmark
      ? `/art/landmarks/${filename(raw.asset)}`
      : `/art/spaces/${filename(raw.asset)}`,
    district,
    districtName: district === null ? null : DISTRICT_NAMES[district],
    districtColor: district === null ? "#b58a37" : DISTRICT_COLORS[district],
    price,
    baseRent,
    upgradeCost,
  };
});

function buildCards(deck: CardDeck): CardDefinition[] {
  const source = deck === "lucky-break" ? rawGameData.decks.lucky_break : rawGameData.decks.plot_twist;
  return source.cards.map((card, index) => ({
    index,
    deck,
    title: card.title,
    effect: card.effect,
    image: `/art/cards/${deck}/${String(index + 1).padStart(2, "0")}-${slugify(card.title)}.webp`,
  }));
}

export const LUCKY_CARDS = buildCards("lucky-break");
export const PLOT_CARDS = buildCards("plot-twist");

const PAWN_ACCENTS = [
  "#9b6fe2",
  "#d7aa40",
  "#20b79f",
  "#6c4cb4",
  "#32cbd0",
  "#d53548",
  "#ef5b7a",
  "#d62d87",
  "#2cc5cf",
] as const;

export const PAWNS: PawnDefinition[] = rawPawnData.pawns.map((pawn, index) => ({
  code: pawn.code,
  slug: pawn.slug,
  name: pawn.name,
  image: `/art/pawns/${filename(pawn.source)}`,
  accent: PAWN_ACCENTS[index],
}));

export const PLAYER_COLORS = [
  "#2dd4bf",
  "#fb4f74",
  "#a78bfa",
  "#f5b942",
  "#38bdf8",
  "#f97316",
] as const;

export const BOT_NAMES = [
  "Lady Luck",
  "Plot Bot",
  "Cashanova",
  "Avenue Annie",
  "Rent Reynolds",
  "Dicey Dee",
] as const;

export const SPACE_BY_INDEX = new Map(SPACES.map((space) => [space.index, space]));

export const GAME_TITLE = rawGameData.title;
export const GAME_TAGLINE = rawGameData.tagline;
export const DISTRICTS = DISTRICT_NAMES;
