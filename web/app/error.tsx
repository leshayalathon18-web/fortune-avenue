"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Fortune Avenue recovered from a screen error", error);
  }, [error]);

  return (
    <main className="error-screen">
      <div className="error-glow" aria-hidden="true" />
      <section className="error-card" role="alert">
        <span className="error-crown" aria-hidden="true">♛</span>
        <span className="setup-kicker">A quick detour</span>
        <h1>The Avenue needs one more roll.</h1>
        <p>Your room is safe. Reopen this screen and Fortune Avenue will reconnect your seat.</p>
        <div className="error-actions">
          <button className="gold-button" type="button" onClick={reset}>Try again</button>
          <Link className="glass-button" href="/">Return to the entrance</Link>
        </div>
      </section>
    </main>
  );
}
