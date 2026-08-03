import { env } from "cloudflare:workers";
import { netWorth, ownedProperties } from "./game-engine";
import { PAWNS, SPACES } from "./game-data";
import type { FortuneGameState, PlayerProfile, ProfileCredentials } from "./game-types";
import type { AchievementId } from "./profile-data";
import { randomId, randomResumeToken } from "./room-storage";

interface ProfileRow {
  id: string;
  token_hash: string;
  display_name: string;
  favorite_pawn_slug: string;
  games_played: number;
  wins: number;
  biggest_fortune: number;
  districts_completed: number;
  castles_built: number;
  achievements_json: string;
  pawn_usage_json: string;
}

function database() {
  if (!env.DB) throw new Error("Fortune Avenue profile storage is unavailable.");
  return env.DB;
}

async function tokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function safePawnUsage(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, count]) => typeof count === "number" && Number.isFinite(count))
        .map(([slug, count]) => [slug, Number(count)]),
    );
  } catch {
    return {};
  }
}

function toProfile(row: ProfileRow): PlayerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    favoritePawnSlug: row.favorite_pawn_slug,
    gamesPlayed: row.games_played,
    wins: row.wins,
    biggestFortune: row.biggest_fortune,
    districtsCompleted: row.districts_completed,
    castlesBuilt: row.castles_built,
    achievements: safeJsonArray(row.achievements_json),
  };
}

async function profileRow(profileId: string) {
  return database()
    .prepare(`
      SELECT id, token_hash, display_name, favorite_pawn_slug, games_played, wins,
             biggest_fortune, districts_completed, castles_built, achievements_json, pawn_usage_json
      FROM fortune_profiles
      WHERE id = ?
    `)
    .bind(profileId)
    .first<ProfileRow>();
}

export async function loadProfile(credentials: ProfileCredentials) {
  if (!credentials.profileId || !credentials.profileToken) return null;
  const row = await profileRow(credentials.profileId);
  if (!row || row.token_hash !== await tokenHash(credentials.profileToken)) return null;
  return toProfile(row);
}

export async function createProfile(displayName: string, pawnSlug: string) {
  const id = randomId("profile", 12);
  const profileToken = randomResumeToken();
  const safeName = displayName.trim().slice(0, 24) || "Avenue Legend";
  const safePawn = PAWNS.some((pawn) => pawn.slug === pawnSlug) ? pawnSlug : PAWNS[8].slug;
  const timestamp = new Date().toISOString();
  await database()
    .prepare(`
      INSERT INTO fortune_profiles (
        id, token_hash, display_name, favorite_pawn_slug, games_played, wins,
        biggest_fortune, districts_completed, castles_built, achievements_json,
        pawn_usage_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '[]', '{}', ?, ?)
    `)
    .bind(id, await tokenHash(profileToken), safeName, safePawn, timestamp, timestamp)
    .run();
  const row = await profileRow(id);
  if (!row) throw new Error("The Avenue could not create that profile.");
  return {
    credentials: { profileId: id, profileToken },
    profile: toProfile(row),
  };
}

export async function updateProfileIdentity(
  credentials: ProfileCredentials,
  displayName: string,
  pawnSlug: string,
) {
  const row = await profileRow(credentials.profileId);
  if (!row || row.token_hash !== await tokenHash(credentials.profileToken)) return null;
  const safeName = displayName.trim().slice(0, 24) || row.display_name;
  const safePawn = PAWNS.some((pawn) => pawn.slug === pawnSlug) ? pawnSlug : row.favorite_pawn_slug;
  await database()
    .prepare(`
      UPDATE fortune_profiles
      SET display_name = ?,
          favorite_pawn_slug = CASE WHEN games_played = 0 THEN ? ELSE favorite_pawn_slug END,
          updated_at = ?
      WHERE id = ?
    `)
    .bind(safeName, safePawn, new Date().toISOString(), row.id)
    .run();
  const updated = await profileRow(row.id);
  return updated ? toProfile(updated) : null;
}

