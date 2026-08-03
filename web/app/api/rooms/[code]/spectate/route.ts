import {
  ensureRoomSchema,
  loadRoom,
  randomId,
  randomResumeToken,
  registerSession,
} from "@/lib/room-storage";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    await ensureRoomSchema();
    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const state = await loadRoom(code);
    if (!state) return Response.json({ error: "That room code was not found." }, { status: 404 });
    const playerId = randomId("spectator");
    const resumeToken = randomResumeToken();
    await registerSession(code, playerId, resumeToken, "spectator", null);
    return Response.json({
      state,
      credentials: { roomCode: code, playerId, resumeToken, role: "spectator" },
      you: { playerId, isHost: false, isSpectator: true },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The viewing gallery could not open.";
    return Response.json({ error: message }, { status: 500 });
  }
}
