const MAX_TG_LEN = 4000; // Telegram hard limit is 4096; keep a buffer for HTML tags.

export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  if (!botToken || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing");
  }
  const chunks = chunkText(text, MAX_TG_LEN);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  const lines = text.split("\n");
  let buf = "";
  for (const line of lines) {
    if ((buf + "\n" + line).length > max) {
      if (buf) out.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf) out.push(buf);
  return out;
}
