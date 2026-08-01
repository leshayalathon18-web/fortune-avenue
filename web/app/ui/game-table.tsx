"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { DISTRICTS, GAME_TAGLINE, PAWNS, SPACE_BY_INDEX, SPACES } from "@/lib/game-data";
import { currentPlayer, netWorth, ownedProperties, propertyRent } from "@/lib/game-engine";
import type { FortuneGameState, GameEvent, RoomAction, SpaceDefinition } from "@/lib/game-types";
import { GoldParticles, PawnPortrait } from "./shared";

function money(value: number) {
  return `F${Math.max(0, Math.round(value)).toLocaleString()}`;
}

function pawnBySlug(slug: string) {
  return PAWNS.find((pawn) => pawn.slug === slug) ?? PAWNS[0];
}

function boardPosition(index: number) {
  if (index <= 10) return { gridRow: 11, gridColumn: 11 - index };
  if (index <= 20) return { gridRow: 21 - index, gridColumn: 1 };
  if (index <= 30) return { gridRow: 1, gridColumn: index - 19 };
  return { gridRow: index - 29, gridColumn: 11 };
}

function DiceFace({ value, rolling }: { value: number; rolling: boolean }) {
  const pipMap: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <span className={`dice-face ${rolling ? "is-rolling" : ""}`} aria-label={`Die showing ${value}`}>{Array.from({ length: 9 }, (_, index) => <span key={index} className={pipMap[value]?.includes(index) ? "pip is-visible" : "pip"} />)}</span>;
}

function SpaceTile({ space, state, onSelect }: { space: SpaceDefinition; state: FortuneGameState; onSelect: (space: SpaceDefinition) => void }) {
  const property = state.properties[String(space.index)];
  const owner = property ? state.players.find((player) => player.id === property.ownerId) ?? null : null;
  const players = state.players.filter((player) => !player.bankrupt && player.position === space.index);
  return (
    <button
      className={`board-space space-${space.kind} ${owner ? "is-owned" : ""}`}
      style={{ ...boardPosition(space.index), "--district-color": space.districtColor, "--owner-color": owner?.color ?? "transparent" } as CSSProperties}
      type="button"
      title={`${space.name}${space.price ? ` • ${money(space.price)}` : ""}`}
      onClick={() => onSelect(space)}
    >
      <span className="space-number">{space.index}</span>
      <span className="space-art" style={{ backgroundImage: `url(${space.asset})` }} />
      <span className="space-name">{space.name}</span>
      {property && property.upgrades > 0 && <span className="upgrade-pips" aria-label={`${property.upgrades} upgrades`}>{Array.from({ length: property.upgrades }, (_, index) => <i key={index} />)}</span>}
      {players.length > 0 && (
        <span className="space-tokens">{players.map((player, index) => <span key={player.id} className="board-token" title={player.name} style={{ zIndex: index + 1, borderColor: player.color, backgroundImage: `url(${pawnBySlug(player.pawnSlug).image})` }} />)}</span>
      )}
    </button>
  );
}

function BoardCenter({ state, you, onAction, busy }: { state: FortuneGameState; you: { playerId: string; isHost: boolean }; onAction: (action: RoomAction) => void; busy: boolean }) {
  const active = currentPlayer(state);
  const isYourTurn = active?.id === you.playerId;
  const pendingSpace = state.pendingPurchase === null ? null : SPACE_BY_INDEX.get(state.pendingPurchase);
  const youPlayer = state.players.find((player) => player.id === you.playerId);
  const luckyCoin = youPlayer?.heldCards.find((card) => card.title === "Lucky Coin");
  return (
    <section className="board-center">
      <div className="board-center-brand"><span>Fortune</span><span>Avenue</span><small>{GAME_TAGLINE}</small></div>
      <div className="deck-pile lucky-pile" aria-label="Lucky Break deck"><i /><span>Lucky<br />Break</span></div>
      <div className="deck-pile plot-pile" aria-label="Plot Twist deck"><i /><span>Plot<br />Twist</span></div>
      <div className={`turn-console ${isYourTurn ? "is-yours" : ""}`}>
        <span className="turn-label">{state.phase === "finished" ? "Final fortune" : isYourTurn ? "Your turn" : `${active?.name ?? "Avenue"}'s turn`}</span>
        {active && <div className="turn-player"><PawnPortrait pawn={pawnBySlug(active.pawnSlug)} /><div><strong>{active.name}</strong><small>Round {state.roundNumber} • Turn {state.turnNumber}</small></div></div>}
        <div className="dice-tray"><DiceFace value={state.dice?.[0] ?? 1} rolling={busy} /><DiceFace value={state.dice?.[1] ?? 6} rolling={busy} /></div>
        {state.phase === "finished" ? <div className="winner-mini">The Avenue has chosen.</div> : isYourTurn ? (
          <div className="turn-actions">
            {!state.rolled && luckyCoin && <button className="mini-action lucky-action" type="button" disabled={busy} onClick={() => onAction({ type: "use-card", cardId: luckyCoin.id })}>Use Lucky Coin</button>}
            {!state.rolled && <button className="roll-button" type="button" disabled={busy} onClick={() => onAction({ type: "roll" })}><span className="roll-dice-icon"><i /><i /><i /></span>{busy ? "Rolling…" : "Roll dice"}</button>}
            {pendingSpace && <div className="purchase-prompt"><strong>{pendingSpace.name}</strong><span>Claim for {money(Math.max(0, pendingSpace.price - (youPlayer?.purchaseDiscount ?? 0)))}</span><div><button type="button" className="mini-action buy-action" disabled={busy} onClick={() => onAction({ type: "buy" })}>Buy deed</button><button type="button" className="mini-action" disabled={busy} onClick={() => onAction({ type: "skip-purchase" })}>Pass</button></div></div>}
            {state.rolled && !pendingSpace && <button className="end-turn-button" type="button" disabled={busy} onClick={() => onAction({ type: "end-turn" })}>End turn</button>}
          </div>
        ) : <div className="waiting-turn"><i /> The table will update automatically</div>}
      </div>
    </section>
  );
}

