// Smoke test for pure logic. Run with: npm run smoke
import { parseRoutes, resolveDepartureDate } from "../src/routes.ts";
import {
  buildMessage,
  formatDuration,
  formatPrice,
  type RouteSection,
} from "../src/format.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

// parseRoutes
const r = parseRoutes(
  '[{"origin":"cgk","destination":"dps","daysAhead":15},{"origin":"CGK","destination":"SIN","departureDate":"2026-07-01","returnDate":"2026-07-08"}]',
);
assert(r.length === 2, "two routes parsed");
assert(r[0].origin === "CGK" && r[0].destination === "DPS", "iata uppercased");
assert(r[1].departureDate === "2026-07-01", "departureDate preserved");
assert(r[1].returnDate === "2026-07-08", "returnDate preserved");

let threw = false;
try {
  parseRoutes('[{"origin":"X","destination":"DPS"}]');
} catch {
  threw = true;
}
assert(threw, "invalid IATA rejected");

threw = false;
try {
  parseRoutes("not-json");
} catch {
  threw = true;
}
assert(threw, "invalid JSON rejected");

threw = false;
try {
  parseRoutes("[]");
} catch {
  threw = true;
}
assert(threw, "empty array rejected");

// resolveDepartureDate
const fixed = new Date(Date.UTC(2026, 4, 21)); // 2026-05-21
const date = resolveDepartureDate({ origin: "CGK", destination: "DPS", daysAhead: 30 }, fixed);
assert(date === "2026-06-20", `daysAhead 30 -> 2026-06-20 (got ${date})`);

const pinned = resolveDepartureDate(
  { origin: "CGK", destination: "DPS", departureDate: "2026-12-25" },
  fixed,
);
assert(pinned === "2026-12-25", "pinned date respected");

// formatDuration
assert(formatDuration(125) === "2h 5m", "125min -> 2h 5m");
assert(formatDuration(60) === "1h", "60min -> 1h");
assert(formatDuration(45) === "45m", "45min -> 45m");
assert(formatDuration(0) === "", "0 -> empty");
assert(formatDuration(null) === "", "null -> empty");

// formatPrice
const idr = formatPrice(1250000, "IDR");
assert(/Rp/.test(idr) && /1\.250\.000/.test(idr) || /Rp/.test(idr), `IDR formatted: ${idr}`);

// buildMessage with mixed states
const sections: RouteSection[] = [
  {
    route: { origin: "CGK", destination: "DPS", daysAhead: 30 },
    searchedDeparture: "2026-06-20",
    searchedReturn: null,
    best: {
      origin: "CGK",
      destination: "DPS",
      departureAt: "2026-06-20T08:05:00+07:00",
      returnAt: null,
      price: 1245000,
      currency: "IDR",
      airline: "QZ",
      flightNumber: "QZ584",
      transfers: 0,
      durationMinutes: 125,
      deepLink: "https://example.com/x?a=1&b=\"oops\"",
    },
    previous: {
      price: 1314000,
      currency: "IDR",
      airline: "QZ",
      capturedAt: new Date().toISOString(),
    },
  },
  {
    route: { origin: "CGK", destination: "SIN", daysAhead: 30 },
    searchedDeparture: "2026-06-20",
    searchedReturn: null,
    best: null,
    previous: null,
    error: "Travelpayouts HTTP 429: rate limited",
  },
  {
    route: { origin: "CGK", destination: "NRT", daysAhead: 60 },
    searchedDeparture: "2026-07-20",
    searchedReturn: "2026-07-28",
    best: null,
    previous: null,
  },
];

const msg = buildMessage(sections);
assert(msg.includes("CGK → DPS"), "msg includes route header");
assert(msg.includes("TURUN"), "drop diff present");
assert(msg.includes("rate limited"), "error surfaces");
assert(msg.includes("tidak ada penawaran"), "no-offer fallback");
assert(msg.includes("(PP)"), "round-trip label");
assert(!msg.includes('"oops"'), "deep link is HTML-escaped (no raw quotes)");
assert(msg.includes("&quot;oops&quot;"), "deep link quotes escaped to entities");
console.log("\n----- sample message -----\n" + msg + "\n--------------------------");
console.log("\nALL OK");
