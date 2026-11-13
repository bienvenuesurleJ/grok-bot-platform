import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Paywall } from "@/components/ui";
import { compact, pct, px, tone, usd } from "@/lib/grok/format";
import { getDashboard, type Dashboard } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/tokens")({ component: TokensPage });

function TokensPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getDashboard().then(setDash).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (error) return <Paywall title="Tokens" />;
  if (!dash) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  if (!dash.allowed) return <Paywall title="Tokens" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Tokens suivis</h1>
      <p className="text-sm text-muted">Prix, volume et variation lus sur DexScreener. Ce n’est pas un conseil.</p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {["Nom", "Prix", "Volume 24 h", "1 h", "24 h", "Liquidité"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dash.markets.map((m) => (
              <tr key={m.address} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="font-semibold">{m.symbol}</p>
                  <p className="text-xs text-muted">{m.name}</p>
                </td>
                <td className="num px-4 py-3">{m.priceUsd >= 1 ? usd(m.priceUsd) : px(m.priceUsd)}</td>
                <td className="num px-4 py-3">{compact(m.volumeH24)}</td>
                <td className={`num px-4 py-3 ${tone(m.changeH1)}`}>{pct(m.changeH1)}</td>
                <td className={`num px-4 py-3 ${tone(m.changeH24)}`}>{pct(m.changeH24)}</td>
                <td className="num px-4 py-3">{compact(m.liquidityUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
