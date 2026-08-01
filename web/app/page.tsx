import FortuneAvenueGame from "./FortuneAvenueGame";

type PageSearchParams = Promise<{
  play?: string | string[];
  room?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const initialRoomCode = (firstValue(params.room) ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const autoEnter = firstValue(params.play) === "1";
  return <FortuneAvenueGame initialRoomCode={initialRoomCode} autoEnter={autoEnter} />;
}
