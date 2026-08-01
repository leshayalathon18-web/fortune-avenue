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
    joinedAt: text("joined_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomCode, table.playerId] }),
    index("idx_fortune_sessions_last_seen").on(table.lastSeenAt),
  ],
);
