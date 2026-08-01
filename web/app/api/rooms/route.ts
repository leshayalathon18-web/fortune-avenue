import { createLobbyState, runBotTurns, startGame } from "@/lib/game-engine";
import { PAWNS } from "@/lib/game-data";
import type { BoardTheme, RoomKind } from "@/lib/game-types";
import {
  createRoomRecord,
  ensureRoomSchema,
  loadRoom,
  randomId,
  randomResumeToken,
  randomRoomCode,
  registerSession,
} from "@/lib/room-storage";

export const dynamic = "force-dynamic";

function integer(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}
export async function POST(request: Request) {
  try {
    await ensureRoomSchema();
    const body = await request.json() as {
      name?: string;
      pawnSlug?: string;
      theme?: BoardTheme;
      kind?: RoomKind;
      maxPlayers?: number;
      botCount?: number;
    };
    const name = body.name?.trim().slice(0, 24) || "Player One";
    const pawnSlug = PAWNS.some((pawn) => pawn.slug === body.pawnSlug) ? body.pawnSlug! : PAWNS[8].slug;
    const theme: BoardTheme = body.theme === "crimson" ? "crimson" : "emerald";
    const kind: RoomKind = body.kind === "friends" ? "friends" : "bots";
    const maxPlayers = Math.min(6, Math.max(2, integer(body.maxPlayers, 4)));
    const botCount = kind === "bots"
      ? maxPlayers - 1
      : Math.min(maxPlayers - 1, Math.max(0, integer(body.botCount, 0)));
    const hostPlayerId = randomId("player");
    const resumeToken = randomResumeToken();
    let state = null;

    for (let attempt = 0; attempt < 8 && !state; attempt += 1) {
      const code = randomRoomCode();
      if (await loadRoom(code)) continue;
      const candidate = createLobbyState({
        code,
        kind,
        theme,
        maxPlayers,
        hostPlayerId,
        hostName: name,
        pawnSlug,
        botCount,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      });
      state = kind === "bots" ? runBotTurns(startGame(candidate)) : candidate;
      await createRoomRecord(state);
    }

    if (!state) return Response.json({ error: "Could not find an open room code. Try again." }, { status: 503 });
    await registerSession(state.code, hostPlayerId, resumeToken);
    return Response.json({
      state,
      credentials: { roomCode: state.code, playerId: hostPlayerId, resumeToken },
      you: { playerId: hostPlayerId, isHost: true },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the room.";
    return Response.json({ error: message }, { status: 500 });
  }
}
