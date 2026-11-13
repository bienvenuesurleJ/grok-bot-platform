export function usd(n: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(n) ? n : 0);
}

export function px(n: number) {
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 5 : 8;
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(Number.isFinite(n) ? n : 0);
}

export function pct(n: number) {
  const sign = n > 0 ? "+" : "";
  return (
    sign +
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
      Number.isFinite(n) ? n : 0,
    ) +
    " %"
  );
}

export function compact(n: number) {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function when(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

export function tone(n: number) {
  if (n > 0) return "text-up";
  if (n < 0) return "text-down";
  return "text-muted";
}

export function eur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
