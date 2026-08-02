"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PAWNS } from "@/lib/game-data";
import type {
  BoardTheme,
  FortuneGameState,
  GameEvent,
  RoomAction,
  RoomCredentials,
  RoomPayload,
  SpaceDefinition,
} from "@/lib/game-types";
import { CardReveal, CashCollection, GameScreen } from "./ui/game-table";
import {
  HomeScreen,
  LoadingScreen,
  LobbyScreen,
  RulesCard,
  SetupScreen,
  type SetupMode,
} from "./ui/shared";

type Screen = "home" | "setup" | "loading" | "lobby" | "game";

interface RoomApiResponse extends RoomPayload {
  credentials?: RoomCredentials;
  error?: string;
}

const SESSION_PREFIX = "fortune-avenue:session:";
const LAST_ROOM_KEY = "fortune-avenue:last-room";
const NAME_KEY = "fortune-avenue:player-name";
const MUTED_KEY = "fortune-avenue:muted";

function sessionKey(code: string) {
  return `${SESSION_PREFIX}${code.toUpperCase()}`;
}

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Some mobile in-app browsers restrict storage. The open game still works.
  }
}

function storageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // A restricted browser may not have created a stored session to remove.
  }
}

function saveSession(credentials: RoomCredentials) {
  storageSet(sessionKey(credentials.roomCode), JSON.stringify(credentials));
  storageSet(LAST_ROOM_KEY, credentials.roomCode);
}

function readSession(code: string): RoomCredentials | null {
  try {
    const raw = storageGet(sessionKey(code));
    return raw ? JSON.parse(raw) as RoomCredentials : null;
  } catch {
    return null;
  }
}

function roomUrl(code: string) {
  return `${window.location.origin}${window.location.pathname}?room=${code}`;
}

