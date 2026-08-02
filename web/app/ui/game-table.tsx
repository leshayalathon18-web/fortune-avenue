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
import { ArrowLeftRight, Castle, Check, Coins, Crown, Handshake, X } from "lucide-react";
import { DISTRICTS, GAME_TAGLINE, LUCKY_CARDS, PAWNS, PLOT_CARDS, SPACE_BY_INDEX, SPACES } from "@/lib/game-data";
import { currentPlayer, netWorth, ownedProperties, propertyRent } from "@/lib/game-engine";
import {
  isShakeImpulse,
  SHAKE_HITS_REQUIRED,
  SHAKE_HIT_WINDOW_MS,
  SHAKE_SETTLE_MS,
  type MotionVector,
} from "@/lib/shake-roll";
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

type MotionPermissionConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type MotionMode = "checking" | "permission" | "ready" | "fallback";

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function ShakeDiceControl({
  firstValue,
  secondValue,
  canRoll,
  busy,
  rollKey,
  onRoll,
}: {
  firstValue: number;
  secondValue: number;
  canRoll: boolean;
  busy: boolean;
  rollKey: string;
  onRoll: () => void;
}) {
  const [motionMode, setMotionMode] = useState<MotionMode>("checking");
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [shakeActive, setShakeActive] = useState(false);
  const [rollCommitted, setRollCommitted] = useState(false);
  const [landed, setLanded] = useState(false);
  const [previewDice, setPreviewDice] = useState<[number, number]>([firstValue, secondValue]);
  const onRollRef = useRef(onRoll);
  const canRollRef = useRef(canRoll);
  const busyRef = useRef(busy);
  const rollLocked = useRef(false);
  const dispatchTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const landedTimer = useRef<number | null>(null);
  const sawBusy = useRef(false);
  const lastResult = useRef(`${firstValue}-${secondValue}`);

  useEffect(() => {
    onRollRef.current = onRoll;
    canRollRef.current = canRoll;
    busyRef.current = busy;
  }, [busy, canRoll, onRoll]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const coarse = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
      setCoarsePointer(coarse);
      if (!coarse || !("DeviceMotionEvent" in window)) {
        setMotionMode("fallback");
        return;
      }
      const motionConstructor = window.DeviceMotionEvent as MotionPermissionConstructor;
      setMotionMode(typeof motionConstructor.requestPermission === "function" ? "permission" : "ready");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    rollLocked.current = false;
    sawBusy.current = false;
    if (dispatchTimer.current !== null) window.clearTimeout(dispatchTimer.current);
    if (safetyTimer.current !== null) window.clearTimeout(safetyTimer.current);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    const frame = window.requestAnimationFrame(() => {
      setShakeActive(false);
      setRollCommitted(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rollKey]);

  useEffect(() => {
    if (busy) sawBusy.current = true;
    if (!busy && sawBusy.current) {
      sawBusy.current = false;
      setRollCommitted(false);
      if (canRoll) rollLocked.current = false;
    }
  }, [busy, canRoll]);

  useEffect(() => {
    const result = `${firstValue}-${secondValue}`;
    if (lastResult.current !== result) {
      lastResult.current = result;
      setLanded(true);
      if (landedTimer.current !== null) window.clearTimeout(landedTimer.current);
      landedTimer.current = window.setTimeout(() => setLanded(false), 720);
    }
  }, [firstValue, secondValue]);

  const triggerRoll = useCallback(() => {
    if (!canRollRef.current || busyRef.current || rollLocked.current) return;
    rollLocked.current = true;
    setShakeActive(false);
    setRollCommitted(true);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (dispatchTimer.current !== null) window.clearTimeout(dispatchTimer.current);
    if (safetyTimer.current !== null) window.clearTimeout(safetyTimer.current);
    if (navigator.vibrate) navigator.vibrate([18, 24, 18]);
    dispatchTimer.current = window.setTimeout(() => onRollRef.current(), 520);
    safetyTimer.current = window.setTimeout(() => {
      if (canRollRef.current && !busyRef.current) {
        rollLocked.current = false;
        setRollCommitted(false);
      }
    }, 6000);
  }, []);

  useEffect(() => {
    if (motionMode !== "ready" || !canRoll || busy || rollCommitted) return;
    let previous: MotionVector | null = null;
    let hitCount = 0;
    let hitWindowStarted = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity ?? event.acceleration;
      if (acceleration?.x === null || acceleration?.x === undefined
        || acceleration.y === null || acceleration.y === undefined
        || acceleration.z === null || acceleration.z === undefined) return;
      const current = { x: acceleration.x, y: acceleration.y, z: acceleration.z };
      const rotation = {
        alpha: event.rotationRate?.alpha ?? 0,
        beta: event.rotationRate?.beta ?? 0,
        gamma: event.rotationRate?.gamma ?? 0,
      };
      const now = Date.now();
      const impulse = previous ? isShakeImpulse(previous, current, rotation) : false;
      previous = current;
      if (!impulse) return;
      if (now - hitWindowStarted > SHAKE_HIT_WINDOW_MS) {
        hitWindowStarted = now;
        hitCount = 0;
      }
      hitCount += 1;
      if (hitCount < SHAKE_HITS_REQUIRED) return;
      setShakeActive(true);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(triggerRoll, SHAKE_SETTLE_MS);
    };

    window.addEventListener("devicemotion", handleMotion, { passive: true });
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, [busy, canRoll, motionMode, rollCommitted, triggerRoll]);

  const visualRolling = shakeActive || rollCommitted;
  useEffect(() => {
    if (!visualRolling) return;
    const previewTimer = window.setInterval(() => setPreviewDice([randomDie(), randomDie()]), 90);
    return () => window.clearInterval(previewTimer);
  }, [visualRolling]);

  useEffect(() => () => {
    if (dispatchTimer.current !== null) window.clearTimeout(dispatchTimer.current);
    if (safetyTimer.current !== null) window.clearTimeout(safetyTimer.current);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (landedTimer.current !== null) window.clearTimeout(landedTimer.current);
  }, []);

  const enableMotionOrRoll = async () => {
    if (!canRoll || busy || rollCommitted) return;
    if (motionMode === "permission") {
      const motionConstructor = window.DeviceMotionEvent as MotionPermissionConstructor;
      try {
        const permission = await motionConstructor.requestPermission?.();
        setMotionMode(permission === "granted" ? "ready" : "fallback");
      } catch {
        setMotionMode("fallback");
      }
      return;
    }
    triggerRoll();
  };

  const prompt = visualRolling
    ? shakeActive ? "Keep shaking - release to roll" : "Dice tumbling on the Avenue"
    : motionMode === "permission"
      ? "Tap dice once to enable shake"
      : motionMode === "ready" && coarsePointer
        ? "Shake phone - stop to roll"
        : coarsePointer
          ? "Tap dice to roll"
          : "Click dice to roll";
  const displayedDice: [number, number] = visualRolling ? previewDice : [firstValue, secondValue];
  const dice = (
    <>
      <span className="dice-surface">
        <DiceFace value={displayedDice[0]} rolling={visualRolling} />
        <DiceFace value={displayedDice[1]} rolling={visualRolling} />
      </span>
      {canRoll && <span className="dice-instruction" role="status" aria-live="polite">{prompt}</span>}
      <span className="dice-motion-streaks" aria-hidden="true"><i /><i /><i /></span>
    </>
  );

  if (!canRoll) {
    return <div className={`board-dice-control is-passive ${landed ? "is-landed" : ""}`} aria-label={`Dice show ${firstValue} and ${secondValue}`}>{dice}</div>;
  }
  return (
    <button
      className={`board-dice-control can-roll ${visualRolling ? "is-tumbling" : ""} ${shakeActive ? "is-shaking" : ""} ${landed ? "is-landed" : ""}`}
      type="button"
      disabled={busy || rollCommitted}
      aria-label={motionMode === "permission" ? "Enable phone shake for the dice" : coarsePointer ? "Shake phone or tap dice to roll" : "Click dice to roll"}
      onClick={() => void enableMotionOrRoll()}
    >
      {dice}
    </button>
  );
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
        <ShakeDiceControl
          firstValue={state.dice?.[0] ?? 1}
          secondValue={state.dice?.[1] ?? 6}
          canRoll={Boolean(isYourTurn && !state.rolled && state.phase === "playing")}
          busy={busy}
          rollKey={`${state.code}-${state.turnNumber}-${active?.id ?? "none"}`}
          onRoll={() => onAction({ type: "roll" })}
        />
        {state.phase === "finished" ? <div className="winner-mini">The Avenue has chosen.</div> : isYourTurn ? (
          <div className="turn-actions">
            {!state.rolled && luckyCoin && <button className="mini-action lucky-action" type="button" disabled={busy} onClick={() => onAction({ type: "use-card", cardId: luckyCoin.id })}>Use Lucky Coin</button>}
            {pendingSpace && <div className="purchase-prompt"><strong>{pendingSpace.name}</strong><span>Claim for {money(Math.max(0, pendingSpace.price - (youPlayer?.purchaseDiscount ?? 0)))}</span><div><button type="button" className="mini-action buy-action" disabled={busy} onClick={() => onAction({ type: "buy" })}>Buy deed</button><button type="button" className="mini-action auction-action" disabled={busy} onClick={() => onAction({ type: "start-auction" })}>Auction</button><button type="button" className="mini-action skip-auction-action" disabled={busy} onClick={() => onAction({ type: "skip-purchase" })}>Skip auction</button></div></div>}
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
  const bidder = state.players.find((player) => player.id === auction?.currentBidderId);
  useEffect(() => {
    if (!auction || !bidder?.isBot || busy) return;
    const timer = window.setTimeout(() => onAction({ type: "auction-tick" }), 1150);
    return () => window.clearTimeout(timer);
  }, [auction, bidder?.isBot, busy, onAction]);
  if (!auction) return null;
  const space = SPACE_BY_INDEX.get(auction.spaceIndex);
  const leader = state.players.find((player) => player.id === auction.highBidderId);
  const youPlayer = state.players.find((player) => player.id === you.playerId);
  const isYourBid = bidder?.id === you.playerId;
  const auctionEvents = state.log.filter((event) => event.type === "auction" && event.spaceIndex === auction.spaceIndex).slice(0, 4);
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
            {state.players.filter((player) => auction.participantIds.includes(player.id)).map((player) => (
              <span key={player.id} className={`${player.id === auction.currentBidderId ? "is-up" : ""} ${player.id === auction.highBidderId ? "is-leading" : ""} ${!auction.eligibleBidderIds.includes(player.id) ? "is-out" : ""}`}>
                <PawnPortrait pawn={pawnBySlug(player.pawnSlug)} />
                <b>{player.name}</b>
              </span>
            ))}
          </div>
          <div className="auction-activity" aria-live="polite">{auctionEvents.map((event) => <span key={event.id}><i />{event.message}</span>)}</div>
          {isYourBid ? (
            <div className="auction-controls">
              <p>Your call. Raise the paddle or fold for good.</p>
              <div>{bids.map((amount) => <button key={amount} className="auction-bid-button" type="button" disabled={busy} onClick={() => onAction({ type: "auction-bid", amount })}>Bid {money(amount)}</button>)}</div>
              <button className="auction-fold-button" type="button" disabled={busy} onClick={() => onAction({ type: "auction-pass" })}>Fold</button>
            </div>
          ) : (
            <div className={`auction-waiting ${bidder?.isBot ? "bot-is-bidding" : ""}`}><i /> {bidder?.isBot ? `${bidder.name} is raising the paddle...` : `${bidder?.name ?? "The auctioneer"} is choosing a bid...`}</div>
          )}
        </div>
      </section>
    </div>
  );
}

function tradeLocked(state: FortuneGameState, playerId: string, space: SpaceDefinition) {
  const property = state.properties[String(space.index)];
  if (!property || property.upgrades > 0) return Boolean(property?.upgrades);
  if (space.district === null) return false;
  return ownedProperties(state, playerId).some((owned) => (
    owned.upgrades > 0 && SPACE_BY_INDEX.get(owned.spaceIndex)?.district === space.district
  ));
}

function TradeDeedPicker({
  state,
  playerId,
  selected,
  onToggle,
}: {
  state: FortuneGameState;
  playerId: string;
  selected: number[];
  onToggle: (spaceIndex: number) => void;
}) {
  const deeds = ownedProperties(state, playerId).flatMap((property) => {
    const space = SPACE_BY_INDEX.get(property.spaceIndex);
    return space ? [space] : [];
  });
  if (deeds.length === 0) return <div className="trade-empty">No deeds in this portfolio yet.</div>;
  return (
    <div className="trade-deed-picker">
      {deeds.map((space) => {
        const locked = tradeLocked(state, playerId, space);
        const checked = selected.includes(space.index);
        return (
          <button
            key={space.index}
            className={`${checked ? "is-selected" : ""} ${locked ? "is-locked" : ""}`}
            style={{ "--district-color": space.districtColor } as CSSProperties}
            type="button"
            disabled={locked}
            aria-pressed={checked}
            title={locked ? "Crowns and castles lock this color set until the improvements are removed." : `Add ${space.name} to the offer`}
            onClick={() => onToggle(space.index)}
          >
            <span className="trade-deed-art" style={{ backgroundImage: `url(${space.asset})` }} />
            <span><strong>{space.name}</strong><small>{locked ? "Crowned district - locked" : `${money(space.price)} deed`}</small></span>
            <i aria-hidden="true">{checked ? <Check /> : null}</i>
          </button>
        );
      })}
    </div>
  );
}

function TradeBuilder({
  state,
  youId,
  onAction,
  onClose,
  busy,
}: {
  state: FortuneGameState;
  youId: string;
  onAction: (action: RoomAction) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const youPlayer = state.players.find((player) => player.id === youId);
  const recipients = state.players.filter((player) => player.id !== youId && !player.bankrupt);
  const [targetId, setTargetId] = useState(recipients[0]?.id ?? "");
  const [offeredSpaces, setOfferedSpaces] = useState<number[]>([]);
  const [requestedSpaces, setRequestedSpaces] = useState<number[]>([]);
  const [offeredCash, setOfferedCash] = useState(0);
  const [requestedCash, setRequestedCash] = useState(0);
  const target = recipients.find((player) => player.id === targetId) ?? recipients[0];
  const givesSomething = offeredSpaces.length > 0 || offeredCash > 0;
  const getsSomething = requestedSpaces.length > 0 || requestedCash > 0;
  const canSend = Boolean(target && givesSomething && getsSomething && offeredCash <= (youPlayer?.cash ?? 0) && requestedCash <= target.cash);
  const chooseTarget = (playerId: string) => {
    setTargetId(playerId);
    setRequestedSpaces([]);
    setRequestedCash(0);
  };
  const toggleOffered = (spaceIndex: number) => setOfferedSpaces((current) => current.includes(spaceIndex) ? current.filter((index) => index !== spaceIndex) : [...current, spaceIndex]);
  const toggleRequested = (spaceIndex: number) => setRequestedSpaces((current) => current.includes(spaceIndex) ? current.filter((index) => index !== spaceIndex) : [...current, spaceIndex]);
  const send = () => {
    if (!target || !canSend) return;
    onAction({
      type: "propose-trade",
      toPlayerId: target.id,
      offeredSpaceIndexes: offeredSpaces,
      requestedSpaceIndexes: requestedSpaces,
      offeredCash,
      requestedCash,
    });
    onClose();
  };
  return (
    <div className="trade-backdrop" role="presentation">
      <section className="trade-table" role="dialog" aria-modal="true" aria-labelledby="trade-builder-title">
        <header className="trade-header">
          <div><span>Avenue deal room</span><h2 id="trade-builder-title">Build a trade</h2><p>Swap landmarks, add cash, and send the offer across the table.</p></div>
          <button type="button" onClick={onClose} aria-label="Close trade table"><X /></button>
        </header>
        <div className="trade-recipient-row" aria-label="Choose a player to trade with">
          {recipients.map((player) => <button key={player.id} type="button" className={target?.id === player.id ? "is-selected" : ""} onClick={() => chooseTarget(player.id)}><PawnPortrait pawn={pawnBySlug(player.pawnSlug)} /><span>{player.name}<small>{player.isBot ? "Bot negotiator" : "Player"}</small></span></button>)}
        </div>
        {target ? (
          <div className="trade-columns">
            <section className="trade-side you-give">
              <div className="trade-side-title"><PawnPortrait pawn={pawnBySlug(youPlayer?.pawnSlug ?? PAWNS[0].slug)} /><span><small>You give</small><strong>{youPlayer?.name ?? "You"}</strong></span></div>
              <TradeDeedPicker state={state} playerId={youId} selected={offeredSpaces} onToggle={toggleOffered} />
              <label className="trade-cash"><Coins /><span><strong>Add cash</strong><small>Available {money(youPlayer?.cash ?? 0)}</small></span><b>F</b><input type="number" inputMode="numeric" min={0} max={youPlayer?.cash ?? 0} step={10} value={offeredCash} onChange={(event) => setOfferedCash(Math.max(0, Math.min(youPlayer?.cash ?? 0, Math.round(Number(event.target.value) || 0))))} /></label>
            </section>
            <ArrowLeftRight className="trade-swap-mark" aria-hidden="true" />
            <section className="trade-side you-get">
              <div className="trade-side-title"><PawnPortrait pawn={pawnBySlug(target.pawnSlug)} /><span><small>You request</small><strong>{target.name}</strong></span></div>
              <TradeDeedPicker state={state} playerId={target.id} selected={requestedSpaces} onToggle={toggleRequested} />
              <label className="trade-cash"><Coins /><span><strong>Request cash</strong><small>Available {money(target.cash)}</small></span><b>F</b><input type="number" inputMode="numeric" min={0} max={target.cash} step={10} value={requestedCash} onChange={(event) => setRequestedCash(Math.max(0, Math.min(target.cash, Math.round(Number(event.target.value) || 0))))} /></label>
            </section>
          </div>
        ) : <div className="trade-empty">No other active player is available to trade.</div>}
        <footer className="trade-footer"><span>{!givesSomething ? "Choose what you will give." : !getsSomething ? "Choose what you want back." : `${offeredSpaces.length} deed${offeredSpaces.length === 1 ? "" : "s"} + ${money(offeredCash)} for ${requestedSpaces.length} deed${requestedSpaces.length === 1 ? "" : "s"} + ${money(requestedCash)}`}</span><button type="button" disabled={busy || !canSend} onClick={send}><Handshake /> Send offer</button></footer>
      </section>
    </div>
  );
}

function TradeBundle({ state, playerId, spaceIndexes, cash }: { state: FortuneGameState; playerId: string; spaceIndexes: number[]; cash: number }) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return (
    <section className="trade-offer-bundle">
      <div><PawnPortrait pawn={pawnBySlug(player?.pawnSlug ?? PAWNS[0].slug)} /><span><small>{player?.name ?? "Player"} gives</small><strong>{spaceIndexes.length} deed{spaceIndexes.length === 1 ? "" : "s"}{cash > 0 ? ` + ${money(cash)}` : ""}</strong></span></div>
      <div className="trade-offer-deeds">{spaceIndexes.map((spaceIndex) => { const space = SPACE_BY_INDEX.get(spaceIndex); return space ? <span key={space.index} style={{ "--district-color": space.districtColor } as CSSProperties}><i style={{ backgroundImage: `url(${space.asset})` }} /><b>{space.name}</b></span> : null; })}</div>
      {spaceIndexes.length === 0 && <div className="trade-cash-only"><Coins /> {money(cash)} cash</div>}
    </section>
  );
}

function TradeOfferModal({ state, youId, onAction, busy }: { state: FortuneGameState; youId: string; onAction: (action: RoomAction) => void; busy: boolean }) {
  const offer = state.tradeOffer;
  if (!offer) return null;
  const proposer = state.players.find((player) => player.id === offer.fromPlayerId);
  const recipient = state.players.find((player) => player.id === offer.toPlayerId);
  const isRecipient = youId === offer.toPlayerId;
  const isProposer = youId === offer.fromPlayerId;
  return (
    <div className="trade-backdrop trade-offer-backdrop" role="presentation">
      <section className="trade-offer-card" role="dialog" aria-modal="true" aria-labelledby="trade-offer-title">
        <span className="trade-offer-kicker">Live offer on the Avenue</span>
        <Handshake className="trade-offer-icon" aria-hidden="true" />
        <h2 id="trade-offer-title">{isRecipient ? `${proposer?.name ?? "A player"} wants to deal` : isProposer ? `Offer sent to ${recipient?.name ?? "player"}` : "A deal is on the table"}</h2>
        <p>{isRecipient ? "Review both sides. You control whether the deeds and cash change hands." : isProposer ? `${recipient?.name ?? "The other player"} can approve or decline this exact offer.` : `${proposer?.name ?? "A player"} and ${recipient?.name ?? "another player"} are negotiating.`}</p>
        <div className="trade-offer-exchange">
          <TradeBundle state={state} playerId={offer.fromPlayerId} spaceIndexes={offer.offeredSpaceIndexes} cash={offer.offeredCash} />
          <ArrowLeftRight aria-hidden="true" />
          <TradeBundle state={state} playerId={offer.toPlayerId} spaceIndexes={offer.requestedSpaceIndexes} cash={offer.requestedCash} />
        </div>
        {isRecipient ? <div className="trade-response-buttons"><button className="trade-decline-button" type="button" disabled={busy} onClick={() => onAction({ type: "trade-decline" })}><X /> Decline</button><button className="trade-accept-button" type="button" disabled={busy} onClick={() => onAction({ type: "trade-accept" })}><Check /> Accept deal</button></div> : isProposer ? <div className="trade-response-buttons is-waiting"><span><i /> Waiting for an answer</span><button className="trade-decline-button" type="button" disabled={busy} onClick={() => onAction({ type: "trade-decline" })}>Withdraw offer</button></div> : <div className="trade-spectator"><i /> The table resumes when they decide.</div>}
      </section>
    </div>
  );
}

function LandmarkStealModal({ state, youId, onAction, busy }: { state: FortuneGameState; youId: string; onAction: (action: RoomAction) => void; busy: boolean }) {
  const choice = state.landmarkStealChoice;
  if (!choice) return null;
  const chooser = state.players.find((player) => player.id === choice.playerId);
  const isChooser = choice.playerId === youId;
  const card = PLOT_CARDS.find((candidate) => candidate.title === "Steal a Landmark");
  const targets = choice.eligibleSpaceIndexes.flatMap((spaceIndex) => {
    const space = SPACE_BY_INDEX.get(spaceIndex);
    const property = state.properties[String(spaceIndex)];
    const owner = property ? state.players.find((player) => player.id === property.ownerId) : null;
    return space && property && owner ? [{ space, property, owner }] : [];
  });
  return (
    <div className="steal-backdrop" role="presentation">
      <section className="steal-landmark" role="dialog" aria-modal="true" aria-labelledby="steal-title">
        <div className="steal-card-art">{card && <Image src={card.image} width={432} height={600} alt="Steal a Landmark Plot Twist card" unoptimized />}</div>
        <div className="steal-copy">
          <span className="steal-kicker">Plot Twist choice</span>
          <h2 id="steal-title">{isChooser ? "Choose the landmark" : `${chooser?.name ?? "A player"} is choosing`}</h2>
          <p>{isChooser ? "Tap the exact rival deed you want. Its owner immediately receives the amount they originally paid." : "The Avenue is paused while they pick one eligible rival landmark."}</p>
          <div className="steal-targets">
            {targets.map(({ space, property, owner }) => {
              const paid = property.purchasePrice ?? space.price;
              return (
                <button key={space.index} type="button" disabled={!isChooser || busy} style={{ "--district-color": space.districtColor } as CSSProperties} onClick={() => onAction({ type: "steal-landmark", spaceIndex: space.index })}>
                  <span className="steal-target-art" style={{ backgroundImage: `url(${space.asset})` }} />
                  <span><small>{space.districtName}</small><strong>{space.name}</strong><em>Pay {owner.name} {money(paid)}</em></span>
                  <PawnPortrait pawn={pawnBySlug(owner.pawnSlug)} />
                </button>
              );
            })}
          </div>
          {isChooser ? <div className="steal-instruction"><i /> Select one deed to finish the card</div> : <div className="steal-instruction"><i /> Waiting for {chooser?.name ?? "the player"}</div>}
        </div>
      </section>
    </div>
  );
}

const CARD_CHOICE_COPY: Record<string, { heading: string; prompt: string }> = {
  "Scenic Shortcut": { heading: "Pick your shortcut", prompt: "Choose the exact landmark where you want to arrive. The destination resolves normally." },
  "Grand Reopening": { heading: "Choose the headliner", prompt: "Pick one of your landmarks to charge double until your next turn." },
  "Friendly Inspector": { heading: "Clear one penalty", prompt: "Choose the closure, route penalty, or missed turn you want removed." },
  "Free Upgrade": { heading: "Place the free crown", prompt: "Choose one eligible landmark in a complete district. The crown costs nothing." },
  "Influencer Visit": { heading: "Choose the hot spot", prompt: "Pick the landmark getting the crowd; every other player pays you F15." },
  "Midnight Pass": { heading: "Choose your ride", prompt: "Pick either transport stop. You move there without paying an entry fee." },
  "Position Upgrade": { heading: "Choose who to swap", prompt: "Pick one player. You exchange board positions and they collect F20." },
  "Big Break": { heading: "Choose your break", prompt: "Take guaranteed cash or move exactly six spaces and resolve where you land." },
  "Surprise Inspection": { heading: "Pay or close", prompt: "Pay F20, or choose one of your landmarks to close until your next turn." },
  "Review Bomb": { heading: "Choose the target", prompt: "Pick one of your landmarks. Its entry fee is cut in half until your next turn." },
  "Neighborhood Blackout": { heading: "Choose one district", prompt: "Tap the district that will collect no entry fees until your next turn." },
  "Celebrity Entourage": { heading: "Choose the guest list", prompt: "Pick the landmark whose next visitor enters free. You also collect F50." },
  "Lost Luggage": { heading: "Pay or take the train", prompt: "Pay F40 and stay put, or move to The Midnight Express and end your turn." },
  "Sudden Rebrand": { heading: "Choose the rebrand", prompt: "Pick one landmark to close. It reopens when you personally visit it." },
};

function CardChoiceModal({ state, youId, onAction, busy }: { state: FortuneGameState; youId: string; onAction: (action: RoomAction) => void; busy: boolean }) {
  const choice = state.cardChoice;
  if (!choice) return null;
  const chooser = state.players.find((player) => player.id === choice.playerId);
  const isChooser = choice.playerId === youId;
  const cards = choice.deck === "lucky-break" ? LUCKY_CARDS : PLOT_CARDS;
  const card = cards.find((candidate) => candidate.title === choice.cardTitle);
  const copy = CARD_CHOICE_COPY[choice.cardTitle] ?? { heading: "Make your choice", prompt: card?.effect ?? "Choose one option to continue." };
  const choose = (selection: string) => onAction({ type: "resolve-card-choice", selection });
  const spaces = choice.eligibleSpaceIndexes.flatMap((spaceIndex) => {
    const space = SPACE_BY_INDEX.get(spaceIndex);
    const property = state.properties[String(spaceIndex)];
    const owner = property ? state.players.find((player) => player.id === property.ownerId) : null;
    return space ? [{ space, property, owner }] : [];
  });

  const spaceAction = (space: SpaceDefinition, property: FortuneGameState["properties"][string] | undefined) => {
    if (choice.cardTitle === "Scenic Shortcut") return property ? `Land here • fee ${money(propertyRent(state, property, 7))}` : `Land here • deed ${money(space.price)}`;
    if (choice.cardTitle === "Free Upgrade") return "Add one free crown";
    if (choice.cardTitle === "Review Bomb") return `Halve ${money(property ? propertyRent(state, property, 7) : space.baseRent)} fee`;
    if (choice.cardTitle === "Surprise Inspection") return "Close instead of paying";
    if (choice.cardTitle === "Midnight Pass") return "Ride here free";
    if (choice.cardTitle === "Sudden Rebrand") return "Close until your visit";
    if (choice.cardTitle === "Celebrity Entourage") return "Next visitor enters free";
    if (choice.cardTitle === "Grand Reopening") return `Double ${money(property ? propertyRent(state, property, 7) : space.baseRent)} fee`;
    return "Choose this landmark";
  };

  return (
    <div className={`steal-backdrop card-choice-backdrop deck-${choice.deck}`} role="presentation">
      <section className="steal-landmark card-choice-panel" role="dialog" aria-modal="true" aria-labelledby="card-choice-title">
        <div className="steal-card-art card-choice-art">{card && <Image src={card.image} width={432} height={600} alt={`${card.title}: ${card.effect}`} unoptimized />}</div>
        <div className="steal-copy card-choice-copy">
          <span className="steal-kicker">{choice.deck === "lucky-break" ? "Lucky Break decision" : "Plot Twist decision"}</span>
          <h2 id="card-choice-title">{isChooser ? copy.heading : `${chooser?.name ?? "A player"} is choosing`}</h2>
          <p>{isChooser ? copy.prompt : `The table is paused while ${chooser?.name ?? "the player"} finishes ${choice.cardTitle}.`}</p>
          <div className="card-choice-options">
            {choice.options.includes("cash") && <button type="button" disabled={!isChooser || busy} onClick={() => choose("cash")}><span className="choice-medallion"><Coins /></span><span><small>Guaranteed payout</small><strong>Take F60</strong><em>Stay on your current space</em></span></button>}
            {choice.options.includes("move-six") && <button type="button" disabled={!isChooser || busy} onClick={() => choose("move-six")}><span className="choice-medallion choice-six">6</span><span><small>Resolve the destination</small><strong>Move six spaces</strong><em>Land on {SPACE_BY_INDEX.get(((chooser?.position ?? 0) + 6) % SPACES.length)?.name}</em></span></button>}
            {choice.options.includes("pay-20") && <button type="button" disabled={!isChooser || busy} onClick={() => choose("pay-20")}><span className="choice-medallion"><Coins /></span><span><small>Keep every deed open</small><strong>Pay F20</strong><em>Take the quick inspection fee</em></span></button>}
            {choice.options.includes("pay-40") && <button type="button" disabled={!isChooser || busy} onClick={() => choose("pay-40")}><span className="choice-medallion"><Coins /></span><span><small>Stay where you are</small><strong>Pay F40</strong><em>Continue your turn normally</em></span></button>}
            {choice.options.includes("midnight-express") && <button type="button" disabled={!isChooser || busy} onClick={() => choose("midnight-express")}><span className="choice-medallion choice-ticket">FA</span><span><small>End the turn after moving</small><strong>Take Midnight Express</strong><em>Move directly to the transport stop</em></span></button>}
            {choice.options.includes("skip-turn") && <button type="button" disabled={!isChooser || busy} onClick={() => choose("skip-turn")}><span className="choice-medallion"><Check /></span><span><small>Inspector correction</small><strong>Clear missed turn</strong><em>Your next movement is restored</em></span></button>}
            {choice.options.includes("reverse-next") && <button type="button" disabled={!isChooser || busy} onClick={() => choose("reverse-next")}><span className="choice-medallion"><ArrowLeftRight /></span><span><small>Inspector correction</small><strong>Clear reverse route</strong><em>Your next roll moves clockwise</em></span></button>}
            {choice.eligibleDistricts.map((district) => {
              const districtSpaces = SPACES.filter((space) => space.district === district);
              return <button className="district-choice" key={district} type="button" disabled={!isChooser || busy} style={{ "--district-color": districtSpaces[0]?.districtColor ?? "#d8b24f" } as CSSProperties} onClick={() => choose(`district:${district}`)}><span className="district-choice-art">{districtSpaces.map((space) => <i key={space.index} style={{ backgroundImage: `url(${space.asset})` }} />)}</span><span><small>District {district + 1}</small><strong>{DISTRICTS[district]}</strong><em>{districtSpaces.map((space) => space.name).join(" • ")}</em></span></button>;
            })}
            {choice.eligiblePlayerIds.map((playerId) => {
              const target = state.players.find((player) => player.id === playerId);
              return target ? <button className="player-choice" key={target.id} type="button" disabled={!isChooser || busy} onClick={() => choose(`player:${target.id}`)}><PawnPortrait pawn={pawnBySlug(target.pawnSlug)} /><span><small>Space {target.position} • {money(target.cash)}</small><strong>Swap with {target.name}</strong><em>They collect F20</em></span></button> : null;
            })}
            {spaces.map(({ space, property, owner }) => <button className="space-choice" key={space.index} type="button" disabled={!isChooser || busy} style={{ "--district-color": space.districtColor } as CSSProperties} onClick={() => choose(`space:${space.index}`)}><span className="choice-space-art" style={{ backgroundImage: `url(${space.asset})` }} /> <span><small>{space.districtName ?? space.kind}{owner ? ` • ${owner.name}` : " • Available"}</small><strong>{space.name}</strong><em>{spaceAction(space, property)}</em></span>{owner ? <PawnPortrait pawn={pawnBySlug(owner.pawnSlug)} /> : <span className="choice-space-price">{money(space.price)}</span>}</button>)}
          </div>
          <div className="steal-instruction"><i /> {isChooser ? "Tap one option to finish the card" : `Waiting for ${chooser?.name ?? "the player"}`}</div>
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

export function CardReveal({ event, drawerName, onClose }: { event: GameEvent; drawerName?: string; onClose: () => void }) {
  if (!event.card) return null;
  return <div className={`modal-backdrop card-backdrop deck-${event.card.deck}`} role="presentation" onMouseDown={onClose}><section className="card-reveal" role="dialog" aria-modal="true" aria-label={`${event.card.title} card drawn by ${drawerName ?? "a player"}`} onMouseDown={(click) => click.stopPropagation()}><div className="card-aura" /><Image src={event.card.image} width={432} height={600} alt={`${event.card.title}: ${event.card.effect}`} unoptimized /><div className="card-reveal-copy"><span>{event.card.deck === "lucky-break" ? "Lucky Break" : "Plot Twist"} • Drawn by {drawerName ?? "Avenue player"}</span><h2>{event.card.title}</h2><p>{event.message}</p><button className="gold-button compact" type="button" onClick={onClose}>Show the table</button></div></section></div>;
}

function WinnerReveal({ state, onRules }: { state: FortuneGameState; onRules: () => void }) {
  const winner = state.players.find((player) => player.id === state.winnerId);
  if (!winner) return null;
  return <div className="winner-overlay"><GoldParticles /><section className="winner-card"><span className="winner-crown">♛</span><span className="setup-kicker">Fortune crowned</span><PawnPortrait pawn={pawnBySlug(winner.pawnSlug)} label={`${winner.name}'s winning pawn`} /><h2>{winner.name}</h2><p>{money(netWorth(state, winner.id))} net worth • {ownedProperties(state, winner.id).length} deeds</p><div className="winner-actions"><button className="glass-button compact" type="button" onClick={onRules}>Review rules</button><button className="gold-button compact" type="button" onClick={() => window.location.assign(window.location.pathname)}>New game</button></div></section></div>;
}

export function GameScreen({ state, you, onAction, onShare, onRules, onHome, busy, muted, onToggleMuted, onMotionChange, selectedSpace, setSelectedSpace }: { state: FortuneGameState; you: { playerId: string; isHost: boolean }; onAction: (action: RoomAction) => void; onShare: () => void; onRules: () => void; onHome: () => void; busy: boolean; muted: boolean; onToggleMuted: () => void; onMotionChange: (moving: boolean) => void; selectedSpace: SpaceDefinition | null; setSelectedSpace: (space: SpaceDefinition | null) => void }) {
  const [tradeOpen, setTradeOpen] = useState(false);
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
  const active = currentPlayer(state);
  const canOpenTrade = state.phase === "playing"
    && active?.id === you.playerId
    && !active.bankrupt
    && state.pendingPurchase === null
    && !state.auction
    && !state.tradeOffer
    && !state.cardChoice
    && !state.landmarkStealChoice
    && state.players.some((player) => player.id !== you.playerId && !player.bankrupt);
  return (
    <main className={`game-screen theme-${state.theme}`}>
      <header className="game-topbar"><button className="mini-logo" type="button" onClick={onHome} aria-label="Return to menu"><Image src="/app-icon-192.png" width={34} height={34} alt="" unoptimized /> Fortune Avenue</button><div className="topbar-room"><span>Room</span><strong>{state.code}</strong><i>{state.kind === "friends" ? "Friends" : "Bot match"}</i></div><div className="topbar-actions"><button type="button" onClick={onToggleMuted}>{muted ? "Sound off" : "Sound on"}</button><button type="button" onClick={onRules}>Rules</button><button className="trade-topbar" type="button" disabled={!canOpenTrade || controlsBusy} title={!canOpenTrade ? "Trade on your turn after resolving the current space." : "Open the Avenue trade table"} onClick={() => setTradeOpen(true)}><Handshake /> Trade</button><button className="invite-topbar" type="button" onClick={onShare}>Invite</button></div></header>
      <PlayerRail state={state} youId={you.playerId} />
      <div className="game-layout"><section className="board-shell"><div className="board-glow" />{movementView && movingPlayer && <div className="movement-banner" role="status"><PawnPortrait pawn={pawnBySlug(movingPlayer.pawnSlug)} /><span><strong>{movingPlayer.name} is cruising the Avenue</strong><small>{remainingSteps > 0 ? `${remainingSteps} ${remainingSteps === 1 ? "space" : "spaces"} to go` : "Arriving now"}</small></span><i /></div>}<div className="game-board" aria-label="Fortune Avenue game board">{SPACES.map((space) => <SpaceTile key={space.index} space={space} state={state} displayPositions={displayPositions} movingPlayerId={movingPlayerId} onSelect={setSelectedSpace} />)}<BoardCenter state={state} you={you} onAction={onAction} busy={controlsBusy} /></div></section><aside className="game-sidebar"><DeedPanel state={state} playerId={you.playerId} onUpgrade={(spaceIndex) => onAction({ type: "upgrade", spaceIndex })} busy={controlsBusy} /><EventLog state={state} /></aside></div>
      {state.auction && !motionBusy && <AuctionHouse state={state} you={you} onAction={onAction} busy={busy} />}
      {tradeOpen && !state.tradeOffer && <TradeBuilder state={state} youId={you.playerId} onAction={onAction} onClose={() => setTradeOpen(false)} busy={busy} />}
      {state.tradeOffer && <TradeOfferModal state={state} youId={you.playerId} onAction={onAction} busy={busy} />}
      {state.landmarkStealChoice && <LandmarkStealModal state={state} youId={you.playerId} onAction={onAction} busy={busy} />}
      {state.cardChoice && <CardChoiceModal state={state} youId={you.playerId} onAction={onAction} busy={busy} />}
      {selectedSpace && <SpaceInspector space={selectedSpace} state={state} onClose={() => setSelectedSpace(null)} />}
      {state.phase === "finished" && <WinnerReveal state={state} onRules={onRules} />}
    </main>
  );
}
