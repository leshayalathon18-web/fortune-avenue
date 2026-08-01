import FortuneAvenueGame from "../FortuneAvenueGame";

type PageSearchParams = Promise<{
  room?: string | string[];
  rules?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlayPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const initialRoomCode = (firstValue(params.room) ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const initialRules = firstValue(params.rules) === "1";
  return <FortuneAvenueGame initialRoomCode={initialRoomCode} initialRules={initialRules} />;
}