function PlayerRail({ state, youId }: { state: FortuneGameState; youId: string }) {
  const active = currentPlayer(state);
  return (
    <section className="player-rail" aria-label="Players">
      {state.players.map((player) => {
        const deeds = ownedProperties(state, player.id).length;
        return <article key={player.id} className={`player-chip ${active?.id === player.id ? "is-active" : ""} ${player.id === youId ? "is-you" : ""} ${player.bankrupt ? "is-bankrupt" : ""}`} style={{ "--player-color": player.color } as CSSProperties}><PawnPortrait pawn={pawnBySlug(player.pawnSlug)} /><div className="player-chip-main"><span><strong>{player.name}</strong>{player.id === youId && <em>You</em>}{player.isBot && <em>Bot</em>}</span><small>{player.bankrupt ? "Bankrupt" : `${deeds} deeds • ${money(netWorth(state, player.id))} worth`}</small></div><b>{money(player.cash)}</b></article>;
      })}
    </section>
  );
}

function DeedPanel({ state, playerId, onUpgrade, busy }: { state: FortuneGameState; playerId: string; onUpgrade: (spaceIndex: number) => void; busy: boolean }) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const deeds = ownedProperties(state, playerId).flatMap((property) => {
    const space = SPACE_BY_INDEX.get(property.spaceIndex);
    return space ? [{ property, space }] : [];
  });
  return (
    <section className="deed-panel">
      <div className="panel-heading"><span>Your portfolio</span><b>{deeds.length} deeds</b></div>
      {deeds.length === 0 ? <div className="empty-deeds">Your first ridiculous landmark is still waiting.</div> : (
        <div className="deed-list">{deeds.map(({ property, space }) => {
          const cost = Math.max(0, space.upgradeCost - (player?.upgradeDiscount ?? 0));
          const canUpgrade = space.kind === "landmark" && property.upgrades < 3 && (player?.cash ?? 0) >= cost;
          return <article className="deed-row" key={space.index} style={{ "--district-color": space.districtColor } as CSSProperties}><span className="deed-art" style={{ backgroundImage: `url(${space.asset})` }} /><div><strong>{space.name}</strong><small>{property.upgrades}/3 upgrades • fee {money(propertyRent(state, property, 7))}</small></div>{space.kind === "landmark" && property.upgrades < 3 && <button type="button" disabled={busy || !canUpgrade || currentPlayer(state)?.id !== playerId} onClick={() => onUpgrade(space.index)}>+{money(cost)}</button>}</article>;
        })}</div>
      )}
    </section>
  );
}

function EventLog({ state }: { state: FortuneGameState }) {
  return <section className="event-log"><div className="panel-heading"><span>Avenue feed</span><b>Live</b></div><div className="event-scroll">{state.log.slice(0, 12).map((event) => <article key={event.id} className={`event-row event-${event.type}`}><i /><div><strong>{event.title}</strong><p>{event.message}</p></div></article>)}</div></section>;
}

