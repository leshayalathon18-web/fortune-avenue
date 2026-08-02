"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { Castle, Crown } from "lucide-react";
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

function ownsFullDistrict(state: FortuneGameState, playerId: string, district: number | null) {
  if (district === null) return false;
  const districtSpaces = SPACES.filter((space) => space.district === district);
  return districtSpaces.length > 0
    && districtSpaces.every((space) => state.properties[String(space.index)]?.ownerId === playerId);
}

function boardPosition(index: number) {
  if (index <= 10) return { gridRow: 11, gridColumn: 11 - index };
  if (index <= 20) return { gridRow: 21 - index, gridColumn: 1 };
  if (index <= 30) return { gridRow: 1, gridColumn: index - 19 };
  return { gridRow: index - 29, gridColumn: 11 };
}

export const PAWN_STEP_MS = 300;

const BOARD_LABELS: Record<number, string[]> = {
  0: ["Grand", "Entrance"],
  1: ["Sheboygan", "Wisconsin"],
  2: ["Bicth", "Valley"],
  3: ["Lucky", "Break"],
  4: ["Red", "Hill"],
  5: ["Hotel", "Diablo"],
  6: ["Midnight", "Express"],
  7: ["Pepper", "Springs"],
  8: ["Dab", "Valley"],
  9: ["Plot", "Twist"],
  10: ["Wrong", "Turn"],
  11: ["Lost", "Exit"],
  12: ["Golden", "Dumpster"],
  13: ["Lucky", "Break"],
  14: ["Haunted", "Drive-Thru"],
  15: ["Bottomless", "Brunch"],
  16: ["Power", "& Light"],
  17: ["Moonlight", "Motel"],
  18: ["Neon", "Graveyard"],
  19: ["Plot", "Twist"],
  20: ["City", "Hall"],
  21: ["Velvet", "Volcano"],
  22: ["Questionable", "Casino"],
  23: ["Lucky", "Break"],
  24: ["Crooked", "Crown"],
  25: ["Fountain", "of Bad", "Decisions"],
  26: ["Scenic", "Detour"],
  27: ["Midnight", "Mall"],
  28: ["Forbidden", "Food Court"],
  29: ["Plot", "Twist"],
  30: ["Street", "Festival"],
  31: ["Million-Dollar", "Laundromat"],
  32: ["Area 52", "Gift Shop"],
  33: ["Lucky", "Break"],
  34: ["Castle", "After Dark"],
  35: ["Red Carpet", "Crypt"],
  36: ["Avenue", "Waterworks"],
  37: ["Last Gas", "Station"],
  38: ["Grand", "Finale"],
  39: ["Plot", "Twist"],
};

function DiceFace({ value, rolling }: { value: number; rolling: boolean }) {
  const pipMap: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <span className={`dice-face ${rolling ? "is-rolling" : ""}`} aria-label={`Die showing ${value}`}>{Array.from({ length: 9 }, (_, index) => <span key={index} className={pipMap[value]?.includes(index) ? "pip is-visible" : "pip"} />)}</span>;
}

