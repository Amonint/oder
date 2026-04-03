// frontend/src/api/client.ts
const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

export interface AdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string | null;
}

export async function fetchAdAccounts(): Promise<{ data: AdAccount[] }> {
  const r = await fetch(`${base}/api/v1/accounts`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
