const base = process.env.FORTUNE_AVENUE_URL ?? "http://localhost:3000";

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${payload.error ?? "request failed"}`);
  return payload;
}

const host = await request("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Host", pawnSlug: "fortune-key", theme: "crimson", kind: "friends", maxPlayers: 4, botCount: 1 }),
});
const friend = await request(`/api/rooms/${host.state.code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Friend", pawnSlug: "fortune-penguin" }),
});
const started = await request(`/api/rooms/${host.state.code}/action`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ playerId: host.credentials.playerId, resumeToken: host.credentials.resumeToken, expectedRevision: friend.state.revision, action: { type: "start" } }),
});
const resumed = await request(`/api/rooms/${host.state.code}?playerId=${encodeURIComponent(friend.credentials.playerId)}&token=${encodeURIComponent(friend.credentials.resumeToken)}`);

if (started.state.phase !== "playing" || resumed.you?.playerId !== friend.credentials.playerId) {
  throw new Error("Room start or session resume validation failed.");
}

console.log(JSON.stringify({ code: host.state.code, players: started.state.players.length, phase: started.state.phase, friendResumed: true }));