function SpaceTile({
  space,
  state,
  displayPositions,
  movingPlayerId,
  onSelect,
}: {
  space: SpaceDefinition;
  state: FortuneGameState;
  displayPositions: Record<string, number>;
  movingPlayerId: string | null;
  onSelect: (space: SpaceDefinition) => void;
}) {
  const property = state.properties[String(space.index)];
  const owner = property ? state.players.find((player) => player.id === property.ownerId) ?? null : null;
  const players = state.players.filter(
    (player) => !player.bankrupt && (displayPositions[player.id] ?? player.position) === space.index,
  );
  const labelLines = BOARD_LABELS[space.index] ?? [space.name];
  const longestLine = Math.max(...labelLines.map((line) => line.length));
  return (
    <button
      className={`board-space space-${space.kind} ${owner ? "is-owned" : ""} ${players.some((player) => player.id === movingPlayerId) ? "has-moving-token" : ""}`}
      style={{ ...boardPosition(space.index), "--district-color": space.districtColor, "--owner-color": owner?.color ?? "transparent" } as CSSProperties}
      type="button"
      title={`${space.name}${space.price ? ` - ${money(space.price)}` : ""}`}
      aria-label={`${space.name}${space.price ? `, deed ${money(space.price)}` : ""}`}
      onClick={() => onSelect(space)}
    >
      <span className="space-number">{space.index}</span>
      <span className="space-art" style={{ backgroundImage: `url(${space.asset})` }} />
      <span className={`space-name ${longestLine >= 10 ? "is-tight" : ""}`} aria-hidden="true">
        {labelLines.map((line) => <span key={line}>{line}</span>)}
      </span>
      {property && property.upgrades > 0 && (
        <span className={`upgrade-pips ${property.upgrades === 3 ? "has-castle" : ""}`} aria-label={property.upgrades === 3 ? "Castle" : `${property.upgrades} crowns`}>
          {property.upgrades === 3
            ? <Castle aria-hidden="true" />
            : Array.from({ length: property.upgrades }, (_, index) => <Crown key={index} aria-hidden="true" />)}
        </span>
      )}
      {players.length > 0 && (
        <span className="space-tokens">{players.map((player, index) => <span key={player.id} className={`board-token ${player.id === movingPlayerId ? "is-moving" : ""}`} title={player.name} style={{ zIndex: index + 1, borderColor: player.color, backgroundImage: `url(${pawnBySlug(player.pawnSlug).image})` }} />)}</span>
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
            {pendingSpace && <div className="purchase-prompt"><strong>{pendingSpace.name}</strong><span>Claim for {money(Math.max(0, pendingSpace.price - (youPlayer?.purchaseDiscount ?? 0)))}</span><div><button type="button" className="mini-action buy-action" disabled={busy} onClick={() => onAction({ type: "buy" })}>Buy deed</button><button type="button" className="mini-action auction-action" disabled={busy} onClick={() => onAction({ type: "start-auction" })}>Auction</button></div></div>}
            {state.rolled && !pendingSpace && !state.auction && <button className="end-turn-button" type="button" disabled={busy} onClick={() => onAction({ type: "end-turn" })}>End turn</button>}
          </div>
        ) : <div className="waiting-turn"><i /> The table will update automatically</div>}
      </div>
    </section>
  );
}

function AuctionHouse({
  state,
  you,
  onAction,
  busy,
}: {
  state: FortuneGameState;
  you: { playerId: string; isHost: boolean };
  onAction: (action: RoomAction) => void;
  busy: boolean;
}) {
  const auction = state.auction;
  if (!auction) return null;
  const space = SPACE_BY_INDEX.get(auction.spaceIndex);
  const bidder = state.players.find((player) => player.id === auction.currentBidderId);
  const leader = state.players.find((player) => player.id === auction.highBidderId);
  const youPlayer = state.players.find((player) => player.id === you.playerId);
  const isYourBid = bidder?.id === you.playerId;
  const minimum = auction.currentBid + auction.minimumIncrement;
  const bids = [...new Set([minimum, minimum + 40, minimum + 90])]
    .filter((amount) => amount <= (youPlayer?.cash ?? 0));
  return (
    <div className="auction-backdrop" role="presentation">
      <section className="auction-house" role="dialog" aria-modal="true" aria-labelledby="auction-title">
        <div className="auction-art" style={{ backgroundImage: `url(${space?.asset ?? ""})` }}>
          <span>Live on the Avenue</span>
          <i className="auction-gavel" aria-hidden="true"><b /><b /></i>
        </div>
        <div className="auction-copy">
          <span className="auction-kicker">Deed auction</span>
          <h2 id="auction-title">{space?.name ?? "Mystery deed"}</h2>
          <div className="auction-price"><small>Current bid</small><strong>{auction.currentBid > 0 ? money(auction.currentBid) : "Opening at F10"}</strong><span>{leader ? `${leader.name} is leading` : "No bids yet"}</span></div>
          <div className="auction-bidders" aria-label="Active bidders">
            {state.players.filter((player) => auction.eligibleBidderIds.includes(player.id)).map((player) => (
              <span key={player.id} className={`${player.id === auction.currentBidderId ? "is-up" : ""} ${player.id === auction.highBidderId ? "is-leading" : ""}`}>
                <PawnPortrait pawn={pawnBySlug(player.pawnSlug)} />
                <b>{player.name}</b>
              </span>
            ))}
          </div>
          {isYourBid ? (
            <div className="auction-controls">
              <p>Your call. Raise the paddle or fold for good.</p>
              <div>{bids.map((amount) => <button key={amount} className="auction-bid-button" type="button" disabled={busy} onClick={() => onAction({ type: "auction-bid", amount })}>Bid {money(amount)}</button>)}</div>
              <button className="auction-fold-button" type="button" disabled={busy} onClick={() => onAction({ type: "auction-pass" })}>Fold</button>
            </div>
          ) : (
            <div className="auction-waiting"><i /> {bidder?.name ?? "The auctioneer"} is choosing a bid...</div>
          )}
        </div>
      </section>
    </div>
  );
}

