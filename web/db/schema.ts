import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const fortuneRooms = sqliteTable(
  "fortune_rooms",
  {
    code: text("code").primaryKey(),
    stateJson: text("state_json").notNull(),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_fortune_rooms_updated_at").on(table.updatedAt)],
);

export const fortuneRoomSessions = sqliteTable(
  "fortune_room_sessions",
  {
    roomCode: text("room_code").notNull(),
    playerId: text("player_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    role: text("role").notNull().default("player"),
    profileId: text("profile_id"),
    joinedAt: text("joined_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomCode, table.playerId] }),
    index("idx_fortune_sessions_last_seen").on(table.lastSeenAt),
  ],
);

export const fortuneProfiles = sqliteTable(
  "fortune_profiles",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    displayName: text("display_name").notNull(),
    favoritePawnSlug: text("favorite_pawn_slug").notNull(),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    biggestFortune: integer("biggest_fortune").notNull().default(0),
    districtsCompleted: integer("districts_completed").notNull().default(0),
    castlesBuilt: integer("castles_built").notNull().default(0),
    achievementsJson: text("achievements_json").notNull().default("[]"),
    pawnUsageJson: text("pawn_usage_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const fortuneProfileGames = sqliteTable(
  "fortune_profile_games",
  {
    roomCode: text("room_code").notNull(),
    playerId: text("player_id").notNull(),
    profileId: text("profile_id").notNull(),
    winner: integer("winner").notNull().default(0),
    finalFortune: integer("final_fortune").notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomCode, table.playerId] }),
    index("idx_fortune_profile_games_profile").on(table.profileId),
  ],
);