export default function FortuneAvenueGame({
  initialRoomCode = "",
  initialRules = false,
}: {
  initialRoomCode?: string;
  initialRules?: boolean;
}) {
  const sanitizedInitialRoom = initialRoomCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const [screen, setScreen] = useState<Screen>(sanitizedInitialRoom.length === 6 ? "loading" : "home");
  const [setupMode, setSetupMode] = useState<SetupMode>(sanitizedInitialRoom.length === 6 ? "join" : "bots");
  const [showRules, setShowRules] = useState(initialRules);
  const [playerName, setPlayerName] = useState("Avenue Legend");
  const [pawnSlug, setPawnSlug] = useState(PAWNS[8].slug);
  const [theme, setTheme] = useState<BoardTheme>("emerald");
  const [playerCount, setPlayerCount] = useState(4);
  const [botCount, setBotCount] = useState(0);
  const [joinCode, setJoinCode] = useState(sanitizedInitialRoom);
  const [recentRoom, setRecentRoom] = useState<string | null>(null);
  const [state, setState] = useState<FortuneGameState | null>(null);
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  const [you, setYou] = useState<{ playerId: string; isHost: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<SpaceDefinition | null>(null);
  const [cardReveal, setCardReveal] = useState<GameEvent | null>(null);
  const [pendingCard, setPendingCard] = useState<GameEvent | null>(null);
  const [cashQueue, setCashQueue] = useState<GameEvent[]>([]);
  const [pawnMotionBusy, setPawnMotionBusy] = useState(false);
  const seenEvent = useRef<string | null>(null);
  const moneyRoom = useRef<string | null>(null);
  const seenMoneyEvents = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const initialRoomHandled = useRef(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const playSound = useCallback((event: GameEvent) => {
    if (muted) return;
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = audioContext.current ?? new AudioCtor();
      audioContext.current = context;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
      gain.connect(context.destination);
      const frequencies = event.type === "warning" ? [170, 125]
        : event.type === "winner" ? [392, 523, 659]
          : event.type === "card" ? [330, 440, 554]
            : event.type === "purchase" || event.type === "fortune" ? [523, 659]
              : [220, 277];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = event.type === "warning" ? "sawtooth" : "triangle";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(context.currentTime + index * 0.055);
        oscillator.stop(context.currentTime + 0.28 + index * 0.055);
      });
    } catch {
      // Browsers may block audio until a later tap; gameplay continues silently.
    }
  }, [muted]);

  const acceptRoomResponse = useCallback((response: RoomApiResponse) => {
    setState(response.state);
    if (response.credentials) {
      setCredentials(response.credentials);
      saveSession(response.credentials);
    }
    if (response.you) setYou(response.you);
    setTheme(response.state.theme);
    setScreen(response.state.phase === "lobby" ? "lobby" : "game");
    const url = new URL(window.location.href);
    url.searchParams.set("room", response.state.code);
    window.history.replaceState({}, "", url);
  }, []);

  const fetchRoom = useCallback(async (code: string, session?: RoomCredentials | null) => {
    const params = new URLSearchParams();
    if (session) {
      params.set("playerId", session.playerId);
      params.set("token", session.resumeToken);
    }
    const response = await fetch(`/api/rooms/${code}${params.size ? `?${params}` : ""}`, { cache: "no-store" });
    const data = await response.json() as RoomApiResponse;
    if (!response.ok) throw new Error(data.error || "That room could not be opened.");
    return data;
  }, []);

  const resumeCode = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    setScreen("loading");
    try {
      const session = readSession(code);
      if (!session) {
        setJoinCode(code);
        setSetupMode("join");
        setScreen("setup");
        return;
      }
      const response = await fetchRoom(code, session);
      if (!response.you) {
        storageRemove(sessionKey(code));
        setJoinCode(code);
        setSetupMode("join");
        setScreen("setup");
        return;
      }
      setCredentials(session);
      acceptRoomResponse(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be resumed.");
      setScreen("home");
    } finally {
      setBusy(false);
    }
  }, [acceptRoomResponse, fetchRoom]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedName = storageGet(NAME_KEY);
      const savedRoom = storageGet(LAST_ROOM_KEY);
      if (savedName) setPlayerName(savedName);
      if (savedRoom) setRecentRoom(savedRoom);
      setMuted(storageGet(MUTED_KEY) === "true");
      const currentUrl = new URL(window.location.href);
      const invitedCode = currentUrl.searchParams.get("room")?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (invitedCode) {
        setJoinCode(invitedCode);
        setSetupMode("join");
      }
      if (currentUrl.searchParams.has("rules")) {
        currentUrl.searchParams.delete("rules");
        window.history.replaceState({}, "", currentUrl);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (sanitizedInitialRoom.length !== 6 || initialRoomHandled.current) return;
    initialRoomHandled.current = true;
    void resumeCode(sanitizedInitialRoom);
  }, [resumeCode, sanitizedInitialRoom]);

  useEffect(() => {
    if (!state?.lastEvent || state.lastEvent.id === seenEvent.current) return;
    seenEvent.current = state.lastEvent.id;
    playSound(state.lastEvent);
    if (state.lastEvent.card) {
      const event = state.lastEvent;
      window.queueMicrotask(() => setPendingCard(event));
    }
  }, [playSound, state?.lastEvent]);

  useEffect(() => {
    if (!state || !you) return;
    if (moneyRoom.current !== state.code) {
      moneyRoom.current = state.code;
      seenMoneyEvents.current = new Set(state.log.map((event) => event.id));
      setCashQueue([]);
      return;
    }
    const freshEvents = state.log
      .filter((event) => !seenMoneyEvents.current.has(event.id))
      .reverse();
    freshEvents.forEach((event) => seenMoneyEvents.current.add(event.id));
    const payments = freshEvents.filter(
      (event) => event.moneyTransfer?.toPlayerId === you.playerId && (event.moneyTransfer?.amount ?? 0) > 0,
    );
    if (payments.length > 0) {
      setCashQueue((queue) => {
        const queuedIds = new Set(queue.map((event) => event.id));
        return [...queue, ...payments.filter((event) => !queuedIds.has(event.id))];
      });
    }
  }, [state, you]);

  useEffect(() => {
    if (!pendingCard || pawnMotionBusy || cashQueue.length > 0 || cardReveal) return;
    const timer = window.setTimeout(() => {
      setCardReveal(pendingCard);
      setPendingCard(null);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [cardReveal, cashQueue.length, pawnMotionBusy, pendingCard]);

  useEffect(() => {
    if (!state || !credentials) return;
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetchRoom(state.code, credentials);
        if (!stopped && response.state.revision > state.revision) acceptRoomResponse(response);
      } catch {
        // A later poll or visibility return reconnects the room.
      }
    };
    const interval = window.setInterval(refresh, 1600);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [acceptRoomResponse, credentials, fetchRoom, state]);

  const openSetup = (mode: SetupMode) => {
    setSetupMode(mode);
    setError(null);
    if (mode !== "join") setJoinCode("");
    setScreen("setup");
  };

  const submitSetup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    storageSet(NAME_KEY, playerName.trim());
    try {
      const endpoint = setupMode === "join" ? `/api/rooms/${joinCode}/join` : "/api/rooms";
      const payload = setupMode === "join"
        ? { name: playerName, pawnSlug }
        : { name: playerName, pawnSlug, theme, kind: setupMode === "friends" ? "friends" : "bots", maxPlayers: playerCount, botCount };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as RoomApiResponse;
      if (!response.ok) throw new Error(data.error || "The room could not be opened.");
      acceptRoomResponse(data);
      setRecentRoom(data.state.code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something blocked the Avenue.");
    } finally {
      setBusy(false);
    }
  };

  const sendAction = async (action: RoomAction) => {
    if (!state || !credentials) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${state.code}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: credentials.playerId, resumeToken: credentials.resumeToken, expectedRevision: state.revision, action }),
      });
      const data = await response.json() as RoomApiResponse;
      if (response.status === 409 && data.state) {
        acceptRoomResponse(data);
        showToast("The table advanced—your view is refreshed.");
        return;
      }
      if (!response.ok) throw new Error(data.error || "That move did not go through.");
      acceptRoomResponse(data);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That move did not go through.";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  const shareRoom = async () => {
    if (!state) return;
    const url = roomUrl(state.code);
    const shareData = { title: "Fortune Avenue", text: `Join my Fortune Avenue room ${state.code}. Your seat is waiting!`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        showToast("Invite opened—your room stays live.");
      } else {
        await navigator.clipboard.writeText(`${shareData.text} ${url}`);
        showToast("Invite link copied.");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(`${shareData.text} ${url}`);
        showToast("Invite link copied.");
      } catch {
        showToast(`Share code ${state.code}`);
      }
    }
  };

  const toggleMuted = () => {
    setMuted((value) => {
      storageSet(MUTED_KEY, String(!value));
      return !value;
    });
  };

  const goHome = () => {
    setScreen("home");
    setState(null);
    setCredentials(null);
    setYou(null);
    setCardReveal(null);
    setPendingCard(null);
    setCashQueue([]);
    setPawnMotionBusy(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
  };

  return (
    <>
      {screen === "home" && <HomeScreen recentRoom={recentRoom} onMode={openSetup} onResume={() => recentRoom && void resumeCode(recentRoom)} onRules={() => setShowRules(true)} />}
      {screen === "setup" && <SetupScreen mode={setupMode} name={playerName} setName={setPlayerName} pawnSlug={pawnSlug} setPawnSlug={setPawnSlug} theme={theme} setTheme={setTheme} playerCount={playerCount} setPlayerCount={setPlayerCount} botCount={botCount} setBotCount={setBotCount} joinCode={joinCode} setJoinCode={setJoinCode} onSubmit={submitSetup} onBack={() => setScreen("home")} busy={busy} error={error} />}
      {screen === "loading" && <LoadingScreen />}
      {screen === "lobby" && state && you && <LobbyScreen state={state} you={you} onShare={shareRoom} onStart={() => sendAction({ type: "start" })} onRules={() => setShowRules(true)} busy={busy} />}
      {screen === "game" && state && you && <GameScreen state={state} you={you} onAction={sendAction} onShare={shareRoom} onRules={() => setShowRules(true)} onHome={goHome} busy={busy} muted={muted} onToggleMuted={toggleMuted} onMotionChange={setPawnMotionBusy} selectedSpace={selectedSpace} setSelectedSpace={setSelectedSpace} />}
      {showRules && <RulesCard onClose={() => setShowRules(false)} />}
      {cardReveal && <CardReveal event={cardReveal} onClose={() => setCardReveal(null)} />}
      {state && cashQueue[0] && !pawnMotionBusy && !showRules && !cardReveal && <CashCollection key={cashQueue[0].id} event={cashQueue[0]} state={state} onCollect={() => setCashQueue((queue) => queue.slice(1))} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
