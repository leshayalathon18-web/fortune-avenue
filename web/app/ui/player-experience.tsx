"use client";

import { useState } from "react";
import {
  BookOpen,
  Castle,
  Dices,
  Eye,
  Handshake,
  Landmark,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy,
  WalletCards,
} from "lucide-react";
import { PAWNS } from "@/lib/game-data";
import { ACHIEVEMENTS, achievementById } from "@/lib/profile-data";
import type { PlayerProfile } from "@/lib/game-types";
import { GoldParticles, PawnPortrait } from "./shared";

function money(value: number) {
  return `F${Math.max(0, Math.round(value)).toLocaleString()}`;
}

export function ProfilePanel({
  profile,
  loading,
  onClose,
  onReplayTutorial,
}: {
  profile: PlayerProfile | null;
  loading: boolean;
  onClose: () => void;
  onReplayTutorial: () => void;
}) {
  const favoritePawn = PAWNS.find((pawn) => pawn.slug === profile?.favoritePawnSlug) ?? PAWNS[8];
  const earned = new Set(profile?.achievements ?? []);
  return (
    <div className="modal-backdrop profile-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
        <GoldParticles />
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
        {loading && !profile ? <div className="profile-loading"><Sparkles /><strong>Polishing your Avenue profile…</strong></div> : (
          <>
            <header className="profile-hero">
              <span className="profile-kicker">Avenue passport</span>
              <PawnPortrait pawn={favoritePawn} label={`${favoritePawn.name}, favorite pawn`} />
              <div><h2 id="profile-title">{profile?.displayName ?? "Avenue Legend"}</h2><p>Favorite pawn: {favoritePawn.name}</p></div>
              <span className="profile-level"><Trophy /> {profile?.wins ?? 0} wins</span>
            </header>
            <div className="profile-stat-grid">
              <article><BookOpen /><span><strong>{profile?.gamesPlayed ?? 0}</strong><small>Games finished</small></span></article>
              <article><Trophy /><span><strong>{profile?.wins ?? 0}</strong><small>Fortune Crowns</small></span></article>
              <article><WalletCards /><span><strong>{money(profile?.biggestFortune ?? 0)}</strong><small>Biggest fortune</small></span></article>
              <article><Landmark /><span><strong>{profile?.districtsCompleted ?? 0}</strong><small>District collections</small></span></article>
              <article><Castle /><span><strong>{profile?.castlesBuilt ?? 0}</strong><small>Castles raised</small></span></article>
              <article><Medal /><span><strong>{profile?.achievements.length ?? 0}/{ACHIEVEMENTS.length}</strong><small>Achievements</small></span></article>
            </div>
            <div className="achievement-section">
              <div><span>Achievement cabinet</span><small>Finish matches to lock in progress.</small></div>
              <div className="achievement-grid">
                {ACHIEVEMENTS.map((achievement) => {
                  const unlocked = earned.has(achievement.id);
                  return <article key={achievement.id} className={unlocked ? "is-earned" : "is-locked"}><span>{unlocked ? <Medal /> : <ShieldCheck />}</span><div><strong>{achievement.name}</strong><small>{achievement.description}</small></div></article>;
                })}
              </div>
            </div>
            {profile?.achievements.map((id) => achievementById(id)).filter(Boolean).length === 0 && <p className="profile-first-run">Your first finished match starts the cabinet. Every game mode counts.</p>}
            <footer className="profile-actions"><button className="glass-button compact" type="button" onClick={onReplayTutorial}>Replay guided tour</button><button className="gold-button compact" type="button" onClick={onClose}>Back to the Avenue</button></footer>
          </>
        )}
      </section>
    </div>
  );
}

const TUTORIAL_STEPS = [
  {
    icon: Dices,
    eyebrow: "Step 1 of 6",
    title: "Roll with some drama",
    copy: "On your phone, shake firmly and stop—the dice splat onto the board. On a computer, click the dice. Your pawn travels every space so the whole table can follow.",
  },
  {
    icon: Landmark,
    eyebrow: "Step 2 of 6",
    title: "Claim the Avenue",
    copy: "Land on an available deed to buy it, auction it live, or leave it unclaimed. Tap any board space to inspect its owner, value, build level, and posted entry fee.",
  },
  {
    icon: Castle,
    eyebrow: "Step 3 of 6",
    title: "Complete, crown, castle",
    copy: "Own all four landmarks in a matching-color district. Add two crowns, then make the third upgrade a castle. Every build raises that landmark’s entry fee.",
  },
  {
    icon: Handshake,
    eyebrow: "Step 4 of 6",
    title: "Trade like a menace",
    copy: "Open the trade table on your turn. Offer deeds, cash, or both. Players and bots can approve or decline; unfinished districts can change hands.",
  },
  {
    icon: WalletCards,
    eyebrow: "Step 5 of 6",
    title: "Rescue a bad fortune",
    copy: "Use Manage Deeds to sell upgrades or mortgage an unimproved deed. If a fee is too large, the game pauses so you can raise money, trade, settle, or declare bankruptcy.",
  },
  {
    icon: Eye,
    eyebrow: "Step 6 of 6",
    title: "Leave, return, or watch",
    copy: "Your room and seat reconnect automatically on this device. Friends can join with the six-character code, and full rooms can still welcome spectators.",
  },
] as const;

export function TutorialOverlay({
  onFinish,
  onSkip,
}: {
  onFinish: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const item = TUTORIAL_STEPS[step];
  const Icon = item.icon;
  const isLast = step === TUTORIAL_STEPS.length - 1;
  return (
    <div className="modal-backdrop tutorial-backdrop" role="presentation">
      <section className="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div className="tutorial-aura" aria-hidden="true"><i /><i /><i /></div>
        <span className="tutorial-icon"><Icon /></span>
        <span className="tutorial-kicker">{item.eyebrow}</span>
        <h2 id="tutorial-title">{item.title}</h2>
        <p>{item.copy}</p>
        <div className="tutorial-progress" aria-label={`Tutorial step ${step + 1} of ${TUTORIAL_STEPS.length}`}>
          {TUTORIAL_STEPS.map((tutorialStep, index) => <i key={tutorialStep.title} className={index <= step ? "is-complete" : ""} />)}
        </div>
        <div className="tutorial-actions">
          <button className="text-button" type="button" onClick={onSkip}>Skip tour</button>
          {step > 0 && <button className="glass-button compact" type="button" onClick={() => setStep((value) => value - 1)}>Back</button>}
          <button className="gold-button compact" type="button" onClick={() => isLast ? onFinish() : setStep((value) => value + 1)}>{isLast ? "Start causing chaos" : "Next"}</button>
        </div>
      </section>
    </div>
  );
}
