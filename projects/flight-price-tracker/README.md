# Flight Price Tracker (Cloudflare Worker → Telegram)

Cloudflare Worker that polls flight ticket prices every 6 hours via the
[Travelpayouts / Aviasales API](https://support.travelpayouts.com/hc/en-us/articles/360011418653)
and reports the cheapest offer for each configured route to a Telegram chat.

Features:

- Runs on Cloudflare Workers Cron Triggers — no server, no Docker, free tier.
- Real-time IDR prices via the free Travelpayouts token (no affiliate validation
  required for the price endpoint).
- Workers KV remembers the last seen price per route so reports include
  `↓ TURUN 5.2%` / `↑ NAIK …` deltas instead of raw numbers.
- Defaults to `today + 30 days` (or `+45` etc.) so config never goes stale.
- Optional `MAX_PRICE_FILTER` and `ONLY_NOTIFY_ON_DROP` modes.
- Manual `/trigger` HTTP endpoint behind a bearer secret for ad-hoc runs.
- Failure path also notifies Telegram, so silence means everything is fine.

## Quickstart

```bash
cd projects/flight-price-tracker
npm install
cp .dev.vars.example .dev.vars      # fill in your tokens for `wrangler dev`
```

### 1. Get a Travelpayouts token (free)

1. Sign up at <https://www.travelpayouts.com/>.
2. Open **Developers → API → API token** in your dashboard and copy the value.
3. Put it in `.dev.vars` as `TRAVELPAYOUTS_TOKEN=...`.

The `prices_for_dates` endpoint we use is free, returns real cached prices,
and does **not** require partner-program approval.

### 2. Telegram bot & chat id

1. Talk to [@BotFather](https://t.me/BotFather), `/newbot`, copy the token.
2. Start a chat with your new bot (or add it to a group), send any message.
3. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and read
   `result[].message.chat.id` (positive = DM, negative = group/channel).
4. Put both in `.dev.vars`:

```
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_CHAT_ID=123456789
```

### 3. Create the Workers KV namespace

```bash
npx wrangler kv namespace create PRICE_STATE
```

Copy the printed `id` into `wrangler.toml` under `[[kv_namespaces]]`.

### 4. Local smoke test

```bash
npm run typecheck        # tsc --noEmit
npx wrangler dev         # starts a local worker
# In another shell:
curl http://127.0.0.1:8787/health
# Force a real run (only works if TRIGGER_SECRET is set in .dev.vars):
curl -H "Authorization: Bearer $TRIGGER_SECRET" http://127.0.0.1:8787/trigger
```

You should see a message land in Telegram and a JSON preview in the curl output.

### 5. Deploy

```bash
# Set production secrets (these are NOT read from .dev.vars in production):
npx wrangler secret put TRAVELPAYOUTS_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TRIGGER_SECRET   # optional, only if you want /trigger

npm run deploy
```

Cron `0 */6 * * *` (UTC) = 07:00, 13:00, 19:00, 01:00 WIB. Edit
`wrangler.toml` if you want a different cadence.

Tail live logs:

```bash
npm run tail
```

## Configuration

All non-secret config lives in `wrangler.toml` under `[vars]`:

| Var                   | Default | Description |
| --------------------- | ------- | ----------- |
| `ROUTES_JSON`         | 3 routes (CGK→DPS, CGK→SIN, CGK→KUL) | JSON array of route objects. See below. |
| `CURRENCY`            | `idr`   | Lower-case ISO currency for the provider. |
| `MAX_PRICE_FILTER`    | _empty_ | If set (e.g. `1500000`), routes whose best offer is above this price are reported as "above threshold" but not snapshotted. |
| `ONLY_NOTIFY_ON_DROP` | `false` | If `true`, suppresses Telegram messages unless at least one route's price dropped vs the last KV snapshot. |

### Route schema

```jsonc
[
  { "origin": "CGK", "destination": "DPS", "daysAhead": 30 },
  { "origin": "CGK", "destination": "SIN", "daysAhead": 45 },
  { "origin": "CGK", "destination": "NRT", "departureDate": "2026-08-12", "returnDate": "2026-08-20" }
]
```

- `origin` / `destination`: 3-letter IATA codes (required).
- `daysAhead`: search for a flight that many days from "today" (default 30).
- `departureDate` / `returnDate`: pin to fixed dates instead (`YYYY-MM-DD`).
  If `returnDate` is present, the search becomes round-trip.
- `adults`: currently informational (provider returns per-passenger pricing).

Wrangler requires `ROUTES_JSON` to be a single JSON-encoded string. Easiest is
to write the array on one line in `wrangler.toml`. After editing, re-deploy.

## Example Telegram output

```
✈️ Flight Price Update
Selasa, 21 Mei 2026 13.00 WIB

CGK → DPS · 2026-06-20 (one-way)
  💰 Rp 1.245.000 ↓ TURUN 5.2% (sebelumnya Rp 1.314.000)
  🛫 QZ584 · non-stop · 2h 5m · berangkat 20 Jun 2026 08.05
  🔗 lihat di Aviasales

CGK → SIN · 2026-06-20 (one-way)
  💰 Rp 1.890.000 → tidak berubah
  🛫 SQ957 · non-stop · 2h 20m · berangkat 20 Jun 2026 09.10
  🔗 lihat di Aviasales
```

## Files

```
src/
  index.ts                  # scheduled() + fetch() handlers
  routes.ts                 # ROUTES_JSON parser + date resolver
  storage.ts                # Workers KV snapshot read/write
  format.ts                 # Telegram HTML message builder
  telegram.ts               # sendMessage with chunking
  providers/
    travelpayouts.ts        # Aviasales prices_for_dates client
  types.ts                  # Env + Route + PriceOffer types
wrangler.toml               # Cron + KV + [vars]
package.json
tsconfig.json
.dev.vars.example           # Template for local secrets
```

## Notes & limits

- **Provider data is cached.** Travelpayouts returns prices its crawlers
  observed recently (often within minutes to hours), not live availability.
  For most route-watching use cases this is fine; for "live booking" prices
  you would need a paid GDS / Amadeus production tier.
- Each cron tick makes `N` HTTP calls where `N = routes.length`. The free
  Workers plan allows 100k subrequests/day; you are nowhere near that.
- KV reads/writes are 1 read + 1 write per route per tick. Also well within
  the free tier.
- The worker uses `parse_mode=HTML` so airline names with `&` etc. are
  HTML-escaped. Plain text fallback is not necessary.
- If you change `ROUTES_JSON` the KV snapshots from old routes simply expire
  after 90 days; you don't need to clean anything up.

## Switching providers later

The provider is isolated in `src/providers/travelpayouts.ts` and only depends
on `Route` / `PriceOffer` from `types.ts`. To plug in Amadeus, SerpAPI Google
Flights, or anything else, add a new file under `src/providers/`, export a
`fetchOffers(...)` with the same signature, and swap the import in
`src/index.ts`.
