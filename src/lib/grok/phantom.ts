export type Injected = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
};

export function detectWallet() {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: Injected };
    solflare?: Injected;
    solana?: Injected;
  };
  if (w.phantom?.solana?.isPhantom) return { name: "Phantom", provider: w.phantom.solana };
  if (w.solflare?.isSolflare) return { name: "Solflare", provider: w.solflare };
  if (w.solana) return { name: w.solana.isPhantom ? "Phantom" : "Wallet", provider: w.solana };
  return null;
}
