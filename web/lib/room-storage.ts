import { env } from "cloudflare:workers";
import type { FortuneGameState } from "./game-types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function database() {
  if (!env.DB) throw new Error("Fortune Avenue room storage is unavailable.");
  return env.DB;
}
export async function ensureRoomSchema() {
  const db = database();
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS fortune_rooms (
        code TEXT PRIMARY KEY NOT NULL,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS fortune_room_sessions (
        room_code TEXT NOT NULL,
        player_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (room_code, player_id)
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_fortune_rooms_updated_at
      ON fortune_rooms(updated_at)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_fortune_sessions_last_seen
      ON fortune_room_sessions(last_seen_at)
    `),
  ]);
}

export function randomId(prefix: string, bytes = 9) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  const encoded = Array.from(values, (value) => value.toString(36).padStart(2, "0")).join("");
  return `${prefix}-${encoded}`;
}

export function randomRoomCode() {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]).join("");
}

export function randomResumeToken() {
  const values = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function tokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function loadRoom(code: string) {
  const row = await database()
    .prepare("SELECT state_json, revision FROM fortune_rooms WHERE code = ?")
    .bind(code)
    .first<{ state_json: string; revision: number }>();
  if (!row) return null;
  const state = JSON.parse(row.state_json) as FortuneGameState;
  state.revision = row.revision;
  return state;
}

export async function createRoomRecord(state: FortuneGameState) {
  const timestamp = new Date().toISOString();
  state.createdAt = timestamp;
  state.updatedAt = timestamp;
  state.revision = 0;
  await database()
    .prepare(`
      INSERT INTO fortune_rooms (code, state_json, revision, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
    `)
    .bind(state.code, JSON.stringify(state), timestamp, timestamp)
    .run();
}

export async function saveRoom(state: FortuneGameState, expectedRevision: number) {
  const timestamp = new Date().toISOString();
  const nextRevision = expectedRevision + 1;
  state.revision = nextRevision;
  state.updatedAt = timestamp;
  const result = await database()
    .prepare(`
      UPDATE fortune_rooms
      SET state_json = ?, revision = ?, updated_at = ?
      WHERE code = ? AND revision = ?
    `)
    .bind(JSON.stringify(state), nextRevision, timestamp, state.code, expectedRevision)
    .run();
  if (!result.success || (result.meta.changes ?? 0) !== 1) {
    throw new Error("ROOM_REVISION_CONFLICT");
  }
  return state;
}

export async function registerSession(roomCode: string, playerId: string, token: string) {
  const timestamp = new Date().toISOString();
  await database()
    .prepare(`
      INSERT INTO fortune_room_sessions (room_code, player_id, token_hash, joined_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(roomCode, playerId, await tokenHash(token), timestamp, timestamp)
    .run();
}

export async function verifySession(roomCode: string, playerId: string, token: string) {
  if (!playerId || !token) return false;
  const row = await database()
    .prepare(`
      SELECT token_hash
      FROM fortune_room_sessions
      WHERE room_code = ? AND player_id = ?
    `)
    .bind(roomCode, playerId)
    .first<{ token_hash: string }>();
  if (!row || row.token_hash !== await tokenHash(token)) return false;
  await database()
    .prepare(`
      UPDATE fortune_room_sessions
      SET last_seen_at = ?
      WHERE room_code = ? AND player_id = ?
    `)
    .bind(new Date().toISOString(), roomCode, playerId)
    .run();
  return true;
}
