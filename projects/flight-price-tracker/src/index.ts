import type { Env, PriceOffer, PriceSnapshot } from "./types";
import { parseRoutes, resolveDepartureDate } from "./routes";
import { fetchOffers } from "./providers/travelpayouts";
import { getPrevious, setSnapshot, stateKey } from "./storage";
import { anyPriceDropped, buildMessage, type RouteSection } from "./format";
import { sendTelegram } from "./telegram";

interface RunResult {
  text: string;
  sections: RouteSection[];
  sent: boolean;
  reasonNotSent?: string;
}

async function runCheck(env: Env): Promise<RunResult> {
  const routes = parseRoutes(env.ROUTES_JSON);
  const today = new Date();
  const maxPrice = parseMaxPrice(env.MAX_PRICE_FILTER);
  const onlyOnDrop = (env.ONLY_NOTIFY_ON_DROP ?? "false").toLowerCase() === "true";

  const sections: RouteSection[] = [];

  for (const route of routes) {
    const depDate = resolveDepartureDate(route, today);
    const retDate = route.returnDate ?? null;

    let best: PriceOffer | null = null;
    let err: string | undefined;
    try {
      const offers = await fetchOffers(route, depDate, env.CURRENCY ?? "idr", env.TRAVELPAYOUTS_TOKEN, retDate ?? undefined);
      const sorted = offers.slice().sort((a, b) => a.price - b.price);
      best = sorted[0] ?? null;
    } catch (e) {
      err = (e as Error).message;
    }

    const key = stateKey(route.origin, route.destination, depDate);
    const previous = await getPrevious(env.PRICE_STATE, key);

    const filteredOut = !!best && maxPrice !== null && best.price > maxPrice;

    sections.push({
      route,
      searchedDeparture: depDate,
      searchedReturn: retDate,
      best,
      previous,
      ...(err ? { error: err } : {}),
      filteredOut,
    });

    if (best && !filteredOut) {
      const snap: PriceSnapshot = {
        price: best.price,
        currency: best.currency,
        airline: best.airline,
        capturedAt: new Date().toISOString(),
      };
      await setSnapshot(env.PRICE_STATE, key, snap);
    }
  }

  const text = buildMessage(sections);

  if (onlyOnDrop && !anyPriceDropped(sections)) {
    return { text, sections, sent: false, reasonNotSent: "ONLY_NOTIFY_ON_DROP=true and no price drop detected" };
  }

  await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text);
  return { text, sections, sent: true };
}

function parseMaxPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function notifyFailure(env: Env, err: Error): Promise<void> {
  try {
    await sendTelegram(
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_CHAT_ID,
      `⚠️ <b>Flight tracker error</b>\n<code>${escapeForCode(err.message)}</code>`,
    );
  } catch {
    // Swallow secondary errors; we tried.
  }
}

function escapeForCode(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;")).slice(0, 800);
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCheck(env).catch((e) => notifyFailure(env, e as Error)),
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return json({ ok: true, time: new Date().toISOString() });
    }

    if (url.pathname === "/trigger") {
      if (!env.TRIGGER_SECRET) {
        return new Response("disabled (TRIGGER_SECRET not set)", { status: 403 });
      }
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response("unauthorized", { status: 401 });
      }
      try {
        const result = await runCheck(env);
        return json({
          ok: true,
          sent: result.sent,
          reasonNotSent: result.reasonNotSent ?? null,
          preview: result.text,
        });
      } catch (e) {
        await notifyFailure(env, e as Error);
        return json({ ok: false, error: (e as Error).message }, 500);
      }
    }

    return new Response(
      "flight-price-tracker — Cloudflare Worker.\nEndpoints: GET /health, POST/GET /trigger (Bearer TRIGGER_SECRET)\n",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
