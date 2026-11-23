// Pure parsing helpers for store data. Kept separate so they can be unit-tested.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "12 October 2026", "October 12, 2026", "12 Oct 2026" -> "2026-10-12". */
export function parseLooseDate(text: string): string | null {
  const t = text.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let m = /(\d{1,2}) ([A-Za-z]{3,9}) (\d{4})/.exec(t);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month) return `${m[3]}-${pad(month)}-${pad(Number(m[1]))}`;
  }
  m = /([A-Za-z]{3,9}) (\d{1,2}) (\d{4})/.exec(t);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (month) return `${m[3]}-${pad(month)}-${pad(Number(m[2]))}`;
  }
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "₹1,299.00", "$12.34", "Rs. 450" -> 1299, 12.34, 450. */
export function parseMoney(text: string | number | undefined): number {
  if (typeof text === "number") return Number.isFinite(text) ? text : 0;
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(String(text ?? "").replace(/\s/g, ""));
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

/** Swiggy: "2026-03-14 21:45:10" -> { date: "2026-03-14", hour: 21 }. */
export function parseSqlTime(text: string): { date: string; hour?: number } | null {
  const m = /(\d{4}-\d{2}-\d{2})[ T](\d{2}):/.exec(text);
  if (m) return { date: m[1], hour: Number(m[2]) };
  const d = parseLooseDate(text);
  return d ? { date: d } : null;
}

/** Zomato: "March 14, 2026 at 09:45 PM" -> { date: "2026-03-14", hour: 21 }. */
export function parseZomatoTime(text: string): { date: string; hour?: number } | null {
  const date = parseLooseDate(text.split(" at ")[0] ?? text);
  if (!date) return null;
  const t = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
  if (!t) return { date };
  let hour = Number(t[1]) % 12;
  if (t[3].toUpperCase() === "PM") hour += 12;
  return { date, hour };
}

/** Zomato: "1 x Chicken Biryani, 2 x Butter Naan" -> items. */
export function parseDishString(text: string): { name: string; qty: number }[] {
  return text
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(\d+)\s*[x×]\s*(.+)$/i.exec(part);
      return m ? { name: m[2].trim(), qty: Number(m[1]) } : { name: part, qty: 1 };
    });
}

export function statusFrom(text: string): "delivered" | "cancelled" | "refunded" {
  if (/cancel/i.test(text)) return "cancelled";
  if (/refund issued|refunded|return complete|your refund/i.test(text)) return "refunded";
  return "delivered";
}
