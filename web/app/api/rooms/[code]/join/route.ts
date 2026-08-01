import { addHumanPlayer } from "@/lib/game-engine";
import { PAWNS } from "@/lib/game-data";
import {
  ensureRoomSchema,
  loadRoom,
  randomId,
  randomResumeToken,
  registerSession,
  saveRoom,
} from "@/lib/room-storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    await ensureRoomSchema();
    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const source = await loadRoom(code);
    if (!source) return Response.json({ error: "That room code was not found." }, { status: 404 });
    const body = await request.json() as { name?: string; pawnSlug?: string };
    const playerId = randomId("player");
    const resumeToken = randomResumeToken();
    const pawnSlug = PAWNS.some((pawn) => pawn.slug === body.pawnSlug) ? body.pawnSlug! : PAWNS[8].slug;
    const state = addHumanPlayer(source, playerId, body.name?.trim() || "Friend", pawnSlug);
    await saveRoom(state, source.revision);
    await registerSession(code, playerId, resumeToken);
    return Response.json({
      state,
      credentials: { roomCode: code, playerId, resumeToken },
      you: { playerId, isHost: false },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join the room.";
    const status = message === "ROOM_REVISION_CONFLICT" ? 409 : 400;
    return Response.json({ error: status === 409 ? "Someone joined at the same moment. Please tap join again." : message }, { status });
  }
}
