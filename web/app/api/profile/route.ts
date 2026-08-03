import { PAWNS } from "@/lib/game-data";
import { createProfile, updateProfileIdentity } from "@/lib/profile-storage";
import type { ProfileCredentials } from "@/lib/game-types";
import { ensureRoomSchema } from "@/lib/room-storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureRoomSchema();
    const body = await request.json() as {
      credentials?: ProfileCredentials | null;
      displayName?: string;
      pawnSlug?: string;
    };
    const displayName = body.displayName?.trim().slice(0, 24) || "Avenue Legend";
    const pawnSlug = PAWNS.some((pawn) => pawn.slug === body.pawnSlug) ? body.pawnSlug! : PAWNS[8].slug;
    if (body.credentials?.profileId && body.credentials.profileToken) {
      const profile = await updateProfileIdentity(body.credentials, displayName, pawnSlug);
      if (profile) {
        return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    const created = await createProfile(displayName, pawnSlug);
    return Response.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Avenue could not open that profile.";
    return Response.json({ error: message }, { status: 500 });
  }
}
