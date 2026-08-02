import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#07100d",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const cover = new URL("/og.png", base).toString();
  return {
    metadataBase: base,
    title: "Fortune Avenue — Play with bots or friends",
    description: "Roll in, buy ridiculous landmarks, spring custom cards, and chase the Fortune Crown in a persistent 2–6 player browser game.",
    applicationName: "Fortune Avenue",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title: "Fortune Avenue",
      description: "Roll In. Buy Big. Cause Chaos. Start a persistent room for 2–6 players.",
      type: "website",
      url: base,
      images: [{ url: cover, width: 1200, height: 630, alt: "Fortune Avenue fantasy board game with gold dice, a crowned penguin, and glowing landmarks" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Fortune Avenue",
      description: "A chaotic 2–6 player browser board game with bots, friend codes, and persistent rooms.",
      images: [cover],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
