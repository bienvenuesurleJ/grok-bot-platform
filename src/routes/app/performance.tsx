import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EquityChart } from "@/components/equity-chart";
import { Card, Paywall } from "@/components/ui";
import { pct, tone, usd, when } from "@/lib/grok/format";
import { getDashboard, type Dashboard } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/performance")({ component: PerfPage });

function PerfPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getDashboard().then(setDash).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (!dash && !error) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  if (!dash?.features.includes("*") && !dash?.features.includes("stats")) return <Paywall title="Performances" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Performances</h1>
      <p className="text-sm text-muted">Courbe du capital simulé marqué aux prix DexScreener. Pas un rendement commercial.</p>
      <Card className="p-4">
        <p className={`num text-3xl font-medium ${tone(dash.pnl)}`}>{usd(dash.equity)}</p>
        <p className={`num text-sm ${tone(dash.pnl)}`}>{usd(dash.pnl)} · {pct(dash.pnlPct)} depuis {usd(dash.initial)}</p>
        <EquityChart points={dash.series} />
      </Card>
      <div className="space-y-2">
        {dash.series.slice(-12).reverse().map((p) => (
          <div key={p.t} className="flex justify-between text-sm">
            <span className="text-muted">{when(p.t)}</span>
            <span className="num">{usd(p.equity)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
