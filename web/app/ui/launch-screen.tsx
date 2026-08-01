import type { CSSProperties } from "react";
import Link from "next/link";
import { GAME_TAGLINE } from "@/lib/game-data";

const foregroundStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 2147483647,
  display: "grid",
  placeItems: "center",
  overflowY: "auto",
  padding: "16px",
  color: "#f7efd9",
};

const panelStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "min(680px, calc(100% - 24px))",
  padding: "clamp(24px, 6vw, 42px) clamp(16px, 6vw, 40px)",
  border: "1px solid #f5d980",
  borderRadius: "24px",
  background: "#07100d",
  color: "#f7efd9",
  textAlign: "center",
  opacity: 1,
  visibility: "visible",
};

const titleStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  margin: "10px 0 18px",
  color: "#f5d980",
  fontFamily: "Georgia, Times New Roman, serif",
  fontSize: "clamp(3.4rem, 14vw, 6.8rem)",
  fontWeight: 900,
  lineHeight: 0.72,
  letterSpacing: "-0.055em",
  textTransform: "uppercase",
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  minHeight: "54px",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 24px",
  border: "1px solid #fff0ac",
  borderRadius: "12px",
  background: "#f5d980",
  color: "#171006",
  fontWeight: 900,
  letterSpacing: "0.04em",
  textDecoration: "none",
  textTransform: "uppercase",
};

const secondaryLinkStyle: CSSProperties = {
  ...primaryLinkStyle,
  borderColor: "#d3aa4b",
  background: "#10231c",
  color: "#f7efd9",
};

export function LaunchScreen() {
  return (
    <main className="launch-screen" style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "#020706", color: "#f7efd9" }}>
      <div className="launch-cover" aria-hidden="true" />
      <div className="launch-scrim" aria-hidden="true" />
      <div className="gold-particles" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <i
            key={index}
            style={{
              "--particle-x": `${(index * 43) % 101}%`,
              "--particle-delay": `${(index % 8) * -0.7}s`,
              "--particle-duration": `${5 + (index % 6) * 0.8}s`,
              "--particle-size": `${2 + (index % 4)}px`,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="launch-foreground" style={foregroundStyle}>
        <section className="launch-panel" style={panelStyle}>
          <span style={{ color: "#f5d980", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.22em", textTransform: "uppercase" }}>The browser board game</span>
          <h1 style={titleStyle}><span>Fortune</span><span style={{ marginTop: "0.42em", fontSize: "0.72em", letterSpacing: "0.04em" }}>Avenue</span></h1>
          <p style={{ margin: "0 0 24px", color: "#f5dfaa", fontWeight: 900, letterSpacing: "0.12em" }}>{GAME_TAGLINE}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
            <Link href="/play" style={primaryLinkStyle}>Enter the Avenue</Link>
            <Link href="/play?rules=1" style={secondaryLinkStyle}>Read the rules</Link>
          </div>
          <small className="launch-version">Cinematic launch • foreground build 4</small>
        </section>
      </div>
    </main>
  );
}
