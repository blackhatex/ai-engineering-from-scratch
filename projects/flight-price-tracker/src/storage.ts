import type { PriceSnapshot } from "./types";

const TTL_SECONDS = 90 * 24 * 3600;

export function stateKey(origin: string, destination: string, departure: string): string {
  return `lastprice:${origin}-${destination}-${departure}`;
}

export async function getPrevious(kv: KVNamespace, key: string): Promise<PriceSnapshot | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PriceSnapshot>;
    if (typeof parsed.price !== "number" || typeof parsed.currency !== "string") return null;
    return {
      price: parsed.price,
      currency: parsed.currency,
      airline: typeof parsed.airline === "string" ? parsed.airline : "",
      capturedAt: typeof parsed.capturedAt === "string" ? parsed.capturedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function setSnapshot(kv: KVNamespace, key: string, snap: PriceSnapshot): Promise<void> {
  await kv.put(key, JSON.stringify(snap), { expirationTtl: TTL_SECONDS });
}
