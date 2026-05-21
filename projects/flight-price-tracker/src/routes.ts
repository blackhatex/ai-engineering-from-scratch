import type { Route } from "./types";

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRoutes(json: string): Route[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`ROUTES_JSON is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error("ROUTES_JSON must be a JSON array of route objects");
  }

  const out: Route[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== "object") {
      throw new Error(`ROUTES_JSON[${i}] is not an object`);
    }
    const obj = r as Record<string, unknown>;
    const origin = String(obj.origin ?? "").toUpperCase();
    const destination = String(obj.destination ?? "").toUpperCase();
    if (!IATA.test(origin)) throw new Error(`ROUTES_JSON[${i}].origin must be a 3-letter IATA code (got "${origin}")`);
    if (!IATA.test(destination)) throw new Error(`ROUTES_JSON[${i}].destination must be a 3-letter IATA code (got "${destination}")`);

    const daysAhead = typeof obj.daysAhead === "number" ? obj.daysAhead : 30;
    const adults = typeof obj.adults === "number" ? obj.adults : 1;
    const departureDate = typeof obj.departureDate === "string" ? obj.departureDate : undefined;
    const returnDate = typeof obj.returnDate === "string" ? obj.returnDate : undefined;
    if (departureDate && !DATE.test(departureDate)) {
      throw new Error(`ROUTES_JSON[${i}].departureDate must be YYYY-MM-DD`);
    }
    if (returnDate && !DATE.test(returnDate)) {
      throw new Error(`ROUTES_JSON[${i}].returnDate must be YYYY-MM-DD`);
    }

    out.push({ origin, destination, daysAhead, adults, departureDate, returnDate });
  });

  if (out.length === 0) throw new Error("ROUTES_JSON must contain at least one route");
  return out;
}

export function resolveDepartureDate(route: Route, today: Date = new Date()): string {
  if (route.departureDate) return route.departureDate;
  const days = route.daysAhead ?? 30;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
