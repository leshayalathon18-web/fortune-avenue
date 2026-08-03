"use client";

import type { FormEvent } from "react";
import Image from "next/image";
import { Crown, Dices, Eye, KeyRound, Trophy, UserRound } from "lucide-react";
import { MATCH_MODES, PAWNS } from "@/lib/game-data";
import type { BoardTheme, FortuneGameState, MatchMode, PawnDefinition, PlayerProfile } from "@/lib/game-types";

export type SetupMode = "bots" | "friends" | "join";

export function PawnPortrait({ pawn, label }: { pawn: PawnDefinition; label?: string }) {
  return (
    <span className="pawn-portrait" aria-label={label ?? pawn.name} title={label ?? pawn.name}>
      <span
        className="pawn-portrait-art"
        style={{ backgroundImage: `url(${pawn.image})`, borderColor: pawn.accent }}
      />
    </span>
  );
}

export function GoldParticles() {
  return (
    <div className="gold-particles" aria-hidden="true">
      {Array.from({ length: 24 }, (_, index) => (
        <i
          key={index}
          style={{
            "--particle-x": `${(index * 43) % 101}%`,
            "--particle-delay": `${(index % 8) * -0.7}s`,
            "--particle-duration": `${5 + (index % 6) * 0.8}s`,
            "--particle-size": `${2 + (index % 4)}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function RulesCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="rules-card" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close rules">×</button>
        <div className="rules-kicker">Official digital rules • 2–6 players</div>
        <h2 id="rules-title">How to rule the Avenue</h2>
        <p className="rules-intro">Build an outrageous empire, survive the Avenue’s chaos, and finish with the Fortune Crown. The host chooses the match length before play.</p>
        <div className="rules-grid">
          <article><span className="rule-number">01</span><h3>Shake, roll & roam</h3><p>On mobile, shake and stop to splat the dice onto the board. On desktop, click the dice. Move clockwise and collect the mode’s Grand Entrance bonus.</p></article>
          <article><span className="rule-number">02</span><h3>Claim, auction, or skip</h3><p>Buy an unowned deed, open it to every active bidder, or skip the auction and leave it unclaimed. Visitors pay its entry fee. A complete district doubles base fees.</p></article>
          <article><span className="rule-number">03</span><h3>Crown your district</h3><p>Match the D-number and symbol—not color alone—and own all four landmarks in that set. Add two crowns for rising fees; the third build becomes a castle with the highest fee.</p></article>
          <article><span className="rule-number">04</span><h3>Manage your deeds</h3><p>Mortgage an unimproved deed for half its price. Repay that amount plus 20% to reopen it. Sell crowns and castles back for half their build cost.</p></article>
          <article><span className="rule-number">05</span><h3>Rescue your fortune</h3><p>If a fee empties your vault, the table pauses. Mortgage, sell, or trade until you can settle the balance—or declare bankruptcy.</p></article>
          <article><span className="rule-number">06</span><h3>Take the twist</h3><p>Lucky Break and Plot Twist cards appear for everybody. When a card asks you to choose, tap the exact deed, district, player, or decision you want.</p></article>
          <article><span className="rule-number">07</span><h3>Trade & collect</h3><p>Offer landmarks, cash, or both; the other player or bot can accept or decline. Pull entry-fee cash into your vault. Mortgaged deeds must be reopened before trading.</p></article>
          <article><span className="rule-number">08</span><h3>Leave and return</h3><p>Rooms persist when you reload or leave to share. Rejoin your saved seat, or enter any room as a spectator without taking a player slot.</p></article>
        </div>
        <div className="rules-footer">
          <span>Classic: 180 turns • Party: 90 turns • Grand Finale: richest empire after turn 140.</span>
          <button className="gold-button compact" type="button" onClick={onClose}>Let’s roll</button>
        </div>
      </section>
    </div>
  );
}

export function HomeScreen({
  recentRoom,
  onMode,
  onResume,
  onRules,
  onProfile,
  profile,
}: {
  recentRoom: string | null;
  onMode: (mode: SetupMode) => void;
  onResume: () => void;
  onRules: () => void;
  onProfile: () => void;
  profile: PlayerProfile | null;
}) {
  return (
    <main className="home-screen">
      <GoldParticles />
      <section className="home-cover-card">
        <Image
          src="/og.png?cover=2"
          width={1536}
          height={1024}
          priority
          unoptimized
          alt="Fortune Avenue fantasy board with gold dice, crowned penguin, crowns, and castle"
        />
        <div className="cover-card-glow" />
        <span className="edition-stamp">Playable web edition</span>
      </section>
      <section className="home-menu">
        <span className="home-kicker">Choose your chaos</span>
        <h1>Fortune Avenue</h1>
        <p>Claim ridiculous landmarks, spring custom cards, and chase the Fortune Crown with bots or friends.</p>
        <div className="home-menu-stack">
          {recentRoom && <button className="resume-button" type="button" onClick={onResume}><span>Resume room</span><strong>{recentRoom}</strong></button>}
          <button className="menu-button emerald-action" type="button" onClick={() => onMode("bots")}>
            <span className="menu-button-icon quick-match-icon" aria-hidden="true"><Dices /></span>
            <span><strong>Quick match</strong><small>Play immediately with 1–5 bots</small></span>
          </button>
          <button className="menu-button crimson-action" type="button" onClick={() => onMode("friends")}>
            <span className="menu-button-icon host-friends-icon" aria-hidden="true"><Crown /></span>
            <span><strong>Host friends</strong><small>Make a room, share a six-character code</small></span>
          </button>
          <button className="menu-button dark-action" type="button" onClick={() => onMode("join")}>
            <span className="menu-button-icon join-room-icon" aria-hidden="true"><KeyRound /></span>
            <span><strong>Join a room</strong><small>Enter a friend’s quick code</small></span>
          </button>
          <button className="profile-home-button" type="button" onClick={onProfile}>
            <span className="profile-home-icon" aria-hidden="true">{profile?.wins ? <Trophy /> : <UserRound />}</span>
            <span><strong>{profile ? `${profile.displayName}’s profile` : "Avenue profile"}</strong><small>{profile ? `${profile.wins} wins • ${profile.achievements.length} achievements` : "Track wins, fortunes, castles, and achievements"}</small></span>
          </button>
        </div>
        <button className="text-button" type="button" onClick={onRules}>View the rules card</button>
      </section>
    </main>
  );
}

function PawnPicker({ selected, onSelect }: { selected: string; onSelect: (slug: string) => void }) {
  return (
    <div className="pawn-picker" role="radiogroup" aria-label="Choose a pawn">
      {PAWNS.map((pawn) => (
        <button key={pawn.slug} className={`pawn-choice ${selected === pawn.slug ? "is-selected" : ""}`} type="button" role="radio" aria-checked={selected === pawn.slug} onClick={() => onSelect(pawn.slug)}>
          <PawnPortrait pawn={pawn} /><span>{pawn.name}</span>
        </button>
      ))}
    </div>
  );
}

function NumberPicker({ value, onChange, min = 2, max = 6, label = "Player count" }: { value: number; onChange: (value: number) => void; min?: number; max?: number; label?: string }) {
  return (
    <div className="number-picker" role="radiogroup" aria-label={label}>
      {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((number) => (
        <button key={number} type="button" className={value === number ? "is-selected" : ""} onClick={() => onChange(number)} aria-label={`${number} players`} aria-pressed={value === number}>{number}</button>
      ))}
    </div>
  );
}

export function SetupScreen({
  mode,
  name,
  setName,
  pawnSlug,
  setPawnSlug,
  theme,
  setTheme,
  playerCount,
  setPlayerCount,
  botCount,
  setBotCount,
  matchMode,
  setMatchMode,
  joinAsSpectator,
  setJoinAsSpectator,
  joinCode,
  setJoinCode,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  mode: SetupMode;
  name: string;
  setName: (value: string) => void;
  pawnSlug: string;
  setPawnSlug: (value: string) => void;
  theme: BoardTheme;
  setTheme: (value: BoardTheme) => void;
  playerCount: number;
  setPlayerCount: (value: number) => void;
  botCount: number;
  setBotCount: (value: number) => void;
  matchMode: MatchMode;
  setMatchMode: (value: MatchMode) => void;
  joinAsSpectator: boolean;
  setJoinAsSpectator: (value: boolean) => void;
  joinCode: string;
  setJoinCode: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}) {
  const title = mode === "bots" ? "Quick match" : mode === "friends" ? "Host the Avenue" : "Join your friends";
  const subtitle = mode === "bots" ? "Pick the crowd. The bots are clever, dramatic, and ready now." : mode === "friends" ? "Create a persistent room and send one easy code." : "Enter the six-character room code from your invite.";
  return (
    <main className={`setup-screen theme-${theme}`}>
      <GoldParticles />
      <form className="setup-card" onSubmit={onSubmit}>
        <button className="back-button" type="button" onClick={onBack}>← Back</button>
        <span className="setup-kicker">Fortune Avenue</span><h1>{title}</h1><p>{subtitle}</p>
        {mode === "join" && (
          <>
            <label className="field-label room-code-field"><span>Room code</span><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABC234" autoComplete="off" maxLength={6} required /></label>
            <div><span className="field-heading">How are you joining?</span><div className="join-role-picker">
              <button type="button" className={!joinAsSpectator ? "is-selected" : ""} onClick={() => setJoinAsSpectator(false)}><KeyRound /><span><strong>Take a seat</strong><small>Join as a player</small></span></button>
              <button type="button" className={joinAsSpectator ? "is-selected" : ""} onClick={() => setJoinAsSpectator(true)}><Eye /><span><strong>Watch live</strong><small>No player slot needed</small></span></button>
            </div></div>
          </>
        )}
        {!(mode === "join" && joinAsSpectator) && <label className="field-label"><span>Your display name</span><input value={name} onChange={(event) => setName(event.target.value.slice(0, 24))} placeholder="Avenue legend" required /></label>}
        {mode !== "join" && (
          <div className="setup-row">
            <div><span className="field-heading">Total players</span><NumberPicker value={playerCount} onChange={(value) => { setPlayerCount(value); if (botCount > value - 1) setBotCount(value - 1); }} /></div>
            {mode === "friends" && <div><span className="field-heading">Bots at launch</span><NumberPicker value={botCount} min={0} max={playerCount - 1} label="Bot count" onChange={setBotCount} /></div>}
          </div>
        )}
        {mode !== "join" && (
          <div><span className="field-heading">Match style</span><div className="match-mode-picker">
            {(Object.keys(MATCH_MODES) as MatchMode[]).map((value) => {
              const option = MATCH_MODES[value];
              return <button type="button" key={value} className={matchMode === value ? "is-selected" : ""} onClick={() => setMatchMode(value)}><span>{option.shortName}</span><strong>{option.name}</strong><small>{option.description}</small></button>;
            })}
          </div></div>
        )}
        {mode !== "join" && (
          <div><span className="field-heading">Board mood</span><div className="theme-picker">
            <button type="button" className={`theme-choice emerald ${theme === "emerald" ? "is-selected" : ""}`} onClick={() => setTheme("emerald")}><i /> Emerald after dark</button>
            <button type="button" className={`theme-choice crimson ${theme === "crimson" ? "is-selected" : ""}`} onClick={() => setTheme("crimson")}><i /> Crimson fantasy</button>
          </div></div>
        )}
        {!(mode === "join" && joinAsSpectator) && <div><span className="field-heading">Choose your resin pawn</span><PawnPicker selected={pawnSlug} onSelect={setPawnSlug} /></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="gold-button setup-submit" type="submit" disabled={busy || (mode === "join" && joinCode.length !== 6)}>{busy ? "Opening the gates…" : mode === "bots" ? `Start ${playerCount}-player ${MATCH_MODES[matchMode].shortName.toLowerCase()} match` : mode === "friends" ? "Create friend room" : joinAsSpectator ? "Enter viewing gallery" : "Take my seat"}</button>
      </form>
    </main>
  );
}

export function LobbyScreen({ state, you, onShare, onStart, onRules, busy }: { state: FortuneGameState; you: { playerId: string; isHost: boolean }; onShare: () => void; onStart: () => void; onRules: () => void; busy: boolean }) {
  const openSeats = Math.max(0, state.maxPlayers - state.players.length);
  return (
    <main className={`lobby-screen theme-${state.theme}`}>
      <GoldParticles />
      <section className="lobby-card">
        <div className="lobby-header"><div><span className="setup-kicker">Persistent friend room • {MATCH_MODES[state.settings.matchMode].name}</span><h1>The doors are open</h1><p>Leave this page to send the invite if you need to. Your room and seat will still be here when you return.</p></div><button className="glass-button compact" type="button" onClick={onRules}>Rules</button></div>
        <div className="room-code-panel"><span>Quick code</span><strong>{state.code}</strong><button className="gold-button compact" type="button" onClick={onShare}>Send invite</button></div>
        <div className="seat-grid">
          {state.players.map((player, index) => {
            const pawn = PAWNS.find((candidate) => candidate.slug === player.pawnSlug) ?? PAWNS[0];
            return <article className={`seat-card ${player.id === you.playerId ? "is-you" : ""}`} key={player.id}><span className="seat-number">Seat {index + 1}</span><PawnPortrait pawn={pawn} /><strong>{player.name}</strong><small>{player.isBot ? "Bot player" : player.id === state.hostPlayerId ? "Room host" : "Ready"}</small></article>;
          })}
          {Array.from({ length: openSeats }, (_, index) => <article className="seat-card open-seat" key={`open-${index}`}><span className="seat-number">Seat {state.players.length + index + 1}</span><span className="open-seat-pulse" /><strong>Waiting for a friend</strong><small>Share {state.code}</small></article>)}
        </div>
        <div className="lobby-footer"><span>{state.players.length}/{state.maxPlayers} seats • {state.players.filter((player) => player.isBot).length} bots</span>{you.isHost ? <button className="gold-button" type="button" onClick={onStart} disabled={busy || state.players.length < 2}>{state.players.length < 2 ? "Waiting for one more player" : busy ? "Starting…" : "Start the game"}</button> : <div className="waiting-host"><i /> Waiting for the host to start</div>}</div>
      </section>
    </main>
  );
}

export function LoadingScreen() {
  return <main className="loading-screen"><GoldParticles /><div className="loading-pawns">{PAWNS.slice(0, 5).map((pawn, index) => <span key={pawn.slug} style={{ animationDelay: `${index * 0.12}s` }}><PawnPortrait pawn={pawn} /></span>)}</div><strong>Reopening your Avenue…</strong></main>;
}