function SpaceInspector({ space, state, onClose }: { space: SpaceDefinition; state: FortuneGameState; onClose: () => void }) {
  const property = state.properties[String(space.index)];
  const owner = property ? state.players.find((player) => player.id === property.ownerId) : null;
  return (
    <div className="modal-backdrop inspector-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="space-inspector" role="dialog" aria-modal="true" aria-labelledby="space-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close landmark details">×</button><div className="inspector-art" style={{ backgroundImage: `url(${space.asset})` }} /><div className="inspector-copy"><span className="inspector-kicker">Space {space.index} • {space.districtName ?? space.kind}</span><h2 id="space-title">{space.name}</h2>
          {space.price > 0 ? <div className="inspector-stats"><span><small>Deed</small><strong>{money(space.price)}</strong></span><span><small>Base fee</small><strong>{space.kind === "service" ? "Dice based" : money(space.baseRent)}</strong></span><span><small>Owner</small><strong>{owner?.name ?? "Available"}</strong></span><span><small>Upgrades</small><strong>{property?.upgrades ?? 0}/3</strong></span></div> : <p className="inspector-effect">{space.kind === "lucky" ? "Draw a Lucky Break and let fortune show off." : space.kind === "plot" ? "Draw a Plot Twist and brace for nonsense." : space.index === 20 ? "Pay F60 in mysterious municipal fees." : space.index === 30 ? "Collect F90 from the festival crowd." : space.index === 10 ? "Usually just visiting—unless a card strands you here." : "Collect F200 whenever you pass this gold marquee."}</p>}
          {space.district !== null && <span className="district-tag" style={{ backgroundColor: space.districtColor }}>{DISTRICTS[space.district]}</span>}
        </div>
      </section>
    </div>
  );
}

export function CardReveal({ event, onClose }: { event: GameEvent; onClose: () => void }) {
  if (!event.card) return null;
  return <div className={`modal-backdrop card-backdrop deck-${event.card.deck}`} role="presentation" onMouseDown={onClose}><section className="card-reveal" role="dialog" aria-modal="true" aria-label={`${event.card.title} card`} onMouseDown={(click) => click.stopPropagation()}><div className="card-aura" /><Image src={event.card.image} width={432} height={600} alt={`${event.card.title}: ${event.card.effect}`} /><div className="card-reveal-copy"><span>{event.card.deck === "lucky-break" ? "Lucky Break" : "Plot Twist"}</span><h2>{event.card.title}</h2><p>{event.message}</p><button className="gold-button compact" type="button" onClick={onClose}>Keep rolling</button></div></section></div>;
}

function WinnerReveal({ state, onRules }: { state: FortuneGameState; onRules: () => void }) {
  const winner = state.players.find((player) => player.id === state.winnerId);
  if (!winner) return null;
  return <div className="winner-overlay"><GoldParticles /><section className="winner-card"><span className="winner-crown">♛</span><span className="setup-kicker">Fortune crowned</span><PawnPortrait pawn={pawnBySlug(winner.pawnSlug)} label={`${winner.name}'s winning pawn`} /><h2>{winner.name}</h2><p>{money(netWorth(state, winner.id))} net worth • {ownedProperties(state, winner.id).length} deeds</p><div className="winner-actions"><button className="glass-button compact" type="button" onClick={onRules}>Review rules</button><button className="gold-button compact" type="button" onClick={() => window.location.assign(window.location.pathname)}>New game</button></div></section></div>;
}

export function GameScreen({ state, you, onAction, onShare, onRules, onHome, busy, muted, onToggleMuted, selectedSpace, setSelectedSpace }: { state: FortuneGameState; you: { playerId: string; isHost: boolean }; onAction: (action: RoomAction) => void; onShare: () => void; onRules: () => void; onHome: () => void; busy: boolean; muted: boolean; onToggleMuted: () => void; selectedSpace: SpaceDefinition | null; setSelectedSpace: (space: SpaceDefinition | null) => void }) {
  return (
    <main className={`game-screen theme-${state.theme}`}>
      <header className="game-topbar"><button className="mini-logo" type="button" onClick={onHome} aria-label="Return to menu"><span>F</span> Fortune Avenue</button><div className="topbar-room"><span>Room</span><strong>{state.code}</strong><i>{state.kind === "friends" ? "Friends" : "Bot match"}</i></div><div className="topbar-actions"><button type="button" onClick={onToggleMuted}>{muted ? "Sound off" : "Sound on"}</button><button type="button" onClick={onRules}>Rules</button><button className="invite-topbar" type="button" onClick={onShare}>Invite</button></div></header>
      <PlayerRail state={state} youId={you.playerId} />
      <div className="game-layout"><section className="board-shell"><div className="board-glow" /><div className="game-board" aria-label="Fortune Avenue game board">{SPACES.map((space) => <SpaceTile key={space.index} space={space} state={state} onSelect={setSelectedSpace} />)}<BoardCenter state={state} you={you} onAction={onAction} busy={busy} /></div></section><aside className="game-sidebar"><DeedPanel state={state} playerId={you.playerId} onUpgrade={(spaceIndex) => onAction({ type: "upgrade", spaceIndex })} busy={busy} /><EventLog state={state} /></aside></div>
      {selectedSpace && <SpaceInspector space={selectedSpace} state={state} onClose={() => setSelectedSpace(null)} />}
      {state.phase === "finished" && <WinnerReveal state={state} onRules={onRules} />}
    </main>
  );
}
