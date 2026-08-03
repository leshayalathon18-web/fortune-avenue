import { ensureRoomSchema, loadRoom, loadSession } from "@/lib/room-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    await ensureRoomSchema();
    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const state = await loadRoom(code);
    if (!state) return Response.json({ error: "That room code was not found." }, { status: 404 });
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    const session = await loadSession(code, playerId, token);
    return Response.json({
      state,
      you: session ? {
        playerId,
        isHost: session.role === "player" && state.hostPlayerId === playerId,
        isSpectator: session.role === "spectator",
      } : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open the room.";
    return Response.json({ error: message }, { status: 500 });
  }
}
