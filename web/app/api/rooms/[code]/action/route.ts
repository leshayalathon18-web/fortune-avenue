import { applyRoomAction, runBotTurns } from "@/lib/game-engine";
import type { RoomAction } from "@/lib/game-types";
import { ensureRoomSchema, loadRoom, saveRoom, verifySession } from "@/lib/room-storage";

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
    if (!await verifySession(code, body.playerId, body.resumeToken)) {
      return Response.json({ error: "Your seat could not be verified. Rejoin the room." }, { status: 401 });
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