export function CashCollection({
  event,
  state,
  onCollect,
}: {
  event: GameEvent;
  state: FortuneGameState;
  onCollect: () => void;
}) {
  const transfer = event.moneyTransfer;
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const startY = useRef(0);
  const collectTimer = useRef<number | null>(null);
  const payer = state.players.find((player) => player.id === transfer?.fromPlayerId);
  const space = event.spaceIndex === undefined ? null : SPACE_BY_INDEX.get(event.spaceIndex);

  useEffect(() => () => {
    if (collectTimer.current !== null) window.clearTimeout(collectTimer.current);
  }, []);

  if (!transfer) return null;

  const collect = () => {
    if (collecting) return;
    setCollecting(true);
    setDragY(190);
    collectTimer.current = window.setTimeout(onCollect, 460);
  };
  const onPointerDown = (pointer: ReactPointerEvent<HTMLDivElement>) => {
    if (collecting) return;
    startY.current = pointer.clientY - dragY;
    setDragging(true);
    pointer.currentTarget.setPointerCapture(pointer.pointerId);
  };
  const onPointerMove = (pointer: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || collecting) return;
    setDragY(Math.min(190, Math.max(0, pointer.clientY - startY.current)));
  };
  const finishDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragY >= 92) collect();
    else setDragY(0);
  };

  return (
    <div className="cash-collection-backdrop">
      <section className={`cash-collection ${collecting ? "is-collecting" : ""}`} role="dialog" aria-modal="true" aria-labelledby="cash-title">
        <span className="cash-kicker">Entry fee received</span>
        <h2 id="cash-title">{money(transfer.amount)}</h2>
        <p><strong>{payer?.name ?? "A visitor"}</strong> paid for {space?.name ?? "your landmark"}.</p>
        <div className="cash-drag-lane">
          <div
            className={`cash-stack ${dragging ? "is-dragging" : ""}`}
            style={{ "--cash-drag": `${dragY}px`, "--cash-progress": Math.min(1, dragY / 92) } as CSSProperties}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            role="button"
            tabIndex={0}
            aria-label={`Drag down or press Enter to collect ${money(transfer.amount)}`}
            onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") collect(); }}
          >
            <i /><i /><i />
            <div className="fortune-note"><span>FA</span><b>{money(transfer.amount)}</b><small>Fortune Avenue</small></div>
          </div>
          <div className="cash-vault"><i /><span>Drag down to collect</span></div>
        </div>
        <button className="cash-tap-button" type="button" onClick={collect} disabled={collecting}>Tap to collect instead</button>
      </section>
    </div>
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
          const hasDistrict = ownsFullDistrict(state, playerId, space.district);
          const canUpgrade = space.kind === "landmark" && hasDistrict && property.upgrades < 3 && (player?.cash ?? 0) >= cost;
          const nextFee = propertyRent(state, { ...property, upgrades: Math.min(3, property.upgrades + 1) }, 7);
          const buildLabel = property.upgrades === 2 ? "Castle" : "Crown";
          return <article className={`deed-row ${hasDistrict ? "has-district" : ""}`} key={space.index} style={{ "--district-color": space.districtColor } as CSSProperties}><span className="deed-art" style={{ backgroundImage: `url(${space.asset})` }} /><div><strong>{space.name}</strong><span className="deed-builds" aria-label={property.upgrades === 3 ? "Castle built" : `${property.upgrades} crowns`}>{property.upgrades === 3 ? <Castle /> : Array.from({ length: property.upgrades }, (_, index) => <Crown key={index} />)}</span><small>{property.upgrades === 3 ? `Castle fee ${money(propertyRent(state, property, 7))}` : hasDistrict ? `${property.upgrades === 0 ? "District complete" : `${property.upgrades} ${property.upgrades === 1 ? "crown" : "crowns"}`} • next fee ${money(nextFee)}` : space.kind === "landmark" ? `Complete ${space.districtName} to add crowns` : `Entry fee ${money(propertyRent(state, property, 7))}`}</small></div>{space.kind === "landmark" && property.upgrades < 3 && <button type="button" className={!hasDistrict ? "is-locked" : ""} title={!hasDistrict ? `Own every ${space.districtName} landmark first` : `Add ${buildLabel.toLowerCase()} for ${money(cost)}`} disabled={busy || !canUpgrade || currentPlayer(state)?.id !== playerId} onClick={() => onUpgrade(space.index)}>{hasDistrict ? `${buildLabel} ${money(cost)}` : "Need set"}</button>}</article>;
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
          {space.price > 0 ? <div className="inspector-stats"><span><small>{property ? "Estate value" : "Deed"}</small><strong>{money(space.price + (property?.upgrades ?? 0) * space.upgradeCost)}</strong></span><span><small>Entry fee</small><strong>{space.kind === "service" ? "Dice based" : property ? money(propertyRent(state, property, 7)) : money(space.baseRent)}</strong></span><span><small>Owner</small><strong>{owner?.name ?? "Available"}</strong></span><span><small>Build</small><strong>{property?.upgrades === 3 ? "Castle" : property?.upgrades ? `${property.upgrades} ${property.upgrades === 1 ? "crown" : "crowns"}` : "No crowns"}</strong></span></div> : <p className="inspector-effect">{space.kind === "lucky" ? "Draw a Lucky Break and let fortune show off." : space.kind === "plot" ? "Draw a Plot Twist and brace for nonsense." : space.index === 20 ? "Pay F60 in mysterious municipal fees." : space.index === 30 ? "Collect F90 from the festival crowd." : space.index === 10 ? "Usually just visiting—unless a card strands you here." : "Collect F200 whenever you pass this gold marquee."}</p>}
          {space.district !== null && <span className="district-tag" style={{ backgroundColor: space.districtColor }}>{DISTRICTS[space.district]}</span>}
        </div>
      </section>
    </div>
  );
}

