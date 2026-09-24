import UnsubscribeClient from "./UnsubscribeClient";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <UnsubscribeClient token={params.token || ""} />;
}
