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
    icons: {
      icon: "/art/pawns/09-fortune-penguin-turnaround-source.webp",
      apple: "/art/pawns/09-fortune-penguin-turnaround-source.webp",
    },
    openGraph: {
      title: "Fortune Avenue",
      description: "Roll In. Buy Big. Cause Chaos. Start a persistent room for 2–6 players.",
      type: "website",
      url: base,
      images: [{ url: cover, width: 1536, height: 1024, alt: "Fortune Avenue board game with colorful resin pawns" }],
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