export function CardReveal({ event, onClose }: { event: GameEvent; onClose: () => void }) {
  if (!event.card) return null;
  return <div className={`modal-backdrop card-backdrop deck-${event.card.deck}`} role="presentation" onMouseDown={onClose}><section className="card-reveal" role="dialog" aria-modal="true" aria-label={`${event.card.title} card`} onMouseDown={(click) => click.stopPropagation()}><div className="card-aura" /><Image src={event.card.image} width={432} height={600} alt={`${event.card.title}: ${event.card.effect}`} unoptimized /><div className="card-reveal-copy"><span>{event.card.deck === "lucky-break" ? "Lucky Break" : "Plot Twist"}</span><h2>{event.card.title}</h2><p>{event.message}</p><button className="gold-button compact" type="button" onClick={onClose}>Keep rolling</button></div></section></div>;
}

function WinnerReveal({ state, onRules }: { state: FortuneGameState; onRules: () => void }) {
  const winner = state.players.find((player) => player.id === state.winnerId);
  if (!winner) return null;
  return <div className="winner-overlay"><GoldParticles /><section className="winner-card"><span className="winner-crown">♛</span><span className="setup-kicker">Fortune crowned</span><PawnPortrait pawn={pawnBySlug(winner.pawnSlug)} label={`${winner.name}'s winning pawn`} /><h2>{winner.name}</h2><p>{money(netWorth(state, winner.id))} net worth • {ownedProperties(state, winner.id).length} deeds</p><div className="winner-actions"><button className="glass-button compact" type="button" onClick={onRules}>Review rules</button><button className="gold-button compact" type="button" onClick={() => window.location.assign(window.location.pathname)}>New game</button></div></section></div>;
}

