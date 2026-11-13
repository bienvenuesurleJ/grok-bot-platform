import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/more")({ component: MorePage });

const LINKS = [
  ["/app/tokens", "Tokens"],
  ["/app/strategies", "Stratégies"],
  ["/app/transactions", "Transactions"],
  ["/app/history", "Décisions"],
  ["/app/performance", "Performances"],
  ["/app/report", "Rapport nocturne"],
  ["/app/assistant", "Assistant"],
  ["/app/wallets", "Wallets"],
  ["/app/billing", "Offres"],
  ["/app/profile", "Profil"],
  ["/app/settings", "Réglages"],
  ["/app/owner", "Propriétaire"],
  ["/app/admin", "Administration"],
  ["/legal/risques", "Risques"],
  ["/mise-en-service", "Mise en service"],
] as const;

function MorePage() {
  return (
    <div className="space-y-2">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">Plus</h1>
      {LINKS.map(([to, label]) => (
        <Link key={to} to={to} className="flex h-12 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium">
          {label}
        </Link>
      ))}
    </div>
  );
}
