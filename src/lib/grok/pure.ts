export const FEATURE_KEYS = [
  "dashboard",
  "scanner",
  "simulation",
  "history",
  "signals",
  "strategies",
  "agents",
  "alerts",
  "wallet",
  "advanced_params",
  "reports",
  "stats",
  "assistant",
  "automation_prep",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const MAJORS = new Set(["SOL", "JUP", "RAY", "ORCA", "PYTH"]);

export const CORE_MINTS = [
  "So11111111111111111111111111111111111111112",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
];

export type MarketInput = {
  liquidityUsd: number;
  volumeH24: number;
  changeH1: number;
  changeH24: number;
};

export function assessSafety(m: MarketInput) {
  const reasons: string[] = [];
  let blocked = false;
  if (m.liquidityUsd < 25_000) {
    blocked = true;
    reasons.push("liquidité sous 25 000 USD");
  }
  if (m.volumeH24 < 5_000) {
    blocked = true;
    reasons.push("volume 24 h sous 5 000 USD");
  }
  if (m.liquidityUsd > 0 && m.volumeH24 / m.liquidityUsd > 40) {
    reasons.push("volume très élevé par rapport à la liquidité");
  }
  if (Math.abs(m.changeH24) > 80 && m.liquidityUsd < 100_000) {
    blocked = true;
    reasons.push("variation extrême sur une liquidité limitée");
  }
  if (!blocked && reasons.length === 0) reasons.push("liquidité et volume au-dessus des seuils");
  const score = blocked
    ? 18
    : Math.max(35, Math.min(96, Math.round(28 + Math.log10(m.liquidityUsd + 10) * 14)));
  return {
    blocked,
    score,
    reasons,
    note: "Heuristique sur liquidité, volume et variation. Ce n’est pas un audit de contrat ni une détection honeypot on-chain.",
  };
}

export function analyze(m: MarketInput) {
  let score = 50;
  score += Math.max(-20, Math.min(20, m.changeH1 * 4));
  score += Math.max(-15, Math.min(15, m.changeH24 * 0.35));
  if (m.volumeH24 > 1_000_000) score += 8;
  if (m.liquidityUsd > 500_000) score += 6;
  if (m.liquidityUsd < 50_000) score -= 8;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const bias = score >= 62 ? "haussier" : score <= 40 ? "baissier" : "neutre";
  const vol =
    Math.abs(m.changeH24) > 25 ? "élevée" : Math.abs(m.changeH24) > 8 ? "modérée" : "calme";
  return {
    score,
    bias,
    volatility: vol,
    reason: `Score ${score}/100, biais ${bias}, volatilité 24 h ${vol}. Variation 1 h ${m.changeH1.toFixed(2)} %, 24 h ${m.changeH24.toFixed(2)} %.`,
  };
}

export type SizeInput = {
  cash: number;
  equity: number;
  riskPerTradeBps: number;
  maxPositionUsd: number;
  maxExposureUsd: number;
  currentExposure: number;
  maxOpen: number;
  openCount: number;
  dailyPnl: number;
  dailyLossLimit: number;
  stopLossBps: number;
  sizeScale: number;
  entriesHalted: boolean;
  emergency: boolean;
  side: "buy" | "sell";
};

export function positionSize(input: SizeInput): { ok: boolean; usd: number; reason: string } {
  if (input.side === "sell") {
    if (input.emergency) {
      return { ok: true, usd: 0, reason: "clôture autorisée pendant l’arrêt d’urgence" };
    }
    return { ok: true, usd: 0, reason: "clôture autorisée" };
  }
  if (input.emergency) return { ok: false, usd: 0, reason: "arrêt d’urgence : aucun nouvel achat" };
  if (input.entriesHalted) return { ok: false, usd: 0, reason: "nouvelles prises de position arrêtées" };
  if (input.dailyPnl <= -Math.abs(input.dailyLossLimit)) {
    return { ok: false, usd: 0, reason: "limite de perte journalière atteinte" };
  }
  if (input.openCount >= input.maxOpen) {
    return { ok: false, usd: 0, reason: "nombre maximal de positions atteint" };
  }
  const room = input.maxExposureUsd - input.currentExposure;
  if (room < 15) return { ok: false, usd: 0, reason: "exposition maximale atteinte" };
  const stop = Math.max(input.stopLossBps, 50) / 10_000;
  const riskUsd = Math.max(input.equity, 0) * (input.riskPerTradeBps / 10_000);
  let usd = (riskUsd / stop) * (input.sizeScale || 1);
  usd = Math.min(usd, input.maxPositionUsd, room, Math.max(0, input.cash) * 0.98);
  usd = Math.round(usd * 100) / 100;
  if (usd < 15) return { ok: false, usd: 0, reason: "taille sous le minimum de 15 USD simulés" };
  return { ok: true, usd, reason: "taille validée par le moteur de risque" };
}

export function markedEquity(cash: number, positions: { qty: number; price: number }[]) {
  const exposure = positions.reduce((s, p) => s + p.qty * p.price, 0);
  return { equity: cash + exposure, exposure };
}

export function pnlFrom(equity: number, initial: number) {
  const delta = equity - initial;
  const pct = initial === 0 ? 0 : (delta / initial) * 100;
  return { delta, pct };
}

export function applyFill(input: {
  side: "buy" | "sell";
  mark: number;
  usd?: number;
  qty?: number;
  avgPrice?: number;
  slippageBps: number;
  feeBps: number;
}) {
  const slip = input.slippageBps / 10_000;
  if (input.side === "buy") {
    const usd = input.usd ?? 0;
    const price = input.mark * (1 + slip);
    const qty = price > 0 ? usd / price : 0;
    const fee = usd * (input.feeBps / 10_000);
    const slippageUsd = usd - qty * input.mark;
    return { price, qty, fee, notional: usd, slippageUsd, pnl: null as number | null };
  }
  const qty = input.qty ?? 0;
  const price = input.mark * (1 - slip);
  const notional = qty * price;
  const fee = notional * (input.feeBps / 10_000);
  const slippageUsd = qty * input.mark - notional;
  const pnl = notional - fee - qty * (input.avgPrice ?? input.mark);
  return { price, qty, fee, notional, slippageUsd, pnl };
}

export type StrategyParams = {
  minH1?: number;
  minH24?: number;
  maxH24?: number;
  minLiq?: number;
  minScore?: number;
  majorsOnly?: boolean;
  sizeScale?: number;
};

export function wantsBuy(
  kind: string,
  params: StrategyParams,
  m: MarketInput & { symbol: string },
  safetyBlocked: boolean,
  analystScore: number,
) {
  if (safetyBlocked) return { ok: false, reason: "bloqué par Safety" };
  if (params.majorsOnly && !MAJORS.has(m.symbol)) {
    return { ok: false, reason: "réservé aux majeurs liquides" };
  }
  if ((params.minLiq ?? 0) > m.liquidityUsd) {
    return { ok: false, reason: "liquidité sous le seuil de la stratégie" };
  }
  if (kind === "momentum") {
    if (m.changeH1 < (params.minH1 ?? 1.2)) return { ok: false, reason: "momentum 1 h insuffisant" };
    if (m.changeH24 < (params.minH24 ?? 0)) return { ok: false, reason: "variation 24 h négative" };
    if (analystScore < (params.minScore ?? 62)) return { ok: false, reason: "score analyste sous le seuil" };
    return { ok: true, reason: "momentum confirmé par Analyst" };
  }
  if (kind === "dip") {
    if (m.changeH24 > (params.maxH24 ?? -4)) return { ok: false, reason: "pas de repli suffisant" };
    if (m.changeH1 <= -1.5) return { ok: false, reason: "le repli accélère encore" };
    if (analystScore < (params.minScore ?? 45)) return { ok: false, reason: "score analyste trop faible pour un repli" };
    return { ok: true, reason: "repli sur actif liquide" };
  }
  if (m.changeH1 < (params.minH1 ?? 0.3)) return { ok: false, reason: "variation 1 h trop faible" };
  if (m.changeH24 < (params.minH24 ?? -2)) return { ok: false, reason: "variation 24 h hors bande" };
  if (analystScore < (params.minScore ?? 55)) return { ok: false, reason: "score analyste sous le seuil conservateur" };
  return { ok: true, reason: "conditions conservatrices remplies" };
}

export function maxDrawdown(equities: number[]) {
  let peak = equities[0] ?? 0;
  let max = 0;
  for (const e of equities) {
    if (e > peak) peak = e;
    if (peak > 0) max = Math.max(max, (peak - e) / peak);
  }
  return max * 100;
}

export function parisParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

function parisOffsetMs(now: Date) {
  const p = parisParts(now);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, 0, 0);
  const truncated = new Date(now);
  truncated.setUTCMinutes(0, 0, 0);
  return asUtc - truncated.getTime();
}

export function parisDayStart(now: Date) {
  const p = parisParts(now);
  const offset = parisOffsetMs(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0) - offset);
}

export function lastNightWindow(startHour: number, endHour: number, now: Date) {
  const p = parisParts(now);
  const offset = parisOffsetMs(now);
  const endBase = new Date(Date.UTC(p.year, p.month - 1, p.day, endHour, 0, 0) - offset);
  const end = now.getTime() >= endBase.getTime() ? endBase : new Date(endBase.getTime() - 86_400_000);
  let start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), startHour, 0, 0) - offset);
  if (start.getTime() >= end.getTime()) start = new Date(start.getTime() - 86_400_000);
  return { start, end };
}

export function parseParams(raw: string): StrategyParams {
  try {
    const v = JSON.parse(raw) as StrategyParams;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function num(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