export async function verifiedProfileId(credentials?: ProfileCredentials | null) {
  if (!credentials) return null;
  return await loadProfile(credentials) ? credentials.profileId : null;
}

function completedDistrictCount(state: FortuneGameState, playerId: string) {
  return Array.from({ length: 6 }, (_, district) => district)
    .filter((district) => {
      const districtSpaces = SPACES.filter((space) => space.district === district);
      return districtSpaces.length > 0
        && districtSpaces.every((space) => state.properties[String(space.index)]?.ownerId === playerId);
    })
    .length;
}

function unlockedAchievements(
  state: FortuneGameState,
  playerId: string,
  fortune: number,
  districts: number,
  castles: number,
) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const unlocked = new Set<AchievementId>();
  if (ownedProperties(state, playerId).length > 0) unlocked.add("first-deed");
  if ((player?.gameStats?.auctionsWon ?? 0) > 0) unlocked.add("auction-icon");
  if ((player?.gameStats?.tradesCompleted ?? 0) > 0) unlocked.add("deal-maker");
  if (castles > 0 || (player?.gameStats?.castlesBuilt ?? 0) > 0) unlocked.add("castle-royalty");
  if (districts > 0) unlocked.add("district-darling");
  if (fortune >= 3000) unlocked.add("high-roller");
  if ((player?.gameStats?.largestFeeCollected ?? 0) >= 150) unlocked.add("big-collector");
  if (state.winnerId === playerId) unlocked.add("avenue-champion");
  return unlocked;
}

export async function recordFinishedProfiles(state: FortuneGameState) {
  if (state.phase !== "finished") return;
  const sessions = await database()
    .prepare(`
      SELECT player_id, profile_id
      FROM fortune_room_sessions
      WHERE room_code = ? AND role = 'player' AND profile_id IS NOT NULL
    `)
    .bind(state.code)
    .all<{ player_id: string; profile_id: string }>();
  for (const session of sessions.results ?? []) {
    const player = state.players.find((candidate) => candidate.id === session.player_id && !candidate.isBot);
    if (!player) continue;
    const fortune = netWorth(state, player.id);
    const recorded = await database()
      .prepare(`
        INSERT OR IGNORE INTO fortune_profile_games (
          room_code, player_id, profile_id, winner, final_fortune, recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(state.code, player.id, session.profile_id, state.winnerId === player.id ? 1 : 0, fortune, new Date().toISOString())
      .run();
    if ((recorded.meta.changes ?? 0) !== 1) continue;

    const row = await profileRow(session.profile_id);
    if (!row) continue;
    const districts = completedDistrictCount(state, player.id);
    const castles = ownedProperties(state, player.id).filter((property) => property.upgrades === 3).length;
    const pawnUsage = safePawnUsage(row.pawn_usage_json);
    pawnUsage[player.pawnSlug] = (pawnUsage[player.pawnSlug] ?? 0) + 1;
    const favoritePawn = Object.entries(pawnUsage)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? player.pawnSlug;
    const achievements = new Set([
      ...safeJsonArray(row.achievements_json),
      ...unlockedAchievements(state, player.id, fortune, districts, castles),
    ]);
    await database()
      .prepare(`
        UPDATE fortune_profiles
        SET games_played = games_played + 1,
            wins = wins + ?,
            biggest_fortune = MAX(biggest_fortune, ?),
            districts_completed = districts_completed + ?,
            castles_built = castles_built + ?,
            favorite_pawn_slug = ?,
            achievements_json = ?,
            pawn_usage_json = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        state.winnerId === player.id ? 1 : 0,
        fortune,
        districts,
        castles,
        favoritePawn,
        JSON.stringify([...achievements]),
        JSON.stringify(pawnUsage),
        new Date().toISOString(),
        row.id,
      )
      .run();
  }
}
