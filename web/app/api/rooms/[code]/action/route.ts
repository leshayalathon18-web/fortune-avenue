import { applyRoomAction, runBotTurns } from "@/lib/game-engine";
import { recordFinishedProfiles } from "@/lib/profile-storage";
import type { RoomAction } from "@/lib/game-types";
import { ensureRoomSchema, loadRoom, loadSession, saveRoom } from "@/lib/room-storage";

export const dynamic = "force-dynamic";

const ACTIONS = new Set([
  "start",
  "roll",
  "buy",
  "skip-purchase",
  "start-auction",
  "auction-bid",
  "auction-pass",
  "auction-tick",
  "propose-trade",
  "trade-accept",
  "trade-decline",
  "steal-landmark",
  "resolve-card-choice",
  "upgrade",
  "sell-upgrade",
  "mortgage",
  "unmortgage",
  "settle-debt",
  "declare-bankruptcy",
  "use-card",
  "end-turn",
]);

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    await ensureRoomSchema();
    const { code: rawCode } = await context.params;
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const body = await request.json() as {
      playerId?: string;
      resumeToken?: string;
      expectedRevision?: number;
      action?: RoomAction;
    };
    if (!body.playerId || !body.resumeToken || !body.action || !ACTIONS.has(body.action.type)) {
      return Response.json({ error: "That move was incomplete." }, { status: 400 });
    }
    const session = await loadSession(code, body.playerId, body.resumeToken);
    if (!session) {
      return Response.json({ error: "Your seat could not be verified. Rejoin the room." }, { status: 401 });
    }
    if (session.role === "spectator") {
      return Response.json({ error: "Spectators can watch every move but cannot play a turn." }, { status: 403 });
    }
    const source = await loadRoom(code);
    if (!source) return Response.json({ error: "That room code was not found." }, { status: 404 });
    if (Number.isInteger(body.expectedRevision) && body.expectedRevision !== source.revision) {
      return Response.json({ error: "The room advanced. Refreshing the table.", state: source }, { status: 409 });
    }
    let state = applyRoomAction(source, body.playerId, body.action);
    if (body.action.type !== "auction-tick" || !state.auction) {
      state = runBotTurns(state, { singleAuctionStep: true });
    }
    await saveRoom(state, source.revision);
    if (state.phase === "finished") {
      try {
        await recordFinishedProfiles(state);
      } catch {
        // A profile update never blocks the finished game or its saved room.
      }
    }
    return Response.json({
      state,
      you: { playerId: body.playerId, isHost: state.hostPlayerId === body.playerId },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Avenue could not process that move.";
    const status = message === "ROOM_REVISION_CONFLICT" ? 409 : 400;
    return Response.json({ error: status === 409 ? "The room advanced. Refreshing the table." : message }, { status });
  }
}
