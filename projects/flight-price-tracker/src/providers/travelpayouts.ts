import type { PriceOffer, Route } from "../types";

const BASE = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

interface TravelpayoutsItem {
  origin: string;
  destination: string;
  origin_airport?: string;
  destination_airport?: string;
  price: number;
  airline: string;
  flight_number?: string;
  departure_at: string;
  return_at?: string | null;
  transfers?: number;
  duration?: number;
  link?: string | null;
}

interface TravelpayoutsResponse {
  success: boolean;
  data?: TravelpayoutsItem[];
  currency?: string;
  error?: string;
}

/**
 * Aviasales "prices_for_dates" — returns the cheapest cached offers for a route on a date.
 * Docs: https://support.travelpayouts.com/hc/en-us/articles/360011418653
 */
export async function fetchOffers(
  route: Route,
  departureDate: string,
  currency: string,
  token: string,
  returnDate?: string,
): Promise<PriceOffer[]> {
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN is not set");

  const params = new URLSearchParams({
    origin: route.origin,
    destination: route.destination,
    departure_at: departureDate,
    currency: currency.toLowerCase(),
    limit: "10",
    sorting: "price",
    direct: "false",
    one_way: returnDate ? "false" : "true",
    token,
  });
  if (returnDate) params.set("return_at", returnDate);

  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Travelpayouts HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = (await res.json()) as TravelpayoutsResponse;
  if (!body.success) {
    throw new Error(`Travelpayouts error: ${body.error ?? "success=false"}`);
  }
  const items = body.data ?? [];
  const cur = (body.currency ?? currency).toUpperCase();

  return items.map((d) => ({
    origin: d.origin,
    destination: d.destination,
    departureAt: d.departure_at,
    returnAt: d.return_at ?? null,
    price: d.price,
    currency: cur,
    airline: d.airline,
    flightNumber: d.flight_number ? `${d.airline}${d.flight_number}` : null,
    transfers: typeof d.transfers === "number" ? d.transfers : 0,
    durationMinutes: typeof d.duration === "number" ? d.duration : null,
    deepLink: d.link ? `https://www.aviasales.com${d.link}` : null,
  }));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}