export function GameScreen({ state, you, onAction, onShare, onRules, onHome, busy, muted, onToggleMuted, onMotionChange, selectedSpace, setSelectedSpace }: { state: FortuneGameState; you: { playerId: string; isHost: boolean }; onAction: (action: RoomAction) => void; onShare: () => void; onRules: () => void; onHome: () => void; busy: boolean; muted: boolean; onToggleMuted: () => void; onMotionChange: (moving: boolean) => void; selectedSpace: SpaceDefinition | null; setSelectedSpace: (space: SpaceDefinition | null) => void }) {
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>(
    () => Object.fromEntries(state.players.map((player) => [player.id, player.position])),
  );
  const [movementView, setMovementView] = useState<{ event: GameEvent; step: number } | null>(null);
  const [motionBusy, setMotionBusy] = useState(false);
  const movementRoom = useRef<string | null>(null);
  const seenMovementIds = useRef(new Set<string>());
  const movementQueue = useRef<GameEvent[]>([]);
  const movementRunning = useRef(false);
  const movementTimer = useRef<number | null>(null);
  const latestPositions = useRef<Record<string, number>>(
    Object.fromEntries(state.players.map((player) => [player.id, player.position])),
  );

  const playNextMovement = useCallback(function processNextMovement() {
    if (movementRunning.current) return;
    const next = movementQueue.current.shift();
    if (!next?.movement || !next.playerId) {
      setMotionBusy(false);
      setMovementView(null);
      setDisplayPositions(latestPositions.current);
      return;
    }
    movementRunning.current = true;
    setMotionBusy(true);
    setMovementView({ event: next, step: 0 });
    setDisplayPositions((positions) => ({ ...positions, [next.playerId!]: next.movement!.from }));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let step = 0;
    const advance = () => {
      step += 1;
      const position = ((next.movement!.from + next.movement!.direction * step) % SPACES.length + SPACES.length) % SPACES.length;
      setDisplayPositions((positions) => ({ ...positions, [next.playerId!]: position }));
      setMovementView({ event: next, step });
      if (step < next.movement!.steps) {
        movementTimer.current = window.setTimeout(advance, reducedMotion ? 12 : PAWN_STEP_MS);
        return;
      }
      movementTimer.current = window.setTimeout(() => {
        movementRunning.current = false;
        setMovementView(null);
        if (movementQueue.current.length === 0) {
          setMotionBusy(false);
          setDisplayPositions(latestPositions.current);
        }
        processNextMovement();
      }, reducedMotion ? 12 : 420);
    };
    movementTimer.current = window.setTimeout(advance, reducedMotion ? 12 : PAWN_STEP_MS);
  }, []);

  useEffect(() => {
    latestPositions.current = Object.fromEntries(
      state.players.map((player) => [player.id, player.position]),
    );
  }, [state.players]);

  useEffect(() => {
    if (movementRoom.current !== state.code) {
      movementRoom.current = state.code;
      seenMovementIds.current = new Set(state.log.filter((event) => event.movement).map((event) => event.id));
      movementQueue.current = [];
      movementRunning.current = false;
      setDisplayPositions(latestPositions.current);
      setMotionBusy(false);
      setMovementView(null);
      return;
    }
    const newMovements = state.log
      .filter((event) => event.movement && !seenMovementIds.current.has(event.id))
      .reverse();
    newMovements.forEach((event) => seenMovementIds.current.add(event.id));
    if (newMovements.length > 0) {
      movementQueue.current.push(...newMovements);
      setMotionBusy(true);
      window.queueMicrotask(playNextMovement);
    } else if (!movementRunning.current && movementQueue.current.length === 0) {
      setDisplayPositions(latestPositions.current);
    }
  }, [playNextMovement, state.code, state.revision, state.log]);

  useEffect(() => {
    onMotionChange(motionBusy);
  }, [motionBusy, onMotionChange]);

  useEffect(() => () => {
    if (movementTimer.current !== null) window.clearTimeout(movementTimer.current);
  }, []);

  const movingPlayerId = movementView?.event.playerId ?? null;
  const movingPlayer = state.players.find((player) => player.id === movingPlayerId);
  const remainingSteps = movementView?.event.movement
    ? Math.max(0, movementView.event.movement.steps - movementView.step)
    : 0;
  const controlsBusy = busy || motionBusy;
  return (
    <main className={`game-screen theme-${state.theme}`}>
      <header className="game-topbar"><button className="mini-logo" type="button" onClick={onHome} aria-label="Return to menu"><span>F</span> Fortune Avenue</button><div className="topbar-room"><span>Room</span><strong>{state.code}</strong><i>{state.kind === "friends" ? "Friends" : "Bot match"}</i></div><div className="topbar-actions"><button type="button" onClick={onToggleMuted}>{muted ? "Sound off" : "Sound on"}</button><button type="button" onClick={onRules}>Rules</button><button className="invite-topbar" type="button" onClick={onShare}>Invite</button></div></header>
      <PlayerRail state={state} youId={you.playerId} />
      <div className="game-layout"><section className="board-shell"><div className="board-glow" />{movementView && movingPlayer && <div className="movement-banner" role="status"><PawnPortrait pawn={pawnBySlug(movingPlayer.pawnSlug)} /><span><strong>{movingPlayer.name} is cruising the Avenue</strong><small>{remainingSteps > 0 ? `${remainingSteps} ${remainingSteps === 1 ? "space" : "spaces"} to go` : "Arriving now"}</small></span><i /></div>}<div className="game-board" aria-label="Fortune Avenue game board">{SPACES.map((space) => <SpaceTile key={space.index} space={space} state={state} displayPositions={displayPositions} movingPlayerId={movingPlayerId} onSelect={setSelectedSpace} />)}<BoardCenter state={state} you={you} onAction={onAction} busy={controlsBusy} /></div></section><aside className="game-sidebar"><DeedPanel state={state} playerId={you.playerId} onUpgrade={(spaceIndex) => onAction({ type: "upgrade", spaceIndex })} busy={controlsBusy} /><EventLog state={state} /></aside></div>
      {state.auction && !motionBusy && <AuctionHouse state={state} you={you} onAction={onAction} busy={busy} />}
      {selectedSpace && <SpaceInspector space={selectedSpace} state={state} onClose={() => setSelectedSpace(null)} />}
      {state.phase === "finished" && <WinnerReveal state={state} onRules={onRules} />}
    </main>
  );
}
