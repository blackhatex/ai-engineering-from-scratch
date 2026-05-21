import type { PriceOffer, PriceSnapshot, Route } from "./types";

export interface RouteSection {
  route: Route;
  searchedDeparture: string;
  searchedReturn: string | null;
  best: PriceOffer | null;
  previous: PriceSnapshot | null;
  error?: string;
  /** Set when a hard filter (e.g. MAX_PRICE_FILTER) excluded the best offer. */
  filteredOut?: boolean;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString("id-ID")} ${currency.toUpperCase()}`;
  }
}

export function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function nowJakarta(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short",
  });
  return `${fmt.format(date)} WIB`;
}

function diffLine(best: PriceOffer, previous: PriceSnapshot | null): string {
  if (!previous) return " <i>(baseline)</i>";
  const delta = best.price - previous.price;
  const pct = (delta / previous.price) * 100;
  if (Math.abs(pct) < 0.5) return " → tidak berubah";
  const arrow = delta < 0 ? "↓" : "↑";
  const tag = delta < 0 ? "TURUN" : "NAIK";
  return ` ${arrow} <b>${tag} ${Math.abs(pct).toFixed(1)}%</b> (sebelumnya ${escapeHtml(formatPrice(previous.price, previous.currency))})`;
}

function stopsLabel(transfers: number): string {
  if (transfers <= 0) return "non-stop";
  return `${transfers} transit`;
}

function shortDepartureLabel(iso: string): string {
  // Accept both YYYY-MM-DD and ISO timestamps; show "21 Mei 2026" + time if available.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hasTime = iso.length > 10;
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
  }).format(d);
  if (!hasTime) return date;
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${date} ${time}`;
}

export function buildMessage(sections: RouteSection[]): string {
  const lines: string[] = [];
  lines.push(`✈️ <b>Flight Price Update</b>`);
  lines.push(`<i>${escapeHtml(nowJakarta())}</i>`);
  lines.push("");

  for (const s of sections) {
    const header = `${s.route.origin} → ${s.route.destination}`;
    const dateLabel = s.searchedReturn
      ? `${s.searchedDeparture} – ${s.searchedReturn} (PP)`
      : `${s.searchedDeparture} (one-way)`;
    lines.push(`<b>${escapeHtml(header)}</b> · ${escapeHtml(dateLabel)}`);

    if (s.error) {
      lines.push(`  ⚠️ ${escapeHtml(s.error)}`);
      lines.push("");
      continue;
    }
    if (!s.best) {
      lines.push(`  ⚠️ tidak ada penawaran ditemukan`);
      lines.push("");
      continue;
    }
    if (s.filteredOut) {
      lines.push(
        `  ℹ️ harga terendah ${escapeHtml(formatPrice(s.best.price, s.best.currency))} di atas threshold (skipped notify)`,
      );
      lines.push("");
      continue;
    }

    const priceStr = formatPrice(s.best.price, s.best.currency);
    const diff = diffLine(s.best, s.previous);
    const meta = [
      s.best.flightNumber ?? s.best.airline,
      stopsLabel(s.best.transfers),
      formatDuration(s.best.durationMinutes),
    ]
      .filter((x) => x && x.length > 0)
      .join(" · ");

    lines.push(`  💰 <b>${escapeHtml(priceStr)}</b>${diff}`);
    lines.push(`  🛫 ${escapeHtml(meta)} · berangkat ${escapeHtml(shortDepartureLabel(s.best.departureAt))}`);
    if (s.best.deepLink) lines.push(`  🔗 <a href="${s.best.deepLink}">lihat di Aviasales</a>`);
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function anyPriceDropped(sections: RouteSection[]): boolean {
  return sections.some((s) => {
    if (!s.best || !s.previous) return false;
    return s.best.price < s.previous.price;
  });
}
