export interface Env {
  // KV
  PRICE_STATE: KVNamespace;

  // Secrets
  TRAVELPAYOUTS_TOKEN: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TRIGGER_SECRET?: string;

  // Vars (always strings from wrangler.toml)
  ROUTES_JSON: string;
  CURRENCY: string;
  MAX_PRICE_FILTER?: string;
  ONLY_NOTIFY_ON_DROP?: string;
}

export interface Route {
  origin: string;
  destination: string;
  /** Days from today to search if departureDate is not pinned. Default 30. */
  daysAhead?: number;
  /** YYYY-MM-DD. Overrides daysAhead when set. */
  departureDate?: string;
  /** YYYY-MM-DD. If set, the route is treated as round-trip. */
  returnDate?: string;
  adults?: number;
}

export interface PriceOffer {
  origin: string;
  destination: string;
  /** ISO 8601 or YYYY-MM-DD (provider-dependent). */
  departureAt: string;
  returnAt: string | null;
  price: number;
  currency: string;
  airline: string;
  flightNumber: string | null;
  transfers: number;
  durationMinutes: number | null;
  deepLink: string | null;
}

export interface PriceSnapshot {
  price: number;
  currency: string;
  airline: string;
  capturedAt: string;
}
