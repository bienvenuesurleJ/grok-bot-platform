import { CORE_MINTS, num } from "./pure";

export type Market = {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  volumeH24: number;
  liquidityUsd: number;
  changeH1: number;
  changeH24: number;
  dex: string;
  pairAddress: string;
};

type Pair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  volume?: { h24?: number };
  priceChange?: { h1?: number; h24?: number };
  liquidity?: { usd?: number };
};

export async function fetchMarkets(): Promise<Market[]> {
  const addresses = new Set(CORE_MINTS);
  try {
    const boosts = await fetch("https://api.dexscreener.com/token-boosts/latest/v1", {
      signal: AbortSignal.timeout(8000),
    });
    if (boosts.ok) {
      const data = (await boosts.json()) as { chainId?: string; tokenAddress?: string }[];
      for (const row of Array.isArray(data) ? data : []) {
        if (row.chainId === "solana" && row.tokenAddress) addresses.add(row.tokenAddress);
        if (addresses.size >= CORE_MINTS.length + 8) break;
      }
    }
  } catch {
    /* boosts are optional; core mints still price the book */
  }

  const url = `https://api.dexscreener.com/tokens/v1/solana/${[...addresses].join(",")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`DexScreener indisponible (${res.status})`);
  const pairs = (await res.json()) as Pair[];
  if (!Array.isArray(pairs)) throw new Error("Réponse DexScreener illisible");

  const best = new Map<string, Market>();
  for (const pair of pairs) {
    if (pair.chainId !== "solana") continue;
    const address = pair.baseToken?.address;
    const symbol = pair.baseToken?.symbol;
    const price = num(pair.priceUsd, NaN);
    if (!address || !symbol || !Number.isFinite(price) || price <= 0) continue;
    const row: Market = {
      address,
      symbol,
      name: pair.baseToken?.name || symbol,
      priceUsd: price,
      volumeH24: num(pair.volume?.h24),
      liquidityUsd: num(pair.liquidity?.usd),
      changeH1: num(pair.priceChange?.h1),
      changeH24: num(pair.priceChange?.h24),
      dex: pair.dexId || "dex",
      pairAddress: pair.pairAddress || "",
    };
    const prev = best.get(address);
    if (!prev || row.liquidityUsd > prev.liquidityUsd) best.set(address, row);
  }
  return [...best.values()].sort((a, b) => b.volumeH24 - a.volumeH24);
}
